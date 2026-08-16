use tauri::{AppHandle, State};

use crate::commands::output::refresh_live_style;
use crate::models::Song;
use crate::state::{now_millis, save_to_disk, AppState};

#[tauri::command]
pub fn get_songs(state: State<AppState>) -> Result<Vec<Song>, String> {
    state
        .songs
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_song(app: AppHandle, state: State<AppState>, song: Song) -> Result<Song, String> {
    let mut guard = state.songs.lock().map_err(|e| e.to_string())?;
    let mut song = song;
    match guard.iter_mut().find(|s| s.id == song.id) {
        Some(existing) => {
            song.created_at = existing.created_at;
            song.updated_at = now_millis();
            *existing = song.clone();
        }
        None => {
            if song.created_at == 0 {
                song.created_at = now_millis();
            }
            song.updated_at = now_millis();
            guard.push(song.clone());
        }
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    refresh_live_style(&app, state.inner());
    Ok(song)
}

#[tauri::command]
pub fn delete_song(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.songs.lock().map_err(|e| e.to_string())?;
    guard.retain(|s| s.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
