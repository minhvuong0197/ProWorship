import type {
  AppSettings,
  LiveSlide,
  LiveState,
  Song,
  SongSlide,
  Template,
} from "./types";

export function defaultLive(settings: AppSettings | null): LiveState {
  return {
    current: null,
    next_text: null,
    next_label: null,
    transition: settings?.default_transition ?? { kind: "fade", duration_ms: 500 },
    stage_message: "",
    background: null,
    media_playing: true,
  };
}

export function resolveSlideStyle(
  slide: SongSlide | undefined,
  settings: AppSettings | null,
  templates: Template[],
  isFirst?: boolean,
  songTplId?: string | null,
): Pick<
  LiveSlide,
  | "text_color"
  | "font_size"
  | "align"
  | "position"
  | "bg_color"
  | "bg_filter"
  | "elements"
  | "overrides"
  | "formatting"
> {
  const tplId =
    slide?.template_id ??
    songTplId ??
    settings?.default_template_id ??
    templates.find((t) => t.category === "lyric")?.id ??
    null;
  const tpl = tplId ? templates.find((t) => t.id === tplId) : undefined;
  const firstTpl = isFirst
    ? tpl?.first_template_id
      ? templates.find((t) => t.id === tpl.first_template_id)
      : undefined
    : undefined;
  const effTpl = firstTpl ?? tpl;
  const base = effTpl
    ? {
        text_color: effTpl.text_color,
        font_size: effTpl.font_size,
        align: effTpl.align as LiveSlide["align"],
        position: effTpl.position as LiveSlide["position"],
        bg_color: effTpl.bg_color,
        bg_filter: effTpl.bg_filter || undefined,
      }
    : {};
  return {
    ...base,
    elements: effTpl?.elements ?? [],
    overrides: effTpl?.overrides ?? [],
    formatting: slide?.formatting,
  };
}

export function resolveBibleStyle(
  settings: AppSettings | null,
  templates: Template[],
  versionTplId?: string | null,
): Pick<
  LiveSlide,
  | "text_color"
  | "font_size"
  | "align"
  | "position"
  | "bg_color"
  | "bg_filter"
  | "elements"
  | "overrides"
> {
  const tplId =
    versionTplId ??
    settings?.default_bible_template_id ??
    settings?.default_template_id ??
    templates.find((t) => t.category === "bible")?.id ??
    null;
  const tpl = tplId ? templates.find((t) => t.id === tplId) : undefined;
  if (!tpl) return { elements: [], overrides: [] };
  return {
    text_color: tpl.text_color,
    font_size: tpl.font_size,
    align: tpl.align as LiveSlide["align"],
    position: tpl.position as LiveSlide["position"],
    bg_color: tpl.bg_color,
    bg_filter: tpl.bg_filter || undefined,
    elements: tpl.elements ?? [],
    overrides: tpl.overrides ?? [],
  };
}

export function resolveArrangementOrder(
  song: Song | null,
  arrangementId: string | null | undefined,
): string[] {
  if (!song) return [];
  if (arrangementId) {
    const arr = song.arrangements?.find((a) => a.id === arrangementId);
    if (arr && arr.order.length > 0) return arr.order;
  }
  return song.slides.map((s) => s.id);
}

export function songSlideLive(
  song: Song | null,
  index: number,
  fallbackTitle: string,
  base: LiveState,
  settings: AppSettings | null,
  templates: Template[],
  arrangementId?: string | null,
): LiveState {
  const order = resolveArrangementOrder(song, arrangementId);
  const slideId = order[index];
  const slide = song?.slides.find((s) => s.id === slideId);
  const next = song?.slides.find((s) => s.id === order[index + 1]);
  const ghostBg = slide?.background
    ? slide.background
    : (() => {
        for (let i = index - 1; i >= 0; i--) {
          const prev = song?.slides.find((s) => s.id === order[i]);
          if (prev?.background) return prev.background;
        }
        return undefined;
      })();
  return {
    ...base,
    current: {
      kind: "song",
      title: song?.title ?? fallbackTitle,
      text: slide?.text,
      label: slide?.label,
      notes: slide?.notes,
      background: ghostBg ?? base.background ?? undefined,
      layers: slide?.layers ?? [],
      ...resolveSlideStyle(slide, settings, templates, index === 0, song?.template_id),
    },
    next_text: next?.text ?? null,
    next_label: next?.label ?? null,
    song_id: song?.id ?? null,
    song_slide_index: song ? index : null,
    song_slide_count: song ? order.length : null,
    arrangement_id: arrangementId ?? null,
    slide_order: song ? order : null,
  };
}

export function applyVirtualBreaks(
  text: string | undefined,
  skip: boolean,
): string {
  if (!text) return "";
  return skip ? text.split("[_VB]").join("") : text.split("[_VB]").join("\n");
}

export function fmtDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
