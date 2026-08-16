use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::models::{
    AppSettings, AudioItem, AudioPlaylist, CcliLog, EditShow, LiveState, MediaItem, Overlay,
    Playlist, Prop, Song, Template,
};
use crate::native::player::PlayerManager;

#[derive(Default, Serialize, Deserialize)]
pub struct PersistedData {
    #[serde(default)]
    pub songs: Vec<Song>,
    #[serde(default)]
    pub media: Vec<MediaItem>,
    #[serde(default)]
    pub audio: Vec<AudioItem>,
    #[serde(default)]
    pub audio_playlists: Vec<AudioPlaylist>,
    #[serde(default)]
    pub playlists: Vec<Playlist>,
    #[serde(default)]
    pub templates: Vec<Template>,
    #[serde(default)]
    pub props: Vec<Prop>,
    #[serde(default)]
    pub overlays: Vec<Overlay>,
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default)]
    pub live: LiveState,
    #[serde(default)]
    pub ccli_log: Vec<CcliLog>,
    #[serde(default)]
    pub edit_shows: Vec<EditShow>,
}

#[derive(Default)]
pub struct WindowState {
    pub output_open: bool,
    pub stage_open: bool,
}

/// Coalescer cho ghi đĩa: nhiều lệnh đổi state trong cửa sổ debounce chỉ kích
/// hoạt đúng 1 lần ghi thực sự. `touch()` trả về `true` cho đúng một caller —
/// caller đó phải spawn writer thread; các caller khác trong cửa sổ debounce
/// chỉ cập nhật `dirty`/`last_request_at`.
#[derive(Default)]
pub struct SaveCoalescer {
    dirty: bool,
    last_request_at: u64,
    writer_running: bool,
}

impl SaveCoalescer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Ghi nhận một thay đổi. Trả về `true` nếu caller phải chạy writer.
    pub fn touch(&mut self, now: u64) -> bool {
        self.dirty = true;
        self.last_request_at = now;
        if self.writer_running {
            return false;
        }
        self.writer_running = true;
        true
    }

    /// Đã đủ 500ms kể từ thay đổi cuối và còn dữ liệu chưa ghi chưa?
    pub fn should_write(&self, now: u64, debounce_ms: u64) -> bool {
        self.dirty && now.saturating_sub(self.last_request_at) >= debounce_ms
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn clear_dirty(&mut self) {
        self.dirty = false;
    }

    /// Writer đã thoát (idle) hoặc bị yêu cầu dừng (flush khi đóng app).
    pub fn writer_finished(&mut self) {
        self.writer_running = false;
    }
}

/// State trung tâm chia thành nhiều `Mutex` riêng cho từng tập dữ liệu.
///
/// # Quy ước lock ordering (bắt buộc giữ khi thêm code)
///
/// 1. **Không bao giờ giữ 2 `Mutex` của `AppState` cùng lúc** — lấy dữ liệu
///    bằng 1 câu lệnh clone-and-drop:
///    `state.songs.lock().map(|g| g.clone()).unwrap_or_default()`
///    (guard tự nhả cuối câu lệnh).
/// 2. Ngoại lệ duy nhất: lock `live` có thể giữ xuyên suốt thân hàm, và **phải
///    được lock ĐẦU TIÊN** — không hàm nào được phép lấy `live` trong khi đang
///    giữ một lock khác của `AppState`. (Rà soát: các command trong
///    `commands/output.rs` đều đúng quy tắc này; `load_from_disk` /
///    `write_to_disk` lock từng cái một.)
/// 3. `save` và `windows` là leaf lock — chỉ lock một mình, không bao giờ nằm
///    trong chuỗi giữ chồng với lock khác.
///
/// Hệ quả: không tồn tại vòng chờ (cycle) → không deadlock.
pub struct AppState {
    pub windows: Mutex<WindowState>,
    pub songs: Mutex<Vec<Song>>,
    pub media: Mutex<Vec<MediaItem>>,
    pub audio: Mutex<Vec<AudioItem>>,
    pub audio_playlists: Mutex<Vec<AudioPlaylist>>,
    pub playlists: Mutex<Vec<Playlist>>,
    pub templates: Mutex<Vec<Template>>,
    pub props: Mutex<Vec<Prop>>,
    pub overlays: Mutex<Vec<Overlay>>,
    pub settings: Mutex<AppSettings>,
    pub live: Mutex<LiveState>,
    pub ccli_log: Mutex<Vec<CcliLog>>,
    pub edit_shows: Mutex<Vec<EditShow>>,
    pub native_player: PlayerManager,
    pub ndi: crate::native::ndi::NdiOutput,
    pub save: Mutex<SaveCoalescer>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(WindowState::default()),
            songs: Mutex::new(Vec::new()),
            media: Mutex::new(Vec::new()),
            audio: Mutex::new(Vec::new()),
            audio_playlists: Mutex::new(Vec::new()),
            playlists: Mutex::new(Vec::new()),
            templates: Mutex::new(Vec::new()),
            props: Mutex::new(default_props()),
            overlays: Mutex::new(default_overlays()),
            settings: Mutex::new(AppSettings::default()),
            live: Mutex::new(LiveState::default()),
            ccli_log: Mutex::new(Vec::new()),
            edit_shows: Mutex::new(Vec::new()),
            native_player: PlayerManager::default(),
            ndi: crate::native::ndi::NdiOutput::default(),
            save: Mutex::new(SaveCoalescer::new()),
        }
    }
}

fn default_props() -> Vec<Prop> {
    let p = |name: &str, prop_type: &str, x: f64, y: f64, w: f64, h: f64| Prop {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        prop_type: prop_type.into(),
        x,
        y,
        w,
        h,
        color: "#ffffff".into(),
        options: serde_json::json!({}),
    };
    vec![
        p("Đồng hồ kỹ thuật số", "digital_clock", 84.0, 4.0, 14.0, 10.0),
        p("Đồng hồ analog", "analog_clock", 84.0, 4.0, 14.0, 18.0),
        p("Khung viền động", "border", 2.0, 2.0, 96.0, 96.0),
        p("Tuyết rơi", "snow", 0.0, 0.0, 100.0, 100.0),
        p("Ánh sáng lấp lánh", "sparkle", 0.0, 0.0, 100.0, 100.0),
    ]
}

fn default_overlays() -> Vec<Overlay> {
    let o = |name: &str, kind: &str, x: f64, y: f64, w: f64, h: f64| Overlay {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        kind: kind.into(),
        text: String::new(),
        image_path: String::new(),
        x,
        y,
        w,
        h,
        color: "#ffffff".into(),
        bg_color: "rgba(0,0,0,0.55)".into(),
        is_active: false,
        z_index: 100,
    };
    vec![
        o("Logo hội thánh", "logo", 2.0, 2.0, 18.0, 18.0),
        o("Đếm ngược giờ bắt đầu", "countdown", 40.0, 40.0, 20.0, 20.0),
        o("Banner thông báo khẩn", "banner", 10.0, 78.0, 80.0, 12.0),
        o("Dòng chữ chạy (ticker)", "ticker", 0.0, 94.0, 100.0, 5.0),
        o("Lower-third diễn giả", "lower_third", 5.0, 78.0, 45.0, 14.0),
        o("Watermark livestream", "watermark", 84.0, 4.0, 14.0, 14.0),
    ]
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn ensure_companion_password(app: &AppHandle, state: &AppState) -> String {
    let (empty, configured) = state
        .settings
        .lock()
        .map(|s| (s.companion_password.trim().is_empty(), s.companion_pin_configured))
        .unwrap_or((true, false));
    if empty && !configured {
        // Mã 6 số từ nguồn ngẫu nhiên mật mã (UUID v4) thay vì timestamp —
        // timestamp XOR dễ đoán nếu dùng PIN này cho xác thực quan trọng hơn.
        let code = format!("{:06}", uuid::Uuid::new_v4().as_u128() % 1_000_000u128);
        if let Ok(mut s) = state.settings.lock() {
            s.companion_password = code.clone();
            s.companion_pin_configured = true;
        }
        save_to_disk(app, state);
    }
    state
        .settings
        .lock()
        .map(|s| s.companion_password.clone())
        .unwrap_or_default()
}

fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("data.json"))
}

fn data_tmp_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_file(app)?.with_extension("json.tmp"))
}

/// Atomically replace `dst` with `src`. On Windows `fs::rename` cannot
/// overwrite an existing file, so use `MoveFileExW` (replace + flush). On
/// other platforms a plain rename is already atomic.
fn replace_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let src_w: Vec<u16> = src
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let dst_w: Vec<u16> = dst
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let ok = unsafe {
            MoveFileExW(
                src_w.as_ptr(),
                dst_w.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if ok == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::rename(src, dst)
    }
}

pub fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("media"))
}

pub fn load_from_disk(app: &AppHandle, state: &AppState) {
    let path = match data_file(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    // Prefer data.json; if it is missing (crash between replace steps) fall
    // back to the leftover .tmp written right before the atomic swap.
    let raw = fs::read_to_string(&path).ok().or_else(|| {
        data_tmp_file(app)
            .ok()
            .and_then(|t| fs::read_to_string(&t).ok())
    });
    let Some(raw) = raw else { return };
    match serde_json::from_str::<PersistedData>(&raw) {
        Ok(data) => {
            if let Ok(mut s) = state.songs.lock() {
                *s = data.songs;
            }
            if let Ok(mut m) = state.media.lock() {
                *m = data.media;
            }
            if let Ok(mut a) = state.audio.lock() {
                *a = data.audio;
            }
            if let Ok(mut ap) = state.audio_playlists.lock() {
                *ap = data.audio_playlists;
            }
            if let Ok(mut p) = state.playlists.lock() {
                *p = data.playlists;
            }
            if let Ok(mut t) = state.templates.lock() {
                *t = data.templates;
            }
            if let Ok(mut pr) = state.props.lock() {
                if !data.props.is_empty() {
                    *pr = data.props;
                }
            }
            if let Ok(mut ov) = state.overlays.lock() {
                if !data.overlays.is_empty() {
                    *ov = data.overlays;
                }
            }
            if let Ok(mut s) = state.settings.lock() {
                *s = data.settings;
            }
            if let Ok(mut l) = state.live.lock() {
                *l = data.live;
            }
            if let Ok(mut c) = state.ccli_log.lock() {
                *c = data.ccli_log;
            }
            if let Ok(mut es) = state.edit_shows.lock() {
                *es = data.edit_shows;
            }
        }
        Err(_) => {}
    }
}

/// Khoảng thời gian gộp các thay đổi liên tiếp (ms) trước khi ghi đĩa thật sự.
pub const SAVE_DEBOUNCE_MS: u64 = 500;
/// Tần suất writer thread kiểm tra lại xem đã hết thời gian debounce chưa.
const SAVE_POLL_MS: u64 = 100;

/// Đánh dấu state "bẩn" và lên lịch ghi đĩa sau ~`SAVE_DEBOUNCE_MS`. Không ghi
/// ngay lập tức — các lệnh đổi state liên tiếp (gõ nhanh, kéo-thả) được gộp
/// lại thành 1 lần ghi. `flush_save` gọi đồng bộ khi app thoát để không mất dữ
/// liệu.
pub fn save_to_disk(app: &AppHandle, state: &AppState) {
    let spawn = state
        .save
        .lock()
        .map(|mut s| s.touch(now_millis()))
        .unwrap_or(false);
    if !spawn {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(SAVE_POLL_MS));
        let state = app.state::<AppState>();
        let should_write = state
            .save
            .lock()
            .map(|mut s| {
                if s.should_write(now_millis(), SAVE_DEBOUNCE_MS) {
                    s.clear_dirty();
                    true
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if should_write {
            write_to_disk(&app, &state);
            // Vẫn còn thay đổi mới tiếp tục xuất hiện trong lúc ghi → vòng lặp
            // tiếp theo ghi tiếp cho đến khi state sạch.
            continue;
        }
        let idle = state
            .save
            .lock()
            .map(|s| !s.is_dirty())
            .unwrap_or(true);
        if idle {
            let _ = state.save.lock().map(|mut s| s.writer_finished());
            return;
        }
        // Còn bẩn nhưng chưa đủ debounce → chờ thêm.
    });
}

/// Ghi đồng bộ toàn bộ state xuống đĩa ngay bây giờ (flush khi thoát app).
pub fn flush_save(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _ = state.save.lock().map(|mut s| s.writer_finished());
    write_to_disk(app, &state);
}

fn write_to_disk(app: &AppHandle, state: &AppState) {
    let path = match data_file(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let data = PersistedData {
        songs: state.songs.lock().map(|g| g.clone()).unwrap_or_default(),
        media: state.media.lock().map(|g| g.clone()).unwrap_or_default(),
        audio: state.audio.lock().map(|g| g.clone()).unwrap_or_default(),
        audio_playlists: state
            .audio_playlists
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default(),
        playlists: state
            .playlists
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default(),
        templates: state
            .templates
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default(),
        props: state.props.lock().map(|g| g.clone()).unwrap_or_default(),
        overlays: state
            .overlays
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default(),
        settings: state
            .settings
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default(),
        live: state.live.lock().map(|g| g.clone()).unwrap_or_default(),
        ccli_log: state.ccli_log.lock().map(|g| g.clone()).unwrap_or_default(),
        edit_shows: state.edit_shows.lock().map(|g| g.clone()).unwrap_or_default(),
    };
    if let Ok(json) = serde_json::to_string_pretty(&data) {
        // Write to a temp file first, then atomically swap it over the real
        // file so a crash mid-write never corrupts data.json.
        if let Ok(tmp) = data_tmp_file(app) {
            if fs::write(&tmp, json).is_ok() {
                let _ = replace_file(&tmp, &path);
            }
        }
    }
}

pub fn seed_default_templates(app: &AppHandle, state: &AppState) {
    let reseed = {
        let s = state
            .settings
            .lock()
            .map(|s| !s.default_templates_seeded || s.templates_version < crate::builtin_templates::TEMPLATES_VERSION)
            .unwrap_or(true);
        s
    };
    if !reseed {
        return;
    }
    let defaults = crate::builtin_templates::default_templates();
    {
        let mut guard = state.templates.lock().unwrap_or_else(|e| e.into_inner());
        // Migration keeps user-created templates: drop stale builtin ids, then
        // (re)add the current defaults for the builtin ids.
        let default_ids: std::collections::HashSet<&str> =
            defaults.iter().map(|t| t.id.as_str()).collect();
        // Drop stale builtin ids, any leftover Bible templates, then (re)add the
        // current defaults for the builtin ids.
        guard.retain(|t| !default_ids.contains(t.id.as_str()) && t.category != "bible");
        guard.extend(defaults);
    }
    if let Ok(mut s) = state.settings.lock() {
        s.default_templates_seeded = true;
        s.templates_version = crate::builtin_templates::TEMPLATES_VERSION;
    }
    save_to_disk(app, state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_file_atomically_swaps_content() {
        let dir = std::env::temp_dir().join(format!("pwcp_atomic_{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let dst = dir.join("data.json");
        let tmp = dir.join("data.json.tmp");
        fs::write(&dst, "old").unwrap();
        fs::write(&tmp, "new").unwrap();
        replace_file(&tmp, &dst).unwrap();
        assert_eq!(fs::read_to_string(&dst).unwrap(), "new");
        assert!(!tmp.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn coalescer_batches_rapid_changes_into_single_write() {
        let mut c = SaveCoalescer::new();
        // Lệnh đầu tiên là caller chịu trách nhiệm spawn writer.
        assert!(c.touch(1000));
        // Các lệnh liên tiếp trong <500ms không được spawn writer lần nữa.
        for t in [1050, 1100, 1200, 1300] {
            assert!(!c.touch(t));
        }
        // Chưa đủ 500ms kể từ lần đổi cuối → chưa được phép ghi.
        assert!(!c.should_write(1700, SAVE_DEBOUNCE_MS));
        // Đủ 500ms (1300 + 500 = 1800) → đúng 1 lần ghi thực sự.
        assert!(c.should_write(1800, SAVE_DEBOUNCE_MS));
        c.clear_dirty();
        assert!(!c.should_write(1900, SAVE_DEBOUNCE_MS));
        assert!(!c.is_dirty());
    }

    #[test]
    fn coalescer_clears_after_write() {
        let mut c = SaveCoalescer::new();
        assert!(c.touch(10));
        assert!(c.is_dirty());
        assert!(!c.should_write(100, SAVE_DEBOUNCE_MS));
        c.clear_dirty();
        assert!(!c.is_dirty());
        assert!(!c.should_write(600, SAVE_DEBOUNCE_MS));
        // Writer thoát rồi (idle) → lệnh tiếp theo được phép spawn lại.
        c.writer_finished();
        assert!(c.touch(700));
    }

    #[test]
    fn persisted_data_round_trips_real_data() {
        use crate::models::{AppSettings, Playlist, PlaylistEntry, Song, SongSlide};

        let data = PersistedData {
            songs: vec![Song {
                id: "song-1".into(),
                title: "Way Maker".into(),
                artist: "Leeland".into(),
                key: "A".into(),
                ccli: "7108945".into(),
                copyright: "2018 Integrity Music".into(),
                slides: vec![SongSlide {
                    id: "sl-1".into(),
                    label: "V1".into(),
                    text: "You are the Way Maker".into(),
                    notes: String::new(),
                    template_id: Some("tpl-lyric".into()),
                    layers: Vec::new(),
                    formatting: None,
                    background: Some("bg.jpg".into()),
                }],
                arrangements: Vec::new(),
                template_id: Some("tpl-lyric".into()),
                created_at: 1700000000000,
                updated_at: 1700000001000,
            }],
            media: Vec::new(),
            audio: Vec::new(),
            audio_playlists: Vec::new(),
            playlists: vec![Playlist {
                id: "pl-1".into(),
                name: "Chúa Nhật".into(),
                entries: vec![PlaylistEntry {
                    id: "en-1".into(),
                    kind: "song".into(),
                    ref_id: "song-1".into(),
                    title: "Way Maker".into(),
                    estimated_duration_sec: Some(240),
                    actual_start_time: None,
                    arrangement_id: None,
                    text: None,
                }],
                created_at: 1700000000000,
                updated_at: 1700000000000,
            }],
            templates: Vec::new(),
            props: Vec::new(),
            overlays: Vec::new(),
            settings: AppSettings {
                ui_language: "vi".into(),
                server_port: 8500,
                companion_enabled: true,
                skip_virtual_break: true,
                ..Default::default()
            },
            live: LiveState::default(),
            ccli_log: Vec::new(),
            edit_shows: Vec::new(),
        };

        let json = serde_json::to_string_pretty(&data).unwrap();
        let back: PersistedData = serde_json::from_str(&json).unwrap();

        assert_eq!(back.songs.len(), 1);
        assert_eq!(back.songs[0].title, "Way Maker");
        assert_eq!(back.songs[0].slides[0].text, "You are the Way Maker");
        assert_eq!(back.songs[0].slides[0].background.as_deref(), Some("bg.jpg"));
        assert_eq!(back.songs[0].template_id.as_deref(), Some("tpl-lyric"));
        assert_eq!(back.playlists[0].name, "Chúa Nhật");
        assert_eq!(back.playlists[0].entries[0].ref_id, "song-1");
        assert_eq!(back.playlists[0].entries[0].estimated_duration_sec, Some(240));
        assert_eq!(back.settings.ui_language, "vi");
        assert_eq!(back.settings.server_port, 8500);
        assert!(back.settings.companion_enabled);
        assert!(back.settings.skip_virtual_break);
    }

    #[test]
    fn persisted_data_missing_fields_fall_back_to_defaults() {
        // Thiếu mọi field (chỉ {}): #[serde(default)] phải điền default, không panic.
        let ok: PersistedData = serde_json::from_str("{}").unwrap();
        assert!(ok.songs.is_empty());
        assert!(ok.playlists.is_empty());
        assert_eq!(ok.settings.default_transition.kind, "fade");
        assert_eq!(ok.settings.default_transition.duration_ms, 500);

        // Thiếu một phần field (chỉ có songs): phần còn lại lấy default.
        let partial = r#"{"songs":[{"id":"s1","title":"T","artist":"A","key":"K","ccli":"","copyright":"","slides":[],"created_at":0,"updated_at":0}]}"#;
        let ok: PersistedData = serde_json::from_str(partial).unwrap();
        assert_eq!(ok.songs.len(), 1);
        assert_eq!(ok.songs[0].title, "T");
        assert!(ok.playlists.is_empty());
        assert!(ok.media.is_empty());
    }

    #[test]
    fn persisted_data_garbage_json_errors_without_panic() {
        // JSON hỏng: load_from_disk xử lý Err một cách an toàn — từ_str chỉ báo lỗi.
        assert!(serde_json::from_str::<PersistedData>("not-json-{").is_err());
        assert!(serde_json::from_str::<PersistedData>("[1,2,3]").is_err());
    }
}
