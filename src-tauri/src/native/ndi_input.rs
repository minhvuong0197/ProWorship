//! NDI input wrapper: owns the `cxx` `NdiReceiver` in `AppState` and runs a
//! background capture loop so live video from a LAN source (camera, OBS,
//! another ProWorshipCast) can be displayed in the WebView.
//!
//! Data flow: frontend command `ndi_input_start` → `NdiInput` → `cxx` bridge
//! (`bridge.rs`) → `cpp/src/ndi_input.cpp` `NdiReceiver` → NDI SDK
//! (`NDIlib_recv_capture_v2`) → latest JPEG frame in shared state → pulled by
//! the frontend over the `live://` scheme (`ndi_input.pull()`).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::native::bridge;

/// A `cxx` `NdiReceiver` is not `Send` by default; the wrapper marks it as
/// safe to move into the capture thread. It is only ever accessed from that
/// single thread, so this is sound.
struct ReceiverBox(cxx::UniquePtr<bridge::NdiReceiver>);
unsafe impl Send for ReceiverBox {}

/// Latest captured frame shared with the frontend puller.
pub struct LatestInputFrame {
    pub seq: u64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub jpeg: Vec<u8>,
}

pub struct InputShared {
    pub source: String,
    pub latest: Mutex<Option<LatestInputFrame>>,
    pub seq: AtomicU64,
    pub stop: AtomicBool,
}

pub struct ActiveInput {
    pub shared: Arc<InputShared>,
    pub handle: Option<std::thread::JoinHandle<()>>,
}

#[derive(Default)]
pub struct NdiInput {
    active: Mutex<Option<ActiveInput>>,
}

impl NdiInput {
    /// Discover NDI sources currently on the LAN (readable names).
    pub fn list_sources() -> Vec<String> {
        bridge::ndi_list_sources().into_iter().collect()
    }

    /// Start receiving from a source by its readable name. Idempotent-safe:
    /// replaces any active input.
    pub fn start(&self, name: &str) -> Result<(), String> {
        let mut recv = bridge::new_ndi_receiver();
        if recv.is_null() {
            return Err("ndi: failed to create NDI receiver".into());
        }
        if !recv.pin_mut().connect(name) {
            return Err(format!("ndi: không tìm thấy nguồn “{name}” trên mạng"));
        }
        // Tear down any previous input before replacing it.
        self.stop();

        let shared = Arc::new(InputShared {
            source: name.to_string(),
            latest: Mutex::new(None),
            seq: AtomicU64::new(0),
            stop: AtomicBool::new(false),
        });
        let s2 = Arc::clone(&shared);
        let boxed = ReceiverBox(recv);
        let handle = std::thread::spawn(move || capture_loop(boxed, s2));

        let mut g = self.active.lock().map_err(|e| e.to_string())?;
        *g = Some(ActiveInput {
            shared,
            handle: Some(handle),
        });
        Ok(())
    }

    /// Stop receiving (join the capture thread).
    pub fn stop(&self) {
        let taken = {
            let mut g = match self.active.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            g.take().map(|a| {
                a.shared.stop.store(true, Ordering::SeqCst);
                a
            })
        };
        if let Some(a) = taken {
            if let Some(h) = a.handle {
                let _ = h.join();
            }
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Latest captured frame as a packed binary payload matching the player
    /// pull format so the frontend LiveVideo renderer can reuse the same
    /// parsing: `[u64 seq LE][i32 width LE][i32 height LE][u8 format 1=jpeg][f64 fps LE]`
    /// + JPEG bytes. Returns `None` when nothing has been captured yet.
    pub fn pull(&self) -> Option<Vec<u8>> {
        let frame = {
            let g = self.active.lock().ok()?;
            let a = g.as_ref()?;
            let latest = a.shared.latest.lock().ok()?;
            let f = latest.as_ref()?;
            (f.seq, f.width, f.height, f.fps, f.jpeg.clone())
        };
        let (seq, width, height, fps, jpeg) = frame;
        let mut out = Vec::with_capacity(25 + jpeg.len());
        out.extend_from_slice(&seq.to_le_bytes());
        out.extend_from_slice(&(width as i32).to_le_bytes());
        out.extend_from_slice(&(height as i32).to_le_bytes());
        out.push(1); // jpeg
        out.extend_from_slice(&fps.to_le_bytes());
        out.extend_from_slice(&jpeg);
        Some(out)
    }

    pub fn source(&self) -> Option<String> {
        let g = self.active.lock().ok()?;
        g.as_ref().map(|a| a.shared.source.clone())
    }
}

fn capture_loop(mut recv: ReceiverBox, shared: Arc<InputShared>) {
    // Capture up to 30 fps; NDI blocks internally up to 500ms per call.
    let interval = Duration::from_millis(33);
    while !shared.stop.load(Ordering::Relaxed) {
        let t0 = std::time::Instant::now();
        let jpeg = recv.0.pin_mut().capture_jpeg(85);
        if !jpeg.is_empty() {
            let seq = shared.seq.fetch_add(1, Ordering::Relaxed) + 1;
            if let Ok(mut latest) = shared.latest.lock() {
                *latest = Some(LatestInputFrame {
                    seq,
                    width: recv.0.width(),
                    height: recv.0.height(),
                    fps: recv.0.fps(),
                    jpeg: jpeg.into_iter().collect(),
                });
            }
        }
        let elapsed = t0.elapsed();
        if elapsed < interval {
            std::thread::sleep(interval - elapsed);
        }
    }
}