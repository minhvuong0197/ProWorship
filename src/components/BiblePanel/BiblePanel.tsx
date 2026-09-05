import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import type {
  BibleBookMeta,
  BibleChapter,
  BibleSearchHit,
  BibleVersion,
} from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { defaultLive, resolveBibleStyle } from "../../lib/live";
import { useT } from "../../lib/i18n";
import { uid } from "../../lib/types";
import { DRAG_BIBLE } from "../../lib/nav";
import Icon from "../Icon/Icon";
import BibleInterlinearModal from "../BibleInterlinearModal";

interface PendingJump {
  abbrev: string;
  chapter: number;
  start: number | null;
  end?: number | null;
  syncOnly?: boolean;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ð/g, "d");
const comp = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
const looksLikeRef = (s: string) => /^\s*[^\d]*\d/.test(s);

export default function BiblePanel() {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const goLive = useAppStore((s) => s.goLive);
  const templates = useAppStore((s) => s.templates);
  const playlists = useAppStore((s) => s.playlists);
  const activePlaylistId = useAppStore((s) => s.activePlaylistId);
  const savePlaylist = useAppStore((s) => s.savePlaylist);
  const setActivePlaylistId = useAppStore((s) => s.setActivePlaylistId);

  const [books, setBooks] = useState<BibleBookMeta[]>([]);
  const [selectedAbbrev, setSelectedAbbrev] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [chapter, setChapter] = useState<BibleChapter | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BibleSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const scrollTo = useRef<number | null>(null);
  const searchTimer = useRef<number | null>(null);
  const clickTimer = useRef<number | null>(null);
  const pendingAddRef = useRef<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);

  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [curVersion, setCurVersion] = useState("vie");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [onlineBooks, setOnlineBooks] = useState<BibleBookMeta[] | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState<
    | { type: "version" }
    | { type: "book" }
    | { type: "verse"; abbrev: string; chapter: number; verse: number }
    | { type: "import" }
    | null
  >(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const curVersionMeta = versions.find((v) => v.id === curVersion);
  const isImported = curVersionMeta?.source === "imported";
  const isEditable = isImported || curVersion === "vie";

  const [quickErr, setQuickErr] = useState("");
  const [searchMode, setSearchMode] = useState<"ref" | "topic">("ref");
  const [leftTab, setLeftTab] = useState<"books" | "chapters">("books");
  const [autoSec, setAutoSec] = useState(3);
  const [autoOn, setAutoOn] = useState(false);
  const [curIdx, setCurIdx] = useState<number | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const [showInterlinear, setShowInterlinear] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const bookListRef = useRef<HTMLDivElement | null>(null);
  const [pendingBookScroll, setPendingBookScroll] = useState<string | null>(null);
  const [pendingChapterScroll, setPendingChapterScroll] = useState<number | null>(null);

  const selectedBook = books.find((b) => b.abbrev === selectedAbbrev) ?? null;

  const rangeRef = useMemo(() => {
    if (!chapter || selected.size === 0) return null;
    const nums = [...selected].sort((a, b) => a - b);
    const vs = nums.map((i) => i + 1);
    const first = vs[0];
    const last = vs[vs.length - 1];
    return `${chapter.name} ${chapter.chapter}:${first}${first !== last ? `-${last}` : ""}`;
  }, [chapter, selected]);

  useEffect(() => {
    api.listBibleVersions().then(setVersions).catch(console.error);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    };
  }, []);

  useEffect(() => {
    const onSearch = () => {
      quickInputRef.current?.focus();
      quickInputRef.current?.select();
    };
    window.addEventListener("pwc:search", onSearch);
    return () => window.removeEventListener("pwc:search", onSearch);
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [actionsOpen]);

  useEffect(() => {
    if (!pendingBookScroll || leftTab !== "books") return;
    const el = document.getElementById(`bible-book-${pendingBookScroll}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
    }
    setPendingBookScroll(null);
  }, [pendingBookScroll, leftTab]);

  useEffect(() => {
    if (pendingChapterScroll == null || leftTab !== "chapters") return;
    const el = document.getElementById(`bible-chapter-${pendingChapterScroll}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
    }
    setPendingChapterScroll(null);
  }, [pendingChapterScroll, leftTab]);

  useEffect(() => {
    setBooks([]);
    setOnlineBooks(null);
    if (curVersion === "online") {
      api
        .onlineBibleBooks()
        .then((bs) => {
          setOnlineBooks(bs);
          setBooks(bs);
        })
        .catch(console.error);
      return;
    }
    api
      .getBibleBooksVersion(curVersion)
      .then(setBooks)
      .catch(console.error);
  }, [curVersion]);

  useEffect(() => {
    if (!selectedAbbrev || !selectedChapter) {
      setChapter(null);
      return;
    }
    let disposed = false;
    if (curVersion === "online") {
      const meta = onlineBooks?.find((b) => b.abbrev === selectedAbbrev);
      if (!meta?.onlineRef) {
        setChapter(null);
        return;
      }
      api
        .onlineBibleChapter(meta.onlineRef, selectedChapter, meta.name)
        .then((c) => {
          if (!disposed) setChapter(c);
        })
        .catch(console.error);
      return () => {
        disposed = true;
      };
    }
    api
      .getBibleChapterVersion(curVersion, selectedAbbrev, selectedChapter)
      .then((c) => {
        if (!disposed) setChapter(c);
      })
      .catch(console.error);
    return () => {
      disposed = true;
    };
  }, [selectedAbbrev, selectedChapter, curVersion, onlineBooks]);

  useEffect(() => {
    const onSelectAll = () => {
      if (!chapter) return;
      setSelected(
        new Set(
          chapter.verses.map((_, i) => i).filter((i) => chapter.verses[i]?.trim()),
        ),
      );
    };
    window.addEventListener("pwc:bible-select-all", onSelectAll);
    return () => window.removeEventListener("pwc:bible-select-all", onSelectAll);
  }, [chapter]);

  useEffect(() => {
    if (scrollTo.current != null && chapter) {
      const el = document.getElementById(`bible-v-${scrollTo.current}`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("flash");
        window.setTimeout(() => el.classList.remove("flash"), 1700);
      }
      scrollTo.current = null;
    }
  }, [chapter]);

  useEffect(() => {
    if (curIdx == null) return;
    const el = document.getElementById(`bible-v-${curIdx + 1}`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [curIdx, selectedAbbrev, selectedChapter]);

  useEffect(() => {
    if (!chapter || !pendingJump) return;
    if (
      chapter.abbrev === pendingJump.abbrev &&
      chapter.chapter === pendingJump.chapter
    ) {
      if (pendingJump.syncOnly) {
        const i = (pendingJump.start ?? 1) - 1;
        setCurIdx(Math.max(0, i));
      } else {
        const last = lastPresentableIndex();
        if (pendingJump.end != null && pendingJump.end > (pendingJump.start ?? 0)) {
          goLiveRange(pendingJump.start ?? 1, pendingJump.end);
          consumePendingAdd(pendingJump.start ?? 1, pendingJump.end);
        } else {
          const v = pendingJump.start == null ? last : pendingJump.start - 1;
          goLiveVerse(v);
          consumePendingAdd(pendingJump.start ?? 1, pendingJump.start ?? 1);
        }
      }
      setPendingJump(null);
    }
  }, [chapter, pendingJump, selectedAbbrev, selectedChapter]);

  useEffect(() => {
    const ref = live?.current?.bible_ref;
    if (!ref) return;
    const p = ref.split("|");
    if (p.length < 3) return;
    const abbrev = p[0];
    const ch = parseInt(p[1], 10);
    const verse = parseInt(p[2], 10);
    if (!abbrev || !ch || !verse) return;
    if (abbrev === selectedAbbrev && ch === selectedChapter) {
      setCurIdx(verse - 1);
    } else {
      setQuery("");
      setResults(null);
      setPendingJump({ abbrev, chapter: ch, start: verse, syncOnly: true });
      setSelectedAbbrev(abbrev);
      setSelectedChapter(ch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.current?.bible_ref]);

  useEffect(() => {
    if (!autoOn) return;
    const id = window.setInterval(
      () => nextVerse(),
      Math.max(0.1, autoSec) * 1000,
    );
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, autoSec, curIdx, selectedAbbrev, selectedChapter, chapter]);

  const selectBook = (abbrev: string) => {
    setQuery("");
    setResults(null);
    setSelectedAbbrev(abbrev);
    setSelectedChapter(1);
    setCurIdx(null);
    setAutoOn(false);
    setLeftTab("chapters");
  };

  const runSearch = (q: string) => {
    if (curVersion !== "vie") {
      setResults([]);
      return;
    }
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    api
      .bibleSearch(q.trim())
      .then((hits) => {
        setResults(hits);
        setSearching(false);
      })
      .catch((e) => {
        console.error(e);
        setSearching(false);
      });
  };

  const openHit = (hit: BibleSearchHit) => {
    setQuery("");
    setResults(null);
    setSelectedAbbrev(hit.abbrev);
    setSelectedChapter(hit.chapter);
    scrollTo.current = hit.verse;
  };

  const verseCount = () => (chapter ? chapter.verses.filter((v) => v).length : 0);

  const lastPresentableIndex = () => {
    if (!chapter) return -1;
    for (let k = chapter.verses.length - 1; k >= 0; k--) if (chapter.verses[k]) return k;
    return -1;
  };

  const nextPresentableIndex = (from: number) => {
    if (!chapter) return -1;
    for (let k = from; k < chapter.verses.length; k++) if (chapter.verses[k]) return k;
    return -1;
  };

  const prevPresentableIndex = (from: number) => {
    if (!chapter) return -1;
    for (let k = from; k >= 0; k--) if (chapter.verses[k]) return k;
    return -1;
  };

  const isLastEverything = () => {
    if (!selectedBook || !selectedChapter) return true;
    if (selectedChapter < selectedBook.chapters) return false;
    const idx = books.findIndex((b) => b.abbrev === selectedBook.abbrev);
    return idx === books.length - 1;
  };

  const presentChapterVerse = (ch: BibleChapter, verseIndex: number) => {
    const text = ch.verses[verseIndex];
    if (!text) return;
    const verseNum = verseIndex + 1;
    const reference = `${ch.name} ${ch.chapter}:${verseNum}`;    const base = live ?? defaultLive(settings);
    goLive({
      ...base,
      current: {
        kind: "song",
        title: reference,
        label: reference,
        text: `${verseNum} ${text}`,
        background: base.background ?? undefined,
        ...resolveBibleStyle(settings, templates, curVersionMeta?.template_id),
        bible_ref: `${ch.abbrev}|${ch.chapter}|${verseNum}|${verseNum}|${ch.name}|${curVersionMeta?.name ?? ""}`,
      },
      next_text: null,
      next_label: null,
      playlist_id: null,
      playlist_entry_index: null,
      bible_version: curVersion,
    });
    setCurIdx(verseIndex);
  };

  const dragVerse = (e: React.DragEvent, ch: BibleChapter, verseIndex: number) => {
    const text = ch.verses[verseIndex];
    if (!text) return;
    e.dataTransfer.setData(
      DRAG_BIBLE,
      JSON.stringify({
        version: curVersion,
        versionName: curVersionMeta?.name ?? "",
        abbrev: ch.abbrev,
        name: ch.name,
        chapter: ch.chapter,
        verseStart: verseIndex + 1,
        verseEnd: verseIndex + 1,
        text: `${verseIndex + 1} ${text}`,
        templateId: curVersionMeta?.template_id,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const presentChapterRange = (ch: BibleChapter, startVerse: number, endVerse: number) => {
    if (startVerse === endVerse) {
      presentChapterVerse(ch, startVerse - 1);
      return;
    }
    const firstText = ch.verses[startVerse - 1];
    if (!firstText?.trim()) return;
    const reference = `${ch.name} ${ch.chapter}:${startVerse}-${endVerse}`;
    const base = live ?? defaultLive(settings);
    goLive({
      ...base,
      current: {
        kind: "song",
        title: reference,
        label: reference,
        text: `${startVerse} ${firstText}`,
        background: base.background ?? undefined,
        ...resolveBibleStyle(settings, templates, curVersionMeta?.template_id),
        bible_ref: `${ch.abbrev}|${ch.chapter}|${startVerse}|${startVerse}|${ch.name}|${curVersionMeta?.name ?? ""}|${startVerse}|${endVerse}`,
      },
      next_text: null,
      next_label: null,
      playlist_id: null,
      playlist_entry_index: null,
      bible_version: curVersion,
    });
    setCurIdx(startVerse - 1);
  };

  const goLiveVerse = (verseIndex: number) => {
    if (!chapter) return;
    presentChapterVerse(chapter, verseIndex);
  };

  const goLiveRange = (startVerse: number, endVerse: number) => {
    if (!chapter) return;
    presentChapterRange(chapter, startVerse, endVerse);
  };

  const gotoChapter = (
    abbrev: string,
    ch: number,
    start: number | null,
    end: number | null = null,
  ) => {
    setResults(null);
    if (abbrev === selectedAbbrev && ch === selectedChapter) {
      if (start == null) {
        goLiveVerse(lastPresentableIndex());
        consumePendingAdd(1, 1);
      } else if (end != null && end >= start) {
        goLiveRange(start, end);
        consumePendingAdd(start, end);
      } else {
        goLiveVerse(start - 1);
        consumePendingAdd(start, start);
      }
      return;
    }
    setPendingJump({ abbrev, chapter: ch, start, end });
    setSelectedAbbrev(abbrev);
    setSelectedChapter(ch);
    setLeftTab("chapters");
  };

  const stepChapter = (dir: number) => {
    if (!selectedBook || !selectedChapter) return;
    if (dir > 0) {
      if (selectedChapter < selectedBook.chapters) {
        gotoChapter(selectedBook.abbrev, selectedChapter + 1, 1);
      } else {
        const idx = books.findIndex((b) => b.abbrev === selectedBook.abbrev);
        const nb = books[idx + 1];
        if (nb) gotoChapter(nb.abbrev, 1, 1);
      }
    } else {
      if (selectedChapter > 1) {
        gotoChapter(selectedBook.abbrev, selectedChapter - 1, null);
      } else {
        const idx = books.findIndex((b) => b.abbrev === selectedBook.abbrev);
        const pb = books[idx - 1];
        if (pb) gotoChapter(pb.abbrev, pb.chapters, null);
      }
    }
  };

  const nextVerse = () => {
    if (!chapter) return;
    const from = curIdx == null ? 0 : curIdx + 1;
    const nv = nextPresentableIndex(from);
    if (nv >= 0) {
      goLiveVerse(nv);
      return;
    }
    if (isLastEverything()) {
      setAutoOn(false);
      return;
    }
    stepChapter(1);
  };

  const prevVerse = () => {
    if (!chapter) return;
    const from = curIdx == null ? lastPresentableIndex() : curIdx - 1;
    const pv = prevPresentableIndex(from);
    if (pv >= 0) {
      goLiveVerse(pv);
      return;
    }
    stepChapter(-1);
  };

  const resolveBook = (needle: string) => {
    const byShort = books.filter(
      (b) => comp(b.short) === needle || comp(b.name) === needle,
    );
    if (byShort.length) return byShort;
    const ql = needle;
    const byAbbrev = books.filter((b) => b.abbrev.toLowerCase() === ql);
    const byPrefix = books.filter(
      (b) => comp(b.name).startsWith(needle) || comp(b.short).startsWith(needle),
    );
    const seen: Record<string, boolean> = {};
    return byAbbrev
      .concat(byPrefix)
      .filter((b) => (seen[b.abbrev] ? false : (seen[b.abbrev] = true)));
  };

  const parseQuick = (
    q: string,
  ): { abbrev: string; chapter: number; start: number | null; end: number | null } | null => {
    const s = q.trim();
    if (!s || /^\d+$/.test(s)) return null;
    const m = s.match(/^\s*(.+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/);
    if (m) {
      const matches = resolveBook(comp(m[1]));
      if (!matches.length) return null;
      const chapterNum = parseInt(m[2], 10);
      if (chapterNum < 1 || chapterNum > matches[0].chapters) return null;
      return {
        abbrev: matches[0].abbrev,
        chapter: chapterNum,
        start: m[3] ? parseInt(m[3], 10) : null,
        end: m[4] ? parseInt(m[4], 10) : null,
      };
    }
    const matches = resolveBook(comp(s));
    if (!matches.length) return null;
    return { abbrev: matches[0].abbrev, chapter: 1, start: null, end: null };
  };

  const onSearchChange = (value: string) => {
    setQuery(value);
    setQuickErr("");
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (searchMode === "topic") {
      setResults(null);
      if (value.trim().length < 2) return;
      searchTimer.current = window.setTimeout(() => runSearch(value), 250);
      return;
    }
    if (value.endsWith(" ")) {
      setResults(null);
      const body = value.slice(0, -1);
      for (const b of books) {
        const pref = b.name + " ";
        if (body.startsWith(pref)) {
          const rest = body.slice(pref.length);
          if (/^\d+:\d+$/.test(rest)) {
            setQuery(body + "-");
            return;
          }
          if (/^\d+$/.test(rest)) {
            setQuery(body + ":");
            return;
          }
          break;
        }
        const sref = b.short + " ";
        if (body.startsWith(sref)) {
          const rest = body.slice(sref.length);
          if (/^\d+:\d+$/.test(rest)) {
            setQuery(body + "-");
            return;
          }
          if (/^\d+$/.test(rest)) {
            setQuery(body + ":");
            return;
          }
          break;
        }
      }
      return;
    }
    if (looksLikeRef(value)) {
      setResults(null);
      if (!value.trim() || /^\d+$/.test(value.trim())) return;
      const parsed = parseQuick(value);
      if (parsed) {
        setSelectedAbbrev(parsed.abbrev);
        setSelectedChapter(parsed.chapter);
        setCurIdx(null);
        setLeftTab("chapters");
        setPendingChapterScroll(parsed.chapter);
        return;
      }
      const needle = comp(value.trim());
      const b = resolveBook(needle);
      if (b.length === 1 && value.trim() !== b[0].name) {
        setQuery(b[0].name + " ");
        setLeftTab("books");
        setPendingBookScroll(b[0].abbrev);
      }
      return;
    }
    setResults(null);
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    const one = resolveBook(comp(trimmed));
    if (one.length === 1 && trimmed !== one[0].name) {
      setQuery(one[0].name + " ");
      setLeftTab("books");
      setPendingBookScroll(one[0].abbrev);
      return;
    }
  };

  const selectSearchMode = (mode: "ref" | "topic") => {
    setSearchMode(mode);
    setQuery("");
    setResults(null);
    setQuickErr("");
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
  };

  const applySearch = () => {
    if (searchMode === "topic") {
      if (results && results.length > 0) {
        openHit(results[0]);
        return;
      }
      return;
    }
    const parsed = parseQuick(query);
    if (parsed) {
      setResults(null);
      setQuickErr("");
      setSelected(new Set());
      const { abbrev, chapter: ch, start, end } = parsed;
      const rStart = start ?? 1;
      const rEnd = end ?? rStart;
      pendingAddRef.current = { start: rStart, end: rEnd };
      if (start == null) {
        gotoChapter(abbrev, ch, 1);
        return;
      }
      gotoChapter(abbrev, ch, rStart, rEnd);
      return;
    }
    if (query.trim()) setQuickErr(t("bible.quickNotFound"));
  };

  const toggleAuto = () => {
    if (autoOn) {
      setAutoOn(false);
      return;
    }
    if (!chapter) return;
    if (curIdx == null) {
      const nv = nextPresentableIndex(0);
      if (nv >= 0) goLiveVerse(nv);
    }
    setAutoOn(true);
  };

  const toggleSelect = (verseIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(verseIndex)) next.delete(verseIndex);
      else next.add(verseIndex);
      return next;
    });
  };

  const goLiveSelection = () => {
    if (!chapter || selected.size === 0 || !rangeRef) return;
    const idx = [...selected].sort((a, b) => a - b);
    const firstIdx = idx[0];
    const lastIdx = idx[idx.length - 1];
    const verseNum = firstIdx + 1;
    const endVerse = lastIdx + 1;
    const text = `${verseNum} ${chapter.verses[firstIdx] ?? ""}`;
    if (!text.trim()) return;
    const base = live ?? defaultLive(settings);
    const isRange = firstIdx !== lastIdx;
    goLive({
      ...base,
      current: {
        kind: "song",
        title: rangeRef,
        label: rangeRef,
        text,
        background: base.background ?? undefined,
        ...resolveBibleStyle(settings, templates, curVersionMeta?.template_id),
        bible_ref: `${chapter.abbrev}|${chapter.chapter}|${verseNum}|${verseNum}|${chapter.name}|${curVersionMeta?.name ?? ""}${isRange ? `|${verseNum}|${endVerse}` : ""}`,
      },
      next_text: null,
      next_label: null,
      playlist_id: null,
      playlist_entry_index: null,
      bible_version: curVersion,
    });
    setCurIdx(firstIdx);
  };

  const addSelectionToPlaylist = () => {
    if (!chapter || selected.size === 0 || !rangeRef) return;
    const idx = [...selected].sort((a, b) => a - b);
    const startVerse = idx[0] + 1;
    const endVerse = idx[idx.length - 1] + 1;
    const target = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0] ?? null;
    if (!target) {
      window.alert(t("bible.noPlaylist"));
      return;
    }
    const text = idx
      .map((i) => `${i + 1} ${chapter.verses[i] ?? ""}`)
      .filter((s) => s.trim())
      .join("\n\n");
    if (!text.trim()) return;
    savePlaylist({
      ...target,
      entries: [
        ...target.entries,
        {
          id: uid(),
          kind: "bible",
          ref_id: `${chapter.abbrev}|${chapter.chapter}|${startVerse}|${endVerse}|${curVersionMeta?.name ?? ""}`,
          title: rangeRef,
          text,
          estimated_duration_sec: 60,
        },
      ],
    });
    setActivePlaylistId(target.id);
  };

  const addRangeToPlaylist = (
    ch: BibleChapter,
    startVerse: number,
    endVerse: number,
  ) => {
    const text = Array.from(
      { length: Math.max(1, endVerse - startVerse + 1) },
      (_, k) => {
        const n = startVerse + k;
        const v = ch.verses[n - 1] ?? "";
        return `${n} ${v}`;
      },
    )
      .filter((s) => s.trim())
      .join("\n\n");
    if (!text.trim()) return;
    const reference = `${ch.name} ${ch.chapter}:${startVerse}${
      startVerse !== endVerse ? `-${endVerse}` : ""
    }`;
    const ref = `${ch.abbrev}|${ch.chapter}|${startVerse}|${endVerse}|${curVersionMeta?.name ?? ""}`;
    const target = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0] ?? null;
    if (!target) {
      window.alert(t("bible.noPlaylist"));
      return;
    }
    savePlaylist({
      ...target,
      entries: [
        ...target.entries,
        {
          id: uid(),
          kind: "bible",
          ref_id: ref,
          title: reference,
          text,
          estimated_duration_sec: 60,
        },
      ],
    });
    setActivePlaylistId(target.id);
  };

  const consumePendingAdd = (startVerse: number, endVerse: number) => {
    if (!pendingAddRef.current) return;
    const { start, end } = pendingAddRef.current;
    pendingAddRef.current = null;
    if (start === startVerse && end === endVerse && chapter) {
      addRangeToPlaylist(chapter, start, end);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      const text = await file.text();
      setPendingImport(text);
      setDraft("");
      setEditTarget({ type: "import" });
    } catch (err) {
      setImportMsg(`Lỗi đọc file: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  const selectVersion = async (id: string) => {
    const ref = live?.current?.bible_ref ?? null;
    setCurVersion(id);
    setSelectedAbbrev(null);
    setSelectedChapter(null);
    setChapter(null);
    setCurIdx(null);
    setQuery("");
    setResults(null);
    setAutoOn(false);
    if (ref) {
      const parts = ref.split("|");
      const abbrev = parts[0];
      const chNum = parseInt(parts[1], 10);
      const start = parseInt(parts[2], 10);
      const end = parseInt(parts[3], 10);
      if (!abbrev || !chNum) return;
      try {
        const ch = await api.getBibleChapterVersion(id, abbrev, chNum);
        setSelectedAbbrev(abbrev);
        setSelectedChapter(chNum);
        setChapter(ch);
        if (start > 0) {
          if (start === end) presentChapterVerse(ch, start - 1);
          else presentChapterRange(ch, start, end);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const removeVersion = async () => {
    const v = versions.find((x) => x.id === curVersion);
    if (!v || v.id === "online") return;
    const isDefault = v.id === "vie";
    if (
      !window.confirm(
        isDefault
          ? "Xóa bản dịch mặc định sẽ khôi phục dữ liệu gốc (mất các thay đổi đã chỉnh). Tiếp tục?"
          : `Xóa bản dịch "${v.name}"?`,
      )
    )
      return;
    try {
      await api.deleteBibleVersion(v.id);
      setVersions(await api.listBibleVersions());
      setImportMsg("");
      selectVersion("vie");
    } catch (err) {
      setImportMsg(`Lỗi xóa: ${err}`);
    }
  };

  const openEdit = (
    t:
      | { type: "version" }
      | { type: "book" }
      | { type: "verse"; abbrev: string; chapter: number; verse: number }
      | { type: "import" },
  ) => {
    if (t.type === "version") setDraft(curVersionMeta?.name ?? "");
    else if (t.type === "book") setDraft(selectedBook?.name ?? "");
    else if (t.type === "verse" && chapter) setDraft(chapter.verses[t.verse - 1] ?? "");
    else if (t.type === "import") setDraft("");
    setImportMsg("");
    setEditTarget(t);
  };

  const saveEdit = async () => {
    if (!editTarget || saving) return;
    setSaving(true);
    setImportMsg("");
    try {
      const t = editTarget;
      if (t.type === "version") {
        const v = await api.renameBibleVersion(curVersion, draft);
        setVersions((prev) => prev.map((x) => (x.id === v.id ? { ...x, name: v.name } : x)));
      } else if (t.type === "book") {
        if (!selectedBook) return;
        await api.editBibleBook(curVersion, selectedBook.abbrev, draft);
        setBooks((prev) =>
          prev.map((b) => (b.abbrev === selectedBook.abbrev ? { ...b, name: draft } : b)),
        );
        setChapter((prev) => (prev ? { ...prev, name: draft } : prev));
      } else if (t.type === "verse") {
        await api.editBibleVerse(curVersion, t.abbrev, t.chapter, t.verse, draft);
        setChapter((prev) =>
          prev
            ? {
                ...prev,
                verses: prev.verses.map((v, i) => (i === t.verse - 1 ? draft : v)),
              }
            : prev,
        );
      } else if (t.type === "import") {
        if (!pendingImport) return;
        const name = draft.trim() || undefined;
        const v = await api.importBibleXmlText(pendingImport, name);
        setVersions((prev) => [...prev.filter((x) => x.id !== v.id), v]);
        setCurVersion(v.id);
        setPendingImport(null);
        setEditTarget(null);
        setImportMsg(`Đã import: ${v.name} (${v.language || "?"})`);
        return;
      }
      setEditTarget(null);
      setImportMsg("Đã lưu.");
    } catch (err) {
      setImportMsg(`Lỗi: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const renderBrowseList = () => {
    let hitAbbrev: string | null = null;
    if (searchMode === "ref" && query.trim()) {
      const one = resolveBook(comp(query.trim()));
      if (one.length === 1) hitAbbrev = one[0].abbrev;
    }
    return (
      <div className="source-items">
        {books.map((b) => (
          <div
            key={b.abbrev}
            id={`bible-book-${b.abbrev}`}
            className={`source-item ${selectedAbbrev === b.abbrev ? "active" : ""}${hitAbbrev === b.abbrev ? " book-hit" : ""}`}
            onClick={() => selectBook(b.abbrev)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="list-title">{b.name}</div>
              <div className="list-sub">{b.chapters} {t("bible.chapters")}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderResults = () => (
    <div className="source-items">
      {(searching || results === null) && (
        <div className="empty-hint">{t("bible.searching")}</div>
      )}
      {!searching && results && results.length === 0 && (
        <div className="empty-hint">{t("bible.noResults")}</div>
      )}
      {!searching &&
        results?.map((h, i) => (
          <div key={i} className="source-item" onClick={() => openHit(h)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="list-title">{h.reference}</div>
              <div className="search-hit-text">{h.text}</div>
            </div>
          </div>
        ))}
    </div>
  );

  return (
    <div className="panel bible-panel" style={{ flexDirection: "row" }}>
      <div className="source-pane" style={{ width: 280 }}>
        <div className="panel-head">
          <h2>{t("bible.title")}</h2>
          <div className="bible-actions" ref={actionsRef}>
            <button
              className={`icon${actionsOpen ? " active" : ""}`}
              onClick={() => setActionsOpen((o) => !o)}
              title="Quản lý bản dịch Kinh Thánh"
            >
              <Icon name="plus" size={16} />
            </button>
            {actionsOpen && (
              <div className="bible-actions-menu">
                <button
                  onClick={() => {
                    setActionsOpen(false);
                    fileInputRef.current?.click();
                  }}
                  disabled={importing}
                  title="Nhập file XML (Zefania / OSIS)"
                >
                  {importing ? "Đang nhập…" : "Nhập"}
                </button>
                <button
                  onClick={() => {
                    setActionsOpen(false);
                    api.openUrl("https://biblelist.netlify.app/");
                  }}
                  title="Mở trang Bible List để tải file XML Kinh Thánh (Zefania / OSIS / Beblia)"
                >
                  Tải
                </button>
                {isEditable && (
                  <>
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        setEditMode((m) => !m);
                      }}
                      className={editMode ? "active" : ""}
                      title="Bật/tắt chỉnh sửa nội dung bản dịch"
                    >
                      {editMode ? "Thoát sửa" : "Sửa"}
                    </button>
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        openEdit({ type: "version" });
                      }}
                      title="Đổi tên bản dịch"
                    >
                      Đổi tên
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setActionsOpen(false);
                        removeVersion();
                      }}
                      title="Xóa bản dịch (bản mặc định: khôi phục dữ liệu gốc)"
                    >
                      Xóa
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="bible-versionbar">
          <label className="bible-version-label">Bản dịch Kinh Thánh</label>
          <select
            className="bible-version-select"
            value={curVersion}
            onChange={(e) => selectVersion(e.target.value)}
            title="Bản dịch Kinh Thánh"
          >
            <optgroup label="Bản dịch cài sẵn / Import">
              {versions
                .filter((v) => v.id !== "online")
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Trực tuyến">
              {versions
                .filter((v) => v.id === "online")
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <label className="bible-version-label">Mẫu</label>
          <select
            className="bible-version-select"
            value={curVersionMeta?.template_id ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              if (curVersion === "online") return;
              setVersions((prev) =>
                prev.map((v) => (v.id === curVersion ? { ...v, template_id: id ?? undefined } : v))
              );
              api
                .setBibleVersionTemplate(curVersion, id)
                .then((v) =>
                  setVersions((prev) =>
                    prev.map((p) => (p.id === v.id ? { ...p, template_id: v.template_id ?? null } : p))
                  )
                )
                .catch(() => {});
            }}
            title="Template chiếu Kinh Thánh cho bản dịch này"
          >
            <option value="">(Mặc định)</option>
            {templates
              .filter((tp) => !tp.category || tp.category === "bible" || tp.category === "other")
              .map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,text/xml"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </div>
        {importMsg && <div className="bible-versionmsg">{importMsg}</div>}
        {curVersion === "online" && (
          <div
            className="bible-online-note"
            onClick={() => api.openUrl("https://bible-api.com")}
            title="Mở trang bible-api.com"
          >
            Bản trực tuyến (KJV) từ bible-api.com — chọn sách/chương bên dưới, cần
            Internet để nạp câu. Bấm để mở bible-api.com
          </div>
        )}
        <div className="source-tabs">
          <button
            className={`source-tab ${leftTab === "books" ? "active" : ""}`}
            onClick={() => setLeftTab("books")}
          >
            <Icon name="bible" size={13} />
            {t("playlist.bibleBook")}
          </button>
          <button
            className={`source-tab ${leftTab === "chapters" ? "active" : ""}`}
            onClick={() => setLeftTab("chapters")}
            disabled={!selectedBook}
          >
            {t("playlist.bibleChapter")}
          </button>
        </div>
        {searchMode === "topic" && query.trim() ? (
          renderResults()
        ) : leftTab === "chapters" && selectedBook ? (
          <div className="source-items chapter-items">
            {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map(
              (n) => {
                let hit = false;
                if (searchMode === "ref" && query.trim()) {
                  const parsed = parseQuick(query);
                  if (parsed && parsed.abbrev === selectedBook.abbrev && parsed.chapter === n) {
                    hit = true;
                  }
                }
                return (
                  <div
                    key={n}
                    id={`bible-chapter-${n}`}
                    className={`source-item chapter-item${selectedChapter === n ? " active" : ""}${hit ? " book-hit" : ""}`}
                    onClick={() => {
                      setSelectedChapter(n);
                      setCurIdx(null);
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-title">{n}</div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        ) : (
          renderBrowseList()
        )}
      </div>

      <div className="panel" style={{ flex: 1, minWidth: 0 }}>
        {selectedBook && (
          <div className="panel-head">
            <h2>{selectedBook.name}</h2>
            <span className="bible-book-sub">{selectedBook.abbrev}</span>
            {editMode && (
              <button
                className="icon bible-editbtn"
                onClick={() => openEdit({ type: "book" })}
                title="Sửa tên sách"
              >
                ✎
              </button>
            )}
          </div>
        )}
        <div className="panel-body">
          <div className="bible-fixed">
          <div className="bible-ctrlbar">
                <div className="bc-searchbox">
                  <button
                    type="button"
                    className="bc-modebtn"
                    title={
                      searchMode === "ref"
                        ? t("bible.search")
                        : t("bible.searchTopic")
                    }
                    onClick={() =>
                      selectSearchMode(searchMode === "ref" ? "topic" : "ref")
                    }
                  >
                    <Icon name="search" size={18} />
                  </button>
                  <input
                    ref={quickInputRef}
                    type="text"
                    className="bc-quick"
                    placeholder={searchMode === "ref" ? t("bible.search") : t("bible.searchTopic")}
                    value={query}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applySearch();
                    }}
                  />
                </div>
                <button className="primary bc-btn" onClick={applySearch}>
                  {t("bible.quickGo")}
                </button>
                <input
                  type="number"
                  className="bc-sec"
                  min={0.1}
                  max={600}
                  step={0.1}
                  value={autoSec}
                  onChange={(e) =>
                    setAutoSec(
                      Math.max(0.1, Math.min(600, parseFloat(e.target.value || "1") || 1)),
                    )
                  }
                />
                <span className="bc-label">{t("bible.seconds")}</span>
                <button
                  className={`bc-btn bc-auto${autoOn ? " active" : ""}`}
                  onClick={toggleAuto}
                >
                  {autoOn ? t("bible.autoStop") : t("bible.autoPlay")}
                </button>
                <button
                  type="button"
                  className="bc-original-btn"
                  onClick={() => setShowInterlinear(true)}
                  title="Tra cứu nguyên ngữ Hebrew/Hy Lạp & Strong's"
                >
                  Tra cứu nguyên ngữ
                </button>
                <span className="bc-nav">
                  <button onClick={prevVerse} title="Câu trước">‹</button>
                  <span className="bc-pos">
                    {curIdx != null && curIdx >= 0 && chapter ? `${curIdx + 1} / ${verseCount()}` : "-"}
                  </span>
                  <button onClick={nextVerse} title="Câu sau">›</button>
                </span>
                {quickErr && <span className="bc-err">{quickErr}</span>}
              </div>
              </div>
              <div className="bible-scroll">
              {!selectedBook ? (
                <div className="empty-hint">{t("bible.selectHint")}</div>
              ) : chapter ? (
                <>
                  <div className="bible-verses">
                    {chapter.verses.map((text, i) =>
                      text ? (
                        <div
                          key={i}
                          id={`bible-v-${i + 1}`}
                          className={`bible-verse${selected.has(i) ? " sel" : ""}${curIdx === i ? " presenting" : ""}`}
                          draggable
                          onDragStart={(e) => dragVerse(e, chapter, i)}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              toggleSelect(i);
                              return;
                            }
                            if (selected.size === 0) {
                              goLiveVerse(i);
                              return;
                            }
                            if (clickTimer.current) {
                              window.clearTimeout(clickTimer.current);
                              clickTimer.current = null;
                            }
                            clickTimer.current = window.setTimeout(() => {
                              clickTimer.current = null;
                              setSelected(new Set());
                              goLiveVerse(i);
                            }, 250);
                          }}
                          onDoubleClick={() => {
                            if (clickTimer.current) {
                              window.clearTimeout(clickTimer.current);
                              clickTimer.current = null;
                            }
                            if (selected.size > 0) {
                              addSelectionToPlaylist();
                            } else {
                              goLiveVerse(i);
                            }
                          }}
                          title={t("bible.golive")}
                        >
                          <span className="bible-vno">{i + 1}</span>
                          <span className="bible-text">{text}</span>
                          {editMode && (
                            <button
                              className="icon bible-editbtn"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (chapter) {
                                  openEdit({
                                    type: "verse",
                                    abbrev: chapter.abbrev,
                                    chapter: chapter.chapter,
                                    verse: i + 1,
                                  });
                                }
                              }}
                              title="Sửa câu này"
                            >
                              ✎
                            </button>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                  {selected.size > 0 && rangeRef && (
                    <div className="bible-selbar">
                      <span>
                        {selected.size} {t("bible.versesSelected")} — {rangeRef}
                      </span>
                      <button className="primary" onClick={goLiveSelection}>
                        {t("bible.goLiveSelection")}
                      </button>
                      <button onClick={addSelectionToPlaylist} title={t("bible.addToPlaylist")}>
                        <Icon name="plus" size={14} />
                        {t("bible.addToPlaylist")}
                      </button>
                      <button onClick={() => setSelected(new Set())}>
                        {t("bible.clearSelection")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-hint">{t("bible.loading")}</div>
              )}
              </div>
            </div>
      </div>
      {editTarget && (
        <div className="bible-modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="bible-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editTarget.type === "verse"
                ? `Sửa câu ${chapter?.name ?? ""} ${editTarget.verse}`
                : editTarget.type === "book"
                  ? "Sửa tên sách"
                  : editTarget.type === "import"
                    ? "Nhập bản dịch"
                    : "Đổi tên bản dịch"}
            </h3>
            {editTarget.type === "verse" ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                autoFocus
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                }}
              />
            )}
            <div className="bible-modal-actions">
              <button className="primary" onClick={saveEdit} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
              <button onClick={() => setEditTarget(null)}>Hủy</button>
            </div>
            {importMsg && <div className="bc-err">{importMsg}</div>}
          </div>
        </div>
      )}
      {showInterlinear && (
        <BibleInterlinearModal
          onClose={() => setShowInterlinear(false)}
          initialAbbrev={selectedAbbrev ?? undefined}
          initialChapter={selectedChapter ?? undefined}
          initialVerse={curIdx != null ? curIdx + 1 : undefined}
        />
      )}
    </div>
  );
}
