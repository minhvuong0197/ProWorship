import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(here, "..", "src", "components", "NativeVideo.tsx"),
  "utf8",
);

describe("NativeVideo hybrid regression guards (video stutter 2026-08)", () => {
  it("does not importExternalTexture directly from the <video> element (stalls playback)", () => {
    // The stall pattern: presentVideoFrame(video, ...) called with the raw
    // element from a rAF loop -> video.currentTime freezes at ~0.
    expect(src).not.toMatch(/presentVideoFrame\(\s*video\s*[,)]/);
  });

  it("keeps the direct <video> display path for non-chroma", () => {
    expect(src).toContain("videoHostRef");
    expect(src).toContain("video.style.opacity");
    expect(src).toContain("videoHostRef.current.appendChild(video)");
  });

  it("only runs the WebGPU present loop when chroma is enabled", () => {
    expect(src).toMatch(/presentVideoFrame\(vf, mode === "bg", true\)/);
    expect(src).toContain("chromaMode");
  });
});