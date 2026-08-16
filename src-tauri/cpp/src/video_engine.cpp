// video_engine.cpp — FFmpeg-based video decoder for ProWorshipCast.
//
// Decodes MP4/WebM/MOV to RGBA frames for the Output canvas, supports
// hardware acceleration (D3D11/VideoToolbox/VAAPI where libavcodec exposes
// it), seamless looping and real-time chroma keying.
//
// C++17. Only symbols declared in cpp/include/core.h are exported.

#include "core.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/hwcontext.h>
#include <libavutil/imgutils.h>
#include <libavutil/pixfmt.h>
#include <libswscale/swscale.h>
#include <jpeglib.h>
}

#include <algorithm>
#include <cmath>
#include <csetjmp>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace pwcp {

// libjpeg-turbo error handler: longjmp back to the encoder call site instead
// of aborting the process on an unrecoverable encode error.
struct PwcpJpegErr {
    struct jpeg_error_mgr pub;
    std::jmp_buf jmp;
};

extern "C" void pwcp_jpeg_error_exit(j_common_ptr cinfo) {
    PwcpJpegErr* err = reinterpret_cast<PwcpJpegErr*>(cinfo->err);
    std::longjmp(err->jmp, 1);
}

struct VideoDecoder::Impl {
public:
    Impl(const std::string& path, bool hw_accel);
    ~Impl();
    Impl(const Impl&) = delete;
    Impl& operator=(const Impl&) = delete;

    rust::Vec<uint8_t> decode_frame();
    rust::Vec<uint8_t> decode_frame_jpeg(uint8_t quality);
    int32_t width() const { return width_; }
    int32_t height() const { return height_; }
    double fps() const { return fps_; }

    void set_looping(bool enabled) { loop_ = enabled; }
    void set_chroma_key(bool enabled, uint8_t r, uint8_t g, uint8_t b, uint8_t tol);
    bool seek(double seconds);
    double position() const { return position_; }
    double duration() const { return duration_; }

    // Decode the next frame into a pre-sized RGBA buffer. False on EOF or when
    // the buffer is too small.
    bool fill_frame(rust::Vec<uint8_t>& out);
    // Decode the next frame, JPEG-encode it into `out`, and return the number
    // of bytes written, or -1 on failure/EOF. `out` must be pre-sized.
    int64_t fill_jpeg_frame(rust::Vec<uint8_t>& out, uint8_t quality);
    // Chroma path: encode the frame as a compact packed payload of two JPEGs
    // (color + grayscale alpha mask) instead of raw RGBA. Returns the number
    // of bytes written, or -1 on failure/EOF. `out` must be pre-sized.
    int64_t fill_keyed_jpeg(rust::Vec<uint8_t>& out, uint8_t quality);
    // Decode the next frame as tightly-packed NV12 (Y plane then interleaved
    // UV plane) into `out`, returning the number of bytes written, or -1 on
    // failure/EOF. `out` must be pre-sized. Output dims are always even.
    int64_t fill_nv12(rust::Vec<uint8_t>& out);
    // Scale output to fit within (w, h) preserving aspect. (0,0) restores
    // source resolution.
    void set_target_size(int32_t w, int32_t h);
    int32_t out_width() const { return target_w_ > 0 ? target_w_ : width_; }
    int32_t out_height() const { return target_h_ > 0 ? target_h_ : height_; }

private:
    bool open_codec(const std::string& path, bool hw_accel);
    bool read_next_frame(AVFrame* dst);
    bool decode_rgba(std::vector<uint8_t>& out);
    bool ensure_rgb(int32_t tw, int32_t th);
    bool decode_nv12(std::vector<uint8_t>& out, int32_t& ow, int32_t& oh);
    bool ensure_nv12(int32_t tw, int32_t th);
    rust::Vec<uint8_t> decode_rgba_copy_impl();
    bool encode_jpeg(std::vector<uint8_t>& out, const std::vector<uint8_t>& rgba, int width,
                     int height, uint8_t quality);
    bool keyed_frames(std::vector<uint8_t>& color, std::vector<uint8_t>& alpha, int32_t& aw,
                      int32_t& ah, uint8_t quality);
    rust::Vec<uint8_t> encode_jpeg_to_rust(const std::vector<uint8_t>& rgba, int width, int height,
                                           uint8_t quality);
    void apply_chroma_key(uint8_t* rgba, size_t count);

    AVFormatContext* fmt_ = nullptr;
    AVCodecContext* codec_ctx_ = nullptr;
    AVStream* stream_ = nullptr;
    int stream_index_ = -1;

    SwsContext* sws_ = nullptr;
    AVPixelFormat sws_src_fmt_ = AV_PIX_FMT_NONE;
    int32_t sws_out_w_ = 0;
    int32_t sws_out_h_ = 0;
    SwsContext* sws_nv12_ = nullptr;
    AVPixelFormat sws_nv12_src_fmt_ = AV_PIX_FMT_NONE;
    int32_t sws_nv12_w_ = 0;
    int32_t sws_nv12_h_ = 0;
    AVFrame* frame_ = nullptr;
    AVFrame* rgb_ = nullptr;
    uint8_t* rgb_buf_ = nullptr;
    int rgb_linesize_ = 0;
    int32_t rgb_w_ = 0;
    int32_t rgb_h_ = 0;
    AVFrame* nv12_ = nullptr;
    uint8_t* nv12_buf_ = nullptr;
    int nv12_linesize0_ = 0;
    int nv12_linesize1_ = 0;
    int32_t nv12_w_ = 0;
    int32_t nv12_h_ = 0;
    int32_t target_w_ = 0;
    int32_t target_h_ = 0;
    bool eof_ = false;
    bool loop_ = false;

    int32_t width_ = 0;
    int32_t height_ = 0;
    double fps_ = 30.0;
    double position_ = 0.0;
    double duration_ = 0.0;

    bool chroma_enabled_ = false;
    int chroma_r_ = 0;
    int chroma_g_ = 0;
    int chroma_b_ = 0;
    int chroma_tol_ = 48;

    // Reused JPEG encoder state (libjpeg-turbo, created once per decoder).
    PwcpJpegErr jpeg_err_ = {};
    jpeg_compress_struct jpeg_cinfo_ = {};
    bool jpeg_init_ = false;
    std::vector<uint8_t> jpeg_out_;
    std::vector<uint8_t> keyed_color_;
    std::vector<uint8_t> keyed_alpha_;
    std::vector<uint8_t> alpha_rgba_;
};

VideoDecoder::Impl::Impl(const std::string& path, bool hw_accel) {
    if (!open_codec(path, hw_accel)) {
        if (fmt_) avformat_close_input(&fmt_);
        if (codec_ctx_) avcodec_free_context(&codec_ctx_);
        throw std::runtime_error("VideoDecoder: failed to open " + path);
    }
}

VideoDecoder::Impl::~Impl() {
    if (jpeg_init_) jpeg_destroy_compress(&jpeg_cinfo_);
    if (sws_) sws_freeContext(sws_);
    if (sws_nv12_) sws_freeContext(sws_nv12_);
    if (rgb_) av_frame_free(&rgb_);
    if (nv12_) av_frame_free(&nv12_);
    if (frame_) av_frame_free(&frame_);
    if (rgb_buf_) av_free(rgb_buf_);
    if (nv12_buf_) av_free(nv12_buf_);
    if (codec_ctx_) avcodec_free_context(&codec_ctx_);
    if (fmt_) avformat_close_input(&fmt_);
}

bool VideoDecoder::Impl::open_codec(const std::string& path, bool hw_accel) {
    av_log_set_level(AV_LOG_ERROR);
    if (avformat_open_input(&fmt_, path.c_str(), nullptr, nullptr) < 0) return false;
    if (avformat_find_stream_info(fmt_, nullptr) < 0) return false;

    stream_index_ = av_find_best_stream(fmt_, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (stream_index_ < 0) return false;
    stream_ = fmt_->streams[stream_index_];

    const AVCodec* codec = avcodec_find_decoder(stream_->codecpar->codec_id);
    if (!codec) return false;
    codec_ctx_ = avcodec_alloc_context3(codec);
    if (!codec_ctx_) return false;
    if (avcodec_parameters_to_context(codec_ctx_, stream_->codecpar) < 0) return false;

    if (hw_accel) {
        // Ask libavcodec for a HW config that can use a device we can create.
        for (int i = 0;; ++i) {
            const AVCodecHWConfig* cfg = avcodec_get_hw_config(codec, i);
            if (!cfg) break;
            if (!(cfg->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX)) continue;
            if (cfg->pix_fmt != AV_PIX_FMT_D3D11 && cfg->pix_fmt != AV_PIX_FMT_VAAPI &&
                cfg->pix_fmt != AV_PIX_FMT_VIDEOTOOLBOX) {
                continue;
            }
            AVBufferRef* hw = nullptr;
            if (av_hwdevice_ctx_create(&hw, cfg->device_type, nullptr, nullptr, 0) == 0) {
                codec_ctx_->hw_device_ctx = hw;
                break;
            }
        }
    }

    if (avcodec_open2(codec_ctx_, codec, nullptr) < 0) return false;

    width_ = codec_ctx_->width;
    height_ = codec_ctx_->height;
    // Detect the playback frame rate. The container avg_frame_rate is more
    // reliable than codecpar->framerate, which some encoders leave bogus
    // (e.g. a garbage value that would disable pacing entirely). Validate
    // every source and fall back to a sane default.
    fps_ = 30.0;
    const auto fps_sane = [](double v) { return std::isfinite(v) && v >= 1.0 && v <= 120.0; };
    if (stream_->avg_frame_rate.num > 0 && stream_->avg_frame_rate.den > 0) {
        const double f = av_q2d(stream_->avg_frame_rate);
        if (fps_sane(f)) fps_ = f;
    }
    if (codec_ctx_->framerate.num > 0 && codec_ctx_->framerate.den > 0) {
        const double f = av_q2d(codec_ctx_->framerate);
        if (fps_sane(f)) fps_ = f;
    }
    if (stream_->duration > 0) {
        duration_ = static_cast<double>(stream_->duration) *
                    static_cast<double>(stream_->time_base.num) /
                    static_cast<double>(stream_->time_base.den);
    }

    rgb_ = av_frame_alloc();
    if (!rgb_) return false;
    const size_t buf_size =
        av_image_get_buffer_size(AV_PIX_FMT_RGBA, width_, height_, 1);
    rgb_buf_ = static_cast<uint8_t*>(av_malloc(buf_size));
    if (!rgb_buf_) return false;
    av_image_fill_arrays(rgb_->data, rgb_->linesize, rgb_buf_, AV_PIX_FMT_RGBA, width_, height_, 1);
    rgb_linesize_ = rgb_->linesize[0];
    rgb_w_ = width_;
    rgb_h_ = height_;

    sws_ = sws_getContext(width_, height_, codec_ctx_->pix_fmt, width_, height_, AV_PIX_FMT_RGBA,
                          SWS_BILINEAR, nullptr, nullptr, nullptr);
    frame_ = av_frame_alloc();
    fprintf(stderr, "CODEC name=%s res=%dx%d profile=%d bitrate=%lld fps=%.2f pix_fmt=%d\n",
            codec->name, width_, height_, codec_ctx_->profile,
            (long long)stream_->codecpar->bit_rate, fps_, (int)codec_ctx_->pix_fmt);
    return sws_ && frame_;
}

bool VideoDecoder::Impl::read_next_frame(AVFrame* dst) {
    AVPacket pkt{};
    while (true) {
        int ar = av_read_frame(fmt_, &pkt);
        if (ar < 0) {
            if (ar == AVERROR_EOF && loop_) {
                avcodec_flush_buffers(codec_ctx_);
                if (av_seek_frame(fmt_, -1, 0, AVSEEK_FLAG_BACKWARD) < 0) return false;
                position_ = 0.0;
                continue;
            }
            eof_ = true;
            av_packet_unref(&pkt);
            return false;
        }
        if (pkt.stream_index != stream_index_) {
            av_packet_unref(&pkt);
            continue;
        }
        if (codec_ctx_->codec_type == AVMEDIA_TYPE_VIDEO) {
            avcodec_send_packet(codec_ctx_, &pkt);
            av_packet_unref(&pkt);
            int pkt_out = 0;
            while (0 <= pkt_out) {
                pkt_out = avcodec_receive_frame(codec_ctx_, dst);
                if (pkt_out == 0) {
                    position_ = static_cast<double>(dst->best_effort_timestamp) *
                                static_cast<double>(stream_->time_base.num) /
                                static_cast<double>(stream_->time_base.den);
                    return true;
                }
            }
        } else {
            av_packet_unref(&pkt);
        }
    }
}

void VideoDecoder::Impl::apply_chroma_key(uint8_t* rgba, size_t count) {
    if (!chroma_enabled_) return;
    const int tr = chroma_r_, tg = chroma_g_, tb = chroma_b_, tol = chroma_tol_;
    for (size_t i = 0; i + 3 < count; i += 4) {
        const int dr = static_cast<int>(rgba[i]) - tr;
        const int dg = static_cast<int>(rgba[i + 1]) - tg;
        const int db = static_cast<int>(rgba[i + 2]) - tb;
        const int dist2 = dr * dr + dg * dg + db * db;
        if (dist2 <= tol * tol) {
            rgba[i + 3] = 0;
        } else if (dist2 <= (tol + 32) * (tol + 32)) {
            const float k = static_cast<float>(dist2 - tol * tol) /
                            static_cast<float>((tol + 32) * (tol + 32) - tol * tol);
            rgba[i + 3] = static_cast<uint8_t>(k * 255.0f);
        }
    }
}

rust::Vec<uint8_t> VideoDecoder::Impl::decode_rgba_copy_impl() {
    std::vector<uint8_t> rgba;
    if (!decode_rgba(rgba)) return rust::Vec<uint8_t>();
    rust::Vec<uint8_t> out;
    out.reserve(rgba.size());
    for (uint8_t b : rgba) out.push_back(b);
    return out;
}

bool VideoDecoder::Impl::ensure_rgb(int32_t tw, int32_t th) {
    if (rgb_ && rgb_w_ == tw && rgb_h_ == th) return true;
    if (rgb_) {
        av_frame_free(&rgb_);
        rgb_ = nullptr;
    }
    if (rgb_buf_) {
        av_free(rgb_buf_);
        rgb_buf_ = nullptr;
    }
    rgb_ = av_frame_alloc();
    if (!rgb_) return false;
    const size_t buf_size = av_image_get_buffer_size(AV_PIX_FMT_RGBA, tw, th, 1);
    rgb_buf_ = static_cast<uint8_t*>(av_malloc(buf_size));
    if (!rgb_buf_) return false;
    av_image_fill_arrays(rgb_->data, rgb_->linesize, rgb_buf_, AV_PIX_FMT_RGBA, tw, th, 1);
    rgb_linesize_ = rgb_->linesize[0];
    rgb_w_ = tw;
    rgb_h_ = th;
    return true;
}

void VideoDecoder::Impl::set_target_size(int32_t w, int32_t h) {
    if (w <= 0 || h <= 0) {
        target_w_ = 0;
        target_h_ = 0;
        return;
    }
    const double scale =
        std::min(static_cast<double>(w) / width_, static_cast<double>(h) / height_);
    int32_t tw = static_cast<int32_t>(std::lround(width_ * scale));
    int32_t th = static_cast<int32_t>(std::lround(height_ * scale));
    target_w_ = std::max<int32_t>(16, std::min(tw, width_));
    target_h_ = std::max<int32_t>(16, std::min(th, height_));
}

bool VideoDecoder::Impl::decode_rgba(std::vector<uint8_t>& out) {
    if (!codec_ctx_ || !frame_ || eof_) return false;
    if (!read_next_frame(frame_)) return false;

    const int32_t tw = target_w_ > 0 ? target_w_ : width_;
    const int32_t th = target_h_ > 0 ? target_h_ : height_;

    const AVFrame* src = frame_;
    AVFrame* tmp = nullptr;
    if (frame_->hw_frames_ctx) {
        tmp = av_frame_alloc();
        if (!tmp || av_hwframe_transfer_data(tmp, frame_, 0) < 0) {
            if (tmp) av_frame_free(&tmp);
            return false;
        }
        src = tmp;
    }

    const AVPixelFormat src_fmt = src->format == AV_PIX_FMT_NONE
                                      ? codec_ctx_->pix_fmt
                                      : static_cast<AVPixelFormat>(src->format);
    if (sws_ && (sws_src_fmt_ != src_fmt || sws_out_w_ != tw || sws_out_h_ != th)) {
        sws_freeContext(sws_);
        sws_ = nullptr;
    }
    if (!sws_) {
        sws_ = sws_getContext(width_, height_, src_fmt, tw, th, AV_PIX_FMT_RGBA, SWS_BILINEAR,
                              nullptr, nullptr, nullptr);
        sws_src_fmt_ = sws_ ? src_fmt : AV_PIX_FMT_NONE;
        sws_out_w_ = tw;
        sws_out_h_ = th;
        if (sws_ && !ensure_rgb(tw, th)) {
            sws_freeContext(sws_);
            sws_ = nullptr;
        }
    }
    if (!sws_) {
        if (tmp) av_frame_free(&tmp);
        return false;
    }
    sws_scale(sws_, src->data, src->linesize, 0, height_, rgb_->data, rgb_->linesize);
    if (tmp) av_frame_free(&tmp);

    out.resize(static_cast<size_t>(tw) * th * 4, 0);
    uint8_t* dst = out.data();
    for (int y = 0; y < th; ++y) {
        const uint8_t* row = rgb_->data[0] + static_cast<size_t>(y) * rgb_linesize_;
        std::memcpy(dst, row, static_cast<size_t>(tw) * 4);
        dst += static_cast<size_t>(tw) * 4;
    }
    apply_chroma_key(out.data(), out.size());
    return true;
}

bool VideoDecoder::Impl::ensure_nv12(int32_t tw, int32_t th) {
    if (nv12_ && nv12_w_ == tw && nv12_h_ == th) return true;
    if (nv12_) {
        av_frame_free(&nv12_);
        nv12_ = nullptr;
    }
    if (nv12_buf_) {
        av_free(nv12_buf_);
        nv12_buf_ = nullptr;
    }
    nv12_ = av_frame_alloc();
    if (!nv12_) return false;
    const size_t buf_size = av_image_get_buffer_size(AV_PIX_FMT_NV12, tw, th, 1);
    nv12_buf_ = static_cast<uint8_t*>(av_malloc(buf_size));
    if (!nv12_buf_) return false;
    av_image_fill_arrays(nv12_->data, nv12_->linesize, nv12_buf_, AV_PIX_FMT_NV12, tw, th, 1);
    nv12_linesize0_ = nv12_->linesize[0];
    nv12_linesize1_ = nv12_->linesize[1];
    nv12_w_ = tw;
    nv12_h_ = th;
    return true;
}

bool VideoDecoder::Impl::decode_nv12(std::vector<uint8_t>& out, int32_t& ow, int32_t& oh) {
    if (!codec_ctx_ || !frame_ || eof_) return false;
    if (!read_next_frame(frame_)) return false;

    // NV12 requires even dimensions; round up so odd sources stay valid.
    const int32_t tw = ((target_w_ > 0 ? target_w_ : width_) + 1) & ~1;
    const int32_t th = ((target_h_ > 0 ? target_h_ : height_) + 1) & ~1;

    const AVFrame* src = frame_;
    AVFrame* tmp = nullptr;
    if (frame_->hw_frames_ctx) {
        tmp = av_frame_alloc();
        if (!tmp || av_hwframe_transfer_data(tmp, frame_, 0) < 0) {
            if (tmp) av_frame_free(&tmp);
            return false;
        }
        src = tmp;
    }

    const AVPixelFormat src_fmt = src->format == AV_PIX_FMT_NONE
                                      ? codec_ctx_->pix_fmt
                                      : static_cast<AVPixelFormat>(src->format);
    if (sws_nv12_ &&
        (sws_nv12_src_fmt_ != src_fmt || sws_nv12_w_ != tw || sws_nv12_h_ != th)) {
        sws_freeContext(sws_nv12_);
        sws_nv12_ = nullptr;
    }
    if (!sws_nv12_) {
        sws_nv12_ = sws_getContext(width_, height_, src_fmt, tw, th, AV_PIX_FMT_NV12,
                                   SWS_BILINEAR, nullptr, nullptr, nullptr);
        sws_nv12_src_fmt_ = sws_nv12_ ? src_fmt : AV_PIX_FMT_NONE;
        sws_nv12_w_ = tw;
        sws_nv12_h_ = th;
        if (sws_nv12_ && !ensure_nv12(tw, th)) {
            sws_freeContext(sws_nv12_);
            sws_nv12_ = nullptr;
        }
        if (sws_nv12_) {
            // Normalize the transported NV12 to a known colorimetry (BT.709
            // limited range) regardless of the source's own matrix/range, so
            // the frontend shader's fixed YUV->RGB constants always match.
            // Without this, BT.601 or full-range sources render over-saturated.
            int src_csp = src->colorspace;
            if (src_csp < 0 || src_csp >= AVCOL_SPC_NB || src_csp == AVCOL_SPC_RGB ||
                src_csp == AVCOL_SPC_UNSPECIFIED) {
                src_csp = codec_ctx_->colorspace;
            }
            if (src_csp < 0 || src_csp >= AVCOL_SPC_NB || src_csp == AVCOL_SPC_RGB ||
                src_csp == AVCOL_SPC_UNSPECIFIED) {
                src_csp = AVCOL_SPC_BT709;
            }
            const int src_range =
                (src->color_range == AVCOL_RANGE_JPEG ||
                 src_fmt == AV_PIX_FMT_YUVJ420P || src_fmt == AV_PIX_FMT_YUVJ422P ||
                 src_fmt == AV_PIX_FMT_YUVJ444P || src_fmt == AV_PIX_FMT_YUVJ440P)
                    ? 1
                    : 0;
            const int* inv = sws_getCoefficients(src_csp);
            const int* tbl = sws_getCoefficients(AVCOL_SPC_BT709);
            if (inv && tbl) {
                sws_setColorspaceDetails(sws_nv12_, inv, src_range, tbl, 0, 0, 1, 1);
            }
            fprintf(stderr, "NV12 csp=%d range=%d src_fmt=%d out=%dx%d\n", src_csp,
                    src->color_range, (int)src_fmt, tw, th);
        }
    }
    if (!sws_nv12_) {
        if (tmp) av_frame_free(&tmp);
        return false;
    }
    sws_scale(sws_nv12_, src->data, src->linesize, 0, height_, nv12_->data, nv12_->linesize);
    if (tmp) av_frame_free(&tmp);

    out.resize(static_cast<size_t>(tw) * th * 3 / 2, 0);
    uint8_t* dst = out.data();
    for (int y = 0; y < th; ++y) {
        const uint8_t* row = nv12_->data[0] + static_cast<size_t>(y) * nv12_linesize0_;
        std::memcpy(dst, row, static_cast<size_t>(tw));
        dst += static_cast<size_t>(tw);
    }
    for (int y = 0; y < th / 2; ++y) {
        const uint8_t* row = nv12_->data[1] + static_cast<size_t>(y) * nv12_linesize1_;
        std::memcpy(dst, row, static_cast<size_t>(tw));
        dst += static_cast<size_t>(tw);
    }
    ow = tw;
    oh = th;
    return true;
}

// Encode an RGBA frame to JPEG using libjpeg-turbo (SIMD-accelerated). The
// compress context is created once and reused across frames; libjpeg re-reads
// the dimensions on every jpeg_start_compress, so resolution changes are
// handled implicitly. RGBA is fed directly via JCS_EXT_RGBA (no swscale).
bool VideoDecoder::Impl::encode_jpeg(std::vector<uint8_t>& out, const std::vector<uint8_t>& rgba,
                                     int width, int height, uint8_t quality) {
    const size_t expected = static_cast<size_t>(width) * height * 4;
    if (rgba.size() < expected || width <= 0 || height <= 0) return false;

    if (!jpeg_init_) {
        jpeg_cinfo_.err = jpeg_std_error(&jpeg_err_.pub);
        jpeg_err_.pub.error_exit = pwcp_jpeg_error_exit;
        jpeg_create_compress(&jpeg_cinfo_);
        jpeg_init_ = true;
    }

    unsigned char* mem = nullptr;
    unsigned long memsize = 0;
    if (std::setjmp(jpeg_err_.jmp)) {
        if (jpeg_init_) {
            jpeg_destroy_compress(&jpeg_cinfo_);
            jpeg_init_ = false;
        }
        if (mem) std::free(mem);
        return false;
    }

    jpeg_cinfo_.image_width = width;
    jpeg_cinfo_.image_height = height;
    jpeg_cinfo_.input_components = 4;
    jpeg_cinfo_.in_color_space = JCS_EXT_RGBA;
    jpeg_set_defaults(&jpeg_cinfo_);
    jpeg_set_quality(&jpeg_cinfo_, quality > 100 ? 100 : quality, TRUE);
    jpeg_mem_dest(&jpeg_cinfo_, &mem, &memsize);

    jpeg_start_compress(&jpeg_cinfo_, TRUE);
    while (jpeg_cinfo_.next_scanline < static_cast<JDIMENSION>(height)) {
        JSAMPROW row = const_cast<JSAMPROW>(
            rgba.data() + static_cast<size_t>(jpeg_cinfo_.next_scanline) * width * 4);
        jpeg_write_scanlines(&jpeg_cinfo_, &row, 1);
    }
    jpeg_finish_compress(&jpeg_cinfo_);

    out.assign(mem, mem + memsize);
    std::free(mem);
    return true;
}

rust::Vec<uint8_t> VideoDecoder::Impl::encode_jpeg_to_rust(const std::vector<uint8_t>& rgba,
                                                           int width, int height,
                                                           uint8_t quality) {
    std::vector<uint8_t> tmp;
    if (!encode_jpeg(tmp, rgba, width, height, quality)) return rust::Vec<uint8_t>();
    rust::Vec<uint8_t> out;
    out.reserve(tmp.size());
    for (uint8_t b : tmp) out.push_back(b);
    return out;
}

rust::Vec<uint8_t> VideoDecoder::Impl::decode_frame_jpeg(uint8_t quality) {
    std::vector<uint8_t> rgba;
    if (!decode_rgba(rgba)) return rust::Vec<uint8_t>();
    const int32_t w = target_w_ > 0 ? target_w_ : width_;
    const int32_t h = target_h_ > 0 ? target_h_ : height_;
    return encode_jpeg_to_rust(rgba, w, h, quality);
}

int64_t VideoDecoder::Impl::fill_jpeg_frame(rust::Vec<uint8_t>& out, uint8_t quality) {
    std::vector<uint8_t> rgba;
    if (!decode_rgba(rgba)) return -1;
    const int32_t w = target_w_ > 0 ? target_w_ : width_;
    const int32_t h = target_h_ > 0 ? target_h_ : height_;
    jpeg_out_.clear();
    if (!encode_jpeg(jpeg_out_, rgba, w, h, quality)) return -1;
    if (out.size() < jpeg_out_.size()) return -1;
    std::memcpy(out.data(), jpeg_out_.data(), jpeg_out_.size());
    return static_cast<int64_t>(jpeg_out_.size());
}

// Chroma path: `decode_rgba` already keys the alpha channel (RGB untouched, so
// the green background stays opaque in the color JPEG). The keyed alpha is
// soft-edged, so a half-resolution mask is plenty accurate. It is shipped as a
// JPEG (white RGB + key alpha) so the frontend decodes it with
// createImageBitmap and uses it directly as a `destination-in` mask, avoiding a
// per-pixel JS loop and keeping the IPC payload small.
bool VideoDecoder::Impl::keyed_frames(std::vector<uint8_t>& color, std::vector<uint8_t>& alpha,
                                      int32_t& aw, int32_t& ah, uint8_t quality) {
    std::vector<uint8_t> rgba;
    if (!decode_rgba(rgba)) return false;
    const int32_t w = target_w_ > 0 ? target_w_ : width_;
    const int32_t h = target_h_ > 0 ? target_h_ : height_;
    const size_t n = static_cast<size_t>(w) * h;
    if (rgba.size() < n * 4) return false;

    if (!encode_jpeg(color, rgba, w, h, quality)) return false;

    aw = std::max<int32_t>(16, w / 2);
    ah = std::max<int32_t>(16, h / 2);
    alpha_rgba_.resize(static_cast<size_t>(aw) * ah * 4);
    for (int32_t y = 0; y < ah; ++y) {
        const uint8_t* src = rgba.data() + (static_cast<size_t>(y) * 2 * w * 4) + 3;
        uint8_t* dst = alpha_rgba_.data() + static_cast<size_t>(y) * aw * 4;
        for (int32_t x = 0; x < aw; ++x) {
            const uint8_t a = src[static_cast<size_t>(x) * 2 * 4];
            dst[0] = 255;
            dst[1] = 255;
            dst[2] = 255;
            dst[3] = a;
            dst += 4;
        }
    }
    return encode_jpeg(alpha, alpha_rgba_, aw, ah, quality);
}

// Packed payload:
// `[u32 color_len LE][color jpeg][u32 alpha_len LE][alpha jpeg][u32 aw LE][u32 ah LE]`.
int64_t VideoDecoder::Impl::fill_keyed_jpeg(rust::Vec<uint8_t>& out, uint8_t quality) {
    keyed_color_.clear();
    keyed_alpha_.clear();
    int32_t aw = 0;
    int32_t ah = 0;
    if (!keyed_frames(keyed_color_, keyed_alpha_, aw, ah, quality)) return -1;
    const uint32_t clen = static_cast<uint32_t>(keyed_color_.size());
    const uint32_t alen = static_cast<uint32_t>(keyed_alpha_.size());
    const size_t total = 4 + clen + 4 + alen + 4 + 4;
    if (out.size() < total) return -1;
    uint8_t* p = out.data();
    std::memcpy(p, &clen, 4);
    p += 4;
    std::memcpy(p, keyed_color_.data(), clen);
    p += clen;
    std::memcpy(p, &alen, 4);
    p += 4;
    std::memcpy(p, keyed_alpha_.data(), alen);
    p += alen;
    std::memcpy(p, &aw, 4);
    p += 4;
    std::memcpy(p, &ah, 4);
    p += 4;
    return static_cast<int64_t>(total);
}

rust::Vec<uint8_t> VideoDecoder::Impl::decode_frame() {
    return decode_rgba_copy_impl();
}

bool VideoDecoder::Impl::fill_frame(rust::Vec<uint8_t>& out) {
    std::vector<uint8_t> rgba;
    if (!decode_rgba(rgba)) return false;
    const size_t n = rgba.size();
    if (out.size() < n) return false;
    std::memcpy(out.data(), rgba.data(), n);
    return true;
}

int64_t VideoDecoder::Impl::fill_nv12(rust::Vec<uint8_t>& out) {
    std::vector<uint8_t> nv12;
    int32_t ow = 0;
    int32_t oh = 0;
    if (!decode_nv12(nv12, ow, oh)) return -1;
    const size_t n = nv12.size();
    if (out.size() < n) return -1;
    std::memcpy(out.data(), nv12.data(), n);
    return static_cast<int64_t>(n);
}

void VideoDecoder::Impl::set_chroma_key(bool enabled, uint8_t r, uint8_t g, uint8_t b, uint8_t tol) {
    chroma_enabled_ = enabled;
    chroma_r_ = r;
    chroma_g_ = g;
    chroma_b_ = b;
    chroma_tol_ = tol;
}

bool VideoDecoder::Impl::seek(double seconds) {
    if (!fmt_ || !stream_) return false;
    const int64_t ts = static_cast<int64_t>(seconds / av_q2d(stream_->time_base));
    if (av_seek_frame(fmt_, stream_index_, ts, AVSEEK_FLAG_BACKWARD) < 0) return false;
    avcodec_flush_buffers(codec_ctx_);
    eof_ = false;
    position_ = seconds;
    return true;
}

// ---------------------------------------------------------------------------
// VideoDecoder (public wrapper)
// ---------------------------------------------------------------------------
VideoDecoder::VideoDecoder(const std::string& path, bool hw_accel)
    : impl_(std::make_unique<Impl>(path, hw_accel)) {}
VideoDecoder::~VideoDecoder() = default;

rust::Vec<uint8_t> VideoDecoder::decode_frame() { return impl_->decode_frame(); }
rust::Vec<uint8_t> VideoDecoder::decode_frame_jpeg(uint8_t quality) {
    return impl_->decode_frame_jpeg(quality);
}
bool VideoDecoder::fill_frame(rust::Vec<uint8_t>& out) {
    return impl_->fill_frame(out);
}
int64_t VideoDecoder::fill_jpeg_frame(rust::Vec<uint8_t>& out, uint8_t quality) {
    return impl_->fill_jpeg_frame(out, quality);
}
int64_t VideoDecoder::fill_keyed_jpeg(rust::Vec<uint8_t>& out, uint8_t quality) {
    return impl_->fill_keyed_jpeg(out, quality);
}
int64_t VideoDecoder::fill_nv12(rust::Vec<uint8_t>& out) { return impl_->fill_nv12(out); }
void VideoDecoder::set_target_size(int32_t w, int32_t h) { impl_->set_target_size(w, h); }
int32_t VideoDecoder::out_width() const { return impl_->out_width(); }
int32_t VideoDecoder::out_height() const { return impl_->out_height(); }
int32_t VideoDecoder::width() const { return impl_->width(); }
int32_t VideoDecoder::height() const { return impl_->height(); }
double VideoDecoder::fps() const { return impl_->fps(); }

void VideoDecoder::set_looping(bool enabled) { impl_->set_looping(enabled); }
void VideoDecoder::set_chroma_key(bool enabled, uint8_t r, uint8_t g, uint8_t b, uint8_t tol) {
    impl_->set_chroma_key(enabled, r, g, b, tol);
}
bool VideoDecoder::seek(double seconds) { return impl_->seek(seconds); }
double VideoDecoder::position() const { return impl_->position(); }
double VideoDecoder::duration() const { return impl_->duration(); }

// ---------------------------------------------------------------------------
// Free function from the bridge.
// ---------------------------------------------------------------------------
std::unique_ptr<VideoDecoder> new_video_decoder(rust::Str path, bool hw_accel) {
    try {
        return std::make_unique<VideoDecoder>(std::string(path.data(), path.size()), hw_accel);
    } catch (const std::exception&) {
        return nullptr;
    }
}

} // namespace pwcp