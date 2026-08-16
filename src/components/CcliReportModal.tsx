import { useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "../store/useAppStore";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("vi-VN", { hour12: false });
}

export default function CcliReportModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ccliLog = useAppStore((s) => s.ccliLog);
  const refreshCcliLog = useAppStore((s) => s.refreshCcliLog);

  useEffect(() => {
    refreshCcliLog();
  }, [refreshCcliLog]);

  const exportCsv = async () => {
    const header = [t("ccli.date"), t("ccli.song"), t("ccli.number")];
    const rows = ccliLog.map((l) => [
      fmtTime(l.used_at),
      `"${l.song_title.replaceAll('"', '""')}"`,
      l.ccli || "",
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    try {
      const path = await save({
        title: t("ccli.exportCsv"),
        defaultPath: "ccli-report.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      await writeFile(path, new TextEncoder().encode(csv));
    } catch (err) {
      console.error("export csv failed", err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("ccli.title")}</h2>
          <button className="primary" onClick={exportCsv}>
            {t("ccli.exportCsv")}
          </button>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <div className="ccli-summary">
            {t("ccli.used", { n: ccliLog.length })}
          </div>
          {ccliLog.length === 0 ? (
            <div className="empty-hint">{t("ccli.empty")}</div>
          ) : (
            <table className="ccli-table">
              <thead>
                <tr>
                  <th>{t("ccli.date")}</th>
                  <th>{t("ccli.song")}</th>
                  <th>{t("ccli.number")}</th>
                </tr>
              </thead>
              <tbody>
                {ccliLog.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtTime(l.used_at)}</td>
                    <td>{l.song_title}</td>
                    <td>{l.ccli || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
