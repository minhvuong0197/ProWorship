export type ObsStatus = "disconnected" | "connecting" | "connected";

export interface ObsInput {
  inputName: string;
  inputKind?: string;
  volumeMul?: number;
  volumeDb?: number;
  muted?: boolean;
}

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

type Listener = () => void;
type Resolve = (data: any) => void;
type Reject = (err: string) => void;
type PendingReq = { resolve: Resolve; reject: Reject; quiet?: boolean };

export async function sha256B64(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  let bin = "";
  new Uint8Array(digest).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/**
 * Mã xác thực OBS WebSocket v5:
 * secret = sha256(password + salt) → base64, rồi sha256(secret + challenge) → base64.
 */
export async function obsAuthSecret(
  password: string,
  salt: string,
  challenge: string,
): Promise<string> {
  const secret = await sha256B64(password + salt);
  return sha256B64(secret + challenge);
}

/**
 * Map mã đóng kết nối OBS (hoặc chuỗi reason) sang thông báo tiếng Việt.
 * Trả về `null` nếu không khớp mã nào.
 */
export function describeObsClose(code: number, reason: string): string | null {
  const r = (reason ?? "").toLowerCase();
  if (code === 4007 || r.includes("authentication failed") || r.includes("authentication.")) {
    return "Sai mật khẩu — không thể xác thực với OBS. Kiểm tra lại mật khẩu trong Tools → WebSocket Server Settings.";
  }
  if (code === 4009 || r.includes("authentication is required") || r.includes("authentication required")) {
    return "OBS yêu cầu mật khẩu — hãy nhập mật khẩu WebSocket của OBS.";
  }
  if (code === 4006 || r.includes("not authenticated")) {
    return "OBS báo chưa xác thực — vui lòng kết nối lại.";
  }
  if (code === 1006) {
    return "Không thể kết nối tới OBS — kiểm tra OBS đang chạy và đã bật WebSocket server (Tools → WebSocket Server Settings).";
  }
  return null;
}

class ObsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, PendingReq>();
  private msgId = 0;
  private cfg: ObsConfig | null = null;

  status: ObsStatus = "disconnected";
  lastError: string | null = null;
  scenes: string[] = [];
  currentScene: string | null = null;
  streamActive = false;
  recordActive = false;
  inputs: ObsInput[] = [];
  transitions: string[] = [];
  currentTransition: string | null = null;
  transitionDuration = 0;
  sceneItems: { id: number; sourceName: string; enabled: boolean }[] = [];
  canvasWidth = 0;
  canvasHeight = 0;
  action: string | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private inputRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  private clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private setAction(msg: string | null) {
    this.action = msg;
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (msg) {
      this.actionTimer = setTimeout(() => {
        this.action = null;
        this.actionTimer = null;
        this.notify();
      }, 3000);
    }
    this.notify();
  }

  private scheduleInputRefresh() {
    if (this.inputRefreshTimer) return;
    this.inputRefreshTimer = setTimeout(() => {
      this.inputRefreshTimer = null;
      this.refreshInputs();
    }, 800);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  connect(cfg: ObsConfig) {
    this.cfg = cfg;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.status = "connecting";
    this.lastError = null;
    this.notify();

    const host = (cfg.host ?? "").trim();
    const port = Number(cfg.port) || 4455;
    if (!host) {
      this.status = "disconnected";
      this.lastError = "Địa chỉ OBS đang trống — hãy nhập địa chỉ (mặc định 127.0.0.1).";
      this.notify();
      return;
    }
    const url = `ws://${host}:${port}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.status = "disconnected";
      this.lastError = String(e);
      this.notify();
      return;
    }
    this.ws = ws;

    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this.status === "connecting") {
        this.lastError = "Không thể kết nối tới OBS — kiểm tra OBS đang chạy và đã bật WebSocket server (Tools → WebSocket Server Settings).";
        this.notify();
      }
    }, 8000);

    ws.onmessage = async (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.op) {
        case 0: {
          const auth = msg.d?.authentication;
          let authentication: string | undefined;
          if (auth) {
            const secret = await sha256B64(cfg.password + auth.salt);
            authentication = await sha256B64(secret + auth.challenge);
          }
          this.sendRaw({
            op: 1,
            d: {
              rpcVersion: 1,
              authentication,
              eventSubscriptions:
                (1 << 0) | // General
                (1 << 2) | // Scenes
                (1 << 3) | // Inputs
                (1 << 4) | // Transitions
                (1 << 6) | // Outputs (StreamStateChanged / RecordStateChanged)
                (1 << 7) | // SceneItems
                (1 << 10) | // Ui
                (1 << 11), // InputVolumeMeters
            },
          });
          break;
        }
        case 2:
          this.clearConnectTimer();
          this.status = "connected";
          this.lastError = null;
          this.notify();
          this.refresh();
          break;
        case 5:
          this.handleEvent(msg.d);
          break;
        case 7:
          this.handleResponse(msg.d);
          break;
      }
    };

    ws.onclose = (e) => {
      this.clearConnectTimer();
      this.ws = null;
      this.status = "disconnected";
      this.scenes = [];
      this.currentScene = null;
      this.inputs = [];
      const msg = describeObsClose(e.code, e.reason ?? "");
      if (msg) {
        this.lastError = msg;
      }
      this.notify();
    };

    ws.onerror = () => {
      if (this.status !== "connected") {
        this.lastError = "Không thể kết nối tới OBS — kiểm tra địa chỉ, cổng và bật OBS WebSocket.";
        this.notify();
      }
    };
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.clearConnectTimer();
    this.status = "disconnected";
    this.lastError = null;
    this.notify();
  }

  private sendRaw(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  request<T = any>(
    requestType: string,
    requestData?: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `r${this.msgId++}`;
      this.pending.set(id, { resolve, reject, quiet: opts?.quiet });
      this.sendRaw({
        op: 6,
        d: { requestType, requestId: id, requestData: requestData ?? {} },
      });
    });
  }

  private handleResponse(d: any) {
    if (d.requestId === "identify") {
      const st = d.requestStatus ?? {};
      if (!st.result) {
        if (st.code === 205) {
          this.lastError = "Sai mật khẩu — không thể xác thực với OBS. Kiểm tra lại mật khẩu trong Tools → WebSocket Server Settings.";
        } else if (st.code === 203) {
          this.lastError = "OBS yêu cầu mật khẩu — hãy nhập mật khẩu WebSocket của OBS.";
        } else {
          this.lastError = st.comment ?? `OBS từ chối xác thực (${st.code ?? "?"}).`;
        }
        this.notify();
      }
      return;
    }
    const p = this.pending.get(d.requestId);
    if (!p) return;
    this.pending.delete(d.requestId);
    const st = d.requestStatus ?? {};
    if (st.result) {
      p.resolve(d.responseData);
    } else {
      const err: string = st.comment ?? `OBS lỗi: ${d.requestType}`;
      if (!p.quiet) {
        this.lastError = err;
      }
      p.reject(err);
    }
  }

  private handleEvent(d: any) {
    switch (d.eventType) {
      case "CurrentProgramSceneChanged":
        this.currentScene = d.eventData?.sceneName ?? null;
        this.refreshSceneItems();
        this.notify();
        break;
      case "StreamStateChanged":
        this.streamActive = d.eventData?.outputActive === true;
        this.notify();
        break;
      case "RecordStateChanged":
        this.recordActive = d.eventData?.outputActive === true;
        this.notify();
        break;
      case "InputVolumeMeters":
        this.scheduleInputRefresh();
        break;
      case "InputMuteStateChanged":
        this.refreshInputs();
        break;
    }
  }

  async refresh() {
    if (this.status !== "connected") return;
    try {
      const sceneList = await this.request<{ scenes: { sceneName: string }[] }>(
        "GetSceneList",
        undefined,
        { quiet: true },
      );
      this.scenes = sceneList.scenes?.map((s) => s.sceneName) ?? [];
      const cur = await this.request<{ sceneName: string }>(
        "GetCurrentProgramScene",
        undefined,
        { quiet: true },
      );
      this.currentScene = cur.sceneName ?? null;
    } catch {
      /* ignore */
    }
    try {
      const st = await this.request<{ outputActive: boolean }>(
        "GetStreamStatus",
        undefined,
        { quiet: true },
      );
      this.streamActive = st.outputActive === true;
    } catch {
      /* ignore */
    }
    try {
      const rc = await this.request<{ outputActive: boolean }>(
        "GetRecordStatus",
        undefined,
        { quiet: true },
      );
      this.recordActive = rc.outputActive === true;
    } catch {
      /* ignore */
    }
    try {
      const v = await this.request<{ baseWidth: number; baseHeight: number }>(
        "GetVideoSettings",
        undefined,
        { quiet: true },
      );
      this.canvasWidth = v.baseWidth || 0;
      this.canvasHeight = v.baseHeight || 0;
    } catch {
      /* ignore */
    }
    this.refreshTransitions();
    this.refreshSceneItems();
    this.refreshInputs();
    this.notify();
  }

  async refreshTransitions() {
    if (this.status !== "connected") return;
    try {
      const tr = await this.request<{
        transitions: { transitionName: string }[];
        currentSceneTransitionName: string;
        currentSceneTransitionDuration: number;
      }>("GetSceneTransitionList", undefined, { quiet: true });
      this.transitions = (tr.transitions ?? []).map((t) => t.transitionName);
      this.currentTransition = tr.currentSceneTransitionName ?? null;
      this.transitionDuration = tr.currentSceneTransitionDuration ?? 0;
    } catch {
      /* ignore */
    }
  }

  async refreshSceneItems() {
    if (this.status !== "connected" || !this.currentScene) return;
    try {
      const list = await this.request<{
        sceneItems: {
          sceneItemId: number;
          sourceName: string;
          sceneItemEnabled: boolean;
        }[];
      }>("GetSceneItemList", { sceneName: this.currentScene }, { quiet: true });
      this.sceneItems = (list.sceneItems ?? []).map((i) => ({
        id: i.sceneItemId,
        sourceName: i.sourceName,
        enabled: i.sceneItemEnabled !== false,
      }));
    } catch {
      /* ignore */
    }
  }

  async refreshInputs() {
    if (this.status !== "connected") return;
    try {
      const list = await this.request<{ inputs: { inputName: string; inputKind: string }[] }>(
        "GetInputList",
        undefined,
        { quiet: true },
      );
      const names = (list.inputs ?? []).map((i) => i.inputName);
      const out: ObsInput[] = [];
      for (const name of names) {
        try {
          const vol = await this.request<{ inputVolumeMul: number; inputVolumeDb: number }>(
            "GetInputVolume",
            { inputName: name },
            { quiet: true },
          );
          const m = await this.request<{ inputMuted: boolean }>("GetInputMute", {
            inputName: name,
          }, { quiet: true });
          out.push({
            inputName: name,
            volumeMul: vol.inputVolumeMul,
            volumeDb: vol.inputVolumeDb,
            muted: m.inputMuted,
          });
        } catch {
          out.push({ inputName: name });
        }
      }
      this.inputs = out;
      this.notify();
    } catch {
      /* ignore */
    }
  }

  switchScene(name: string) {
    return this.request("SetCurrentProgramScene", { sceneName: name }).then(
      () => {
        this.currentScene = name;
        this.setAction("sceneChanged");
        this.notify();
      },
    );
  }

  toggleStream() {
    const starting = !this.streamActive;
    return this.request(starting ? "StartStream" : "StopStream").then(() => {
      this.streamActive = starting;
      this.setAction(starting ? "streamStarted" : "streamStopped");
      this.notify();
    });
  }

  toggleRecord() {
    const starting = !this.recordActive;
    return this.request(starting ? "StartRecord" : "StopRecord").then(() => {
      this.recordActive = starting;
      this.setAction(starting ? "recordingStarted" : "recordingStopped");
      this.notify();
    });
  }

  setTransition(name: string) {
    return this.request("SetCurrentSceneTransition", { transitionName: name }).then(
      () => {
        this.currentTransition = name;
        this.notify();
      },
    );
  }

  setTransitionDuration(ms: number) {
    const d = Math.max(0, Math.round(ms));
    return this.request("SetCurrentSceneTransitionDuration", {
      transitionDuration: d,
    }).then(() => {
      this.transitionDuration = d;
      this.notify();
    });
  }

  setSourceVisible(name: string, visible: boolean) {
    const item = this.sceneItems.find((i) => i.sourceName === name);
    if (!item || !this.currentScene) return Promise.reject("Không tìm thấy source");
    return this.request("SetSceneItemEnabled", {
      sceneName: this.currentScene,
      sceneItemId: item.id,
      sceneItemEnabled: visible,
    }).then(() => {
      const it = this.sceneItems.find((i) => i.sourceName === name);
      if (it) it.enabled = visible;
      this.notify();
    });
  }

  async getPreview(width: number, height: number): Promise<string | null> {
    if (!this.currentScene) return null;
    return this.getSceneScreenshot(this.currentScene, width, height);
  }

  async getSceneScreenshot(
    scene: string | null,
    width: number,
    height: number,
  ): Promise<string | null> {
    if (this.status !== "connected" || !scene) return null;
    try {
      const r = await this.request<{ imageData: string }>("GetSourceScreenshot", {
        sourceName: scene,
        imageFormat: "png",
        imageWidth: width,
        imageHeight: height,
      }, { quiet: true });
      return r.imageData || null;
    } catch {
      return null;
    }
  }

  setVolume(name: string, mul: number) {
    return this.request("SetInputVolume", { inputName: name, inputVolumeMul: mul });
  }

  setMute(name: string, muted: boolean) {
    return this.request("SetInputMute", { inputName: name, inputMuted: muted });
  }
}

export const obsClient = new ObsClient();
