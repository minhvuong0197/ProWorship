import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, Layer, LiveSlide, LiveState, LiveTransition, Overlay, SlideFormatting, Template, TemplateElement } from "../../lib/types";
import PropsOverlay from "./PropsOverlay";
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

const FALLBACK_TRANSITION: LiveTransition = { kind: "fade", duration_ms: 500 };

function applyOutputOverride(
  slide: LiveSlide | null | undefined,
  tpl?: Template | null,
): LiveSlide | null | undefined {
  if (!slide || !tpl) return slide;
  return {
    ...slide,
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

function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(path);
}

function FitBlock({
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
      setScale((prev) => {
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
      className="output-fitblock"
      style={{ ...style, transform: `scale(${scale})`, transformOrigin: origin }}
    >
      {children}
    </div>
  );
}

function Media({
  path,
  mode,
  playing,
}: {
  path?: string;
  mode: "full" | "bg";
  playing?: boolean;
}) {
  if (!path) return null;
  const src = convertFileSrc(path);
  if (isVideo(path)) {
    return (
      <NativeVideo
        path={path}
        mode={mode}
        playing={playing}
        kind="output"
        className={`media-asset ${mode}`}
      />
    );
  }
  return <img key={src} className={`media-asset ${mode}`} src={src} alt="" />;
}

function LayerView({ layer }: { layer: Layer }) {
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
      <div className="output-layer" style={style}>
        <img className="output-layer-img" src={convertFileSrc(layer.image_path)} alt="" />
      </div>
    );
  }
  return (
    <div className="output-layer" style={style}>
      <div
        className="output-layer-text"
        style={{
          color: layer.color,
          fontSize: `clamp(10px, ${Math.max(1, layer.font_size)}vh, 60vh)`,
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

function ElementText({
  el,
  slide,
}: {
  el: TemplateElement;
  slide?: Partial<LiveSlide> | null;
}) {
  const resolved = resolveDynamicValue(el.content, slide);
  const text = resolved;
  if (el.kind === "text" && !text.trim()) return null;
  if (el.kind === "text" && text.trim() === "Văn bản") return null;
  const textStyle: CSSProperties = {
    color: el.color,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : undefined,
    fontSize: `clamp(8px, ${Math.max(0.5, el.font_size)}vh, 60vh)`,
    textAlign: el.align,
    alignItems:
      el.align === "left"
        ? "flex-start"
        : el.align === "right"
          ? "flex-end"
          : "center",
  };
  if (el.outline)
    textStyle.WebkitTextStroke = `2px rgba(0,0,0,0.9)`;
  if (el.shadow) textStyle.textShadow = "0 4px 12px rgba(0,0,0,0.85)";

  if (el.kind === "countdown") {
    return <ElCountdownText el={el} label={text} />;
  }
  if (el.kind === "icon") {
    return (
      <div className="output-element-text" style={{ ...textStyle, whiteSpace: "nowrap" }}>
        {el.icon || text}
      </div>
    );
  }
  if (el.kind === "chord") {
    const chordText = transposeChords(text, el.transpose ?? 0);
    return (
      <div className="output-element-text" style={{ ...textStyle, whiteSpace: "pre-wrap" }}>
        {chordText}
      </div>
    );
  }
  if (el.kind === "scroll") {
    return <ScrollText el={el} text={text} />;
  }

  if (el.auto_size) {
    return (
      <AutofitText
        text={text}
        max={el.font_size}
        style={textStyle}
        mode={el.fit_mode ?? "shrink"}
        lineHeight={el.line_height ? `${el.line_height / 100 + 1}` : undefined}
        lineGap={el.line_gap}
        bgColor={el.el_bg_color}
      />
    );
  }
  return (
    <div
      className="output-element-text"
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
            marginTop: i === 0 ? undefined : `${el.line_gap ?? 0}vh`,
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

function ElCountdownText({ el, label }: { el: TemplateElement; label: string }) {
  const [left, setLeft] = useState((el.duration_s ?? 600) * 1000);
  useEffect(() => {
    let end = Date.now() + (el.duration_s ?? 600) * 1000;
    const tick = () => {
      const remain = end - Date.now();
      setLeft(remain);
      if (remain <= 0) {
        const start = Date.now() + 2000;
        end = start;
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
    <div className="output-element-text" style={{ textAlign: el.align, alignItems: "center" }}>
      {label && <div style={{ fontSize: "0.5em" }}>{label}</div>}
      <div style={{ fontSize: "1.6em", lineHeight: 1 }}>{mm}:{ss}</div>
    </div>
  );
}

function ScrollText({ el, text }: { el: TemplateElement; text: string }) {
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
    <div className="output-element-scroll-wrap">
      <div ref={ref} className="output-element-scroll" style={{ color: el.color, fontSize: `clamp(8px, ${Math.max(0.5, el.font_size)}vh, 60vh)` }}>
        {text}
      </div>
    </div>
  );
}

function AutofitText({
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
  const fitMode = mode;
  const { ref, fontSize } = useAutoFitText(text, {
    unit: "vh",
    minFont: 0.5,
    capFont: Math.max(0.5, max),
    mode: fitMode,
    padding: 2,
    maxUnit: 60,
  });

  return (
    <div
      className="output-element-text"
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
          fontSize: `clamp(8px, ${fontSize}vh, 60vh)`,
        }}
      >
        {text.split("\n").map((ln, i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: "100%",
              marginTop: i === 0 ? undefined : `${lineGap ?? 0}vh`,
            }}
          >
            {ln}
          </span>
        ))}
      </div>
    </div>
  );
}

function ElementView({
  el,
  slide,
}: {
  el: TemplateElement;
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
      <div className="output-layer" style={style}>
        <img className="output-layer-img" src={convertFileSrc(el.content)} alt="" />
      </div>
    );
  }
  if (el.kind === "box") {
    return (
      <div
        className="output-layer"
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
      <div className="output-layer" style={style}>
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
    <div ref={hostRef} data-el-id={el.id} className="output-element" style={style}>
      <ElementText el={el} slide={slide} />
    </div>
  );
}

function fmtTextStyle(f: SlideFormatting | undefined): CSSProperties {
  const s: CSSProperties = {};
  if (!f) return s;
  if (f.font_family) s.fontFamily = f.font_family;
  if (f.font_size) s.fontSize = `clamp(14px, ${f.font_size}vh, 45vh)`;
  if (f.color) s.color = f.color;
  if (f.bold) s.fontWeight = 700;
  if (f.italic) s.fontStyle = "italic";
  if (f.underline) s.textDecoration = "underline";
  if (f.strike)
    s.textDecoration = f.underline
      ? "underline line-through"
      : "line-through";
  if (f.highlight_color) s.backgroundColor = f.highlight_color;
  if (f.align_h) s.textAlign = f.align_h;
  if (f.line_height) s.lineHeight = f.line_height;
  if (f.letter_spacing !== undefined) s.letterSpacing = `${f.letter_spacing}px`;
  if (f.outline_enabled)
    s.WebkitTextStroke = `${f.outline_width ?? 2}px ${f.outline_color ?? "#000"}`;
  if (f.shadow_enabled)
    s.textShadow = `${f.shadow_offset_x ?? 0}px ${f.shadow_offset_y ?? 4}px ${f.shadow_blur ?? 12}px ${f.shadow_color ?? "rgba(0,0,0,0.85)"}`;
  if (f.opacity !== undefined) s.opacity = f.opacity;
  return s;
}

export function RenderSlide({
  slide,
  playing,
}: {
  slide: LiveSlide | null | undefined;
  playing?: boolean;
}) {
  const s: Partial<LiveSlide> = slide ?? {};
  const overlayStyle: CSSProperties = {};
  if (s.text_color) overlayStyle.color = s.text_color;
  if (s.align) overlayStyle.textAlign = s.align;

  const bgFilter = s.bg_filter || undefined;

  const renderBg = () => {
    if (slide?.background) {
      return (
        <div className="output-bg-wrap" style={{ filter: bgFilter }}>
          <Media path={slide.background} mode="bg" />
        </div>
      );
    }
    if (slide?.bg_color && slide.bg_color !== "#000000") {
      return (
        <div className="output-blank" style={{ background: slide.bg_color, filter: bgFilter }} />
      );
    }
    return null;
  };

  if (!slide || slide.kind === "blank") {
    return (
      <>
        {renderBg()}
        <div className="scrim" />
      </>
    );
  }

  if (slide.kind === "media") {
    return <Media path={slide.media_path} mode="full" playing={playing} />;
  }

  const f = s.formatting;
  const boxed =
    f &&
    (f.box_x !== undefined ||
      f.box_y !== undefined ||
      f.box_w !== undefined ||
      f.box_h !== undefined);

  const hasContentFrame = (slide.elements ?? []).some(
    (el) =>
      el.kind === "text" &&
      /\{(text|scripture|scripture_text)\}/.test(el.content || ""),
  );

  return (
    <>
      {renderBg()}
      {boxed && f ? (
        <div
          className="output-textbox"
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
          <FitBlock
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
          {!hasContentFrame && (
          <div className="output-lyrics" style={fmtTextStyle(f)}>
            <StyledText
              text={applyVirtualBreaks(slide.text, false)}
              overrides={slide.overrides}
            />
          </div>
          )}
          </FitBlock>
        </div>
      ) : (
        <div
          className="song-overlay"
          style={{
            ...overlayStyle,
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
          <FitBlock
            anchor={s.position}
            style={{
              alignItems:
                s.align === "left"
                  ? "flex-start"
                  : s.align === "right"
                    ? "flex-end"
                    : "center",
            }}
          >
          {!hasContentFrame && slide.text !== undefined && (
              <div
                className="output-lyrics"
                style={{
                  ...(s.font_size
                    ? { fontSize: `clamp(16px, ${s.font_size}vh, 45vh)` }
                    : undefined),
                  ...fmtTextStyle(f),
                }}
              >
                <StyledText
                  text={applyVirtualBreaks(slide.text, false)}
                  overrides={slide.overrides}
                />
              </div>
            )}
          </FitBlock>
        </div>
      )}
      {slide.layers?.map((layer) => (
        <LayerView key={layer.id} layer={layer} />
      ))}
      {slide.elements?.map((el) => (
        <ElementView key={el.id} el={el} slide={slide} />
      ))}
    </>
  );
}

function OverlayView({
  overlay,
  countdownEnd,
}: {
  overlay: Overlay;
  countdownEnd?: number | null;
}) {
  const style: CSSProperties = {
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    width: `${overlay.w}%`,
    height: `${overlay.h}%`,
    zIndex: overlay.z_index,
  };

  if (overlay.kind === "logo" || overlay.kind === "watermark") {
    if (!overlay.image_path) return null;
    return (
      <div className="overlay-box" style={style}>
        <img
          className="overlay-img"
          src={convertFileSrc(overlay.image_path)}
          alt=""
          style={{
            opacity: overlay.kind === "watermark" ? 0.7 : 1,
          }}
        />
      </div>
    );
  }

  if (overlay.kind === "countdown") {
    return (
      <div className="overlay-box" style={style}>
        <div className="overlay-countdown">
          <CountdownText end={countdownEnd} />
        </div>
      </div>
    );
  }

  if (overlay.kind === "pip") {
    if (!overlay.image_path) return null;
    return (
      <div className="overlay-box overlay-pip" style={style}>
        <Media path={overlay.image_path} mode="full" />
      </div>
    );
  }

  if (overlay.kind === "ticker") {
    if (!overlay.text) return null;
    const track = (
      <span className="ticker-text" style={{ color: overlay.color }}>
        {overlay.text}
      </span>
    );
    return (
      <div
        className="overlay-box overlay-ticker"
        style={{ ...style, background: overlay.bg_color }}
      >
        <div className="ticker-track">
          {track}
          {track}
        </div>
      </div>
    );
  }

  if (overlay.kind === "lower_third") {
    if (!overlay.text) return null;
    return (
      <div className="overlay-box" style={style}>
        <div
          className="overlay-lowerthird"
          style={{ background: overlay.bg_color, color: overlay.color }}
        >
          {overlay.text}
        </div>
      </div>
    );
  }

  // banner
  if (!overlay.text) return null;
  return (
    <div className="overlay-box" style={style}>
      <div
        className="overlay-banner"
        style={{ background: overlay.bg_color, color: overlay.color }}
      >
        {overlay.text}
      </div>
    </div>
  );
}

function OverlaysView({
  overlays,
  countdownEnd,
}: {
  overlays?: Overlay[];
  countdownEnd?: number | null;
}) {
  if (!overlays || overlays.length === 0) return null;
  return (
    <div className="overlays-layer">
      {overlays.map((o) => (
        <OverlayView key={o.id} overlay={o} countdownEnd={countdownEnd} />
      ))}
    </div>
  );
}

function CountdownText({ end }: { end?: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  if (!end) return null;
  const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className={remaining <= 10 ? "overlay-countdown-warn" : undefined}>
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

export default function OutputView() {
  const [live, setLive] = useState<LiveState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [slideKey, setSlideKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    invoke<LiveState>("get_live_state")
      .then((s) => {
        if (!disposed) setLive(s);
      })
      .catch(() => {});
    invoke<AppSettings>("get_settings")
      .then((s) => {
        if (!disposed) setSettings(s);
      })
      .catch(() => {});
    invoke<Template[]>("get_templates")
      .then((t) => {
        if (!disposed) setTemplates(t);
      })
      .catch(() => {});

    const un = listen<LiveState>("live-update", (e) => {
      setLive((prev) => {
        const same =
          prev &&
          JSON.stringify(prev.current) === JSON.stringify(e.payload.current);
        if (!same) setSlideKey((k) => k + 1);
        return e.payload;
      });
    });
    const unSettings = listen<AppSettings>("settings-update", (e) => {
      setSettings(e.payload);
    });
    const unTemplates = listen<Template[]>("templates-updated", (e) => {
      setTemplates(e.payload);
    });
    const unRefresh = listen<LiveState>("output-refresh", (e) => {
      setLive(e.payload);
      setSlideKey((k) => k + 1);
    });

    const onKey = (e: KeyboardEvent) => {
      switch (e.code) {
        case "Space":
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          invoke("advance_live", { dir: 1 }).catch(() => {});
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          invoke("advance_live", { dir: -1 }).catch(() => {});
          break;
        case "KeyM":
          if (e.ctrlKey) {
            e.preventDefault();
            invoke<LiveState>("get_live_state")
              .then((s) => {
                const vol = s.audio?.volume ?? 0;
                invoke("set_audio_state", { volume: vol > 0 ? 0 : 1 }).catch(
                  () => {},
                );
              })
              .catch(() => {});
          }
          break;
        case "Escape":
          getCurrentWindow().close();
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      un.then((f) => f());
      unSettings.then((f) => f());
      unTemplates.then((f) => f());
      unRefresh.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const overrideTpl = settings?.output_template_id
    ? templates.find((t) => t.id === settings.output_template_id) ?? null
    : null;
  const current = applyOutputOverride(live?.current, overrideTpl);

  const transition = live?.transition ?? FALLBACK_TRANSITION;
  const animStyle =
    transition.kind === "fade"
      ? { animation: `slideIn ${transition.duration_ms}ms ease` }
      : {};

  return (
    <div className="output-root">
      <div key={slideKey} className="output-slide" style={animStyle}>
        <RenderSlide slide={current} playing={live?.media_playing} />
      </div>
      <PropsOverlay props={live?.active_props} />
      <OverlaysView overlays={live?.active_overlays} countdownEnd={live?.countdown_end} />
      {live?.countdown_end && !(live.active_overlays ?? []).some((o) => o.kind === "countdown") ? (
        <div className="output-countdown-global">
          <CountdownText end={live.countdown_end} />
        </div>
      ) : null}
    </div>
  );
}
