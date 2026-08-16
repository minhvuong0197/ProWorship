import { useEffect, useMemo, useRef } from "react";
import type { IconName } from "../Icon/Icon";
import Icon from "../Icon/Icon";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";

const ENTRY_ICON: Record<string, IconName> = {
  song: "music",
  media: "film",
  audio: "audio",
  blank: "square",
  bible: "book",
};

export default function ServiceBar() {
  const t = useT();
  const playlists = useAppStore((s) => s.playlists);
  const live = useAppStore((s) => s.live);
  const gotoPlaylistEntry = useAppStore((s) => s.gotoPlaylistEntry);

  const playlistId = live?.playlist_id ?? null;
  const entryIdx = live?.playlist_entry_index ?? null;

  const playlist = useMemo(
    () => playlists.find((p) => p.id === playlistId) ?? null,
    [playlists, playlistId],
  );
  const entries = playlist?.entries ?? [];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (entryIdx == null) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-idx="${entryIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [entryIdx, entries.length]);

  if (!playlist) return null;

  return (
    <div className="service-bar">
      <div className="service-bar-name" title={playlist.name}>
        {playlist.name}
      </div>
      <div className="service-bar-scroll" ref={scrollRef}>
        {entries.map((entry, i) => {
          const current = i === entryIdx;
          const next = entryIdx != null && i === entryIdx + 1;
          return (
            <button
              key={entry.id}
              data-idx={i}
              className={`service-entry${current ? " current" : ""}${next ? " next" : ""}`}
              onClick={() => gotoPlaylistEntry(playlist.id, i)}
              title={entry.title}
            >
              <Icon name={ENTRY_ICON[entry.kind] ?? "file"} size={11} />
              <span className="service-entry-title">{entry.title}</span>
              {current &&
                live?.song_slide_count &&
                live.song_slide_index != null ? (
                <span className="service-entry-progress">
                  {live.song_slide_index + 1}/{live.song_slide_count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {live?.next_text ? (
        <div className="service-bar-next">
          <span className="service-bar-next-label">
            {live.next_label ?? t("service.next")}
          </span>
          <span className="service-bar-next-text">{live.next_text}</span>
        </div>
      ) : null}
    </div>
  );
}