// ndi_input.cpp — Receives live video over NDI (network video input).
//
// Uses the NDI SDK (Vizrt NDI 6) static interface. A receiver attaches to a
// source discovered via NDI find, captures the latest video frame and JPEG
// encodes it (libjpeg-turbo) so the Rust side / WebView can display it as a
// live video input (camera, OBS, other ProWorshipCast instances, ...).
//
// C++17. Only symbols declared in cpp/include/core.h are exported.

#include "core.h"

#include <Processing.NDI.Lib.h>

#include <jpeglib.h>

#include <csetjmp>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Minimal JPEG error trampoline (mirrors the one in video_engine.cpp so NDI
// input JPEG encoding survives libjpeg aborts without killing the process).
struct PwcpJpegErr {
    struct jpeg_error_mgr pub;
    std::jmp_buf jmp;
};

extern "C" void pwcp_ndi_jpeg_error_exit(j_common_ptr cinfo) {
    PwcpJpegErr* err = reinterpret_cast<PwcpJpegErr*>(cinfo->err);
    std::longjmp(err->jmp, 1);
}

namespace pwcp {

class NdiReceiver::Impl {
public:
    Impl();
    ~Impl();
    Impl(const Impl&) = delete;
    Impl& operator=(const Impl&) = delete;

    bool connect(rust::Str name);
    rust::Vec<uint8_t> capture_jpeg(uint8_t quality);
    int32_t width() const { return width_; }
    int32_t height() const { return height_; }
    double fps() const { return fps_; }
    bool is_connected() const { return recv_ != nullptr; }

private:
    bool encode_jpeg(std::vector<uint8_t>& out, const std::vector<uint8_t>& rgba, int width,
                     int height, uint8_t quality);

    NDIlib_recv_instance_t recv_ = nullptr;
    std::string source_name_;
    int32_t width_ = 0;
    int32_t height_ = 0;
    double fps_ = 0.0;

    PwcpJpegErr jpeg_err_ = {};
    jpeg_compress_struct jpeg_cinfo_ = {};
    bool jpeg_init_ = false;
};

NdiReceiver::Impl::Impl() {
    if (!NDIlib_initialize()) {
        throw std::runtime_error("NdiReceiver: NDIlib_initialize failed");
    }
}

NdiReceiver::Impl::~Impl() {
    if (recv_) {
        NDIlib_recv_destroy(recv_);
        recv_ = nullptr;
    }
    if (jpeg_init_) {
        jpeg_destroy_compress(&jpeg_cinfo_);
        jpeg_init_ = false;
    }
    NDIlib_destroy();
}

bool NdiReceiver::Impl::connect(rust::Str name) {
    if (recv_) {
        NDIlib_recv_destroy(recv_);
        recv_ = nullptr;
    }
    const std::string name_str(name);
    if (name_str.empty()) return false;

    NDIlib_find_create_t find_create{};
    find_create.show_local_sources = true;
    NDIlib_find_instance_t finder = NDIlib_find_create_v2(&find_create);
    if (!finder) return false;

    // Let the finder run briefly so sources on the LAN have a chance to be
    // announced (discovery is asynchronous in NDI).
    NDIlib_find_wait_for_sources(finder, 1500);

    uint32_t no_sources = 0;
    const NDIlib_source_t* sources = NDIlib_find_get_current_sources(finder, &no_sources);
    const NDIlib_source_t* match = nullptr;
    for (uint32_t i = 0; i < no_sources; ++i) {
        if (sources[i].p_ndi_name && name_str == sources[i].p_ndi_name) {
            match = &sources[i];
            break;
        }
    }
    std::string url;
    if (match) {
        url = match->p_url_address ? match->p_url_address : "";
    }
    NDIlib_find_destroy(finder);
    if (!match) return false;

    NDIlib_recv_create_v3_t create{};
    create.source_to_connect_to.p_ndi_name = name_str.c_str();
    if (!url.empty()) create.source_to_connect_to.p_url_address = url.c_str();
    // Deliver RGBA so no colorspace conversion is needed before JPEG encode.
    create.color_format = NDIlib_recv_color_format_RGBX_RGBA;
    create.bandwidth = NDIlib_recv_bandwidth_highest;
    create.allow_video_fields = false;
    recv_ = NDIlib_recv_create_v3(&create);
    if (!recv_) return false;
    source_name_ = name_str;

    // Grab the first available frame so dimensions/fps are populated without
    // requiring the frontend to pull first.
    NDIlib_video_frame_v2_t video{};
    NDIlib_frame_type_e t = NDIlib_recv_capture_v2(recv_, &video, nullptr, nullptr, 1500);
    if (t == NDIlib_frame_type_video) {
        width_ = video.xres;
        height_ = video.yres;
        if (video.frame_rate_D > 0) {
            fps_ = static_cast<double>(video.frame_rate_N) / video.frame_rate_D;
        }
        NDIlib_recv_free_video_v2(recv_, &video);
    }
    return true;
}

bool NdiReceiver::Impl::encode_jpeg(std::vector<uint8_t>& out, const std::vector<uint8_t>& rgba,
                                    int width, int height, uint8_t quality) {
    if (rgba.size() < static_cast<size_t>(width) * height * 4 || width <= 0 || height <= 0) {
        return false;
    }
    if (!jpeg_init_) {
        jpeg_cinfo_.err = jpeg_std_error(&jpeg_err_.pub);
        jpeg_err_.pub.error_exit = pwcp_ndi_jpeg_error_exit;
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

rust::Vec<uint8_t> NdiReceiver::Impl::capture_jpeg(uint8_t quality) {
    if (!recv_) return {};
    // A short timeout so a stalled source never blocks the capture loop; the
    // Rust side re-pulls, so dropping a frame is harmless.
    NDIlib_video_frame_v2_t video{};
    NDIlib_frame_type_e t = NDIlib_recv_capture_v2(recv_, &video, nullptr, nullptr, 500);
    if (t != NDIlib_frame_type_video) return {};

    const int w = video.xres;
    const int h = video.yres;
    if (w <= 0 || h <= 0) {
        NDIlib_recv_free_video_v2(recv_, &video);
        return {};
    }
    width_ = w;
    height_ = h;
    if (video.frame_rate_D > 0) {
        fps_ = static_cast<double>(video.frame_rate_N) / video.frame_rate_D;
    }

    // The SDK may pad each row (line_stride_in_bytes); copy to a tight RGBA
    // buffer so libjpeg gets contiguous rows.
    std::vector<uint8_t> rgba(static_cast<size_t>(w) * h * 4);
    const int stride = video.line_stride_in_bytes > 0 ? video.line_stride_in_bytes : w * 4;
    const uint8_t* src = video.p_data;
    uint8_t* dst = rgba.data();
    for (int y = 0; y < h; ++y) {
        std::memcpy(dst + static_cast<size_t>(y) * w * 4, src + static_cast<size_t>(y) * stride,
                    static_cast<size_t>(w) * 4);
    }
    NDIlib_recv_free_video_v2(recv_, &video);

    std::vector<uint8_t> jpeg;
    if (!encode_jpeg(jpeg, rgba, w, h, quality)) return {};
    rust::Vec<uint8_t> out;
    out.reserve(jpeg.size());
    for (uint8_t b : jpeg) out.push_back(b);
    return out;
}

// ---------------------------------------------------------------------------
// NdiReceiver (public wrapper)
// ---------------------------------------------------------------------------
NdiReceiver::NdiReceiver() : impl_(std::make_unique<Impl>()) {}
NdiReceiver::~NdiReceiver() = default;

bool NdiReceiver::connect(rust::Str name) { return impl_->connect(name); }

rust::Vec<uint8_t> NdiReceiver::capture_jpeg(uint8_t quality) {
    return impl_->capture_jpeg(quality);
}

int32_t NdiReceiver::width() const { return impl_->width(); }
int32_t NdiReceiver::height() const { return impl_->height(); }
double NdiReceiver::fps() const { return impl_->fps(); }
bool NdiReceiver::is_connected() const { return impl_->is_connected(); }

// ---------------------------------------------------------------------------
// Free functions from the bridge.
// ---------------------------------------------------------------------------
std::unique_ptr<NdiReceiver> new_ndi_receiver() {
    try {
        return std::make_unique<NdiReceiver>();
    } catch (const std::exception&) {
        return nullptr;
    }
}

rust::Vec<rust::String> ndi_list_sources() {
    rust::Vec<rust::String> out;
    if (!NDIlib_initialize()) return out;

    NDIlib_find_create_t find_create{};
    find_create.show_local_sources = true;
    NDIlib_find_instance_t finder = NDIlib_find_create_v2(&find_create);
    if (finder) {
        NDIlib_find_wait_for_sources(finder, 1500);
        uint32_t no_sources = 0;
        const NDIlib_source_t* sources = NDIlib_find_get_current_sources(finder, &no_sources);
        for (uint32_t i = 0; i < no_sources; ++i) {
            if (sources[i].p_ndi_name) {
                out.push_back(std::string(sources[i].p_ndi_name));
            }
        }
        NDIlib_find_destroy(finder);
    }
    NDIlib_destroy();
    return out;
}

} // namespace pwcp