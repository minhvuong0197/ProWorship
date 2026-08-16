import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { StyleOverride, Template, TemplateElement, TemplateElementKind } from "../../lib/types";
import { uid } from "../../lib/types";
import StyledText from "../StyledText";
import { transposeChords } from "../../lib/chords";
import { useAutoFitText } from "../../lib/useAutoFit";
import type { IconName } from "../Icon/Icon";

export const apiAsSrc = (p: string) => (p ? convertFileSrc(p) : "");

export function newTemplate(): Template {
  return {
    id: uid(),
    name: "Template mới",
    category: "lyric",
    bg_color: "#000000",
    text_color: "#ffffff",
    font_size: 6,
    align: "center",
    position: "center",
    elements: [],
  };
}

const baseEl = (kind: TemplateElementKind, extra: Partial<TemplateElement>): TemplateElement => ({
  id: uid(),
  kind,
  content: "",
  x: 25,
  y: 40,
  w: 50,
  h: 10,
  color: "#ffffff",
  font_size: 5,
  align: "center",
  bold: false,
  italic: false,
  opacity: 1,
  visible: true,
  ...extra,
});

export function newElement(kind: TemplateElementKind): TemplateElement {
  switch (kind) {
    case "line":
      return baseEl("line", { content: "—", x: 20, y: 50, w: 60, h: 0.4, color: "#ffffff" });
    case "chord":
      return baseEl("chord", { content: "C   G   Am   F", x: 20, y: 20, w: 60, h: 12, font_size: 6, bold: true, color: "#ffd54a" });
    case "scroll":
      return baseEl("scroll", { content: "Thông báo: {date} • {time}", x: 10, y: 90, w: 80, h: 6, font_size: 3.5, speed: 30 });
    case "countdown":
      return baseEl("countdown", { content: "Bắt đầu trong", x: 30, y: 40, w: 40, h: 18, font_size: 8, duration_s: 600, bold: true });
    case "clock":
      return baseEl("clock", { content: "{time}", x: 40, y: 10, w: 20, h: 8, font_size: 4 });
    case "icon":
      return baseEl("icon", { content: "❤", x: 45, y: 40, w: 10, h: 10, font_size: 8 });
    case "box":
      return baseEl("box", { content: "", x: 15, y: 15, w: 70, h: 70, box_color: "#00000080", radius: 12, color: "#ffffff" });
    case "image":
      return baseEl("image", { x: 35, y: 20, w: 30, h: 30 });
    default:
      return baseEl("text", { y: 45, h: 10, auto_size: true, fit_mode: "shrink" });
  }
}

export const EL_LABELS: Record<TemplateElementKind, IconName> = {
  text: "file",
  image: "image",
  line: "slash",
  chord: "music",
  scroll: "chevronsRight",
  countdown: "timer",
  clock: "clock",
  icon: "heart",
  box: "square",
};

export const isTextual = (k: TemplateElementKind) =>
  k === "text" || k === "chord" || k === "scroll" || k === "countdown" || k === "clock" || k === "icon";

/**
 * Design-time preview used by the template editor canvas. The editor does NOT
 * have a live slide, so dynamic tokens are replaced with representative sample
 * content (a >300 char Vietnamese verse for {scripture_text}) so that autofit
 * can actually be verified to shrink while designing a bible template. This
 * mirrors resolveDynamicValue in the preview/output (same token set).
 */
export function resolveEditorPreview(content: string, isBible?: boolean): string {
  if (!content.includes("{") && !content.includes("%")) return content;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const sampleText = isBible
    ? "1 Ban đầu Đức Chúa Trời dựng nên trời và đất. 2 Đất vốn không có hình dạng và trống không, sự tối tăm ở trên mặt vực sâu, và Thần Đức Chúa Trời vận hành trên mặt nước. 3 Đức Chúa Trời phán rằng: Phải có sáng! Thì có sáng. 4 Đức Chúa Trời thấy sáng là tốt lành, bèn phân sáng và tối ra khỏi nhau. 5 Đức Chúa Trời gọi sáng là ngày, còn tối là đêm."
    : "Đây là dòng chữ mẫu hiển thị nội dung slide, được dùng để kiểm tra việc tự co chữ khi soạn template.";
  const map: Record<string, string> = {
    text: sampleText,
    title: "Bài hát mẫu",
    label: isBible ? "Sáng-thế Ký 1:1" : "Điệp khúc",
    reference: "Sáng-thế Ký 1:1",
    scripture: sampleText,
    scripture_text: sampleText,
    scripture_reference: "Sáng-thế Ký 1:1",
    scripture_name: "VPS 1925",
    scripture_book: "Sáng-thế Ký",
    scripture_chapter: "1",
    scripture_verse: "1",
    scripture_verses: "1-4",
    date: now.toLocaleDateString(),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    hour: pad(now.getHours()),
    minute: pad(now.getMinutes()),
    second: pad(now.getSeconds()),
    day: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(now),
    month: new Intl.DateTimeFormat(undefined, { month: "long" }).format(now),
    year: String(now.getFullYear()),
  };
  const pctAliases: Record<string, string> = {
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
  return content.replace(
    /\{(text|title|label|reference|scripture|scripture_text|scripture_reference|scripture_name|scripture_book|scripture_chapter|scripture_verse|scripture_verses|date|time|hour|minute|second|day|month|year)\}|%(TITLE|SLIDE_LABEL|TEXT|DATE|TIME|HOUR|MINUTE|SECOND|DAY_OF_WEEK|MONTH|YEAR|SCRIPTURETEXT|SCRIPTUREREF|BIBLENAME|BIBLECHAPTER|BIBLEVERSE|BIBLEVERSES)%/g,
    (m: string, braceKey?: string, pctKey?: string) => {
      const key = braceKey ?? (pctKey ? pctAliases[pctKey] : undefined);
      return key ? map[key] ?? m : m;
    },
  );
}

export function TplAutofitText({
  el,
  overrides,
  isBible,
}: {
  el: TemplateElement;
  overrides?: StyleOverride[];
  isBible?: boolean;
}) {
  const preview = resolveEditorPreview(el.content ?? "", isBible);
  const { ref, fontSize } = useAutoFitText(preview, {
    unit: "cqh",
    minFont: 0.5,
    capFont: Math.max(0.5, el.font_size),
    mode: el.fit_mode ?? "shrink",
    padding: 2,
    maxUnit: 60,
  });

  const justify =
    el.align === "left"
      ? "flex-start"
      : el.align === "right"
        ? "flex-end"
        : "center";

  return (
    <div
      className="tpl-el-text"
      style={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: justify,
        color: el.color,
        textAlign: el.align,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : undefined,
        WebkitTextStroke: el.outline ? "2px rgba(0,0,0,0.9)" : undefined,
        textShadow: el.shadow ? "0 4px 12px rgba(0,0,0,0.85)" : undefined,
        lineHeight: el.line_height ? `${el.line_height / 100 + 1}` : undefined,
        background: el.el_bg_color || undefined,
      }}
    >
      <div
        ref={ref}
        data-autofit
        style={{
          width: "100%",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: `clamp(8px, ${fontSize}cqh, 60cqh)`,
        }}
      >
        {preview.split("\n").map((ln, i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: "100%",
              marginTop: i === 0 ? undefined : `${el.line_gap ?? 0}cqh`,
            }}
          >
            <StyledText text={ln || (i === 0 ? "Nội dung slide" : "")} overrides={overrides} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function renderElBody(el: TemplateElement, overrides?: StyleOverride[], isBible?: boolean) {
  const base: CSSProperties = {
    color: el.color,
    textAlign: el.align,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : undefined,
    WebkitTextStroke: el.outline ? "2px rgba(0,0,0,0.9)" : undefined,
    textShadow: el.shadow ? "0 4px 12px rgba(0,0,0,0.85)" : undefined,
    fontSize: `${Math.max(0.5, el.font_size)}cqh`,
  };
  const justify =
    el.align === "left"
      ? "flex-start"
      : el.align === "right"
        ? "flex-end"
        : "center";

  switch (el.kind) {
    case "line":
      return (
        <div className="tpl-el-line" style={{ alignItems: "center", justifyContent: "center" }}>
          <span
            style={{
              display: "block",
              background: el.color,
              height: el.dir === "v" ? "100%" : undefined,
              width: el.dir === "v" ? undefined : "100%",
              minWidth: el.dir === "v" ? 2 : undefined,
              minHeight: el.dir === "v" ? undefined : 2,
              flex: "0 0 auto",
              borderRadius: 4,
            }}
          />
        </div>
      );
    case "chord":
      return (
        <div className="tpl-el-text" style={{ ...base, whiteSpace: "pre-wrap", alignItems: justify }}>
          <StyledText text={transposeChords(el.content, el.transpose ?? 0)} overrides={overrides} />
        </div>
      );
    case "scroll":
      return (
        <div className="tpl-el-scroll" style={base}>
          <StyledText text={el.content} overrides={overrides} />
        </div>
      );
    case "countdown": {
      const total = el.duration_s || 0;
      const mm = Math.floor(total / 60);
      const ss = Math.floor(total % 60);
      return (
        <div className="tpl-el-text" style={{ ...base, alignItems: justify }}>
          <div>{el.content}</div>
          <div style={{ fontSize: "2em" }}>
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      );
    }
    case "clock":
      return (
        <div className="tpl-el-text" style={{ ...base, whiteSpace: "nowrap", alignItems: justify }}>
          {el.content.includes("{time}") ? "12:30" : el.content}
        </div>
      );
    case "icon":
      return (
        <div className="tpl-el-text" style={{ ...base, alignItems: justify }}>
          {el.icon || el.content}
        </div>
      );
    case "box":
      return (
        <div
          className="tpl-el-box"
          style={{
            position: "absolute",
            inset: 0,
            background: el.box_color,
            borderRadius: el.radius ?? 0,
            border: el.color !== "#ffffff" ? `2px solid ${el.color}` : undefined,
          }}
        />
      );
    default:
      if (el.kind === "image") {
        return <img className="tpl-el-img" src={el.content ? apiAsSrc(el.content) : ""} alt="" />;
      }
      if (el.auto_size) {
        return <TplAutofitText el={el} overrides={overrides} isBible={isBible} />;
      }
      const preview = resolveEditorPreview(el.content ?? "", isBible);
      return (
        <div
          className="tpl-el-text"
          style={{
            ...base,
            alignItems: justify,
            lineHeight: el.line_height ? `${el.line_height / 100 + 1}` : undefined,
            background: el.el_bg_color || undefined,
          }}
        >
          {preview.split("\n").map((ln, i) => (
            <span
              key={i}
              style={{
                display: "block",
                marginTop: i === 0 ? undefined : `${el.line_gap ?? 0}cqh`,
                whiteSpace: "pre",
              }}
            >
              <StyledText text={ln || (i === 0 ? "Nội dung slide" : "")} overrides={overrides} />
            </span>
          ))}
        </div>
      );
  }
}
