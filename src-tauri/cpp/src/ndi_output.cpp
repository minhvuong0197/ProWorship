// ndi_output.cpp — Sends RGBA frames over NDI (network video) for output.
//
// Uses the NDI SDK (Vizrt NDI 6) static interface. Frames supplied by the
// FFmpeg Video Engine (or any RGBA source) are pushed into a single send
// instance that receivers on the LAN can subscribe to.
//
// C++17. Only symbols declared in cpp/include/core.h are exported.

#include "core.h"

#include <Processing.NDI.Lib.h>

#include <cstring>
#include <stdexcept>
#include <vector>

namespace pwcp {

class NdiSender::Impl {
public:
    explicit Impl(const std::string& name);
    ~Impl();
    Impl(const Impl&) = delete;
    Impl& operator=(const Impl&) = delete;

    bool send_frame(const rust::Slice<const uint8_t> rgba, int32_t width, int32_t height) const;

private:
    NDIlib_send_instance_t sender_ = nullptr;
};

NdiSender::Impl::Impl(const std::string& name) {
    if (!NDIlib_initialize()) {
        throw std::runtime_error("NdiSender: NDIlib_initialize failed");
    }
    NDIlib_send_create_t create{};
    create.p_ndi_name = name.c_str();
    create.clock_video = false; // frames are pushed on our own cadence
    create.clock_audio = false;
    sender_ = NDIlib_send_create(&create);
    if (!sender_) {
        NDIlib_destroy();
        throw std::runtime_error("NdiSender: NDIlib_send_create failed");
    }
}

NdiSender::Impl::~Impl() {
    if (sender_) {
        NDIlib_send_destroy(sender_);
        sender_ = nullptr;
    }
    NDIlib_destroy();
}

bool NdiSender::Impl::send_frame(const rust::Slice<const uint8_t> rgba, int32_t width,
                                 int32_t height) const {
    if (!sender_ || width <= 0 || height <= 0) return false;
    const size_t expected = static_cast<size_t>(width) * height * 4;
    if (rgba.size() < expected) return false;

    NDIlib_video_frame_v2_t frame{};
    frame.xres = width;
    frame.yres = height;
    frame.FourCC = NDIlib_FourCC_type_RGBA;
    frame.frame_rate_N = 60000;
    frame.frame_rate_D = 1001;
    // NOTE: `line_stride_in_bytes` and `data_size_in_bytes` are the SAME union
    // member in NDIlib_video_frame_v2_t. For uncompressed FourCCs we must set
    // the stride only — writing data_size_in_bytes afterwards would overwrite
    // the stride and make the SDK read rows at a huge offset (crash on 1080p).
    frame.line_stride_in_bytes = static_cast<int>(width * 4u);
    frame.p_data = const_cast<uint8_t*>(rgba.data());
    NDIlib_send_send_video_v2(sender_, &frame);
    return true;
}

// ---------------------------------------------------------------------------
// NdiSender (public wrapper)
// ---------------------------------------------------------------------------
NdiSender::NdiSender(const std::string& name) : impl_(std::make_unique<Impl>(name)) {}
NdiSender::~NdiSender() = default;

bool NdiSender::send_frame(const rust::Slice<const uint8_t> rgba, int32_t width, int32_t height) const {
    return impl_->send_frame(rgba, width, height);
}

// ---------------------------------------------------------------------------
// Free function from the bridge.
// ---------------------------------------------------------------------------
std::unique_ptr<NdiSender> new_ndi_sender(rust::Str name) {
    try {
        return std::make_unique<NdiSender>(std::string(name.data(), name.size()));
    } catch (const std::exception&) {
        return nullptr;
    }
}

} // namespace pwcp