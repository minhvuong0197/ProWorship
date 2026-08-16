import type { CSSProperties } from "react";
import type { StyleOverride } from "../lib/types";

export type OverrideStyle = Partial<
  Pick<CSSProperties, "fontWeight" | "fontStyle" | "textDecoration" | "color">
>;

interface Token {
  text: string;
  style?: OverrideStyle;
  key: number;
}

function buildOverrides(
  overrides?: StyleOverride[],
): Array<{ re: RegExp; style: OverrideStyle; transform?: string }> {
  if (!overrides || overrides.length === 0) return [];
  return overrides
    .filter((o) => o.match && o.match.trim())
    .map((o) => {
      const raw = o.match.trim();
      let re: RegExp;
      const style: OverrideStyle = {};
      if (o.bold) style.fontWeight = 700;
      if (o.italic) style.fontStyle = "italic";
      if (o.underline) style.textDecoration = "underline";
      if (o.color) style.color = o.color;
      if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
        const last = raw.lastIndexOf("/");
        const flags = raw.slice(last + 1);
        re = new RegExp(
          raw.slice(1, last),
          flags.includes("g") ? flags : flags + "g",
        );
      } else {
        re = new RegExp(escapeRe(raw), "g");
      }
      return { re, style, transform: o.transform };
    });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTransform(s: string, transform?: string): string {
  if (!transform || transform === "none") return s;
  if (transform === "upper") return s.toUpperCase();
  if (transform === "lower") return s.toLowerCase();
  if (transform === "capitalize")
    return s.replace(/(^|\s)(\S)/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  return s;
}

export function tokenize(text: string, overrides?: StyleOverride[]): Token[] {
  const rules = buildOverrides(overrides);
  if (rules.length === 0 || !text) return text ? [{ text, key: 0 }] : [];
  const parts: Array<{
    start: number;
    length: number;
    style: OverrideStyle;
    transform?: string;
  }> = [];
  const plain = text;
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(plain)) !== null) {
      if (m.index > plain.length) break;
      parts.push({
        start: m.index,
        length: m[0].length,
        style: r.style,
        transform: r.transform,
      });
      if (m[0].length === 0) r.re.lastIndex++;
    }
  }
  if (parts.length === 0) return [{ text, key: 0 }];
  parts.sort((a, b) => a.start - b.start);
  const tokens: Token[] = [];
  let cursor = 0;
  let key = 0;
  for (const p of parts) {
    if (p.start > cursor) {
      tokens.push({ text: text.slice(cursor, p.start), key: key++ });
    }
    tokens.push({
      text: applyTransform(text.slice(p.start, p.start + p.length), p.transform),
      style: p.style,
      key: key++,
    });
    cursor = p.start + p.length;
  }
  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), key: key++ });
  }
  return tokens;
}

export function parseCss(css: string | undefined): CSSProperties {
  const out: Record<string, string> = {};
  if (!css) return out;
  for (const decl of css.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const key = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!key || !value) continue;
    const camel = key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as CSSProperties;
}

export default function StyledText({
  text,
  overrides,
  style,
}: {
  text: string;
  overrides?: StyleOverride[];
  style?: CSSProperties;
}) {
  const tokens = tokenize(text, overrides);
  return (
    <>
      {tokens.map((tok) => (
        <span key={tok.key} style={tok.style ? { ...style, ...tok.style } : style}>
          {tok.text}
        </span>
      ))}
    </>
  );
}
