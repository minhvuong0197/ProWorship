import { useState } from "react";
import Icon from "./Icon/Icon";
import { useT } from "../lib/i18n";

interface Props {
  onClose: () => void;
}

export default function AudioMasteringModal({ onClose }: Props) {
  const t = useT();
  const [targetLufs, setTargetLufs] = useState(-14.0);
  const [limiter, setLimiter] = useState(true);
  const [compressorRatio, setCompressorRatio] = useState(2.0);
  const [bassDb, setBassDb] = useState(0);
  const [midDb, setMidDb] = useState(0);
  const [trebleDb, setTrebleDb] = useState(0);
  const [ducking, setDucking] = useState(false);
  const [duckingReduction, setDuckingReduction] = useState(-12);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("audio.mastering.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label className="format-item">
              {t("audio.mastering.lufs")}:
              <input
                type="number"
                step={0.5}
                value={targetLufs}
                onChange={(e) => setTargetLufs(Number(e.target.value))}
                style={{ width: "100%", padding: 6, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
              />
              <span className="muted-text" style={{ fontSize: 11 }}>{t("audio.mastering.lufsHint")}</span>
            </label>

            <label className="format-item">
              {t("audio.mastering.compressor")}:
              <input
                type="number"
                step={0.5}
                min={1}
                max={20}
                value={compressorRatio}
                onChange={(e) => setCompressorRatio(Number(e.target.value))}
                style={{ width: "100%", padding: 6, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 20 }}>
            <label className="check-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={limiter} onChange={(e) => setLimiter(e.target.checked)} />
              {t("audio.mastering.limiter")}
            </label>
            <label className="check-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={ducking} onChange={(e) => setDucking(e.target.checked)} />
              {t("audio.mastering.ducking")}
            </label>
          </div>

          <div style={{ background: "var(--bg-surface, #1e1e24)", padding: 12, borderRadius: 8, border: "1px solid var(--border, #333)" }}>
            <h4 style={{ margin: "0 0 8px 0" }}>{t("audio.mastering.eq")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label>
                {t("audio.mastering.bass")} ({bassDb} dB):
                <input type="range" min={-12} max={12} value={bassDb} onChange={(e) => setBassDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
              <label>
                {t("audio.mastering.mid")} ({midDb} dB):
                <input type="range" min={-12} max={12} value={midDb} onChange={(e) => setMidDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
              <label>
                {t("audio.mastering.treble")} ({trebleDb} dB):
                <input type="range" min={-12} max={12} value={trebleDb} onChange={(e) => setTrebleDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
            </div>
          </div>

          {ducking && (
            <label className="format-item">
              {t("audio.mastering.duckingReduction")}:
              <input
                type="number"
                value={duckingReduction}
                onChange={(e) => setDuckingReduction(Number(e.target.value))}
                style={{ width: "100%", padding: 6, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
              />
            </label>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="primary" onClick={handleSave} style={{ padding: "8px 16px" }}>
              {t("audio.mastering.save")}
            </button>
            {saved && <span style={{ color: "var(--success, #4caf50)", fontSize: 13 }}>{t("audio.mastering.saved")}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
