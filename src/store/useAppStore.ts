import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "../lib/api";
import { audioEngine } from "../lib/audioController";
import type {
  AppSettings,
  AudioItem,
  AudioPlaylist,
  CcliLog,
  CompanionInfo,
  EditShow,
  LiveState,
  MediaItem,
  MonitorInfo,
  Overlay,
  OutputWindowInfo,
  Playlist,
  Prop,
  Song,
  Template,
} from "../lib/types";

export interface DiagnosticEntry {
  at: number;
  level: "error";
  message: string;
}

interface AppStateStore {
  loaded: boolean;
  lastError: string | null;
  diagnostics: DiagnosticEntry[];
  songs: Song[];
  editShows: EditShow[];
  media: MediaItem[];
  audio: AudioItem[];
  audioPlaylists: AudioPlaylist[];
  playlists: Playlist[];
  templates: Template[];
  props: Prop[];
  overlays: Overlay[];
  settings: AppSettings | null;
  live: LiveState | null;
  armedLive: LiveState | null;
  monitors: MonitorInfo[];
  ccliLog: CcliLog[];
  companionInfo: CompanionInfo | null;
  outputOpen: boolean;
  stageOpen: boolean;
  outputs: OutputWindowInfo[];
  activePlaylistId: string | null;
  ndiSources: string[];
  ndiInputActive: boolean;
  ndiInputSource: string | null;
  setActivePlaylistId: (id: string | null) => void;
  reportError: (error: unknown, fallback?: string) => void;
  recordDiagnostic: (message: string) => void;
  clearError: () => void;
  refreshNdiSources: () => Promise<void>;
  startLiveInput: (name: string) => Promise<void>;
  stopLiveInput: () => Promise<void>;
  loadAll: () => Promise<void>;
  saveSong: (song: Song) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
  saveEditShow: (show: EditShow) => Promise<void>;
  deleteEditShow: (id: string) => Promise<void>;
  importMedia: (paths: string[]) => Promise<void>;
  deleteMedia: (id: string) => Promise<void>;
  importAudio: (paths: string[]) => Promise<void>;
  deleteAudio: (id: string) => Promise<void>;
  saveAudioPlaylist: (playlist: AudioPlaylist) => Promise<AudioPlaylist>;
  deleteAudioPlaylist: (id: string) => Promise<void>;
  savePlaylist: (playlist: Playlist) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  saveTemplate: (template: Template) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  restoreDefaultTemplates: () => Promise<void>;
  saveProp: (prop: Prop) => Promise<void>;
  deleteProp: (id: string) => Promise<void>;
  saveOverlay: (overlay: Overlay) => Promise<void>;
  deleteOverlay: (id: string) => Promise<void>;
  refreshCcliLog: () => Promise<void>;
  refreshCompanionInfo: () => Promise<void>;
  setSettings: (settings: AppSettings) => Promise<void>;
  goLive: (live: LiveState) => Promise<void>;
  armLive: (live: LiveState) => void;
  clearArmedLive: () => void;
  goLiveArmed: () => Promise<void>;
  setStageMessage: (message: string) => Promise<void>;
  clearLive: () => Promise<void>;
  advanceLive: (dir: number) => Promise<void>;
  setMediaPlaying: (playing: boolean) => Promise<void>;
  setAudioState: (playing?: boolean, volume?: number) => Promise<void>;
  stopAudio: () => Promise<void>;
  startCountdown: (seconds: number) => Promise<void>;
  stopCountdown: () => Promise<void>;
  gotoSlide: (index: number) => Promise<void>;
  loadPlaylist: (playlistId: string) => Promise<void>;
  gotoPlaylistEntry: (playlistId: string, index: number) => Promise<void>;
  startServiceTimeline: () => Promise<void>;
  stopServiceTimeline: () => Promise<void>;
  openOutput: (monitorName: string | null) => Promise<void>;
  closeOutput: () => Promise<void>;
  toggleOutput: (monitorName?: string | null) => Promise<void>;
  openExtraOutput: (monitorName: string | null) => Promise<void>;
  closeOutputByLabel: (label: string) => Promise<void>;
  refreshOutputs: () => Promise<void>;
  openStage: () => Promise<void>;
  closeStage: () => Promise<void>;
  setOutputLocked: (locked: boolean) => Promise<void>;
  refreshOutput: () => Promise<void>;
}

let listenerReady = false;

export const useAppStore = create<AppStateStore>()(
  persist(
    (set, get) => ({
  loaded: false,
  lastError: null,
  diagnostics: [],
  songs: [],
  editShows: [],
  media: [],
  audio: [],
  audioPlaylists: [],
  playlists: [],
  templates: [],
  props: [],
  overlays: [],
  settings: null,
  live: null,
  armedLive: null,
  monitors: [],
  ccliLog: [],
  companionInfo: null,
  outputOpen: false,
  stageOpen: false,
  outputs: [],
  activePlaylistId: null,
  ndiSources: [],
  ndiInputActive: false,
  ndiInputSource: null,
  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  reportError: (error, fallback = "Thao tác không thành công") => {
    const message = error instanceof Error ? error.message : String(error || fallback);
    console.error("[ProWorship]", message);
    const resolved = message || fallback;
    const entry: DiagnosticEntry = { at: Date.now(), level: "error", message: resolved };
    set((state) => ({
      lastError: resolved,
      diagnostics: [...state.diagnostics, entry].slice(-50),
    }));
  },
  recordDiagnostic: (message) => {
    const entry: DiagnosticEntry = { at: Date.now(), level: "error", message };
    set((state) => ({ diagnostics: [...state.diagnostics, entry].slice(-50) }));
  },
  clearError: () => set({ lastError: null }),
  refreshNdiSources: async () => {
    try {
      const sources = await api.ndiInputListSources();
      set({ ndiSources: sources });
    } catch {
      set({ ndiSources: [] });
    }
  },
  startLiveInput: async (name) => {
    await api.ndiInputStart(name);
    set({ ndiInputActive: true, ndiInputSource: name });
  },
  stopLiveInput: async () => {
    await api.ndiInputStop();
    set({ ndiInputActive: false, ndiInputSource: null });
  },
  loadAll: async () => {
    if (get().loaded) return;
    if (!listenerReady) {
      listenerReady = true;
      listen<LiveState>("live-update", (event) => {
        set({ live: event.payload });
      });
      listen<{ output_open: boolean; stage_open: boolean; outputs?: OutputWindowInfo[] }>("windows-update", (event) => {
        set({
          outputOpen: event.payload.output_open,
          stageOpen: event.payload.stage_open,
          outputs: event.payload.outputs ?? [],
        });
      });
      listen<AppSettings>("settings-update", (event) => {
        set({ settings: event.payload });
      });
      listen<Template[]>("templates-updated", (event) => {
        if (Array.isArray(event.payload)) set({ templates: event.payload });
      });
    }
    try {
      const [songs, editShows, media, audio, audioPlaylists, playlists, templates, props, overlays, settings, live, monitors, ccliLog, companionInfo, outputOpen, stageOpen, outputs] =
        await Promise.all([
          api.getSongs(),
          api.getEditShows(),
          api.getMediaLibrary(),
          api.getAudioLibrary(),
          api.getAudioPlaylists(),
          api.getPlaylists(),
          api.getTemplates(),
          api.getProps(),
          api.getOverlays(),
          api.getSettings(),
          api.getLiveState(),
          api.listMonitors(),
          api.getCcliLog(),
          api.getCompanionInfo(),
          api.isOutputOpen(),
          api.isStageOpen(),
          api.listOutputWindows(),
        ]);
      set({
        songs,
        editShows,
        media,
        audio,
        audioPlaylists,
        playlists,
        templates,
        props,
        overlays,
        settings,
        live,
        monitors,
        ccliLog,
        companionInfo,
        outputOpen,
        stageOpen,
        outputs,
        loaded: true,
      });
    } catch (err) {
      console.error("loadAll failed", err);
      get().reportError(err, "Không tải được dữ liệu ProWorship");
      set({ loaded: true });
    }
  },

  saveSong: async (song) => {
    const saved = await api.saveSong(song);
    set((s) => ({
      songs: s.songs.some((x) => x.id === saved.id)
        ? s.songs.map((x) => (x.id === saved.id ? saved : x))
        : [...s.songs, saved],
    }));
  },

  deleteSong: async (id) => {
    await api.deleteSong(id);
    set((s) => ({ songs: s.songs.filter((x) => x.id !== id) }));
  },

  saveEditShow: async (show) => {
    const saved = await api.saveEditShow(show);
    set((s) => ({
      editShows: s.editShows.some((x) => x.id === saved.id)
        ? s.editShows.map((x) => (x.id === saved.id ? saved : x))
        : [...s.editShows, saved],
    }));
  },

  deleteEditShow: async (id) => {
    await api.deleteEditShow(id);
    set((s) => ({ editShows: s.editShows.filter((x) => x.id !== id) }));
  },

  importMedia: async (paths) => {
    const items = await api.importMedia(paths);
    set((s) => ({ media: [...s.media, ...items] }));
  },

  deleteMedia: async (id) => {
    await api.deleteMedia(id);
    set((s) => ({ media: s.media.filter((x) => x.id !== id) }));
  },

  importAudio: async (paths) => {
    const items = await api.importAudio(paths);
    set((s) => ({ audio: [...s.audio, ...items] }));
  },

  deleteAudio: async (id) => {
    await api.deleteAudio(id);
    set((s) => ({
      audio: s.audio.filter((x) => x.id !== id),
      audioPlaylists: s.audioPlaylists.map((p) => ({
        ...p,
        track_ids: p.track_ids.filter((t) => t !== id),
      })),
    }));
  },

  saveAudioPlaylist: async (playlist) => {
    const saved = await api.saveAudioPlaylist(playlist);
    set((s) => ({
      audioPlaylists: s.audioPlaylists.some((x) => x.id === saved.id)
        ? s.audioPlaylists.map((x) => (x.id === saved.id ? saved : x))
        : [...s.audioPlaylists, saved],
    }));
    return saved;
  },

  deleteAudioPlaylist: async (id) => {
    await api.deleteAudioPlaylist(id);
    set((s) => ({
      audioPlaylists: s.audioPlaylists.filter((x) => x.id !== id),
    }));
  },

  savePlaylist: async (playlist) => {
    const saved = await api.savePlaylist(playlist);
    set((s) => ({
      playlists: s.playlists.some((x) => x.id === saved.id)
        ? s.playlists.map((x) => (x.id === saved.id ? saved : x))
        : [...s.playlists, saved],
    }));
  },

  deletePlaylist: async (id) => {
    await api.deletePlaylist(id);
    set((s) => ({ playlists: s.playlists.filter((x) => x.id !== id) }));
  },

  saveTemplate: async (template) => {
    const saved = await api.saveTemplate(template);
    set((s) => ({
      templates: s.templates.some((x) => x.id === saved.id)
        ? s.templates.map((x) => (x.id === saved.id ? saved : x))
        : [...s.templates, saved],
    }));
  },

  deleteTemplate: async (id) => {
    await api.deleteTemplate(id);
    set((s) => ({
      templates: s.templates.filter((x) => x.id !== id),
      settings: s.settings && (s.settings.default_template_id === id || s.settings.default_bible_template_id === id)
        ? {
            ...s.settings,
            default_template_id: s.settings.default_template_id === id ? null : s.settings.default_template_id,
            default_bible_template_id: s.settings.default_bible_template_id === id ? null : s.settings.default_bible_template_id,
          }
        : s.settings,
    }));
  },

  restoreDefaultTemplates: async () => {
    const restored = await api.restoreDefaultTemplates();
    set({ templates: restored });
  },

  saveProp: async (prop) => {
    const saved = await api.saveProp(prop);
    set((s) => ({
      props: s.props.some((x) => x.id === saved.id)
        ? s.props.map((x) => (x.id === saved.id ? saved : x))
        : [...s.props, saved],
    }));
  },

  deleteProp: async (id) => {
    await api.deleteProp(id);
    set((s) => ({ props: s.props.filter((x) => x.id !== id) }));
  },

  saveOverlay: async (overlay) => {
    const saved = await api.saveOverlay(overlay);
    set((s) => ({
      overlays: s.overlays.some((x) => x.id === saved.id)
        ? s.overlays.map((x) => (x.id === saved.id ? saved : x))
        : [...s.overlays, saved],
    }));
  },

  deleteOverlay: async (id) => {
    await api.deleteOverlay(id);
    set((s) => ({ overlays: s.overlays.filter((x) => x.id !== id) }));
  },

  refreshCcliLog: async () => {
    const log = await api.getCcliLog();
    set({ ccliLog: log });
  },

  refreshCompanionInfo: async () => {
    const info = await api.getCompanionInfo();
    set({ companionInfo: info });
  },

  setSettings: async (settings) => {
    const saved = await api.setSettings(settings);
    set({ settings: saved });
  },

  goLive: async (live) => {
    try {
      const updated = await api.setLiveState(live);
      set({ live: updated });
    } catch (err) {
      get().reportError(err, "Không thể đưa slide lên Output");
      throw err;
    }
  },

  armLive: (live) => set({ armedLive: live }),

  clearArmedLive: () => set({ armedLive: null }),

  goLiveArmed: async () => {
    const armed = get().armedLive;
    if (!armed) return;
    await get().goLive(armed);
    set({ armedLive: null });
  },

  setStageMessage: async (message) => {
    const updated = await api.setStageMessage(message);
    set({ live: updated });
  },

  clearLive: async () => {
    try {
      const updated = await api.clearLive();
      set({ live: updated });
    } catch (err) {
      get().reportError(err, "Không thể clear Output");
      throw err;
    }
  },

  advanceLive: async (dir) => {
    try {
      const updated = await api.advanceLive(dir);
      set({ live: updated });
    } catch (err) {
      get().reportError(err, "Không thể chuyển slide");
      throw err;
    }
  },

  setOutputLocked: async (locked) => {
    const updated = await api.setOutputLocked(locked);
    set({ live: updated });
  },

  refreshOutput: async () => {
    await api.refreshOutput();
  },

  setMediaPlaying: async (playing) => {
    const updated = await api.setMediaPlaying(playing);
    set({ live: updated });
  },

  setAudioState: async (playing, volume) => {
    if (playing === true) audioEngine.play();
    else if (playing === false) audioEngine.pause();
    if (volume !== undefined) audioEngine.setVolume(volume);
    const updated = await api.setAudioState(playing, volume);
    set({ live: updated });
  },

  stopAudio: async () => {
    audioEngine.stop();
    const updated = await api.stopAudio();
    set({ live: updated });
  },

  startCountdown: async (seconds) => {
    const updated = await api.startCountdown(seconds);
    set({ live: updated });
  },

  stopCountdown: async () => {
    const updated = await api.stopCountdown();
    set({ live: updated });
  },

  gotoSlide: async (index) => {
    const updated = await api.gotoSlide(index);
    set({ live: updated });
  },

  loadPlaylist: async (playlistId) => {
    const updated = await api.loadPlaylist(playlistId);
    set({ live: updated });
  },

  gotoPlaylistEntry: async (playlistId, index) => {
    const updated = await api.gotoPlaylistEntry(playlistId, index);
    set({ live: updated });
  },

  startServiceTimeline: async () => {
    const updated = await api.startServiceTimeline();
    set({ live: updated });
  },

  stopServiceTimeline: async () => {
    const updated = await api.stopServiceTimeline();
    set({ live: updated });
  },

  openOutput: async (monitorName) => {
    await api.openOutputWindow(monitorName);
    set({ outputOpen: true });
  },

  closeOutput: async () => {
    await api.closeOutputWindow();
    set({ outputOpen: false });
  },

  toggleOutput: async (monitorName) => {
    const isOpen = await api.isOutputOpen();
    if (isOpen) {
      await api.closeOutputWindow();
      set({ outputOpen: false });
    } else {
      await api.openOutputWindow(monitorName ?? null);
      set({ outputOpen: true });
    }
  },

  openExtraOutput: async (monitorName) => {
    await api.openExtraOutputWindow(monitorName);
    const outputs = await api.listOutputWindows();
    set({ outputs, outputOpen: outputs.some((o) => o.label === "output") });
  },

  closeOutputByLabel: async (label) => {
    await api.closeOutputWindowByLabel(label);
    const outputs = await api.listOutputWindows();
    set({
      outputs,
      outputOpen: outputs.some((o) => o.label === "output"),
    });
  },

  refreshOutputs: async () => {
    const outputs = await api.listOutputWindows();
    set({ outputs });
  },

  openStage: async () => {
    await api.openStageWindow();
    set({ stageOpen: true });
  },

  closeStage: async () => {
    await api.closeStageWindow();
    set({ stageOpen: false });
  },
    }),
    {
      // Survive crash/power loss: remember which playlist was active in the
      // Control window. Presentation position itself lives in `live` state,
      // which the Rust backend already persists to data.json on every change.
      name: "pw-control-ui",
      partialize: (s) => ({ activePlaylistId: s.activePlaylistId }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
