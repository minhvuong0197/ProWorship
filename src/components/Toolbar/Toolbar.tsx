import { useEffect, useState } from "react";
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
  const settings = useAppStore((s) => s.settings);
  const live = useAppStore((s) => s.live);
  const setStageMessage = useAppStore((s) => s.setStageMessage);
  const startCountdown = useAppStore((s) => s.startCountdown);
  const stopCountdown = useAppStore((s) => s.stopCountdown);

  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCcli, setShowCcli] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const [, force] = useState(0);

  useEffect(() => obsClient.subscribe(() => force((n) => n + 1)), []);

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
        </div>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group" title={t("toolbar.stageMessage")}>
        <input
          className="toolbar-input"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("toolbar.stageMessage")}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
        />
        <button onClick={sendMessage} title={t("toolbar.send")}>
          <Icon name="send" className="btn-ic" />
        </button>
        <button onClick={clearMessage} title={t("toolbar.clearMessage")}>
          <Icon name="trash" className="btn-ic" />
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group" title={t("toolbar.countdown")}>
        <input
          className="toolbar-num"
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          title={t("toolbar.minutes")}
        />
        <span className="toolbar-colon">:</span>
        <input
          className="toolbar-num"
          type="number"
          min={0}
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          title={t("toolbar.seconds")}
        />
        <button
          className={countdownRunning ? "danger" : "primary"}
          onClick={() => (countdownRunning ? stopCountdown() : fireCountdown())}
          title={countdownRunning ? t("toolbar.stop") : t("toolbar.start")}
        >
          <Icon name={countdownRunning ? "stop" : "play"} className="btn-ic" />
          {countdownRunning ? t("toolbar.stop") : t("toolbar.start")}
        </button>
      </div>

      {obsConnected && (
        <>
          <div className="toolbar-sep" />
          <div className="toolbar-group" title="OBS">
            {obsClient.action && (
              <span className="toolbar-obs-action">{t(`obs.msg.${obsClient.action}`)}</span>
            )}
            <button
              className={obsClient.streamActive ? "danger" : ""}
              onClick={() => obsClient.toggleStream().catch(() => {})}
              title={obsClient.streamActive ? t("toolbar.stopStream") : t("toolbar.stream")}
            >
              <Icon name="broadcast" className="btn-ic" />
              {obsClient.streamActive ? t("toolbar.stopStream") : t("toolbar.stream")}
            </button>
            <button
              className={obsClient.recordActive ? "danger" : ""}
              onClick={() => obsClient.toggleRecord().catch(() => {})}
              title={obsClient.recordActive ? t("toolbar.stopRecord") : t("toolbar.record")}
            >
              <Icon name="record" className="btn-ic" />
              {obsClient.recordActive ? t("toolbar.stopRecord") : t("toolbar.record")}
            </button>
          </div>
        </>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-actions">
        <button onClick={() => setShowCalendar(true)} title={t("toolbar.calendar")}>
          <Icon name="calendar" size={14} />
          <span>{t("toolbar.calendar")}</span>
        </button>
        <button onClick={() => setShowCcli(true)} title={t("toolbar.ccliReport")}>
          <Icon name="file" size={14} />
          <span>{t("toolbar.ccliReport")}</span>
        </button>
        <button onClick={() => setShowSettings(true)} title={t("toolbar.settings")}>
          <Icon name="gear" size={14} />
          <span>{t("toolbar.settings")}</span>
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCcli && <CcliReportModal onClose={() => setShowCcli(false)} />}
      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
    </header>
  );
}