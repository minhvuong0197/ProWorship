//! cxx FFI bridge between Rust and the C++ core (Video Engine + NDI Output).
//!
//! Split into two `unsafe extern "C++"` blocks so a compile error in one
//! module does not block the other. Only unsafe blocks mandated by `cxx`
//! live here; no hand-written `extern "C"` ABI shims.

#[cxx::bridge(namespace = "pwcp")]
mod ffi {
    // ---- Video Engine (cpp/src/video_engine.cpp) ----
    unsafe extern "C++" {
        include!("core.h");

        type VideoDecoder;

        /// Create a decoder for the given file path. Returns an opaque object.
        fn new_video_decoder(path: &str, hw_accel: bool) -> UniquePtr<VideoDecoder>;
        /// Decode the next frame and return it as RGBA bytes.
        /// Returns an empty vector when the stream is exhausted.
        fn decode_frame(self: Pin<&mut VideoDecoder>) -> Vec<u8>;
        /// Decode the next frame and return it as a JPEG-encoded byte blob.
        /// Returns an empty vector when the stream is exhausted.
        fn decode_frame_jpeg(self: Pin<&mut VideoDecoder>, quality: u8) -> Vec<u8>;
        /// Decode the next frame into a pre-sized RGBA buffer (avoids a
        /// per-pixel copy). Returns false when the stream is exhausted or the
        /// buffer is too small.
        fn fill_frame(self: Pin<&mut VideoDecoder>, out: &mut Vec<u8>) -> bool;
        /// Decode the next frame, JPEG-encode it into `out`, and return the
        /// number of bytes written, or -1 on failure/EOF. `out` must be
        /// pre-sized.
        fn fill_jpeg_frame(self: Pin<&mut VideoDecoder>, out: &mut Vec<u8>, quality: u8) -> i64;
        /// Chroma path: encode the frame as a compact packed payload of two
        /// JPEGs (color + grayscale alpha mask) instead of raw RGBA. Returns
        /// the number of bytes written, or -1 on failure/EOF.
        fn fill_keyed_jpeg(self: Pin<&mut VideoDecoder>, out: &mut Vec<u8>, quality: u8) -> i64;
        /// Decode the next frame as tightly-packed NV12 (Y plane then
        /// interleaved UV plane) into `out`, returning bytes written or -1 on
        /// failure/EOF. `out` must be pre-sized.
        fn fill_nv12(self: Pin<&mut VideoDecoder>, out: &mut Vec<u8>) -> i64;
        /// Scale decoded output to fit within (width, height) preserving
        /// aspect ratio. (0,0) restores the source resolution.
        fn set_target_size(self: Pin<&mut VideoDecoder>, width: i32, height: i32);
        /// Actual output width (source or downscaled).
        fn out_width(self: &VideoDecoder) -> i32;
        /// Actual output height (source or downscaled).
        fn out_height(self: &VideoDecoder) -> i32;
        /// Return the decoded video width in pixels.
        fn width(self: &VideoDecoder) -> i32;
        /// Return the decoded video height in pixels.
        fn height(self: &VideoDecoder) -> i32;
        /// Return the nominal frame rate (frames per second).
        fn fps(self: &VideoDecoder) -> f64;
        /// Enable or disable seamless looping at end of stream.
        fn set_looping(self: Pin<&mut VideoDecoder>, enabled: bool);
        /// Enable/disable chroma key. `key` is an RGB tuple (0-255 each).
        fn set_chroma_key(
            self: Pin<&mut VideoDecoder>,
            enabled: bool,
            key_r: u8,
            key_g: u8,
            key_b: u8,
            tolerance: u8,
        );
        /// Seek to a given time (seconds); returns success.
        fn seek(self: Pin<&mut VideoDecoder>, seconds: f64) -> bool;
        /// Get the current playback position in seconds.
        fn position(self: &VideoDecoder) -> f64;
        /// Total video duration in seconds, or 0 if not available.
        fn duration(self: &VideoDecoder) -> f64;
    }

    // ---- NDI Output (cpp/src/ndi_output.cpp) ----
    unsafe extern "C++" {
        include!("core.h");

        type NdiSender;

        /// Create an NDI sender with the given display-name.
        fn new_ndi_sender(name: &str) -> UniquePtr<NdiSender>;
        /// Send one RGBA frame. Returns true if accepted.
        fn send_frame(self: &NdiSender, rgba: &[u8], width: i32, height: i32) -> bool;
    }
}

pub use ffi::*;