// Build interlinear data for the Bible panel.
// Sources:
//  - OpenGNT CSV (Greek NT): field 6 = book|chapter|verse (40..66), field 7 = word|unaccented|accented|lexeme|rmac|sn, field 9 = translit|..., field 10 = gloss|...
//  - OSHB XML (Hebrew OT): <verse osisID="Gen.1.1"><w lemma="b/7225" morph="HR/Ncfsa">בְּ/רֵאשִׁית</w>...</verse>
//  - Strong's JS dictionaries (openscriptures/strongs)
// Output: src-tauri/assets/bible/il/{greek,hebrew,strongs}/ per-book JSON files
import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";

const ROOT = "D:/ProWorshipCast";
const OUT = path.join(ROOT, "src-tauri", "assets", "bible", "ilg");
const TMP = "C:/Users/HP/AppData/Local/Temp/opencode";

const GRK = path.join(OUT, "greek");
const HEB = path.join(OUT, "hebrew");
const STR = path.join(OUT, "strongs");
fs.mkdirSync(GRK, { recursive: true });
fs.mkdirSync(HEB, { recursive: true });
fs.mkdirSync(STR, { recursive: true });

function writeGz(dir, name, obj) {
  const data = gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
  fs.writeFileSync(path.join(dir, name + ".json.gz"), data);
}

// ---- book abbrev lists (must match app BOOK_NAMES order) ----
const NT_ABBREVS = ["Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"];
const OT_ABBREVS = ["Gen","Exod","Lev","Num","Deut","Josh","Judg","Rut","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Est","Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jon","Mic","Nah","Hab","Zeph","Hag","Zech","Mal"];
// OSHB file names
const OSHB_FILE = { Gen:"Gen",Exod:"Exod",Lev:"Lev",Num:"Num",Deut:"Deut",Josh:"Josh",Judg:"Judg",Rut:"Ruth", "1Sam":"1Sam","2Sam":"2Sam","1Kgs":"1Kgs","2Kgs":"2Kgs","1Chr":"1Chr","2Chr":"2Chr",Ezra:"Ezra",Neh:"Neh",Est:"Esth",Job:"Job",Ps:"Ps",Prov:"Prov",Eccl:"Eccl",Song:"Song",Isa:"Isa",Jer:"Jer",Lam:"Lam",Ezek:"Ezek",Dan:"Dan",Hos:"Hos",Joel:"Joel",Amos:"Amos",Obad:"Obad",Jon:"Jonah",Mic:"Mic",Nah:"Nah",Hab:"Hab",Zeph:"Zeph",Hag:"Hag",Zech:"Zech",Mal:"Mal" };

function strip(s) {
  // fields are wrapped in 〔...〕 with ｜ separators
  const m = s.match(/〔(.*)〕/s);
  return m ? m[1].split("｜") : [];
}

// ---------- GREEK (OpenGNT) ----------
const greekLines = fs.readFileSync(path.join(TMP, "ogntbase", "OpenGNT_version3_3.csv"), "utf8").split(/\r?\n/);
// data lines start at index 1
const greekByBook = new Map(); // bookIdx(0-26) -> Map(ch -> Map(v -> [words]))
let greekCount = 0, skipCount = 0;
for (let li = 1; li < greekLines.length; li++) {
  const cols = greekLines[li].split("\t");
  if (cols.length < 8) { skipCount++; continue; }
  const loc = strip(cols[6]); // book|chapter|verse
  if (!loc || loc.length < 3) { skipCount++; continue; }
  const bookNum = parseInt(loc[0], 10);
  if (isNaN(bookNum)) { skipCount++; continue; }
  const bookIdx = bookNum - 40; // 40..66 -> 0..26
  const ch = parseInt(loc[1], 10);
  const vs = parseInt(loc[2], 10);
  const w = strip(cols[7]); // OGNTk|OGNTu|OGNTa|lexeme|rmac|sn
  const tr = strip(cols[9]); // transSBLcap|transSBL|...
  const gl = strip(cols[10]); // TBESG|IT|LT|ST|Esp
  const word = w[2] || w[1] || w[0]; // accented preferred
  const translit = tr[1] || tr[0] || "";
  const lexeme = w[3] || "";
  const morph = w[4] || "";
  const strong = w[5] || ""; // Gxxxx
  const gloss = gl[0] || "";
  if (!word) { skipCount++; continue; }
  greekCount++;
  if (!greekByBook.has(bookIdx)) greekByBook.set(bookIdx, new Map());
  const book = greekByBook.get(bookIdx);
  if (!book.has(ch)) book.set(ch, new Map());
  if (!book.get(ch).has(vs)) book.get(ch).set(vs, []);
  book.get(ch).get(vs).push({ word, translit, strong, morph, lexeme, gloss });
}

// ---------- STRONG'S (loaded early so Hebrew uses xlit) ----------
function loadStrongsJs(file) {
  const src = fs.readFileSync(path.join(TMP, file), "utf8");
  const start = src.indexOf("= {");
  const end = src.lastIndexOf("};");
  const json = src.slice(start + 2, end + 1);
  return JSON.parse(json);
}
const strongsHeb = loadStrongsJs("strongs-hebrew.js");
const strongsGrk = loadStrongsJs("strongs-greek.js");

// ---------- HEBREW (OSHB) ----------
const hebrewByBook = new Map(); // bookIdx(0-38) -> Map(ch -> Map(v -> [words]))
let hebCount = 0;
for (let bi = 0; bi < OT_ABBREVS.length; bi++) {
  const abbrev = OT_ABBREVS[bi];
  const file = OSHB_FILE[abbrev];
  const xml = fs.readFileSync(path.join(TMP, "oshb", file + ".xml"), "utf8");
  const book = new Map();
  // verse blocks
  const verseRe = /<verse[^>]*osisID="([A-Za-z0-9.]+)"[^>]*>([\s\S]*?)<\/verse>/g;
  let vm;
  while ((vm = verseRe.exec(xml)) !== null) {
    const osis = vm[1]; // e.g. Gen.1.1
    const parts = osis.split(".");
    const ch = parseInt(parts[1], 10);
    const vs = parseInt(parts[2], 10);
    if (isNaN(ch) || isNaN(vs)) continue;
    const words = [];
    const block = vm[2];
    const wRe = /<w[^>]*>([\s\S]*?)<\/w>|<w[^>]*\/>/g;
    let wm;
    while ((wm = wRe.exec(block)) !== null) {
      const tag = wm[0];
      if (tag.includes("/>")) continue;
      const text = wm[1];
      const lemmaAttr = /lemma="([^"]+)"/.exec(tag);
      const morphAttr = /morph="([^"]+)"/.exec(tag);
      const nAttr = /n="([^"]+)"/.exec(tag);
      const lemma = lemmaAttr ? lemmaAttr[1] : "";
      // lemma may include prefixes: "b/7225" -> strong 7225; "1254 a" variant
      let strongNum = "";
      const lastSeg = lemma.split("/").pop();
      const m = lastSeg.match(/(\d+)/);
      if (m) strongNum = m[1];
      const morph = morphAttr ? morphAttr[1] : "";
      const order = nAttr ? nAttr[1] : "";
      const display = text.replace(/\//g, "");
      const translit = strongNum && strongsHeb["H" + strongNum] ? strongsHeb["H" + strongNum].xlit || "" : "";
      words.push({ word: display, translit, strong: "H" + strongNum, morph, order });
      hebCount++;
    }
    if (words.length) {
      if (!book.has(ch)) book.set(ch, new Map());
      book.get(ch).set(vs, words);
    }
  }
  hebrewByBook.set(bi, book);
}

// ---------- WRITE ----------
function normSearch(s = "") {
  return s
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");
}

function enrichStrongs(obj) {
  const out = {};
  for (const [k, e] of Object.entries(obj)) {
    const lemma = e.lemma || "";
    const translit = e.xlit || e.translit || "";
    const sdef = e.strongs_def || "";
    const kdef = e.kjv_def || "";
    out[k] = { ...e, __norm: normSearch(k + " " + lemma + " " + translit + " " + sdef + " " + kdef) };
  }
  return out;
}

function writeBook(dir, abbrev, book) {
  const obj = {};
  for (const [ch, vmap] of book.entries()) {
    obj[String(ch)] = Object.fromEntries(
      [...vmap.entries()].map(([v, words]) => [String(v), words])
    );
  }
  writeGz(dir, abbrev, obj);
}

for (const [bookIdx, book] of greekByBook.entries()) {
  writeBook(GRK, NT_ABBREVS[bookIdx], book);
}
for (const [bookIdx, book] of hebrewByBook.entries()) {
  writeBook(HEB, OT_ABBREVS[bookIdx], book);
}

// strongs files (with precomputed normalized search text)
writeGz(STR, "hebrew", enrichStrongs(strongsHeb));
writeGz(STR, "greek", enrichStrongs(strongsGrk));

console.log("Greek words:", greekCount, "| skipped lines:", skipCount);
console.log("Hebrew words:", hebCount);
// stats
for (const [i, b] of greekByBook.entries()) console.log("  GRK", NT_ABBREVS[i], b.size, "chapters");
for (const [i, b] of hebrewByBook.entries()) console.log("  HEB", OT_ABBREVS[i], b.size, "chapters");
