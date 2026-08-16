import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon/Icon";
import { api } from "../lib/api";
import type { InterlinearWord, StrongEntry } from "../lib/types";
import { formatMorph } from "../lib/morphology";

interface Props {
  onClose: () => void;
  initialAbbrev?: string;
  initialChapter?: number;
  initialVerse?: number;
}

interface Ref {
  abbrev: string;
  chapter: number;
  verse: number;
}

const HEB_BOOKS = [
  { a: "Gen", n: "Sáng-thế Ký" }, { a: "Exod", n: "Xuất Ê-díp-tô Ký" }, { a: "Lev", n: "Lê-vi Ký" },
  { a: "Num", n: "Dân-số Ký" }, { a: "Deut", n: "Phục-truyền Luật-lệ Ký" }, { a: "Josh", n: "Giô-suê" },
  { a: "Judg", n: "Các Quan Xét" }, { a: "Rut", n: "Ru-tơ" }, { a: "1Sam", n: "1 Sa-mu-ên" },
  { a: "2Sam", n: "2 Sa-mu-ên" }, { a: "1Kgs", n: "1 Các Vua" }, { a: "2Kgs", n: "2 Các Vua" },
  { a: "1Chr", n: "1 Sử-ký" }, { a: "2Chr", n: "2 Sử-ký" }, { a: "Ezra", n: "E-xơ-ra" },
  { a: "Neh", n: "Nê-hê-mi" }, { a: "Est", n: "Ê-xơ-tê" }, { a: "Job", n: "Gióp" },
  { a: "Ps", n: "Thi-thiên" }, { a: "Prov", n: "Châm-ngôn" }, { a: "Eccl", n: "Truyền-đạo" },
  { a: "Song", n: "Nhã-ca" }, { a: "Isa", n: "Ê-sai" }, { a: "Jer", n: "Giê-rê-mi" },
  { a: "Lam", n: "Ca-thương" }, { a: "Ezek", n: "Ê-xê-chi-ên" }, { a: "Dan", n: "Đa-ni-ên" },
  { a: "Hos", n: "Ô-sê" }, { a: "Joel", n: "Giô-ên" }, { a: "Amos", n: "A-mốt" },
  { a: "Obad", n: "Áp-đia" }, { a: "Jon", n: "Giô-na" }, { a: "Mic", n: "Mi-chê" },
  { a: "Nah", n: "Na-hum" }, { a: "Hab", n: "Ha-ba-cúc" }, { a: "Zeph", n: "Sô-phô-ni" },
  { a: "Hag", n: "A-ghê" }, { a: "Zech", n: "Xa-cha-ri" }, { a: "Mal", n: "Ma-la-chi" },
];

const GRK_BOOKS = [
  { a: "Matt", n: "Ma-thi-ơ" }, { a: "Mark", n: "Mác" }, { a: "Luke", n: "Lu-ca" },
  { a: "John", n: "Giăng" }, { a: "Acts", n: "Công-vụ các Sứ-đồ" }, { a: "Rom", n: "Rô-ma" },
  { a: "1Cor", n: "1 Cô-rinh-tô" }, { a: "2Cor", n: "2 Cô-rinh-tô" }, { a: "Gal", n: "Ga-la-ti" },
  { a: "Eph", n: "Ê-phê-sô" }, { a: "Phil", n: "Phi-líp" }, { a: "Col", n: "Cô-lô-se" },
  { a: "1Thess", n: "1 Tê-sa-lô-ni-ca" }, { a: "2Thess", n: "2 Tê-sa-lô-ni-ca" },
  { a: "1Tim", n: "1 Ti-mô-thê" }, { a: "2Tim", n: "2 Ti-mô-thê" }, { a: "Titus", n: "Tít" },
  { a: "Phlm", n: "Phi-lê-môn" }, { a: "Heb", n: "Hê-bơ-rơ" }, { a: "Jas", n: "Gia-cơ" },
  { a: "1Pet", n: "1 Phi-e-rơ" }, { a: "2Pet", n: "2 Phi-e-rơ" }, { a: "1John", n: "1 Giăng" },
  { a: "2John", n: "2 Giăng" }, { a: "3John", n: "3 Giăng" }, { a: "Jude", n: "Giu-đe" },
  { a: "Rev", n: "Khải-huyền" },
];

const ALL_BOOKS = [...HEB_BOOKS, ...GRK_BOOKS];

function bookName(abbrev: string): string {
  return ALL_BOOKS.find((b) => b.a === abbrev)?.n ?? abbrev;
}

function parseRef(raw: string): Ref | null {
  // supports "Giăng 3:16", "John 3:16", "Sáng 1:1", "Gen 1:1", "Rev 22", "Ps.23", "1 Cor 13:4"
  const s = raw.trim();
  if (!s) return null;
  const bookMatch = s.match(/^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+))?$/);
  if (!bookMatch) return null;
  const bookQuery = bookMatch[1].toLowerCase().replace(/[\s.]/g, "");
  let match = ALL_BOOKS.find(
    (b) =>
      b.a.toLowerCase() === bookQuery ||
      b.n.replace(/\s|-/g, "").toLowerCase() === bookQuery ||
      b.n.toLowerCase().includes(bookQuery),
  );
  if (!match) {
    const firstWord = bookQuery.split(/\s|-/).join("");
    match = ALL_BOOKS.find((b) => b.n.replace(/\s|-/g, "").toLowerCase().startsWith(firstWord));
  }
  if (!match) return null;
  const chapter = parseInt(bookMatch[2], 10);
  const verse = bookMatch[3] ? parseInt(bookMatch[3], 10) : 1;
  return { abbrev: match.a, chapter, verse: verse || 1 };
}

export default function BibleInterlinearModal({ onClose, initialAbbrev, initialChapter, initialVerse }: Props) {
  const [refInput, setRefInput] = useState("");
  const [ref, setRef] = useState<Ref | null>(
    initialAbbrev && initialChapter
      ? { abbrev: initialAbbrev, chapter: initialChapter, verse: initialVerse ?? 1 }
      : null,
  );
  const [words, setWords] = useState<InterlinearWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<InterlinearWord | null>(null);
  const [strong, setStrong] = useState<StrongEntry | null>(null);
  const [strongLoading, setStrongLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StrongEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchShown, setSearchShown] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  const refLabel = ref ? `${bookName(ref.abbrev)} ${ref.chapter}:${ref.verse}` : "";

  const loadVerse = useCallback((r: Ref) => {
    setLoading(true);
    setErr("");
    setWords([]);
    setSelected(null);
    setStrong(null);
    api
      .getInterlinearVerse(r.abbrev, r.chapter, r.verse)
      .then((ws) => {
        setWords(ws);
        if (ws.length) {
          setSelected(ws[0]);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (ref) loadVerse(ref);
  }, [ref, loadVerse]);

  useEffect(() => {
    if (strongLoading || !strong || !selected) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [strong, strongLoading, selected]);

  useEffect(() => {
    const onSearch = () => {
      setSearchShown(false);
      const el = refInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    };
    window.addEventListener("pwc:search", onSearch);
    return () => window.removeEventListener("pwc:search", onSearch);
  }, []);

  const pickWord = (w: InterlinearWord) => {
    setSelected(w);
    setStrong(null);
    setStrongLoading(true);
    api
      .getStrongEntry(w.strong)
      .then(setStrong)
      .catch(() => setStrong(null))
      .finally(() => setStrongLoading(false));
  };

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    api
      .searchStrong(q.trim(), 40)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => doSearch(search), 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [search, doSearch]);

  const jumpToSearch = (e: StrongEntry) => {
    // find the first verse in the whole Bible where this strong appears... simpler: keep search but allow copy
    setSearchShown(false);
    setSearch("");
    setSearchResults([]);
    // open the dictionary entry directly
    setStrong(null);
    setSelected(null);
    setStrongLoading(true);
    api
      .getStrongEntry(e.id)
      .then((se) => {
        setStrong(se);
        setSearchShown(false);
      })
      .catch(() => setErr("Không tìm thấy mục " + e.id))
      .finally(() => setStrongLoading(false));
  };

  const navigate = (dir: -1 | 1) => {
    if (!ref) return;
    const next = { ...ref, verse: ref.verse + dir };
    if (next.verse < 1) {
      // go to previous chapter, last verse 50 as guess
      if (next.chapter <= 1) return;
      next.chapter -= 1;
      next.verse = 50;
    }
    setRef(next);
  };

  function renderVerseNav() {
    return (
      <div className="interlinear-nav">
        <button className="icon" onClick={() => navigate(-1)} title="Câu trước">
          <Icon name="chevronLeft" size={14} />
        </button>
        <button
          onClick={() => {
            const r = parseRef(refInput || refLabel);
            if (r) setRef(r);
            else setErr("Không nhận diện được địa chỉ. VD: Giăng 3:16 hoặc John 3:16");
          }}
          title="Đi tới câu"
        >
          {refLabel || (refInput ? "???" : "—")}
        </button>
        <button className="icon" onClick={() => navigate(1)} title="Câu kế">
          <Icon name="chevronsRight" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg interlinear-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Tra cứu Nguyên ngữ (Hebrew / Greek Interlinear)</h2>
          <button
            className={`icon ${searchShown ? "active" : ""}`}
            onClick={() => setSearchShown((s) => !s)}
            title="Tìm kiếm Strong's"
          >
            <Icon name="search" size={15} />
          </button>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          {searchShown && (
            <div className="interlinear-search">
              <input
                autoFocus
                value={search}
                placeholder="Tìm mã Strong (G25, H7225 …) hoặc từ khóa (love, agapaō…)"
                onChange={(e) => setSearch(e.target.value)}
              />
              {searching ? (
                <div className="interlinear-hint">Đang tìm…</div>
              ) : (
                <div className="interlinear-results">
                  {searchResults.map((r) => (
                    <button key={r.id} className="il-search-item" onClick={() => jumpToSearch(r)}>
                      <span className="il-s-strong">{r.id}</span>
                      <span className="il-s-word">{r.lemma || r.translit}</span>
                      <span className="il-s-def">{r.strongs_def || r.kjv_def || r.derivation}</span>
                      <span className="il-s-count">{r.count} lần</span>
                    </button>
                  ))}
                  {search && searchResults.length === 0 && !searching && (
                    <div className="interlinear-hint">Không tìm thấy.</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="interlinear-refbar">
            <input
              ref={refInputRef}
              value={refInput || refLabel}
              onChange={(e) => setRefInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const r = parseRef(refInput);
                  if (r) {
                    setRef(r);
                    setRefInput("");
                  } else setErr("Không nhận diện được địa chỉ. VD: Giăng 3:16 hoặc John 3:16");
                }
              }}
              placeholder="Nhập địa chỉ câu… (VD: Giăng 3:16)"
              title="Gõ địa chỉ và nhấn Enter"
              style={{ flex: 1 }}
            />
            {renderVerseNav()}
          </div>

          {err && <div className="bc-err">{err}</div>}
          {loading && <div className="empty-hint">{refLabel ? `Đang tải ${refLabel}…` : "Đang tải…"}</div>}

          {words.length > 0 && (
            <>
              <div className="interlinear-bar" dir="rtl">
                {words.map((w, idx) => (
                  <button
                    key={idx}
                    className={`il-word${selected?.strong === w.strong && selected?.word === w.word ? " sel" : ""}`}
                    onClick={() => pickWord(w)}
                    title={formatMorph(w.lang, w.morph) || w.strong}
                  >
                    <div className="il-strong">{w.strong.replace(/^[HG]/, "")}</div>
                    <div className="il-word-word" lang={w.lang}>
                      {w.word}
                    </div>
                    <div className="il-translit">{w.translit}</div>
                  </button>
                ))}
              </div>

              {(selected || strong) && (
                <div className="interlinear-details" ref={scrollRef}>
                  {strongLoading && <div className="interlinear-hint">Đang tải từ điển Strong's…</div>}
                  {!strongLoading && strong && (
                    <IlStrongView entry={strong} word={selected} />
                  )}
                  {!strongLoading && !strong && selected && (
                    <div>
                      <h3>
                        {selected.word} ({selected.translit}) — <em>{selected.strong}</em>
                      </h3>
                      <p className="il-morph">{formatMorph(selected.lang, selected.morph)}</p>
                      <p className="il-gloss">{selected.gloss || "Không có định nghĩa"}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IlStrongView({ entry, word }: { entry: StrongEntry; word: InterlinearWord | null }) {
  return (
    <div>
      <h3 className="il-strong-title">
        <span lang={entry.lang === "hebrew" ? "he" : "grc"} className="il-strong-word">
          {entry.lemma || word?.word}
        </span>
        {"  "}
        <span className="il-strong-translit">{entry.translit || word?.translit}</span>
        <span className="il-strong-id">
          [{entry.id} — xuất hiện {entry.count} lần]
        </span>
      </h3>
      {entry.pron && <p className="il-pron">Phát âm: {entry.pron}</p>}
      {word && (
        <p className="il-this-form">
          Hình thức trong câu: <strong>{word.word}</strong> ({word.translit}) — {word.strong}
        </p>
      )}
      {entry.derivation && (
        <p className="il-derivation">
          <strong>Nguồn gốc:</strong> {entry.derivation}
        </p>
      )}
      {entry.strongs_def && (
        <p className="il-sdef">
          <strong>Định nghĩa:</strong> {entry.strongs_def}
        </p>
      )}
      {entry.kjv_def && (
        <p className="il-kjv">
          <strong>KJV dịch là:</strong> {entry.kjv_def}
        </p>
      )}
    </div>
  );
}