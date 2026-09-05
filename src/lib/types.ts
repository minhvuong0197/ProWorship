export interface SongArrangement {
  id: string;
  name: string;
  order: string[];
}

export interface Layer {
  id: string;
  kind: "text" | "image";
  text: string;
  image_path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  font_size: number;
  align: "center" | "left" | "right";
  opacity: number;
  visible: boolean;
}

export interface SlideFormatting {
  font_family?: string;
  font_size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight_color?: string;
  align_h?: "left" | "center" | "right" | "justify";
  align_v?: "top" | "middle" | "bottom";
  line_height?: number;
  letter_spacing?: number;
  outline_enabled?: boolean;
  outline_color?: string;
  outline_width?: number;
  shadow_enabled?: boolean;
  shadow_color?: string;
  shadow_offset_x?: number;
  shadow_offset_y?: number;
  shadow_blur?: number;
  opacity?: number;
  box_x?: number;
  box_y?: number;
  box_w?: number;
  box_h?: number;
}

export interface SongSlide {
  id: string;
  label: string;
  text: string;
  notes?: string;
  template_id?: string | null;
  layers?: Layer[];
  formatting?: SlideFormatting;
  background?: string | null;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  ccli: string;
  copyright: string;
  slides: SongSlide[];
  arrangements?: SongArrangement[];
  template_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface MediaItem {
  id: string;
  name: string;
  file_path: string;
  kind: "image" | "video";
  added_at: number;
}

export interface AudioItem {
  id: string;
  name: string;
  file_path: string;
  duration: number | null;
  added_at: number;
}

export interface AudioPlaylist {
  id: string;
  name: string;
  track_ids: string[];
  loop_mode: "none" | "single" | "all";
  shuffle: boolean;
  crossfade_enabled: boolean;
  crossfade_ms: number;
  created_at: number;
  updated_at: number;
}

export interface PlaylistEntry {
  id: string;
  kind: "song" | "media" | "blank" | "audio" | "bible";
  ref_id: string;
  title: string;
  estimated_duration_sec?: number | null;
  actual_start_time?: number | null;
  arrangement_id?: string | null;
  text?: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  entries: PlaylistEntry[];
  created_at: number;
  updated_at: number;
}

export type TemplateElementKind =
  | "text"
  | "image"
  | "line"
  | "chord"
  | "scroll"
  | "countdown"
  | "clock"
  | "icon"
  | "box";

export interface TemplateElement {
  id: string;
  kind: TemplateElementKind;
  content: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  font_size: number;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  outline?: boolean;
  shadow?: boolean;
  opacity: number;
  visible: boolean;
  auto_size?: boolean;
  dir?: "h" | "v";
  stroke_width?: number;
  filter?: string;
  box_color?: string;
  radius?: number;
  icon?: string;
  duration_s?: number;
  speed?: number;
  fit_mode?: "shrink" | "grow" | "none";
  css?: string;
  transpose?: number;
  line_height?: number;
  line_gap?: number;
  el_bg_color?: string;
}

export interface StyleOverride {
  id: string;
  match: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  transform?: "none" | "upper" | "lower" | "capitalize";
}

export const SLIDE_DRAG_TYPE = "application/x-pwc-slide";

export interface SlideDragData {
  songId: string;
  slideId: string;
  title: string;
  label: string;
}

export interface Template {
  id: string;
  name: string;
  category?: string;
  bg_color: string;
  text_color: string;
  font_size: number;
  align: "center" | "left" | "right";
  position: "center" | "top" | "bottom";
  bg_filter?: string;
  elements?: TemplateElement[];
  overrides?: StyleOverride[];
  first_template_id?: string | null;
}

export interface LiveTransition {
  kind: "cut" | "fade";
  duration_ms: number;
}

export interface LiveSlide {
  kind: "song" | "media" | "blank";
  title: string;
  text?: string;
  label?: string;
  media_path?: string;
  /** Khi set, hiển thị nguồn live (NDI) thay cho media_path. */
  live_source?: string;
  background?: string;
  notes?: string;
  text_color?: string;
  font_size?: number;
  align?: "center" | "left" | "right";
  position?: "center" | "top" | "bottom";
  bg_color?: string;
  bg_filter?: string;
  layers?: Layer[];
  elements?: TemplateElement[];
  overrides?: StyleOverride[];
  formatting?: SlideFormatting;
  bible_ref?: string;
}

export interface AudioPlayback {
  id: string;
  file_path: string;
  title: string;
  playing: boolean;
  volume: number;
}

export interface Prop {
  id: string;
  name: string;
  prop_type: "digital_clock" | "analog_clock" | "border" | "snow" | "sparkle";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  options?: Record<string, unknown>;
}

export interface CcliLog {
  id: string;
  song_id: string;
  song_title: string;
  ccli: string;
  used_at: number;
}

export type OverlayKind =
  | "logo"
  | "countdown"
  | "banner"
  | "ticker"
  | "lower_third"
  | "watermark"
  | "pip";

export interface Overlay {
  id: string;
  name: string;
  kind: OverlayKind;
  text?: string;
  image_path?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  bg_color: string;
  is_active: boolean;
  z_index: number;
}

export interface LiveState {
  current: LiveSlide | null;
  next_text: string | null;
  next_label: string | null;
  transition: LiveTransition;
  stage_message: string;
  background: string | null;
  song_id?: string | null;
  song_slide_index?: number | null;
  song_slide_count?: number | null;
  playlist_id?: string | null;
  playlist_entry_index?: number | null;
  audio?: AudioPlayback | null;
  media_playing?: boolean;
  countdown_end?: number | null;
  arrangement_id?: string | null;
  slide_order?: string[] | null;
  bible_version?: string | null;
  active_props?: Prop[];
  active_overlays?: Overlay[];
  last_ccli_song_id?: string | null;
  service_started_at?: number | null;
  service_duration_sec?: number | null;
  output_locked?: boolean;
}

export type EditItemType = "text" | "image" | "video" | "shape" | "audio";

export interface EditItemStyle {
  font_family?: string;
  font_size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align_h?: "left" | "center" | "right";
  align_v?: "top" | "middle" | "bottom";
  line_height?: number;
  letter_spacing?: number;
  outline_enabled?: boolean;
  outline_color?: string;
  outline_width?: number;
  shadow_enabled?: boolean;
  shadow_color?: string;
  shadow_offset_x?: number;
  shadow_offset_y?: number;
  shadow_blur?: number;
  bg_color?: string;
  border_color?: string;
  border_width?: number;
  radius?: number;
  filter?: string;
  fit_mode?: "cover" | "contain" | "fill";
  autoplay?: boolean;
  loop?: boolean;
}

export interface EditItem {
  id: string;
  type: EditItemType;
  name: string;
  content: string;
  style: EditItemStyle;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface EditSlide {
  id: string;
  label: string;
  background: string | null;
  bg_color: string;
  items: EditItem[];
  transition: "cut" | "fade";
  transition_duration_ms: number;
  notes: string;
}

export interface EditShow {
  id: string;
  name: string;
  slides: EditSlide[];
  created_at: number;
  updated_at: number;
}

export interface AppSettings {
  default_transition: LiveTransition;
  default_template_id: string | null;
  default_bible_template_id?: string | null;
  output_template_id?: string | null;
  output_monitor?: string | null;
  stage_show_clock: boolean;
  stage_show_next: boolean;
  stage_show_notes: boolean;
  stage_show_message: boolean;
  ui_language: "vi" | "en";
  server_enabled: boolean;
  server_port: number;
  companion_enabled: boolean;
  companion_password?: string;
  companion_pin_configured?: boolean;
  stage_remote_enabled?: boolean;
  api_enabled: boolean;
  api_key: string;
  obs_enabled?: boolean;
  obs_host?: string;
  obs_port?: number;
  obs_password?: string;
  obs_auto_scene_switch?: boolean;
  obs_hidden_inputs?: string[];
  obs_scene_lyric?: string;
  obs_scene_camera?: string;
  obs_scene_blank?: string;
  skip_virtual_break?: boolean;
  default_templates_seeded?: boolean;
}

export interface CompanionInfo {
  base_url: string;
  server_enabled: boolean;
  companion_enabled: boolean;
  stage_remote_enabled: boolean;
  api_enabled: boolean;
  port: number;
}

export interface MonitorInfo {
  name: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface OutputWindowInfo {
  label: string;
  monitor: string | null;
}

export interface BibleVersion {
  id: string;
  name: string;
  language: string;
  source: "builtin" | "online" | "imported";
  template_id?: string | null;
}

export interface BibleBookMeta {
  abbrev: string;
  name: string;
  short: string;
  chapters: number;
  onlineRef?: string;
}

export interface BibleChapter {
  abbrev: string;
  name: string;
  chapter: number;
  verses: string[];
}

export interface BibleSearchHit {
  abbrev: string;
  name: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
}

export interface InterlinearWord {
  word: string;
  translit: string;
  strong: string;
  morph: string;
  lexeme: string;
  gloss: string;
  order: string;
  lang: "hebrew" | "greek";
}

export interface StrongEntry {
  id: string;
  lang: "hebrew" | "greek";
  lemma: string;
  translit: string;
  pron: string;
  derivation: string;
  strongs_def: string;
  kjv_def: string;
  count: number;
}

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
