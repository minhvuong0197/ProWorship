import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { obsClient } from "./lib/obs";
import Toolbar from "./components/Toolbar/Toolbar";
import ModeBar from "./components/ModeBar/ModeBar";
import ProjectPanel from "./components/Project/ProjectPanel";
import SongEditor from "./components/SongEditor/SongEditor";
import Presentation from "./components/Presentation/Presentation";
import EditPanel from "./components/Edit/EditPanel";
import MediaLibrary from "./components/MediaLibrary/MediaLibrary";
import AudioLibrary from "./components/AudioLibrary/AudioLibrary";
import BiblePanel from "./components/BiblePanel/BiblePanel";
import LivePreview from "./components/LivePreview/LivePreview";
import AudioPlayer from "./components/AudioPlayer";
import AudioPlayerPanel from "./components/AudioPlayerPanel";
import ObsController from "./components/ObsController/ObsController";
import OverlaysPanel from "./components/OverlaysPanel";
import FunctionsPanel from "./components/FunctionsPanel";
import PropsPanel from "./components/PropsPanel";
import ShortcutsModal from "./components/ShortcutsModal";
import Icon from "./components/Icon/Icon";
import { MODE_ORDER } from "./lib/nav";
import { useT } from "./lib/i18n";
import { editBusy } from "./lib/editBusy";
import type { CenterView, LibraryMode, ToolMode } from "./lib/nav";
import type { ReactNode } from "react";

const LIBRARY_ONLY = ["songs", "bible", "media", "audio"] as const;

function PanelHost({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="center-host">
      <div className="center-host-bar">
        <button className="center-back" onClick={onBack}>
          <Icon name="chevronLeft" size={13} />
          {t("library.backToShow")}
        </button>
      </div>
      <div className="center-host-body">{children}</div>
    </div>
  );
}

export default function App() {
  const loadAll = useAppStore((s) => s.loadAll);
  const lastError = useAppStore((s) => s.lastError);
  const reportError = useAppStore((s) => s.reportError);
  const clearError = useAppStore((s) => s.clearError);
  const advanceLive = useAppStore((s) => s.advanceLive);
  const clearLive = useAppStore((s) => s.clearLive);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const toggleOutput = useAppStore((s) => s.toggleOutput);
  const setOutputLocked = useAppStore((s) => s.setOutputLocked);
  const refreshOutput = useAppStore((s) => s.refreshOutput);
  const setAudioState = useAppStore((s) => s.setAudioState);
  const [centerView, setCenterView] = useState<CenterView>({ kind: "show" });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(300);
  const resizeRef = useRef<{ side: "left" | "right"; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      if (r.side === "left") {
        setLeftWidth(Math.min(Math.max(140, r.startW + dx), 460));
      } else {
        setRightWidth(Math.min(Math.max(180, r.startW - dx), 520));
      }
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.classList.remove("app-resizing");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = {
      side,
      startX: e.clientX,
      startW: side === "left" ? leftWidth : rightWidth,
    };
    document.body.classList.add("app-resizing");
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason, "Thao tác không thành công");
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, [reportError]);

  useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(clearError, 8000);
    return () => window.clearTimeout(timer);
  }, [lastError, clearError]);

  useEffect(() => {
    const cfg = settings;
    if (!cfg?.obs_enabled || !cfg.obs_auto_scene_switch) return;
    const kind = live?.current?.kind;
    if (obsClient.status !== "connected") return;
    const scene =
      kind === "song"
        ? cfg.obs_scene_lyric
        : kind === "media"
          ? cfg.obs_scene_camera
          : kind === "blank"
            ? cfg.obs_scene_blank
            : "";
    if (!scene) return;
    if (obsClient.currentScene !== scene) {
      obsClient.switchScene(scene).catch(() => {});
    }
  }, [live?.current?.kind, settings, obsClient.status]);

  const onLibraryMode = (m: LibraryMode) => {
    setCenterView((prev) =>
      prev.kind === "editor" && prev.editor === m
        ? { kind: "show" }
        : { kind: "editor", editor: m },
    );
  };

  const onToolMode = (m: ToolMode) => {
    setCenterView((prev) =>
      prev.kind === "tool" && prev.mode === m
        ? { kind: "show" }
        : { kind: "tool", mode: m },
    );
  };

  const onShow = () => setCenterView({ kind: "show" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;

      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        switch (e.code) {
          case "KeyO":
            e.preventDefault();
            toggleOutput();
            return;
          case "KeyL":
            e.preventDefault();
            setOutputLocked(!(live?.output_locked ?? false));
            return;
          case "KeyR":
            e.preventDefault();
            refreshOutput();
            return;
          case "KeyM":
            e.preventDefault();
            setAudioState(undefined, (live?.audio?.volume ?? 0) > 0 ? 0 : 1);
            return;
          case "KeyS":
          case "KeyD":
          case "KeyN":
          case "KeyF":
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent(
                e.code === "KeyS"
                  ? "pwc:save"
                  : e.code === "KeyD"
                    ? "pwc:duplicate"
                    : e.code === "KeyN"
                      ? "pwc:new"
                      : "pwc:search",
              ),
            );
            return;
          case "KeyA":
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            {
              const isBible =
                centerView.kind === "editor" && centerView.editor === "bible";
              if (isBible) {
                window.dispatchEvent(new CustomEvent("pwc:bible-select-all"));
                return;
              }
              const main = document.querySelector("main.app-main");
              if (main) {
                const range = document.createRange();
                range.selectNodeContents(main);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }
            return;
        }
      }

      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (tag === "BUTTON" && ["Space", "ArrowRight", "ArrowLeft"].includes(e.code)) return;

      if (e.code === "F1" || (e.ctrlKey && e.code === "Slash")) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      const currentMode = (): LibraryMode | ToolMode => {
        if (centerView.kind === "tool") return centerView.mode;
        if (centerView.kind === "editor") return centerView.editor;
        return "songs";
      };

      const applyMode = (m: LibraryMode | ToolMode) => {
        if ((LIBRARY_ONLY as readonly string[]).includes(m)) {
          onLibraryMode(m as LibraryMode);
        } else {
          onToolMode(m as ToolMode);
        }
      };

      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const idx = MODE_ORDER.indexOf(currentMode());
        const next = MODE_ORDER[(idx + dir + MODE_ORDER.length) % MODE_ORDER.length];
        applyMode(next);
        return;
      }

      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const next = MODE_ORDER[Number(e.key) - 1];
        if (next) applyMode(next);
        return;
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        const next = MODE_ORDER[MODE_ORDER.length - 1];
        if (next) applyMode(next);
        return;
      }
      if (e.ctrlKey && e.code === "Minus") {
        e.preventDefault();
        const next = MODE_ORDER[MODE_ORDER.length - 1];
        if (next) applyMode(next);
        return;
      }

      if (editBusy.active) return;

      switch (e.code) {
        case "Space":
        case "ArrowRight":
        case "PageDown":
        case "N":
          e.preventDefault();
          advanceLive(1);
          break;
        case "ArrowLeft":
        case "PageUp":
        case "P":
          e.preventDefault();
          advanceLive(-1);
          break;
        case "B":
          e.preventDefault();
          clearLive();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    advanceLive,
    clearLive,
    centerView,
    toggleOutput,
    setOutputLocked,
    refreshOutput,
    setAudioState,
    live?.output_locked,
    live?.audio?.volume,
  ]);

  return (
    <div className="app-shell">
      <Toolbar onOpenShortcuts={() => setShowShortcuts(true)} />
      {lastError && (
        <div className="app-error-banner" role="alert">
          <span>{lastError}</span>
          <button className="app-error-dismiss" onClick={clearError} title="Đóng thông báo">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      <ModeBar
        centerView={centerView}
        onLibraryMode={onLibraryMode}
        onToolMode={onToolMode}
        onShow={onShow}
      />
      <div className="app-body">
        <div className="app-col-left" style={{ width: leftWidth }}>
          <ProjectPanel onSelectShow={onShow} />
        </div>
        <div className="app-splitter" onMouseDown={startResize("left")} />
        <main className="app-main">
          {centerView.kind === "show" && <Presentation />}
          {centerView.kind === "tool" && centerView.mode === "edit" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <EditPanel />
            </PanelHost>
          )}
          {centerView.kind === "tool" && centerView.mode === "overlays" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <OverlaysPanel />
            </PanelHost>
          )}
          {centerView.kind === "tool" && centerView.mode === "functions" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <FunctionsPanel />
            </PanelHost>
          )}
          {centerView.kind === "tool" && centerView.mode === "props" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <PropsPanel />
            </PanelHost>
          )}
          {centerView.kind === "tool" && centerView.mode === "obs" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <ObsController />
            </PanelHost>
          )}
          {centerView.kind === "editor" && centerView.editor === "songs" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <SongEditor
                initialSongId={centerView.songId ?? null}
                hideList={centerView.songId != null}
              />
            </PanelHost>
          )}
          {centerView.kind === "editor" && centerView.editor === "bible" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <BiblePanel />
            </PanelHost>
          )}
          {centerView.kind === "editor" && centerView.editor === "media" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <MediaLibrary />
            </PanelHost>
          )}
          {centerView.kind === "editor" && centerView.editor === "audio" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <AudioLibrary />
            </PanelHost>
          )}
        </main>
        <div className="app-splitter" onMouseDown={startResize("right")} />
        <aside className="app-right" style={{ width: rightWidth }}>
          <LivePreview />
        </aside>
      </div>
      <AudioPlayerPanel />
      <AudioPlayer />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}