use tauri::{AppHandle, State};

use crate::models::EditShow;
use crate::state::{now_millis, save_to_disk, AppState};

#[tauri::command]
pub fn get_edit_shows(state: State<AppState>) -> Result<Vec<EditShow>, String> {
    state
        .edit_shows
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_edit_show(
    app: AppHandle,
    state: State<AppState>,
    show: EditShow,
) -> Result<EditShow, String> {
    let mut guard = state.edit_shows.lock().map_err(|e| e.to_string())?;
    let mut show = show;
    match guard.iter_mut().find(|s| s.id == show.id) {
        Some(existing) => {
            show.created_at = existing.created_at;
            show.updated_at = now_millis();
            *existing = show.clone();
        }
        None => {
            if show.created_at == 0 {
                show.created_at = now_millis();
            }
            show.updated_at = now_millis();
            guard.push(show.clone());
        }
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(show)
}

#[tauri::command]
pub fn delete_edit_show(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<(), String> {
    let mut guard = state.edit_shows.lock().map_err(|e| e.to_string())?;
    guard.retain(|s| s.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
