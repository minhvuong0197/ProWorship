import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LiveTransition } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import PreviewSlide from "./PreviewSlide";

function formatCountdown(end: number | null | undefined): string | null {
  if (!end) return null;
  const remaining = Math.max(0, end - Date.now());
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LivePreview() {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const outputOpen = useAppStore((s) => s.outputOpen);
  const toggleOutput = useAppStore((s) => s.toggleOutput);
  const stageOpen = useAppStore((s) => s.stageOpen);
  const openStage = useAppStore((s) => s.openStage);
  const closeStage = useAppStore((s) => s.closeStage);
  const goLive = useAppStore((s) => s.goLive);
  const advanceLive = useAppStore((s) => s.advanceLive);
  const setMediaPlaying = useAppStore((s) => s.setMediaPlaying);
  const setAudioState = useAppStore((s) => s.setAudioState);
  const stopAudio = useAppStore((s) => s.stopAudio);
  const props = useAppStore((s) => s.props);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [chroma, setChroma] = useState(false);

  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = canvasBoxRef.current;
    if (!el) return;
    let last = "";
    const ro = new ResizeObserver(() => {
      const key = `${el.clientWidth}x${el.clientHeight}`;
      if (key !== last) {
        last = key;
        invoke("gpu_probe", { report: `canvas-size ${key}` }).catch(() => {});
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const current = live?.current;
  const isVideo = current?.media_path
    ? /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(current.media_path)
    : false;

  const setTransition = (transition: LiveTransition) => {
    if (!live) return;
    goLive({ ...live, transition });
  };

  const clearBackground = () => {
    if (!live) return;
    goLive({
      ...live,
      background: null,
      current:
        live.current?.kind === "media"
          ? { kind: "blank", title: "Slide đen" }
          : live.current
            ? { ...live.current, background: undefined }
            : null,
    });
  };

  const countdown = formatCountdown(live?.countdown_end);
  const audio = live?.audio;
  const activeProps = (live?.active_props ?? []).map((p) =>
    props.find((x) => x.id === p.id) ?? p,
  );

  const startEdit = () => {
    setDraft(current?.kind === "song" ? (current.text ?? "") : "");
    setEditing(current?.kind === "song");
  };

  const applyEdit = () => {
    if (!live || live.current?.kind !== "song") return;
    goLive({
      ...live,
      current: { ...live.current, text: draft },
    });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  return (
    <div className="live-preview">
      <div className="preview-bar">
        <button
          type="button"
          className={`preview-bar-btn${current ? " active" : ""}`}
          title={t("preview.win.preview")}
        >
          <span className="preview-bar-dot" />
          <span className="preview-bar-label">{t("preview.win.preview")}</span>
        </button>
        <button
          type="button"
          className={`preview-bar-btn${outputOpen ? " active" : ""}`}
          onClick={() => toggleOutput()}
          title={t("preview.win.output")}
        >
          <span className="preview-bar-dot" />
          <span className="preview-bar-label">{t("preview.win.output")}</span>
        </button>
        <button
          type="button"
          className={`preview-bar-btn${live ? " active" : ""}`}
          title={t("preview.win.live")}
        >
          <span className="preview-bar-dot" />
          <span className="preview-bar-label">{t("preview.win.live")}</span>
        </button>
        <button
          type="button"
          className={`preview-bar-btn${stageOpen ? " active" : ""}`}
          onClick={() => (stageOpen ? closeStage() : openStage())}
          title={t("preview.win.stage")}
        >
          <span className="preview-bar-dot" />
          <span className="preview-bar-label">{t("preview.win.stage")}</span>
        </button>
      </div>
      <div className="preview-canvas" ref={canvasBoxRef}>
        {current ? (
          <PreviewSlide slide={current} playing={live?.media_playing} chroma={chroma} thumbnail />
        ) : (
          <span style={{ color: "#555" }}>{t("preview.none")}</span>
        )}
      </div>

      {live?.next_text && (
        <div className="preview-next">
          <div className="next-label">{t("preview.next")} {live.next_label || ""}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{live.next_text}</div>
        </div>
      )}

      <div className="preview-section">
        <h3>{t("preview.navigation")}</h3>
        <div className="nav-row">
          {current?.kind === "song" && !editing && (
            <button onClick={startEdit} title={t("preview.edit")}>
              ✎ {t("preview.edit")}
            </button>
          )}
          <button onClick={() => advanceLive(-1)} title="←">
            {t("preview.prev")}
          </button>
          <button className="primary" onClick={() => advanceLive(1)} title="→">
            {t("preview.nextBtn")}
          </button>
        </div>
        {editing && (
          <div className="edit-box">
            <textarea
              className="edit-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={applyEdit}
              autoFocus
              rows={6}
            />
            <div className="edit-actions">
              <button className="primary" onMouseDown={(e) => e.preventDefault()} onClick={applyEdit}>
                {t("preview.apply")}
              </button>
              <button onClick={cancelEdit}>{t("preview.cancel")}</button>
              <span className="muted-text">{t("preview.editHint")}</span>
            </div>
          </div>
        )}
        {live?.song_slide_count && live.song_slide_index != null ? (
          <div className="slide-progress">
            {t("preview.slide")}{" "}
            {Math.min((live.song_slide_index ?? 0) + 1, live.song_slide_count)} /{" "}
            {live.song_slide_count}
          </div>
        ) : null}
      </div>

      {current?.kind === "media" && isVideo && (
        <div className="preview-section">
          <h3>{t("preview.video")}</h3>
          <div className="nav-row">
            <button
              onClick={() => setMediaPlaying(live?.media_playing === false)}
            >
              {live?.media_playing === false ? t("preview.play") : t("preview.pause")}
            </button>
            <button
              className={chroma ? "primary" : undefined}
              onClick={() => setChroma((c) => !c)}
              title="Phông xanh"
            >
              {chroma ? "Tắt chroma key" : "Bật chroma key"}
            </button>
          </div>
        </div>
      )}

      {audio && (
        <div className="preview-section">
          <h3>{t("preview.audio")}</h3>
          <div className="audio-controls">
            <span className="audio-title" title={audio.title}>
              {audio.title}
            </span>
            <div className="audio-buttons">
              <button
                className="primary"
                onClick={() => setAudioState(!audio.playing)}
              >
                {audio.playing ? (
                  <Icon name="pause" size={16} />
                ) : (
                  <Icon name="play" size={16} />
                )}
              </button>
              <button onClick={() => stopAudio()}>
                <Icon name="stop" className="btn-ic" />
                {t("preview.stop")}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => setAudioState(undefined, Number(e.target.value))}
              title="♪"
            />
          </div>
        </div>
      )}

      {countdown !== null && (
        <div className="preview-section">
          <h3>{t("preview.countdown")}</h3>
          <div className={`countdown-big ${countdown === "0:00" ? "expired" : ""}`}>
            {countdown}
          </div>
        </div>
      )}

      {activeProps.length > 0 && (
        <div className="preview-section">
          <h3>{t("preview.props")}</h3>
          <div className="active-props">
            {activeProps.map((p) => (
              <span key={p.id} className="active-prop-chip">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="preview-section">
        <h3>{t("preview.transition")}</h3>
        <div className="transition-row">
          <select
            value={live?.transition.kind ?? "fade"}
            onChange={(e) =>
              setTransition({
                ...(live?.transition ?? { kind: "fade", duration_ms: 500 }),
                kind: e.target.value as LiveTransition["kind"],
              })
            }
          >
            <option value="fade">Mờ dần</option>
            <option value="cut">Cắt</option>
          </select>
          <select
            value={live?.transition.duration_ms ?? 500}
            onChange={(e) =>
              setTransition({
                ...(live?.transition ?? { kind: "fade", duration_ms: 500 }),
                duration_ms: Number(e.target.value),
              })
            }
          >
            <option value={200}>200ms</option>
            <option value={400}>400ms</option>
            <option value={500}>500ms</option>
            <option value={800}>800ms</option>
            <option value={1000}>1000ms</option>
          </select>
        </div>
      </div>

      <div className="preview-section">
        <h3>{t("preview.background")}</h3>
        <div className="background-row">
          <span className="bg-name">
            {live?.background
              ? live.background.split(/[\\/]/).pop()
              : t("preview.noBackground")}
          </span>
          <button className="icon" onClick={clearBackground} title={t("preview.clearBackground")}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
