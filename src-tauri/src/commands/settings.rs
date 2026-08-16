use tauri::{AppHandle, Emitter, State};

use crate::models::AppSettings;
use crate::state::{save_to_disk, AppState};

#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<AppState>) -> Result<AppSettings, String> {
    let needs_pin = state
        .settings
        .lock()
        .map(|s| s.companion_enabled && s.companion_password.trim().is_empty())
        .unwrap_or(false);
    if needs_pin {
        crate::state::ensure_companion_password(&app, &state);
    }
    state
        .settings
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let mut guard = state.settings.lock().map_err(|e| e.to_string())?;
    *guard = settings;
    guard.companion_pin_configured = true;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("settings-update", &payload);
    Ok(payload)
}
