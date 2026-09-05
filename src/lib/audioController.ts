import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";

export type AudioTrack = {
  id: string;
  title: string;
  file_path: string;
};

export type LoopMode = "none" | "single" | "all";
export type PlaybackSource = "live" | "playlist" | "idle";

export type PlayerState = {
  source: PlaybackSource;
  tracks: AudioTrack[];
  index: number;
  playing: boolean;
  volume: number;
  loop: LoopMode;
  shuffle: boolean;
  crossfade: boolean;
  crossfadeMs: number;
  currentTime: number;
  duration: number;
  error: string | null;
};

type Listener = (state: PlayerState) => void;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const toSeconds = (n: number) => (Number.isFinite(n) ? n : 0);

class AudioEngine {
  private a = new Audio();
  private b = new Audio();
  private active: HTMLAudioElement = this.a;
  private listeners = new Set<Listener>();
  private fadeTimer: number | null = null;
  private lastTimeEmit = 0;
  private state: PlayerState = {
    source: "idle",
    tracks: [],
    index: 0,
    playing: false,
    volume: 1,
    loop: "none",
    shuffle: false,
    crossfade: false,
    crossfadeMs: 3000,
    currentTime: 0,
    duration: 0,
    error: null,
  };

  constructor() {
    for (const el of [this.a, this.b]) {
      el.preload = "auto";
      el.addEventListener("ended", () => this.handleEnded(el));
      el.addEventListener("error", () => {
        if (el !== this.active) return;
        const code = el.error?.code;
        const detail = code ? ` (mã ${code})` : "";
        this.setState({ playing: false, error: `Không phát được file audio${detail}` });
      });
      el.addEventListener("loadedmetadata", () => {
        if (el === this.active) this.updateMeta();
      });
      el.addEventListener("timeupdate", () => {
        if (el !== this.active) return;
        const now = Date.now();
        if (now - this.lastTimeEmit < 200) return;
        this.lastTimeEmit = now;
        this.updateMeta();
      });
    }
  }

  getState(): PlayerState {
    return { ...this.state, tracks: [...this.state.tracks] };
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private setState(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const cb of this.listeners) cb(this.getState());
  }

  private updateMeta() {
    const t = toSeconds(this.active.currentTime);
    const d = toSeconds(this.active.duration);
    if (
      Math.abs(t - this.state.currentTime) > 0.1 ||
      Math.abs(d - this.state.duration) > 0.1
    ) {
      this.setState({ currentTime: t, duration: d });
    }
  }

  private emitNow() {
    this.setState({ currentTime: toSeconds(this.active.currentTime) });
  }

  private pauseAll() {
    this.a.pause();
    this.b.pause();
  }

  private clearFade() {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  loadAndPlay(
    tracks: AudioTrack[],
    opts?: {
      index?: number;
      play?: boolean;
      source?: PlaybackSource;
      volume?: number;
      loop?: LoopMode;
      shuffle?: boolean;
      crossfade?: boolean;
      crossfadeMs?: number;
    },
  ): void {
    if (tracks.length === 0) {
      this.stop();
      return;
    }
    const index = clamp(Math.round(opts?.index ?? 0), 0, tracks.length - 1);
    this.clearFade();
    this.pauseAll();
    this.active = this.a;
    this.active.src = convertFileSrc(tracks[index].file_path);
    this.active.volume = clamp(opts?.volume ?? this.state.volume, 0, 1);
    this.setState({
      source: opts?.source ?? "playlist",
      tracks,
      index,
      playing: false,
      volume: clamp(opts?.volume ?? this.state.volume, 0, 1),
      loop: opts?.loop ?? this.state.loop,
      shuffle: opts?.shuffle ?? this.state.shuffle,
      crossfade: opts?.crossfade ?? this.state.crossfade,
      crossfadeMs: opts?.crossfadeMs ?? this.state.crossfadeMs,
      currentTime: 0,
      duration: 0,
      error: null,
    });
    if (opts?.play) this.play();
  }

  play(): void {
    const s = this.state;
    if (s.tracks.length === 0) return;
    if (s.source === "idle") {
      this.active = this.a;
      if (!this.active.src) {
        this.active.src = convertFileSrc(s.tracks[s.index].file_path);
      }
    }
    const p = this.active.play();
    if (p) {
      p.catch(() => {
        this.setState({ playing: false, error: "Trình duyệt chặn phát audio hoặc file không hợp lệ" });
      });
    }
    this.setState({ playing: true });
  }

  pause(): void {
    this.clearFade();
    this.pauseAll();
    this.setState({ playing: false });
  }

  togglePlay(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  stop(): void {
    this.clearFade();
    this.pauseAll();
    const wasLive = this.state.source === "live";
    this.setState({
      source: "idle",
      tracks: [],
      index: 0,
      playing: false,
      currentTime: 0,
      duration: 0,
      error: null,
    });
    if (wasLive) api.setAudioState(false).catch(() => {});
  }

  clearError(): void {
    this.setState({ error: null });
  }

  next(): void {
    const s = this.state;
    const n = s.tracks.length;
    if (n === 0) return;
    let idx: number | null = null;
    if (s.shuffle) {
      if (n > 1) {
        do {
          idx = Math.floor(Math.random() * n);
        } while (idx === s.index);
      } else if (s.loop !== "none") {
        idx = s.index;
      }
    } else {
      if (s.index + 1 < n) idx = s.index + 1;
      else if (s.loop === "all") idx = 0;
    }
    if (idx !== null) this.transitionTo(idx);
  }

  prev(): void {
    const s = this.state;
    const n = s.tracks.length;
    if (n === 0) return;
    if (s.currentTime > 3) {
      this.seek(0);
      return;
    }
    let idx: number | null = null;
    if (s.shuffle) {
      if (n > 1) {
        do {
          idx = Math.floor(Math.random() * n);
        } while (idx === s.index);
      } else if (s.loop !== "none") {
        idx = s.index;
      }
    } else {
      if (s.index - 1 >= 0) idx = s.index - 1;
      else if (s.loop === "all") idx = n - 1;
    }
    if (idx !== null) this.transitionTo(idx);
    else this.seek(0);
  }

  seek(time: number): void {
    const d = this.state.duration || 0;
    this.active.currentTime = clamp(time, 0, d);
    this.emitNow();
  }

  setVolume(volume: number): void {
    const v = clamp(volume, 0, 1);
    this.setState({ volume: v });
    this.active.volume = v;
  }

  setLoop(mode: LoopMode): void {
    this.setState({ loop: mode });
  }

  setShuffle(enabled: boolean): void {
    this.setState({ shuffle: enabled });
  }

  setCrossfade(enabled: boolean, ms?: number): void {
    this.setState({
      crossfade: enabled,
      crossfadeMs: ms ?? this.state.crossfadeMs,
    });
  }

  private handleEnded(el: HTMLAudioElement) {
    if (el !== this.active) return;
    const s = this.state;
    if (s.loop === "single") {
      this.active.currentTime = 0;
      const p = this.active.play();
      if (p) p.catch(() => this.setState({ playing: false, error: "Không thể lặp lại file audio" }));
      return;
    }
    let idx: number | null = null;
    const n = s.tracks.length;
    if (s.shuffle) {
      if (n > 1) {
        do {
          idx = Math.floor(Math.random() * n);
        } while (idx === s.index);
      } else {
        idx = s.loop === "all" ? s.index : null;
      }
    } else {
      if (s.index + 1 < n) idx = s.index + 1;
      else if (s.loop === "all") idx = 0;
    }
    if (idx === null) {
      if (s.source === "live") {
        api.setAudioState(false).catch(() => {});
      }
      this.setState({ playing: false, currentTime: 0 });
      return;
    }
    this.transitionTo(idx);
  }

  private transitionTo(index: number) {
    const s = this.state;
    const track = s.tracks[index];
    if (!track) return;
    const fadeMs = s.crossfade ? Math.max(0, s.crossfadeMs) : 0;
    const old = this.active;
    const oldPlaying = !old.paused && toSeconds(old.currentTime) > 0;

    this.clearFade();

    if (fadeMs > 0 && oldPlaying) {
      const nextEl = old === this.a ? this.b : this.a;
      this.active = nextEl;
      nextEl.volume = 0;
      nextEl.src = convertFileSrc(track.file_path);
      const p = nextEl.play();
      if (p) p.catch(() => this.setState({ playing: false, error: "Không thể chuyển sang track audio kế tiếp" }));
      this.fadeOutIn(nextEl, old, fadeMs);
    } else {
      this.pauseAll();
      this.active = this.a;
      this.active.src = convertFileSrc(track.file_path);
      this.active.volume = clamp(s.volume, 0, 1);
      const p = this.active.play();
      if (p) p.catch(() => this.setState({ playing: false, error: "Không thể phát track audio kế tiếp" }));
    }
    this.setState({ index, currentTime: 0, duration: 0 });
  }

  private fadeOutIn(
    nextEl: HTMLAudioElement,
    old: HTMLAudioElement,
    ms: number,
  ) {
    const target = clamp(this.state.volume, 0, 1);
    const start = Date.now();
    this.fadeTimer = window.setInterval(() => {
      const t = clamp((Date.now() - start) / ms, 0, 1);
      nextEl.volume = target * t;
      old.volume = target * (1 - t);
      if (t >= 1) {
        this.clearFade();
        old.pause();
        old.volume = target;
      }
    }, 30);
  }
}

export const audioEngine = new AudioEngine();
