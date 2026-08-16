import { useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { WebGpuVideoRenderer } from "../lib/webgpuVideo";

const HEADER = 25;

const RVFC_SUPPORTED =
  typeof HTMLVideoElement !== "undefined" &&
  "requestVideoFrameCallback" in HTMLVideoElement.prototype;

interface NativeVideoProps {
  path?: string;
  mode: "full" | "bg";
  playing?: boolean;
  className?: string;
  /** Toggle green-screen keying (key color green, tolerance 40). */
  chroma?: boolean;
  /** Which window drives the shared decode resolution. */
  kind?: "output" | "preview";
}

function fitRect(
  cw: number,
  ch: number,
  sw: number,
  sh: number,
  cover: boolean,
): { dx: number; dy: number; dw: number; dh: number } {
  const scale = cover
    ? Math.max(cw / sw, ch / sh)
    : Math.min(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Scratch canvas for intermediate decode/alpha composition (reused, never
// shown directly).
let scratch: HTMLCanvasElement | null = null;
let keyBuf: HTMLCanvasElement | null = null;

async function drawFrame(
  canvas: HTMLCanvasElement,
  off: HTMLCanvasElement,
  buf: ArrayBuffer,
  meta: {
    seq: number;
    width: number;
    height: number;
    format: "jpeg" | "rgba" | "keyed" | "nv12";
  },
  cover: boolean,
  decodeAtDraw: boolean,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Double-buffer: compose the frame into the offscreen canvas (clearing it
  // there is invisible), then blit the finished frame to the visible canvas
  // in a single synchronous drawImage. Without this the canvas sat cleared
  // while the async JPEG decode ran, flashing black every frame.
  if (off.width !== pw || off.height !== ph) {
    off.width = pw;
    off.height = ph;
  }
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const fit = fitRect(cssW, cssH, meta.width, meta.height, cover);
  let source: HTMLCanvasElement | HTMLImageElement | ImageBitmap;
  let resize: { resizeWidth?: number; resizeHeight?: number } | null = null;

  if (meta.format === "rgba") {
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== meta.width || scratch.height !== meta.height) {
      scratch.width = meta.width;
      scratch.height = meta.height;
    }
    const sctx = scratch.getContext("2d");
    if (sctx) {
      sctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(buf, 0, meta.width * meta.height * 4),
          meta.width,
          meta.height,
        ),
        0,
        0,
      );
    }
    source = scratch;
  } else if (meta.format === "keyed") {
    // Color JPEG + separate alpha (JPEG). Alpha arrives in the same buffer
    // right after the color image; draw both then composite via
    // "destination-in".
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== meta.width || scratch.height !== meta.height) {
      scratch.width = meta.width;
      scratch.height = meta.height;
    }
    if (!keyBuf) keyBuf = document.createElement("canvas");
    if (keyBuf.width !== meta.width || keyBuf.height !== meta.height) {
      keyBuf.width = meta.width;
      keyBuf.height = meta.height;
    }

    const colorBlob = new Blob([buf.slice(0, meta.width * meta.height * 4)]);
    const alphaBlob = new Blob([buf.slice(meta.width * meta.height * 4)]);

    const color = await createImageBitmap(colorBlob, {
      resizeWidth: fit.dw,
      resizeHeight: fit.dh,
      resizeQuality: "medium",
    });
    const alpha = await createImageBitmap(alphaBlob, {
      resizeWidth: fit.dw,
      resizeHeight: fit.dh,
      resizeQuality: "medium",
    });

    const sctx = scratch.getContext("2d");
    if (!sctx) return;
    octx.clearRect(0, 0, cssW, cssH);
    const dpr2 = window.devicePixelRatio || 1;
    if (scratch.width !== fit.dw || scratch.height !== fit.dh) {
      scratch.width = fit.dw;
      scratch.height = fit.dh;
    }
    if (keyBuf.width !== fit.dw || keyBuf.height !== fit.dh) {
      keyBuf.width = fit.dw;
      keyBuf.height = fit.dh;
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(color, 0, 0);
    const kctx = keyBuf.getContext("2d");
    if (!kctx) return;
    kctx.setTransform(1, 0, 0, 1, 0, 0);
    kctx.clearRect(0, 0, fit.dw, fit.dh);
    kctx.drawImage(alpha, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(keyBuf, 0, 0);
    sctx.globalCompositeOperation = "source-over";
    octx.drawImage(scratch, fit.dx, fit.dy, fit.dw, fit.dh);
    ctx.drawImage(off, 0, 0, cssW, cssH);
    color.close();
    alpha.close();
    return;
  } else {
    // JPEG: decode with createImageBitmap (faster than drawImage from a blob).
    source = await createImageBitmap(new Blob([buf]), {
      resizeWidth: fit.dw,
      resizeHeight: fit.dh,
      resizeQuality: "medium",
    });
  }

  octx.clearRect(0, 0, cssW, cssH);
  octx.drawImage(source, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.drawImage(off, 0, 0, cssW, cssH);
  if ("close" in source) source.close();
}

export function NativeVideo({
  path,
  mode,
  playing,
  className,
chroma,
  kind,
}: NativeVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const lastSeqRef = useRef(-1);
  const lastDrawAtRef = useRef(0);
  const gpuRef = useRef<WebGpuVideoRenderer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoHostRef = useRef<HTMLDivElement | null>(null);
  const hybridChromaToggleRef = useRef<((on: boolean) => void) | null>(null);
  const rustStartedRef = useRef(false);
  const pullCleanupRef = useRef<(() => void) | null>(null);
  const chromaRef = useRef(chroma);
  useEffect(() => {
    chromaRef.current = chroma;
  }, [chroma]);

  // Report WebGPU availability once per window so the WebGPU transport path
  // can be diagnosed in the field (fires once per mount, low noise).
  useEffect(() => {
    (async () => {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
      if (!gpu?.requestAdapter) {
        invoke("gpu_probe", { report: `ua=${navigator.userAgent} webgpu=no` }).catch(() => {});
        return;
      }
      try {
        const adapter = await (gpu.requestAdapter as () => Promise<unknown>)();
        // Test whether ANY canvas can obtain a WebGPU context in this engine.
        let tc = "?";
        try {
          const test = document.createElement("canvas");
          tc = test.getContext("webgpu") ? "ok" : "null";
        } catch (e) {
          tc = "throw " + String(e);
        }
        invoke("gpu_probe", { report: `ua=${navigator.userAgent} webgpu=yes adapter=${JSON.stringify(adapter).slice(0, 200)} testcanvas=${tc}` }).catch(() => {});
      } catch (e) {
        invoke("gpu_probe", { report: `ua=${navigator.userAgent} webgpu=error ${String(e)}` }).catch(() => {});
      }
    })();
  }, [path]);

  // WebCodecs availability probe (Track 3: true-resolution video via
  // VideoDecoder -> VideoFrame -> importExternalTexture).
  useEffect(() => {
    (async () => {
      const w = window as unknown as {
        VideoDecoder?: unknown;
        VideoFrame?: unknown;
        EncodedVideoChunk?: unknown;
      };
      const vd = !!w.VideoDecoder;
      const vf = !!w.VideoFrame;
      const evc = !!w.EncodedVideoChunk;
      const mc = (navigator as unknown as {
        mediaCapabilities?: {
          decodingInfo: (c: {
            type: string;
            video: { contentType: string; width: number; height: number; bitrate: number; framerate: number };
          }) => Promise<{ supported: boolean }>;
        };
      }).mediaCapabilities;
      const checks: { label: string; contentType: string; fps: number; bitrate: number }[] = [
        { label: "h264-4k60", contentType: 'video/mp4; codecs="avc1.640033"', fps: 60, bitrate: 45_000_000 },
        { label: "h264-4k120", contentType: 'video/mp4; codecs="avc1.640033"', fps: 120, bitrate: 80_000_000 },
        { label: "hevc-4k60", contentType: 'video/mp4; codecs="hev1.1.6.L153.B0"', fps: 60, bitrate: 35_000_000 },
        { label: "hevc-4k120", contentType: 'video/mp4; codecs="hev1.1.6.L153.B0"', fps: 120, bitrate: 60_000_000 },
        { label: "av1-4k60", contentType: 'video/mp4; codecs="av01.0.19M.08"', fps: 60, bitrate: 20_000_000 },
        { label: "av1-4k120", contentType: 'video/mp4; codecs="av01.0.19M.08"', fps: 120, bitrate: 40_000_000 },
      ];
      let caps = "";
      for (const c of checks) {
        try {
          const h = await mc?.decodingInfo({
            type: "file",
            video: { contentType: c.contentType, width: 3840, height: 2160, bitrate: c.bitrate, framerate: c.fps },
          });
          caps += ` ${c.label}=${h ? String(h.supported) : "na"}`;
        } catch (e) {
          caps += ` ${c.label}=err`;
        }
      }
      invoke("gpu_probe", {
        report: `webcodecs vd=${vd} vf=${vf} evc=${evc}${caps}`,
      }).catch(() => {});
    })();
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    lastSeqRef.current = -1;
    lastDrawAtRef.current = 0;
    if (!offRef.current) offRef.current = document.createElement("canvas");

    let cancelled = false;

    // Create the WebGPU renderer (shared by the hybrid <video> path and the
    // Rust NV12 pull path).
    const gpuReady = (async () => {
      let target = canvas;
      let gpu: WebGpuVideoRenderer | null = null;
      for (let attempt = 0; attempt < 3 && !gpu; attempt++) {
        if (attempt > 0) {
          const fresh = document.createElement("canvas");
          fresh.className = target.className;
          target.parentNode?.replaceChild(fresh, target);
          target = fresh;
          canvasRef.current = fresh;
        }
        gpu = await WebGpuVideoRenderer.create(target, (reason) => {
          invoke("gpu_probe", { report: `webgpu-fail ${kind}: ${reason}` }).catch(
            () => {},
          );
        });
      }
      if (cancelled) {
        gpu?.destroy();
        return;
      }
      gpuRef.current = gpu;
      if (gpu) {
        gpu.onUncapturedError = (msg) => {
          invoke("gpu_probe", {
            report: `gpu-error win=${kind}: ${msg}`,
          }).catch(() => {});
        };
      }
      invoke("gpu_probe", {
        report: gpu ? `webgpu-ok win=${kind}` : `webgpu-null win=${kind}`,
      }).catch(() => {});
    })();

    // Track 3 hybrid path: a hidden <video> streams the source file through
    // the asset/media protocol (browser hardware decode + A/V sync + seek),
    // and every rendered frame is pushed into WebGPU via
    // importExternalTexture — true source resolution (1080p/4K).
    const startHybrid = () => {
      const video = document.createElement("video");
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:" +
        (mode === "bg" ? "cover" : "contain") +
        ";opacity:0;pointer-events:none;";
      if (videoHostRef.current) videoHostRef.current.appendChild(video);
      videoRef.current = video;

      let srcAttempt = 0;
      let stopped = false;
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(metaTimer);
        try {
          video.pause();
        } catch {}
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        video.src = "";
        try {
          video.load();
        } catch {}
        video.remove();
        if (videoRef.current === video) videoRef.current = null;
      };
      (video as any)._cleanup = cleanup;

      const onError = () => {
        if (cancelled || stopped) return;
        if (srcAttempt === 0) {
          // First URL failed (asset protocol); try the media:// fallback.
          srcAttempt = 1;
          video.src = "media://localhost/" + encodeURIComponent(path);
          return;
        }
        // Both URLs failed -> fall back to the Rust NV12 path.
        invoke("gpu_probe", { report: `hybrid-src-fail win=${kind}` }).catch(
          () => {},
        );
        cleanup();
        startPull();
      };

      const onMeta = () => {
        if (cancelled || stopped) return;
        clearTimeout(metaTimer);
        invoke("gpu_probe", {
          report: `hybrid-on win=${kind} ${video.videoWidth}x${video.videoHeight}`,
        }).catch(() => {});
        let frameCount = 0;
        let chromaMode = false;
        const onRvfc = () => {
          if (cancelled || stopped || !chromaMode) return;
          video.requestVideoFrameCallback(onRvfc);
          let vf: any;
          try {
            vf = new (window as any).VideoFrame(video);
          } catch {
            // frame not available yet; retry on the next callback
            return;
          }
          try {
            gpuRef.current?.presentVideoFrame(vf, mode === "bg", true);
            frameCount++;
            if (frameCount <= 12) {
              invoke("gpu_probe", {
                report: `hybrid-frame win=${kind} n=${frameCount} ${video.videoWidth}x${video.videoHeight} t=${video.currentTime.toFixed(2)}`,
              }).catch(() => {});
            }
          } catch (e) {
            if (frameCount < 1) {
              invoke("gpu_probe", {
                report: `hybrid-frame-err win=${kind} ${String(e).slice(0, 200)}`,
              }).catch(() => {});
            }
            // Frame not available yet; skip and wait for the next callback.
          } finally {
            vf.close();
          }
        };
        const setChroma = (on: boolean) => {
          chromaMode = on;
          video.style.opacity = on ? "0" : "1";
          const cv = canvasRef.current;
          if (cv) cv.style.display = on ? "block" : "none";
          if (on) video.requestVideoFrameCallback(onRvfc);
        };
        hybridChromaToggleRef.current = setChroma;
        setChroma(!!chromaRef.current);
        if (playing !== false) {
          video.play().then(
            () => {
              invoke("gpu_probe", {
                report: `hybrid-play win=${kind} ok paused=${video.paused} state=${video.readyState}`,
              }).catch(() => {});
            },
            (e: any) => {
              invoke("gpu_probe", {
                report: `hybrid-play-err win=${kind} ${String(e?.name || e)}`,
              }).catch(() => {});
            },
          );
        }
      };

      const onError2 = onError;
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError2);
      const metaTimer = setTimeout(() => {
        if (!videoRef.current || video.readyState < 1) {
          invoke("gpu_probe", { report: `hybrid-meta-timeout win=${kind}` }).catch(
            () => {},
          );
          cleanup();
          startPull();
        }
      }, 6000);
      video.src = convertFileSrc(path);
    };

    // Track 2 fallback: Rust decode -> NV12/RGBA frames over frames://.
    const startPull = () => {
      rustStartedRef.current = true;

      const wantsRaw = !!(navigator as any).gpu?.requestAdapter;
      invoke("native_video_play", { path, hwAccel: true })
        .then(() => invoke("native_video_set_transport", { raw: wantsRaw }))
        .catch(() => {});
      if (!gpuRef.current) {
        invoke("native_video_set_transport", { raw: false }).catch(() => {});
      }

      const pushTarget = () => {
        if (cancelled) return;
        const el = canvasRef.current;
        if (!el) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(16, Math.round(el.clientWidth * dpr));
        const h = Math.max(16, Math.round(el.clientHeight * dpr));
        invoke("native_video_set_target", { kind, width: w, height: h }).catch(
          () => {},
        );
      };
      pushTarget();
      const ro = new ResizeObserver(() => pushTarget());
      ro.observe(canvasRef.current ?? canvas);
      window.addEventListener("resize", pushTarget);
      pullCleanupRef.current = () => {
        ro.disconnect();
        window.removeEventListener("resize", pushTarget);
      };

      const loop = async () => {
        while (!cancelled) {
          let buf: ArrayBuffer | null = null;
          try {
            const resp = await fetch("frames://localhost/latest", {
              cache: "no-store",
            });
            buf = await resp.arrayBuffer();
          } catch {
            try {
              buf = await invoke<ArrayBuffer>("native_video_pull");
            } catch {
              // not ready yet; retry
            }
          }
          if (buf && buf.byteLength > HEADER) {
            const view = new DataView(buf);
            const seq = view.getBigUint64(0, true);
            if (Number(seq) !== lastSeqRef.current) {
              const width = view.getInt32(8, true);
              const height = view.getInt32(12, true);
              const format =
                view.getUint8(16) === 4
                  ? "nv12"
                  : view.getUint8(16) === 3
                    ? "keyed"
                    : view.getUint8(16) === 2
                      ? "rgba"
                      : "jpeg";
              const fps = view.getFloat64(17, true);
              if (canvasRef.current && offRef.current) {
                const frameMs =
                  fps > 0 ? Math.min(200, Math.max(8, 1000 / fps)) : 33;
                const since =
                  lastDrawAtRef.current === 0
                    ? frameMs
                    : performance.now() - lastDrawAtRef.current;
                if (since < frameMs) {
                  await sleep(frameMs - since);
                  if (cancelled) break;
                }
                lastSeqRef.current = Number(seq);
                if (
                  gpuRef.current &&
                  (format === "rgba" || format === "nv12")
                ) {
                  gpuRef.current.present(
                    buf,
                    HEADER,
                    width,
                    height,
                    mode === "bg",
                    !!chromaRef.current,
                    format,
                  );
                } else if (gpuRef.current) {
                  await sleep(4);
                  if (cancelled) break;
                  continue;
                } else {
                  const bytes = buf.slice(HEADER);
                  await drawFrame(
                    canvasRef.current,
                    offRef.current,
                    bytes,
                    { seq: Number(seq), width, height, format },
                    mode === "bg",
                    true,
                  );
                }
                lastDrawAtRef.current = performance.now();
              }
            } else {
              await sleep(4);
            }
          } else {
            await sleep(4);
          }
        }
      };
      loop();
    };

    gpuReady.then(() => {
      if (cancelled) return;
      const useHybrid = gpuRef.current && RVFC_SUPPORTED;
      invoke("gpu_probe", {
        report: `path-choice win=${kind} rvfc=${RVFC_SUPPORTED} gpu=${!!gpuRef.current} -> ${useHybrid ? "hybrid" : "pull"}`,
      }).catch(() => {});
      if (useHybrid) {
        startHybrid();
      } else {
        startPull();
      }
    });

    return () => {
      cancelled = true;
      if (videoRef.current) {
        (videoRef.current as any)._cleanup?.();
      }
      pullCleanupRef.current?.();
      pullCleanupRef.current = null;
      hybridChromaToggleRef.current = null;
      gpuRef.current?.destroy();
      gpuRef.current = null;
      if (rustStartedRef.current) {
        invoke("native_video_set_transport", { raw: false }).catch(() => {});
        invoke("native_video_stop", { path }).catch(() => {});
      }
    };
  }, [path, mode]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      if (playing === false) v.pause();
      else v.play().catch(() => {});
    }
    if (path && !videoRef.current) {
      invoke("native_video_set_paused", { paused: playing === false }).catch(
        () => {},
      );
    }
  }, [path, playing]);

  useEffect(() => {
    if (!path || chroma === undefined) return;
    if (videoRef.current) {
      // Hybrid <video> path: toggle native display vs. WebGPU keyed output.
      hybridChromaToggleRef.current?.(chroma);
    } else {
      invoke("native_video_set_chroma", {
        enabled: chroma,
        r: 0,
        g: 255,
        b: 0,
        tolerance: 40,
      }).catch(() => {});
    }
  }, [path, chroma]);

  const canvas = (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div
        ref={videoHostRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
      {canvas}
    </div>
  );
}

export default NativeVideo;
