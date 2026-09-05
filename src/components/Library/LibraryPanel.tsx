import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { api } from "../../lib/api";
import { audioEngine } from "../../lib/audioController";
import {
  defaultLive,
  presentBibleLive,
  songSlideLive,
} from "../../lib/live";
import type {
  AudioItem,
  BibleBookMeta,
  BibleChapter,
  BibleVersion,
  MediaItem,
  Song,
} from "../../lib/types";
import {
  DRAG_BIBLE,
  DRAG_MEDIA,
  DRAG_SONG,
  type EditorKind,
  type LibraryMode,
} from "../../lib/nav";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";
import SearchBox from "../SearchBox";

interface Props {
  mode: LibraryMode;
  onOpenEditor: (editor: EditorKind, songId?: string | null) => void;
}

function bibleVerseText(verses: string[], start: number, end: number): string {
  const lines: string[] = [];
  for (let k = start; k <= end; k++) {
    if (verses[k - 1]) lines.push(`${k} ${verses[k - 1]}`);
  }
  return lines.join("\n\n");
}

function SongLibrary({ onOpenEditor }: { onOpenEditor: Props["onOpenEditor"] }) {
  const t = useT();
  const songs = useAppStore((s) => s.songs);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const goLive = useAppStore((s) => s.goLive);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      q
        ? songs.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.artist.toLowerCase().includes(q),
          )
        : songs,
    [songs, q],
  );

  const present = (song: Song) => {
    goLive(
      songSlideLive(song, 0, song.title, live ?? defaultLive(settings), settings, templates),
    );
  };

  return (
    <div className="library-fill">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={t("songs.search")}
      />
      <div className="library-list">
        {visible.length === 0 && <div className="library-empty">{t("library.empty")}</div>}
        {visible.map((song) => (
          <div
            key={song.id}
            className="library-row"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_SONG, JSON.stringify({ songId: song.id }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => onOpenEditor("songs", song.id)}
            title={t("library.openSong")}
          >
            <div className="library-row-main">
              <div className="library-row-title">{song.title}</div>
              <div className="library-row-sub">{song.artist || t("library.noArtist")}</div>
            </div>
            <div className="library-row-actions">
              <button
                className="library-row-btn"
                title={t("library.present")}
                onClick={() => present(song)}
              >
                <Icon name="play" size={12} />
              </button>
              <button
                className="library-row-btn"
                title={t("library.edit")}
                onClick={() => onOpenEditor("songs", song.id)}
              >
                <Icon name="layout" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BibleLibrary({ onOpenEditor }: { onOpenEditor: Props["onOpenEditor"] }) {
  const t = useT();
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const goLive = useAppStore((s) => s.goLive);
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [curVersion, setCurVersion] = useState<string>("");
  const [books, setBooks] = useState<BibleBookMeta[]>([]);
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState<BibleChapter | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  useEffect(() => {
    api
      .listBibleVersions()
      .then((vs) => {
        setVersions(vs);
        if (vs.length) setCurVersion(vs[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!curVersion) return;
    setOpenBook(null);
    setChapter(null);
    api
      .getBibleBooksVersion(curVersion)
      .then(setBooks)
      .catch(() => setBooks([]));
  }, [curVersion]);

  const versionMeta = versions.find((v) => v.id === curVersion);

  const openChapter = async (book: BibleBookMeta, num: number) => {
    setChapter(null);
    setLoadingChapter(true);
    try {
      const ch = await api.getBibleChapterVersion(curVersion, book.abbrev, num);
      setChapter(ch);
      setOpenBook(book.abbrev);
    } catch {
      setChapter(null);
    } finally {
      setLoadingChapter(false);
    }
  };

  const present = (ch: BibleChapter, verseIndex: number) => {
    const text = ch.verses[verseIndex];
    if (!text) return;
    const verseNum = verseIndex + 1;
    goLive(
      presentBibleLive(live, settings, templates, {
        version: curVersion,
        versionName: versionMeta?.name ?? "",
        abbrev: ch.abbrev,
        name: ch.name,
        chapter: ch.chapter,
        verseStart: verseNum,
        verseEnd: verseNum,
        text: `${verseNum} ${text}`,
        templateId: versionMeta?.template_id,
      }),
    );
  };

  const visibleBooks = q
    ? books.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.short.toLowerCase().includes(q),
      )
    : books;

  const dragVerse = (
    e: React.DragEvent,
    ch: BibleChapter,
    verseIndex: number,
  ) => {
    const text = ch.verses[verseIndex];
    if (!text) return;
    e.dataTransfer.setData(
      DRAG_BIBLE,
      JSON.stringify({
        version: curVersion,
        versionName: versionMeta?.name ?? "",
        abbrev: ch.abbrev,
        name: ch.name,
        chapter: ch.chapter,
        verseStart: verseIndex + 1,
        verseEnd: verseIndex + 1,
        text: `${verseIndex + 1} ${text}`,
        templateId: versionMeta?.template_id,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="library-fill">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={t("library.bibleSearch")}
      />
      <div className="library-versionbar">
        <select value={curVersion} onChange={(e) => setCurVersion(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          className="library-row-btn"
          title={t("library.openBible")}
          onClick={() => onOpenEditor("bible")}
        >
          <Icon name="bible" size={13} />
        </button>
      </div>
      <div className="library-list">
        {visibleBooks.map((book) => (
          <div key={book.abbrev} className="library-bible-book">
            <div
              className={`library-row${openBook === book.abbrev ? " open" : ""}`}
              onClick={() =>
                setOpenBook(openBook === book.abbrev ? null : book.abbrev)
              }
            >
              <span className="library-row-title">{book.name}</span>
              <span className="library-row-sub">{book.chapters} ch</span>
            </div>
            {openBook === book.abbrev && (
              <div className="library-chapters">
                {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={
                      chapter?.abbrev === book.abbrev && chapter.chapter === n
                        ? "active"
                        : ""
                    }
                    onClick={() => openChapter(book, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {visibleBooks.length === 0 && (
          <div className="library-empty">{t("library.empty")}</div>
        )}
      </div>
      {loadingChapter && <div className="library-loading">{t("library.loading")}</div>}
      {chapter && (
        <div className="library-bible-verses">
          <div className="library-bible-chapter-name">
            {chapter.name} {chapter.chapter}
          </div>
          <div className="library-bible-chapter">
            {chapter.verses.map((v, i) =>
              v ? (
                <div
                  key={i}
                  className="library-verse"
                  draggable
                  onDragStart={(e) => dragVerse(e, chapter, i)}
                  onClick={() => present(chapter, i)}
                  title={t("library.present")}
                >
                  <span className="library-verse-no">{i + 1}</span>
                  <span className="library-verse-text">{v}</span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaLibraryView({ onOpenEditor }: { onOpenEditor: Props["onOpenEditor"] }) {
  const t = useT();
  const media = useAppStore((s) => s.media);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const goLive = useAppStore((s) => s.goLive);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const visible = q ? media.filter((m) => m.name.toLowerCase().includes(q)) : media;

  const present = (item: MediaItem) => {
    const base = live ?? defaultLive(settings);
    goLive({
      ...base,
      current: {
        kind: "media",
        title: item.name,
        media_path: item.file_path,
        background: item.file_path,
      },
      next_text: null,
      next_label: null,
      background: item.file_path,
      media_playing: true,
      playlist_id: null,
      playlist_entry_index: null,
    });
  };

  const isVideo = (item: MediaItem) =>
    /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(item.file_path);

  return (
    <div className="library-fill">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={t("library.mediaSearch")}
      />
      <div className="library-media-grid">
        {visible.map((item) => (
          <div
            key={item.id}
            className="library-media-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MEDIA, item.file_path);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => present(item)}
            title={t("library.present")}
          >
            {isVideo(item) ? (
              <video src={api.mediaUrl(item.file_path)} muted preload="metadata" />
            ) : (
              <img src={api.mediaUrl(item.file_path)} alt="" loading="lazy" />
            )}
            <div className="library-media-name">{item.name}</div>
          </div>
        ))}
        {visible.length === 0 && <div className="library-empty">{t("library.empty")}</div>}
      </div>
    </div>
  );
}

function AudioLibraryView({ onOpenEditor }: { onOpenEditor: Props["onOpenEditor"] }) {
  const t = useT();
  const audio = useAppStore((s) => s.audio);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const goLive = useAppStore((s) => s.goLive);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const visible = q ? audio.filter((a) => a.name.toLowerCase().includes(q)) : audio;

  const play = (item: AudioItem) => {
    const base = live ?? defaultLive(settings);
    const volume = live?.audio?.volume ?? 1;
    audioEngine.loadAndPlay(
      [{ id: item.id, title: item.name, file_path: item.file_path }],
      { play: true, source: "live", volume },
    );
    goLive({
      ...base,
      audio: {
        id: item.id,
        file_path: item.file_path,
        title: item.name,
        playing: true,
        volume,
      },
    });
  };

  return (
    <div className="library-fill">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={t("library.audioSearch")}
      />
      <div className="library-list">
        {visible.map((item) => (
          <div
            key={item.id}
            className="library-row"
            onClick={() => play(item)}
            title={t("library.playAudio")}
          >
            <div className="library-row-main">
              <div className="library-row-title">{item.name}</div>
            </div>
            <div className="library-row-actions">
              <button className="library-row-btn" title={t("library.playAudio")}>
                <Icon name="play" size={12} />
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="library-empty">{t("library.empty")}</div>}
      </div>
    </div>
  );
}

export default function LibraryPanel({ mode, onOpenEditor }: Props) {
  const t = useT();
  const modeMeta: Record<LibraryMode, { icon: IconName; color: string }> = {
    songs: { icon: "music", color: "#c084fc" },
    bible: { icon: "bible", color: "#5b9dff" },
    media: { icon: "image", color: "#34d399" },
    audio: { icon: "audio", color: "#fbbf24" },
  };
  const meta = modeMeta[mode];
  return (
    <div className="library-panel">
      <div className="library-panel-head">
        <span className="library-panel-title">
          <Icon name={meta.icon} size={15} color={meta.color} />
          {mode === "songs"
            ? t("tab.songs")
            : mode === "bible"
              ? t("tab.bible")
              : mode === "media"
                ? t("tab.media")
                : t("tab.audio")}
        </span>
      </div>
      <div className="library-panel-body">
        {mode === "songs" && <SongLibrary onOpenEditor={onOpenEditor} />}
        {mode === "bible" && <BibleLibrary onOpenEditor={onOpenEditor} />}
        {mode === "media" && <MediaLibraryView onOpenEditor={onOpenEditor} />}
        {mode === "audio" && <AudioLibraryView onOpenEditor={onOpenEditor} />}
      </div>
    </div>
  );
}