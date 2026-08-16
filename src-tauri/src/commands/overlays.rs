use tauri::{AppHandle, State};

use crate::models::Overlay;
use crate::state::{save_to_disk, AppState};

#[tauri::command]
pub fn get_overlays(state: State<AppState>) -> Result<Vec<Overlay>, String> {
    state
        .overlays
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_overlay(
    app: AppHandle,
    state: State<AppState>,
    overlay: Overlay,
) -> Result<Overlay, String> {
    let mut guard = state.overlays.lock().map_err(|e| e.to_string())?;
    match guard.iter_mut().find(|o| o.id == overlay.id) {
        Some(existing) => *existing = overlay.clone(),
        None => guard.push(overlay.clone()),
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(overlay)
}

#[tauri::command]
pub fn delete_overlay(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<(), String> {
    let mut guard = state.overlays.lock().map_err(|e| e.to_string())?;
    guard.retain(|o| o.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
