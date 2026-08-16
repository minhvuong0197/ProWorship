import { useCallback, useState } from "react";
import type { CSSProperties, WheelEvent } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import PreviewSlide from "../LivePreview/PreviewSlide";
import type { LiveSlide } from "../../lib/types";
import { defaultLive, resolveArrangementOrder, songSlideLive } from "../../lib/live";

function isVideo(path: string | undefined): boolean {
  return /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(path ?? "");
}

const SECTION_COLORS = {
  blank: "#8a8f98",
  verse: "#4f8cff",
  chorus: "#c244b0",
  tag: "#e5534b",
  bridge: "#9b6bff",
} as const;

function sectionColor(slide: LiveSlide | null | undefined): string {
  if (!slide || slide.kind === "blank" || !slide.text?.trim()) {
    return SECTION_COLORS.blank;
  }
  const s = (slide.label ?? "").toLowerCase();
  if (/đk|điệp|chorus|refrain|chorus/i.test(s)) return SECTION_COLORS.chorus;
  if (/tag/i.test(s)) return SECTION_COLORS.tag;
  if (/bridge/i.test(s)) return SECTION_COLORS.bridge;
  return SECTION_COLORS.verse;
}

export default function Presentation() {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const songs = useAppStore((s) => s.songs);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const gotoSlide = useAppStore((s) => s.gotoSlide);

  const [chroma, setChroma] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const cols = Math.max(1, Math.min(8, Math.round(2 / zoom)));

  const current = live?.current ?? null;
  const video = isVideo(current?.media_path);
  const slideIndex = live?.song_slide_index ?? -1;

  const song =
    live?.song_id != null ? songs.find((s) => s.id === live.song_id) ?? null : null;
  const order =
    live?.slide_order && live.slide_order.length > 0
      ? live.slide_order
      : resolveArrangementOrder(song, live?.arrangement_id ?? null);
  const base = live ?? defaultLive(settings);

  const slides = song
    ? order.map((id, i) => ({
        id,
        slide: songSlideLive(
          song,
          i,
          song.title,
          base,
          settings,
          templates,
          live?.arrangement_id ?? null,
        ).current,
      }))
    : [];

  const handleGridWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }, []);

  const setZoomTo = (z: number) =>
    setZoom(Math.min(2, Math.max(0.25, Math.round(z * 100) / 100)));

  return (
    <div className="presentation">
      <div className="presentation-head">
        <div className="presentation-info">
          <div className="presentation-title">
            {current?.title || song?.title || t("presentation.title")}
          </div>
          {live?.song_slide_count ? (
            <div className="presentation-count">
              {Math.min(slideIndex + 1, live.song_slide_count)} /{" "}
              {live.song_slide_count}
            </div>
          ) : null}
        </div>
        <div className="presentation-actions">
          {video && (
            <button
              className={chroma ? "primary" : undefined}
              onClick={() => setChroma((c) => !c)}
              title="Phông xanh"
            >
              {chroma ? "Tắt chroma" : "Bật chroma"}
            </button>
          )}
          <button
            onClick={() => setZoomTo(zoom - 0.05)}
            title={t("presentation.zoomOut")}
          >
            −
          </button>
          <span className="presentation-zoom">{Math.round(zoom * 100)}%</span>
          <input
            className="presentation-zoom-slider"
            type="range"
            min={0.25}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomTo(Number(e.target.value))}
            title={t("presentation.zoomSlider")}
          />
          <button
            onClick={() => setZoomTo(zoom + 0.05)}
            title={t("presentation.zoomIn")}
          >
            +
          </button>
        </div>
      </div>

      <div
        className="presentation-grid-wrap"
        onWheel={handleGridWheel}
      >
        {slides.length === 0 ? (
          <div className="presentation-empty">
            <span className="empty-hint">{t("presentation.empty")}</span>
          </div>
        ) : (
          <div
            className="presentation-grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            } as CSSProperties}
          >
            {slides.map(({ id, slide }, i) => (
              <button
                key={id}
                className={`presentation-grid-item${
                  i === slideIndex ? " live" : ""
                }`}
                onClick={() => gotoSlide(i)}
                title={slide?.label || `${i + 1}`}
              >
                <span className="presentation-grid-thumb">
                  {slide?.label ? (
                    <span className="presentation-grid-tag">{slide.label}</span>
                  ) : null}
                  <PreviewSlide slide={slide} thumbnail />
                  <span
                    className="presentation-grid-strip"
                    style={{ background: sectionColor(slide) }}
                  />
                </span>
                <span className="presentation-grid-footer">
                  <span className="presentation-grid-index">{i + 1}</span>
                  <span className="presentation-grid-title">
                    {slide?.label || `${i + 1}`}
                  </span>
                  {i === slideIndex && (
                    <span className="presentation-grid-live">
                      <Icon name="play" size={11} />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
         )}
      </div>
    </div>
  );
}