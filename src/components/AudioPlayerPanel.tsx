import { useEffect, useState } from "react";
import { audioEngine } from "../lib/audioController";
import type { LoopMode, PlayerState } from "../lib/audioController";
import { useT } from "../lib/i18n";
import { useAppStore } from "../store/useAppStore";
import Icon from "./Icon/Icon";
import AudioMasteringModal from "./AudioMasteringModal";

function useEngineState(): PlayerState {
  const [st, setSt] = useState<PlayerState>(() => audioEngine.getState());
  useEffect(() => audioEngine.subscribe((s) => setSt({ ...s })), []);
  return st;
}

const fmt = (sec: number) => {
  if (!Number.isFinite(sec)) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function AudioPlayerPanel() {
  const t = useT();
  const st = useEngineState();
  const setAudioState = useAppStore((s) => s.setAudioState);
  const [showMastering, setShowMastering] = useState(false);

  if (st.source === "idle" || st.tracks.length === 0) return null;

  const track = st.tracks[st.index];
  const loopNext: LoopMode =
    st.loop === "none" ? "all" : st.loop === "all" ? "single" : "none";
  const loopTitle =
    st.loop === "none"
      ? t("player.loopOff")
      : st.loop === "all"
        ? t("player.loopAll")
        : t("player.loopSingle");

  const onStop = () => {
    if (st.source === "live") setAudioState(false);
    else audioEngine.stop();
  };

  return (
    <div className="audio-player-bar">
      <div className="player-info">
        <div className="player-title" title={track?.title}>
          {track?.title}
        </div>
        <div className="player-meta">
          {st.index + 1} / {st.tracks.length}
        </div>
      </div>
      <div className="player-main">
        <div className="player-controls">
          <button
            className="icon"
            title={t("player.prev")}
            onClick={() => audioEngine.prev()}
          >
            <Icon name="skipBack" size={16} />
          </button>
          <button
            className="icon player-play"
            title={st.playing ? t("player.pause") : t("player.play")}
            onClick={() => audioEngine.togglePlay()}
          >
            <Icon name={st.playing ? "pause" : "play"} size={16} />
          </button>
          <button
            className="icon"
            title={t("player.next")}
            onClick={() => audioEngine.next()}
          >
            <Icon name="skipForward" size={16} />
          </button>
          <button className="icon" title={t("player.stop")} onClick={onStop}>
            <Icon name="stop" size={16} />
          </button>
        </div>
        <div className="player-time">{fmt(st.currentTime)}</div>
        <input
          className="player-seek"
          type="range"
          min={0}
          max={Math.max(0.001, st.duration)}
          step={0.1}
          value={st.currentTime}
          onChange={(e) => audioEngine.seek(Number(e.target.value))}
        />
        <div className="player-time">{fmt(st.duration)}</div>
      </div>
      <div className="player-extras">
        <button
          className={st.loop === "none" ? "icon" : "icon active"}
          title={loopTitle}
          onClick={() => audioEngine.setLoop(loopNext)}
        >
          {st.loop === "single" ? (
            <Icon name="repeatOne" size={16} />
          ) : (
            <Icon name="repeat" size={16} />
          )}
        </button>
        <button
          className={st.shuffle ? "icon active" : "icon"}
          title={t("player.shuffle")}
          onClick={() => audioEngine.setShuffle(!st.shuffle)}
        >
          <Icon name="shuffle" size={16} />
        </button>
        <input
          className="player-volume"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={st.volume}
          onChange={(e) => audioEngine.setVolume(Number(e.target.value))}
          title={t("player.volume")}
        />
        <button
          className="icon"
          title="Audio Mastering & Ducking"
          onClick={() => setShowMastering(true)}
        >
          <Icon name="gear" size={16} />
        </button>
      </div>
      {showMastering && <AudioMasteringModal onClose={() => setShowMastering(false)} />}
    </div>
  );
}
