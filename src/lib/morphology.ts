// Human-readable morphology descriptions for interlinear codes.
// Greek: OpenGNT "rmac" (Robinson/MorphGNT style) codes.
// Hebrew: OpenScriptures Hebrew Bible (OSHB) morph codes.

const GREEK_POS: Record<string, string> = {
  N: "Danh từ",
  A: "Tính từ",
  V: "Động từ",
  D: "Trạng từ",
  C: "Liên từ",
  P: "Giới từ",
  R: "Đại từ",
  T: "Tiểu từ",
  X: "Bất biến từ",
  I: "Thán từ",
};

const GREEK_CASE: Record<string, string> = {
  N: "Chủ cách",
  G: "Sở hữu cách",
  D: "Tặng cách",
  A: "Đối cách",
  V: "Hô cách",
};

const GREEK_NUM: Record<string, string> = {
  S: "số ít",
  P: "số nhiều",
  D: "số đôi",
};

const GREEK_GEN: Record<string, string> = {
  M: "giống đực",
  F: "giống cái",
  N: "giống trung",
};

const GREEK_TENSE: Record<string, string> = {
  P: "Hiện tại",
  I: "Chưa hoàn thành",
  F: "Tương lai",
  A: "Quá khứ đơn (Aorist)",
  R: "Hoàn thành",
  L: "Quá khứ hoàn thành",
};

const GREEK_VOICE: Record<string, string> = {
  A: "chủ động",
  M: "trung/phản thân",
  P: "bị động",
  E: "trung/phản thân",
};

const GREEK_MOOD: Record<string, string> = {
  I: "lối trực thuyết",
  S: "lối cầu khẩn",
  N: "lối vô định",
  M: "lối mệnh lệnh",
  P: "phân từ",
  O: "lối cầu",
};

function decodeGreek(rmac: string): string {
  const parts = rmac.split("-");
  const pos = parts[0] || "";
  const rest = parts[1] ?? "";
  const posName = GREEK_POS[pos] ?? `Từ loại ${pos}`;
  if (pos === "N" || pos === "A" || pos === "R" || pos === "T" || pos === "P") {
    // e.g. rest = "NSF", "GSM", "DSN", "NuNSF" (nu), "GSM-P" (proper)
    let c = rest[0] || "";
    let n = rest[1] || "";
    let g = rest[2] || "";
    let adj = "";
    if ((rest[0] === "N" || rest[0] === "G" || rest[0] === "D" || rest[0] === "A" || rest[0] === "V") === false) {
      c = GREEK_CASE[rest[0]] ? rest[0] : "";
      n = "";
      g = rest[1] ?? "";
    }
    const caseName = GREEK_CASE[c] ?? (c ? `cách ${c}` : "");
    const num = GREEK_NUM[n] ?? (n ? `số ${n}` : "");
    const gen = GREEK_GEN[g] ?? (g ? `giống ${g}` : "");
    const proper = rest.endsWith("-P") ? " (danh từ riêng)" : "";
    const title = rest.endsWith("-T") ? " (danh hiệu)" : "";
    const segs = [posName, caseName, num, gen].filter(Boolean);
    return segs.join(", ") + (proper || title);
  }
  if (pos === "V") {
    // e.g. 3PAI / PAI / NPM
    let i = 0;
    const person = rest[i] && /[123]/.test(rest[i]) ? rest[i++] + " ngôi" : "";
    const tense = GREEK_TENSE[rest[i]] ? (rest[i++] + "") : "";
    let voice = "";
    if (rest[i] && /[AMP]/.test(rest[i])) {
      voice = GREEK_VOICE[rest[i]] ?? "";
      i++;
    }
    let mood = "";
    if (rest[i] && rest[i] !== " ") {
      mood = GREEK_MOOD[rest[i]] ?? "";
    }
    const tParts: string[] = [...(person ? [person] : []), ...(tense ? [tense] : [])];
    // build readable: person + tense + voice + mood, skip empty
    const moodName = mood;
    const tName = tParts.join(" ");
    const vName = voice;
    const arr = [posName];
    if (tName) arr.push(`${tName}${vName ? " " + vName : ""}`);
    if (moodName) arr.push(moodName);
    return arr.filter(Boolean).join(", ");
  }
  // adverb, conjunction, etc.
  if (pos === "D" || pos === "C" || pos === "I" || pos === "X") {
    return posName;
  }
  return `${posName} (${rest || ""})`;
}

type HebMorph = {
  pos: string;
  stem?: string;
  tense?: string;
  person?: string;
  gender?: string;
  number?: string;
  state?: string;
  prefix?: string[];
};

function decodeHebrew(code: string): string {
  const [prefixMorph, baseMorph] = code.split("/");
  const prefixes: string[] = [];
  // prefix component (before /) e.g. H R, H T d, H R d - parse leading H then letters
  const parsePrefix = (s: string | undefined): string[] => {
    if (!s || s.length < 2) return [];
    const letters = s.slice(1); // after leading H
    const out: string[] = [];
    for (const ch of letters) {
      if (ch === "R") out.push("giới từ");
      else if (ch === "C") out.push("liên từ");
      else if (ch === "T") out.push("dấu trực tiếp (et)");
      else if (ch === "d") out.push("mạo từ");
      else if (ch === "b") out.push("giới từ ב");
      else if (ch === "l") out.push("giới từ ל");
      else if (ch === "m") out.push("giới từ מ");
      else if (ch === "k") out.push("giới từ כ");
      else if (ch === "V") out.push("động từ");
      else if (ch === "N") out.push("danh từ");
      else if (ch === "P") out.push("đại từ");
      else out.push(ch);
    }
    return out;
  };
  const base = prefixMorph ? decodeHebrewBase(prefixMorph.replace(/^H/, "")) : "";
  return [decodeHebrewBase(baseMorph || ""), ...prefixes].filter(Boolean).join(" + ");
}

// decode a bare OSHB base morph token like "Ncfsa", "Vqp3ms", "Aamsa", "R", "To", "S"
function decodeHebrewBase(tok: string): string {
  if (!tok) return "";
  const c0 = tok[0];
  switch (c0) {
    case "N": {
      // N c/f/m + s/p/d + a/c
      const gender = { c: "chung", m: "đực", f: "cái", b: "chung" }[tok[1] ?? ""] ?? "";
      const num = { s: "số ít", p: "số nhiều", d: "số đôi" }[tok[2] ?? ""] ?? "";
      const state = { a: "tuyệt đối", c: "liên kết", d: "yếu vị" }[tok[3] ?? ""] ?? "";
      return ["Danh từ", gender, num, state].filter(Boolean).join(" ");
    }
    case "V": {
      // V stem + tense + person/gender/number
      const stemMap: Record<string, string> = {
        q: "Qal",
        n: "Niphal",
        D: "Piel",
        p: "Pual",
        H: "Hiphil",
        h: "Hophal",
        t: "Hithpael",
        P: "Poel",
        o: "Poal",
        r: "Pilel",
        R: "Palel",
        m: "Hithpalel",
        e: "Polel",
      };
      const tenseMap: Record<string, string> = {
        p: "hoàn thành",
        i: "chưa hoàn thành",
        q: "hoàn thành (waw)",
        c: "chưa hoàn thành (waw)",
        v: "mệnh lệnh",
        a: "phân từ",
        n: "phân từ",
        r: "phân từ",
        m: "vô định tuyệt đối",
        t: "vô định liên kết",
      };
      const ch1 = tok[1] ?? "";
      const ch2 = tok[2] ?? "";
      const stem = stemMap[ch1] ?? "";
      const tense = tenseMap[ch2] ?? "";
      const person = /[123]/.test(tok[3] ?? "") ? (tok[3] + " ngôi") : "";
      const gender = { m: "đực", f: "cái", c: "chung", b: "chung" }[tok[4] ?? ""] ?? "";
      const num = { s: "số ít", p: "số nhiều", d: "số đôi" }[tok[5] ?? ""] ?? "";
      const extra = tok[6] ? { a: " (tuyệt đối)", c: " (liên kết)" }[tok[6] as string] ?? "" : "";
      return ["Động từ", stem, tense, person, gender, num].filter(Boolean).join(" ") + extra;
    }
    case "A": {
      const gender = { m: "đực", f: "cái", c: "chung" }[tok[1] ?? ""] ?? "";
      const num = { s: "số ít", p: "số nhiều", d: "số đôi" }[tok[2] ?? ""] ?? "";
      const state = { a: "tuyệt đối", c: "liên kết" }[tok[3] ?? ""] ?? "";
      return ["Tính từ", gender, num, state].filter(Boolean).join(" ");
    }
    case "R":
      return "Giới từ";
    case "C":
      return "Liên từ";
    case "D":
      return "Trạng từ";
    case "T": {
      if (tok === "To") return "Dấu trực tiếp (et)";
      if (tok === "Td" || tok === "d") return "Mạo từ";
      if (tok === "Tn") return "Tiểu từ phủ định";
      return "Tiểu từ";
    }
    case "S":
      return "Đại từ (suffix)";
    case "P":
      return "Đại từ";
    case "I":
      return "Thán từ";
    default:
      return tok;
  }
}

export function formatMorph(lang: string, code: string): string {
  if (!code) return "";
  if (lang === "greek") return decodeGreek(code);
  return decodeHebrew(code);
}