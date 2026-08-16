import { useEffect, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { obsClient } from "./lib/obs";
import Toolbar from "./components/Toolbar/Toolbar";
import ModeBar from "./components/ModeBar/ModeBar";
import LibraryPanel from "./components/Library/LibraryPanel";
import SongEditor from "./components/SongEditor/SongEditor";
import Presentation from "./components/Presentation/Presentation";
import EditPanel from "./components/Edit/EditPanel";
import MediaLibrary from "./components/MediaLibrary/MediaLibrary";
import AudioLibrary from "./components/AudioLibrary/AudioLibrary";
import BiblePanel from "./components/BiblePanel/BiblePanel";
import PlaylistPanel from "./components/Playlist/PlaylistPanel";
import LivePreview from "./components/LivePreview/LivePreview";
import ServiceBar from "./components/ServiceBar/ServiceBar";
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
import type { CenterView, LibraryMode, ToolMode, EditorKind } from "./lib/nav";
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
  const advanceLive = useAppStore((s) => s.advanceLive);
  const clearLive = useAppStore((s) => s.clearLive);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const toggleOutput = useAppStore((s) => s.toggleOutput);
  const setOutputLocked = useAppStore((s) => s.setOutputLocked);
  const refreshOutput = useAppStore((s) => s.refreshOutput);
  const setAudioState = useAppStore((s) => s.setAudioState);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("songs");
  const [centerView, setCenterView] = useState<CenterView>({ kind: "show" });
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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
    setLibraryMode(m);
    if (centerView.kind !== "show") setCenterView({ kind: "show" });
  };

  const onToolMode = (m: ToolMode) => {
    setCenterView((prev) =>
      prev.kind === "tool" && prev.mode === m
        ? { kind: "show" }
        : { kind: "tool", mode: m },
    );
  };

  const onOpenEditor = (editor: EditorKind, songId?: string | null) => {
    setCenterView({ kind: "editor", editor, songId });
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
              const main = document.querySelector("main.app-main");
              if (main) {
                const range = document.createRange();
                if (isBible) {
                  const parts = main.querySelectorAll<HTMLElement>(".bible-fixed, .bible-scroll");
                  if (parts.length && parts[0].firstChild && parts[parts.length - 1].lastChild) {
                    range.setStart(parts[0], 0);
                    range.setEnd(
                      parts[parts.length - 1],
                      parts[parts.length - 1].childNodes.length,
                    );
                  } else {
                    range.selectNodeContents(main);
                  }
                } else {
                  range.selectNodeContents(main);
                }
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
        return libraryMode;
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
        const next = MODE_ORDER[9];
        if (next) applyMode(next);
        return;
      }
      if (e.ctrlKey && e.code === "Minus") {
        e.preventDefault();
        const next = MODE_ORDER[9];
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
    libraryMode,
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
      <ModeBar
        libraryMode={libraryMode}
        centerView={centerView}
        onLibraryMode={onLibraryMode}
        onToolMode={onToolMode}
        onShow={onShow}
      />
      <div className="app-body">
        <LibraryPanel mode={libraryMode} onOpenEditor={onOpenEditor} />
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
          {centerView.kind === "tool" && centerView.mode === "projects" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <PlaylistPanel />
            </PanelHost>
          )}
          {centerView.kind === "editor" && centerView.editor === "songs" && (
            <PanelHost onBack={() => setCenterView({ kind: "show" })}>
              <SongEditor initialSongId={centerView.songId ?? null} hideList />
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
        <aside className="app-right">
          <LivePreview />
        </aside>
      </div>
      <ServiceBar />
      <AudioPlayerPanel />
      <AudioPlayer />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}