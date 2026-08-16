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

const TOKEN_RE =
  /\{(text|title|label|reference|scripture|scripture_text|scripture_reference|scripture_name|scripture_book|scripture_chapter|scripture_verse|scripture_verses|date|time|hour|minute|second|day|month|year)\}|%(TITLE|SLIDE_LABEL|TEXT|DATE|TIME|HOUR|MINUTE|SECOND|DAY_OF_WEEK|MONTH|YEAR|SCRIPTURETEXT|SCRIPTUREREF|BIBLENAME|BIBLECHAPTER|BIBLEVERSE|BIBLEVERSES)%/g;

const PCT_ALIASES: Record<string, string> = {
  TITLE: "title",
  SLIDE_LABEL: "label",
  TEXT: "text",
  DATE: "date",
  TIME: "time",
  HOUR: "hour",
  MINUTE: "minute",
  SECOND: "second",
  DAY_OF_WEEK: "day",
  MONTH: "month",
  YEAR: "year",
  SCRIPTURETEXT: "scripture_text",
  SCRIPTUREREF: "scripture_reference",
  BIBLENAME: "scripture_name",
  BIBLECHAPTER: "scripture_chapter",
  BIBLEVERSE: "scripture_verse",
  BIBLEVERSES: "scripture_verses",
};

/**
 * Thay thế token dạng `{token}` (WorshipCast) và `%TOKEN%` (kiểu ProPresenter)
 * bằng giá trị động của slide hiện tại. Dùng chung cho preview, output và
 * helper của template editor — giữ nguyên cùng một tập token.
 */
export function resolveDynamicValue(
  content: string,
  slide?: Partial<LiveSlide> | null,
): string {
  if (!content.includes("{") && !content.includes("%")) return content;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // bible_ref format: abbrev|chapter|first|last|bookName|versionName
  const bp = (slide?.bible_ref ?? "").split("|");
  const bookName = bp[4] ?? "";
  const versionName = bp[5] ?? "";
  const chapter = bp[1] ?? "";
  const firstVerse = bp[2] ?? "";
  const lastVerse = bp[3] ?? "";
  const verses =
    firstVerse && lastVerse && firstVerse !== lastVerse
      ? `${firstVerse}-${lastVerse}`
      : firstVerse;
  const map: Record<string, string> = {
    text: slide?.text ?? "",
    title: slide?.title ?? "",
    label: slide?.label ?? "",
    reference: slide?.label ?? slide?.title ?? "",
    scripture: slide?.text ?? "",
    scripture_text: slide?.text ?? "",
    scripture_reference: slide?.label ?? slide?.title ?? "",
    scripture_name: versionName,
    scripture_book: bookName,
    scripture_chapter: chapter,
    scripture_verse: firstVerse,
    scripture_verses: verses,
    date: now.toLocaleDateString(),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    hour: pad(now.getHours()),
    minute: pad(now.getMinutes()),
    second: pad(now.getSeconds()),
    day: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(now),
    month: new Intl.DateTimeFormat(undefined, { month: "long" }).format(now),
    year: String(now.getFullYear()),
  };
  return content.replace(TOKEN_RE, (m, braceKey?: string, pctKey?: string) => {
    const key = braceKey ?? (pctKey ? PCT_ALIASES[pctKey] : undefined);
    return key ? map[key] ?? m : m;
  });
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

export interface BiblePresentOpts {
  version: string;
  versionName: string;
  abbrev: string;
  name: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  templateId?: string | null;
}

export function presentBibleLive(
  live: LiveState | null,
  settings: AppSettings | null,
  templates: Template[],
  o: BiblePresentOpts,
): LiveState {
  const base = live ?? defaultLive(settings);
  const reference = `${o.name} ${o.chapter}:${o.verseStart}${
    o.verseStart !== o.verseEnd ? `-${o.verseEnd}` : ""
  }`;
  return {
    ...base,
    current: {
      kind: "song",
      title: reference,
      label: reference,
      text: o.text,
      background: base.background ?? undefined,
      ...resolveBibleStyle(settings, templates, o.templateId),
      bible_ref: `${o.abbrev}|${o.chapter}|${o.verseStart}|${o.verseEnd}|${o.name}|${o.versionName}`,
    },
    next_text: null,
    next_label: null,
    playlist_id: null,
    playlist_entry_index: null,
    bible_version: o.version,
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
