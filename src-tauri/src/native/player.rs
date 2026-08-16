//! Background video player built on the C++ Video Engine.
//!
//! A single decode thread owns the `cxx` decoder and paces frame delivery at
//! the video's native fps. The latest frame is stored in shared state and
//! pulled by the frontend on demand (JPEG by default, raw RGBA for the Track 2
//! WebGPU path, or keyed when chroma is enabled so the alpha mask survives
//! transport). All cross-thread control goes through a `PlayerCtl` mutex; the
//! decoder itself never leaves its thread.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::native::bridge;

/// A `cxx` decoder is not `Send` by default; the wrapper marks the instance as
/// safe to move into the decode thread. The decoder is only ever accessed from
/// that single thread, so this is sound.
struct DecoderBox(cxx::UniquePtr<bridge::VideoDecoder>);
unsafe impl Send for DecoderBox {}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct ChromaKey {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub tolerance: u8,
}

#[derive(Default)]
pub struct PlayerCtl {
    pub paused: bool,
    pub looping: bool,
    pub chroma: Option<ChromaKey>,
    pub seek_to: Option<f64>,
    /// Output downscale target as a bounding box (preserves aspect).
    pub target: Option<(i32, i32)>,
    /// Track 2: when set the decode loop ships raw RGBA (no JPEG encode) so
    /// the frontend can upload straight into a WebGPU texture.
    pub raw_rgba: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoInfo {
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub duration: f64,
}

pub struct LatestFrame {
    pub seq: u64,
    pub width: i32,
    pub height: i32,
    pub format: &'static str,
    pub bytes: Vec<u8>,
}

pub struct PlayerShared {
    pub path: String,
    pub control: Mutex<PlayerCtl>,
    pub latest: Mutex<Option<LatestFrame>>,
    pub seq: AtomicU64,
    pub stop: AtomicBool,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub duration: f64,
}

pub struct ActivePlayer {
    pub shared: Arc<PlayerShared>,
    pub refs: usize,
    pub handle: Option<std::thread::JoinHandle<()>>,
}

#[derive(Default)]
pub struct PlayerManager {
    pub active: Mutex<Option<ActivePlayer>>,
}

impl PlayerManager {
    /// Open a video for playback. Idempotent for the same path (reference
    /// counted) so both the Output and Preview windows can attach without
    /// restarting the decode thread.
    pub fn start(&self, path: &str, hw_accel: bool) -> Result<NativeVideoInfo, String> {
        {
            let mut active = self.active.lock().map_err(|e| e.to_string())?;
            if let Some(p) = active.as_mut() {
                if p.shared.path == path {
                    p.refs += 1;
                    return Ok(NativeVideoInfo {
                        width: p.shared.width,
                        height: p.shared.height,
                        fps: p.shared.fps,
                        duration: p.shared.duration,
                    });
                }
            }
        }
        // Different/no video currently playing: replace it.
        self.stop_all();

        let decoder = bridge::new_video_decoder(path, hw_accel);
        if decoder.is_null() {
            return Err(format!("open {}: failed to init decoder", path));
        }
        let mut decoder = decoder;
        decoder.pin_mut().set_looping(true);
        let width = decoder.width();
        let height = decoder.height();
        let fps = if decoder.fps().is_finite() && decoder.fps() > 0.0 {
            decoder.fps()
        } else {
            30.0
        };
        // Guard against bogus container/stream frame rates that would
        // otherwise disable decode pacing (e.g. 1,000,000 fps).
        let fps = fps.clamp(5.0, 60.0);
        let duration = decoder.duration();

        let shared = Arc::new(PlayerShared {
            path: path.to_string(),
            control: Mutex::new(PlayerCtl {
                looping: true,
                ..Default::default()
            }),
            latest: Mutex::new(None),
            seq: AtomicU64::new(0),
            stop: AtomicBool::new(false),
            width,
            height,
            fps,
            duration,
        });

        let s2 = Arc::clone(&shared);
        let dec_box = DecoderBox(decoder);
        let handle = std::thread::spawn(move || decode_loop(dec_box, s2));

        let info = NativeVideoInfo {
            width,
            height,
            fps,
            duration,
        };
        {
            let mut active = self.active.lock().map_err(|e| e.to_string())?;
            *active = Some(ActivePlayer {
                shared,
                refs: 1,
                handle: Some(handle),
            });
        }
        Ok(info)
    }

    /// Release one reference. The decode thread stops when the last
    /// reference is dropped.
    pub fn stop(&self, path: &str) {
        let mut stop_it = false;
        if let Ok(mut active) = self.active.lock() {
            if let Some(p) = active.as_mut() {
                if p.shared.path == path {
                    p.refs = p.refs.saturating_sub(1);
                    stop_it = p.refs == 0;
                }
            }
        }
        if stop_it {
            self.join_and_clear();
        }
    }

    /// Stop whatever is playing, ignoring the reference count.
    pub fn stop_all(&self) {
        let had = {
            let mut active = match self.active.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            active.take().is_some()
        };
        if had {
            self.join_and_clear();
        }
    }

    /// Take the active player (if any), signal its thread to stop, join it,
    /// and clear the slot. Never holds the lock while joining.
    fn join_and_clear(&self) {
        let taken = {
            let mut active = match self.active.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            active.take().map(|p| {
                p.shared.stop.store(true, Ordering::SeqCst);
                p
            })
        };
        if let Some(p) = taken {
            if let Some(h) = p.handle {
                let _ = h.join();
            }
        }
    }

    fn with_active<R>(&self, f: impl FnOnce(&ActivePlayer) -> R) -> Option<R> {
        let active = self.active.lock().ok()?;
        let p = active.as_ref()?;
        Some(f(p))
    }

    /// Latest decoded frame as a packed binary payload:
    /// `[u64 seq LE][i32 width LE][i32 height LE][u8 format 1=jpeg 2=rgba 3=keyed][f64 fps LE]`
    /// + frame bytes. Format 3 (keyed) payload is
    /// `[u32 color_len LE][color jpeg][u32 alpha_len LE][alpha jpeg]`.
    /// Returns `None` when nothing has been decoded yet.
    pub fn pull(&self) -> Option<Vec<u8>> {
        self.with_active(|p| {
            let latest = p.shared.latest.lock().ok()?;
            let f = latest.as_ref()?;
            let mut out = Vec::with_capacity(25 + f.bytes.len());
            out.extend_from_slice(&f.seq.to_le_bytes());
            out.extend_from_slice(&(f.width as i32).to_le_bytes());
            out.extend_from_slice(&(f.height as i32).to_le_bytes());
out.push(match f.format {
                "jpeg" => 1,
                "keyed" => 3,
                "nv12" => 4,
                _ => 2,
            });
            out.extend_from_slice(&p.shared.fps.to_le_bytes());
            out.extend_from_slice(&f.bytes);
            Some(out)
        })
        .flatten()
    }

    pub fn set_paused(&self, paused: bool) {
        let _ = self.with_active(|p| {
            if let Ok(mut c) = p.shared.control.lock() {
                c.paused = paused;
            }
        });
    }

    /// Downscale output to fit within (width, height), preserving aspect.
    /// Only the Output window (`kind == "output"`) drives the shared decode
    /// target; the Preview window falls back to it when no target is set yet,
    /// so the two windows never fight over the resolution.
    pub fn set_target(&self, kind: &str, width: i32, height: i32) {
        let _ = self.with_active(|p| {
            if let Ok(mut c) = p.shared.control.lock() {
                if kind == "output" {
                    c.target = if width > 0 && height > 0 {
                        Some((width, height))
                    } else {
                        None
                    };
                } else if c.target.is_none() && width > 0 && height > 0 {
                    c.target = Some((width, height));
                }
            }
        });
    }

    pub fn set_chroma(&self, enabled: bool, key: ChromaKey) {
        let _ = self.with_active(|p| {
            if let Ok(mut c) = p.shared.control.lock() {
                c.chroma = if enabled { Some(key) } else { None };
            }
        });
    }

    /// Track 2: switch the frame transport between raw RGBA (WebGPU path) and
    /// the legacy JPEG/keyed paths. Trigger a rebuild for a clean canvas.
    pub fn set_transport(&self, raw: bool) {
        let _ = self.with_active(|p| {
            if let Ok(mut c) = p.shared.control.lock() {
                c.raw_rgba = raw;
            }
        });
    }

    pub fn seek(&self, seconds: f64) {
        let _ = self.with_active(|p| {
            if let Ok(mut c) = p.shared.control.lock() {
                c.seek_to = Some(seconds);
            }
        });
    }
}

fn decode_loop(mut dec: DecoderBox, shared: Arc<PlayerShared>) {
    let interval = Duration::from_secs_f64(1.0 / shared.fps);
    let mut last_chroma: Option<ChromaKey> = None;
    let mut last_target: Option<(i32, i32)> = None;
    let mut out_w = shared.width;
    let mut out_h = shared.height;
// Reused output buffers (avoid allocating a fresh Vec every frame).
    let mut rgba_buf: Vec<u8> = Vec::new();
    let mut jpeg_buf: Vec<u8> = Vec::new();

    while !shared.stop.load(Ordering::Relaxed) {
        let t0 = Instant::now();

        let (seek_to, chroma, paused, target, raw_rgba) = {
            let mut c = match shared.control.lock() {
                Ok(c) => c,
                Err(_) => break,
            };
            (
                c.seek_to.take(),
                c.chroma,
                c.paused,
                c.target,
                c.raw_rgba,
            )
        };

        if let Some(s) = seek_to {
            let _ = dec.0.pin_mut().seek(s);
        }
        if chroma != last_chroma {
            match chroma {
                Some(k) => dec.0.pin_mut().set_chroma_key(true, k.r, k.g, k.b, k.tolerance),
                None => dec.0.pin_mut().set_chroma_key(false, 0, 0, 0, 0),
            }
            last_chroma = chroma;
        }
// Chroma (RGBA/keyed) is transported at a bounded size; regular JPEG
        // follows the canvas target but is never downscaled below 1080p-class
        // so it stays sharp on large/fullscreen windows (the browser does the
// final downscale at draw time). Raw NV12 (Track 2 WebGPU path) is
        // pinned to a transport size; the shader scales it to any window size.
        let applied_target: Option<(i32, i32)> = if raw_rgba {
            // Track 2: raw NV12 transport. Measured: 1080p NV12 (3.1MB) ~65ms
            // fetch (21ms/MB) â€” too slow for 30fps; 720p NV12 (1.38MB) ~20ms
            // (14ms/MB) fits 30fps with margin. The WebGPU shader upscales to
            // any window size, so 720p transport keeps playback smooth.
            Some((1280, 720))
        } else if chroma.is_some() {
            // Bound chroma output to the canvas size, capped at 1280x720 so
            // the color JPEG encode stays fast even on large windows.
            match target {
                Some((tw, th)) => Some((tw.min(1280), th.min(720))),
                None => Some((1280, 720)),
            }
        } else {
            match target {
                Some((tw, th)) => Some((tw.max(1920), th.max(1080))),
                None => None,
            }
        };
        if applied_target != last_target {
            match applied_target {
                Some((tw, th)) => dec.0.pin_mut().set_target_size(tw, th),
                None => dec.0.pin_mut().set_target_size(0, 0),
            }
            last_target = applied_target;
            out_w = dec.0.pin_mut().out_width();
            out_h = dec.0.pin_mut().out_height();
        }

        if paused {
            std::thread::sleep(Duration::from_millis(30));
            continue;
        }

let (bytes, format) = if raw_rgba {
            // Track 2: raw NV12 (Y plane + interleaved UV) straight into the
            // frontend WebGPU YUV textures; the shader converts to RGB.
            let cap = out_w as usize * out_h as usize * 2;
            if rgba_buf.len() < cap {
                rgba_buf.resize(cap, 0);
            }
            let n = dec.0.pin_mut().fill_nv12(&mut rgba_buf);
            (
                if n > 0 {
                    rgba_buf[..n as usize].to_vec()
                } else {
                    Vec::new()
                },
                "nv12",
            )
        } else if chroma.is_some() {
            let cap = out_w as usize * out_h as usize * 4;
            if rgba_buf.len() < cap {
                rgba_buf.resize(cap, 0);
            }
            let mut n = dec.0.pin_mut().fill_keyed_jpeg(&mut rgba_buf, 85);
            if n <= 0 {
                rgba_buf.resize(cap * 2, 0);
                n = dec.0.pin_mut().fill_keyed_jpeg(&mut rgba_buf, 85);
            }
            (if n > 0 { rgba_buf[..n as usize].to_vec() } else { Vec::new() }, "keyed")
        } else {
            let cap = out_w as usize * out_h as usize * 4;
            if jpeg_buf.len() < cap {
                jpeg_buf.resize(cap, 0);
            }
            let n = dec.0.pin_mut().fill_jpeg_frame(&mut jpeg_buf, 85);
            if n > 0 {
                (jpeg_buf[..n as usize].to_vec(), "jpeg")
            } else {
                (Vec::new(), "jpeg")
            }
        };

        if bytes.is_empty() {
            // EOF: the decoder loops itself when enabled; otherwise idle.
            if !shared.control.lock().map(|c| c.looping).unwrap_or(false) {
                std::thread::sleep(Duration::from_millis(50));
            } else {
                std::thread::sleep(Duration::from_millis(10));
            }
            continue;
        }

        let seq = shared.seq.fetch_add(1, Ordering::Relaxed) + 1;
        if let Ok(mut latest) = shared.latest.lock() {
            *latest = Some(LatestFrame {
                seq,
                width: out_w,
                height: out_h,
                format,
                bytes,
            });
        }

        let elapsed = t0.elapsed();
        if elapsed < interval {
            std::thread::sleep(interval - elapsed);
        } else {
            // Slightly behind the target cadence: keep a small gap so frames
            // are not produced in back-to-back bursts.
            std::thread::sleep(Duration::from_millis(2));
        }
}
}
