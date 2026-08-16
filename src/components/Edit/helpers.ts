import type {
  EditItem,
  EditItemStyle,
  EditItemType,
  EditShow,
  EditSlide,
} from "../../lib/types";
import { uid } from "../../lib/types";

export function defaultItemStyle(): EditItemStyle {
  return {
    font_family: "",
    font_size: 4,
    color: "#ffffff",
    bold: false,
    italic: false,
    underline: false,
    align_h: "center",
    align_v: "middle",
    line_height: 1.35,
    letter_spacing: 0,
    outline_enabled: false,
    outline_color: "#000000",
    outline_width: 2,
    shadow_enabled: false,
    shadow_color: "#000000",
    shadow_offset_x: 0,
    shadow_offset_y: 4,
    shadow_blur: 12,
    bg_color: "",
    border_color: "#ffffff",
    border_width: 2,
    radius: 0,
    filter: "",
    fit_mode: "cover",
    autoplay: true,
    loop: true,
  };
}

const TYPE_LABEL: Record<EditItemType, string> = {
  text: "Chữ",
  image: "Ảnh",
  video: "Video",
  shape: "Hình dạng",
  audio: "Âm thanh",
};

export function typeLabel(type: EditItemType): string {
  return TYPE_LABEL[type];
}

export function newItem(type: EditItemType, zIndex: number, mediaPath?: string): EditItem {
  const defaults: Record<
    EditItemType,
    { content: string; w: number; h: number; name?: string }
  > = {
    text: { content: "Văn bản", w: 50, h: 20 },
    image: { content: mediaPath ?? "", w: 40, h: 40, name: "Ảnh" },
    video: { content: mediaPath ?? "", w: 60, h: 40, name: "Video" },
    shape: { content: "", w: 30, h: 20, name: "Hình dạng" },
    audio: { content: mediaPath ?? "", w: 30, h: 8, name: "Âm thanh" },
  };
  return {
    id: uid(),
    type,
    name: TYPE_LABEL[type],
    ...defaults[type],
    style: defaultItemStyle(),
    x: 10,
    y: 20,
    zIndex,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

export function newSlide(index: number): EditSlide {
  return {
    id: uid(),
    label: `Slide ${index + 1}`,
    background: null,
    bg_color: "#000000",
    items: [],
    transition: "fade",
    transition_duration_ms: 500,
    notes: "",
  };
}

export function newShow(): EditShow {
  return {
    id: uid(),
    name: "Show mới",
    slides: [newSlide(0)],
    created_at: 0,
    updated_at: 0,
  };
}

export function maxZIndex(items: EditItem[]): number {
  return items.reduce((m, it) => Math.max(m, it.zIndex), 0);
}

export function moveItemZ(
  items: EditItem[],
  itemId: string,
  dir: -1 | 1,
): EditItem[] {
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((it) => it.id === itemId);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= sorted.length) return items;
  [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
  return sorted.map((it, i) => ({ ...it, zIndex: i + 1 }));
}

export function patchItem(
  items: EditItem[],
  itemId: string,
  patch: Partial<EditItem>,
): EditItem[] {
  return items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
}

export function patchItemStyle(
  items: EditItem[],
  itemId: string,
  stylePatch: Partial<EditItemStyle>,
): EditItem[] {
  return items.map((it) =>
    it.id === itemId ? { ...it, style: { ...it.style, ...stylePatch } } : it,
  );
}

export type AlignMode =
  | "left"
  | "centerH"
  | "right"
  | "top"
  | "centerV"
  | "bottom"
  | "distributeH"
  | "distributeV";

export function alignItems(items: EditItem[], ids: string[], mode: AlignMode): EditItem[] {
  const selected = items.filter((it) => ids.includes(it.id));
  if (selected.length === 0) return items;

  const compute = (it: EditItem): Partial<EditItem> => {
    switch (mode) {
      case "left": {
        const left = Math.min(...selected.map((s) => s.x));
        return { x: left };
      }
      case "centerH": {
        const x = Math.min(...selected.map((s) => s.x + s.w / 2));
        return { x: x - it.w / 2 };
      }
      case "right": {
        const right = Math.max(...selected.map((s) => s.x + s.w));
        return { x: right - it.w };
      }
      case "top": {
        const top = Math.min(...selected.map((s) => s.y));
        return { y: top };
      }
      case "centerV": {
        const y = Math.min(...selected.map((s) => s.y + s.h / 2));
        return { y: y - it.h / 2 };
      }
      case "bottom": {
        const bottom = Math.max(...selected.map((s) => s.y + s.h));
        return { y: bottom - it.h };
      }
      case "distributeH": {
        const sorted = [...selected].sort((a, b) => a.x - b.x);
        const left = sorted[0].x;
        const right = Math.max(...sorted.map((s) => s.x + s.w));
        const gap = (right - left) / (sorted.length - 1 || 1);
        const idx = sorted.findIndex((s) => s.id === it.id);
        return { x: idx === 0 ? left : left + gap * idx };
      }
      case "distributeV": {
        const sorted = [...selected].sort((a, b) => a.y - b.y);
        const top = sorted[0].y;
        const bottom = Math.max(...sorted.map((s) => s.y + s.h));
        const gap = (bottom - top) / (sorted.length - 1 || 1);
        const idx = sorted.findIndex((s) => s.id === it.id);
        return { y: idx === 0 ? top : top + gap * idx };
      }
    }
  };

  return items.map((it) => (ids.includes(it.id) ? { ...it, ...compute(it) } : it));
}
