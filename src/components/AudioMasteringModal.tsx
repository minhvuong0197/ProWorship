import { useState } from "react";
import Icon from "./Icon/Icon";

interface Props {
  onClose: () => void;
}

export default function AudioMasteringModal({ onClose }: Props) {
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
          <h2>Bộ chỉnh âm thanh nâng cao (Audio Mastering & Ducking)</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label className="format-item">
              Chuẩn hóa Loudness (Target LUFS):
              <input
                type="number"
                step={0.5}
                value={targetLufs}
                onChange={(e) => setTargetLufs(Number(e.target.value))}
                style={{ width: "100%", padding: 6, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
              />
              <span className="muted-text" style={{ fontSize: 11 }}>Mặc định -14 LUFS theo chuẩn YouTube/Livestream.</span>
            </label>

            <label className="format-item">
              Compressor Ratio:
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
              Bật Peak Limiter (Chặn vỡ tiếng / clipping)
            </label>
            <label className="check-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={ducking} onChange={(e) => setDucking(e.target.checked)} />
              Bật Audio Ducking (Né âm khi có giọng nói)
            </label>
          </div>

          <div style={{ background: "var(--bg-surface, #1e1e24)", padding: 12, borderRadius: 8, border: "1px solid var(--border, #333)" }}>
            <h4 style={{ margin: "0 0 8px 0" }}>Equalizer 3 Băng (EQ Bass / Mid / Treble)</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label>
                Bass ({bassDb} dB):
                <input type="range" min={-12} max={12} value={bassDb} onChange={(e) => setBassDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
              <label>
                Mid ({midDb} dB):
                <input type="range" min={-12} max={12} value={midDb} onChange={(e) => setMidDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
              <label>
                Treble ({trebleDb} dB):
                <input type="range" min={-12} max={12} value={trebleDb} onChange={(e) => setTrebleDb(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
            </div>
          </div>

          {ducking && (
            <label className="format-item">
              Ducking Reduction (dB):
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
              Lưu cấu hình DSP
            </button>
            {saved && <span style={{ color: "var(--success, #4caf50)", fontSize: 13 }}>Đã lưu thành công!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
