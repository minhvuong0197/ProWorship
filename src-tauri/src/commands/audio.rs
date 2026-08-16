use std::fs;
use std::path::Path;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::models::{AudioItem, AudioPlaylist};
use crate::state::{media_dir, now_millis, save_to_disk, AppState};

#[tauri::command]
pub fn get_audio_library(state: State<AppState>) -> Result<Vec<AudioItem>, String> {
    state
        .audio
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_audio(
    app: AppHandle,
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Vec<AudioItem>, String> {
    let dir = media_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut imported = Vec::new();
    for p in &paths {
        let src = Path::new(p);
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("audio")
            .to_string();
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp3");
        let dest = dir.join(format!("{}.{}", Uuid::new_v4(), ext));
        fs::copy(src, &dest).map_err(|e| format!("copy {}: {}", p, e))?;
        imported.push(AudioItem {
            id: Uuid::new_v4().to_string(),
            name,
            file_path: dest.to_string_lossy().to_string(),
            duration: None,
            added_at: now_millis(),
        });
    }

    let mut guard = state.audio.lock().map_err(|e| e.to_string())?;
    guard.extend(imported.clone());
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(imported)
}

#[tauri::command]
pub fn delete_audio(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.audio.lock().map_err(|e| e.to_string())?;
    let item = guard.iter().find(|m| m.id == id).cloned();
    guard.retain(|m| m.id != id);
    drop(guard);

    if let Ok(mut pls) = state.audio_playlists.lock() {
        for pl in pls.iter_mut() {
            pl.track_ids.retain(|t| t != &id);
        }
        drop(pls);
    }

    if let Some(item) = item {
        let _ = fs::remove_file(&item.file_path);
    }
    save_to_disk(&app, state.inner());
    Ok(())
}

#[tauri::command]
pub fn get_audio_playlists(state: State<AppState>) -> Result<Vec<AudioPlaylist>, String> {
    state
        .audio_playlists
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_audio_playlist(
    app: AppHandle,
    state: State<AppState>,
    playlist: AudioPlaylist,
) -> Result<AudioPlaylist, String> {
    let mut pl = playlist;
    let mut guard = state.audio_playlists.lock().map_err(|e| e.to_string())?;
    match guard.iter_mut().find(|p| p.id == pl.id) {
        Some(existing) => {
            pl.updated_at = now_millis();
            *existing = pl.clone();
        }
        None => {
            pl.id = Uuid::new_v4().to_string();
            pl.created_at = now_millis();
            pl.updated_at = pl.created_at;
            guard.push(pl.clone());
        }
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(pl)
}

#[tauri::command]
pub fn delete_audio_playlist(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.audio_playlists.lock().map_err(|e| e.to_string())?;
    guard.retain(|p| p.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
