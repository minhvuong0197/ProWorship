import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const HEADER = 25;

interface LiveVideoProps {
  /** NDI source name to receive (passed through to `ndi_input_start`). */
  source?: string;
  mode: "full" | "bg";
  className?: string;
}

function fitRect(
  cw: number,
  ch: number,
  sw: number,
  sh: number,
  cover: boolean,
): { dx: number; dy: number; dw: number; dh: number } {
  const scale = cover ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Live video input (NDI receive). Pulls the latest captured frame over the
 * `live://` scheme with the same packed header as the player `frames://`
 * transport, then decodes the JPEG onto a canvas.
 */
export function LiveVideo({ source, mode, className }: LiveVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const lastSeqRef = useRef(-1);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!source) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    lastSeqRef.current = -1;
    if (!offRef.current) offRef.current = document.createElement("canvas");
    let cancelled = false;

    const start = () => {
      if (!startedRef.current) {
        startedRef.current = true;
        invoke("ndi_input_start", { name: source }).catch(() => {});
      }
    };

    const loop = async () => {
      while (!cancelled) {
        let buf: ArrayBuffer | null = null;
        try {
          const resp = await fetch("live://localhost/latest", {
            cache: "no-store",
          });
          buf = await resp.arrayBuffer();
        } catch {
          try {
            buf = await invoke<ArrayBuffer | null>("ndi_input_pull");
          } catch {
            // not ready yet; retry
          }
        }
        if (buf && buf.byteLength > HEADER) {
          const view = new DataView(buf);
          const seq = Number(view.getBigUint64(0, true));
          if (seq !== lastSeqRef.current) {
            const width = view.getInt32(8, true);
            const height = view.getInt32(12, true);
            const fps = view.getFloat64(17, true);
            if (canvasRef.current && offRef.current) {
              const bytes = buf.slice(HEADER);
              await drawFrame(
                canvasRef.current,
                offRef.current,
                bytes,
                { seq, width, height },
                mode === "bg",
              );
              lastSeqRef.current = seq;
            }
            void fps;
          } else {
            await sleep(16);
          }
        } else {
          await sleep(16);
        }
      }
    };

    start();
    loop();
    return () => {
      cancelled = true;
    };
  }, [source, mode]);

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
}

async function drawFrame(
  canvas: HTMLCanvasElement,
  off: HTMLCanvasElement,
  buf: ArrayBuffer,
  meta: { seq: number; width: number; height: number },
  cover: boolean,
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
  if (off.width !== pw || off.height !== ph) {
    off.width = pw;
    off.height = ph;
  }
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const fit = fitRect(cssW, cssH, meta.width, meta.height, cover);
  const source = await createImageBitmap(new Blob([buf]), {
    resizeWidth: fit.dw,
    resizeHeight: fit.dh,
    resizeQuality: "medium",
  });
  octx.clearRect(0, 0, cssW, cssH);
  octx.drawImage(source, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.drawImage(off, 0, 0, cssW, cssH);
  source.close();
}

export default LiveVideo;