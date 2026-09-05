use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use crate::models::{
    AudioPlayback, CcliLog, LiveSlide, LiveState, Playlist, PlaylistEntry, Song, Template,
};
use crate::state::{now_millis, save_to_disk, AppState, OutputWindowInfo};

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
        live_source: None,
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
                let has_text = live
                    .current
                    .as_ref()
                    .map(|c| c.kind != "media" && c.text.as_deref().is_some_and(|t| !t.trim().is_empty()))
                    .unwrap_or(false);
                if has_text {
                    // Giữ slide hiện tại (vd câu Kinh Thánh) nhưng đổi nền sang video.
                    if let Some(cur) = live.current.as_mut() {
                        cur.media_path = Some(m.file_path.clone());
                        cur.background = Some(m.file_path.clone());
                    }
                } else {
                    live.current = Some(LiveSlide {
                        kind: "media".into(),
                        title: m.name.clone(),
                        text: None,
                        label: None,
                        media_path: Some(m.file_path.clone()),
                        live_source: None,
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
                }
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
                    if start == end {
                        if let Some(slide) = crate::bible::present_bible_selection_version(
                            app,
                            version.clone(),
                            abbrev,
                            chapter,
                            vec![start],
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
                    } else if let Some(slide) = crate::bible::present_bible_verse_in_range(
                        app,
                        version.clone(),
                        abbrev,
                        chapter,
                        start,
                        start,
                        end,
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
                    live_source: None,
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
                live_source: None,
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
            let payload = guard.clone();
            drop(guard);
            sync_ccli_log(state.inner());
            save_to_disk(&app, state.inner());
            let _ = app.emit("live-update", &payload);
            return Ok(payload);
        }
    }

    let song = song_id
        .as_ref()
        .and_then(|sid| songs.iter().find(|s| &s.id == sid));
    let order = match &guard.slide_order {
        Some(o) if !o.is_empty() => o.clone(),
        _ => song
            .map(|s| resolve_slide_order(s, guard.arrangement_id.as_deref()))
            .unwrap_or_default(),
    };
    let playlist = playlist_id
        .as_ref()
        .and_then(|pid| playlists.iter().find(|p| &p.id == pid));

    match plan_advance(dir, song, &order, slide_idx, playlist, entry_idx) {
        AdvanceTarget::Slide { idx } => {
            let templates = state
                .templates
                .lock()
                .map(|t| t.clone())
                .unwrap_or_default();
            let default_tpl = default_template_in(
                &templates,
                &state.settings.lock().map(|s| s.clone()).unwrap_or_default(),
            );
            let Some(song) = song else {
                let payload = guard.clone();
                drop(guard);
                return Ok(payload);
            };
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
            Ok(payload)
        }
        AdvanceTarget::Entry { entry_idx } => {
            let Some(playlist) = playlist else {
                let payload = guard.clone();
                drop(guard);
                return Ok(payload);
            };
            apply_entry_to_live(
                &app,
                state.inner(),
                &mut guard,
                &playlist.entries[entry_idx],
                entry_idx,
                dir,
            );
            let payload = guard.clone();
            drop(guard);
            sync_ccli_log(state.inner());
            save_to_disk(&app, state.inner());
            let _ = app.emit("live-update", &payload);
            Ok(payload)
        }
        AdvanceTarget::Stay => {
            // Hết slide trong bài hoặc hết playlist → dừng, giữ nguyên trạng thái.
            let payload = guard.clone();
            drop(guard);
            Ok(payload)
        }
    }
}

/// Quyết định "đi tiếp" cho `advance_live`: giữ trong bài hát nếu còn slide,
/// nhảy sang playlist item kế nếu hết bài, dừng nếu hết playlist. Hàm thuần —
/// được test độc lập với Tauri.
#[derive(Debug)]
enum AdvanceTarget {
    Slide { idx: usize },
    Entry { entry_idx: usize },
    Stay,
}

fn plan_advance(
    dir: i32,
    song: Option<&Song>,
    order: &[String],
    slide_idx: Option<usize>,
    playlist: Option<&Playlist>,
    entry_idx: Option<usize>,
) -> AdvanceTarget {
    let dir = if dir > 0 { 1 } else { -1 };
    if let (Some(_song), Some(idx)) = (song, slide_idx) {
        if !order.is_empty() {
            let target = idx as i64 + dir as i64;
            if target >= 0 && (target as usize) < order.len() {
                return AdvanceTarget::Slide { idx: target as usize };
            }
        }
        // Hết slide trong bài → nhảy sang playlist item kế nếu có.
        if let (Some(playlist), Some(eidx)) = (playlist, entry_idx) {
            if let Some(next) = move_entry_index(playlist, eidx, dir) {
                return AdvanceTarget::Entry { entry_idx: next };
            }
        }
        return AdvanceTarget::Stay;
    }
    // Không phải bài hát (media/blank/bible…) → đi tiếp theo playlist.
    if let (Some(playlist), Some(eidx)) = (playlist, entry_idx) {
        if let Some(next) = move_entry_index(playlist, eidx, dir) {
            return AdvanceTarget::Entry { entry_idx: next };
        }
    }
    AdvanceTarget::Stay
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

/// Thuần: áp dụng "goto slide" lên `live`. Trả về `true` khi slide thực sự
/// thay đổi (index hợp lệ và khác slide hiện tại) — test độc lập với Tauri.
fn apply_goto_slide(
    live: &mut LiveState,
    song: &Song,
    order: &[String],
    index: usize,
    default_tpl: Option<&Template>,
    templates: &[Template],
) -> bool {
    if index >= order.len() || live.song_slide_index == Some(index) {
        return false;
    }
    live.current = Some(slide_from_song(song, order, index, live, default_tpl, templates));
    let (nt, nl) = next_of_song(song, order, index);
    live.next_text = nt;
    live.next_label = nl;
    live.song_slide_index = Some(index);
    live.song_slide_count = Some(order.len());
    live.slide_order = Some(order.to_vec());
    true
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
    if let Some(song) = song_id
        .as_ref()
        .and_then(|sid| songs.iter().find(|s| &s.id == sid))
    {
        let order = match &guard.slide_order {
            Some(o) if !o.is_empty() => o.clone(),
            _ => resolve_slide_order(song, guard.arrangement_id.as_deref()),
        };
        let templates = state
            .templates
            .lock()
            .map(|t| t.clone())
            .unwrap_or_default();
        let default_tpl = default_template_in(
            &templates,
            &state.settings.lock().map(|s| s.clone()).unwrap_or_default(),
        );
        apply_goto_slide(&mut guard, song, &order, index, default_tpl, &templates);
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

/// Thuần: quyết định của `goto_playlist_entry` — `Some(index)` nếu playlist
/// tồn tại và có entry tại index, `None` nếu không.
fn plan_goto_entry(playlists: &[Playlist], playlist_id: &str, index: usize) -> Option<usize> {
    playlists
        .iter()
        .find(|p| p.id == playlist_id)
        .and_then(|p| p.entries.get(index))
        .map(|_| index)
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
    if let Some(idx) = plan_goto_entry(&playlists, &playlist_id, index) {
        if let Some(playlist) = playlists.iter().find(|p| &p.id == &playlist_id) {
            if let Some(entry) = playlist.entries.get(idx).cloned() {
                guard.playlist_id = Some(playlist_id);
                guard.playlist_entry_index = Some(idx);
                apply_entry_to_live(&app, state.inner(), &mut guard, &entry, idx, 1);
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
/// Thuần: quyết định của `auto_advance_service` — trả về index entry kế nếu
/// entry hiện tại đã hết thời lượng ước tính, `None` nếu chưa tới hoặc không
/// áp dụng (chưa bắt đầu service, đang khoá output, không có playlist/entry).
fn plan_auto_advance(
    now: u64,
    output_locked: bool,
    service_started_at: Option<u64>,
    playlist_id: Option<&str>,
    playlist_entry_index: Option<usize>,
    entries_len: usize,
    entry: Option<(Option<u64>, Option<u64>)>,
) -> Option<usize> {
    if output_locked || service_started_at.is_none() {
        return None;
    }
    let eidx = playlist_entry_index?;
    playlist_id?;
    let (est, started_at) = entry?;
    let est = est?;
    let started_at = started_at?;
    if now < started_at + est * 1000 {
        return None;
    }
    if eidx + 1 < entries_len {
        Some(eidx + 1)
    } else {
        None
    }
}

pub fn auto_advance_service(app: &AppHandle, state: &AppState) {
    let now = now_millis();

    let advance_to: Option<usize> = {
        let live = match state.live.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let pid = live.playlist_id.clone();
        let eidx = live.playlist_entry_index;
        let entries_len = {
            let playlists = match state.playlists.lock() {
                Ok(p) => p,
                Err(_) => return,
            };
            pid.as_ref()
                .and_then(|p| playlists.iter().find(|pl| pl.id == *p))
                .map(|pl| pl.entries.len())
                .unwrap_or(0)
        };
        let entry = {
            let playlists = state.playlists.lock().map(|p| p.clone()).unwrap_or_default();
            pid.as_ref()
                .and_then(|p| playlists.iter().find(|pl| pl.id == *p))
                .and_then(|pl| pl.entries.get(eidx?))
                .map(|e| (e.estimated_duration_sec, e.actual_start_time))
        };
        plan_auto_advance(
            now,
            live.output_locked,
            live.service_started_at,
            pid.as_deref(),
            eidx,
            entries_len,
            entry,
        )
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
    let (output_open, stage_open, outputs) = state
        .windows
        .lock()
        .map(|w| (w.output_open, w.stage_open, w.outputs.clone()))
        .unwrap_or((false, false, Vec::new()));
    let payload = serde_json::json!({
        "output_open": output_open,
        "stage_open": stage_open,
        "outputs": outputs,
    });
    let _ = app.emit("windows-update", &payload);
}

fn upsert_output(w: &mut crate::state::WindowState, label: &str, monitor: Option<String>) {
    if let Some(existing) = w.outputs.iter_mut().find(|o| o.label == label) {
        existing.monitor = monitor;
    } else {
        w.outputs.push(OutputWindowInfo {
            label: label.to_string(),
            monitor,
        });
    }
}

fn mark_window_closed(app: &AppHandle, state: &AppState, label: &str) {
    if let Ok(mut w) = state.windows.lock() {
        match label {
            "output" => w.output_open = false,
            "stage" => w.stage_open = false,
            _ => {}
        }
        if label == "output" || label.starts_with("output-") {
            w.outputs.retain(|o| o.label != label);
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

/// Mở một cửa sổ Output (primary "output" hoặc phụ "output-N") trên monitor
/// được chọn. Tất cả cùng trỏ tới `output.html` và cùng render `LiveState` —
/// tức là "clone" nội dung trình chiếu ra nhiều màn hình.
fn open_output_on_label(
    app: &AppHandle,
    label: &str,
    monitor_name: Option<String>,
) -> Result<(), String> {
    let target = resolve_monitor(app, monitor_name.as_deref());
    let state = app.state::<AppState>();

    if let Some(win) = app.get_webview_window(label) {
        if let Some(m) = &target {
            let _ = win.set_size(*m.size());
            let _ = win.set_position(*m.position());
        }
        let _ = win.set_fullscreen(true);
        let _ = win.show();
        let _ = win.set_focus();
        if let Ok(mut w) = state.windows.lock() {
            if label == "output" {
                w.output_open = true;
            }
            upsert_output(&mut w, label, monitor_name);
        }
        emit_window_state(&app, &state);
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        app,
        label,
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
            if label == "output" {
                w.output_open = true;
            }
            upsert_output(&mut w, label, monitor_name);
        }
    }
    emit_window_state(&app, &state);
    Ok(())
}

/// Nhãn cửa sổ Output phụ kế tiếp chưa bị chiếm ("output-2", "output-3", …).
fn next_output_label(app: &AppHandle, state: &AppState) -> String {
    let used: Vec<String> = state
        .windows
        .lock()
        .map(|w| w.outputs.iter().map(|o| o.label.clone()).collect())
        .unwrap_or_default();
    let mut i = 2u32;
    loop {
        let label = format!("output-{i}");
        let taken = used.iter().any(|u| u == &label)
            || app.get_webview_window(&label).is_some();
        if !taken {
            return label;
        }
        i += 1;
    }
}

#[tauri::command]
pub async fn open_output_window(app: AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    open_output_on_label(&app, "output", monitor_name)
}

#[tauri::command]
pub async fn open_extra_output_window(
    app: AppHandle,
    monitor_name: Option<String>,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let label = next_output_label(&app, &state);
    open_output_on_label(&app, &label, monitor_name)?;
    Ok(label)
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
        w.outputs.retain(|o| o.label != "output");
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn close_output_window_by_label(app: AppHandle, label: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window(&label) {
        if win.close().is_err() {
            let _ = win.destroy();
        }
    }
    if let Ok(mut w) = state.windows.lock() {
        if label == "output" {
            w.output_open = false;
        }
        w.outputs.retain(|o| o.label != label);
    }
    emit_window_state(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn list_output_windows(app: AppHandle) -> Result<Vec<OutputWindowInfo>, String> {
    let state = app.state::<AppState>();
    state
        .windows
        .lock()
        .map(|w| w.outputs.clone())
        .map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{LiveSlide, LiveState, Playlist, PlaylistEntry, Song, SongSlide, Template};

    fn slide(id: &str) -> SongSlide {
        SongSlide {
            id: id.into(),
            label: id.to_uppercase(),
            text: format!("text-{id}"),
            notes: String::new(),
            template_id: None,
            layers: Vec::new(),
            formatting: None,
            background: None,
        }
    }

    fn song(id: &str, slide_ids: &[&str]) -> Song {
        Song {
            id: id.into(),
            title: id.into(),
            artist: String::new(),
            key: String::new(),
            ccli: String::new(),
            copyright: String::new(),
            slides: slide_ids.iter().map(|s| slide(s)).collect(),
            arrangements: Vec::new(),
            template_id: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn entry(id: &str) -> PlaylistEntry {
        PlaylistEntry {
            id: id.into(),
            kind: "song".into(),
            ref_id: id.into(),
            title: id.into(),
            estimated_duration_sec: None,
            actual_start_time: None,
            arrangement_id: None,
            text: None,
        }
    }

    fn playlist(id: &str, entry_ids: &[&str]) -> Playlist {
        Playlist {
            id: id.into(),
            name: id.into(),
            entries: entry_ids.iter().map(|e| entry(e)).collect(),
            created_at: 0,
            updated_at: 0,
        }
    }

    fn order(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn forward_within_song_advances_slide() {
        let s = song("s1", &["a", "b", "c"]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(1, Some(&s), &order(&["a", "b", "c"]), Some(1), Some(&p), Some(0)) {
            AdvanceTarget::Slide { idx } => assert_eq!(idx, 2),
            other => panic!("expected Slide, got {other:?}"),
        }
    }

    #[test]
    fn backward_within_song_advances_slide() {
        let s = song("s1", &["a", "b", "c"]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(-1, Some(&s), &order(&["a", "b", "c"]), Some(1), Some(&p), Some(0)) {
            AdvanceTarget::Slide { idx } => assert_eq!(idx, 0),
            other => panic!("expected Slide, got {other:?}"),
        }
    }

    #[test]
    fn forward_at_song_end_jumps_to_next_playlist_entry() {
        let s = song("s1", &["a", "b", "c"]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(1, Some(&s), &order(&["a", "b", "c"]), Some(2), Some(&p), Some(0)) {
            AdvanceTarget::Entry { entry_idx } => assert_eq!(entry_idx, 1),
            other => panic!("expected Entry, got {other:?}"),
        }
    }

    #[test]
    fn backward_at_song_start_jumps_to_previous_playlist_entry() {
        let s = song("s1", &["a", "b"]);
        let p = playlist("p1", &["s0", "s1"]);
        match plan_advance(-1, Some(&s), &order(&["a", "b"]), Some(0), Some(&p), Some(1)) {
            AdvanceTarget::Entry { entry_idx } => assert_eq!(entry_idx, 0),
            other => panic!("expected Entry, got {other:?}"),
        }
    }

    #[test]
    fn forward_at_last_slide_of_last_entry_stays() {
        let s = song("s2", &["a", "b"]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(1, Some(&s), &order(&["a", "b"]), Some(1), Some(&p), Some(1)) {
            AdvanceTarget::Stay => {}
            other => panic!("expected Stay, got {other:?}"),
        }
    }

    #[test]
    fn backward_at_first_slide_of_first_entry_stays() {
        let s = song("s1", &["a", "b"]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(-1, Some(&s), &order(&["a", "b"]), Some(0), Some(&p), Some(0)) {
            AdvanceTarget::Stay => {}
            other => panic!("expected Stay, got {other:?}"),
        }
    }

    #[test]
    fn non_song_entry_advances_to_next_playlist_entry() {
        let p = playlist("p1", &["media1", "song1"]);
        match plan_advance(1, None, &[], None, Some(&p), Some(0)) {
            AdvanceTarget::Entry { entry_idx } => assert_eq!(entry_idx, 1),
            other => panic!("expected Entry, got {other:?}"),
        }
    }

    #[test]
    fn non_song_last_entry_stays() {
        let p = playlist("p1", &["media1"]);
        match plan_advance(1, None, &[], None, Some(&p), Some(0)) {
            AdvanceTarget::Stay => {}
            other => panic!("expected Stay, got {other:?}"),
        }
    }

    #[test]
    fn no_playlist_at_all_stays() {
        match plan_advance(1, None, &[], None, None, None) {
            AdvanceTarget::Stay => {}
            other => panic!("expected Stay, got {other:?}"),
        }
    }

    #[test]
    fn empty_order_skips_slide_and_tries_entry() {
        let s = song("s1", &[]);
        let p = playlist("p1", &["s1", "s2"]);
        match plan_advance(1, Some(&s), &[], Some(0), Some(&p), Some(0)) {
            AdvanceTarget::Entry { entry_idx } => assert_eq!(entry_idx, 1),
            other => panic!("expected Entry, got {other:?}"),
        }
    }

    fn live_slide(kind: &str) -> LiveSlide {
        LiveSlide {
            kind: kind.into(),
            title: String::new(),
            text: None,
            label: None,
            media_path: None,
            live_source: None,
            background: None,
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
        }
    }

    fn live_state() -> LiveState {
        LiveState::default()
    }

    fn tpl(id: &str, category: &str, first_template_id: Option<&str>) -> Template {
        Template {
            id: id.into(),
            name: id.into(),
            category: category.into(),
            bg_color: "white".into(),
            text_color: "black".into(),
            font_size: 40,
            align: "center".into(),
            position: "center".into(),
            bg_filter: "blur".into(),
            elements: Vec::new(),
            overrides: Vec::new(),
            first_template_id: first_template_id.map(|s| s.into()),
        }
    }

    fn tpl_plain(id: &str, category: &str) -> Template {
        Template {
            id: id.into(),
            name: id.into(),
            category: category.into(),
            bg_color: String::new(),
            text_color: String::new(),
            font_size: 0,
            align: String::new(),
            position: String::new(),
            bg_filter: String::new(),
            elements: Vec::new(),
            overrides: Vec::new(),
            first_template_id: None,
        }
    }

    // ---- apply_goto_slide ----

    #[test]
    fn goto_slide_valid_index_changes_slide() {
        let s = song("s1", &["a", "b", "c"]);
        let order = order(&["a", "b", "c"]);
        let mut live = live_state();
        live.song_slide_index = Some(0);
        let changed = apply_goto_slide(&mut live, &s, &order, 2, None, &[]);
        assert!(changed);
        assert_eq!(live.song_slide_index, Some(2));
        assert_eq!(live.song_slide_count, Some(3));
        assert!(live.current.as_ref().unwrap().text.as_deref() == Some("text-c"));
        assert_eq!(live.next_text.as_deref(), None); // last slide
    }

    #[test]
    fn goto_slide_same_index_no_change() {
        let s = song("s1", &["a", "b", "c"]);
        let order = order(&["a", "b", "c"]);
        let mut live = live_state();
        live.song_slide_index = Some(1);
        let changed = apply_goto_slide(&mut live, &s, &order, 1, None, &[]);
        assert!(!changed);
        assert_eq!(live.song_slide_index, Some(1));
    }

    #[test]
    fn goto_slide_out_of_bounds_no_change() {
        let s = song("s1", &["a", "b", "c"]);
        let order = order(&["a", "b", "c"]);
        let mut live = live_state();
        live.song_slide_index = Some(0);
        let changed = apply_goto_slide(&mut live, &s, &order, 5, None, &[]);
        assert!(!changed);
        assert_eq!(live.song_slide_index, Some(0));
    }

    #[test]
    fn goto_slide_empty_order_no_change() {
        let s = song("s1", &[]);
        let mut live = live_state();
        let changed = apply_goto_slide(&mut live, &s, &[], 0, None, &[]);
        assert!(!changed);
    }

    // ---- apply_template_to_slide ----

    #[test]
    fn template_slide_tpl_beats_default() {
        let default = tpl("d", "lyric", None);
        let slide_tpl = tpl("s", "lyric", None);
        let mut slide = live_slide("song");
        apply_template_to_slide(&mut slide, Some(&default), Some(&slide_tpl), None);
        assert_eq!(slide.text_color.as_deref(), Some("black"));
        assert_eq!(slide.bg_color.as_deref(), Some("white"));
    }

    #[test]
    fn template_default_used_when_no_slide_tpl() {
        let default = tpl("d", "lyric", None);
        let mut slide = live_slide("song");
        apply_template_to_slide(&mut slide, Some(&default), None, None);
        assert_eq!(slide.text_color.as_deref(), Some("black"));
        assert_eq!(slide.font_size, Some(40));
    }

    #[test]
    fn template_first_tpl_overrides_all() {
        let default = tpl("d", "lyric", Some("first"));
        let slide_tpl = tpl("s", "lyric", None);
        let first = tpl("first", "lyric", None);
        let mut slide = live_slide("song");
        apply_template_to_slide(&mut slide, Some(&default), Some(&slide_tpl), Some(&first));
        assert_eq!(slide.text_color.as_deref(), Some("black"));
    }

    #[test]
    fn template_empty_bg_filter_becomes_none() {
        let t = tpl_plain("p", "lyric");
        let mut slide = live_slide("song");
        apply_template_to_slide(&mut slide, Some(&t), None, None);
        assert_eq!(slide.bg_filter, None);
    }

    #[test]
    fn template_no_template_no_change() {
        let mut slide = live_slide("song");
        slide.text_color = Some("red".into());
        apply_template_to_slide(&mut slide, None, None, None);
        assert_eq!(slide.text_color.as_deref(), Some("red"));
    }

    // ---- plan_goto_entry ----

    #[test]
    fn goto_entry_valid_index() {
        let p = playlist("p1", &["s1", "s2"]);
        assert_eq!(plan_goto_entry(&[p.clone()], "p1", 1), Some(1));
    }

    #[test]
    fn goto_entry_unknown_playlist_none() {
        let p = playlist("p1", &["s1", "s2"]);
        assert_eq!(plan_goto_entry(&[p.clone()], "nope", 0), None);
    }

    #[test]
    fn goto_entry_out_of_range_none() {
        let p = playlist("p1", &["s1", "s2"]);
        assert_eq!(plan_goto_entry(&[p.clone()], "p1", 9), None);
    }

    #[test]
    fn goto_entry_empty_playlist_none() {
        let p = playlist("p1", &[]);
        assert_eq!(plan_goto_entry(&[p], "p1", 0), None);
    }

    // ---- plan_auto_advance ----

    fn timed_entry(id: &str, est: Option<u64>, started: Option<u64>) -> PlaylistEntry {
        PlaylistEntry {
            id: id.into(),
            kind: "song".into(),
            ref_id: id.into(),
            title: id.into(),
            estimated_duration_sec: est,
            actual_start_time: started,
            arrangement_id: None,
            text: None,
        }
    }

    #[test]
    fn auto_advance_not_started_none() {
        let now = 100_000;
        assert_eq!(
            plan_auto_advance(now, false, None, Some("p"), Some(0), 2, None),
            None
        );
    }

    #[test]
    fn auto_advance_locked_none() {
        let now = 100_000;
        assert_eq!(
            plan_auto_advance(now, true, Some(0), Some("p"), Some(0), 2, None),
            None
        );
    }

    #[test]
    fn auto_advance_not_elapsed_none() {
        let now = 5_000;
        let e = timed_entry("s1", Some(10), Some(0));
        assert_eq!(
            plan_auto_advance(now, false, Some(0), Some("p"), Some(0), 2, Some((e.estimated_duration_sec, e.actual_start_time))),
            None
        );
    }

    #[test]
    fn auto_advance_elapsed_advances() {
        let now = 11_000;
        let e = timed_entry("s1", Some(10), Some(0));
        assert_eq!(
            plan_auto_advance(now, false, Some(0), Some("p"), Some(0), 2, Some((e.estimated_duration_sec, e.actual_start_time))),
            Some(1)
        );
    }

    #[test]
    fn auto_advance_last_entry_none() {
        let now = 100_000;
        let e = timed_entry("s2", Some(10), Some(0));
        assert_eq!(
            plan_auto_advance(now, false, Some(0), Some("p"), Some(1), 2, Some((e.estimated_duration_sec, e.actual_start_time))),
            None
        );
    }

    #[test]
    fn auto_advance_missing_entry_none() {
        let now = 100_000;
        assert_eq!(
            plan_auto_advance(now, false, Some(0), Some("p"), Some(0), 2, None),
            None
        );
    }

    #[test]
    fn auto_advance_missing_start_time_none() {
        let now = 100_000;
        let e = timed_entry("s1", Some(10), None);
        assert_eq!(
            plan_auto_advance(now, false, Some(0), Some("p"), Some(0), 2, Some((e.estimated_duration_sec, e.actual_start_time))),
            None
        );
    }

    #[test]
    fn auto_advance_no_playlist_none() {
        let now = 100_000;
        let e = timed_entry("s1", Some(10), Some(0));
        assert_eq!(
            plan_auto_advance(now, false, Some(0), None, Some(0), 2, Some((e.estimated_duration_sec, e.actual_start_time))),
            None
        );
    }
}
