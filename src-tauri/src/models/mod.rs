use serde::{Deserialize, Serialize};

fn default_layer_kind() -> String {
    "text".into()
}

fn default_layer_color() -> String {
    "#ffffff".into()
}

fn default_opacity() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    #[serde(default = "default_layer_kind")]
    pub kind: String, // "text" | "image"
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub image_path: String,
    #[serde(default)]
    pub x: f64, // % position
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default = "default_layer_color")]
    pub color: String,
    #[serde(default)]
    pub font_size: f64,
    #[serde(default)]
    pub align: String, // "center" | "left" | "right"
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default = "default_true")]
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongArrangement {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub order: Vec<String>, // ordered slide ids (subset/repeat allowed)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideFormatting {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strike: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align_h: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align_v: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_offset_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_offset_y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_blur: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_w: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub box_h: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongSlide {
    pub id: String,
    pub label: String,
    pub text: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub template_id: Option<String>,
    #[serde(default)]
    pub layers: Vec<Layer>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formatting: Option<SlideFormatting>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub key: String,
    pub ccli: String,
    pub copyright: String,
    pub slides: Vec<SongSlide>,
    #[serde(default)]
    pub arrangements: Vec<SongArrangement>,
    #[serde(default)]
    pub template_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub kind: String, // "image" | "video"
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioItem {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub duration: Option<u64>,
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPlaylist {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub track_ids: Vec<String>,
    #[serde(default)]
    pub loop_mode: String, // "none" | "single" | "all"
    #[serde(default)]
    pub shuffle: bool,
    #[serde(default)]
    pub crossfade_enabled: bool,
    #[serde(default)]
    pub crossfade_ms: u64,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistEntry {
    pub id: String,
    pub kind: String, // "song" | "media" | "blank" | "audio" | "bible"
    pub ref_id: String,
    pub title: String,
    #[serde(default)]
    pub estimated_duration_sec: Option<u64>,
    #[serde(default)]
    pub actual_start_time: Option<u64>,
    #[serde(default)]
    pub arrangement_id: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub entries: Vec<PlaylistEntry>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleOverride {
    pub id: String,
    #[serde(default)]
    pub r#match: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub transform: String, // "none" | "upper" | "lower" | "capitalize"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub category: String, // "lyric"|"christmas"|"easter"|"bible"|"notice"|"other"
    #[serde(default)]
    pub bg_color: String,
    #[serde(default)]
    pub text_color: String,
    #[serde(default)]
    pub font_size: u32,
    #[serde(default)]
    pub align: String, // "center" | "left" | "right"
    #[serde(default)]
    pub position: String, // "center" | "top" | "bottom"
    #[serde(default)]
    pub bg_filter: String,
    #[serde(default)]
    pub elements: Vec<TemplateElement>,
    #[serde(default)]
    pub overrides: Vec<StyleOverride>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_template_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateElement {
    pub id: String,
    #[serde(default = "default_layer_kind")]
    pub kind: String, // "text" | "image"
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default = "default_layer_color")]
    pub color: String,
    #[serde(default)]
    pub font_size: f64,
    #[serde(default)]
    pub align: String, // "left" | "center" | "right"
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub outline: bool,
    #[serde(default)]
    pub shadow: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub auto_size: bool,
    #[serde(default)]
    pub fit_mode: String, // "shrink" | "grow" | "none"
    #[serde(default)]
    pub dir: String, // "h" | "v"
    #[serde(default = "default_stroke_width")]
    pub stroke_width: f64,
    #[serde(default)]
    pub filter: String, // CSS filter, e.g. "brightness(1.2)"
    #[serde(default)]
    pub box_color: String,
    #[serde(default)]
    pub radius: f64,
    #[serde(default)]
    pub icon: String,
    #[serde(default = "default_countdown")]
    pub duration_s: f64,
    #[serde(default = "default_scroll_speed")]
    pub speed: f64,
    #[serde(default)]
    pub css: String,
    #[serde(default)]
    pub transpose: f64,
}

fn default_stroke_width() -> f64 {
    2.0
}
fn default_countdown() -> f64 {
    0.0
}
fn default_scroll_speed() -> f64 {
    30.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prop {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub prop_type: String, // "digital_clock"|"analog_clock"|"border"|"snow"|"sparkle"
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default = "default_layer_color")]
    pub color: String,
    #[serde(default)]
    pub options: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Overlay {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: String, // "logo"|"countdown"|"banner"|"ticker"|"lower_third"|"watermark"
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub image_path: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default = "default_layer_color")]
    pub color: String,
    #[serde(default)]
    pub bg_color: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub z_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CcliLog {
    pub id: String,
    pub song_id: String,
    pub song_title: String,
    #[serde(default)]
    pub ccli: String,
    pub used_at: u64,
}

fn default_edit_item_type() -> String {
    "text".into()
}

fn default_bg_color() -> String {
    "#000000".into()
}

fn default_edit_transition() -> String {
    "fade".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct EditItemStyle {
    pub font_family: String,
    pub font_size: f64,
    pub color: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub align_h: String,
    pub align_v: String,
    pub line_height: f64,
    pub letter_spacing: f64,
    pub outline_enabled: bool,
    pub outline_color: String,
    pub outline_width: f64,
    pub shadow_enabled: bool,
    pub shadow_color: String,
    pub shadow_offset_x: f64,
    pub shadow_offset_y: f64,
    pub shadow_blur: f64,
    pub bg_color: String,
    pub border_color: String,
    pub border_width: f64,
    pub radius: f64,
    pub filter: String,
    pub fit_mode: String, // "cover" | "contain" | "fill"
    pub autoplay: bool,
    #[serde(rename = "loop")]
    pub loop_enabled: bool,
}

impl Default for EditItemStyle {
    fn default() -> Self {
        Self {
            font_family: String::new(),
            font_size: 4.0,
            color: "#ffffff".into(),
            bold: false,
            italic: false,
            underline: false,
            align_h: "center".into(),
            align_v: "middle".into(),
            line_height: 1.35,
            letter_spacing: 0.0,
            outline_enabled: false,
            outline_color: "#000000".into(),
            outline_width: 2.0,
            shadow_enabled: false,
            shadow_color: "#000000".into(),
            shadow_offset_x: 0.0,
            shadow_offset_y: 4.0,
            shadow_blur: 12.0,
            bg_color: String::new(),
            border_color: "#ffffff".into(),
            border_width: 2.0,
            radius: 0.0,
            filter: String::new(),
            fit_mode: "cover".into(),
            autoplay: true,
            loop_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditItem {
    pub id: String,
    #[serde(default = "default_edit_item_type")]
    pub item_type: String, // "text" | "image" | "video" | "shape" | "audio"
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub style: EditItemStyle,
    #[serde(default)]
    pub x: f64, // % position
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditSlide {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(default = "default_bg_color")]
    pub bg_color: String,
    #[serde(default)]
    pub items: Vec<EditItem>,
    #[serde(default = "default_edit_transition")]
    pub transition: String, // "cut" | "fade"
    #[serde(default)]
    pub transition_duration_ms: u32,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditShow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub slides: Vec<EditSlide>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveTransition {
    pub kind: String, // "cut" | "fade"
    pub duration_ms: u32,
}

impl Default for LiveTransition {
    fn default() -> Self {
        Self {
            kind: "fade".into(),
            duration_ms: 500,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSlide {
    pub kind: String, // "song" | "media" | "blank"
    pub title: String,
    pub text: Option<String>,
    pub label: Option<String>,
    pub media_path: Option<String>,
    pub background: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub text_color: Option<String>,
    #[serde(default)]
    pub font_size: Option<u32>,
    #[serde(default)]
    pub align: Option<String>,
    #[serde(default)]
    pub position: Option<String>,
    #[serde(default)]
    pub bg_color: Option<String>,
    #[serde(default)]
    pub bg_filter: Option<String>,
    #[serde(default)]
    pub layers: Vec<Layer>,
    #[serde(default)]
    pub elements: Vec<TemplateElement>,
    #[serde(default)]
    pub overrides: Vec<StyleOverride>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formatting: Option<SlideFormatting>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bible_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPlayback {
    pub id: String,
    pub file_path: String,
    pub title: String,
    #[serde(default)]
    pub playing: bool,
    #[serde(default)]
    pub volume: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveState {
    pub current: Option<LiveSlide>,
    pub next_text: Option<String>,
    pub next_label: Option<String>,
    pub transition: LiveTransition,
    pub stage_message: String,
    pub background: Option<String>,
    #[serde(default)]
    pub song_id: Option<String>,
    #[serde(default)]
    pub song_slide_index: Option<usize>,
    #[serde(default)]
    pub song_slide_count: Option<usize>,
    #[serde(default)]
    pub playlist_id: Option<String>,
    #[serde(default)]
    pub playlist_entry_index: Option<usize>,
    #[serde(default)]
    pub audio: Option<AudioPlayback>,
    #[serde(default)]
    pub media_playing: bool,
    #[serde(default)]
    pub countdown_end: Option<u64>,
    #[serde(default)]
    pub arrangement_id: Option<String>,
    #[serde(default)]
    pub slide_order: Option<Vec<String>>,
    #[serde(default)]
    pub bible_version: Option<String>,
    #[serde(default)]
    pub active_props: Vec<Prop>,
    #[serde(default)]
    pub active_overlays: Vec<Overlay>,
    #[serde(default)]
    pub last_ccli_song_id: Option<String>,
    #[serde(default)]
    pub service_started_at: Option<u64>,
    #[serde(default)]
    pub service_duration_sec: Option<u64>,
    #[serde(default)]
    pub output_locked: bool,
}

impl Default for LiveState {
    fn default() -> Self {
        Self {
            current: None,
            next_text: None,
            next_label: None,
            transition: LiveTransition::default(),
            stage_message: String::new(),
            background: None,
            song_id: None,
            song_slide_index: None,
            song_slide_count: None,
            playlist_id: None,
            playlist_entry_index: None,
            audio: None,
            media_playing: true,
            countdown_end: None,
            arrangement_id: None,
            slide_order: None,
            bible_version: None,
            active_props: Vec::new(),
            active_overlays: Vec::new(),
            last_ccli_song_id: None,
            service_started_at: None,
            service_duration_sec: None,
            output_locked: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    #[serde(default)]
    pub default_transition: LiveTransition,
    #[serde(default)]
    pub default_template_id: Option<String>,
    #[serde(default)]
    pub default_bible_template_id: Option<String>,
    #[serde(default)]
    pub output_template_id: Option<String>,
    #[serde(default)]
    pub output_monitor: Option<String>,
    #[serde(default)]
    pub stage_show_clock: bool,
    #[serde(default)]
    pub stage_show_next: bool,
    #[serde(default)]
    pub stage_show_notes: bool,
    #[serde(default)]
    pub stage_show_message: bool,
    #[serde(default)]
    pub ui_language: String, // "vi" | "en"
    #[serde(default)]
    pub server_enabled: bool,
    #[serde(default)]
    pub server_port: u16,
    #[serde(default)]
    pub companion_enabled: bool,
    #[serde(default)]
    pub companion_password: String,
    #[serde(default)]
    pub companion_pin_configured: bool,
    #[serde(default)]
    pub stage_remote_enabled: bool,
    #[serde(default)]
    pub api_enabled: bool,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub obs_enabled: bool,
    #[serde(default)]
    pub obs_host: String,
    #[serde(default)]
    pub obs_port: u16,
    #[serde(default)]
    pub obs_password: String,
    #[serde(default)]
    pub obs_auto_scene_switch: bool,
    #[serde(default)]
    pub obs_scene_lyric: String,
    #[serde(default)]
    pub obs_scene_camera: String,
    #[serde(default)]
    pub obs_scene_blank: String,
    #[serde(default)]
    pub skip_virtual_break: bool,
    #[serde(default)]
    pub default_templates_seeded: bool,
    #[serde(default)]
    pub templates_version: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_transition: LiveTransition::default(),
            default_template_id: None,
            default_bible_template_id: None,
            output_template_id: None,
            output_monitor: None,
            stage_show_clock: true,
            stage_show_next: true,
            stage_show_notes: true,
            stage_show_message: true,
            ui_language: "vi".into(),
            server_enabled: true,
            server_port: 8500,
            companion_enabled: false,
            companion_password: String::new(),
            companion_pin_configured: false,
            stage_remote_enabled: false,
            api_enabled: false,
            api_key: String::new(),
            obs_enabled: false,
            obs_host: "127.0.0.1".into(),
            obs_port: 4455,
            obs_password: String::new(),
            obs_auto_scene_switch: false,
            obs_scene_lyric: String::new(),
            obs_scene_camera: String::new(),
            obs_scene_blank: String::new(),
            skip_virtual_break: false,
            default_templates_seeded: false,
            templates_version: 0,
        }
    }
}
