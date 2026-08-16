use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use crate::models::{
    AudioPlayback, CcliLog, LiveSlide, LiveState, PlaylistEntry, Song, Template,
};
use crate::state::{now_millis, save_to_disk, AppState};

#[derive(Serialize, Clone)]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

fn style_from_template(tpl: &Template) -> (Option<String>, Option<u32>, Option<String>, Option<String>, Option<String>) {
    (
        Some(tpl.text_color.clone()),
        Some(tpl.font_size),
        Some(tpl.align.clone()),
        Some(tpl.position.clone()),
        Some(tpl.bg_color.clone()),
    )
}

fn apply_template_to_slide(
    slide: &mut LiveSlide,
    default_tpl: Option<&Template>,
    slide_tpl: Option<&Template>,
    first_tpl: Option<&Template>,
) {
    let mut chosen = slide_tpl.or(default_tpl);
    if first_tpl.is_some() {
        chosen = first_tpl;
    }
    if let Some(tpl) = chosen {
        let (tc, fs, align, pos, bgc) = style_from_template(tpl);
        slide.text_color = tc;
        slide.font_size = fs;
        slide.align = align;
        slide.position = pos;
        slide.bg_color = bgc;
        slide.bg_filter = if tpl.bg_filter.is_empty() {
            None
        } else {
            Some(tpl.bg_filter.clone())
        };
        slide.elements = tpl.elements.clone();
        slide.overrides = tpl.overrides.clone();
    }
}

fn apply_bible_style(
    app: &tauri::AppHandle,
    state: &AppState,
    slide: &mut LiveSlide,
    version: Option<&str>,
) {
    let templates = state.templates.lock().map(|t| t.clone()).unwrap_or_default();
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let version_tpl = crate::bible::bible_version_template_id(app, version)
        .and_then(|id| templates.iter().find(|t| t.id == id));
    let default_tpl = version_tpl.or(default_bible_template_in(&templates, &settings));
    apply_template_to_slide(slide, default_tpl, None, None);
}

fn resolve_slide_order(song: &Song, arrangement_id: Option<&str>) -> Vec<String> {
    if let Some(aid) = arrangement_id {
        if let Some(arr) = song.arrangements.iter().find(|a| &a.id == aid) {
            if !arr.order.is_empty() {
                return arr.order.clone();
            }
        }
    }
    song.slides.iter().map(|s| s.id.clone()).collect()
}

fn slide_from_song(
    song: &Song,
    order: &[String],
    index: usize,
    base: &LiveState,
    default_tpl: Option<&Template>,
    templates: &[Template],
) -> LiveSlide {
    let slide = order
        .get(index)
        .and_then(|id| song.slides.iter().find(|s| &s.id == id))
        .cloned();
    // Ghost background: use the slide's own background, else fall back to the
    // most recent slide in the sequence that has one.
    let background = slide
        .as_ref()
        .and_then(|s| s.background.clone())
        .or_else(|| ghost_background(song, order, index))
        .or_else(|| base.background.clone());
    let mut live_slide = LiveSlide {
        kind: "song".into(),
        title: song.title.clone(),
        text: slide.as_ref().map(|s| s.text.clone()),
        label: slide.as_ref().map(|s| s.label.clone()),
        notes: slide.as_ref().map(|s| s.notes.clone()),
        media_path: None,
        background,
        text_color: None,
        font_size: None,
        align: None,
        position: None,
        bg_color: None,
        bg_filter: None,
        layers: slide.as_ref().map(|s| s.layers.clone()).unwrap_or_default(),
        formatting: slide.as_ref().and_then(|s| s.formatting.clone()),
        elements: Vec::new(),
        overrides: Vec::new(),
        bible_ref: None,
    };
    let song_tpl = song
        .template_id
        .as_ref()
        .and_then(|id| templates.iter().find(|t| &t.id == id));
    let slide_tpl = slide
        .as_ref()
        .and_then(|s| s.template_id.as_ref())
        .and_then(|id| templates.iter().find(|t| &t.id == id));
    let first_tpl = if index == 0 {
        slide_tpl
            .or(song_tpl)
            .or(default_tpl)
            .and_then(|t| t.first_template_id.as_ref())
            .and_then(|id| templates.iter().find(|t| &t.id == id))
    } else {
        None
    };
    apply_template_to_slide(&mut live_slide, song_tpl.or(default_tpl), slide_tpl, first_tpl);
    live_slide
}

// Walks back through the slide sequence to find the background of the most
// recent slide that owns one (ghost propagation through the order).
fn ghost_background(song: &Song, order: &[String], index: usize) -> Option<String> {
    for i in (0..index).rev() {
        if let Some(id) = order.get(i) {
            if let Some(s) = song.slides.iter().find(|s| &s.id == id) {
                if s.background.is_some() {
                    return s.background.clone();
                }
            }
        }
    }
    None
}

fn next_of_song(song: &Song, order: &[String], index: usize) -> (Option<String>, Option<String>) {
    match order.get(index + 1).and_then(|id| song.slides.iter().find(|s| &s.id == id)) {
        Some(next) => (Some(next.text.clone()), Some(next.label.clone())),
        None => (None, None),
    }
}

fn sync_ccli_log(state: &AppState) {
    let (song_id, logged) = {
        let live = state.live.lock().ok();
        match live {
            Some(g) => (g.song_id.clone(), g.last_ccli_song_id.clone()),
            None => (None, None),
        }
    };
    if let Some(sid) = song_id {
        if logged.as_deref() != Some(sid.as_str()) {
            let meta = state
                .songs
                .lock()
                .ok()
                .and_then(|songs| {
                    songs
                        .iter()
                        .find(|s| s.id == sid)
                        .map(|s| (s.title.clone(), s.ccli.clone()))
                });
            if let Some((title, ccli)) = meta {
                if let Ok(mut log) = state.ccli_log.lock() {
                    log.push(CcliLog {
                        id: Uuid::new_v4().to_string(),
                        song_id: sid.clone(),
                        song_title: title,
                        ccli,
                        used_at: now_millis(),
                    });
                }
                if let Ok(mut live) = state.live.lock() {
                    live.last_ccli_song_id = Some(sid);
                }
            }
        }
    }
}

fn mark_entry_started(state: &AppState, playlist_id: &Option<String>, entry_idx: usize) {
    if let Some(pid) = playlist_id {
        if let Ok(mut playlists) = state.playlists.lock() {
            if let Some(p) = playlists.iter_mut().find(|p| &p.id == pid) {
                if let Some(e) = p.entries.get_mut(entry_idx) {
                    e.actual_start_time = Some(now_millis());
                }
            }
        }
    }
}

fn apply_entry_to_live(
    app: &tauri::AppHandle,
    state: &AppState,
    live: &mut LiveState,
    entry: &PlaylistEntry,
    start_index: usize,
    dir: i32,
) {
    let default_tpl = {
        let settings = state.settings.lock().map(|s| s.clone()).ok();
        let templates = state.templates.lock().map(|t| t.clone()).unwrap_or_default();
        settings
            .as_ref()
            .and_then(|s| default_template_in(&templates, s).cloned())
    };
    let templates = state.templates.lock().map(|t| t.clone()).unwrap_or_default();
    let songs = state.songs.lock().map(|s| s.clone()).unwrap_or_default();
    let media = state.media.lock().map(|m| m.clone()).unwrap_or_default();
    let audio = state.audio.lock().map(|a| a.clone()).unwrap_or_default();

    live.song_id = None;
    live.song_slide_index = None;
    live.song_slide_count = None;

    match entry.kind.as_str() {
        "song" => {
            if let Some(song) = songs.iter().find(|s| s.id == entry.ref_id) {
                let order = resolve_slide_order(song, entry.arrangement_id.as_deref());
                let idx = if dir > 0 { 0 } else { order.len().saturating_sub(1) };
                live.current = Some(slide_from_song(song, &order, idx, live, default_tpl.as_ref(), &templates));
                let (nt, nl) = next_of_song(song, &order, idx);
                live.next_text = nt;
                live.next_label = nl;
                live.song_id = Some(song.id.clone());
                live.song_slide_index = Some(idx);
                live.song_slide_count = Some(order.len());
                live.arrangement_id = entry.arrangement_id.clone();
                live.slide_order = Some(order);
            }
        }
        "media" => {
            if let Some(m) = media.iter().find(|x| x.id == entry.ref_id) {
                live.current = Some(LiveSlide {
                    kind: "media".into(),
                    title: m.name.clone(),
                    text: None,
                    label: None,
                    media_path: Some(m.file_path.clone()),
                    background: Some(m.file_path.clone()),
                    notes: None,
                    text_color: None,
                    font_size: None,
                    align: None,
                    position: None,
                    bg_color: None,
                    bg_filter: None,
layers: Vec::new(),
                    elements: Vec::new(),
        overrides: Vec::new(),
                    formatting: None,
                    bible_ref: None,
                });
                live.background = Some(m.file_path.clone());
                live.media_playing = true;
            }
            live.next_text = None;
            live.next_label = None;
            live.arrangement_id = None;
            live.slide_order = None;
        }
        "audio" => {
            if let Some(a) = audio.iter().find(|x| x.id == entry.ref_id) {
                live.audio = Some(AudioPlayback {
                    id: a.id.clone(),
                    file_path: a.file_path.clone(),
                    title: a.name.clone(),
                    playing: true,
                    volume: live.audio.as_ref().map(|x| x.volume).unwrap_or(1.0),
                });
            }
            live.next_text = None;
            live.next_label = None;
            live.arrangement_id = None;
            live.slide_order = None;
        }
        "bible" => {
            live.arrangement_id = None;
            live.slide_order = None;
            let parts: Vec<&str> = entry.ref_id.split('|').collect();
            if parts.len() >= 4 {
                let abbrev = parts[0];
                let chapter = parts[1].parse::<usize>().unwrap_or(1);
                let start = parts[2].parse::<usize>().unwrap_or(0);
                let end = parts[3].parse::<usize>().unwrap_or(start);
                let version = if parts.len() >= 5 && !parts[4].is_empty() {
                    Some(parts[4].to_string())
                } else {
                    None
                };
                if start > 0 {
                    let verses: Vec<usize> = (start..=end).collect();
                    if let Some(slide) = crate::bible::present_bible_selection_version(
                        app,
                        version.clone(),
                        abbrev,
                        chapter,
                        verses,
                    ) {
                        live.current = Some(slide);
                        live.next_text = None;
                        live.next_label = None;
                        live.media_playing = false;
                        live.bible_version = version.clone();
                        if let Some(cur) = live.current.as_mut() {
                            apply_bible_style(app, state, cur, version.as_deref());
                        }
                    }
                }
            }
            if live.current.is_none() {
                live.current = Some(LiveSlide {
                    kind: "blank".into(),
                    title: "Kinh Thánh".into(),
                    text: None,
                    label: None,
                    media_path: None,
                    background: live.background.clone(),
                    notes: None,
                    text_color: None,
                    font_size: None,
                    align: None,
                    position: None,
                    bg_color: None,
                    bg_filter: None,
                    layers: Vec::new(),
                    elements: Vec::new(),
                    overrides: Vec::new(),
                    formatting: None,
                    bible_ref: None,
                });
            }
        }
        _ => {
            live.current = Some(LiveSlide {
                kind: "blank".into(),
                title: "Slide Đen".into(),
                text: None,
                label: None,
                media_path: None,
                background: live.background.clone(),
                notes: None,
                text_color: None,
                font_size: None,
                align: None,
                position: None,
                bg_color: None,
                bg_filter: None,
layers: Vec::new(),
                elements: Vec::new(),
        overrides: Vec::new(),
                formatting: None,
                bible_ref: None,
            });
            live.next_text = None;
            live.next_label = None;
            live.arrangement_id = None;
            live.slide_order = None;
        }
    }
    live.playlist_entry_index = Some(start_index);
    mark_entry_started(state, &live.playlist_id.clone(), start_index);
}

#[tauri::command]
pub fn advance_live(app: AppHandle, state: State<AppState>, dir: i32) -> Result<LiveState, String> {
    let dir = if dir > 0 { 1 } else { -1 };
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;

    if guard.output_locked {
        let payload = guard.clone();
        drop(guard);
        return Ok(payload);
    }

    let songs = state.songs.lock().map(|s| s.clone()).unwrap_or_default();
    let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();

    let song_id = guard.song_id.clone();
    let slide_idx = guard.song_slide_index;
    let playlist_id = guard.playlist_id.clone();
    let entry_idx = guard.playlist_entry_index;

    if let Some(ref_) = guard.current.as_ref().and_then(|c| c.bible_ref.clone()) {
        if let Some(mut slide) = crate::bible::advance_bible_selection(
            &app,
            guard.bible_version.clone(),
            &ref_,
            dir,
        ) {
            apply_bible_style(&app, state.inner(), &mut slide, guard.bible_version.as_deref());
            guard.current = Some(slide);
            guard.next_text = None;
            guard.next_label = None;
            guard.song_id = None;
            guard.song_slide_index = None;
            guard.song_slide_count = None;
            guard.slide_order = None;
            guard.playlist_id = None;
            guard.playlist_entry_index = None;
            let payload = guard.clone();
            drop(guard);
            sync_ccli_log(state.inner());
            save_to_disk(&app, state.inner());
            let _ = app.emit("live-update", &payload);
            return Ok(payload);
        }
    }

    if let (Some(song_id), Some(slide_idx)) = (&song_id, slide_idx) {
        if let Some(song) = songs.iter().find(|s| &s.id == song_id) {
            let order = match &guard.slide_order {
                Some(o) if !o.is_empty() => o.clone(),
                _ => resolve_slide_order(song, guard.arrangement_id.as_deref()),
            };
            let target = slide_idx as i64 + dir as i64;
            if target >= 0 && (target as usize) < order.len() {
                let idx = target as usize;
                let templates = state
                    .templates
                    .lock()
                    .map(|t| t.clone())
                    .unwrap_or_default();
                let default_tpl = default_template_in(&templates, &state.settings.lock().map(|s| s.clone()).unwrap_or_default());
                guard.current = Some(slide_from_song(song, &order, idx, &guard, default_tpl, &templates));
                let (nt, nl) = next_of_song(song, &order, idx);
                guard.next_text = nt;
                guard.next_label = nl;
                guard.song_slide_index = Some(idx);
                guard.song_slide_count = Some(order.len());
                guard.slide_order = Some(order);
                let payload = guard.clone();
                drop(guard);
                save_to_disk(&app, state.inner());
                let _ = app.emit("live-update", &payload);
                return Ok(payload);
            }
            if let (Some(pid), Some(eidx)) = (&playlist_id, entry_idx) {
                if let Some(playlist) = playlists.iter().find(|p| &p.id == pid) {
                    if let Some(next_entry) = move_entry_index(playlist, eidx, dir) {
                        apply_entry_to_live(&app, state.inner(), &mut guard, &playlist.entries[next_entry], next_entry, dir);
                        let payload = guard.clone();
                        drop(guard);
                        sync_ccli_log(state.inner());
                        save_to_disk(&app, state.inner());
                        let _ = app.emit("live-update", &payload);
                        return Ok(payload);
                    }
                }
            }
            let payload = guard.clone();
            drop(guard);
            return Ok(payload);
        }
    }

    if let (Some(pid), Some(eidx)) = (&playlist_id, entry_idx) {
        if let Some(playlist) = playlists.iter().find(|p| &p.id == pid) {
            if let Some(next_entry) = move_entry_index(playlist, eidx, dir) {
                apply_entry_to_live(&app, state.inner(), &mut guard, &playlist.entries[next_entry], next_entry, dir);
            }
        }
    }

    let payload = guard.clone();
    drop(guard);
    sync_ccli_log(state.inner());
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

fn move_entry_index(playlist: &crate::models::Playlist, current: usize, dir: i32) -> Option<usize> {
    let target = current as i64 + dir as i64;
    if target >= 0 && (target as usize) < playlist.entries.len() {
        Some(target as usize)
    } else {
        None
    }
}

fn default_template_in<'a>(templates: &'a [Template], settings: &crate::models::AppSettings) -> Option<&'a Template> {
    settings
        .default_template_id
        .as_ref()
        .and_then(|id| templates.iter().find(|t| &t.id == id))
        .or_else(|| templates.iter().find(|t| t.category == "lyric"))
}

fn default_bible_template_in<'a>(templates: &'a [Template], settings: &crate::models::AppSettings) -> Option<&'a Template> {
    settings
        .default_bible_template_id
        .as_ref()
        .and_then(|id| templates.iter().find(|t| &t.id == id))
        .or_else(|| settings.default_template_id.as_ref().and_then(|id| templates.iter().find(|t| &t.id == id)))
        .or_else(|| templates.iter().find(|t| t.category == "bible"))
}

fn slide_style_key(slide: &LiveSlide) -> String {
    serde_json::json!({
        "text_color": slide.text_color,
        "font_size": slide.font_size,
        "align": slide.align,
        "position": slide.position,
        "bg_color": slide.bg_color,
        "bg_filter": slide.bg_filter,
        "elements": slide.elements,
        "overrides": slide.overrides,
        "text": slide.text,
        "title": slide.title,
        "label": slide.label,
        "notes": slide.notes,
        "layers": slide.layers,
        "formatting": slide.formatting,
    })
    .to_string()
}

/// Re-resolves the style of the currently live slide from the (updated)
/// template library. Emits `live-update` only when the resolved style changed,
/// so editing a template updates every show/slide bound to it on the Output.
pub fn refresh_live_style(app: &AppHandle, state: &AppState) {
    let new_current = {
        let live = match state.live.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let Some(cur) = live.current.clone() else { return };
        if cur.kind == "song" {
            (|| {
                let song_id = live.song_id.as_ref()?;
                let slide_idx = live.song_slide_index?;
                let song = state
                    .songs
                    .lock()
                    .ok()?
                    .iter()
                    .find(|s| &s.id == song_id)
                    .cloned()?;
                let order = match &live.slide_order {
                    Some(o) if !o.is_empty() => o.clone(),
                    _ => resolve_slide_order(&song, live.arrangement_id.as_deref()),
                };
                let idx = slide_idx.min(order.len().saturating_sub(1));
                let templates = state
                    .templates
                    .lock()
                    .map(|t| t.clone())
                    .unwrap_or_default();
                let default_tpl = default_template_in(
                    &templates,
                    &state.settings.lock().map(|s| s.clone()).unwrap_or_default(),
                );
                Some(slide_from_song(&song, &order, idx, &live, default_tpl, &templates))
            })()
        } else if cur.bible_ref.is_some() {
            let mut slide = cur;
            apply_bible_style(app, state, &mut slide, live.bible_version.as_deref());
            Some(slide)
        } else {
            None
        }
    };
    let Some(new_current) = new_current else { return };
    let mut guard = match state.live.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let same = guard
        .current
        .as_ref()
        .map(|c| slide_style_key(c) == slide_style_key(&new_current))
        .unwrap_or(false);
    if same {
        return;
    }
    guard.current = Some(new_current);
    let payload = guard.clone();
    drop(guard);
    let _ = app.emit("live-update", &payload);
}

#[tauri::command]
pub fn set_media_playing(app: AppHandle, state: State<AppState>, playing: bool) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.media_playing = playing;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn set_audio_state(
    app: AppHandle,
    state: State<AppState>,
    playing: Option<bool>,
    volume: Option<f32>,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    if let Some(audio) = guard.audio.as_mut() {
        if let Some(p) = playing {
            audio.playing = p;
        }
        if let Some(v) = volume {
            audio.volume = v.clamp(0.0, 1.0);
        }
    }
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn stop_audio(app: AppHandle, state: State<AppState>) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.audio = None;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn start_countdown(app: AppHandle, state: State<AppState>, seconds: u64) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.countdown_end = Some(now_millis() + seconds.saturating_mul(1000));
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn stop_countdown(app: AppHandle, state: State<AppState>) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.countdown_end = None;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| MonitorInfo {
            name: m.name().map(|s| s.to_string()),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
        })
        .collect())
}

#[tauri::command]
pub fn get_live_state(state: State<AppState>) -> Result<LiveState, String> {
    state
        .live
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ccli_log(state: State<AppState>) -> Result<Vec<CcliLog>, String> {
    state
        .ccli_log
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_live_state(
    app: AppHandle,
    state: State<AppState>,
    live: LiveState,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    *guard = live;
    let payload = guard.clone();
    drop(guard);
    sync_ccli_log(state.inner());
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn set_stage_message(
    app: AppHandle,
    state: State<AppState>,
    message: String,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.stage_message = message;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn clear_live(app: AppHandle, state: State<AppState>) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.current = None;
    guard.next_text = None;
    guard.next_label = None;
    guard.background = None;
    guard.song_id = None;
    guard.song_slide_index = None;
    guard.song_slide_count = None;
    guard.playlist_id = None;
    guard.playlist_entry_index = None;
    guard.audio = None;
    guard.media_playing = true;
    guard.arrangement_id = None;
    guard.slide_order = None;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn set_output_locked(
    app: AppHandle,
    state: State<AppState>,
    locked: bool,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.output_locked = locked;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn refresh_output(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let payload = state.live.lock().map_err(|e| e.to_string())?.clone();
    let _ = app.emit("output-refresh", &payload);
    Ok(())
}

#[tauri::command]
pub fn goto_slide(
    app: AppHandle,
    state: State<AppState>,
    index: usize,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    let songs = state.songs.lock().map(|s| s.clone()).unwrap_or_default();
    let song_id = guard.song_id.clone();
    let slide_idx = guard.song_slide_index;
    if let Some(song) = song_id
        .as_ref()
        .and_then(|sid| songs.iter().find(|s| &s.id == sid))
    {
        let order = match &guard.slide_order {
            Some(o) if !o.is_empty() => o.clone(),
            _ => resolve_slide_order(song, guard.arrangement_id.as_deref()),
        };
        if index < order.len() && slide_idx != Some(index) {
            let templates = state
                .templates
                .lock()
                .map(|t| t.clone())
                .unwrap_or_default();
            let default_tpl = default_template_in(
                &templates,
                &state.settings.lock().map(|s| s.clone()).unwrap_or_default(),
            );
            guard.current = Some(slide_from_song(song, &order, index, &guard, default_tpl, &templates));
            let (nt, nl) = next_of_song(song, &order, index);
            guard.next_text = nt;
            guard.next_label = nl;
            guard.song_slide_index = Some(index);
            guard.song_slide_count = Some(order.len());
            guard.slide_order = Some(order);
        }
    }
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn load_playlist(
    app: AppHandle,
    state: State<AppState>,
    playlist_id: String,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();
    if let Some(playlist) = playlists.iter().find(|p| &p.id == &playlist_id) {
        if let Some(first) = playlist.entries.first().cloned() {
            guard.playlist_id = Some(playlist_id);
            apply_entry_to_live(&app, state.inner(), &mut guard, &first, 0, 1);
        }
    }
    let payload = guard.clone();
    drop(guard);
    sync_ccli_log(state.inner());
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn present_song(
    app: AppHandle,
    state: State<AppState>,
    song_id: String,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.playlist_id = None;
    guard.playlist_entry_index = None;
    let entry = PlaylistEntry {
        id: String::new(),
        kind: "song".into(),
        ref_id: song_id,
        title: String::new(),
        estimated_duration_sec: None,
        actual_start_time: None,
        arrangement_id: None,
        text: None,
    };
    apply_entry_to_live(&app, state.inner(), &mut guard, &entry, 0, 1);
    let payload = guard.clone();
    drop(guard);
    sync_ccli_log(state.inner());
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn goto_playlist_entry(
    app: AppHandle,
    state: State<AppState>,
    playlist_id: String,
    index: usize,
) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();
    if let Some(playlist) = playlists.iter().find(|p| &p.id == &playlist_id) {
        if let Some(entry) = playlist.entries.get(index).cloned() {
            guard.playlist_id = Some(playlist_id);
            guard.playlist_entry_index = Some(index);
            apply_entry_to_live(&app, state.inner(), &mut guard, &entry, index, 1);
        }
    }
    let payload = guard.clone();
    drop(guard);
    sync_ccli_log(state.inner());
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

#[tauri::command]
pub fn start_service_timeline(app: AppHandle, state: State<AppState>) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();
    let pid = guard.playlist_id.clone();
    let total_sec: u64 = playlists
        .iter()
        .find(|p| Some(&p.id) == pid.as_ref())
        .map(|p| p.entries.iter().filter_map(|e| e.estimated_duration_sec).sum())
        .unwrap_or(0);
    if guard.service_started_at.is_none() {
        guard.service_started_at = Some(now_millis());
        guard.service_duration_sec = if total_sec > 0 { Some(total_sec) } else { None };
        let idx = guard.playlist_entry_index;
        drop(guard);
        if let Some(i) = idx {
            mark_entry_started(state.inner(), &Some(pid.unwrap_or_default()), i);
        }
        let guard = state.live.lock().map_err(|e| e.to_string())?;
        let payload = guard.clone();
        drop(guard);
        save_to_disk(&app, state.inner());
        let _ = app.emit("live-update", &payload);
        Ok(payload)
    } else {
        let payload = guard.clone();
        drop(guard);
        Ok(payload)
    }
}

#[tauri::command]
pub fn stop_service_timeline(app: AppHandle, state: State<AppState>) -> Result<LiveState, String> {
    let mut guard = state.live.lock().map_err(|e| e.to_string())?;
    guard.service_started_at = None;
    guard.service_duration_sec = None;
    let payload = guard.clone();
    drop(guard);
    save_to_disk(&app, state.inner());
    let _ = app.emit("live-update", &payload);
    Ok(payload)
}

/// Automatically advances to the next playlist entry when the current entry's
/// estimated duration has elapsed while the service timeline is running.
/// Called periodically by a background thread. No-op when there is no live
/// playlist, the timeline is not running, or the entry has no duration set.
pub fn auto_advance_service(app: &AppHandle, state: &AppState) {
    let now = now_millis();

    let advance_to: Option<usize> = {
        let live = match state.live.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if live.output_locked || live.service_started_at.is_none() {
            return;
        }
        let pid = match &live.playlist_id {
            Some(p) => p.clone(),
            None => return,
        };
        let eidx = match live.playlist_entry_index {
            Some(i) => i,
            None => return,
        };
        let playlists = match state.playlists.lock() {
            Ok(p) => p,
            Err(_) => return,
        };
        let playlist = match playlists.iter().find(|p| p.id == pid) {
            Some(p) => p,
            None => return,
        };
        let entry = match playlist.entries.get(eidx) {
            Some(e) => e,
            None => return,
        };
        match (entry.estimated_duration_sec, entry.actual_start_time) {
            (Some(est), Some(started_at)) if now >= started_at + est * 1000 => {
                if eidx + 1 < playlist.entries.len() {
                    Some(eidx + 1)
                } else {
                    None
                }
            }
            _ => None,
        }
    };

    let Some(next) = advance_to else { return };

    let mut live = match state.live.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let pid = match live.playlist_id.clone() {
        Some(p) => p,
        None => return,
    };
    let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();
    let playlist = match playlists.iter().find(|p| p.id == pid) {
        Some(p) => p,
        None => return,
    };
    let entry = match playlist.entries.get(next) {
        Some(e) => e.clone(),
        None => return,
    };
    apply_entry_to_live(app, state, &mut live, &entry, next, 1);
    let payload = live.clone();
    drop(live);
    sync_ccli_log(state);
    save_to_disk(app, state);
    let _ = app.emit("live-update", &payload);
}

fn resolve_monitor(app: &AppHandle, monitor_name: Option<&str>) -> Option<Monitor> {
    if let Some(name) = monitor_name {
        if let Ok(monitors) = app.available_monitors() {
            if let Some(m) = monitors.iter().find(|m| m.name().map(|s| s.as_str()) == Some(name)) {
                return Some(m.clone());
            }
        }
    }
    app.primary_monitor().ok().flatten()
}

fn emit_window_state(app: &AppHandle, state: &AppState) {
    let (output_open, stage_open) = state
        .windows
        .lock()
        .map(|w| (w.output_open, w.stage_open))
        .unwrap_or((false, false));
    let payload = serde_json::json!({ "output_open": output_open, "stage_open": stage_open });
    let _ = app.emit("windows-update", &payload);
}

fn mark_window_closed(app: &AppHandle, state: &AppState, label: &str) {
    if let Ok(mut w) = state.windows.lock() {
        match label {
            "output" => w.output_open = false,
            "stage" => w.stage_open = false,
            _ => {}
        }
    }
    emit_window_state(app, state);
}

fn watch_window_close(app: &AppHandle, win: &tauri::WebviewWindow) {
    let app2 = app.clone();
    let label = win.label().to_string();
    win.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let state = app2.state::<AppState>();
            mark_window_closed(&app2, &state, &label);
        }
    });
}

#[tauri::command]
pub async fn open_output_window(app: AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    let target = resolve_monitor(&app, monitor_name.as_deref());
    let state = app.state::<AppState>();

    if let Some(win) = app.get_webview_window("output") {
        if let Some(m) = &target {
            let _ = win.set_size(*m.size());
            let _ = win.set_position(*m.position());
        }
        let _ = win.set_fullscreen(true);
        let _ = win.show();
        let _ = win.set_focus();
        if let Ok(mut w) = state.windows.lock() {
            w.output_open = true;
        }
        emit_window_state(&app, &state);
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        "output",
        WebviewUrl::App("output.html".into()),
    )
    .title("Pro WorshipFlow - Output")
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true);

    if let Some(m) = &target {
        let size = m.size().to_logical::<f64>(m.scale_factor());
        let pos = m.position().to_logical::<f64>(m.scale_factor());
        builder = builder.inner_size(size.width, size.height);
        builder = builder.position(pos.x, pos.y);
    }

    if let Ok(win) = builder.build() {
        let _ = win.set_fullscreen(true);
        watch_window_close(&app, &win);
        if let Ok(mut w) = state.windows.lock() {
            w.output_open = true;
        }
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn close_output_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window("output") {
        if win.close().is_err() {
            let _ = win.destroy();
        }
    }
    if let Ok(mut w) = state.windows.lock() {
        w.output_open = false;
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn is_output_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("output").is_some())
}

#[tauri::command]
pub async fn is_stage_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("stage").is_some())
}

#[tauri::command]
pub async fn open_stage_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window("stage") {
        let _ = win.show();
        let _ = win.set_focus();
        if let Ok(mut w) = state.windows.lock() {
            w.stage_open = true;
        }
        emit_window_state(&app, &state);
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        "stage",
        WebviewUrl::App("stage.html".into()),
    )
    .title("Pro WorshipFlow - Stage")
    .inner_size(1280.0, 300.0)
    .build();
    if let Ok(win) = win {
        watch_window_close(&app, &win);
        if let Ok(mut w) = state.windows.lock() {
            w.stage_open = true;
        }
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn close_stage_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window("stage") {
        if win.close().is_err() {
            let _ = win.destroy();
        }
    }
    if let Ok(mut w) = state.windows.lock() {
        w.stage_open = false;
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn open_template_editor_window(app: AppHandle, template_id: Option<String>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("template-editor") {
        let _ = win.show();
        let _ = win.set_focus();
        if let Some(id) = template_id {
            let _ = win.emit("template-editor-open", id);
        }
        return Ok(());
    }
    let mut url = String::from("template-editor.html");
    if let Some(id) = template_id {
        url = format!("template-editor.html?id={}", id);
    }
    let builder = WebviewWindowBuilder::new(
        &app,
        "template-editor",
        WebviewUrl::App(url.into()),
    )
    .title("Pro WorshipFlow - Template Editor")
    .inner_size(1320.0, 840.0)
    .min_inner_size(960.0, 620.0);
    let _ = builder.build();
    Ok(())
}

#[tauri::command]
pub async fn close_template_editor_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("template-editor") {
        if win.close().is_err() {
            let _ = win.destroy();
        }
    }
    Ok(())
}
