import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { LiveState, MediaItem } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { defaultLive } from "../../lib/live";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import SearchBox from "../SearchBox";

const FILTERS = [
  {
    name: "Ảnh & Video",
    extensions: [
      "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
      "mp4", "webm", "mov", "mkv", "avi", "m4v",
    ],
  },
];

/** Load a media thumbnail's src only when the card approaches the viewport,
 *  so opening the Media tab never decodes the whole library at once. */
function LazyThumb({
  src,
  isVideo,
  name,
}: {
  src: string;
  isVideo: boolean;
  name: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="thumb-slot">
      {show &&
        (isVideo ? (
          <video className="thumb" src={src} muted preload="metadata" />
        ) : (
          <img
            className="thumb"
            src={src}
            alt={name}
            loading="lazy"
            decoding="async"
          />
        ))}
    </div>
  );
}

export default function MediaLibrary() {
  const t = useT();
  const media = useAppStore((s) => s.media);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const importMedia = useAppStore((s) => s.importMedia);
  const deleteMedia = useAppStore((s) => s.deleteMedia);
  const goLive = useAppStore((s) => s.goLive);

  const pickAndImport = async () => {
    try {
      const selected = await open({ multiple: true, defaultPath: "D:/", filters: FILTERS });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await importMedia(paths);
    } catch (err) {
      console.error("import failed", err);
    }
  };

  const goLiveBackground = (item: MediaItem) => {
    const base = live ?? defaultLive(settings);
    const nextLive: LiveState = {
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
    };
    goLive(nextLive);
  };

  const removeMedia = (item: MediaItem) => {
    if (!window.confirm(`${t("media.deleteMedia")} "${item.name}"?`)) return;
    deleteMedia(item.id);
  };

  const isVideo = (item: MediaItem) =>
    /\.(mp4|webm|mov|mkv|avi|m4v|wmv)$/i.test(item.file_path);

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visible =
    q.length > 0
      ? media.filter((m) => m.name.toLowerCase().includes(q))
      : media;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("media.title")}</h2>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={t("media.search")}
        />
        <button className="primary" onClick={pickAndImport}>
          <Icon name="plus" className="btn-ic" />
          {t("media.import")}
        </button>
      </div>
      <div className="panel-body">
        {media.length === 0 ? (
          <div className="empty-hint">{t("media.empty")}</div>
        ) : visible.length === 0 ? (
          <div className="empty-hint">{t("media.searchNone")}</div>
        ) : (
          <div className="media-grid">
            {visible.map((item) => (
              <div
                key={item.id}
                className="media-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-pwc-media", item.file_path);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                {isVideo(item) ? (
                  <LazyThumb
                    src={api.mediaUrl(item.file_path)}
                    isVideo
                    name={item.name}
                  />
                ) : (
                  <LazyThumb
                    src={api.mediaUrl(item.file_path)}
                    isVideo={false}
                    name={item.name}
                  />
                )}
                <div className="media-info">
                  <div className="media-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="media-kind">{item.kind}</div>
                </div>
                <div className="media-actions">
                  <button className="primary" onClick={() => goLiveBackground(item)}>
                    <Icon name="play" className="btn-ic" />
                    {t("media.goLive")}
                  </button>
                  <button
                    className="icon danger"
                    title={t("media.deleteMedia")}
                    onClick={() => removeMedia(item)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
