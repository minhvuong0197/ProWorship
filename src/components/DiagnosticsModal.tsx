import { useMemo } from "react";
import type { DiagnosticEntry } from "../store/useAppStore";
import type { LiveState, OutputWindowInfo } from "../lib/types";
import Icon from "./Icon/Icon";

interface Props {
  onClose: () => void;
  diagnostics: DiagnosticEntry[];
  outputs: OutputWindowInfo[];
  outputOpen: boolean;
  stageOpen: boolean;
  ndiInputActive: boolean;
  live: LiveState | null;
}

export default function DiagnosticsModal({
  onClose,
  diagnostics,
  outputs,
  outputOpen,
  stageOpen,
  ndiInputActive,
  live,
}: Props) {
  const report = useMemo(() => {
    const lines = [
      "ProWorship diagnostics",
      `Generated: ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      `Output: ${outputOpen ? "ON" : "OFF"}`,
      `Stage: ${stageOpen ? "ON" : "OFF"}`,
      `NDI input: ${ndiInputActive ? "ON" : "OFF"}`,
      `Live kind: ${live?.current?.kind ?? "none"}`,
      `Live title: ${live?.current?.title ?? "none"}`,
      `Output windows: ${outputs.map((item) => `${item.label}=${item.monitor ?? "default"}`).join(", ") || "none"}`,
      "",
      "Recent errors:",
      ...(diagnostics.length > 0
        ? diagnostics.map((entry) => `[${new Date(entry.at).toISOString()}] ${entry.message}`)
        : ["none"]),
    ];
    return lines.join("\n");
  }, [diagnostics, live, ndiInputActive, outputOpen, outputs, stageOpen]);

  const download = () => {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proworship-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal diagnostics-modal" role="dialog" aria-modal="true" aria-label="Diagnostics">
        <div className="modal-head">
          <h2>Diagnostics</h2>
          <button className="icon" onClick={onClose} title="Đóng">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="diagnostics-status">
          <span className={outputOpen ? "online" : "offline"}>Output {outputOpen ? "ON" : "OFF"}</span>
          <span className={stageOpen ? "online" : "idle"}>Stage {stageOpen ? "ON" : "OFF"}</span>
          <span className={ndiInputActive ? "online" : "idle"}>NDI {ndiInputActive ? "ON" : "OFF"}</span>
        </div>
        <pre className="diagnostics-report">{report}</pre>
        <div className="modal-actions">
          <button onClick={download}>
            <Icon name="file" className="btn-ic" />
            Tải report
          </button>
          <button className="primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
