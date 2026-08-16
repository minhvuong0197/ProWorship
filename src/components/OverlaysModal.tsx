import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Overlay, OverlayKind } from "../lib/types";
import { uid } from "../lib/types";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";

const KIND_LABELS: Record<OverlayKind, string> = {
  logo: "Logo",
  countdown: "Đếm ngược",
  banner: "Biểu ngữ",
  ticker: "Chữ chạy",
  lower_third: "Dải thông tin",
  watermark: "Hình mờ",
  pip: "PIP (camera phụ)",
};

export default function OverlaysModal({
  onClose,
  embedded,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const overlays = useAppStore((s) => s.overlays);
  const media = useAppStore((s) => s.media);
  const goLive = useAppStore((s) => s.goLive);
  const saveOverlay = useAppStore((s) => s.saveOverlay);
  const deleteOverlay = useAppStore((s) => s.deleteOverlay);
  const [draftKind, setDraftKind] = useState<OverlayKind>("logo");

  const active = live?.active_overlays ?? [];

  const setActive = (list: Overlay[]) => {
    if (!live) return;
    goLive({ ...live, active_overlays: list });
  };

  const toggleActive = (o: Overlay) => {
    if (!live) return;
    const inActive = active.some((a) => a.id === o.id);
    if (inActive) {
      setActive(active.filter((a) => a.id !== o.id));
    } else {
      setActive([...active, { ...o, is_active: true }]);
    }
  };

  const patchActive = (id: string, patch: Partial<Overlay>) => {
    setActive(active.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const patchLibrary = (id: string, patch: Partial<Overlay>) => {
    const o = overlays.find((x) => x.id === id);
    if (o) saveOverlay({ ...o, ...patch });
  };

  const createOverlay = () => {
    const o: Overlay = {
      id: uid(),
      name: `${KIND_LABELS[draftKind]} mới`,
      kind: draftKind,
      text: "",
      image_path: "",
      x: 10,
      y: 78,
      w: 80,
      h: 12,
      color: "#ffffff",
      bg_color: "rgba(0,0,0,0.55)",
      is_active: false,
      z_index: 100,
    };
    saveOverlay(o);
  };

  const body = (
    <div className="modal-body">
      <section>
        <h3>{t("overlays.active")}</h3>
        {active.length === 0 ? (
          <div className="empty-hint">{t("overlays.none")}</div>
        ) : (
          <div className="prop-active-list">
            {active.map((o) => (
              <div key={o.id} className="prop-active-row">
                <span className="prop-name">
                  {o.name}
                  <em className="overlay-kind">({KIND_LABELS[o.kind]})</em>
                </span>
                {(o.kind === "banner" ||
                  o.kind === "ticker" ||
                  o.kind === "lower_third") && (
                  <input
                    value={o.text ?? ""}
                    placeholder={t("overlays.textPlaceholder")}
                    onChange={(e) => patchActive(o.id, { text: e.target.value })}
                  />
                )}
                {(o.kind === "logo" || o.kind === "watermark" || o.kind === "pip") && (
                  <select
                    value={o.image_path ?? ""}
                    onChange={(e) =>
                      patchActive(o.id, { image_path: e.target.value })
                    }
                  >
                    <option value="">(chọn ảnh…)</option>
                    {media.map((m) => (
                      <option key={m.id} value={m.file_path}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="color"
                  value={o.color}
                  title={t("settings.textColor")}
                  onChange={(e) => patchActive(o.id, { color: e.target.value })}
                />
                <div className="prop-pos">
                  <label>
                    X
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={o.x}
                      onChange={(e) =>
                        patchActive(o.id, { x: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={o.y}
                      onChange={(e) =>
                        patchActive(o.id, { y: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    W
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={o.w}
                      onChange={(e) =>
                        patchActive(o.id, { w: Number(e.target.value) || 10 })
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={o.h}
                      onChange={(e) =>
                        patchActive(o.id, { h: Number(e.target.value) || 10 })
                      }
                    />
                  </label>
                </div>
                <button
                  className="icon danger"
                  onClick={() =>
                    setActive(active.filter((a) => a.id !== o.id))
                  }
                  title={t("overlays.remove")}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>{t("overlays.library")}</h3>
        <div className="overlay-lib-list">
          {overlays.map((o) => (
            <div key={o.id} className="overlay-lib-row">
              <input
                className="overlay-name-input"
                value={o.name}
                onChange={(e) => patchLibrary(o.id, { name: e.target.value })}
              />
              <select
                value={o.kind}
                onChange={(e) =>
                  patchLibrary(o.id, {
                    kind: e.target.value as OverlayKind,
                  })
                }
              >
                {(Object.keys(KIND_LABELS) as OverlayKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                className={active.some((a) => a.id === o.id) ? "primary" : ""}
                onClick={() => toggleActive(o)}
              >
                {active.some((a) => a.id === o.id)
                  ? t("overlays.on")
                  : t("overlays.off")}
              </button>
              <button
                className="icon danger"
                onClick={() => {
                  if (window.confirm(t("overlays.deleteConfirm")))
                    deleteOverlay(o.id);
                }}
                title={t("overlays.delete")}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="overlay-create-row">
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as OverlayKind)}
          >
            {(Object.keys(KIND_LABELS) as OverlayKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button className="primary" onClick={createOverlay}>
            {t("overlays.add")}
          </button>
        </div>
      </section>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("overlays.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
