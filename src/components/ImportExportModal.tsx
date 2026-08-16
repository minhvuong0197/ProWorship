import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import Icon from "./Icon/Icon";
import { useT } from "../lib/i18n";
import { useAppStore } from "../store/useAppStore";
import type { Song } from "../lib/types";
import {
  exportSongsJson,
  importSongFiles,
  importSongsFromDir,
  writeExportFile,
  type ImportFormat,
} from "../lib/songImport";

interface Props {
  onClose: () => void;
}

interface Status {
  ok: boolean;
  text: string;
}

export default function ImportExportModal({ onClose }: Props) {
  const t = useT();
  const songs = useAppStore((s) => s.songs);
  const saveSong = useAppStore((s) => s.saveSong);
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [selectedFormat, setSelectedFormat] = useState<string>("propresenter");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const handleImport = async (mode: "files" | "folder") => {
    setBusy(true);
    setStatus(null);
    try {
      let result: { songs: Song[]; errors: string[] };
      if (mode === "folder") {
        const dir = await open({
          directory: true,
          multiple: false,
          defaultPath: "D:/",
        });
        if (!dir) return;
        const dirPath = Array.isArray(dir) ? dir[0] : dir;
        result = await importSongsFromDir(dirPath, selectedFormat as ImportFormat);
      } else {
        const file = await open({
          multiple: true,
          defaultPath: "D:/",
          filters: [
            { name: t("import.songFiles"), extensions: ["pro", "zip", "shows", "sqlite", "osz", "db", "cho", "txt", "xml", "worshipcast", "json"] },
            { name: t("import.allFiles"), extensions: ["*"] }
          ]
        });
        if (!file) return;
        const paths = Array.isArray(file) ? file : [file];
        if (paths.length === 0) return;
        result = await importSongFiles(paths, selectedFormat as ImportFormat);
      }
      const { songs: imported, errors } = result;
      for (const song of imported) await saveSong(song);
      const parts: string[] = [];
      if (imported.length > 0) parts.push(t("import.done", { n: imported.length }));
      if (errors.length > 0) parts.push(t("import.errors", { n: errors.length, list: errors.join("; ") }));
      setStatus({ ok: errors.length === 0, text: parts.join("\n") || t("import.none") });
    } catch (err) {
      setStatus({ ok: false, text: t("import.error", { msg: err instanceof Error ? err.message : String(err) }) });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const filePath = await save({
        title: t("import.exportTitle"),
        defaultPath: "D:/worshipcast_backup.worshipcast",
        filters: [
          { name: t("import.archive"), extensions: ["worshipcast", "zip", "json"] }
        ]
      });
      if (!filePath) return;
      const content = await exportSongsJson(songs);
      await writeExportFile(filePath, content);
      setStatus({ ok: true, text: t("import.exportDone", { n: songs.length, path: filePath }) });
    } catch (err) {
      setStatus({ ok: false, text: t("import.error", { msg: err instanceof Error ? err.message : String(err) }) });
    } finally {
      setBusy(false);
    }
  };

  const handleAction = () => {
    if (activeTab === "export") return handleExport();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("import.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="edit-tabs">
            <button
              className={activeTab === "import" ? "active" : ""}
              onClick={() => { setActiveTab("import"); setStatus(null); }}
            >
              {t("import.tabImport")}
            </button>
            <button
              className={activeTab === "export" ? "active" : ""}
              onClick={() => { setActiveTab("export"); setStatus(null); }}
            >
              {t("import.tabExport")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeTab === "import" && (
              <label className="format-item">
                {t("import.format")}:
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  style={{ width: "100%", padding: 8, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
                >
                  <option value="propresenter">{t("import.fmtProPresenter")}</option>
                  <option value="freeshow">{t("import.fmtFreeShow")}</option>
                  <option value="openlp">{t("import.fmtOpenLp")}</option>
                  <option value="opensong">{t("import.fmtOpenSong")}</option>
                  <option value="easyslides">{t("import.fmtEasySlides")}</option>
                  <option value="easyworship">{t("import.fmtEasyWorship")}</option>
                  <option value="chordpro">{t("import.fmtChordPro")}</option>
                  <option value="worshipcast">{t("import.fmtWorshipCast")}</option>
                </select>
              </label>
            )}

            <div className="muted-text" style={{ fontSize: 12 }}>
              {activeTab === "import"
                ? t("import.hintImport")
                : t("import.hintExport")}
            </div>

            {activeTab === "import" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="primary"
                  onClick={() => handleImport("files")}
                  disabled={busy}
                  style={{ padding: "10px 16px" }}
                >
                  {busy ? t("import.busy") : t("import.selectFiles")}
                </button>
                <button
                  className="primary"
                  onClick={() => handleImport("folder")}
                  disabled={busy}
                  style={{ padding: "10px 16px" }}
                >
                  {busy ? t("import.busy") : t("import.selectFolder")}
                </button>
              </div>
            ) : (
              <button
                className="primary"
                onClick={handleAction}
                disabled={busy}
                style={{ padding: "10px 16px", alignSelf: "flex-start" }}
              >
                {busy ? t("import.busy") : t("import.exportTarget")}
              </button>
            )}

            {status && (
              <div
                style={{
                  color: status.ok ? "var(--success, #4caf50)" : "var(--danger, #ef5350)",
                  fontSize: 13,
                  marginTop: 8,
                  whiteSpace: "pre-line",
                }}
              >
                {status.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
