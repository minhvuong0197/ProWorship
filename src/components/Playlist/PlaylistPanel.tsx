import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, WheelEvent } from "react";
import type { LiveSlide, LiveState, Playlist, PlaylistEntry, Song } from "../../lib/types";
import { uid } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { defaultLive, resolveBibleStyle, songSlideLive } from "../../lib/live";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import SearchBox from "../SearchBox";
import PreviewSlide from "../LivePreview/PreviewSlide";
import PlaylistSource from "./PlaylistSource";

const DEFAULT_EST: Record<PlaylistEntry["kind"], number> = {
  song: 300,
  media: 60,
  audio: 300,
  blank: 10,
  bible: 300,
};

function newPlaylist(): Playlist {
  return {
    id: uid(),
    name: "Playlist mới",
    entries: [],
    created_at: 0,
    updated_at: 0,
  };
}

function totalDuration(entries: PlaylistEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + (e.estimated_duration_sec ?? DEFAULT_EST[e.kind]),
    0,
  );
}

export default function PlaylistPanel() {
  const t = useT();
  const playlists = useAppStore((s) => s.playlists);
  const songs = useAppStore((s) => s.songs);
  const media = useAppStore((s) => s.media);
  const audio = useAppStore((s) => s.audio);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const savePlaylist = useAppStore((s) => s.savePlaylist);
  const deletePlaylist = useAppStore((s) => s.deletePlaylist);
  const goLive = useAppStore((s) => s.goLive);
  const activePlaylistId = useAppStore((s) => s.activePlaylistId);
  const setActivePlaylistId = useAppStore((s) => s.setActivePlaylistId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mediaToAdd, setMediaToAdd] = useState("");
  const [audioToAdd, setAudioToAdd] = useState("");
  const [nameInput, setNameInput] = useState("");
  const nameTimer = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const gridRef = useRef<HTMLDivElement | null>(null);

  const selected = playlists.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (activePlaylistId && playlists.some((p) => p.id === activePlaylistId)) {
      setSelectedId(activePlaylistId);
    } else if (!selectedId && playlists.length) {
      setSelectedId(playlists[0].id);
      setActivePlaylistId(playlists[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylistId, playlists]);

  useEffect(() => {
    setNameInput(selected?.name ?? "");
  }, [selected?.id]);

  useEffect(() => {
    return () => {
      if (nameTimer.current) window.clearTimeout(nameTimer.current);
    };
  }, []);

  const mutate = (fn: (p: Playlist) => Playlist) => {
    if (!selected) return;
    savePlaylist(fn(JSON.parse(JSON.stringify(selected))));
  };

  const createPlaylist = () => {
    const p = newPlaylist();
    setSelectedId(p.id);
    setActivePlaylistId(p.id);
    savePlaylist(p);
  };

  const removePlaylist = (p: Playlist) => {
    if (!window.confirm(`${t("playlist.deletePlaylist")} "${p.name}"?`)) return;
    if (selectedId === p.id) setSelectedId(null);
    if (activePlaylistId === p.id) setActivePlaylistId(null);
    deletePlaylist(p.id);
  };

  const updateName = (value: string) => {
    setNameInput(value);
    if (nameTimer.current) window.clearTimeout(nameTimer.current);
    nameTimer.current = window.setTimeout(() => {
      mutate((p) => ({ ...p, name: value }));
    }, 350);
  };

  const addMediaEntry = () => {
    const m = media.find((x) => x.id === mediaToAdd);
    if (!m) return;
    mutate((p) => ({
      ...p,
      entries: [
        ...p.entries,
        {
          id: uid(),
          kind: "media" as const,
          ref_id: m.id,
          title: m.name,
          estimated_duration_sec: DEFAULT_EST.media,
        },
      ],
    }));
  };

  const addAudioEntry = () => {
    const a = audio.find((x) => x.id === audioToAdd);
    if (!a) return;
    mutate((p) => ({
      ...p,
      entries: [
        ...p.entries,
        {
          id: uid(),
          kind: "audio" as const,
          ref_id: a.id,
          title: a.name,
          estimated_duration_sec: DEFAULT_EST.audio,
        },
      ],
    }));
  };

  const addBlank = () => {
    mutate((p) => ({
      ...p,
      entries: [
        ...p.entries,
        {
          id: uid(),
          kind: "blank" as const,
          ref_id: "",
          title: "Slide đen",
          estimated_duration_sec: DEFAULT_EST.blank,
        },
      ],
    }));
  };

  const removeEntry = (entryId: string) => {
    mutate((p) => ({ ...p, entries: p.entries.filter((e) => e.id !== entryId) }));
  };

  const moveEntry = (index: number, dir: -1 | 1) => {
    mutate((p) => {
      const entries = [...p.entries];
      const target = index + dir;
      if (target < 0 || target >= entries.length) return p;
      [entries[index], entries[target]] = [entries[target], entries[index]];
      return { ...p, entries };
    });
  };

  const patchEntry = (entryId: string, patch: Partial<PlaylistEntry>) => {
    mutate((p) => ({
      ...p,
      entries: p.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    }));
  };

  const withPlaylistContext = (idx: number): LiveState => ({
    ...(live ?? defaultLive(settings)),
    playlist_id: selected?.id ?? null,
    playlist_entry_index: idx,
  });

  const goLiveEntry = (entry: PlaylistEntry, index: number) => {
    const base = withPlaylistContext(index);
    if (entry.kind === "blank") {
      goLive({
        ...base,
        current: {
          kind: "blank",
          title: "Slide đen",
          background: base.background ?? undefined,
        },
      });
      return;
    }
    if (entry.kind === "media") {
      const m = media.find((x) => x.id === entry.ref_id);
      goLive({
        ...base,
        current: {
          kind: "media",
          title: m?.name ?? entry.title,
          media_path: m?.file_path,
          background: m?.file_path,
        },
        background: m?.file_path ?? null,
        media_playing: true,
      });
      return;
    }
    if (entry.kind === "audio") {
      const a = audio.find((x) => x.id === entry.ref_id);
      goLive({
        ...base,
        audio: {
          id: a?.id ?? entry.ref_id,
          file_path: a?.file_path ?? "",
          title: a?.name ?? entry.title,
          playing: true,
          volume: live?.audio?.volume ?? 1,
        },
      });
      return;
    }
    if (entry.kind === "bible") {
      goLive({
        ...base,
        current: {
          kind: "song",
          title: entry.title,
          label: entry.title,
          text: entry.text ?? "",
          background: base.background ?? undefined,
          ...resolveBibleStyle(settings, templates, null),
          bible_ref: entry.ref_id,
        },
        next_text: null,
        next_label: null,
        media_playing: false,
        bible_version: entry.ref_id.split("|")[4] || undefined,
      });
      return;
    }
    const song = songs.find((x) => x.id === entry.ref_id);
    goLiveSongSlide(song ?? null, 0, entry.title, index, entry.arrangement_id ?? null);
  };

  const goLiveSongSlide = (
    song: Song | null,
    index: number,
    fallbackTitle: string,
    entryIndex?: number,
    arrangementId?: string | null,
  ) => {
    const base =
      entryIndex != null
        ? withPlaylistContext(entryIndex)
        : { ...(live ?? defaultLive(settings)) };
    goLive(
      songSlideLive(song, index, fallbackTitle, base, settings, templates, arrangementId),
    );
  };

  const liveEntryIndex =
    live && selected && live.playlist_id === selected.id
      ? live.playlist_entry_index
      : null;

  const q = search.trim().toLowerCase();
  const visibleEntries = selected
    ? q.length > 0
      ? selected.entries
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.title.toLowerCase().includes(q))
      : selected.entries.map((e, i) => ({ e, i }))
    : [];

  useEffect(() => {
    if (viewMode !== "grid" || liveEntryIndex == null) return;
    const grid = gridRef.current;
    if (!grid) return;
    const item = grid.querySelector<HTMLElement>(`[data-entry="${liveEntryIndex}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [liveEntryIndex, viewMode]);

  const handleGridWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(1.8, Math.max(0.4, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const entryThumb = (entry: PlaylistEntry, index: number): ReactNode => {
    if (entry.kind === "song") {
      const song = songs.find((s) => s.id === entry.ref_id);
      if (!song) return null;
      const isThis = liveEntryIndex === index;
      const idx = isThis && live?.song_slide_index != null ? live.song_slide_index : 0;
      const base = withPlaylistContext(index);
      const slide = songSlideLive(song, idx, entry.title, base, settings, templates, entry.arrangement_id ?? null).current;
      return <PreviewSlide slide={slide} />;
    }
    if (entry.kind === "media") {
      const m = media.find((x) => x.id === entry.ref_id);
      const slide: LiveSlide = {
        kind: "media",
        title: m?.name ?? entry.title,
        media_path: m?.file_path,
        background: m?.file_path,
      };
      return <PreviewSlide slide={slide} />;
    }
    if (entry.kind === "bible") {
      const slide: LiveSlide = {
        kind: "song",
        title: entry.title,
        label: entry.title,
        text: entry.text ?? "",
        background: baseBackground(),
        ...resolveBibleStyle(settings, templates, null),
        bible_ref: entry.ref_id,
      };
      return <PreviewSlide slide={slide} />;
    }
    if (entry.kind === "audio") {
      const a = audio.find((x) => x.id === entry.ref_id);
      return (
        <div className="playlist-thumb-audio">
          <Icon name="music" size={40} />
          <span>{a?.name ?? entry.title}</span>
        </div>
      );
    }
    return <div className="playlist-thumb-blank" />;
  };

  const baseBackground = () =>
    live?.background ?? undefined;

  const totalMin = Math.ceil(totalDuration(selected?.entries ?? []) / 60);

  return (
    <div className="panel" style={{ flexDirection: "row" }}>
      <PlaylistSource
        songs={songs}
        onAddSong={(songId) => {
          const song = songs.find((s) => s.id === songId);
          if (!song) return;
          const entry: PlaylistEntry = {
            id: uid(),
            kind: "song",
            ref_id: song.id,
            title: song.title,
            estimated_duration_sec: DEFAULT_EST.song,
            arrangement_id: null,
          };
          if (!selected) {
            const p = newPlaylist();
            p.entries.push(entry);
            setSelectedId(p.id);
            setActivePlaylistId(p.id);
            savePlaylist(p);
            return;
          }
          mutate((p) => ({ ...p, entries: [...p.entries, entry] }));
        }}
        onAddBible={(ref, title, text) => {
          if (!selected) {
            const p = newPlaylist();
            p.entries.push({
              id: uid(),
              kind: "bible",
              ref_id: ref,
              title,
              text,
              estimated_duration_sec: DEFAULT_EST.blank,
            });
            setSelectedId(p.id);
            setActivePlaylistId(p.id);
            savePlaylist(p);
            return;
          }
          mutate((p) => ({
            ...p,
            entries: [
              ...p.entries,
              {
                id: uid(),
                kind: "bible" as const,
                ref_id: ref,
                title,
                text,
                estimated_duration_sec: DEFAULT_EST.blank,
              },
            ],
          }));
        }}
      />

      <div className="panel" style={{ flex: 1, minWidth: 0 }}>
        <div className="project-select-bar">
          <div className="panel-head" style={{ padding: 0, borderBottom: "none" }}>
            <h2 style={{ fontSize: 14 }}>{t("playlist.title")}</h2>
            <select
              className="project-select"
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value || null);
                if (e.target.value) setActivePlaylistId(e.target.value);
              }}
            >
              <option value="">{t("playlist.selectHint")}</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t("playlist.search")}
            />
            <button className="primary" onClick={createPlaylist} title={t("playlist.add")}>
              <Icon name="plus" size={14} />
            </button>
            {selected && (
              <button
                className="icon danger"
                onClick={() => removePlaylist(selected)}
                title={t("playlist.deletePlaylist")}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        </div>

        {!selected ? (
          <div className="empty-hint">{t("playlist.selectHint")}</div>
        ) : (
          <div className="panel-body">
            <div className="field">
              <label>{t("playlist.name")}</label>
              <input
                value={nameInput}
                onChange={(e) => updateName(e.target.value)}
              />
            </div>

            {selected.entries.length > 0 && (
              <div className="timeline-total">
                {t("playlist.timelineTotal", { m: totalMin })}
              </div>
            )}

            <div className="add-bar">
              <select value={mediaToAdd} onChange={(e) => setMediaToAdd(e.target.value)}>
                <option value="">{t("playlist.mediaSelect")}</option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button onClick={addMediaEntry}>{t("playlist.addMedia")}</button>

              <select value={audioToAdd} onChange={(e) => setAudioToAdd(e.target.value)}>
                <option value="">{t("playlist.audioSelect")}</option>
                {audio.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button onClick={addAudioEntry}>{t("playlist.addAudio")}</button>

              <button onClick={addBlank}>{t("playlist.blank")}</button>
            </div>

            <div className="playlist-viewbar">
              <div className="view-toggle" role="group" aria-label="Xem">
                <button
                  className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title={t("playlist.gridView")}
                >
                  <Icon name="grid" size={14} />
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title={t("playlist.listView")}
                >
                  <Icon name="list" size={14} />
                </button>
              </div>
              <span className="viewbar-hint">{t("playlist.zoomHint")}</span>
            </div>

            {viewMode === "grid" ? (
              <div
                className="playlist-grid"
                ref={gridRef}
                onWheel={handleGridWheel}
                style={{ "--thumb-scale": zoom } as CSSProperties}
              >
                {visibleEntries.length === 0 ? (
                  <div className="empty-hint">{t("playlist.searchNone")}</div>
                ) : (
                visibleEntries.map(({ e: entry, i: index }) => (
                  <div
                    key={entry.id}
                    className={`playlist-grid-item ${liveEntryIndex === index ? "live" : ""}`}
                    data-entry={index}
                    onClick={() => goLiveEntry(entry, index)}
                  >
                    <div className="playlist-grid-thumb">
                      {entryThumb(entry, index)}
                      <button
                        className="playlist-grid-delete"
                        title="✕"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEntry(entry.id);
                        }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                    <div className="playlist-grid-footer">
                      <span className="playlist-grid-index">{index + 1}</span>
                      <span className="playlist-grid-title" title={entry.title}>
                        {entry.title}
                      </span>
                      {liveEntryIndex === index && (
                        <span className="playlist-grid-live">
                          <Icon name="play" size={11} />
                        </span>
                      )}
                    </div>
                  </div>
                ))
                )}
                {visibleEntries.length === 0 && selected.entries.length === 0 && (
                  <div className="empty-hint">{t("playlist.emptyEntries")}</div>
                )}
              </div>
            ) : (
            <div className="playlist-entries">
              {visibleEntries.length === 0 ? (
                <div className="empty-hint">{t("playlist.searchNone")}</div>
              ) : (
              visibleEntries.map(({ e: entry, i: index }) => {
                const song =
                  entry.kind === "song"
                    ? songs.find((s) => s.id === entry.ref_id)
                    : undefined;
                const badge =
                  entry.kind === "song"
                    ? t("playlist.badgeSong")
                    : entry.kind === "media"
                      ? t("playlist.badgeMedia")
                      : entry.kind === "audio"
                        ? t("playlist.badgeAudio")
                        : entry.kind === "bible"
                          ? t("playlist.badgeBible")
                          : t("playlist.badgeBlank");
                return (
                  <div key={entry.id}>
                    <div
                      className={`entry-row ${expanded === entry.id ? "selected" : ""}`}
                    >
                      <span className={`entry-badge ${entry.kind}`}>{badge}</span>
                      <div className="entry-title" title={entry.title}>
                        {entry.title}
                      </div>
                      <span className="entry-duration">
                        {entry.estimated_duration_sec != null
                          ? Math.ceil(entry.estimated_duration_sec / 60)
                          : "–"}
                      </span>
                      <button className="icon primary" onClick={() => goLiveEntry(entry, index)} title={t("playlist.play")}>
                        <Icon name="play" size={15} />
                      </button>
                      {entry.kind === "song" && song && (
                        <button
                          className="icon"
                          title={t("playlist.viewSlides")}
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          {expanded === entry.id ? "−" : "+"}
                        </button>
                      )}
                      <button
                        className="icon"
                        disabled={index === 0}
                        onClick={() => moveEntry(index, -1)}
                        title="↑"
                      >
                        <Icon name="chevronUp" size={15} />
                      </button>
                      <button
                        className="icon"
                        disabled={index === selected.entries.length - 1}
                        onClick={() => moveEntry(index, 1)}
                        title="↓"
                      >
                        <Icon name="chevronDown" size={15} />
                      </button>
                      <button
                        className="icon danger"
                        title="✕"
                        onClick={() => removeEntry(entry.id)}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </div>

                    {expanded === entry.id && (
                      <div className="entry-options">
                        <label>
                          <span>{t("playlist.estimated")}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={
                              entry.estimated_duration_sec != null
                                ? Math.ceil(entry.estimated_duration_sec / 60)
                                : ""
                            }
                            placeholder="–"
                            onChange={(e) => {
                              const v = e.target.value;
                              patchEntry(entry.id, {
                                estimated_duration_sec:
                                  v === "" ? null : Math.max(0, Number(v)) * 60,
                              });
                            }}
                          />
                        </label>
                        {song && (
                          <label>
                            <span>{t("playlist.arrangement")}</span>
                            <select
                              value={entry.arrangement_id ?? ""}
                              onChange={(e) =>
                                patchEntry(entry.id, {
                                  arrangement_id: e.target.value || null,
                                })
                              }
                            >
                              <option value="">
                                {t("playlist.arrangementDefault")}
                              </option>
                              {(song.arrangements ?? []).map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}

                    {expanded === entry.id && song && (
                      <div className="entry-slides">
                        {song.slides.map((slide, i) => (
                          <div key={slide.id} className="slide-chip-row">
                            <span className="slide-chip-label">
                              {slide.label || `${i + 1}`}
                            </span>
                            <span className="slide-chip-preview">
                              {slide.text.split("\n")[0]}
                            </span>
                            <button
                              className="icon primary"
                              onClick={() =>
                                goLiveSongSlide(
                                  song,
                                  i,
                                  entry.title,
                                  index,
                                  entry.arrangement_id ?? null,
                                )
                              }
                              title={t("playlist.play")}
                            >
                              <Icon name="play" size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
