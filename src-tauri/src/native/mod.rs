//! Native C++ core (Video Engine + NDI Output) bridged via `cxx`.

pub mod bridge;
pub mod ndi;
pub mod player;

#[cfg(test)]
mod tests {
    use super::bridge;

    fn sample_video() -> Option<std::path::PathBuf> {
        let dir = dirs_media()?;
        std::fs::read_dir(dir)
            .ok()?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .find(|p| {
                matches!(p.extension().and_then(|x| x.to_str()), Some("mp4"))
                    && p.metadata().map(|m| m.len() > 1 << 20).unwrap_or(false)
            })
    }

    fn dirs_media() -> Option<std::path::PathBuf> {
        std::env::var("APPDATA")
            .ok()
            .map(|d| std::path::Path::new(&d).join("com.proworshipcast.app").join("media"))
            .filter(|p| p.exists())
    }

    #[test]
    fn video_engine_decodes_first_frame() {
        let Some(path) = sample_video() else {
            eprintln!("SKIP: no mp4 found in media dir");
            return;
        };
        let path = path.to_string_lossy().to_string();
        let mut dec = bridge::new_video_decoder(&path, false);
        assert!(!dec.is_null(), "decoder open failed for {path}");
        let frame = dec.pin_mut().decode_frame();
        assert!(!frame.is_empty(), "decode_frame returned empty frame");
        let expect = dec.width() as usize * dec.height() as usize * 4;
        assert_eq!(frame.len(), expect, "RGBA size mismatch");
        assert!(dec.width() > 0 && dec.height() > 0);
        assert!(dec.duration() > 0.0);
    }

    #[test]
    fn video_engine_frame_timing() {
        let Some(path) = sample_video() else {
            eprintln!("SKIP: no mp4 found in media dir");
            return;
        };
        let path = path.to_string_lossy().to_string();

        let measure = |target: Option<(i32, i32)>, chroma: bool, frames: usize| -> (f64, f64) {
            let mut dec = bridge::new_video_decoder(&path, true);
            assert!(!dec.is_null(), "decoder open failed for {path}");
            dec.pin_mut().set_looping(true);
            if let Some((w, h)) = target {
                dec.pin_mut().set_target_size(w, h);
            }
            let out_w = dec.out_width();
            let out_h = dec.out_height();
            if chroma {
                dec.pin_mut().set_chroma_key(true, 0, 255, 0, 40);
            }
            for _ in 0..2 {
                if chroma {
                    let mut buf = vec![0u8; (out_w * out_h * 4) as usize];
                    let _ = dec.pin_mut().fill_frame(&mut buf);
                } else {
                    let _ = dec.pin_mut().decode_frame_jpeg(85);
                }
            }
            let mut total = 0.0f64;
            let mut n = 0usize;
            for _ in 0..frames {
                let t = std::time::Instant::now();
                if chroma {
                    let mut buf = vec![0u8; (out_w * out_h * 4) as usize];
                    if dec.pin_mut().fill_frame(&mut buf) {
                        n += 1;
                    }
                } else {
                    if !dec.pin_mut().decode_frame_jpeg(85).is_empty() {
                        n += 1;
                    }
                }
                total += t.elapsed().as_secs_f64();
            }
            let avg = total / frames as f64;
            (avg * 1000.0, n as f64 / total)
        };

        let (jpeg_720_ms, jpeg_720_fps) = measure(Some((1280, 720)), false, 30);
        let (jpeg_1080_ms, jpeg_1080_fps) = measure(Some((1920, 1080)), false, 30);
        let (rgba_ms, rgba_fps) = measure(Some((1280, 720)), true, 30);
        let (keyed_ms, keyed_fps, keyed_bytes) = {
            let mut dec = bridge::new_video_decoder(&path, true);
            assert!(!dec.is_null());
            dec.pin_mut().set_looping(true);
            dec.pin_mut().set_chroma_key(true, 0, 255, 0, 40);
            dec.pin_mut().set_target_size(1280, 720);
            let out_w = dec.out_width();
            let out_h = dec.out_height();
            let mut buf = vec![0u8; (out_w * out_h * 4 * 2) as usize];
            for _ in 0..2 {
                let _ = dec.pin_mut().fill_keyed_jpeg(&mut buf, 85);
            }
            let mut total = 0.0f64;
            let mut bytes = 0usize;
            let mut n = 0usize;
            for _ in 0..30 {
                let t = std::time::Instant::now();
                let k = dec.pin_mut().fill_keyed_jpeg(&mut buf, 85);
                if k > 0 {
                    n += 1;
                    bytes += k as usize;
                }
                total += t.elapsed().as_secs_f64();
            }
            let avg = total / 30.0;
            (avg * 1000.0, n as f64 / total, bytes / n.max(1))
        };
        let (fill_ms, fill_fps) = {
            let mut dec = bridge::new_video_decoder(&path, true);
            assert!(!dec.is_null());
            dec.pin_mut().set_looping(true);
            dec.pin_mut().set_target_size(1280, 720);
            let out_w = dec.out_width();
            let out_h = dec.out_height();
            for _ in 0..2 {
                let mut buf = vec![0u8; (out_w * out_h * 4) as usize];
                let _ = dec.pin_mut().fill_frame(&mut buf);
            }
            let mut total = 0.0f64;
            let mut n = 0usize;
            for _ in 0..30 {
                let t = std::time::Instant::now();
                let mut buf = vec![0u8; (out_w * out_h * 4) as usize];
                if dec.pin_mut().fill_frame(&mut buf) {
                    n += 1;
                }
                total += t.elapsed().as_secs_f64();
            }
            let avg = total / 30.0;
            (avg * 1000.0, n as f64 / total)
        };
        let src_w = {
            let mut dec = bridge::new_video_decoder(&path, false);
            dec.width()
        };
        let src_h = {
            let mut dec = bridge::new_video_decoder(&path, false);
            dec.height()
        };

        eprintln!(
            "FRAME TIMING (src {src_w}x{src_h})  jpeg@720p: {:.2}ms/frame ({:.1}fps) | jpeg@1080p: {:.2}ms/frame ({:.1}fps) | chroma-rgba@720p: {:.2}ms/frame ({:.1}fps) | keyed@720p: {:.2}ms/frame ({:.1}fps, ~{:.0}KB) | rgba(no-chroma)@720p: {:.2}ms/frame ({:.1}fps)",
            jpeg_720_ms, jpeg_720_fps, jpeg_1080_ms, jpeg_1080_fps, rgba_ms, rgba_fps, keyed_ms,
            keyed_fps, keyed_bytes as f64 / 1024.0, fill_ms, fill_fps
        );
    }

    #[test]
    fn list_source_resolutions() {
        use std::fs;
        let Some(dir) = dirs_media() else { return };
        let mut rows = Vec::new();
        for e in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("mp4") {
                continue;
            }
            let path = p.to_string_lossy().to_string();
            let dec = bridge::new_video_decoder(&path, false);
            if dec.is_null() {
                continue;
            }
            rows.push(format!(
                "{} {}x{} {:.1}MB",
                p.file_name().unwrap().to_string_lossy(),
                dec.width(),
                dec.height(),
                p.metadata().map(|m| m.len() as f64 / 1048576.0).unwrap_or(0.0)
            ));
        }
        eprintln!("SOURCE LIST: {}", rows.join(" | "));
    }

    #[test]
    fn ndi_sender_creates_instance() {
        // Only runs if the NDI SDK DLL can be located next to the exe.
        let sender = bridge::new_ndi_sender("pwcp-test");
        assert!(!sender.is_null(), "ndi sender creation failed");
    }

    /// A2 integration smoke test: with the NDI sink attached to the player,
    /// decoded frames must be auto-pumped into the NDI sender without any
    /// manual `ndi_output_send_frame` calls.
    #[test]
    fn ndi_auto_pump_sends_frames() {
        use super::ndi::NdiOutput;
        use super::player::PlayerManager;
        use std::sync::Arc;
        use std::time::{Duration, Instant};

        let Some(path) = sample_video() else {
            eprintln!("SKIP: no mp4 found in media dir");
            return;
        };
        let path = path.to_string_lossy().to_string();

        let ndi = Arc::new(NdiOutput::default());
        ndi.start("pwcp-auto-pump-test").expect("ndi sender start failed");

        let mgr = PlayerManager::default();
        mgr.set_ndi_sink(Some(ndi.clone()));
        let info = mgr.start(&path, true).unwrap();
        mgr.set_target("output", 1280, 720);

        let deadline = Instant::now() + Duration::from_secs(3);
        while ndi.frames_sent() == 0 && Instant::now() < deadline {
            let _ = mgr.pull();
            std::thread::sleep(Duration::from_millis(5));
        }

        let sent = ndi.frames_sent();
        assert!(sent > 0, "no frames were auto-pumped into the NDI sender");
        eprintln!(
            "NDI AUTO-PUMP: {sent} frames sent in {:.1}s (fps {:.0}) for source {:.0}fps",
            deadline.elapsed().as_secs_f64(),
            sent as f64 / deadline.elapsed().as_secs_f64().max(0.001),
            info.fps
        );

        mgr.stop_all();
        ndi.stop();
        assert!(!ndi.is_active());
    }

    #[test]
    fn player_pull_pacing() {
        use super::player::{ChromaKey, PlayerManager};
        use std::time::{Duration, Instant};

        let Some(path) = sample_video() else {
            eprintln!("SKIP: no mp4 found in media dir");
            return;
        };
        let path = path.to_string_lossy().to_string();
        let mgr = PlayerManager::default();
        let info = mgr.start(&path, true).unwrap();
        mgr.set_target("output", 1280, 720);

        let collect = |chroma: bool, secs: f64| -> (Vec<f64>, f64) {
            mgr.set_chroma(
                chroma,
                ChromaKey {
                    r: 0,
                    g: 255,
                    b: 0,
                    tolerance: 40,
                },
            );
            let start = Instant::now();
            let mut times = Vec::new();
            let mut t_prev = start;
            let mut seq_prev = 0u64;
            let mut have_first = false;
            while start.elapsed().as_secs_f64() < secs {
                let got = mgr.pull();
                if let Some(buf) = got {
                    if buf.len() > 25 {
                        let seq = u64::from_le_bytes(buf[0..8].try_into().unwrap());
                        if seq != seq_prev {
                            seq_prev = seq;
                            let now = Instant::now();
                            if have_first {
                                times.push((now - t_prev).as_secs_f64() * 1000.0);
                            }
                            have_first = true;
                            t_prev = now;
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            let n = times.len() as f64;
            let mean = if n > 0.0 { times.iter().sum::<f64>() / n } else { 0.0 };
            let var = if n > 0.0 {
                times.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n
            } else {
                0.0
            };
            (times, var.sqrt())
        };

        let (j, jj) = collect(false, 2.0);
        let (c, cj) = collect(true, 2.0);
        let jmean = if j.is_empty() { 0.0 } else { j.iter().sum::<f64>() / j.len() as f64 };
        let cmean = if c.is_empty() { 0.0 } else { c.iter().sum::<f64>() / c.len() as f64 };
        eprintln!(
            "PACING(source {:.0}fps)  chroma OFF: {:.1}fps (avg {:.1}ms, jitter {:.1}ms, {} frames) | chroma ON: {:.1}fps (avg {:.1}ms, jitter {:.1}ms, {} frames)",
            info.fps,
            if jmean > 0.0 { 1000.0 / jmean } else { 0.0 },
            jmean,
            jj,
            j.len(),
            if cmean > 0.0 { 1000.0 / cmean } else { 0.0 },
            cmean,
            cj,
            c.len()
        );
    }
}