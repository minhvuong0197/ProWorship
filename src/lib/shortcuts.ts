export type ShortcutCategory =
  | "navigation"
  | "output"
  | "show"
  | "editing"
  | "modules"
  | "help";

export interface ShortcutDef {
  action: string;
  category: ShortcutCategory;
  combo: string;
}

export const SHORTCUT_CATEGORIES: { id: ShortcutCategory; labelKey: string }[] = [
  { id: "navigation", labelKey: "shortcuts.cat.navigation" },
  { id: "output", labelKey: "shortcuts.cat.output" },
  { id: "show", labelKey: "shortcuts.cat.show" },
  { id: "editing", labelKey: "shortcuts.cat.editing" },
  { id: "modules", labelKey: "shortcuts.cat.modules" },
  { id: "help", labelKey: "shortcuts.cat.help" },
];

export const SHORTCUTS: ShortcutDef[] = [
  { action: "next_slide", category: "navigation", combo: "Space / → / N / PageDown" },
  { action: "prev_slide", category: "navigation", combo: "← / P / PageUp" },
  { action: "clear_output", category: "navigation", combo: "B" },
  { action: "toggle_output", category: "output", combo: "Ctrl+O" },
  { action: "lock_output", category: "output", combo: "Ctrl+L" },
  { action: "update_output", category: "output", combo: "Ctrl+R" },
  { action: "mute", category: "output", combo: "Ctrl+M" },
  { action: "save", category: "show", combo: "Ctrl+S" },
  { action: "new_show", category: "show", combo: "Ctrl+N" },
  { action: "duplicate", category: "show", combo: "Ctrl+D" },
  { action: "search", category: "show", combo: "Ctrl+F" },
  { action: "undo", category: "editing", combo: "Ctrl+Z" },
  { action: "redo", category: "editing", combo: "Ctrl+Y / Ctrl+Shift+Z" },
  { action: "bold", category: "editing", combo: "Ctrl+B" },
  { action: "italic", category: "editing", combo: "Ctrl+I" },
  { action: "underline", category: "editing", combo: "Ctrl+U" },
  { action: "tab_songs", category: "modules", combo: "Ctrl+1" },
  { action: "tab_edit", category: "modules", combo: "Ctrl+2" },
  { action: "tab_media", category: "modules", combo: "Ctrl+3" },
  { action: "tab_audio", category: "modules", combo: "Ctrl+4" },
  { action: "tab_bible", category: "modules", combo: "Ctrl+5" },
  { action: "tab_playlists", category: "modules", combo: "Ctrl+6" },
  { action: "tab_overlays", category: "modules", combo: "Ctrl+7" },
  { action: "tab_functions", category: "modules", combo: "Ctrl+8" },
  { action: "tab_props", category: "modules", combo: "Ctrl+9" },
  { action: "tab_obs", category: "modules", combo: "Ctrl+0" },
  { action: "next_module", category: "modules", combo: "Ctrl+Tab" },
  { action: "prev_module", category: "modules", combo: "Ctrl+Shift+Tab" },
  { action: "shortcuts_ref", category: "help", combo: "Ctrl+/ · F1" },
];

export const TABS_ORDER = [
  "presentation",
  "songs",
  "edit",
  "media",
  "audio",
  "bible",
  "playlists",
  "overlays",
  "functions",
  "props",
  "obs",
] as const;