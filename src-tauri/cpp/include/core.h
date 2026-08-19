// core.h — Public C++ API for the ProWorshipCast native core.
//
// Declarations here must match the `#[cxx::bridge]` in
// src/native/bridge.rs. Implementations live in cpp/src/video_engine.cpp
// and cpp/src/ndi_output.cpp.

#pragma once

#include <cstdint>
#include <memory>
#include <string>

#include "rust/cxx.h"

namespace pwcp {

// ---------------------------------------------------------------------------
// Video Engine — FFmpeg-based frame decoding to RGBA.
// ---------------------------------------------------------------------------
class VideoDecoder {
public:
    VideoDecoder(const std::string& path, bool hw_accel);
    ~VideoDecoder();
    VideoDecoder(const VideoDecoder&) = delete;
    VideoDecoder& operator=(const VideoDecoder&) = delete;

    // Decode the next frame as RGBA bytes. Empty when stream exhausted.
    rust::Vec<uint8_t> decode_frame();
    // Decode the next frame as a JPEG blob. Empty when stream exhausted.
    // `quality` is in 1..=100 (higher = better).
    rust::Vec<uint8_t> decode_frame_jpeg(uint8_t quality);
    // Decode the next frame into a pre-sized RGBA buffer. Returns false when
    // the stream is exhausted or `out` is too small.
    bool fill_frame(rust::Vec<uint8_t>& out);
    // Decode the next frame, JPEG-encode it into `out`, and return the number
    // of bytes written, or -1 on failure/EOF. `out` must be pre-sized.
    int64_t fill_jpeg_frame(rust::Vec<uint8_t>& out, uint8_t quality);
    // Decode ONE frame and produce both raw RGBA (for NDI) and JPEG (for the
    // WebView) from that same frame, so the NDI auto-pump does not double
    // decode. Returns the JPEG byte count, or -1 on failure/EOF. Both `rgba`
    // and `jpeg` must be pre-sized to `out_width()*out_height()*4`.
    int64_t fill_frame_rgba_and_jpeg(rust::Vec<uint8_t>& rgba, rust::Vec<uint8_t>& jpeg,
                                     uint8_t quality);
    // Chroma path: encode the frame as a compact packed payload of two JPEGs
    // (color + grayscale alpha mask) instead of raw RGBA. Returns the number
    // of bytes written, or -1 on failure/EOF. `out` must be pre-sized.
    int64_t fill_keyed_jpeg(rust::Vec<uint8_t>& out, uint8_t quality);
    // Decode the next frame as tightly-packed NV12 (Y plane then interleaved
    // UV plane) into `out`, returning the number of bytes written, or -1 on
    // failure/EOF. `out` must be pre-sized. Output dims are always even.
    int64_t fill_nv12(rust::Vec<uint8_t>& out);
    // Scale output to fit within (w, h) preserving aspect. (0,0) = source res.
    void set_target_size(int32_t w, int32_t h);
    int32_t out_width() const;
    int32_t out_height() const;
    int32_t width() const;
    int32_t height() const;
    double fps() const;

    void set_looping(bool enabled);
    void set_chroma_key(bool enabled, uint8_t key_r, uint8_t key_g, uint8_t key_b, uint8_t tolerance);

    bool seek(double seconds);
    double position() const;
    double duration() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

// ---------------------------------------------------------------------------
// NDI Output — sends RGBA frames over the LAN via the NDI SDK.
// ---------------------------------------------------------------------------
class NdiSender {
public:
    explicit NdiSender(const std::string& name);
    ~NdiSender();
    NdiSender(const NdiSender&) = delete;
    NdiSender& operator=(const NdiSender&) = delete;

    bool send_frame(const rust::Slice<const uint8_t> rgba, int32_t width, int32_t height) const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

// Free functions referenced by the bridge. `&str`/`&[u8]` map to `rust::Str`/`rust::Slice`.
std::unique_ptr<VideoDecoder> new_video_decoder(rust::Str path, bool hw_accel);
std::unique_ptr<NdiSender> new_ndi_sender(rust::Str name);

} // namespace pwcp
