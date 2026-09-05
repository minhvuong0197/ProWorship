import { describe, expect, it } from "vitest";
import {
  applyVirtualBreaks,
  defaultLive,
  resolveArrangementOrder,
  resolveDynamicValue,
  songSlideLive,
} from "../src/lib/live";
import type { Song } from "../src/lib/types";

const song: Song = {
  id: "s1",
  title: "Way Maker",
  artist: "",
  key: "",
  ccli: "",
  copyright: "",
  slides: [
    { id: "v1", label: "V1", text: "Verse one" },
    { id: "c1", label: "C", text: "Chorus", background: "bg.jpg" },
    { id: "v2", label: "V2", text: "Verse two" },
    { id: "t1", label: "T", text: "Tag" },
  ],
  arrangements: [{ id: "a1", name: "Live", order: ["c1", "v1", "v2"] }],
  template_id: null,
  created_at: 0,
  updated_at: 0,
};

function base() {
  return defaultLive(null);
}

describe("songSlideLive next_text / next_label", () => {
  it("previews the following slide when going live", () => {
    const live = songSlideLive(song, 1, "Way Maker", base(), null, []);
    expect(live.next_text).toBe("Verse two");
    expect(live.next_label).toBe("V2");
  });

  it("shows null preview on the last slide", () => {
    const live = songSlideLive(song, 3, "Way Maker", base(), null, []);
    expect(live.next_text).toBeNull();
    expect(live.next_label).toBeNull();
  });

  it("follows the arrangement order, not the raw slide order", () => {
    const live = songSlideLive(song, 0, "Way Maker", base(), null, [], "a1");
    expect(live.current?.label).toBe("C");
    expect(live.next_text).toBe("Verse one");
    expect(live.next_label).toBe("V1");
  });

  it("records the current slide index/count for navigation", () => {
    const live = songSlideLive(song, 2, "Way Maker", base(), null, [], "a1");
    expect(live.song_slide_index).toBe(2);
    expect(live.song_slide_count).toBe(3);
  });
});

describe("resolveArrangementOrder", () => {
  it("uses arrangement order when the arrangement exists", () => {
    expect(resolveArrangementOrder(song, "a1")).toEqual(["c1", "v1", "v2"]);
  });

  it("falls back to slide order for unknown arrangement", () => {
    expect(resolveArrangementOrder(song, "missing")).toEqual([
      "v1",
      "c1",
      "v2",
      "t1",
    ]);
  });

  it("falls back to slide order without arrangement", () => {
    expect(resolveArrangementOrder(song, null)).toEqual([
      "v1",
      "c1",
      "v2",
      "t1",
    ]);
  });

  it("returns an empty array for no song", () => {
    expect(resolveArrangementOrder(null, null)).toEqual([]);
  });
});

describe("applyVirtualBreaks", () => {
  it("turns [_VB] into a newline by default", () => {
    expect(applyVirtualBreaks("a[_VB]b", false)).toBe("a\nb");
  });

  it("strips [_VB] when skip is enabled", () => {
    expect(applyVirtualBreaks("a[_VB]b", true)).toBe("ab");
  });

  it("returns empty string for undefined text", () => {
    expect(applyVirtualBreaks(undefined, false)).toBe("");
  });
});

describe("resolveDynamicValue tokens", () => {
  const slide = {
    title: "Way Maker",
    label: "V1",
    text: "Verse one",
    bible_ref: "gen|1|1|4|Sáng-thế Ký|VPS 1925",
  };

  it("resolves brace tokens from the live slide", () => {
    expect(resolveDynamicValue("{title} — {label}", slide)).toBe(
      "Way Maker — V1",
    );
    expect(resolveDynamicValue("{text}", slide)).toBe("Verse one");
  });

  it("resolves compatible %TOKEN% keys", () => {
    expect(resolveDynamicValue("%TITLE% / %SLIDE_LABEL%", slide)).toBe(
      "Way Maker / V1",
    );
    expect(resolveDynamicValue("%TEXT%", slide)).toBe("Verse one");
  });

  it("resolves compatible Bible tokens from bible_ref", () => {
    expect(resolveDynamicValue("%BIBLENAME% %BIBLECHAPTER%:%BIBLEVERSES%", slide)).toBe(
      "VPS 1925 1:1-4",
    );
    expect(resolveDynamicValue("%SCRIPTUREREF%", slide)).toBe("V1");
  });

  it("resolves date/time tokens and hour/minute/second in both syntaxes", () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(resolveDynamicValue("{hour}:{minute}:{second}", slide)).toBe(
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    );
    expect(resolveDynamicValue("%HOUR%:%MINUTE%:%SECOND%", slide)).toBe(
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    );
  });

  it("leaves unknown tokens untouched", () => {
    expect(resolveDynamicValue("%NOT_A_TOKEN% {nope}", slide)).toBe(
      "%NOT_A_TOKEN% {nope}",
    );
  });

  it("returns content unchanged when there is no token", () => {
    expect(resolveDynamicValue("plain text", slide)).toBe("plain text");
  });
});