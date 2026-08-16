use serde::Serialize;

use crate::native::bridge;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVideoInfo {
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub duration: f64,
    pub frame_bytes: usize,
}

/// Decode the first frame of a video file via the C++ Video Engine.
#[tauri::command]
pub fn native_video_probe(path: String, hw_accel: bool) -> Result<NativeVideoInfo, String> {
    let mut decoder = bridge::new_video_decoder(&path, hw_accel);
    if decoder.is_null() {
        return Err(format!("open {}: failed to open/init decoder", path));
    }
    let frame = decoder.pin_mut().decode_frame();
    Ok(NativeVideoInfo {
        width: decoder.width(),
        height: decoder.height(),
        fps: decoder.fps(),
        duration: decoder.duration(),
        frame_bytes: frame.len(),
    })
}

/// Build an NDI sender to validate the SDK loads and a send instance is created.
#[tauri::command]
pub fn native_ndi_probe(name: String) -> Result<(), String> {
    let sender = bridge::new_ndi_sender(&name);
    if sender.is_null() {
        return Err("ndi create: failed to create sender".into());
    }
    let _ = sender;
    Ok(())
}

/// TEMP: log the WebView2/WebGPU capability report collected by the frontend
/// (dev only, removed after Track 2 feasibility is confirmed).
#[tauri::command]
pub fn gpu_probe(report: String) {
    eprintln!("GPU_PROBE {report}");
}