use tauri::{AppHandle, State};

use crate::models::Playlist;
use crate::state::{now_millis, save_to_disk, AppState};

#[tauri::command]
pub fn get_playlists(state: State<AppState>) -> Result<Vec<Playlist>, String> {
    state
        .playlists
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_playlist(
    app: AppHandle,
    state: State<AppState>,
    playlist: Playlist,
) -> Result<Playlist, String> {
    let mut guard = state.playlists.lock().map_err(|e| e.to_string())?;
    let mut playlist = playlist;
    match guard.iter_mut().find(|p| p.id == playlist.id) {
        Some(existing) => {
            playlist.created_at = existing.created_at;
            playlist.updated_at = now_millis();
            *existing = playlist.clone();
        }
        None => {
            if playlist.created_at == 0 {
                playlist.created_at = now_millis();
            }
            playlist.updated_at = now_millis();
            guard.push(playlist.clone());
        }
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(playlist)
}

#[tauri::command]
pub fn delete_playlist(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.playlists.lock().map_err(|e| e.to_string())?;
    guard.retain(|p| p.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
