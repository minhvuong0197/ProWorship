//! NDI output wrapper: owns the `cxx` `NdiSender` in `AppState` so the
//! frontend can start/stop a network output and push RGBA frames to it.
//!
//! Data flow: Rust command → `NdiOutput` → `cxx` bridge (`bridge.rs`) →
//! `cpp/src/ndi_output.cpp` `NdiSender::send_frame` → NDI SDK
//! (`NDIlib_send_send_video_v2`) → LAN receivers.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::native::bridge;

/// A `cxx` `NdiSender` is not `Send` by default; the wrapper marks it as safe.
/// The sender is only ever accessed under the mutex, so this is sound.
struct NdiBox(cxx::UniquePtr<bridge::NdiSender>);
unsafe impl Send for NdiBox {}

#[derive(Default)]
pub struct NdiOutput {
    sender: Mutex<Option<NdiBox>>,
    /// Total frames accepted by `send_frame` since the last `start()`.
    /// Reset to zero on every `start()`; used by the integration smoke test
    /// and by the frontend status panel.
    frames_sent: AtomicU64,
}

impl NdiOutput {
    /// Create (and remember) an NDI sender. Idempotent-safe: fails if one is
    /// already active.
    pub fn start(&self, name: &str) -> Result<(), String> {
        let mut g = self.sender.lock().map_err(|e| e.to_string())?;
        if g.is_some() {
            return Err("NDI output đang chạy — hãy tắt trước khi bật lại".into());
        }
        let sender = bridge::new_ndi_sender(name);
        if sender.is_null() {
            return Err("ndi: failed to create NDI sender".into());
        }
        self.frames_sent.store(0, Ordering::Relaxed);
        *g = Some(NdiBox(sender));
        Ok(())
    }

    /// Push one RGBA frame to the active sender. Errors if output is off.
    pub fn send_frame(&self, rgba: &[u8], width: i32, height: i32) -> Result<bool, String> {
        let g = self.sender.lock().map_err(|e| e.to_string())?;
        match g.as_ref() {
            Some(b) => {
                let ok = b.0.send_frame(rgba, width, height);
                if ok {
                    self.frames_sent.fetch_add(1, Ordering::Relaxed);
                }
                Ok(ok)
            }
            None => Err("ndi: sender chưa được bật".into()),
        }
    }

    /// Destroy the sender (stop broadcasting).
    pub fn stop(&self) {
        if let Ok(mut g) = self.sender.lock() {
            *g = None;
        }
    }

    pub fn is_active(&self) -> bool {
        self.sender.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Number of frames sent since the sender was started.
    pub fn frames_sent(&self) -> u64 {
        self.frames_sent.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ndi_sender_sends_frame_smoke() {
        let out = NdiOutput::default();
        out.start("pwcp-smoke-test").expect("ndi sender start failed");
        assert!(out.is_active());

        // 16x9 black RGBA frame — the SDK must accept it.
        let (w, h) = (16, 9);
        let rgba = vec![0u8; (w * h * 4) as usize];
        assert!(
            out.send_frame(&rgba, w, h).unwrap_or(false),
            "send_frame returned false"
        );

        // A full-size 1080p frame must also be accepted (regression for the
        // auto-pump path which sends at the applied decode resolution).
        let (w2, h2) = (1920, 1080);
        let rgba2 = vec![0u8; (w2 * h2 * 4) as usize];
        assert!(
            out.send_frame(&rgba2, w2, h2).unwrap_or(false),
            "send_frame(1080p) returned false"
        );
        assert!(out.frames_sent() >= 2, "frames_sent counter did not advance");

        // Double start must be rejected while active.
        assert!(out.start("pwcp-smoke-test-2").is_err());

        out.stop();
        assert!(!out.is_active());
        // Sending while off must error, not panic.
        assert!(out.send_frame(&rgba, w, h).is_err());
    }
}