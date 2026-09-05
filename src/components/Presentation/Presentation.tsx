import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import PreviewSlide from "../LivePreview/PreviewSlide";
import type { LiveSlide, LiveState } from "../../lib/types";
import { api } from "../../lib/api";
import {
  defaultLive,
  presentBibleLive,
  resolveArrangementOrder,
  songSlideLive,
} from "../../lib/live";
import { DRAG_BIBLE, DRAG_MEDIA, DRAG_SONG } from "../../lib/nav";

interface GridSlide {
  id: string;
  slide: LiveSlide | null;
  verse?: number;
  footerLabel?: string;
}

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
  const goLive = useAppStore((s) => s.goLive);
  const armLive = useAppStore((s) => s.armLive);
  const armedLive = useAppStore((s) => s.armedLive);

  const [chroma, setChroma] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [dragOver, setDragOver] = useState(false);
  const [bibleRangeSlides, setBibleRangeSlides] = useState<GridSlide[] | null>(null);
  const cols = Math.max(1, Math.min(8, Math.round(2 / zoom)));

  const current = live?.current ?? null;
  const video = isVideo(current?.media_path);

  const song =
    live?.song_id != null ? songs.find((s) => s.id === live.song_id) ?? null : null;
  const order =
    live?.slide_order && live.slide_order.length > 0
      ? live.slide_order
      : resolveArrangementOrder(song, live?.arrangement_id ?? null);
  const base = live ?? defaultLive(settings);

  const currentBibleRef = current?.bible_ref ?? null;
  const bibleRange =
    currentBibleRef && currentBibleRef.split("|").length >= 8
      ? (() => {
          const p = currentBibleRef.split("|");
          return {
            abbrev: p[0],
            chapter: parseInt(p[1], 10),
            currentVerse: parseInt(p[2], 10),
            rangeStart: parseInt(p[6], 10),
            rangeEnd: parseInt(p[7], 10),
          };
        })()
      : null;
  const bibleRangeChapterKey = bibleRange
    ? `${bibleRange.abbrev}|${bibleRange.chapter}|${live?.bible_version ?? ""}`
    : null;

  useEffect(() => {
    if (!bibleRange || !currentBibleRef) {
      setBibleRangeSlides(null);
      return;
    }
    let cancelled = false;
    const { abbrev, chapter, rangeStart, rangeEnd } = bibleRange;
    const p = currentBibleRef.split("|");
    const reference = `${p[4] ?? ""} ${chapter}:${rangeStart}${
      rangeStart !== rangeEnd ? `-${rangeEnd}` : ""
    }`;
    const fetchChapter = live?.bible_version
      ? api.getBibleChapterVersion(live.bible_version, abbrev, chapter)
      : api.getBibleChapter(abbrev, chapter);
    fetchChapter
      .then((ch) => {
        if (cancelled) return;
        const styleBase = current ?? {};
        const list: GridSlide[] = [];
        for (let v = rangeStart; v <= rangeEnd; v++) {
          const text = ch.verses[v - 1];
          if (!text?.trim()) continue;
          list.push({
            id: `bible-${v}`,
            verse: v,
            footerLabel: `${p[4] ?? ""} ${chapter}:${v}`,
            slide: {
              ...styleBase,
              kind: "song",
              title: reference,
              label: reference,
              text: `${v} ${text}`,
              bible_ref: `${abbrev}|${chapter}|${v}|${v}|${p[4] ?? ""}|${p[5] ?? ""}|${rangeStart}|${rangeEnd}`,
            },
          });
        }
        setBibleRangeSlides(list);
      })
      .catch(() => {
        if (!cancelled) setBibleRangeSlides(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleRangeChapterKey]);

  const slides: GridSlide[] = song
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
    : bibleRange && bibleRangeSlides && bibleRangeSlides.length > 0
      ? bibleRangeSlides
      : current
        ? [{ id: "current", slide: current, footerLabel: current.label }]
        : [];

  const slideIndex =
    live?.song_slide_index != null
      ? live.song_slide_index
      : bibleRange
        ? bibleRangeSlides?.findIndex((s) => s.verse === bibleRange.currentVerse) ?? -1
        : -1;

  const selectGridItem = (item: GridSlide, i: number) => {
    if (song) {
      gotoSlide(i);
    } else if (item.verse != null && item.slide?.bible_ref) {
      goLive({ ...base, current: item.slide });
    }
  };

  const armGridItem = (item: GridSlide, i: number) => {
    if (!item.slide) return;
    const armed: LiveState = {
      ...base,
      current: item.slide,
      song_slide_index: song ? i : base.song_slide_index,
      song_slide_count: song ? slides.length : base.song_slide_count,
    };
    armLive(armed);
  };

  const gridWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const songRaw = e.dataTransfer.getData(DRAG_SONG);
    if (songRaw) {
      try {
        const { songId } = JSON.parse(songRaw) as { songId: string };
        const song = songs.find((s) => s.id === songId);
        if (song) {
          goLive(songSlideLive(song, 0, song.title, base, settings, templates));
        }
      } catch {
        /* ignore malformed payload */
      }
      return;
    }
    const bibleRaw = e.dataTransfer.getData(DRAG_BIBLE);
    if (bibleRaw) {
      try {
        goLive(presentBibleLive(live, settings, templates, JSON.parse(bibleRaw)));
      } catch {
        /* ignore malformed payload */
      }
      return;
    }
    const mediaPath = e.dataTransfer.getData(DRAG_MEDIA);
    if (mediaPath) {
      const mediaBase = live ?? defaultLive(settings);
      const hasText =
        mediaBase.current?.kind !== "media" &&
        !!mediaBase.current?.text?.trim();
      goLive({
        ...mediaBase,
        current: hasText && mediaBase.current
          ? {
              ...mediaBase.current,
              media_path: mediaPath,
              background: mediaPath,
            }
          : {
              kind: "media",
              title: mediaPath,
              media_path: mediaPath,
              background: mediaPath,
            },
        next_text: null,
        next_label: null,
        background: mediaPath,
        media_playing: true,
        playlist_id: null,
        playlist_entry_index: null,
      });
    }
  };

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
          ) : bibleRange && slides.length > 1 ? (
            <div className="presentation-count">
              {Math.max(0, slideIndex) + 1} / {slides.length}
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
        </div>
      </div>

      <div
        ref={gridWrapRef}
        className={`presentation-grid-wrap${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOver(false);
          }
        }}
        onDrop={handleDrop}
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
            {slides.map((item, i) => (
              <button
                key={item.id}
                className={`presentation-grid-item${
                  i === slideIndex ? " live" : ""
                }${
                  armedLive?.current?.text === item.slide?.text ? " armed" : ""
                }`}
                onClick={() => selectGridItem(item, i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  armGridItem(item, i);
                }}
                title={item.slide?.label || `${i + 1}`}
              >
                <span className="presentation-grid-thumb">
                  <PreviewSlide slide={item.slide} thumbnail />
                  <span
                    className="presentation-grid-strip"
                    style={{ background: sectionColor(item.slide) }}
                  />
                </span>
                <span className="presentation-grid-footer">
                  <span className="presentation-grid-index">{i + 1}</span>
                  <span className="presentation-grid-title">
                    {item.footerLabel || item.slide?.label || `${i + 1}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
         )}
      </div>
    </div>
  );
}