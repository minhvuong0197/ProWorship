use tauri::{AppHandle, State};

use crate::models::Prop;
use crate::state::{save_to_disk, AppState};

#[tauri::command]
pub fn get_props(state: State<AppState>) -> Result<Vec<Prop>, String> {
    state
        .props
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_prop(app: AppHandle, state: State<AppState>, prop: Prop) -> Result<Prop, String> {
    let mut guard = state.props.lock().map_err(|e| e.to_string())?;
    match guard.iter_mut().find(|p| p.id == prop.id) {
        Some(existing) => *existing = prop.clone(),
        None => guard.push(prop.clone()),
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(prop)
}

#[tauri::command]
pub fn delete_prop(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.props.lock().map_err(|e| e.to_string())?;
    guard.retain(|p| p.id != id);
    drop(guard);
    save_to_disk(&app, state.inner());
    Ok(())
}
