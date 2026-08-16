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
            { name: "Song / Worship Files", extensions: ["pro", "zip", "shows", "sqlite", "osz", "db", "cho", "txt", "xml", "worshipcast", "json"] },
            { name: "All Files", extensions: ["*"] }
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
      if (imported.length > 0) parts.push(`Đã import ${imported.length} bài hát vào thư viện.`);
      if (errors.length > 0) parts.push(`${errors.length} file bị lỗi: ${errors.join("; ")}`);
      setStatus({ ok: errors.length === 0, text: parts.join("\n") || "Không tìm thấy dữ liệu bài hát trong file." });
    } catch (err) {
      setStatus({ ok: false, text: `Lỗi: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const filePath = await save({
        title: "Xuất WorshipCast Archive",
        defaultPath: "D:/worshipcast_backup.worshipcast",
        filters: [
          { name: "WorshipCast Archive", extensions: ["worshipcast", "zip", "json"] }
        ]
      });
      if (!filePath) return;
      const content = await exportSongsJson(songs);
      await writeExportFile(filePath, content);
      setStatus({ ok: true, text: `Đã xuất ${songs.length} bài hát tới: ${filePath}` });
    } catch (err) {
      setStatus({ ok: false, text: `Lỗi: ${err instanceof Error ? err.message : String(err)}` });
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
          <h2>{t("toolbar.ccliReport")} / Import & Export Đa định dạng</h2>
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
              Nhập dữ liệu (Import)
            </button>
            <button
              className={activeTab === "export" ? "active" : ""}
              onClick={() => { setActiveTab("export"); setStatus(null); }}
            >
              Xuất dữ liệu (Export)
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeTab === "import" && (
              <label className="format-item">
                Chọn định dạng phần mềm / chuẩn:
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  style={{ width: "100%", padding: 8, marginTop: 4, background: "var(--bg-surface, #1e1e24)", color: "#fff", border: "1px solid var(--border, #333)", borderRadius: 6 }}
                >
                  <option value="propresenter">ProPresenter (XML .pro4/.pro5/.pro6, JSON .pro/.json)</option>
                  <option value="freeshow">FreeShow Shows (.shows / .json)</option>
                  <option value="openlp">OpenLP / OpenLyrics (.xml)</option>
                  <option value="opensong">OpenSong (.xml)</option>
                  <option value="easyslides">EasySlides (.xml)</option>
                  <option value="easyworship">EasyWorship Songs (.db / .sqlite)</option>
                  <option value="chordpro">ChordPro Text (.cho / .txt)</option>
                  <option value="worshipcast">WorshipCast Archive (.worshipcast / .json)</option>
                </select>
              </label>
            )}

            <div className="muted-text" style={{ fontSize: 12 }}>
              {activeTab === "import"
                ? "Hỗ trợ OpenLP/OpenLyrics, OpenSong, EasySlides, ProPresenter (XML + JSON), FreeShow, ChordPro và text. File nhị phân (.sqlite / .db / .pro zip / .osz) chưa hỗ trợ. Có thể chọn nhiều file (Ctrl/Shift + click) hoặc cả thư mục để import tất cả bài hát."
                : "Xuất toàn bộ thư viện bài hát ra file .worshipcast (JSON nén) về ổ D/C."}
            </div>

            {activeTab === "import" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="primary"
                  onClick={() => handleImport("files")}
                  disabled={busy}
                  style={{ padding: "10px 16px" }}
                >
                  {busy ? "Đang xử lý..." : "Chọn nhiều file để Import..."}
                </button>
                <button
                  className="primary"
                  onClick={() => handleImport("folder")}
                  disabled={busy}
                  style={{ padding: "10px 16px" }}
                >
                  {busy ? "Đang xử lý..." : "Chọn thư mục (import tất cả)..."}
                </button>
              </div>
            ) : (
              <button
                className="primary"
                onClick={handleAction}
                disabled={busy}
                style={{ padding: "10px 16px", alignSelf: "flex-start" }}
              >
                {busy ? "Đang xử lý..." : "Chọn vị trí lưu ở ổ D/C để Export..."}
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
