import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { obsClient } from "../../lib/obs";
import type { AppSettings } from "../../lib/types";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";

const FIXED_RES: { label: string; width: number; height: number }[] = [
  { label: "4K · 3840×2160", width: 3840, height: 2160 },
  { label: "1920×1080", width: 1920, height: 1080 },
  { label: "1280×720", width: 1280, height: 720 },
];

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const MIN_PREVIEW = 140;
const DOCK_MIN = 90;
const DOCK_COUNT = 5;
const DOCK_GAP = 8;

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
}

function buildResOptions() {
  const opts: { label: string; width: number; height: number }[] = [];
  if (obsClient.canvasWidth > 0 && obsClient.canvasHeight > 0) {
    opts.push({
      label: `${obsClient.canvasWidth}×${obsClient.canvasHeight} (OBS)`,
      width: obsClient.canvasWidth,
      height: obsClient.canvasHeight,
    });
  }
  for (const r of FIXED_RES) {
    if (!opts.some((o) => o.width === r.width && o.height === r.height)) {
      opts.push(r);
    }
  }
  return opts;
}

function PreviewPane({
  scene,
  width,
  height,
  zoom,
  onDebug,
}: {
  scene: string | null;
  width: number;
  height: number;
  zoom: number;
  onDebug?: (s: string) => void;
}) {
  const t = useT();
  const [img, setImg] = useState<string | null>(null);
  const [fade, setFade] = useState<string | null>(null);
  const cnt = useRef(0);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    setImg(null);
    setFade(null);
    if (!scene) return;
    let stop = false;
    let last = "";
    const tick = () => {
      obsClient.getSceneScreenshot(scene, width, height).then((d) => {
        if (stop) return;
        cnt.current += 1;
        onDebug?.(`a=${cnt.current} l=${d ? (d.length / 1024).toFixed(0) : "0"}k`);
        if (!d || d === last) return;
        last = d;
        const im = new Image();
        im.onload = () => {
          if (stop) return;
          setImg((cur) => {
            if (cur !== d) setFade(cur);
            return d;
          });
          if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
          fadeTimer.current = window.setTimeout(() => setFade(null), 320);
        };
        im.src = d;
      });
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, [scene, width, height]);

  return (
    <div className="obs-preview-scroll">
      <div
        className="obs-preview-canvas"
        style={{ "--zoom": zoom } as React.CSSProperties}
      >
        {fade && <img className="obs-preview-img fading" src={fade} alt="" />}
        {img ? (
          <img
            className="obs-preview-img"
            src={img}
            alt="Xem trước"
            decoding="async"
          />
        ) : (
          <div className="empty-hint">{t("obs.loading")}</div>
        )}
      </div>
    </div>
  );
}

function ObsPreview() {
  const t = useT();
  const [previewRes, setPreviewRes] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [studio, setStudio] = useState(false);
  const [studioScene, setStudioScene] = useState<string | null>(null);
  const [dbgData, setDbgData] = useState<string>("");
  const [dbgSize, setDbgSize] = useState<string>("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const opts = buildResOptions();
  const idx = Math.min(previewRes, opts.length - 1);
  const res = opts[idx] ?? FIXED_RES[1];

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect();
      setDbgSize(`${Math.round(r.width)}×${Math.round(r.height)}px`);
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setStudioScene(obsClient.currentScene);
  }, [previewRes]);

  useEffect(() => {
    if (studio) setStudioScene(obsClient.currentScene);
  }, [studio, obsClient.currentScene]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  };

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const programScene = obsClient.currentScene;

  return (
    <div className="obs-preview">
      <div className="obs-preview-toolbar">
        <span className="obs-preview-title">{t("obs.preview")}</span>
        <div className="obs-preview-tools">
          <label className="format-item inline">
            {t("obs.resolution")}
            <select
              value={idx}
              onChange={(e) => setPreviewRes(Number(e.target.value))}
            >
              {opts.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="obs-preview-zoom" onWheel={handleWheel}>
            <button
              className="obs-expand-btn"
              onClick={() => setZoom((z) => clampZoom(z - 0.1))}
            >
              −
            </button>
            <button
              className="obs-zoom-pct"
              title={t("obs.zoomReset")}
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="obs-expand-btn"
              onClick={() => setZoom((z) => clampZoom(z + 0.1))}
            >
              +
            </button>
          </div>
          <button
            className={`obs-expand-btn ${studio ? "active" : ""}`}
            title={t("obs.studio")}
            onClick={() => setStudio((s) => !s)}
          >
            ◫
          </button>
          <button className="obs-expand-btn" onClick={() => setExpanded(true)}>
            ⛶
          </button>
        </div>
      </div>

      <div
        ref={bodyRef}
        className={`obs-preview-body ${studio ? "studio" : ""}`}
      >
        {studio && (
          <>
            <div className="obs-studio-col obs-col-preview">
              <div className="obs-col-title">{t("obs.previewScene")}</div>
              <select
                className="obs-col-select"
                value={studioScene ?? ""}
                onChange={(e) => setStudioScene(e.target.value)}
              >
                <option value="" disabled>
                  —
                </option>
                {obsClient.scenes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="obs-preview-wrap">
                <PreviewPane
                  scene={studioScene}
                  width={res.width}
                  height={res.height}
                  zoom={zoom}
                  onDebug={setDbgData}
                />
              </div>
            </div>

            <div className="obs-studio-divider">
              <button
                className="obs-transition-btn"
                disabled={!studioScene}
                onClick={() =>
                  obsClient.switchScene(studioScene ?? "").catch(() => {})
                }
              >
                {t("obs.transition")}
              </button>
            </div>

            <div className="obs-studio-col obs-col-program">
              <div className="obs-col-title">{t("obs.program")}</div>
              <div className="obs-preview-wrap">
                <PreviewPane
                  scene={programScene}
                  width={res.width}
                  height={res.height}
                  zoom={zoom}
                  onDebug={setDbgData}
                />
              </div>
            </div>
          </>
        )}
        {!studio && (
          <div className="obs-preview-wrap">
            <PreviewPane
              scene={programScene}
              width={res.width}
              height={res.height}
              zoom={zoom}
              onDebug={setDbgData}
            />
          </div>
        )}
      </div>

      {expanded && (
        <div className="obs-fullscreen" onClick={() => setExpanded(false)}
          title={t("obs.clickExit")}>
          <div className="obs-fullscreen-body" onClick={(e) => e.stopPropagation()}>
            <div className="obs-fullscreen-tools">
              <span className="obs-preview-title">
                {studio ? t("obs.program") : res.label}
              </span>
              <button className="obs-expand-btn" onClick={() => setExpanded(false)}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="obs-fullscreen-preview">
              <PreviewPane
                scene={obsClient.currentScene}
                width={res.width}
                height={res.height}
                zoom={1}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mulToDb(mul: number): number {
  return mul <= 0 ? -Infinity : 20 * Math.log10(mul);
}

function dbToMul(db: number): number {
  return Math.pow(10, db / 20);
}

function ChannelFader({
  value,
  onCommit,
  vertical,
}: {
  value: number;
  onCommit: (v: number) => void;
  vertical: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [v, setV] = useState(value);
  const lastSent = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const latestMul = useRef<number | null>(null);

  useEffect(() => {
    if (draggingRef.current) return;
    if (lastSent.current !== null && Math.abs(value - lastSent.current) < 1e-6) {
      return;
    }
    setV(value);
    lastSent.current = null;
  }, [value]);

  const db = drag !== null ? drag : mulToDb(v);
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  const commit = (mul: number) => {
    lastSent.current = mul;
    onCommit(mul);
  };

  const update = (clientX: number, clientY: number) => {
    const el = ref.current?.querySelector<HTMLElement>(".obs-fader-track");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = vertical
      ? 1 - (clientY - rect.top) / rect.height
      : (clientX - rect.left) / rect.width;
    const ndb = Math.round((-60 + Math.max(0, Math.min(1, frac)) * 60) * 10) / 10;
    const mul = dbToMul(ndb);
    latestMul.current = mul;
    setV(mul);
    setDrag(ndb);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setDrag(mulToDb(v));
    update(e.clientX, e.clientY);
    commit(latestMul.current ?? v);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    update(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    if (latestMul.current !== null) commit(latestMul.current);
    draggingRef.current = false;
    setDrag(null);
  };

  const thumbStyle = vertical
    ? { bottom: `${pct}%` }
    : { left: `${pct}%` };

  return (
    <div
      ref={ref}
      className={`obs-fader-custom ${vertical ? "obs-fader-v" : "obs-fader-h"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="obs-fader-track" />
      <div
        className="obs-fader-fill"
        style={vertical ? { height: `${pct}%` } : { width: `${pct}%` }}
      />
      <div className="obs-fader-thumb" style={thumbStyle} />
    </div>
  );
}

function ObsToolsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [, force] = useState(0);
  const [host, setHost] = useState(
    (settings?.obs_host ?? "127.0.0.1").trim() || "127.0.0.1",
  );
  const [port, setPort] = useState(
    String(settings?.obs_port && settings.obs_port > 0 ? settings.obs_port : 4455),
  );
  const [password, setPassword] = useState(settings?.obs_password ?? "");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => obsClient.subscribe(() => force((n) => n + 1)), []);

  const patchSettings = (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next: AppSettings = {
      ...settings,
      ...patch,
      obs_host: (patch.obs_host ?? settings.obs_host ?? "").trim() || "127.0.0.1",
      obs_port: Number(patch.obs_port ?? settings.obs_port) || 4455,
    };
    setSettings(next);
  };

  const connect = () => {
    const h = host.trim() || "127.0.0.1";
    const p = Number(port) || 4455;
    if (settings) {
      setSettings({
        ...settings,
        obs_host: h,
        obs_port: p,
        obs_password: password,
      });
    }
    obsClient.connect({ host: h, port: p, password });
  };

  const connected = obsClient.status === "connected";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("obs.settings")}</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{t("obs.connection")}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings?.obs_enabled ?? false}
                onChange={(e) => patchSettings({ obs_enabled: e.target.checked })}
              />
              {t("obs.enabled")}
            </label>
            <div className="field-row">
              <label className="format-item">
                {t("obs.host")}
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={!settings?.obs_enabled}
                />
              </label>
              <label className="format-item">
                {t("obs.port")}
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={!settings?.obs_enabled}
                />
              </label>
              <label className="format-item">
                {t("obs.password")}
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!settings?.obs_enabled}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    title={showPw ? t("obs.hide_password") : t("obs.show_password")}
                    style={{
                      padding: "2px 8px",
                      background: "transparent",
                      border: "1px solid var(--border, #333)",
                      borderRadius: 6,
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    {showPw ? <Icon name="eyeOff" size={15} /> : <Icon name="eye" size={15} />}
                  </button>
                </span>
              </label>
            </div>
            <div className="obs-status-row">
              <button
                className="primary"
                onClick={connected ? () => obsClient.disconnect() : connect}
                disabled={!settings?.obs_enabled}
              >
                {connected ? t("obs.disconnect") : t("obs.connect")}
              </button>
              <span className={`obs-status obs-${obsClient.status}`}>
                {obsClient.status === "connected"
                  ? t("obs.connected")
                  : obsClient.status === "connecting"
                    ? t("obs.connecting")
                    : t("obs.disconnected")}
              </span>
            </div>
            {obsClient.lastError && (
              <div className="obs-error">{obsClient.lastError}</div>
            )}
          </section>

          <section>
            <h3>{t("obs.autoScene")}</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings?.obs_auto_scene_switch ?? false}
                onChange={(e) =>
                  patchSettings({ obs_auto_scene_switch: e.target.checked })
                }
              />
              {t("obs.autoSceneDesc")}
            </label>
            <div className="field-row">
              <label className="format-item">
                {t("obs.sceneLyric")}
                <input
                  value={settings?.obs_scene_lyric ?? ""}
                  placeholder="Lời toàn màn hình"
                  onChange={(e) => patchSettings({ obs_scene_lyric: e.target.value })}
                />
              </label>
              <label className="format-item">
                {t("obs.sceneCamera")}
                <input
                  value={settings?.obs_scene_camera ?? ""}
                  placeholder="Camera chính"
                  onChange={(e) => patchSettings({ obs_scene_camera: e.target.value })}
                />
              </label>
              <label className="format-item">
                {t("obs.sceneBlank")}
                <input
                  value={settings?.obs_scene_blank ?? ""}
                  placeholder="Màn hình chờ"
                  onChange={(e) => patchSettings({ obs_scene_blank: e.target.value })}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ObsController() {
  const t = useT();
  const [, force] = useState(0);
  const [showTools, setShowTools] = useState(false);
  const [duration, setDuration] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [previewH, setPreviewH] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [dockWidths, setDockWidths] = useState<number[] | null>(null);
  const [mixerVertical, setMixerVertical] = useState(true);

  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const patchSettings = (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next: AppSettings = {
      ...settings,
      ...patch,
      obs_host: (patch.obs_host ?? settings.obs_host ?? "").trim() || "127.0.0.1",
      obs_port: Number(patch.obs_port ?? settings.obs_port) || 4455,
    };
    setSettings(next);
  };

  const clampPreview = useCallback((h: number, total: number) => {
    return Math.max(MIN_PREVIEW, Math.min(h, total - 90));
  }, []);

  const updateFromContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const total = el.clientHeight;
    setPreviewH((prev) => clampPreview(prev ?? Math.round(total * 0.6), total));
  }, [clampPreview]);

  const initDocks = useCallback(() => {
    const el = dockRef.current;
    if (!el) return;
    const total = el.clientWidth - (DOCK_COUNT - 1) * DOCK_GAP;
    const each = Math.max(DOCK_MIN, Math.floor(total / DOCK_COUNT));
    setDockWidths(
      Array.from({ length: DOCK_COUNT }, (_, i) =>
        i === DOCK_COUNT - 1 ? total - each * (DOCK_COUNT - 1) : each,
      ),
    );
  }, []);

  useEffect(() => {
    updateFromContainer();
    initDocks();
    window.addEventListener("resize", updateFromContainer);
    window.addEventListener("resize", initDocks);
    return () => {
      window.removeEventListener("resize", updateFromContainer);
      window.removeEventListener("resize", initDocks);
    };
  }, [updateFromContainer, initDocks]);

  const obsWidthRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - obsWidthRef.current) > 1) {
        obsWidthRef.current = w;
        initDocks();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initDocks]);

  useEffect(() => {
    setDuration(String(obsClient.transitionDuration || 0));
  }, [obsClient.transitionDuration]);

  useEffect(() => obsClient.subscribe(() => force((n) => n + 1)), []);

  const startVDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const move = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPreviewH(clampPreview(ev.clientY - rect.top, rect.height));
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [clampPreview]);

  const startHDrag = useCallback((i: number, e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const sw = dockWidths ? [...dockWidths] : null;
    if (!sw) return;
    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = [...sw];
      const l = Math.max(DOCK_MIN, next[i] + delta);
      next[i] = l;
      next[i + 1] = Math.max(DOCK_MIN, sw[i + 1] - (l - sw[i]));
      setDockWidths(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [dockWidths]);

  const connected = obsClient.status === "connected";

  const scenesPanel = (
    <div className="obs-list">
      {!connected && <div className="empty-hint">{t("obs.connectFirst")}</div>}
      {connected && obsClient.scenes.length === 0 && (
        <div className="empty-hint">{t("obs.noScenes")}</div>
      )}
      {obsClient.scenes.map((s) => (
        <button
          key={s}
          className={`obs-list-item ${obsClient.currentScene === s ? "active" : ""}`}
          onClick={() => obsClient.switchScene(s).catch(() => {})}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const sourcesPanel = (
    <div className="obs-list">
      {!connected && <div className="empty-hint">{t("obs.connectFirst")}</div>}
      {connected && obsClient.sceneItems.length === 0 && (
        <div className="empty-hint">{t("obs.noSources")}</div>
      )}
      {obsClient.sceneItems.map((it) => (
        <div key={it.id} className="obs-source-row">
          <span className="obs-source-name">{it.sourceName}</span>
          <button
            className={`obs-eye ${it.enabled ? "on" : ""}`}
            title={it.enabled ? t("obs.hidden") : t("obs.visible")}
            onClick={() =>
              obsClient.setSourceVisible(it.sourceName, !it.enabled).catch(() => {})
            }
          >
            {it.enabled ? <Icon name="eye" size={15} /> : <Icon name="eyeOff" size={15} />}
          </button>
        </div>
      ))}
    </div>
  );

  const mixerPanel = (
    <div className={`obs-mixer ${mixerVertical ? "obs-mixer-vertical" : "obs-mixer-horizontal"}`}>
      {!connected && <div className="empty-hint">{t("obs.connectFirst")}</div>}
      {connected && obsClient.inputs.length === 0 && (
        <div className="empty-hint">{t("obs.noInputs")}</div>
      )}
      {obsClient.inputs
        .filter((inp) => !(settings?.obs_hidden_inputs ?? []).includes(inp.inputName))
        .map((inp) => (
          <div key={inp.inputName} className="obs-mixer-channel">
            <span className="obs-mixer-name">{inp.inputName}</span>
            <div className="obs-mixer-controls">
              <button
                className={`obs-mixer-mute ${inp.muted ? "muted" : ""}`}
                disabled={inp.muted === undefined}
                onClick={() =>
                  obsClient.setMute(inp.inputName, !inp.muted).catch(() => {})
                }
              >
                {inp.muted ? <Icon name="volumeX" size={15} /> : <Icon name="volume" size={15} />}
              </button>
              {inp.volumeMul !== undefined && (
                <ChannelFader
                  value={inp.volumeMul}
                  vertical={mixerVertical}
                  onCommit={(v) =>
                    obsClient
                      .setVolume(inp.inputName, v)
                      .then(() => obsClient.setAction("setVolumeOk"))
                      .catch((err) => obsClient.reportError(String(err)))
                  }
                />
              )}
              <button
                className="obs-mixer-hide"
                title={t("obs.hideInput")}
                onClick={() =>
                  patchSettings({
                    obs_hidden_inputs: [
                      ...(settings?.obs_hidden_inputs ?? []),
                      inp.inputName,
                    ],
                  })
                }
              >
                <Icon name="eyeOff" size={11} />
              </button>
            </div>
          </div>
        ))}
    </div>
  );

  const transitionsPanel = (
    <div className="obs-list">
      {!connected && <div className="empty-hint">{t("obs.connectFirst")}</div>}
      {connected && (
        <>
          <label className="format-item">
            <select
              value={obsClient.currentTransition ?? ""}
              onChange={(e) =>
                obsClient.setTransition(e.target.value).catch(() => {})
              }
            >
              {!obsClient.currentTransition && <option value="">—</option>}
              {obsClient.transitions.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </select>
          </label>
          <label className="format-item">
            {t("obs.transitionDuration")}
            <input
              type="number"
              min={0}
              step={50}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={() =>
                obsClient
                  .setTransitionDuration(Number(duration) || 0)
                  .catch(() => {})
              }
            />
          </label>
        </>
      )}
    </div>
  );

  const controlsPanel = (
    <div className="obs-ctrl-col">
      <button
        className={obsClient.streamActive ? "danger" : "primary"}
        disabled={!connected}
        onClick={() => obsClient.toggleStream().catch(() => {})}
      >
        {obsClient.streamActive ? t("obs.stopStream") : t("obs.startStream")}
      </button>
      <button
        className={obsClient.recordActive ? "danger" : "primary"}
        disabled={!connected}
        onClick={() => obsClient.toggleRecord().catch(() => {})}
      >
        {obsClient.recordActive ? t("obs.stopRecord") : t("obs.startRecord")}
      </button>
    </div>
  );

  const docks = [
    { title: t("obs.scenes"), body: scenesPanel },
    { title: t("obs.sources"), body: sourcesPanel },
    {
      title: t("obs.audioMixer"),
      body: mixerPanel,
      tool: (
        <div className="obs-mixer-tools">
          {(settings?.obs_hidden_inputs?.length ?? 0) > 0 && (
            <button
              className="obs-mixer-rotate"
              title={t("obs.showAllInputs")}
              onClick={() => patchSettings({ obs_hidden_inputs: [] })}
            >
              <Icon name="eye" size={12} />
            </button>
          )}
          <button
            className="obs-mixer-rotate"
            title={mixerVertical ? t("obs.mixerHorizontal") : t("obs.mixerVertical")}
            onClick={() => setMixerVertical((v) => !v)}
          >
            <Icon name="rotate" size={12} />
          </button>
        </div>
      ),
    },
    { title: t("obs.transitions"), body: transitionsPanel },
    { title: t("obs.streamRecord"), body: controlsPanel },
  ];

  return (
    <div
      className={`obs-studio ${resizing ? "obs-resizing" : ""}`}
      ref={containerRef}
    >
      <div className="obs-menu">
        <span className="obs-menu-title">
          <Icon name="broadcast" size={13} color="#f87171" />
          OBS Studio
        </span>
        <span className="obs-menu-items">File · View · Docks · Help</span>
        <div className="obs-menu-right">
          <span className={`obs-status obs-${obsClient.status}`}>
            {obsClient.status === "connected"
              ? t("obs.connected")
              : obsClient.status === "connecting"
                ? t("obs.connecting")
                : t("obs.disconnected")}
          </span>
          {obsClient.action && (
            <span className="obs-action">{t(`obs.msg.${obsClient.action}`)}</span>
          )}
          <button className="icon" title={t("obs.tools")} onClick={() => setShowTools(true)}>
            <Icon name="gear" size={15} />
            {t("obs.tools")}
          </button>
        </div>
      </div>

      <div
        className="obs-preview-area"
        style={previewH != null ? { flex: "none", height: previewH } : undefined}
      >
        <ObsPreview />
      </div>

      <div className="obs-splitter" onPointerDown={startVDrag}>
        <div className="obs-splitter-line" />
      </div>

      <div className="obs-docks" ref={dockRef}>
        {dockWidths &&
          docks.map((d, i) => (
            <Fragment key={d.title}>
              <div
                className="obs-dock-panel"
                style={{ flex: `0 0 ${dockWidths[i]}px` }}
              >
                <h3>
                  {d.title}
                  {d.tool}
                </h3>
                <div className="obs-dock-body">{d.body}</div>
              </div>
              {i < docks.length - 1 && (
                <div
                  className="obs-hsplitter"
                  onPointerDown={(e) => startHDrag(i, e)}
                />
              )}
            </Fragment>
          ))}
      </div>

      {showTools && <ObsToolsModal onClose={() => setShowTools(false)} />}
    </div>
  );
}