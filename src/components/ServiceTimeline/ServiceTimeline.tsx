import { useEffect, useState } from "react";
import type { LiveState } from "../../lib/types";
import { fmtDuration } from "../../lib/live";
import { useT } from "../../lib/i18n";

export default function ServiceTimeline({ live }: { live: LiveState | null }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const started = live?.service_started_at ?? null;
  const totalSec = live?.service_duration_sec ?? null;
  const elapsedSec =
    started != null ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const remainingSec = totalSec != null ? Math.max(0, totalSec - elapsedSec) : null;
  const overdue = totalSec != null && elapsedSec > totalSec;
  const endAt =
    started != null && totalSec != null ? new Date(started + totalSec * 1000) : null;

  return (
    <div className="stage-timeline">
      <div className="stage-timeline-title">{t("stage.timeline")}</div>
      {started == null || totalSec == null ? (
        <div className="stage-timeline-empty">{t("stage.noTimeline")}</div>
      ) : (
        <>
          <div className="stage-timeline-row">
            <span>{t("stage.total")}</span>
            <span>{fmtDuration(totalSec)}</span>
          </div>
          <div className="stage-timeline-row">
            <span>{t("stage.currentItem")}</span>
            <span className={overdue ? "overdue" : ""}>
              {fmtDuration(elapsedSec)}
            </span>
          </div>
          <div className="stage-timeline-row">
            <span>
              {t("stage.remaining")} ({t("stage.minutes")})
            </span>
            <span>{fmtDuration(remainingSec ?? 0)}</span>
          </div>
          {endAt && (
            <div className="stage-timeline-row">
              <span>{t("stage.endAt")}</span>
              <span>
                {endAt.toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
          <div className="stage-timeline-bar">
            <div
              className={`stage-timeline-fill ${overdue ? "overdue" : ""}`}
              style={{
                width: `${Math.min(100, (elapsedSec / totalSec) * 100)}%`,
              }}
            />
          </div>
          {overdue && <div className="stage-timeline-overdue">{t("stage.overdue")}</div>}
        </>
      )}
    </div>
  );
}
