import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/api";
import { audioEngine } from "../../lib/audioController";
import type { AudioItem, AudioPlaylist } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { defaultLive } from "../../lib/live";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import SearchBox from "../SearchBox";

const AUDIO_FILTERS = [
  {
    name: "Âm thanh",
    extensions: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "wma", "opus", "aiff"],
  },
];

export default function AudioLibrary() {
  const t = useT();
  const audio = useAppStore((s) => s.audio);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const playlists = useAppStore((s) => s.audioPlaylists);
  const importAudio = useAppStore((s) => s.importAudio);
  const deleteAudio = useAppStore((s) => s.deleteAudio);
  const saveAudioPlaylist = useAppStore((s) => s.saveAudioPlaylist);
  const deleteAudioPlaylist = useAppStore((s) => s.deleteAudioPlaylist);
  const goLive = useAppStore((s) => s.goLive);
  const stopAudio = useAppStore((s) => s.stopAudio);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const visibleAudio =
    q.length > 0 ? audio.filter((a) => a.name.toLowerCase().includes(q)) : audio;
  const visiblePlaylists =
    q.length > 0
      ? playlists.filter((p) => p.name.toLowerCase().includes(q))
      : playlists;

  const byId = useMemo(() => new Map(audio.map((a) => [a.id, a])), [audio]);

  const selected = playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  useEffect(() => {
    if (selected) setSelectedId(selected.id);
  }, [playlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNameDraft(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const pickAndImport = async () => {
    try {
      const picked = await open({ multiple: true, defaultPath: "D:/", filters: AUDIO_FILTERS });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      await importAudio(paths);
    } catch (err) {
      console.error("import audio failed", err);
    }
  };

  const createPlaylist = async () => {
    const saved = await saveAudioPlaylist({
      id: "",
      name: t("audioplay.newName"),
      track_ids: [],
      loop_mode: "none",
      shuffle: false,
      crossfade_enabled: false,
      crossfade_ms: 3000,
      created_at: 0,
      updated_at: 0,
    });
    setSelectedId(saved.id);
  };

  const updateSelected = async (patch: Partial<AudioPlaylist>) => {
    if (!selected) return;
    await saveAudioPlaylist({ ...selected, ...patch });
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (name && selected && name !== selected.name) updateSelected({ name });
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`${t("audioplay.delete")} "${selected.name}"?`)) return;
    const id = selected.id;
    setSelectedId(null);
    await deleteAudioPlaylist(id);
  };

  const playPlaylist = (pl: AudioPlaylist) => {
    const tracks = pl.track_ids
      .map((id) => byId.get(id))
      .filter((a): a is AudioItem => Boolean(a))
      .map((a) => ({ id: a.id, title: a.name, file_path: a.file_path }));
    if (tracks.length === 0) return;
    audioEngine.loadAndPlay(tracks, {
      play: true,
      source: "playlist",
      volume: live?.audio?.volume ?? 1,
      loop: pl.loop_mode,
      shuffle: pl.shuffle,
      crossfade: pl.crossfade_enabled,
      crossfadeMs: pl.crossfade_ms,
    });
  };

  const playTrackAt = (pl: AudioPlaylist, index: number) => {
    const tracks = pl.track_ids
      .map((id) => byId.get(id))
      .filter((a): a is AudioItem => Boolean(a))
      .map((a) => ({ id: a.id, title: a.name, file_path: a.file_path }));
    if (tracks.length === 0) return;
    audioEngine.loadAndPlay(tracks, {
      index,
      play: true,
      source: "playlist",
      volume: live?.audio?.volume ?? 1,
      loop: pl.loop_mode,
      shuffle: pl.shuffle,
      crossfade: pl.crossfade_enabled,
      crossfadeMs: pl.crossfade_ms,
    });
  };

  const addToSelected = (item: AudioItem) => {
    if (!selected) return;
    if (selected.track_ids.includes(item.id)) return;
    updateSelected({ track_ids: [...selected.track_ids, item.id] });
  };

  const moveTrack = (index: number, dir: number) => {
    if (!selected) return;
    const ids = [...selected.track_ids];
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    updateSelected({ track_ids: ids });
  };

  const removeTrack = (index: number) => {
    if (!selected) return;
    const ids = [...selected.track_ids];
    ids.splice(index, 1);
    updateSelected({ track_ids: ids });
  };

  const playAsBackground = (item: AudioItem) => {
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

  const stopBackground = () => {
    stopAudio();
  };

  const removeAudio = (item: AudioItem) => {
    if (!window.confirm(`${t("audio.delete")} "${item.name}"?`)) return;
    deleteAudio(item.id);
  };

  const currentPlayingId = live?.audio && live.audio.playing ? live.audio.id : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("audio.title")}</h2>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={t("audio.search")}
        />
        <button className="primary" onClick={pickAndImport}>
          <Icon name="plus" className="btn-ic" />
          {t("audio.import")}
        </button>
      </div>
      <div className="panel-body">
        <div className="audioplay-section">
          <div className="audioplay-head">
            <h3>{t("audioplay.title")}</h3>
            <button onClick={createPlaylist}>
              <Icon name="plus" className="btn-ic" />
              {t("audioplay.new")}
            </button>
          </div>
          {visiblePlaylists.length === 0 ? (
            <div className="empty-hint">{t("audioplay.empty")}</div>
          ) : (
            <div className="audioplay-main">
              <div className="audioplay-tabs">
                {visiblePlaylists.map((p) => (
                  <button
                    key={p.id}
                    className={p.id === selected?.id ? "active" : ""}
                    onClick={() => setSelectedId(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {selected && (
                <div className="audioplay-editor">
                  <div className="audioplay-name">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitName();
                      }}
                    />
                    <button className="icon danger" onClick={deleteSelected} title={t("audioplay.delete")}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  <div className="audioplay-opts">
                    <label>
                      {t("audioplay.loop")}
                      <select
                        value={selected.loop_mode}
                        onChange={(e) =>
                          updateSelected({
                            loop_mode: e.target.value as AudioPlaylist["loop_mode"],
                          })
                        }
                      >
                        <option value="none">{t("audioplay.loopNone")}</option>
                        <option value="all">{t("audioplay.loopAll")}</option>
                        <option value="single">{t("audioplay.loopSingle")}</option>
                      </select>
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={selected.shuffle}
                        onChange={(e) => updateSelected({ shuffle: e.target.checked })}
                      />
                      {t("audioplay.shuffle")}
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={selected.crossfade_enabled}
                        onChange={(e) => updateSelected({ crossfade_enabled: e.target.checked })}
                      />
                      {t("audioplay.crossfade")}
                    </label>
                    {selected.crossfade_enabled && (
                      <label>
                        {t("audioplay.crossfadeMs")}
                        <input
                          className="crossfade-ms"
                          type="number"
                          min={0}
                          step={500}
                          value={selected.crossfade_ms}
                          onChange={(e) =>
                            updateSelected({ crossfade_ms: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </label>
                    )}
                  </div>
                  <div className="audioplay-actions">
                    <button className="primary" onClick={() => playPlaylist(selected)}>
                      <Icon name="play" className="btn-ic" />
                      {t("audioplay.play")}
                    </button>
                    {live?.audio && (
                      <button onClick={stopBackground}>
                        <Icon name="stop" className="btn-ic" />
                        {t("audio.stop")}
                      </button>
                    )}
                  </div>
                  <div className="audioplay-tracks">
                    {selected.track_ids.length === 0 ? (
                      <div className="empty-hint">{t("audioplay.noTracks")}</div>
                    ) : (
                      selected.track_ids.map((id, i) => {
                        const item = byId.get(id);
                        if (!item) return null;
                        return (
                          <div key={id} className="audioplay-track">
                            <span className="track-name" title={item.name}>
                              {i + 1}. {item.name}
                            </span>
                            <button
                              className="icon"
                              title={t("audioplay.play")}
                              onClick={() => playTrackAt(selected, i)}
                            >
                              <Icon name="play" size={14} />
                            </button>
                            <button
                              className="icon"
                              title={t("audioplay.moveUp")}
                              disabled={i === 0}
                              onClick={() => moveTrack(i, -1)}
                            >
                              <Icon name="chevronUp" size={14} />
                            </button>
                            <button
                              className="icon"
                              title={t("audioplay.moveDown")}
                              disabled={i === selected.track_ids.length - 1}
                              onClick={() => moveTrack(i, 1)}
                            >
                              <Icon name="chevronDown" size={14} />
                            </button>
                            <button
                              className="icon danger"
                              title={t("audioplay.removeTrack")}
                              onClick={() => removeTrack(i)}
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="audio-library-section">
          {audio.length === 0 ? (
            <div className="empty-hint">{t("audio.empty")}</div>
          ) : visibleAudio.length === 0 ? (
            <div className="empty-hint">{t("audio.searchNone")}</div>
          ) : (
            <div className="audio-list">
              {visibleAudio.map((item) => (
                <div key={item.id} className="audio-row">
                  <div className="audio-info">
                    <div className="audio-name" title={item.name}>
                      {item.name}
                    </div>
                    <div className="audio-kind">âm thanh</div>
                  </div>
                  <div className="audio-actions">
                    <button
                      className="icon"
                      title={t("audioplay.addToPlaylist")}
                      disabled={!selected}
                      onClick={() => addToSelected(item)}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                    <button
                      className="icon"
                      title={t("audio.preview")}
                      onClick={() => setPreview(preview === item.id ? null : item.id)}
                    >
                      <Icon name={preview === item.id ? "stop" : "play"} size={14} />
                    </button>
                    <button
                      className="primary"
                      onClick={() => playAsBackground(item)}
                      title={t("audio.playBg")}
                    >
                      {currentPlayingId === item.id ? t("audio.playing") : t("audio.playBg")}
                    </button>
                    <button
                      className="icon danger"
                      title={t("audio.delete")}
                      onClick={() => removeAudio(item)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  {preview === item.id && (
                    <audio
                      className="audio-preview"
                      src={api.mediaUrl(item.file_path)}
                      controls
                      autoPlay
                      onEnded={() => setPreview(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
