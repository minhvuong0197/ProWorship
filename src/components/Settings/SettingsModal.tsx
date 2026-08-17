import { useEffect, useState } from "react";
import type { AppSettings } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";

const DEFAULT_SETTINGS: AppSettings = {
  default_transition: { kind: "fade", duration_ms: 500 },
  default_template_id: null,
  output_template_id: null,
  output_monitor: null,
  stage_show_clock: true,
  stage_show_next: true,
  stage_show_notes: true,
  stage_show_message: true,
  ui_language: "vi",
  server_enabled: true,
  server_port: 8500,
  companion_enabled: false,
  stage_remote_enabled: false,
  api_enabled: false,
  api_key: "",
  obs_enabled: false,
  obs_host: "127.0.0.1",
  obs_port: 4455,
  obs_password: "",
  obs_auto_scene_switch: false,
  obs_scene_lyric: "",
  obs_scene_camera: "",
  obs_scene_blank: "",
  skip_virtual_break: false,
};

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settings = useAppStore((s) => s.settings) ?? DEFAULT_SETTINGS;
  const setSettings = useAppStore((s) => s.setSettings);
  const templates = useAppStore((s) => s.templates);
  const monitors = useAppStore((s) => s.monitors);
  const companionInfo = useAppStore((s) => s.companionInfo);
  const refreshCompanionInfo = useAppStore((s) => s.refreshCompanionInfo);

  useEffect(() => {
    refreshCompanionInfo();
  }, [refreshCompanionInfo]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings({ ...settings, ...patch });
  };

  const lyricTemplates = templates.filter(
    (tp) => !tp.category || tp.category === "lyric" || tp.category === "other",
  );
  const allTemplates = templates;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("settings.title")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{t("settings.language")}</h3>
            <select
              value={settings.ui_language}
              onChange={(e) =>
                updateSettings({
                  ui_language: e.target.value as AppSettings["ui_language"],
                })
              }
            >
              <option value="vi">{t("settings.langVi")}</option>
              <option value="en">{t("settings.langEn")}</option>
            </select>
          </section>

          <section>
            <h3>{t("settings.transition")}</h3>
            <div className="transition-row">
              <select
                value={settings.default_transition.kind}
                onChange={(e) =>
                  updateSettings({
                    default_transition: {
                      ...settings.default_transition,
                      kind: e.target.value as "fade" | "cut",
                    },
                  })
                }
              >
                <option value="fade">Mờ dần</option>
                <option value="cut">Cắt</option>
              </select>
              <select
                value={settings.default_transition.duration_ms}
                onChange={(e) =>
                  updateSettings({
                    default_transition: {
                      ...settings.default_transition,
                      duration_ms: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={200}>200ms</option>
                <option value={400}>400ms</option>
                <option value={500}>500ms</option>
                <option value={800}>800ms</option>
                <option value={1000}>1000ms</option>
              </select>
            </div>
          </section>

          <section>
            <h3>{t("settings.defaultTemplates")}</h3>
            <label className="format-item">
              {t("settings.defaultSongTemplate")}
              <select
                value={settings.default_template_id ?? ""}
                onChange={(e) =>
                  updateSettings({ default_template_id: e.target.value || null })
                }
              >
                <option value="">{t("settings.templateNone")}</option>
                {lyricTemplates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="format-item">
              {t("settings.outputTemplate")}
              <select
                value={settings.output_template_id ?? ""}
                onChange={(e) =>
                  updateSettings({ output_template_id: e.target.value || null })
                }
              >
                <option value="">{t("settings.templateNone")}</option>
                {allTemplates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h3>{t("settings.outputMonitor")}</h3>
            <label className="format-item">
              {t("settings.outputMonitor")}
              <select
                value={settings.output_monitor ?? ""}
                onChange={(e) =>
                  updateSettings({ output_monitor: e.target.value || null })
                }
              >
                <option value="">{t("toolbar.defaultMonitor")}</option>
                {monitors.map((m) => (
                  <option key={m.name ?? `${m.x}-${m.y}`} value={m.name ?? ""}>
                    {m.name ?? t("toolbar.monitor")} ({m.width}x{m.height})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h3>{t("settings.stageDisplay")}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.stage_show_clock}
                onChange={(e) => updateSettings({ stage_show_clock: e.target.checked })}
              />
              {t("settings.showClock")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.stage_show_next}
                onChange={(e) => updateSettings({ stage_show_next: e.target.checked })}
              />
              {t("settings.showNext")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.stage_show_notes}
                onChange={(e) => updateSettings({ stage_show_notes: e.target.checked })}
              />
              {t("settings.showNotes")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.stage_show_message}
                onChange={(e) => updateSettings({ stage_show_message: e.target.checked })}
              />
              {t("settings.showMessage")}
            </label>
          </section>

          <section>
            <h3>{t("settings.virtualBreaks")}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!settings.skip_virtual_break}
                onChange={(e) =>
                  updateSettings({ skip_virtual_break: e.target.checked })
                }
              />
              {t("settings.skipVirtualBreak")}
            </label>
          </section>

          <section>
            <h3>{t("settings.lanServer")}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.server_enabled}
                onChange={(e) => updateSettings({ server_enabled: e.target.checked })}
              />
              {t("settings.serverEnabled")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.companion_enabled}
                onChange={(e) => updateSettings({ companion_enabled: e.target.checked })}
              />
              {t("settings.companionEnabled")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.api_enabled}
                onChange={(e) => updateSettings({ api_enabled: e.target.checked })}
              />
              {t("settings.apiEnabled")}
            </label>
            <div className="field-row">
              <div className="field" style={{ width: 110 }}>
                <label>{t("settings.serverPort")}</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.server_port}
                  onChange={(e) =>
                    updateSettings({ server_port: Number(e.target.value) || 8500 })
                  }
                />
              </div>
              <div className="field">
                <label>{t("settings.apiKey")}</label>
                <input
                  value={settings.api_key}
                  onChange={(e) => updateSettings({ api_key: e.target.value })}
                />
              </div>
            </div>
            <div className="muted-text" style={{ fontSize: 11.5 }}>
              {t("settings.serverRestart")}
            </div>
          </section>

          <section>
            <h3>{t("settings.companionApp")}</h3>
            <p className="muted-text">{t("companion.desc")}</p>
            {!settings.server_enabled || !settings.companion_enabled ? (
              <div className="empty-hint">
                {!settings.server_enabled
                  ? t("companion.noServer")
                  : t("companion.disabled")}
              </div>
            ) : (
              <div className="companion-box">
                {companionInfo?.base_url && (
                  <img
                    className="companion-qr"
                    src={`${companionInfo.base_url}/qr.svg`}
                    alt="QR"
                    width={200}
                    height={200}
                  />
                )}
                <div className="companion-url">
                  <div className="muted-text">{t("companion.url")}</div>
                  <code>{companionInfo?.base_url ?? ""}/</code>
                </div>
                {settings.companion_password ? (
                  <div className="companion-url">
                    <div className="muted-text">{t("companion.pin")}</div>
                    <input
                      className="pin-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={settings.companion_password}
                      onChange={(e) =>
                        updateSettings({
                          companion_password: e.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                    />
                    <div className="muted-text" style={{ fontSize: 11.5 }}>
                      {t("companion.pinHint")}
                    </div>
                  </div>
                ) : (
                  <div className="muted-text">{t("companion.enabled")}</div>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="settings-row">
              <span>{t("settings.stageRemoteEnabled")}</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.stage_remote_enabled}
                  onChange={(e) =>
                    updateSettings({ stage_remote_enabled: e.target.checked })
                  }
                />
                <span className="slider" />
              </label>
            </div>
            <p className="muted-text">{t("settings.stageRemoteDesc")}</p>
            {settings.server_enabled && settings.stage_remote_enabled && (
              <div className="companion-box">
                <div className="companion-url">
                  <div className="muted-text">{t("settings.stageRemoteUrl")}</div>
                  <code>{companionInfo?.base_url ?? ""}/stage</code>
                </div>
                {companionInfo?.base_url && (
                  <img
                    className="companion-qr"
                    src={`${companionInfo.base_url}/stage/qr.svg`}
                    alt="QR"
                    width={160}
                    height={160}
                  />
                )}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
