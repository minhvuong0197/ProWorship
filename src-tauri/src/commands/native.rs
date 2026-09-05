use serde::Serialize;
use tauri::State;

use crate::native::bridge;
use crate::state::AppState;

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

/// Bật NDI output: tạo sender, gắn sink vào player để mọi frame đã giải mã
/// tự động được bơm lên NDI (theo resolution decode đang áp dụng — Output
/// window drive target, xem mục 4.3 ARCHITECTURE.md).
#[tauri::command]
pub fn ndi_output_start(state: State<AppState>, name: String) -> Result<(), String> {
    state.ndi.start(&name)?;
    state.native_player.set_ndi_sink(Some(state.ndi.clone()));
    Ok(())
}

/// Đẩy 1 frame RGBA lên NDI output đang bật. Trả về false nếu SDK từ chối frame.
/// (Dùng khi muốn điều khiển tay; khi sink đã gắn vào player thì frame tự động
/// được bơm, không cần gọi lệnh này.)
#[tauri::command]
pub fn ndi_output_send_frame(
    state: State<AppState>,
    width: i32,
    height: i32,
    rgba: Vec<u8>,
) -> Result<bool, String> {
    state.ndi.send_frame(&rgba, width, height)
}

/// Tắt NDI output: gỡ sink khỏi player rồi hủy sender.
#[tauri::command]
pub fn ndi_output_stop(state: State<AppState>) -> Result<(), String> {
    state.native_player.set_ndi_sink(None);
    state.ndi.stop();
    Ok(())
}

/// Kiểm tra NDI output đang bật/tắt.
#[tauri::command]
pub fn ndi_output_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.ndi.is_active())
}

/// Số frame đã được bơm vào NDI sender kể từ lúc bật output.
#[tauri::command]
pub fn ndi_output_frames_sent(state: State<AppState>) -> Result<u64, String> {
    Ok(state.ndi.frames_sent())
}

/// Danh sách nguồn NDI đang phát trên mạng LAN (tên đọc được từ find).
#[tauri::command]
pub fn ndi_input_list_sources() -> Result<Vec<String>, String> {
    Ok(crate::native::ndi_input::NdiInput::list_sources())
}

/// Bật live video input: bắt đầu nhận frame từ nguồn NDI theo tên hiển thị.
#[tauri::command]
pub fn ndi_input_start(state: State<AppState>, name: String) -> Result<(), String> {
    state.ndi_input.start(&name)
}

/// Tắt live video input (hủy receiver, dừng capture loop).
#[tauri::command]
pub fn ndi_input_stop(state: State<AppState>) -> Result<(), String> {
    state.ndi_input.stop();
    Ok(())
}

/// Live input đang bật/tắt?
#[tauri::command]
pub fn ndi_input_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.ndi_input.is_active())
}

/// Frame mới nhất từ live input dạng payload đóng gói giống player pull
/// (xem native/ndi_input.rs). Trả về None nếu chưa có frame nào.
#[tauri::command]
pub fn ndi_input_pull(state: State<AppState>) -> Result<Option<Vec<u8>>, String> {
    Ok(state.ndi_input.pull())
}

/// Tên nguồn đang receive (None nếu đang tắt).
#[tauri::command]
pub fn ndi_input_source(state: State<AppState>) -> Result<Option<String>, String> {
    Ok(state.ndi_input.source())
}

/// TEMP: log the WebView2/WebGPU capability report collected by the frontend
/// (dev only, removed after Track 2 feasibility is confirmed).
#[tauri::command]
pub fn gpu_probe(report: String) {
    eprintln!("GPU_PROBE {report}");
}