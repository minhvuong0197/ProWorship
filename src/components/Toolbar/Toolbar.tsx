import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import SettingsModal from "../Settings/SettingsModal";
import CcliReportModal from "../CcliReportModal";
import CalendarModal from "../CalendarModal";
import { obsClient } from "../../lib/obs";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";

interface Props {
  onOpenShortcuts: () => void;
}

export default function Toolbar({ onOpenShortcuts }: Props) {
  const t = useT();
  const monitors = useAppStore((s) => s.monitors);
  const live = useAppStore((s) => s.live);
  const outputOpen = useAppStore((s) => s.outputOpen);
  const toggleOutput = useAppStore((s) => s.toggleOutput);
  const clearLive = useAppStore((s) => s.clearLive);
  const setStageMessage = useAppStore((s) => s.setStageMessage);
  const startCountdown = useAppStore((s) => s.startCountdown);
  const stopCountdown = useAppStore((s) => s.stopCountdown);

  const [monitorName, setMonitorName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCcli, setShowCcli] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const moreRef = useRef<HTMLDivElement>(null);
  const moreToggleRef = useRef<HTMLButtonElement>(null);
  const [, force] = useState(0);

  useEffect(() => obsClient.subscribe(() => force((n) => n + 1)), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as Node;
      if (moreRef.current?.contains(el)) return;
      if (moreToggleRef.current?.contains(el)) return;
      setShowMore(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const obsConnected = obsClient.status === "connected";
  const countdownRunning = Boolean(live?.countdown_end);

  const sendMessage = () => setStageMessage(message);

  const clearMessage = () => {
    setStageMessage("");
    setMessage("");
  };

  const fireCountdown = () => {
    const total = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
    if (total <= 0) return;
    startCountdown(total);
  };

  const open = (fn: () => void) => {
    setShowMore(false);
    fn();
  };

  return (
    <header className="toolbar">
      <div className="toolbar-side toolbar-left">
        <div className="toolbar-actions">
          <button
            onClick={() => onOpenShortcuts()}
            title={`${t("toolbar.shortcuts")} (Ctrl+/)`}
          >
            <Icon name="keyboard" size={14} />
          </button>
          <button
            ref={moreToggleRef}
            onClick={() => setShowMore((v) => !v)}
            title={t("toolbar.more")}
          >
            <Icon name="more" size={14} />
            <span>{t("toolbar.more")}</span>
          </button>
        </div>
      </div>

      <div className="toolbar-spacer" />

      {showMore && (
        <div className="toolbar-more" ref={moreRef}>
          <div className="toolbar-more-row">
            <span>{t("toolbar.output")}</span>
            <select
              value={monitorName ?? ""}
              onChange={(e) => setMonitorName(e.target.value || null)}
            >
              <option value="">{t("toolbar.defaultMonitor")}</option>
              {monitors.map((m) => (
                <option key={m.name ?? `${m.x}-${m.y}`} value={m.name ?? ""}>
                  {m.name ?? t("toolbar.monitor")} ({m.width}x{m.height})
                </option>
              ))}
            </select>
            <button
              className={outputOpen ? "primary" : ""}
              onClick={() => toggleOutput(monitorName)}
            >
              <Icon name={outputOpen ? "x" : "screen"} className="btn-ic" />
              {outputOpen ? t("toolbar.closeOutput") : t("toolbar.openOutput")}
            </button>
          </div>

          <div className="toolbar-more-row">
            <span>{t("toolbar.stageMessage")}</span>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("toolbar.stageMessage")}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <button onClick={sendMessage}>
              <Icon name="send" className="btn-ic" />
              {t("toolbar.send")}
            </button>
            <button onClick={clearMessage}>
              <Icon name="trash" className="btn-ic" />
              {t("toolbar.clearMessage")}
            </button>
          </div>

          <div className="toolbar-more-row">
            <span>{t("toolbar.countdown")}</span>
            <input
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              title={t("toolbar.minutes")}
              style={{ width: 58 }}
            />
            <input
              type="number"
              min={0}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              title={t("toolbar.seconds")}
              style={{ width: 58 }}
            />
            <button
              className={countdownRunning ? "danger" : "primary"}
              onClick={() => (countdownRunning ? stopCountdown() : fireCountdown())}
            >
              <Icon name={countdownRunning ? "stop" : "play"} className="btn-ic" />
              {countdownRunning ? t("toolbar.stop") : t("toolbar.start")}
            </button>
          </div>

          {obsConnected && (
            <div className="toolbar-more-row">
              <span>OBS</span>
              {obsClient.action && (
                <span className="obs-action">{t(`obs.msg.${obsClient.action}`)}</span>
              )}
              <button
                className={obsClient.streamActive ? "danger" : ""}
                onClick={() => obsClient.toggleStream().catch(() => {})}
              >
                <Icon name="broadcast" className="btn-ic" />
                {obsClient.streamActive ? t("toolbar.stopStream") : t("toolbar.stream")}
              </button>
              <button
                className={obsClient.recordActive ? "danger" : ""}
                onClick={() => obsClient.toggleRecord().catch(() => {})}
              >
                <Icon name="record" className="btn-ic" />
                {obsClient.recordActive ? t("toolbar.stopRecord") : t("toolbar.record")}
              </button>
            </div>
          )}

          <div className="toolbar-more-row toolbar-more-actions">
            <button onClick={() => open(() => setShowCalendar(true))}>
              <Icon name="calendar" className="btn-ic" />
              {t("toolbar.calendar")}
            </button>
            <button onClick={() => open(() => setShowCcli(true))}>
              <Icon name="file" className="btn-ic" />
              {t("toolbar.ccliReport")}
            </button>
            <button onClick={() => open(() => setShowSettings(true))}>
              <Icon name="gear" className="btn-ic" />
              {t("toolbar.settings")}
            </button>
            <button className="danger" onClick={() => open(() => clearLive())}>
              <Icon name="trash" className="btn-ic" />
              {t("toolbar.clearLive")}
            </button>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCcli && <CcliReportModal onClose={() => setShowCcli(false)} />}
      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
    </header>
  );
}

