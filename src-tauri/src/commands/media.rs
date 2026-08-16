use std::fs;
use std::path::Path;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::models::MediaItem;
use crate::state::{media_dir, now_millis, save_to_disk, AppState};

fn kind_for_ext(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "tiff" | "avif" => {
            "image".into()
        }
        "mp4" | "webm" | "mov" | "mkv" | "avi" | "m4v" | "wmv" => "video".into(),
        _ => "image".into(),
    }
}

#[tauri::command]
pub fn get_media_library(state: State<AppState>) -> Result<Vec<MediaItem>, String> {
    state
        .media
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_media_dir(app: AppHandle) -> Result<String, String> {
    let dir = media_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_media(
    app: AppHandle,
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Vec<MediaItem>, String> {
    let dir = media_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut imported = Vec::new();
    for p in &paths {
        let src = Path::new(p);
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("media")
            .to_string();
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let dest = dir.join(format!("{}.{}", Uuid::new_v4(), ext));
        fs::copy(src, &dest)
            .map_err(|e| format!("copy {}: {}", p, e))?;
        imported.push(MediaItem {
            id: Uuid::new_v4().to_string(),
            name,
            file_path: dest.to_string_lossy().to_string(),
            kind: kind_for_ext(src),
            added_at: now_millis(),
        });
    }

    let mut guard = state.media.lock().map_err(|e| e.to_string())?;
    guard.extend(imported.clone());
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(imported)
}

#[tauri::command]
pub fn delete_media(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.media.lock().map_err(|e| e.to_string())?;
    let item = guard.iter().find(|m| m.id == id).cloned();
    guard.retain(|m| m.id != id);
    drop(guard);
    if let Some(item) = item {
        let _ = fs::remove_file(&item.file_path);
    }
    save_to_disk(&app, state.inner());
    Ok(())
}
