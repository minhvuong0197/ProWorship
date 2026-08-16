use tauri::{AppHandle, Emitter, State};

use crate::commands::output::refresh_live_style;
use crate::models::Template;
use crate::state::{save_to_disk, AppState};

fn notify_templates_changed(app: &AppHandle, state: &AppState) {
    let list = state.templates.lock().map(|g| g.clone()).unwrap_or_default();
    let _ = app.emit("templates-updated", list);
}

#[tauri::command]
pub fn get_templates(state: State<AppState>) -> Result<Vec<Template>, String> {
    state
        .templates
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_template(
    app: AppHandle,
    state: State<AppState>,
    template: Template,
) -> Result<Template, String> {
    let mut guard = state.templates.lock().map_err(|e| e.to_string())?;
    match guard.iter_mut().find(|t| t.id == template.id) {
        Some(existing) => *existing = template.clone(),
        None => guard.push(template.clone()),
    }
    drop(guard);
    save_to_disk(&app, state.inner());
    refresh_live_style(&app, state.inner());
    notify_templates_changed(&app, state.inner());
    Ok(template)
}

#[tauri::command]
pub fn delete_template(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut guard = state.templates.lock().map_err(|e| e.to_string())?;
    guard.retain(|t| t.id != id);
    drop(guard);
    {
        let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
        if settings.default_template_id.as_deref() == Some(id.as_str()) {
            settings.default_template_id = None;
        }
        if settings.default_bible_template_id.as_deref() == Some(id.as_str()) {
            settings.default_bible_template_id = None;
        }
    }
    save_to_disk(&app, state.inner());
    refresh_live_style(&app, state.inner());
    notify_templates_changed(&app, state.inner());
    Ok(())
}

#[tauri::command]
pub fn restore_default_templates(app: AppHandle, state: State<AppState>) -> Result<Vec<Template>, String> {
    let defaults = crate::builtin_templates::default_templates();
    {
        let mut guard = state.templates.lock().map_err(|e| e.to_string())?;
        guard.clear();
        guard.extend(defaults);
    }
    {
        let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
        settings.default_templates_seeded = true;
        settings.templates_version = crate::builtin_templates::TEMPLATES_VERSION;
    }
    let list = state.templates.lock().map(|g| g.clone()).unwrap_or_default();
    save_to_disk(&app, state.inner());
    refresh_live_style(&app, state.inner());
    notify_templates_changed(&app, state.inner());
    Ok(list)
}
