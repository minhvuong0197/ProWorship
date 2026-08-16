import { useEffect, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { obsClient } from "./lib/obs";
import Toolbar from "./components/Toolbar/Toolbar";
import Sidebar from "./components/Sidebar/Sidebar";
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
import { TABS_ORDER } from "./lib/shortcuts";
import { editBusy } from "./lib/editBusy";
import type { Tab } from "./components/Sidebar/Sidebar";

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
  const [tab, setTab] = useState<Tab>("presentation");
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
              const main = document.querySelector("main.app-main");
              if (main) {
                const range = document.createRange();
                if (tab === "bible") {
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

      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const idx = TABS_ORDER.indexOf(tab);
        const next = TABS_ORDER[(idx + dir + TABS_ORDER.length) % TABS_ORDER.length];
        setTab(next);
        return;
      }

      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const next = TABS_ORDER[Number(e.key) - 1];
        if (next) setTab(next);
        return;
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        const next = TABS_ORDER[9];
        if (next) setTab(next);
        return;
      }
      if (e.ctrlKey && e.code === "Minus") {
        e.preventDefault();
        const next = TABS_ORDER[9];
        if (next) setTab(next);
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
  }, [advanceLive, clearLive, tab, toggleOutput, setOutputLocked, refreshOutput, setAudioState, live?.output_locked, live?.audio?.volume]);

  return (
    <div className="app-shell">
      <Toolbar onOpenShortcuts={() => setShowShortcuts(true)} />
      <div className="app-body">
        <Sidebar tab={tab} onTabChange={setTab} />
        <main className="app-main">
          {tab === "presentation" && <Presentation />}
          {tab === "songs" && <SongEditor />}
          {tab === "edit" && <EditPanel />}
          {tab === "media" && <MediaLibrary />}
          {tab === "audio" && <AudioLibrary />}
          {tab === "bible" && <BiblePanel />}
          {tab === "playlists" && <PlaylistPanel />}
          {tab === "overlays" && <OverlaysPanel />}
          {tab === "functions" && <FunctionsPanel />}
          {tab === "props" && <PropsPanel />}
          {tab === "obs" && <ObsController />}
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
