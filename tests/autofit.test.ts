import { describe, expect, it } from "vitest";
import {
  clampReferenceRect,
  computeReferenceTopPx,
  largestFittingFont,
  REF_TOKEN_RE,
  TEXT_TOKEN_RE,
} from "../src/lib/useAutoFit";

describe("largestFittingFont", () => {
  it("returns max when the largest font already fits", () => {
    expect(largestFittingFont(0.5, 12, () => true)).toBe(12);
  });

  it("returns min when no font fits", () => {
    expect(largestFittingFont(0.5, 12, () => false)).toBe(0.5);
  });

  it("returns min when min === max", () => {
    expect(largestFittingFont(7, 7, () => false)).toBe(7);
  });

  it("returns min when max < min", () => {
    expect(largestFittingFont(8, 4, () => true)).toBe(8);
  });

  it("binary-searches up to a monotonic threshold", () => {
    const fit = (font: number) => font <= 12.3;
    const result = largestFittingFont(0.5, 40, fit, 24);
    expect(result).toBeGreaterThan(12.29);
    expect(result).toBeLessThanOrEqual(12.3);
  });

  it("shrinks for long text with a width+height constraint", () => {
    // Simulates a measure: fits while font keeps scrollHeight <= 400.
    const scrollHeightAt = (font: number) => Math.round(400 * (font / 10)) + 200;
    const fits = (font: number) =>
      scrollHeightAt(font) <= 400 && font <= 40;
    const result = largestFittingFont(0.5, 40, fits, 24);
    expect(fits(result)).toBe(true);
    expect(result).toBeGreaterThan(4.9);
    // Boundary: round(40*font) + 200 <= 400 => font < 5.0125
    expect(result).toBeLessThan(5.013);
  });
});

describe("computeReferenceTopPx", () => {
  it("moves an overlapping reference below the text content with margin", () => {
    const top = computeReferenceTopPx({
      canvasHeightPx: 1000,
      refTopPx: 200,
      refHeightPct: 8,
      textTopPx: 150,
      textBottomPx: 250,
      marginPct: 2,
    });
    expect(top).toBe(270);
  });

  it("keeps a reference authored above the text block untouched", () => {
    // Built-in bible template: reference at top, verse text below.
    const top = computeReferenceTopPx({
      canvasHeightPx: 1000,
      refTopPx: 60,
      refHeightPct: 8,
      textTopPx: 220,
      textBottomPx: 480,
      marginPct: 2,
    });
    expect(top).toBe(60);
  });

  it("keeps an authored position when it does not overlap", () => {
    const top = computeReferenceTopPx({
      canvasHeightPx: 1000,
      refTopPx: 480,
      refHeightPct: 8,
      textTopPx: 150,
      textBottomPx: 250,
      marginPct: 2,
    });
    expect(top).toBe(480);
  });

  it("clamps the reference inside the canvas bottom", () => {
    const top = computeReferenceTopPx({
      canvasHeightPx: 1000,
      refTopPx: 700,
      refHeightPct: 10,
      textTopPx: 600,
      textBottomPx: 990,
      marginPct: 2,
    });
    expect(top).toBe(900);
  });

  it("clamps at the canvas top when asked to go above it", () => {
    const top = computeReferenceTopPx({
      canvasHeightPx: 1000,
      refTopPx: -50,
      refHeightPct: 8,
      textTopPx: -30,
      textBottomPx: -10,
      marginPct: 1,
    });
    expect(top).toBe(0);
  });

  it("scales the margin with canvas height", () => {
    const top = computeReferenceTopPx({
      canvasHeightPx: 540,
      refTopPx: 100,
      refHeightPct: 8,
      textTopPx: 50,
      textBottomPx: 120,
      marginPct: 2,
    });
    // margin = 2% of 540 = 10.8 => target = 130.8
    expect(top).toBeCloseTo(130.8);
  });
});

describe("clampReferenceRect", () => {
  it("keeps an in-bounds box unchanged", () => {
    expect(clampReferenceRect({ x: 10, y: 20, w: 30, h: 8 })).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 8,
    });
  });

  it("pushes negative coordinates to zero", () => {
    expect(clampReferenceRect({ x: -10, y: -5, w: 20, h: 8 })).toEqual({
      x: 0,
      y: 0,
      w: 20,
      h: 8,
    });
  });

  it("shrinks a box wider than the canvas", () => {
    const r = clampReferenceRect({ x: 0, y: 10, w: 180, h: 8 });
    expect(r.x).toBe(0);
    expect(r.w).toBe(100);
  });

  it("slides a box rightward when it overflows the right edge", () => {
    expect(clampReferenceRect({ x: 85, y: 10, w: 30, h: 8 })).toEqual({
      x: 70,
      y: 10,
      w: 30,
      h: 8,
    });
  });

  it("caps the height to the canvas", () => {
    const r = clampReferenceRect({ x: 20, y: 95, w: 30, h: 40 });
    expect(r.y).toBe(60);
    expect(r.h).toBe(40);
  });
});

describe("token regexes", () => {
  it("detects scripture reference placeholders", () => {
    expect(REF_TOKEN_RE.test("{scripture_reference}")).toBe(true);
    expect(REF_TOKEN_RE.test("Ma-thi-ơ {reference}")).toBe(true);
    expect(REF_TOKEN_RE.test("{label}")).toBe(true);
    expect(REF_TOKEN_RE.test("{scripture_text}")).toBe(false);
  });

  it("detects scripture text placeholders", () => {
    expect(TEXT_TOKEN_RE.test("{scripture_text}")).toBe(true);
    expect(TEXT_TOKEN_RE.test("Verse {text}")).toBe(true);
    expect(TEXT_TOKEN_RE.test("{scripture}")).toBe(true);
    expect(TEXT_TOKEN_RE.test("{scripture_reference}")).toBe(false);
  });
});