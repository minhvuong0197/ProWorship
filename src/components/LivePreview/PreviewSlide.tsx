import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Layer, LiveSlide, TemplateElement } from "../../lib/types";
import NativeVideo from "../NativeVideo";
import StyledText, { parseCss } from "../StyledText";
import { applyVirtualBreaks, resolveDynamicValue } from "../../lib/live";
import { transposeChords } from "../../lib/chords";
import {
  clampReferenceRect,
  REF_TOKEN_RE,
  useAutoFitText,
  useAutoRepositionRef,
} from "../../lib/useAutoFit";

function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(path);
}

function PreviewFitBlock({
  children,
  style,
  anchor,
}: {
  children: ReactNode;
  style?: CSSProperties;
  anchor?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let timeout = 0;
    const fit = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const availW = parent.clientWidth;
      const availH = parent.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const ratio = Math.min(
        availW / (el.scrollWidth || 1),
        availH / (el.scrollHeight || 1),
      );
      setScale((prev: number) => {
        const next = Math.min(1, ratio);
        return Math.abs(prev - next) < 0.001 ? prev : next;
      });
    };
    fit();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(el);
    window.addEventListener("resize", fit);
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!ref.current) return;
        fit();
      });
    }
    timeout = window.setTimeout(fit, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [children]);

  const origin =
    anchor === "top"
      ? "top center"
      : anchor === "bottom"
        ? "bottom center"
        : "center";

  return (
    <div
      ref={ref}
      className="preview-fitblock"
      style={{ ...style, transform: `scale(${scale})`, transformOrigin: origin }}
    >
      {children}
    </div>
  );
}

function PreviewMedia({
  path,
  mode,
  playing,
  chroma,
}: {
  path?: string;
  mode: "full" | "bg";
  playing?: boolean;
  chroma?: boolean;
}) {
  if (!path) return null;
  const src = convertFileSrc(path);
  if (isVideo(path)) {
    return (
      <NativeVideo
        path={path}
        mode={mode}
        playing={playing}
        chroma={chroma}
        className={`preview-media-asset ${mode}`}
      />
    );
  }
  return <img key={src} className={`preview-media-asset ${mode}`} src={src} alt="" />;
}

function PreviewLayerView({ layer }: { layer: import("../../lib/types").Layer }) {
  if (!layer.visible) return null;
  const style: CSSProperties = {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.w}%`,
    height: `${layer.h}%`,
    opacity: layer.opacity,
  };
  if (layer.kind === "image") {
    if (!layer.image_path) return null;
    return (
      <div className="preview-layer" style={style}>
        <img className="preview-layer-img" src={convertFileSrc(layer.image_path)} alt="" />
      </div>
    );
  }
  return (
    <div className="preview-layer" style={style}>
      <div
        className="preview-layer-text"
        style={{
          color: layer.color,
          fontSize: `clamp(10px, ${Math.max(1, layer.font_size)}cqh, 60cqh)`,
          textAlign: layer.align,
          alignItems:
            layer.align === "left"
              ? "flex-start"
              : layer.align === "right"
                ? "flex-end"
                : "center",
        }}
      >
        {layer.text}
      </div>
    </div>
  );
}

function PreviewElementText({
  el,
  slide,
}: {
  el: import("../../lib/types").TemplateElement;
  slide?: Partial<LiveSlide> | null;
}) {
  const resolved = parseTemplateContent(el.content, slide);
  const text = resolved;
  if (el.kind === "text" && !text.trim()) return null;
  if (el.kind === "text" && text.trim() === "Văn bản") return null;

  const textStyle: CSSProperties = {
    color: el.color,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : undefined,
    fontSize: `clamp(8px, ${Math.max(0.5, el.font_size)}cqh, 60cqh)`,
    textAlign: el.align,
    alignItems:
      el.align === "left"
        ? "flex-start"
        : el.align === "right"
          ? "flex-end"
          : "center",
    ...parseCss(el.css),
  };
  if (el.outline) textStyle.WebkitTextStroke = `2px rgba(0,0,0,0.9)`;
  if (el.shadow) textStyle.textShadow = "0 4px 12px rgba(0,0,0,0.85)";

  if (el.kind === "countdown") {
    return <PreviewCountdownText el={el} label={text} />;
  }
  if (el.kind === "icon") {
    return (
      <div className="preview-element-text" style={{ ...textStyle, whiteSpace: "nowrap" }}>
        {el.icon || text}
      </div>
    );
  }
  if (el.kind === "chord") {
    const chordText = transposeChords(text, el.transpose ?? 0);
    return (
      <div className="preview-element-text" style={{ ...textStyle, whiteSpace: "pre-wrap" }}>
        {chordText}
      </div>
    );
  }
  if (el.kind === "scroll") {
    return <PreviewScrollText el={el} text={text} />;
  }
  if (el.kind === "clock" || el.kind === "box" || el.kind === "line" || el.kind === "image") {
    return <PreviewElementView el={el} slide={slide} />;
  }

  if (el.auto_size) {
    return (
      <PreviewAutofitText
        text={text}
        style={textStyle}
        max={el.font_size}
        mode={el.fit_mode ?? "shrink"}
        lineHeight={el.line_height ? `${el.line_height / 100 + 1}` : undefined}
        lineGap={el.line_gap}
        bgColor={el.el_bg_color}
      />
    );
  }
  return (
    <div
      className="preview-element-text"
      style={{
        ...textStyle,
        flexDirection: "column",
        background: el.el_bg_color || undefined,
        lineHeight: el.line_height ? `${el.line_height / 100 + 1}` : undefined,
      }}
    >
      {text.split("\n").map((ln, i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: "100%",
            marginTop: i === 0 ? undefined : `${el.line_gap ?? 0}cqh`,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {ln}
        </span>
      ))}
    </div>
  );
}

function PreviewCountdownText({ el, label }: { el: import("../../lib/types").TemplateElement; label: string }) {
  const [left, setLeft] = useState((el.duration_s ?? 600) * 1000);
  useEffect(() => {
    let end = Date.now() + (el.duration_s ?? 600) * 1000;
    const tick = () => {
      const remain = end - Date.now();
      setLeft(remain);
      if (remain <= 0) {
        end = Date.now() + 2000;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [el.duration_s]);
  const totalSec = Math.max(0, Math.floor(left / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return (
    <div className="preview-element-text" style={{ textAlign: el.align, alignItems: "center" }}>
      {label && <div style={{ fontSize: "0.6em" }}>{label}</div>}
      <div style={{ fontSize: "1.5em", lineHeight: 1 }}>{mm}:{ss}</div>
    </div>
  );
}

function PreviewScrollText({ el, text }: { el: import("../../lib/types").TemplateElement; text: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const vertical = (el.dir ?? "v") === "v";
  const speed = el.speed ?? 30;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let pos = 0;
    let lastId = 0;
    const loop = () => {
      const parent = node.parentElement;
      if (parent) {
        const span = vertical ? parent.clientHeight + node.clientHeight : parent.clientWidth + node.clientWidth;
        pos -= span && speed ? 0.5 * (speed / 30) : 0;
        if (vertical) {
          if (pos < -span) pos = parent.clientHeight;
          node.style.top = `${pos}px`;
        } else {
          if (pos < -span) pos = parent.clientWidth;
          node.style.left = `${pos}px`;
        }
      }
      lastId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(lastId);
  }, [text, speed, vertical]);

  return (
    <div className="preview-element-scroll-wrap">
      <div
        ref={ref}
        className="preview-element-scroll"
        style={{ color: el.color, fontSize: `clamp(8px, ${Math.max(0.5, el.font_size)}cqh, 60cqh)` }}
      >
        {text}
      </div>
    </div>
  );
}

function PreviewElementView({
  el,
  slide,
}: {
  el: import("../../lib/types").TemplateElement;
  slide?: Partial<LiveSlide> | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isRef =
    !!el.visible && el.kind === "text" && REF_TOKEN_RE.test(el.content ?? "");
  const topPx = useAutoRepositionRef(
    hostRef,
    isRef ? el : null,
    slide?.elements,
    { marginPct: 2, track: { text: slide?.text, label: slide?.label } },
  );
  const rect = isRef ? clampReferenceRect(el) : el;
  const style: CSSProperties = {
    left: `${rect.x}%`,
    top: topPx !== null ? `${topPx}px` : `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
    opacity: el.opacity,
    ...parseCss(el.css),
  };
  if (!el.visible) return null;
  if (el.kind === "image") {
    if (!el.content) return null;
    return (
      <div className="preview-layer" style={style}>
        <img className="preview-layer-img" src={convertFileSrc(el.content)} alt="" />
      </div>
    );
  }
  if (el.kind === "box") {
    return (
      <div
        className="preview-layer"
        style={{
          ...style,
          background: el.box_color,
          borderRadius: el.radius ?? 0,
          border: el.color !== "#ffffff" ? `2px solid ${el.color}` : undefined,
        }}
      />
    );
  }
  if (el.kind === "line") {
    const vertical = (el.dir ?? "h") === "v";
    return (
      <div className="preview-layer" style={style}>
        <span
          style={{
            display: "flex",
            width: vertical ? undefined : "100%",
            height: vertical ? "100%" : undefined,
            padding: vertical ? "0 1px" : "1px 0",
            background: el.color,
            borderRadius: 4,
          }}
        />
      </div>
    );
  }
  return (
    <div ref={hostRef} data-el-id={el.id} className="preview-element" style={style}>
      <PreviewElementText el={el} slide={slide} />
    </div>
  );
}

function PreviewAutofitText({
  text,
  style,
  max,
  mode,
  lineHeight,
  lineGap,
  bgColor,
}: {
  text: string;
  style: CSSProperties;
  max: number;
  mode: "shrink" | "grow" | "none";
  lineHeight?: string;
  lineGap?: number;
  bgColor?: string;
}) {
  const { ref, fontSize } = useAutoFitText(text, {
    unit: "cqh",
    minFont: 0.5,
    capFont: Math.max(0.5, max),
    mode,
    padding: 2,
    maxUnit: 60,
  });

  return (
    <div
      className="preview-element-text"
      style={{
        ...style,
        flexDirection: "column",
        background: bgColor || undefined,
        lineHeight,
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
        {text.split("\n").map((ln, i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: "100%",
              marginTop: i === 0 ? undefined : `${lineGap ?? 0}cqh`,
            }}
          >
            {ln}
          </span>
        ))}
      </div>
    </div>
  );
}

const parseTemplateContent = resolveDynamicValue;

export default function PreviewSlide({
  slide,
  playing,
  chroma,
}: {
  slide: LiveSlide | null | undefined;
  playing?: boolean;
  chroma?: boolean;
}) {
  const s: Partial<LiveSlide> = slide ?? {};
  const bgFilter = s.bg_filter || undefined;

  const hasContentFrame = (slide?.elements ?? []).some(
    (el) =>
      el.kind === "text" &&
      /\{(text|scripture|scripture_text)\}/.test(el.content || ""),
  );

  const hasLabelFrame =
    hasContentFrame ||
    (slide?.elements ?? []).some(
      (el) =>
        el.kind === "text" &&
        /\{(label|reference|scripture_reference)\}/.test(el.content || ""),
    );

  const renderBg = () => {
    if (slide?.background) {
      return (
        <div className="preview-bg-wrap" style={{ filter: bgFilter }}>
          <PreviewMedia path={slide.background} mode="bg" chroma={chroma} />
        </div>
      );
    }
    if (slide?.bg_color && slide.bg_color !== "#000000") {
      return (
        <div className="preview-blank" style={{ background: slide.bg_color, filter: bgFilter }} />
      );
    }
    return null;
  };

  if (!slide || slide.kind === "blank") {
    return (
      <>
        {renderBg()}
        <div className="preview-scrim" />
      </>
    );
  }

  if (slide.kind === "media") {
    return <PreviewMedia path={slide.media_path} mode="full" playing={playing} chroma={chroma} />;
  }

  const f = s.formatting;
  const boxed =
    f &&
    (f.box_x !== undefined ||
      f.box_y !== undefined ||
      f.box_w !== undefined ||
      f.box_h !== undefined);

  return (
    <>
      {renderBg()}
      {boxed && f ? (
        <div
          className="preview-textbox"
          style={{
            left: `${f.box_x ?? 0}%`,
            top: `${f.box_y ?? 0}%`,
            width: `${f.box_w ?? 80}%`,
            height: `${f.box_h ?? 80}%`,
            alignItems:
              f.align_h === "left"
                ? "flex-start"
                : f.align_h === "right"
                  ? "flex-end"
                  : "center",
            justifyContent:
              f.align_v === "top"
                ? "flex-start"
                : f.align_v === "bottom"
                  ? "flex-end"
                  : "center",
          }}
        >
          <PreviewFitBlock
            anchor={f.align_v === "top" ? "top" : f.align_v === "bottom" ? "bottom" : "center"}
            style={{
              alignItems:
                f.align_h === "left"
                  ? "flex-start"
                  : f.align_h === "right"
                    ? "flex-end"
                    : "center",
            }}
          >
            {slide.label && !hasLabelFrame && (
              <div className="preview-label">{slide.label}</div>
            )}
            {!hasContentFrame && (
              <div className="preview-lyrics">
                <StyledText
                  text={applyVirtualBreaks(slide.text, false)}
                  overrides={slide.overrides}
                />
              </div>
            )}
          </PreviewFitBlock>
        </div>
      ) : (
        <div
          className="preview-song-overlay"
          style={{
            alignItems:
              s.align === "left"
                ? "flex-start"
                : s.align === "right"
                  ? "flex-end"
                  : "center",
            justifyContent:
              s.position === "top"
                ? "flex-start"
                : s.position === "bottom"
                  ? "flex-end"
                  : "center",
          }}
        >
          <PreviewFitBlock anchor={s.position}>
            {slide.label && !hasLabelFrame && (
              <div className="preview-label">{slide.label}</div>
            )}
            {!hasContentFrame && slide.text !== undefined && (
              <div className="preview-lyrics">
                <StyledText
                  text={applyVirtualBreaks(slide.text, false)}
                  overrides={slide.overrides}
                />
              </div>
            )}
          </PreviewFitBlock>
        </div>
      )}
      {slide.layers?.map((layer) => (
        <PreviewLayerView key={layer.id} layer={layer} />
      ))}
      {slide.elements?.map((el) => (
        <PreviewElementView key={el.id} el={el} slide={slide} />
      ))}
    </>
  );
}
