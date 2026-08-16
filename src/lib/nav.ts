export type LibraryMode = "songs" | "bible" | "media" | "audio";
export type ToolMode =
  | "edit"
  | "overlays"
  | "functions"
  | "props"
  | "obs"
  | "projects";

export type EditorKind = "songs" | "bible" | "media" | "audio";

export type CenterView =
  | { kind: "show" }
  | { kind: "tool"; mode: ToolMode }
  | { kind: "editor"; editor: EditorKind; songId?: string | null };

export const LIBRARY_MODES: LibraryMode[] = ["songs", "bible", "media", "audio"];

export const TOOL_MODES: ToolMode[] = [
  "edit",
  "overlays",
  "functions",
  "props",
  "obs",
  "projects",
];

export const MODE_ORDER: (LibraryMode | ToolMode)[] = [
  "songs",
  "bible",
  "media",
  "audio",
  "edit",
  "overlays",
  "functions",
  "props",
  "obs",
  "projects",
];

export const DRAG_SONG = "application/x-pwc-song";
export const DRAG_BIBLE = "application/x-pwc-bible";
export const DRAG_MEDIA = "application/x-pwc-media";

export function isLibraryMode(m: string): m is LibraryMode {
  return (LIBRARY_MODES as string[]).includes(m);
}

export function isToolMode(m: string): m is ToolMode {
  return (TOOL_MODES as string[]).includes(m);
}