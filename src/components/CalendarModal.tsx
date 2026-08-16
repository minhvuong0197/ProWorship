import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";

const STORAGE_KEY = "pwcCalendar";

type CalendarEntry = { playlistId: string; title: string };

const WEEKDAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_VI = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];

export default function CalendarModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const playlists = useAppStore((s) => s.playlists);
  const lang = useAppStore((s) => s.settings?.ui_language ?? "vi");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [view, setView] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [pickDate, setPickDate] = useState<string | null>(null);

  const entries = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
        string,
        CalendarEntry
      >;
    } catch {
      return {};
    }
  }, [pickDate]);

  const current = useMemo(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return { startOffset, daysInMonth, y, m };
  }, [view]);

  const dateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const saveEntry = (key: string, playlistId: string) => {
    const current = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      } catch {
        return {};
      }
    })() as Record<string, CalendarEntry>;
    if (playlistId) {
      const p = playlists.find((x) => x.id === playlistId);
      current[key] = { playlistId, title: p?.name ?? playlistId };
    } else {
      delete current[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    setPickDate(null);
  };

  const weekdays = lang === "en" ? WEEKDAYS_EN : WEEKDAYS_VI;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("calendar.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <div className="calendar-nav">
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
              ‹
            </button>
            <span className="calendar-month">
              {t("calendar.month")} {view.getMonth() + 1}/{view.getFullYear()}
            </span>
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {weekdays.map((w) => (
              <div key={w} className="calendar-wd">
                {w}
              </div>
            ))}
            {Array.from({ length: current.startOffset }).map((_, i) => (
              <div key={`b${i}`} className="calendar-day empty" />
            ))}
            {Array.from({ length: current.daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = dateKey(current.y, current.m, day);
              const entry = entries[key];
              const isToday = today.getTime() === new Date(current.y, current.m, day).getTime();
              const isPick = pickDate === key;
              return (
                <div
                  key={key}
                  className={`calendar-day${entry ? " has" : ""}${isToday ? " today" : ""}${isPick ? " pick" : ""}`}
                  onClick={() => setPickDate(isPick ? null : key)}
                >
                  <span className="calendar-num">{day}</span>
                  {entry && <span className="calendar-label">{entry.title}</span>}
                </div>
              );
            })}
          </div>
          {pickDate && (
            <div className="calendar-pick">
              <span>
                {t("calendar.assign")}{" "}
                <b>{pickDate}</b>
              </span>
              <select
                value={entries[pickDate]?.playlistId ?? ""}
                onChange={(e) => saveEntry(pickDate, e.target.value)}
              >
                <option value="">( {t("calendar.none")} )</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {entries[pickDate] && (
                <button className="danger" onClick={() => saveEntry(pickDate, "")}>
                  {t("calendar.clear")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}