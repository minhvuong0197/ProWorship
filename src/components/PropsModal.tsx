import { useAppStore } from "../store/useAppStore";
import type { Prop } from "../lib/types";
import { uid } from "../lib/types";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";
import type { IconName } from "./Icon/Icon";

export default function PropsModal({
  onClose,
  embedded,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const props = useAppStore((s) => s.props);
  const goLive = useAppStore((s) => s.goLive);

  const active = live?.active_props ?? [];

  const addProp = (p: Prop) => {
    if (!live) return;
    const copy: Prop = { ...p, id: uid() };
    goLive({ ...live, active_props: [...active, copy] });
  };

  const removeProp = (id: string) => {
    if (!live) return;
    goLive({ ...live, active_props: active.filter((p) => p.id !== id) });
  };

  const updateActive = (id: string, patch: Partial<Prop>) => {
    if (!live) return;
    goLive({
      ...live,
      active_props: active.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const body = (
    <div className="modal-body">
      <section>
        <h3>{t("props.active")}</h3>
        {active.length === 0 ? (
          <div className="empty-hint">{t("props.none")}</div>
        ) : (
          <div className="prop-active-list">
            {active.map((p) => (
              <div key={p.id} className="prop-active-row">
                <span className="prop-name">{p.name}</span>
                <input
                  type="color"
                  value={p.color}
                  title="Màu"
                  onChange={(e) => updateActive(p.id, { color: e.target.value })}
                />
                <div className="prop-pos">
                  <label>
                    X
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={p.x}
                      onChange={(e) =>
                        updateActive(p.id, { x: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={p.y}
                      onChange={(e) =>
                        updateActive(p.id, { y: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    W
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={p.w}
                      onChange={(e) =>
                        updateActive(p.id, { w: Number(e.target.value) || 10 })
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={p.h}
                      onChange={(e) =>
                        updateActive(p.id, { h: Number(e.target.value) || 10 })
                      }
                    />
                  </label>
                </div>
                <button className="icon danger" onClick={() => removeProp(p.id)} title={t("props.remove")}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3>{t("props.library")}</h3>
        <div className="empty-hint" style={{ padding: 8 }}>
          {t("props.addHint")}
        </div>
        <div className="prop-lib-grid">
          {props.map((p) => (
            <div key={p.id} className="prop-lib-card">
              <div className="prop-lib-icon"><Icon name={propIcon(p.prop_type)} size={20} /></div>
              <span className="prop-name">{p.name}</span>
              <button className="primary" onClick={() => addProp(p)}>
                {t("props.add")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("props.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

function propIcon(type: string): IconName {
  switch (type) {
    case "digital_clock":
      return "clock";
    case "analog_clock":
      return "timer";
    case "border":
      return "square";
    case "snow":
      return "snow";
    case "sparkle":
      return "star";
    default:
      return "diamond";
  }
}
