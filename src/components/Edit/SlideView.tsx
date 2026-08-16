import type { CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { EditItem, EditSlide } from "../../lib/types";

const STAGE_W = 1600;
const STAGE_H = 900;

export { STAGE_W, STAGE_H };

export function isVideoPath(path: string): boolean {
  return /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(path);
}

export function RenderItemContent({
  item,
  pxPerVh,
}: {
  item: EditItem;
  pxPerVh: number;
}) {
  const st = item.style;
  if (item.type === "text") {
    const textStyle: CSSProperties = {
      color: st.color ?? "#ffffff",
      fontSize: `${(st.font_size ?? 4) * pxPerVh}px`,
      fontWeight: st.bold ? 700 : 400,
      fontStyle: st.italic ? "italic" : "normal",
      textDecoration: st.underline ? "underline" : undefined,
      textAlign: st.align_h ?? "center",
      lineHeight: st.line_height ?? 1.35,
      letterSpacing: st.letter_spacing ? `${st.letter_spacing}px` : undefined,
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems:
        st.align_h === "left"
          ? "flex-start"
          : st.align_h === "right"
            ? "flex-end"
            : "center",
      justifyContent:
        st.align_v === "top"
          ? "flex-start"
          : st.align_v === "bottom"
            ? "flex-end"
            : "center",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflow: "hidden",
    };
    if (st.outline_enabled)
      textStyle.WebkitTextStroke = `${st.outline_width ?? 2}px ${st.outline_color ?? "#000000"}`;
    if (st.shadow_enabled)
      textStyle.textShadow = `${st.shadow_offset_x ?? 0}px ${st.shadow_offset_y ?? 4}px ${st.shadow_blur ?? 12}px ${st.shadow_color ?? "rgba(0,0,0,0.85)"}`;
    return <div style={textStyle}>{item.content}</div>;
  }
  if (item.type === "image") {
    if (!item.content)
      return (
        <div className="edit-item-placeholder">
          <span className="muted-text">Ảnh</span>
        </div>
      );
    const obj = st.fit_mode === "contain" ? "contain" : st.fit_mode === "fill" ? "fill" : "cover";
    return (
      <img
        className="edit-item-media"
        src={convertFileSrc(item.content)}
        alt=""
        style={{ objectFit: obj }}
      />
    );
  }
  if (item.type === "video") {
    if (!item.content)
      return (
        <div className="edit-item-placeholder">
          <span className="muted-text">Video</span>
        </div>
      );
    const obj = st.fit_mode === "contain" ? "contain" : st.fit_mode === "fill" ? "fill" : "cover";
    return (
      <video
        className="edit-item-media"
        src={convertFileSrc(item.content)}
        muted
        autoPlay={st.autoplay}
        loop={st.loop}
        playsInline
        style={{ objectFit: obj }}
      />
    );
  }
  if (item.type === "shape") {
    return (
      <div
        className="edit-item-shape"
        style={{
          width: "100%",
          height: "100%",
          background: st.bg_color || "#ffffff",
          borderRadius: st.radius ?? 0,
          border: st.border_width
            ? `${st.border_width}px solid ${st.border_color ?? "#ffffff"}`
            : undefined,
        }}
      />
    );
  }
  if (item.type === "audio") {
    return (
      <div className="edit-item-audio-chip">
        <span className="muted-text">Âm thanh</span>
      </div>
    );
  }
  return null;
}

export function RenderSlideContent({
  slide,
  pxPerVh,
}: {
  slide: EditSlide | null | undefined;
  pxPerVh: number;
}) {
  if (!slide) return null;
  return (
    <div className="edit-slide-content">
      <RenderSlideBg slide={slide} />
      {slide.items
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .filter((it) => it.visible)
        .map((it) => (
          <div
            key={it.id}
            className="edit-item-static"
            style={{
              left: `${it.x}%`,
              top: `${it.y}%`,
              width: `${it.w}%`,
              height: `${it.h}%`,
              opacity: it.opacity,
              filter: it.style.filter || undefined,
            }}
          >
            <RenderItemContent item={it} pxPerVh={pxPerVh} />
          </div>
        ))}
    </div>
  );
}

export function RenderSlideBg({ slide }: { slide: EditSlide | null | undefined }) {
  if (!slide) return null;
  if (slide.background) {
    const src = convertFileSrc(slide.background);
    return isVideoPath(slide.background) ? (
      <video
        className="edit-bg-media"
        src={src}
        muted
        autoPlay
        loop
        playsInline
      />
    ) : (
      <img className="edit-bg-media" src={src} alt="" />
    );
  }
  if (slide.bg_color && slide.bg_color !== "#000000") {
    return <div className="edit-bg-color" style={{ background: slide.bg_color }} />;
  }
  return <div className="edit-bg-color" style={{ background: "#000000" }} />;
}
