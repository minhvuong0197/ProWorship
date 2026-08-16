import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { obsClient } from "../lib/obs";
import {
  ACTION_LABELS,
  loadFunctions,
  newFunction,
  saveFunctions,
  type MacroAction,
  type MacroActionType,
  type MacroFunction,
} from "../lib/functions";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";

const executeOne = async (
  act: MacroAction,
  cb: {
    advance: (d: number) => Promise<void>;
    clear: () => Promise<void>;
    startTimeline: () => Promise<void>;
    stopTimeline: () => Promise<void>;
  },
) => {
  switch (act.type) {
    case "advance":
      await cb.advance(1);
      break;
    case "clear_output":
      await cb.clear();
      break;
    case "start_timeline":
      await cb.startTimeline();
      break;
    case "stop_timeline":
      await cb.stopTimeline();
      break;
    case "obs_scene":
      if (act.value && obsClient.status === "connected")
        await obsClient.switchScene(act.value);
      break;
    case "toggle_overlay": {
      // handled outside via live patch
      break;
    }
  }
};

export default function FunctionsModal({
  onClose,
  embedded,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const overlays = useAppStore((s) => s.overlays);
  const goLive = useAppStore((s) => s.goLive);
  const advanceLive = useAppStore((s) => s.advanceLive);
  const clearLive = useAppStore((s) => s.clearLive);
  const startServiceTimeline = useAppStore((s) => s.startServiceTimeline);
  const stopServiceTimeline = useAppStore((s) => s.stopServiceTimeline);

  const [funcs, setFuncs] = useState<MacroFunction[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [result, setResult] = useState("");

  useEffect(() => setFuncs(loadFunctions()), []);

  const persist = (next: MacroFunction[]) => {
    setFuncs(next);
    saveFunctions(next);
  };

  const create = () => {
    const f = newFunction(`Function ${funcs.length + 1}`);
    persist([...funcs, f]);
    setEditingId(f.id);
  };

  const editing = funcs.find((f) => f.id === editingId) ?? null;

  const patchEditing = (patch: Partial<MacroFunction>) => {
    if (!editing) return;
    persist(funcs.map((f) => (f.id === editing.id ? { ...f, ...patch } : f)));
  };

  const patchAction = (index: number, patch: Partial<MacroAction>) => {
    if (!editing) return;
    const actions = editing.actions.map((a, i) =>
      i === index ? { ...a, ...patch } : a,
    );
    patchEditing({ actions });
  };

  const addAction = () => {
    if (!editing) return;
    patchEditing({ actions: [...editing.actions, { type: "advance" }] });
  };

  const removeAction = (index: number) => {
    if (!editing) return;
    patchEditing({
      actions: editing.actions.filter((_, i) => i !== index),
    });
  };

  const run = async (f: MacroFunction) => {
    const activeOverlays = live?.active_overlays ?? [];
    setResult("");
    for (const act of f.actions) {
      try {
        if (act.type === "toggle_overlay") {
          const o = overlays.find((x) => x.id === act.value);
          if (o && live) {
            const inActive = activeOverlays.some((a) => a.id === o.id);
            goLive({
              ...live,
              active_overlays: inActive
                ? activeOverlays.filter((a) => a.id !== o.id)
                : [...activeOverlays, { ...o, is_active: true }],
            });
          }
        } else {
          await executeOne(act, {
            advance: advanceLive,
            clear: clearLive,
            startTimeline: startServiceTimeline,
            stopTimeline: stopServiceTimeline,
          });
        }
      } catch {
        // failsafe: continue with remaining actions
        setResult((r) => r + `\n[skip] ${act.type}`);
      }
    }
    setResult(t("functions.done"));
  };

  const body = (
    <div className="modal-body">
      <div className="settings-templates">
        <div className="settings-tpl-list">
          {funcs.map((f) => (
            <div
              key={f.id}
              className={`settings-tpl-item ${editingId === f.id ? "active" : ""}`}
              onClick={() => setEditingId(f.id)}
            >
              <span className="tpl-name">{f.name}</span>
              <button className="primary sm" onClick={() => run(f)}>
                {t("functions.run")}
              </button>
            </div>
          ))}
          <button className="primary" onClick={create}>
            {t("functions.add")}
          </button>
        </div>
        <div className="settings-tpl-editor" style={{ flex: 1 }}>
          {!editing ? (
            <div className="empty-hint">{t("functions.select")}</div>
          ) : (
            <>
              <div className="settings-editor">
                <label>
                  {t("functions.name")}
                  <input
                    value={editing.name}
                    onChange={(e) => patchEditing({ name: e.target.value })}
                  />
                </label>
                <div className="functions-actions">
                  {editing.actions.map((a, i) => (
                    <div className="function-row" key={i}>
                      <select
                        value={a.type}
                        onChange={(e) =>
                          patchAction(i, {
                            type: e.target.value as MacroActionType,
                          })
                        }
                      >
                        {ACTION_LABELS.map((al) => (
                          <option key={al.type} value={al.type}>
                            {t(`functions.action.${al.type}`)}
                          </option>
                        ))}
                      </select>
                      {a.type === "obs_scene" && (
                        <input
                          placeholder={t("functions.obsScene")}
                          value={a.value ?? ""}
                          onChange={(e) =>
                            patchAction(i, { value: e.target.value })
                          }
                        />
                      )}
                      {a.type === "toggle_overlay" && (
                        <select
                          value={a.value ?? ""}
                          onChange={(e) =>
                            patchAction(i, { value: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {overlays.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="icon danger"
                        onClick={() => removeAction(i)}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addAction}>
                    + {t("functions.addAction")}
                  </button>
                </div>
                {result && <div className="muted-text">{result}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("functions.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}