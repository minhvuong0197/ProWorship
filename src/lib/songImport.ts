import { readDir, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import type { Song, SongSlide } from "./types";
import { uid } from "./types";

export type ImportFormat =
  | "propresenter"
  | "freeshow"
  | "openlp"
  | "opensong"
  | "easyslides"
  | "easyworship"
  | "chordpro"
  | "worshipcast"
  | "text";

const SECTION_RE =
  /^(?:\[)?\s*(?:\d+\.?\s*)?((?:verse|chorus|bridge|pre[- ]?chorus|intro|tag|outro|ending|inst(?:rumental)?|interlude|refrain|coda|hook|finale|repeat|đk|điệp khúc|phiên khúc|đoạn|câu)\s*\d*)\s*(?:\])?\s*[:.\-]?\s*$/i;

function cleanLabel(s: string): string {
  return s
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^\d+\.?\s*/, "")
    .replace(/[:.\-]+$/, "")
    .trim();
}

export function parseQuickPaste(raw: string): { label: string; text: string }[] {
  const lines = raw.split(/\r?\n/);
  const out: { label: string; text: string[] }[] = [];
  let sawHeader = false;

  for (const line of lines) {
    if (SECTION_RE.test(line.trim())) {
      sawHeader = true;
      if (out.length && out[out.length - 1].text.length === 0) {
        out.pop();
      }
      out.push({ label: cleanLabel(line.trim()), text: [] });
      continue;
    }
    if (out.length === 0) out.push({ label: "", text: [] });
    out[out.length - 1].text.push(line);
  }

  const clean = out
    .map((s) => {
      let text = s.text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      return { label: s.label, text };
    })
    .filter((s) => s.text.length > 0);

  if (clean.length === 0) return [];

  if (!sawHeader) {
    return clean
      .map((s) => s.text)
      .join("\n\n")
      .split(/\n{2,}/)
      .map((block, i) => ({ label: `Verse ${i + 1}`, text: block.trim() }))
      .filter((s) => s.text.length > 0);
  }

  let verseCounter = 0;
  let chorusCounter = 0;
  return clean.map((s) => {
    let label = s.label;
    if (!label) {
      verseCounter += 1;
      label = `Verse ${verseCounter}`;
    } else if (/^verse/i.test(label) && !/\d$/.test(label)) {
      verseCounter += 1;
      label = `Verse ${verseCounter}`;
    } else if (/^chorus/i.test(label) && !/\d$/.test(label)) {
      chorusCounter += 1;
      label = `Chorus ${chorusCounter}`;
    }
    return { label, text: s.text };
  });
}

// ----- helpers -----

function makeSong(
  title: string,
  slides: SongSlide[],
  meta: { artist?: string; key?: string; ccli?: string; copyright?: string } = {},
): Song {
  const now = Date.now();
  return {
    id: uid(),
    title: title || "Bài hát mới",
    artist: meta.artist || "",
    key: meta.key || "",
    ccli: meta.ccli || "",
    copyright: meta.copyright || "",
    slides,
    arrangements: [],
    template_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function parseChordPro(content: string, fallbackTitle: string): Song {
  let title = fallbackTitle;
  let artist = "";
  let key = "";
  let ccli = "";
  const lyrics: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const directive = line.match(/^\s*\{\s*([a-zA-Z]+)\s*:\s*(.*?)\s*\}\s*$/);
    if (directive) {
      const tag = directive[1].toLowerCase();
      const value = directive[2].trim();
      if (tag === "title" || tag === "t") title = value || title;
      else if (tag === "artist" || tag === "a") artist = value || artist;
      else if (tag === "key" || tag === "k") key = value || key;
      else if (tag === "ccli") ccli = value || ccli;
      continue;
    }
    const stripped = line.replace(/\[[^\]]{0,20}\]/g, "").trimEnd();
    lyrics.push(stripped);
  }

  return textToSong(lyrics.join("\n"), { title, artist, key, ccli });
}

function textToSong(content: string, meta: { title?: string; artist?: string; key?: string; ccli?: string; copyright?: string } = {}): Song {
  const blocks = parseQuickPaste(content);
  const slides: SongSlide[] =
    blocks.length > 0
      ? blocks.map((b) => ({
          id: uid(),
          label: b.label,
          text: b.text,
          notes: "",
          template_id: null,
          layers: [],
        }))
      : content.trim()
        ? [
            {
              id: uid(),
              label: "Verse 1",
              text: content.trim(),
              notes: "",
              template_id: null,
              layers: [],
            },
          ]
        : [];
  return makeSong(meta.title || "Bài hát mới", slides, meta);
}

function toSong(raw: unknown, fallbackTitle: string): Song | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const title = String(obj.title ?? obj.song_title ?? fallbackTitle ?? "Bài hát mới");
  const rawSlides = Array.isArray(obj.slides)
    ? obj.slides
    : Array.isArray(obj.song_slides)
      ? obj.song_slides
      : [];

  const slides: SongSlide[] = (rawSlides as unknown[])
    .map((s): SongSlide | null => {
      if (typeof s === "string") {
        if (!s.trim()) return null;
        return { id: uid(), label: "Verse", text: s };
      }
      const so = s as Record<string, unknown>;
      const text = String(so.text ?? so.lyrics ?? so.content ?? "");
      if (!text.trim()) return null;
      return {
        id: String(so.id ?? uid()),
        label: String(so.label ?? so.title ?? "Verse"),
        text,
        notes: so.notes ? String(so.notes) : "",
        template_id: so.template_id ? String(so.template_id) : null,
        layers: Array.isArray(so.layers) ? (so.layers as SongSlide["layers"]) : [],
      };
    })
    .filter((s): s is SongSlide => s !== null && typeof s.text === "string");

  if (slides.length === 0 && typeof obj.content === "string" && obj.content.trim()) {
    slides.push({ id: uid(), label: "Verse 1", text: obj.content });
  }

  if (slides.length === 0) return null;

  const now = Date.now();
  return {
    id: String(obj.id ?? uid()),
    title,
    artist: String(obj.artist ?? ""),
    key: String(obj.key ?? ""),
    ccli: String(obj.ccli ?? ""),
    copyright: String(obj.copyright ?? ""),
    slides,
    arrangements: Array.isArray(obj.arrangements)
      ? (obj.arrangements as Song["arrangements"])
      : [],
    template_id: obj.template_id ? String(obj.template_id) : null,
    created_at: typeof obj.created_at === "number" ? obj.created_at : now,
    updated_at: now,
  };
}

function jsonSongs(content: string, fallbackTitle: string): Song[] {
  const data = JSON.parse(content);
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.songs)
      ? data.songs
      : Array.isArray(data.library)
        ? data.library
        : [data];

  const out: Song[] = [];
  for (const item of items as unknown[]) {
    const song = toSong(item, fallbackTitle);
    if (song) out.push(song);
  }
  return out;
}

// ----- XML helpers (DOMParser, available in the Tauri webview) -----

function parseXml(content: string): Document | null {
  try {
    return new DOMParser().parseFromString(content, "text/xml");
  } catch {
    return null;
  }
}

function textOf(el: Element | null, tag: string): string {
  return el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function elementToLyrics(el: Element): string {
  let out = "";
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 3) {
      out += node.nodeValue ?? "";
    } else if (node.nodeType === 1) {
      const e = node as Element;
      const tag = e.tagName.toLowerCase();
      if (tag === "br") out += "\n";
      else if (tag === "p") {
        const style = e.getAttribute("style") ?? "";
        if (/page-break/i.test(style)) out += "\n__BREAK__\n";
      } else if (tag === "div") out += "\n";
      else out += elementToLyrics(e);
    }
  }
  return out;
}

function openLyricsLabel(name: string): string {
  const m = name.match(/^([a-zA-Z]+)\s*(\d*)$/);
  if (!m) return name || "Verse";
  const map: Record<string, string> = {
    v: "Verse",
    c: "Chorus",
    b: "Bridge",
    p: "Pre-Chorus",
    t: "Tag",
    i: "Intro",
    e: "Ending",
    o: "Other",
  };
  const base = map[m[1].toLowerCase()] || "Verse";
  return m[2] ? `${base} ${m[2]}` : base;
}

// ----- OpenLP / OpenLyrics (XML) -----

function parseOpenLyrics(content: string): Song | null {
  const doc = parseXml(content);
  if (!doc) return null;
  const songEl = doc.getElementsByTagName("song")[0];
  if (!songEl) return null;

  const title = textOf(songEl, "title");
  const artist = textOf(songEl, "author");
  const ccli = textOf(songEl, "ccliNo");
  const copyright = textOf(songEl, "copyright");
  const verseOrder = textOf(songEl, "verseOrder").trim();

  const byName: Record<string, SongSlide[]> = {};
  const docOrder: SongSlide[] = [];

  Array.from(songEl.getElementsByTagName("verse")).forEach((verseEl) => {
    const name = verseEl.getAttribute("name") ?? "";
    const label = openLyricsLabel(name);
    const linesEl = verseEl.getElementsByTagName("lines")[0];
    if (!linesEl) return;
    const raw = elementToLyrics(linesEl);
    raw.split("__BREAK__").forEach((part) => {
      const lines = part
        .split("\n")
        .map((l) => l.replace(/ *\{[^}]*\} */g, "").trim())
        .filter(Boolean);
      if (!lines.length) return;
      const slide: SongSlide = { id: uid(), label, text: lines.join("\n"), notes: "", template_id: null, layers: [] };
      (byName[name] = byName[name] || []).push(slide);
      docOrder.push(slide);
    });
  });

  let slides = docOrder;
  if (verseOrder) {
    const ordered: SongSlide[] = [];
    const seen = new Set<string>();
    verseOrder.split(/\s+/).forEach((name) => {
      (byName[name] ?? []).forEach((s) => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          ordered.push(s);
        }
      });
    });
    docOrder.forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        ordered.push(s);
      }
    });
    if (ordered.length) slides = ordered;
  }

  if (!slides.length) return null;
  return makeSong(title || "Imported song", slides, { artist, ccli, copyright });
}

// ----- OpenSong (XML) -----

function parseOpenSong(content: string): Song | null {
  const doc = parseXml(content);
  if (!doc) return null;
  const songEl = doc.documentElement;
  if (!songEl) return null;

  const title = textOf(songEl, "title");
  const lyricsRaw = textOf(songEl, "lyrics");
  if (!lyricsRaw) return null;
  const presentation = textOf(songEl, "presentation").trim();
  const artist = textOf(songEl, "author");
  const copyright = textOf(songEl, "copyright");
  const ccli = textOf(songEl, "ccli");
  const key = textOf(songEl, "key");

  let lyrics = lyricsRaw.replaceAll("\n \n", "\n\n").replaceAll("\n\n\n\n", "\n\n").replaceAll("||", "\n__CHILD__\n");
  const groups = lyrics.split(/(?=\[)/).map((g) => g.trim()).filter(Boolean);

  const byName: Record<string, SongSlide[]> = {};
  const docOrder: SongSlide[] = [];

  groups.forEach((grp) => {
    const lines = grp.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    let label = "";
    const first = lines[0];
    const open = first.indexOf("[");
    if (open !== -1) {
      const close = first.indexOf("]", open + 1);
      label = (close !== -1 ? first.slice(open + 1, close) : first.slice(open + 1)).trim();
    }
    const contentLines = label ? lines.slice(1) : lines;
    contentLines
      .join("\n")
      .split("__CHILD__")
      .forEach((part) => {
        const cleanLines = part
          .split("\n")
          .map((l) => l.replace(/^\s*\..*$/, "").replaceAll("_", "").trim())
          .filter((l) => l && !l.startsWith(";"));
        if (!cleanLines.length) return;
        const slide: SongSlide = { id: uid(), label: label || "Verse", text: cleanLines.join("\n"), notes: "", template_id: null, layers: [] };
        (byName[label] = byName[label] || []).push(slide);
        docOrder.push(slide);
      });
  });

  let slides = docOrder;
  if (presentation) {
    const ordered: SongSlide[] = [];
    const seen = new Set<string>();
    presentation.split(/\s+/).forEach((name) => {
      const found = Object.keys(byName).find((k) => k.toLowerCase() === name.toLowerCase());
      if (!found) return;
      (byName[found] ?? []).forEach((s) => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          ordered.push(s);
        }
      });
    });
    docOrder.forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        ordered.push(s);
      }
    });
    if (ordered.length) slides = ordered;
  }

  if (!slides.length) return null;
  return makeSong(title || "Imported song", slides, { artist, copyright, ccli, key });
}

// ----- EasySlides (XML) -----

function parseEasySlides(content: string): Song[] {
  const doc = parseXml(content);
  if (!doc) return [];
  const root = doc.documentElement;
  if (!root) return [];
  const items = Array.from(root.getElementsByTagName("Item"));
  if (!items.length) return [];

  const songs: Song[] = [];
  items.forEach((item) => {
    const title = textOf(item, "Title1") || textOf(item, "Title") || "Imported song";
    const contents = item.getElementsByTagName("Contents")[0]?.textContent ?? "";
    if (!contents.trim()) return;

    let lyrics = contents.replaceAll("[", "\n\n[").trim().replaceAll("\n\n\n\n", "\n\n");
    lyrics = lyrics.replace(/\[\d+\]/g, "\n\n");
    const blocks = lyrics.split(/\n{2,}/).filter(Boolean);

    const slides: SongSlide[] = [];
    blocks.forEach((block) => {
      let lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      let label = "Verse";
      const m = lines[0].match(/\[([^\]]+)\]/);
      if (m) {
        label = m[1].trim() || "Verse";
        lines = lines.slice(1);
      }
      if (!lines.length) return;
      slides.push({ id: uid(), label, text: lines.join("\n"), notes: "", template_id: null, layers: [] });
    });

    if (slides.length) songs.push(makeSong(title, slides, {}));
  });

  return songs;
}

// ----- ProPresenter XML (Pro 4 / 5 / 6) -----
// Text is stored base64 + RTF hex encoded. Decoders ported from FreeShow.

function decodeBase64Chars(text: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bits = 0;
  let bitLength = 0;
  let result = "";
  for (const char of text) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) continue;
    bits = (bits << 6) + idx;
    bitLength += 6;
    if (bitLength >= 8) result += String.fromCharCode((bits >>> (bitLength -= 8)) & 0xff);
  }
  return result;
}

function decodeLatin1HexRTF(input: string): string {
  return input.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    const byte = parseInt(hex, 16);
    try {
      return new TextDecoder("latin1").decode(Uint8Array.from([byte]));
    } catch {
      return String.fromCharCode(byte);
    }
  });
}

function decodeUnicodeEscapes(input: string): string {
  let result = input;
  let position = result.indexOf("\\u");
  while (position > -1) {
    const end = result.indexOf(" ?", position) + 2;
    if (end > 1 && end - position <= 10) {
      const decoded = String.fromCharCode(Number(result.slice(position, end).replace(/[^\d-]/g, "")));
      if (!decoded.includes("\\x")) result = result.slice(0, position) + decoded + result.slice(end);
    }
    position = result.indexOf("\\u", position + 1);
  }
  return result;
}

function decodeBase64(text: string): string {
  let r = decodeBase64Chars(text);
  r = r.replaceAll("\\u8217 ?", "'").replaceAll("‘", "'").replaceAll("’", "'");
  r = decodeLatin1HexRTF(r);
  r = decodeUnicodeEscapes(r);
  return r;
}

function RTFToText(input: string): string {
  const binaryEndPos = input.search(/[ÿ¿\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]+$/);
  if (binaryEndPos > -1) input = input.slice(0, binaryEndPos);
  input = input.slice(0, input.lastIndexOf("}") > 0 ? input.lastIndexOf("}") : input.length);

  let cleaned = input
    .replaceAll("\\pard", "\\remove")
    .replaceAll("\\part", "\\remove")
    .replaceAll("\\par", "__BREAK__")
    .replaceAll("\\\n", "__BREAK__")
    .replaceAll("\n", "__BREAK__")
    .replaceAll("\\u8232", "__BREAK__");

  const regex = /\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/gm;
  cleaned = cleaned.replace(regex, "").replaceAll("\\*", "");

  if (!cleaned.replaceAll("__BREAK__", "").trim().length) {
    input = input.replaceAll("}", "").replaceAll("{", "");
    cleaned = input.replace(regex, "").replaceAll("\\*", "");
    const formatting = cleaned.lastIndexOf(";;;;");
    if (formatting >= 0) cleaned = cleaned.slice(formatting + 4);
    cleaned = cleaned.replaceAll(";;", "");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned
    .split("__BREAK__")
    .filter((a) => a.trim())
    .join("\n")
    .trim();
}

function stripRTFHeader(input: string): string {
  const textStart = input.indexOf("\\ltrch");
  if (textStart > -1) return input.slice(input.indexOf(" ", textStart), input.length);
  let paragraphs = input.split("\n\n");
  if (paragraphs[0].includes("rtf")) {
    paragraphs = paragraphs.slice(1);
    input = paragraphs.join("\n\n");
    input = input.slice(0, input.length - 1);
  }
  return input;
}

function stripInlineStyles(txt: string): string {
  let styleIndex = txt.indexOf("\\");
  while (styleIndex >= 0) {
    let nextSpace = txt.indexOf(" ", styleIndex);
    if (nextSpace < 1) nextSpace = txt.length;
    txt = txt.slice(0, styleIndex) + txt.slice(nextSpace);
    styleIndex = txt.indexOf("\\");
  }
  return txt;
}

function decodeHexBody(input: string): string {
  const hex = input.split("\\'");
  let str = "";
  hex.forEach((txt, i) => {
    txt = txt.replaceAll("\r\n", "");
    const breakPos = txt.indexOf("\n");
    const lineFormattingPos = txt.indexOf("\\f0");
    if (breakPos >= 0 && lineFormattingPos >= 0 && lineFormattingPos < breakPos) txt = txt.slice(breakPos);
    txt = stripInlineStyles(txt);
    if (i === 0) str = txt;
    else {
      str += String.fromCharCode(parseInt(txt.slice(0, 2), 16));
      str += txt.slice(2);
    }
  });
  return str;
}

function cleanDecodedText(str: string): string {
  str = str.replaceAll("}{", "<br>").replaceAll("} {", "<br>").replaceAll("}  {", "<br>").replaceAll("{ }", "");
  if (str.indexOf("{{") > -1 && str.indexOf("{{") < 3) str = str.slice(str.indexOf("{{") + 2);
  str = str.trim();
  if (str.length - str.lastIndexOf("}") < 3) str = str.slice(0, str.lastIndexOf("}"));
  str = str.trim();
  while (str.indexOf("<br>") === 0) str = str.slice(4);
  return str;
}

function decodeHex(input: string): string {
  if (input.includes("\\rtf") && !input.includes("\\'")) return RTFToText(input);
  input = stripRTFHeader(input);
  input = input.replaceAll("\\\n", "<br>");
  return cleanDecodedText(decodeHexBody(input));
}

function hasManyControlChars(s: string): boolean {
  let ctrl = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127) ctrl++;
  }
  return s.length > 0 && ctrl / s.length > 0.05;
}

function decodeProText(text: string): string {
  if (!text) return "";
  const decoded = decodeHex(decodeBase64(text));
  if (hasManyControlChars(decoded)) return text.trim();
  return decoded.trim();
}

function collectProTexts(textElement: Element): string[] {
  const nss = Array.from(textElement.getElementsByTagName("NSString")).filter(
    (ns) => ns.textContent && ns.textContent.trim(),
  );
  if (!nss.length) return [];

  const rtf = nss.find((ns) => ns.getAttribute("rvXMLIvarName") === "RTFData");
  const plain = nss.find((ns) => ns.getAttribute("rvXMLIvarName") === "PlainText");
  const chosen = rtf ? [rtf] : plain ? [plain] : nss;

  const texts: string[] = [];
  chosen.forEach((ns) => {
    const t = decodeProText(ns.textContent ?? "");
    if (t && t !== "Double-click to edit") texts.push(t);
  });
  return texts;
}

function parseProPresenterXml(content: string): Song | null {
  const doc = parseXml(content);
  if (!doc) return null;
  const root = doc.documentElement;
  if (!root || root.tagName !== "RVPresentationDocument") return null;

  const title = root.getAttribute("CCLISongTitle") || root.getAttribute("name") || "";
  const artist = root.getAttribute("CCLIArtistCredits") || "";
  const ccli = root.getAttribute("CCLISongNumber") || "";
  const copyright = root.getAttribute("CCLICopyright") || "";

  const groups: { name: string; slide: Element }[] = [];
  Array.from(root.getElementsByTagName("RVSlideGrouping")).forEach((g) => {
    const name = g.getAttribute("name") ?? "";
    Array.from(g.getElementsByTagName("RVDisplaySlide")).forEach((s) => groups.push({ name, slide: s }));
  });
  if (!groups.length) {
    Array.from(root.getElementsByTagName("RVDisplaySlide")).forEach((s) => groups.push({ name: "", slide: s }));
  }
  if (!groups.length) return null;

  const slides: SongSlide[] = [];
  groups.forEach(({ name, slide }) => {
    const lines: string[] = [];
    Array.from(slide.getElementsByTagName("RVTextElement")).forEach((te) => {
      collectProTexts(te).forEach((t) => {
        t.split("\n").forEach((l) => {
          const x = l.trim();
          if (x) lines.push(x);
        });
      });
    });
    if (!lines.length) return;
    slides.push({
      id: uid(),
      label: name || `Slide ${slides.length + 1}`,
      text: lines.join("\n"),
      notes: "",
      template_id: null,
      layers: [],
    });
  });

  if (!slides.length) return null;
  return makeSong(title || "Imported song", slides, { artist, ccli, copyright });
}

// ----- ProPresenter JSON (Pro 6 / 7 exports) -----

function decodeRTF(b64: string): string {
  if (!b64) return "";
  try {
    return RTFToText(decodeBase64(b64));
  } catch {
    return b64;
  }
}

function parseProPresenterJson(content: string): Song[] {
  const data = JSON.parse(content);
  const songs: Song[] = [];

  const processSong = (song: any) => {
    if (!song || typeof song !== "object") return;

    // Pro 6/7 JSON export: verses = [[text, label], ...] + verse_order_list
    if (Array.isArray(song.verses) && song.verses.length) {
      const byName: Record<string, SongSlide[]> = {};
      const docOrder: SongSlide[] = [];
      song.verses.forEach((entry: any) => {
        const text = (Array.isArray(entry) ? entry[0] : entry.text ?? entry.lyrics ?? "") as string;
        const label = (Array.isArray(entry) ? entry[1] : entry.label ?? entry.part ?? "") as string;
        const clean = String(text).replace(/<br\s*\/?>/gi, "\n").trim();
        if (!clean) return;
        const slide: SongSlide = { id: uid(), label: label || "Verse", text: clean, notes: "", template_id: null, layers: [] };
        (byName[label] = byName[label] || []).push(slide);
        docOrder.push(slide);
      });
      if (!docOrder.length) return;

      let slides = docOrder;
      const order = Array.isArray(song.verse_order_list) ? song.verse_order_list : [];
      if (order.length) {
        const ordered: SongSlide[] = [];
        const seen = new Set<string>();
        order.forEach((label: string) => {
          (byName[label] ?? []).forEach((s) => {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              ordered.push(s);
            }
          });
        });
        docOrder.forEach((s) => {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            ordered.push(s);
          }
        });
        if (ordered.length) slides = ordered;
      }

      const title = song.name || song["@CCLISongTitle"] || song.title || "Imported song";
      songs.push(
        makeSong(title, slides, {
          artist: song["@CCLIArtistCredits"] || song.artist || "",
          ccli: song["@CCLISongNumber"] || song.ccli || "",
          copyright: song["@CCLICopyright"] || song.copyrights_info || song.copyright || "",
        }),
      );
      return;
    }

    // Pro 7 cues JSON: text in baseSlide.elements[].element.text.rtfData (base64 RTF)
    if (Array.isArray(song.cues) && song.cues.length) {
      const slides: SongSlide[] = [];
      song.cues.forEach((cue: any) => {
        const action = (cue.actions ?? []).find((a: any) => a.slide?.presentation);
        const base = action?.slide?.presentation?.baseSlide;
        if (!base) return;
        const lines: string[] = [];
        (base.elements ?? []).forEach((el: any) => {
          const rtfData = el?.element?.text?.rtfData;
          if (!rtfData) return;
          decodeRTF(rtfData)
            .split("\n")
            .forEach((l) => {
              const x = l.trim();
              if (x) lines.push(x);
            });
        });
        if (!lines.length) return;
        slides.push({ id: uid(), label: cue.name || "Slide", text: lines.join("\n"), notes: "", template_id: null, layers: [] });
      });
      if (slides.length) songs.push(makeSong(song.name || "Imported song", slides, {}));
    }
  };

  if (Array.isArray(data.data)) data.data.forEach(processSong);
  else processSong(data);

  return songs;
}

// ----- FreeShow .shows (JSON) -----

function parseFreeShowJson(content: string): Song[] {
  const data = JSON.parse(content);
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : data.show && Array.isArray(data.show.items)
        ? data.show.items
        : [];

  const songs: Song[] = [];
  items.forEach((item: any) => {
    if (!item || typeof item !== "object") return;
    const d = item.data && typeof item.data === "object" ? item.data : item;
    const slidesObj = d.slides;
    if (!slidesObj || typeof slidesObj !== "object") return;

    const slides: SongSlide[] = [];
    Object.values(slidesObj).forEach((s: any) => {
      if (!s || typeof s !== "object") return;
      const lines: string[] = [];
      (s.items ?? []).forEach((it: any) => {
        (it.lines ?? []).forEach((ln: any) => {
          const value = Array.isArray(ln.text)
            ? ln.text.map((x: any) => x?.value ?? "").join("")
            : ln.text?.value ?? ln.value ?? "";
          if (value) lines.push(String(value));
        });
      });
      if (!lines.length) return;
      slides.push({
        id: uid(),
        label: (s.group && s.group !== "verse" ? s.group : "") || "Slide",
        text: lines.join("\n"),
        notes: s.notes ?? "",
        template_id: null,
        layers: [],
      });
    });

    if (!slides.length) return;
    const meta = d.meta ?? {};
    const title = String(meta.title || meta.name || item.name || "Imported song");
    songs.push(
      makeSong(title, slides, {
        artist: String(meta.artist || ""),
        ccli: String(meta.CCLI || meta.ccli || ""),
        copyright: String(meta.copyright || ""),
      }),
    );
  });

  return songs;
}

// ----- dispatch -----

function looksBinary(content: string): boolean {
  return content.includes("\u0000") || /�/.test(content);
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || "Imported song";
}

function baseNameOf(path: string): string {
  return fileNameOf(path).replace(/\.[^.]+$/, "");
}

export function parseImportContent(content: string, filePath: string, format: ImportFormat): Song[] {
  const fallbackTitle = baseNameOf(filePath);
  const trimmed = content.trim();

  if (format === "chordpro" || format === "text") {
    return [parseChordPro(content, fallbackTitle)];
  }

  if (format === "worshipcast") {
    try {
      const songs = jsonSongs(trimmed, fallbackTitle);
      if (songs.length) return songs;
    } catch {
      // fall through
    }
  } else if (format === "propresenter") {
    try {
      const fromJson = parseProPresenterJson(content);
      if (fromJson.length) return fromJson;
    } catch {
      // not JSON — try XML
    }
    const fromXml = parseProPresenterXml(content);
    if (fromXml) return [fromXml];
  } else if (format === "freeshow") {
    try {
      const fromFs = parseFreeShowJson(content);
      if (fromFs.length) return fromFs;
    } catch {
      // fall through
    }
  } else if (format === "openlp") {
    const song = parseOpenLyrics(content);
    if (song) return [song];
  } else if (format === "opensong") {
    const song = parseOpenSong(content);
    if (song) return [song];
  } else if (format === "easyslides") {
    const songs = parseEasySlides(content);
    if (songs.length) return songs;
  } else if (format === "easyworship") {
    // .db / .sqlite are binary databases — handled by looksBinary guard
  }

  // Auto-detect XML (OpenLyrics / OpenSong / EasySlides / ProPresenter XML)
  if (trimmed.startsWith("<")) {
    const song = parseOpenLyrics(content) ?? parseOpenSong(content);
    if (song) return [song];
    const pro = parseProPresenterXml(content);
    if (pro) return [pro];
    const es = parseEasySlides(content);
    if (es.length) return es;
  }

  // Generic JSON (WorshipCast backups, arrays of songs, etc.)
  try {
    const songs = jsonSongs(trimmed, fallbackTitle);
    if (songs.length) return songs;
  } catch {
    // fall through
  }

  // Fallback: ChordPro / plain text
  return [parseChordPro(content, fallbackTitle)];
}

export interface ImportResult {
  songs: Song[];
  errors: string[];
}

export async function importSongFiles(paths: string[], format: ImportFormat): Promise<ImportResult> {
  const songs: Song[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    try {
      const content = await readTextFile(path);
      if (looksBinary(content)) {
        errors.push(`${fileNameOf(path)}: định dạng nhị phân chưa được hỗ trợ (chỉ XML / JSON / ChordPro / text)`);
        continue;
      }
      const parsed = parseImportContent(content, path, format);
      const withSlides = parsed.filter((s) => s.slides.length > 0);
      const empty = parsed.length - withSlides.length;
      if (withSlides.length === 0) {
        errors.push(`${fileNameOf(path)}: không đọc được lời bài hát (định dạng không khớp hoặc file rỗng)`);
        continue;
      }
      if (empty > 0) errors.push(`${fileNameOf(path)}: ${empty} bài hát không có lời đã được bỏ qua`);
      songs.push(...withSlides);
    } catch (err) {
      errors.push(`${fileNameOf(path)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { songs, errors };
}

const SONG_FILE_EXTENSIONS = ["pro", "json", "shows", "cho", "txt", "xml", "worshipcast"];

function joinPath(dir: string, name: string): string {
  if (dir.endsWith("/") || dir.endsWith("\\")) return dir + name;
  return dir.includes("\\") ? dir + "\\" + name : dir + "/" + name;
}

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export async function importSongsFromDir(
  dirPath: string,
  format: ImportFormat,
  maxFiles = 1000,
): Promise<ImportResult> {
  const songs: Song[] = [];
  const errors: string[] = [];
  let count = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readDir(dir);
    } catch (err) {
      errors.push(`${dir}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    for (const entry of entries) {
      if (count >= maxFiles) {
        errors.push(`Đã đạt giới hạn ${maxFiles} file, dừng quét.`);
        return;
      }
      const full = joinPath(dir, entry.name);
      if (entry.isDirectory) {
        await walk(full);
        continue;
      }
      if (!entry.isFile) continue;
      if (!SONG_FILE_EXTENSIONS.includes(extOf(entry.name))) continue;
      count++;
      try {
        const content = await readTextFile(full);
        if (looksBinary(content)) {
          errors.push(`${entry.name}: định dạng nhị phân chưa được hỗ trợ`);
          continue;
        }
        const parsed = parseImportContent(content, full, format);
        const withSlides = parsed.filter((s) => s.slides.length > 0);
        if (withSlides.length === 0) {
          errors.push(`${entry.name}: không đọc được lời bài hát`);
          continue;
        }
        songs.push(...withSlides);
      } catch (err) {
        errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await walk(dirPath);
  return { songs, errors };
}

export async function exportSongsJson(songs: Song[]): Promise<string> {
  return JSON.stringify({ songs, exported_at: Date.now() }, null, 2);
}

export function writeExportFile(path: string, content: string): Promise<void> {
  return writeFile(path, new TextEncoder().encode(content));
}
