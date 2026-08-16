import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, LiveState } from "../../lib/types";
import { useT } from "../../lib/i18n";
import ServiceTimeline from "../ServiceTimeline/ServiceTimeline";

function formatCountdown(end: number | null | undefined): string | null {
  if (!end) return null;
  const remaining = Math.max(0, end - Date.now());
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StageView() {
  const t = useT();
  const [live, setLive] = useState<LiveState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    invoke<LiveState>("get_live_state").then(setLive).catch(() => {});
    invoke<AppSettings>("get_settings").then(setSettings).catch(() => {});
    const un1 = listen<LiveState>("live-update", (e) => setLive(e.payload));
    const un2 = listen<AppSettings>("settings-update", (e) => setSettings(e.payload));
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        getCurrentWindow().close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = live?.current;
  const countdown = formatCountdown(live?.countdown_end);
  const showClock = settings?.stage_show_clock ?? true;
  const showNext = settings?.stage_show_next ?? true;
  const showNotes = settings?.stage_show_notes ?? true;
  const showMessage = settings?.stage_show_message ?? true;

  return (
    <div className="stage-root">
      <div className="stage-main">
        <div className="stage-current">
          {current?.kind === "song" && (
            <>
              {current.label && <div className="stage-label">{current.label}</div>}
              <div className="stage-text">{current.text}</div>
            </>
          )}
          {current?.kind === "media" && (
            <div className="stage-media-title">{current.title}</div>
          )}
          {(!current || current.kind === "blank") && (
            <div className="stage-placeholder">{t("stage.blank")}</div>
          )}
        </div>

        {showNotes && current?.notes ? (
          <div className="stage-notes">
            <div className="stage-notes-label">{t("stage.notes")}</div>
            <div className="stage-notes-text">{current.notes}</div>
          </div>
        ) : null}

        {showNext && live?.next_text ? (
          <div className="stage-next">
            {live.next_label && (
              <div className="stage-next-label">
                {t("stage.next")} {live.next_label}
              </div>
            )}
            <div className="stage-next-text">{live.next_text}</div>
          </div>
        ) : null}
      </div>

      <div className="stage-side">
        {showClock && (
          <div className="stage-clock">
            {clock.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        )}
        {countdown !== null && (
          <div
            className={`stage-countdown ${countdown === "0:00" ? "expired" : ""}`}
          >
            {countdown}
          </div>
        )}

        <ServiceTimeline live={live} />

        {showMessage && live?.stage_message ? (
          <div className="stage-message">{live.stage_message}</div>
        ) : null}
      </div>
    </div>
  );
}
