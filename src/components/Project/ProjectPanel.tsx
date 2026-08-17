import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import { useAppStore } from "../../store/useAppStore";
import type { Playlist, PlaylistEntry } from "../../lib/types";
import { uid } from "../../lib/types";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";
import { DRAG_BIBLE, DRAG_MEDIA, DRAG_SONG } from "../../lib/nav";

const DEFAULT_EST: Record<PlaylistEntry["kind"], number> = {
  song: 300,
  media: 60,
  audio: 300,
  blank: 10,
  bible: 300,
};

const KIND_ICON: Record<PlaylistEntry["kind"], IconName> = {
  song: "music",
  media: "film",
  audio: "audio",
  blank: "x",
  bible: "book",
};

function newPlaylist(name: string): Playlist {
  return {
    id: uid(),
    name,
    entries: [],
    created_at: 0,
    updated_at: 0,
  };
}

interface Props {
  onSelectShow: () => void;
}

export default function ProjectPanel({ onSelectShow }: Props) {
  const t = useT();
  const playlists = useAppStore((s) => s.playlists);
  const songs = useAppStore((s) => s.songs);
  const media = useAppStore((s) => s.media);
  const live = useAppStore((s) => s.live);
  const savePlaylist = useAppStore((s) => s.savePlaylist);
  const deletePlaylist = useAppStore((s) => s.deletePlaylist);
  const gotoPlaylistEntry = useAppStore((s) => s.gotoPlaylistEntry);
  const activePlaylistId = useAppStore((s) => s.activePlaylistId);
  const setActivePlaylistId = useAppStore((s) => s.setActivePlaylistId);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dropOver, setDropOver] = useState<string | null>(null);

  useEffect(() => {
    if (activePlaylistId && !expanded[activePlaylistId]) {
      setExpanded((prev) => ({ ...prev, [activePlaylistId]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylistId]);

  const toggleProject = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const createProject = () => {
    const p = newPlaylist(t("project.newProject"));
    savePlaylist(p);
    setActivePlaylistId(p.id);
    setExpanded((prev) => ({ ...prev, [p.id]: true }));
  };

  const removeProject = (p: Playlist) => {
    if (!window.confirm(`${t("playlist.deletePlaylist")} "${p.name}"?`)) return;
    if (activePlaylistId === p.id) setActivePlaylistId(null);
    deletePlaylist(p.id);
  };

  const appendEntry = (playlist: Playlist, entry: PlaylistEntry) => {
    savePlaylist({ ...playlist, entries: [...playlist.entries, entry] });
  };

  const handleDrop = (e: DragEvent, playlist: Playlist) => {
    e.preventDefault();
    setDropOver(null);
    const songRaw = e.dataTransfer.getData(DRAG_SONG);
    if (songRaw) {
      try {
        const { songId } = JSON.parse(songRaw) as { songId: string };
        const song = songs.find((s) => s.id === songId);
        if (song) {
          appendEntry(playlist, {
            id: uid(),
            kind: "song",
            ref_id: song.id,
            title: song.title,
            estimated_duration_sec: DEFAULT_EST.song,
            arrangement_id: null,
          });
        }
      } catch {
        /* ignore malformed payload */
      }
      return;
    }
    const bibleRaw = e.dataTransfer.getData(DRAG_BIBLE);
    if (bibleRaw) {
      try {
        const d = JSON.parse(bibleRaw) as {
          version: string;
          abbrev: string;
          name: string;
          chapter: number;
          verseStart: number;
          verseEnd: number;
          text: string;
        };
        const ref = `${d.abbrev}|${d.chapter}|${d.verseStart}|${d.verseEnd}|${d.version}`;
        const title = `${d.name} ${d.chapter}:${d.verseStart}${
          d.verseStart !== d.verseEnd ? `-${d.verseEnd}` : ""
        }`;
        appendEntry(playlist, {
          id: uid(),
          kind: "bible",
          ref_id: ref,
          title,
          text: d.text,
          estimated_duration_sec: DEFAULT_EST.bible,
        });
      } catch {
        /* ignore malformed payload */
      }
      return;
    }
    const mediaPath = e.dataTransfer.getData(DRAG_MEDIA);
    if (mediaPath) {
      const m = media.find((x) => x.file_path === mediaPath);
      appendEntry(playlist, {
        id: uid(),
        kind: "media",
        ref_id: m?.id ?? mediaPath,
        title: m?.name ?? mediaPath,
        estimated_duration_sec: DEFAULT_EST.media,
      });
    }
  };

  const selectShow = (playlist: Playlist, index: number) => {
    setActivePlaylistId(playlist.id);
    gotoPlaylistEntry(playlist.id, index);
    onSelectShow();
  };

  const liveIndex =
    live && activePlaylistId && live.playlist_id === activePlaylistId
      ? live.playlist_entry_index
      : null;

  return (
    <div className="project-panel">
      <div className="project-panel-head">
        <span className="project-panel-title">{t("project.title")}</span>
        <button className="project-add" onClick={createProject} title={t("project.add")}>
          <Icon name="plus" size={13} />
          {t("project.add")}
        </button>
      </div>
      <div className="project-tree">
        {playlists.length === 0 && (
          <div className="project-empty">{t("project.empty")}</div>
        )}
        {playlists.map((p) => {
          const isOpen = !!expanded[p.id];
          const isActive = activePlaylistId === p.id;
          return (
            <div
              key={p.id}
              className={`project-node${dropOver === p.id ? " drop-over" : ""}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_SONG) || e.dataTransfer.types.includes(DRAG_BIBLE) || e.dataTransfer.types.includes(DRAG_MEDIA)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (dropOver !== p.id) setDropOver(p.id);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDropOver(null);
                }
              }}
              onDrop={(e) => handleDrop(e, p)}
            >
              <div
                className={`project-row${isActive ? " active" : ""}`}
                onClick={() => toggleProject(p.id)}
                title={t("project.toggle")}
              >
                <Icon name={isOpen ? "chevronDown" : "chevronsRight"} size={12} className="project-chevron" />
                <span className="project-name" title={p.name}>
                  {p.name || t("project.newProject")}
                </span>
                <span className="project-count">{p.entries.length}</span>
                <button
                  className="project-row-btn"
                  title={t("playlist.deletePlaylist")}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeProject(p);
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {isOpen && (
                <div className="project-shows">
                  {p.entries.length === 0 && (
                    <div className="project-show-empty">{t("project.noShows")}</div>
                  )}
                  {p.entries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className={`project-show${liveIndex === i ? " live" : ""}`}
                      onClick={() => selectShow(p, i)}
                      title={t("project.present")}
                    >
                      <Icon name={KIND_ICON[entry.kind]} size={11} className="project-show-icon" />
                      <span className="project-show-title" title={entry.title}>
                        {entry.title}
                      </span>
                      {liveIndex === i && <Icon name="play" size={11} className="project-show-live" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
