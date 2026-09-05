import { useLayoutEffect, useRef, useState } from "react";
import type { TemplateElement } from "./types";

export type FitUnit = "vh" | "cqh";

export interface AutoFitOptions {
  unit: FitUnit;
  /** Hard floor for the font size (in `unit`) even when text cannot fit. */
  minFont: number;
  /** The authored/base font size (in `unit`). */
  capFont: number;
  mode?: "shrink" | "grow" | "none";
  /** Extra px subtracted from the available box while measuring. */
  padding?: number;
  /** Optional relative ceiling (in `unit`), matching the `clamp(…, fs, maxUnit*unit)` output style. */
  maxUnit?: number;
  /** px floor applied while measuring, matching the `clamp(minPx, …)` output. */
  minPx?: number;
}

export interface AutoFitReturns {
  ref: { readonly current: HTMLDivElement | null };
  /** Font size in the configured unit after fitting. */
  fontSize: number;
  /** Rendered content height / box height (0..~1). */
  fillRatio: number;
}

export const REF_TOKEN_RE = /\{(label|reference|scripture_reference)\}|%(SLIDE_LABEL|SCRIPTUREREF)%/;
export const TEXT_TOKEN_RE = /\{(text|scripture|scripture_text)\}|%(TEXT|SCRIPTURETEXT)%/;

/**
 * Largest font in [min, max] for which `measure(font)` is still true.
 * `measure` must be monotonic: true for smaller fonts, false for larger ones.
 */
export function largestFittingFont(
  min: number,
  max: number,
  measure: (font: number) => boolean,
  maxIter = 16,
): number {
  if (max <= min) return min;
  if (measure(max)) return max;
  let lo = min;
  let hi = max;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Fits text inside its (positioned) element box by binary-searching the font
 * size. The measure block must be a plain block (not flex-centered) so that
 * `scrollHeight`/`scrollWidth` always report true content size. Re-fits on
 * text changes and whenever the box or measure block resizes.
 *
 * Data flow (per spec — autofit must stay a pure display concern):
 *   baseFontSize    = user-authored value (el.font_size / input "CỠ CHỮ (VH)"),
 *                     SOURCE OF TRUTH — never written to by this hook.
 *                     Passed in as `opts.capFont` (the search ceiling).
 *   computedFontSize = value computed here, held in INTERNAL useState only,
 *                     applied solely to the rendered element's inline
 *                     `fontSize` (style). It is NEVER written back to
 *                     baseFontSize, `el`, the store, or the content/preview
 *                     state.
 * No reverse data flow exists: this hook only reads (ref + `text`).
 */
export function useAutoFitText(text: string, opts: AutoFitOptions): AutoFitReturns {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(opts.capFont);
  const [fillRatio, setFillRatio] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host = el.parentElement;
    if (!host) return;

    const mode = opts.mode ?? "shrink";
    const padding = opts.padding ?? 0;
    const maxUnit = opts.maxUnit ?? 60;
    const minPx = opts.minPx ?? 8;

    let raf = 0;
    const fit = () => {
      const node = ref.current;
      const hostNode = node?.parentElement;
      if (!node || !hostNode) return;
      // Never measure placeholder/empty content: nothing to fit yet.
      if (!text.trim()) {
        setFontSize(opts.capFont);
        setFillRatio(0);
        return;
      }
      const availW = hostNode.clientWidth - padding;
      const availH = hostNode.clientHeight - padding;
      if (availW <= 0 || availH <= 0) return;

      const applyFont = (font: number) => {
        node.style.fontSize = `clamp(${minPx}px, ${font}${opts.unit}, ${maxUnit}${opts.unit})`;
      };
      const fits = (font: number) => {
        applyFont(font);
        return node.scrollWidth <= availW && node.scrollHeight <= availH;
      };

      let best: number;
      let hi: number;
      if (mode === "none") {
        best = opts.capFont;
        hi = Math.max(opts.minFont, opts.capFont);
      } else if (mode === "grow") {
        // "Phóng lớn": scale the text so it fills its box. Grow far beyond the
        // authored size (up to the display ceiling maxUnit) whenever the content
        // is smaller than the box; oversized content still shrinks to fit.
        hi = Math.max(opts.minFont, opts.capFont, opts.maxUnit ?? 60);
        best = largestFittingFont(opts.minFont, hi, fits);
      } else {
        // Keep authored font size as the upper bound while fitting the slide.
        // whenever it fits; only shrink when the text overflows the box.
        hi = Math.max(opts.minFont, opts.capFont);
        best = largestFittingFont(opts.minFont, hi, fits);
      }
      applyFont(best);
      setFontSize(best);
      setFillRatio(hostNode.clientHeight > 0 ? node.scrollHeight / hostNode.clientHeight : 0);
    };

    fit();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    ro.observe(host);
    ro.observe(el);
    window.addEventListener("resize", fit);
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!ref.current) return;
        fit();
      });
    }
    const timeout = window.setTimeout(fit, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [text, opts.unit, opts.minFont, opts.capFont, opts.mode, opts.padding, opts.maxUnit, opts.minPx]);

  return { ref, fontSize, fillRatio };
}

/**
 * Clamps an element box to stay fully inside the 0..100 (percent) canvas.
 * Used for reference labels so a repositioned element never leaves the frame.
 */
export function clampReferenceRect(el: {
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number; w: number; h: number } {
  const w = Math.min(Math.max(el.w, 2), 100);
  const x = Math.min(Math.max(el.x, 0), 100 - w);
  const h = Math.min(Math.max(el.h, 1), 100);
  const y = Math.min(Math.max(el.y, 0), 100 - h);
  return { x, y, w, h };
}

export interface RefTopInput {
  canvasHeightPx: number;
  /** Current top of the reference box (px, relative to canvas top). */
  refTopPx: number;
  /** Height of the reference box as a percent of the canvas. */
  refHeightPct: number;
  /** Top of the measured `{scripture_text}` content (px, canvas relative). */
  textTopPx: number;
  /** Bottom of the measured `{scripture_text}` content (px, canvas relative). */
  textBottomPx: number;
  /** Gap between the text content and the reference, as a percent of canvas height. */
  marginPct: number;
}

/**
 * Top position (px) for a `scripture_reference` label. Only when the reference
 * box actually intersects the rendered scripture text box (e.g. a custom
 * template where both overlap) it is moved below the text content + margin.
 * A reference authored above or below the text block is left untouched.
 * Always clamped on-canvas.
 */
export function computeReferenceTopPx(i: RefTopInput): number {
  const marginPx = (i.marginPct / 100) * i.canvasHeightPx;
  const refH = (Math.min(Math.max(i.refHeightPct, 0), 100) / 100) * i.canvasHeightPx;
  const maxTop = Math.max(i.canvasHeightPx - refH, 0);
  const refBottom = i.refTopPx + refH;
  const overlaps = i.refTopPx < i.textBottomPx && refBottom > i.textTopPx;
  const target = i.textBottomPx + marginPx;
  const next = overlaps ? target : i.refTopPx;
  return Math.min(Math.max(next, 0), maxTop);
}

export interface AutoRepositionOptions {
  marginPct?: number;
  /** Extra values that should trigger a re-measure (e.g. slide text/label). */
  track?: unknown;
}

/**
 * For a `{scripture_reference}` text element, repositions it below the rendered
 * `{scripture_text}` sibling (measured via the DOM after autofit) so they no
 * longer overlap. Returns a px `top` override for the element wrapper, or null
 * when no repositioning applies.
 */
export function useAutoRepositionRef(
  hostRef: { readonly current: HTMLDivElement | null },
  el: TemplateElement | null | undefined,
  elements: TemplateElement[] | undefined,
  opts: AutoRepositionOptions = {},
): number | null {
  const [top, setTop] = useState<number | null>(null);
  const marginPct = opts.marginPct ?? 2;
  const elementsKey = (elements ?? []).map((e) => e.id).join(",");

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !el || el.kind !== "text" || el.visible === false) {
      setTop(null);
      return;
    }
    if (!REF_TOKEN_RE.test(el.content ?? "")) {
      setTop(null);
      return;
    }
    const textEl = (elements ?? []).find(
      (e) => e.kind === "text" && e.visible && TEXT_TOKEN_RE.test(e.content ?? ""),
    );
    const canvas = host.parentElement;
    if (!textEl || !canvas) {
      setTop(null);
      return;
    }
    const textNode = canvas.querySelector(
      `[data-el-id="${String(textEl.id).replace(/"/g, '\\"')}"]`,
    ) as HTMLElement | null;
    if (!textNode) {
      setTop(null);
      return;
    }

    let raf = 0;
    const compute = () => {
      const hostRect = host.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const textRect = textNode.getBoundingClientRect();
      const next = computeReferenceTopPx({
        canvasHeightPx: canvas.clientHeight,
        refTopPx: hostRect.top - canvasRect.top,
        refHeightPct: el.h,
        textTopPx: textRect.top - canvasRect.top,
        textBottomPx: textRect.bottom - canvasRect.top,
        marginPct,
      });
      setTop((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
    };
    compute();

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });
    ro.observe(textNode);
    const measureNode = textNode.querySelector("[data-autofit]");
    if (measureNode) ro.observe(measureNode);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id, el?.content, el?.h, el?.visible, elementsKey, marginPct, opts.track]);

  return top;
}