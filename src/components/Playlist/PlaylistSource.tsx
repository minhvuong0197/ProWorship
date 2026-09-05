import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { BibleBookMeta, BibleChapter, BibleVersion, Song } from "../../lib/types";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";

interface Props {
  songs: Song[];
  onAddSong: (songId: string) => void;
  onAddBible: (ref: string, title: string, text: string) => void;
}

export default function PlaylistSource({ songs, onAddSong, onAddBible }: Props) {
  const t = useT();
  const [tab, setTab] = useState<"songs" | "bible">("songs");

  return (
    <div className="source-pane">
      <div className="source-tabs">
        <button
          className={`source-tab ${tab === "songs" ? "active" : ""}`}
          onClick={() => setTab("songs")}
        >
          <Icon name="music" size={13} color="#c084fc" />
          {t("playlist.sourceSongs")}
        </button>
        <button
          className={`source-tab ${tab === "bible" ? "active" : ""}`}
          onClick={() => setTab("bible")}
        >
          <Icon name="bible" size={13} color="#5b9dff" />
          {t("playlist.sourceBible")}
        </button>
      </div>

      {tab === "songs" ? (
        <div className="source-items">
          {songs.length === 0 && <div className="empty-hint">{t("songs.empty")}</div>}
          {songs.map((song) => (
            <div
              key={song.id}
              className="source-item"
              onClick={() => onAddSong(song.id)}
              title={t("playlist.addSong")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title">{song.title || t("songs.noTitle")}</div>
                <div className="list-sub">
                  {song.artist || "—"} · {song.slides.length} {t("songs.slideCount")}
                </div>
              </div>
              <Icon name="plus" size={14} className="source-add" />
            </div>
          ))}
        </div>
      ) : (
        <BibleSource onAddBible={onAddBible} />
      )}
    </div>
  );
}

function BibleSource({ onAddBible }: { onAddBible: Props["onAddBible"] }) {
  const t = useT();
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [version, setVersion] = useState("vie");
  const [books, setBooks] = useState<BibleBookMeta[]>([]);
  const [abbrev, setAbbrev] = useState("");
  const [chapterNum, setChapterNum] = useState(1);
  const [chapter, setChapter] = useState<BibleChapter | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.listBibleVersions().then(setVersions).catch(console.error);
  }, []);

  useEffect(() => {
    if (!version) return;
    api.getBibleBooksVersion(version).then((b) => {
      setBooks(b);
      if (b.length) {
        setAbbrev((prev) => (b.some((x) => x.abbrev === prev) ? prev : b[0].abbrev));
      }
    });
  }, [version]);

  useEffect(() => {
    if (!version || !abbrev) return;
    setSelected(new Set());
    api
      .getBibleChapterVersion(version, abbrev, chapterNum)
      .then(setChapter)
      .catch(() => setChapter(null));
  }, [version, abbrev, chapterNum]);

  const book = books.find((b) => b.abbrev === abbrev) ?? null;
  const chapterCount = book?.chapters ?? 1;

  const toggleVerse = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const addSelection = () => {
    if (!chapter || selected.size === 0) return;
    const idx = [...selected].sort((a, b) => a - b);
    const text = idx
      .map((i) => `${i + 1} ${chapter.verses[i] ?? ""}`)
      .filter((s) => s.trim())
      .join("\n\n");
    const vs = idx.map((i) => i + 1);
    const first = vs[0];
    const last = vs[vs.length - 1];
    const title = `${chapter.name} ${chapter.chapter}:${first}${first !== last ? `-${last}` : ""}`;
    const ref = `${chapter.abbrev}|${chapter.chapter}|${first}|${last}|${version}`;
    onAddBible(ref, title, text);
    setSelected(new Set());
  };

  return (
    <div className="bible-source">
      <div className="field">
        <label>{t("playlist.bibleVersion")}</label>
        <select value={version} onChange={(e) => setVersion(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>{t("playlist.bibleBook")}</label>
          <select
            value={abbrev}
            onChange={(e) => {
              setAbbrev(e.target.value);
              setChapterNum(1);
            }}
          >
            {books.map((b) => (
              <option key={b.abbrev} value={b.abbrev}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>{t("playlist.bibleChapter")}</label>
          <select
            value={chapterNum}
            onChange={(e) => setChapterNum(Number(e.target.value))}
          >
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bible-source-verses">
        {chapter?.verses.map((verse, i) => (
          <div
            key={i}
            className={`bible-source-verse ${selected.has(i) ? "active" : ""}`}
            onClick={() => toggleVerse(i)}
          >
            <span className="bible-source-verse-num">{i + 1}</span>
            <span>{verse}</span>
          </div>
        ))}
      </div>

      <button
        className="primary source-add-bible"
        disabled={selected.size === 0}
        onClick={addSelection}
      >
        <Icon name="plus" size={14} />
        {t("playlist.addBibleSelection", { n: selected.size })}
      </button>
    </div>
  );
}
