use crate::native::player::{ChromaKey, NativeVideoInfo};
use crate::state::AppState;

/// Open a video in the background decode thread. Reference-counted per path so
/// both the Output and Preview windows can share one decode.
#[tauri::command]
pub fn native_video_play(
    state: tauri::State<AppState>,
    path: String,
    hw_accel: bool,
) -> Result<NativeVideoInfo, String> {
    state.native_player.start(&path, hw_accel)
}

/// Release one reference to the given video. The decode thread stops once all
/// references are gone.
#[tauri::command]
pub fn native_video_stop(state: tauri::State<AppState>, path: String) {
    state.native_player.stop(&path);
}

/// Latest decoded frame as packed binary:
/// `[u64 seq][i32 width][i32 height][u8 format]` + frame bytes.
/// Empty when no frame has been decoded yet.
#[tauri::command]
pub fn native_video_pull(state: tauri::State<AppState>) -> tauri::ipc::Response {
    let bytes = state.native_player.pull().unwrap_or_default();
    tauri::ipc::Response::new(bytes)
}

/// Downscale decoded output to fit within (width, height) preserving aspect.
/// `kind` selects the role: only the Output window ("output") drives the shared
/// decode target; "preview" only falls back when no output target is set.
/// Pass (0,0) to restore source resolution.
#[tauri::command]
pub fn native_video_set_target(state: tauri::State<AppState>, kind: String, width: i32, height: i32) {
    state.native_player.set_target(&kind, width, height);
}

#[tauri::command]
pub fn native_video_set_paused(state: tauri::State<AppState>, paused: bool) {
    state.native_player.set_paused(paused);
}

/// Toggle green-screen (chroma) keying. When enabled the player switches to
/// raw RGBA frames so the alpha channel survives.
#[tauri::command]
pub fn native_video_set_chroma(
    state: tauri::State<AppState>,
    enabled: bool,
    r: u8,
    g: u8,
    b: u8,
    tolerance: u8,
) {
    state.native_player.set_chroma(
        enabled,
        ChromaKey {
            r,
            g,
            b,
            tolerance,
        },
    );
}

#[tauri::command]
pub fn native_video_seek(state: tauri::State<AppState>, seconds: f64) {
    state.native_player.seek(seconds);
}

/// Track 2: switch the frame transport between raw RGBA (WebGPU path) and the
/// legacy JPEG/keyed paths.
#[tauri::command]
pub fn native_video_set_transport(state: tauri::State<AppState>, raw: bool) {
    state.native_player.set_transport(raw);
}