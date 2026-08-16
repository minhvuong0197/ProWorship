import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import type { Layer, SlideDragData, SlideFormatting, Song, SongArrangement, SongSlide } from "../../lib/types";
import { SLIDE_DRAG_TYPE, uid } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { defaultLive, songSlideLive } from "../../lib/live";
import { useT } from "../../lib/i18n";
import { FONT_OPTIONS, ensureFontsLoaded, vietnameseIssue } from "../../lib/fonts";
import { parseQuickPaste } from "../../lib/songImport";
import Icon from "../Icon/Icon";
import ImportExportModal from "../ImportExportModal";
import PreviewSlide from "../LivePreview/PreviewSlide";
import { invoke } from "@tauri-apps/api/core";

function newSong(): Song {
  return {
    id: uid(),
    title: "Bài hát mới",
    artist: "",
    key: "",
    ccli: "",
    copyright: "",
    slides: [
      {
        id: uid(),
        label: "Verse 1",
        text: "",
        notes: "",
        template_id: null,
        layers: [],
      },
    ],
    arrangements: [],
    template_id: null,
    created_at: 0,
    updated_at: 0,
  };
}

function newTextLayer(): Layer {
  return {
    id: uid(),
    kind: "text",
    text: "",
    image_path: "",
    x: 10,
    y: 20,
    w: 60,
    h: 20,
    color: "#ffffff",
    font_size: 4,
    align: "center",
    opacity: 1,
    visible: true,
  };
}

function newImageLayer(): Layer {
  return {
    id: uid(),
    kind: "image",
    text: "",
    image_path: "",
    x: 10,
    y: 20,
    w: 40,
    h: 40,
    color: "#ffffff",
    font_size: 4,
    align: "center",
    opacity: 1,
    visible: true,
  };
}

// Lazy-mounts the full slide preview: only mounts once the item is close to
// the viewport, so selecting a song doesn't build 24 autofit previews at once.
function LazyPreview({ slide }: { slide: import("../../lib/types").LiveSlide | null }) {
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
        for (const e of entries) {
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      {show ? <PreviewSlide slide={slide} /> : null}
    </div>
  );
}

export default function SongEditor() {
  const t = useT();
  const songs = useAppStore((s) => s.songs);
  const media = useAppStore((s) => s.media);
  const live = useAppStore((s) => s.live);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const saveSong = useAppStore((s) => s.saveSong);
  const deleteSong = useAppStore((s) => s.deleteSong);
  const goLive = useAppStore((s) => s.goLive);

  const songTemplates = templates.filter(
    (tp) => !tp.category || tp.category === "lyric" || tp.category === "other",
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [work, setWork] = useState<Song | null>(null);
  const [activeArrangement, setActiveArrangement] = useState<string | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [formatOpen, setFormatOpen] = useState<Record<string, boolean>>({});
  const [quickPaste, setQuickPaste] = useState("");
  const [dragBgOver, setDragBgOver] = useState<string | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [renderCount, setRenderCount] = useState(24);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setWork(null);
      setActiveArrangement(null);
      setActiveSlideId(null);
      return;
    }
    const song = songs.find((s) => s.id === selectedId);
    if (song) setWork(JSON.parse(JSON.stringify(song)));
    else setWork(null);
  }, [selectedId, songs]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (work?.slides?.length) {
      setActiveSlideId((prev) => prev ?? work.slides[0].id);
    }
  }, [work]);

  useEffect(() => {
    const onNew = () => createSong();
    const onDuplicate = () => {
      if (!work) return;
      const id = activeSlideId ?? work.slides[0]?.id;
      if (!id) return;
      const idx = work.slides.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const src = work.slides[idx];
      const copy = { ...src, id: uid() };
      const slides = [...work.slides];
      slides.splice(idx + 1, 0, copy);
      const next = {
        ...work,
        slides,
        arrangements: (work.arrangements ?? []).map((a) => ({
          ...a,
          order: a.order.map((sid) => (sid === src.id ? [sid, copy.id] : [sid])).flat(),
        })),
      };
      scheduleSave(next);
      setWork(next);
      setActiveSlideId(copy.id);
    };
    const onSave = () => {
      if (work && saveTimer.current) window.clearTimeout(saveTimer.current);
      if (work) saveSong(work);
    };
    window.addEventListener("pwc:new", onNew);
    window.addEventListener("pwc:duplicate", onDuplicate);
    window.addEventListener("pwc:save", onSave);
    return () => {
      window.removeEventListener("pwc:new", onNew);
      window.removeEventListener("pwc:duplicate", onDuplicate);
      window.removeEventListener("pwc:save", onSave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, activeSlideId]);

  const scheduleSave = (next: Song) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveSong(next), 350);
  };

  const updateWork = (patch: Partial<Song>) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  };

  const selectSong = (id: string) => {
    setSelectedId(id);
  };

  const openEditor = (id: string | null) => {
    setEditingId(id);
  };

  const visibleSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.artist || "").toLowerCase().includes(q) ||
        (s.ccli || "").toLowerCase().includes(q),
    );
  }, [songs, search]);

  const createSong = () => {
    const song = newSong();
    setSelectedId(song.id);
    setWork(song);
    saveSong(song);
    setEditingId(song.id);
  };

  const removeSong = (song: Song) => {
    if (!window.confirm(`${t("songs.deleteSong")} "${song.title}"?`)) return;
    if (selectedId === song.id) setSelectedId(null);
    deleteSong(song.id);
  };

  const updateSlide = (id: string, patch: Partial<SongSlide>) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)),
      };
      scheduleSave(next);
      return next;
    });
  };

  const addSlide = () => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: [
          ...prev.slides,
          {
            id: uid(),
            label: `Slide ${prev.slides.length + 1}`,
            text: "",
            notes: "",
            template_id: null,
            layers: [],
          },
        ],
      };
      scheduleSave(next);
      return next;
    });
  };

  const applyQuickPaste = () => {
    if (!work || !quickPaste.trim()) return;
    if (
      work.slides.some((s) => s.text.trim()) &&
      !window.confirm(t("songs.quickPasteConfirm"))
    )
      return;
    const parsed = parseQuickPaste(quickPaste);
    if (parsed.length === 0) return;
    const next = {
      ...work,
      slides: parsed.map((p) => ({
        id: uid(),
        label: p.label,
        text: p.text,
        notes: "",
        template_id: null,
        layers: [],
      })),
    };
    setWork(next);
    setQuickPaste("");
    scheduleSave(next);
  };

  const removeSlide = (id: string) => {    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.filter((sl) => sl.id !== id),
        arrangements: (prev.arrangements ?? []).map((a) => ({
          ...a,
          order: a.order.filter((sid) => sid !== id),
        })),
      };
      scheduleSave(next);
      return next;
    });
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    setWork((prev) => {
      if (!prev) return prev;
      const slides = [...prev.slides];
      const target = index + dir;
      if (target < 0 || target >= slides.length) return prev;
      [slides[index], slides[target]] = [slides[target], slides[index]];
      const next = { ...prev, slides };
      scheduleSave(next);
      return next;
    });
  };

  const goLiveSlide = (song: Song | null, index: number, fallbackTitle: string) => {
    const base = live ?? defaultLive(settings);
    const arrId = activeArrangement;
    const nextLive = songSlideLive(song, index, fallbackTitle, base, settings, templates, arrId);
    goLive({ ...nextLive, playlist_id: null, playlist_entry_index: null });
  };

  const gridLiveSlides = useMemo(() => {
    if (!work) return [];
    const base = live ?? defaultLive(settings);
    return work.slides.map((_sl, index) =>
      songSlideLive(work, index, work.title, base, settings, templates, activeArrangement).current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, settings, templates, activeArrangement]);

  const liveSongIndex =
    live && work && live.song_id === work.id ? live.song_slide_index : null;

  useEffect(() => {
    if (viewMode !== "grid" || liveSongIndex == null) return;
    const grid = gridRef.current;
    if (!grid) return;
    const item = grid.querySelector<HTMLElement>(`[data-index="${liveSongIndex}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [liveSongIndex, viewMode]);

  useEffect(() => {
    if (viewMode === "grid") setRenderCount(24);
  }, [viewMode, work?.id]);

  // Measure grid render cost on song selection (perf probe for the lazy
  // preview work; fires once per selected song).
  useLayoutEffect(() => {
    if (!work) return;
    const start = performance.now();
    requestAnimationFrame(() => {
      invoke("gpu_probe", {
        report: `songs-grid-render ms=${(performance.now() - start).toFixed(1)} slides=${work.slides.length} rendered=${Math.min(renderCount, work.slides.length)}`,
      }).catch(() => {});
    });
  }, [work?.id]);

  const handleGridScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setRenderCount((c) => (work ? Math.max(c + 24, work.slides.length) : c));
    }
  };

  // ---- Arrangement helpers ----
  const arrangements = work?.arrangements ?? [];
  const activeArr = arrangements.find((a) => a.id === activeArrangement) ?? null;

  const updateArrangements = (
    fn: (arrs: SongArrangement[]) => SongArrangement[],
  ) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = { ...prev, arrangements: fn(prev.arrangements ?? []) };
      scheduleSave(next);
      return next;
    });
  };

  const createArrangement = () => {
    if (!work) return;
    const arr: SongArrangement = {
      id: uid(),
      name: t("songs.newArrangement"),
      order: work.slides.map((s) => s.id),
    };
    updateArrangements((arrs) => [...arrs, arr]);
    setActiveArrangement(arr.id);
  };

  const removeArrangement = (id: string) => {
    updateArrangements((arrs) => arrs.filter((a) => a.id !== id));
    if (activeArrangement === id) setActiveArrangement(null);
  };

  const renameArrangement = (id: string, name: string) => {
    updateArrangements((arrs) => arrs.map((a) => (a.id === id ? { ...a, name } : a)));
  };

  const toggleInclude = (slideId: string) => {
    if (!activeArr) return;
    const included = activeArr.order.includes(slideId);
    updateArrangements((arrs) =>
      arrs.map((a) =>
        a.id === activeArr.id
          ? {
              ...a,
              order: included
                ? a.order.filter((id) => id !== slideId)
                : [...a.order, slideId],
            }
          : a,
      ),
    );
  };

  const moveInArrangement = (slideId: string, dir: -1 | 1) => {
    if (!activeArr) return;
    updateArrangements((arrs) =>
      arrs.map((a) => {
        if (a.id !== activeArr.id) return a;
        const idx = a.order.indexOf(slideId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= a.order.length) return a;
        const order = [...a.order];
        [order[idx], order[target]] = [order[target], order[idx]];
        return { ...a, order };
      }),
    );
  };

  // ---- Layer helpers ----
  const updateLayers = (slideId: string, layers: Layer[]) => {
    updateSlide(slideId, { layers });
  };

  const addLayer = (slideId: string, kind: "text" | "image") => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                layers: [
                  ...(sl.layers ?? []),
                  kind === "text" ? newTextLayer() : newImageLayer(),
                ],
              }
            : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
    setExpandedLayers((m) => ({ ...m, [slideId]: true }));
  };

  const patchLayer = (slideId: string, layerId: string, patch: Partial<Layer>) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                layers: (sl.layers ?? []).map((l) =>
                  l.id === layerId ? { ...l, ...patch } : l,
                ),
              }
            : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
  };

  const removeLayer = (slideId: string, layerId: string) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === slideId
            ? { ...sl, layers: (sl.layers ?? []).filter((l) => l.id !== layerId) }
            : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
  };

  const patchFormatting = (
    slideId: string,
    patch: Record<string, unknown>,
  ) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === slideId
            ? { ...sl, formatting: { ...(sl.formatting ?? {}), ...patch } }
            : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
  };

  const applyFormatGlobal = (
    patch: Record<string, unknown>,
    mode: "label" | "all",
    fromSlide: SongSlide,
  ) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) => {
          const match =
            mode === "all" || (sl.label && sl.label === fromSlide.label);
          if (!match) return sl;
          return { ...sl, formatting: { ...(sl.formatting ?? {}), ...patch } };
        }),
      };
      scheduleSave(next);
      return next;
    });
  };

  const PRESET_KEY = "pwcStylePresets";
  const [presetName, setPresetName] = useState("");
  const [presetMsg, setPresetMsg] = useState("");

  const loadPresets = (): { name: string; formatting: SlideFormatting }[] => {
    try {
      return JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]");
    } catch {
      return [];
    }
  };

  const savePreset = (fromSlide: SongSlide) => {
    const name = presetName.trim();
    if (!name) return;
    const presets = loadPresets();
    const formatting = { ...(fromSlide.formatting ?? {}) } as SlideFormatting;
    const next = [{ name, formatting }, ...presets].slice(0, 24);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
    setPresetMsg(t("songs.presetSaved"));
    window.setTimeout(() => setPresetMsg(""), 1500);
  };

  const applyPreset = (
    preset: { name: string; formatting: SlideFormatting },
    toSlide: SongSlide,
    mode: "label" | "all",
  ) => {
    applyFormatGlobal(preset.formatting as Record<string, unknown>, mode, toSlide);
    setPresetMsg(t("songs.presetApplied"));
    window.setTimeout(() => setPresetMsg(""), 1500);
  };

  const removePreset = (name: string) => {
    localStorage.setItem(
      PRESET_KEY,
      JSON.stringify(loadPresets().filter((p) => p.name !== name)),
    );
  };

  const renderFormatToolbar = (slide: SongSlide) => {
    const f = slide.formatting ?? {};
    const open = formatOpen[slide.id];
    const hasBox =
      f.box_x !== undefined ||
      f.box_y !== undefined ||
      f.box_w !== undefined ||
      f.box_h !== undefined;
    return (
      <div className="format-box">
        <div className="layers-head">
          <button
            className="icon"
            onClick={() => setFormatOpen((m) => ({ ...m, [slide.id]: !open }))}
          >
            {open ? "−" : "+"}
          </button>
          <span className="muted-text">{t("songs.formatTitle")}</span>
        </div>
        {open && (
          <div className="format-fields">
            <div className="field-row wrap">
              <label className="format-item">
                {t("settings.fontSize")}
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={f.font_size ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      font_size: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </label>
              <label className="format-item">
                {t("settings.textColor")}
                <input
                  type="color"
                  value={f.color ?? "#ffffff"}
                  onChange={(e) =>
                    patchFormatting(slide.id, { color: e.target.value })
                  }
                />
              </label>
              <label className="format-item">
                {t("settings.fontFamily")}
                <select
                  value={f.font_family ?? ""}
                  onChange={(e) => {
                    ensureFontsLoaded();
                    patchFormatting(slide.id, {
                      font_family: e.target.value || undefined,
                    });
                  }}
                >
                  <option value="">—</option>
                  {FONT_OPTIONS.map((fo) => (
                    <option key={fo.name} value={fo.css}>
                      {fo.name}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                const issue = vietnameseIssue(f.font_family ?? "", slide.text);
                if (issue.diacritics && issue.weakFont) {
                  return (
                    <label className="format-item typo-warn">
                      {t("songs.viFontWarn")}
                    </label>
                  );
                }
                return null;
              })()}
            </div>
            <div className="format-row">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.bold}
                  onChange={(e) =>
                    patchFormatting(slide.id, { bold: e.target.checked || undefined })
                  }
                />
                <b>B</b>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.italic}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      italic: e.target.checked || undefined,
                    })
                  }
                />
                <i>I</i>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.underline}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      underline: e.target.checked || undefined,
                    })
                  }
                />
                <u>U</u>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.strike}
                  onChange={(e) =>
                    patchFormatting(slide.id, { strike: e.target.checked || undefined })
                  }
                />
                <s>S</s>
              </label>
            </div>
            <div className="field-row wrap">
              <label className="format-item">
                {t("songs.highlight")}
                <input
                  type="color"
                  value={f.highlight_color ?? "#00000000"}
                  onChange={(e) =>
                    patchFormatting(slide.id, { highlight_color: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="field-row wrap">
              <label className="format-item">
                {t("settings.align")} H
                <select
                  value={f.align_h ?? "center"}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      align_h: e.target.value || undefined,
                    })
                  }
                >
                  <option value="left">{t("settings.alignLeft")}</option>
                  <option value="center">{t("settings.alignCenter")}</option>
                  <option value="right">{t("settings.alignRight")}</option>
                  <option value="justify">{t("songs.justify")}</option>
                </select>
              </label>
              <label className="format-item">
                {t("settings.alignV")}
                <select
                  value={f.align_v ?? "middle"}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      align_v: e.target.value || undefined,
                    })
                  }
                >
                  <option value="top">{t("settings.positionTop")}</option>
                  <option value="middle">{t("settings.positionCenter")}</option>
                  <option value="bottom">{t("settings.positionBottom")}</option>
                </select>
              </label>
              <label className="format-item">
                {t("songs.lineHeight")}
                <input
                  type="number"
                  min={0.8}
                  max={3}
                  step={0.05}
                  value={f.line_height ?? ""}
                  placeholder="1.35"
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      line_height: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </label>
              <label className="format-item">
                {t("songs.letterSpacing")} (px)
                <input
                  type="number"
                  min={-5}
                  max={30}
                  value={f.letter_spacing ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      letter_spacing: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </label>
              <label className="format-item">
                Độ trong suốt
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={f.opacity ?? 1}
                  onChange={(e) =>
                    patchFormatting(slide.id, { opacity: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="field-row wrap">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.outline_enabled}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      outline_enabled: e.target.checked || undefined,
                    })
                  }
                />
                {t("songs.outline")}
              </label>
              {f.outline_enabled && (
                <>
                  <input
                    type="color"
                    value={f.outline_color ?? "#000000"}
                    onChange={(e) =>
                      patchFormatting(slide.id, { outline_color: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={f.outline_width ?? 2}
                    title={t("songs.outlineWidth")}
                    onChange={(e) =>
                      patchFormatting(slide.id, {
                        outline_width: Number(e.target.value) || 0,
                      })
                    }
                  />
                </>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!f.shadow_enabled}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      shadow_enabled: e.target.checked || undefined,
                    })
                  }
                />
                {t("songs.shadow")}
              </label>
              {f.shadow_enabled && (
                <>
                  <input
                    type="color"
                    value={f.shadow_color ?? "#000000"}
                    onChange={(e) =>
                      patchFormatting(slide.id, { shadow_color: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    min={-30}
                    max={30}
                    value={f.shadow_offset_x ?? 0}
                    title="X"
                    onChange={(e) =>
                      patchFormatting(slide.id, {
                        shadow_offset_x: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <input
                    type="number"
                    min={-30}
                    max={30}
                    value={f.shadow_offset_y ?? 4}
                    title="Y"
                    onChange={(e) =>
                      patchFormatting(slide.id, {
                        shadow_offset_y: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={f.shadow_blur ?? 12}
                    title={t("songs.shadowBlur")}
                    onChange={(e) =>
                      patchFormatting(slide.id, {
                        shadow_blur: Number(e.target.value) || 0,
                      })
                    }
                  />
                </>
              )}
            </div>
            <div className="format-box-row">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={hasBox}
                  onChange={(e) =>
                    patchFormatting(slide.id, {
                      box_x: e.target.checked ? (f.box_x ?? 10) : undefined,
                      box_y: e.target.checked ? (f.box_y ?? 10) : undefined,
                      box_w: e.target.checked ? (f.box_w ?? 80) : undefined,
                      box_h: e.target.checked ? (f.box_h ?? 80) : undefined,
                    })
                  }
                />
                {t("songs.textBox")}
              </label>
              {hasBox && (
                <div className="layer-nums">
                  <label>
                    X
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={f.box_x ?? 10}
                      onChange={(e) =>
                        patchFormatting(slide.id, {
                          box_x: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={f.box_y ?? 10}
                      onChange={(e) =>
                        patchFormatting(slide.id, {
                          box_y: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label>
                    W
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={f.box_w ?? 80}
                      onChange={(e) =>
                        patchFormatting(slide.id, {
                          box_w: Number(e.target.value) || 80,
                        })
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={f.box_h ?? 80}
                      onChange={(e) =>
                        patchFormatting(slide.id, {
                          box_h: Number(e.target.value) || 80,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="field-row wrap" style={{ paddingTop: 8 }}>
              <button
                className="primary sm"
                onClick={() =>
                  applyFormatGlobal(
                    { ...(slide.formatting ?? {}) },
                    "label",
                    slide,
                  )
                }
              >
                {t("songs.applyToLabel")}
              </button>
              <button onClick={() => applyFormatGlobal({ ...(slide.formatting ?? {}) }, "all", slide)}>
                {t("songs.applyToAll")}
              </button>
            </div>
            <div className="preset-box">
              <div className="field-row">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t("songs.presetName")}
                />
                <button onClick={() => savePreset(slide)}>
                  {t("songs.savePreset")}
                </button>
              </div>
              {presetMsg && <div className="muted-text">{presetMsg}</div>}
              {loadPresets().length > 0 && (
                <div className="preset-list">
                  {loadPresets().map((p) => (
                    <div className="preset-row" key={p.name}>
                      <span>{p.name}</span>
                      <button
                        onClick={() => applyPreset(p, slide, "label")}
                        title={t("songs.applyToLabel")}
                      >
                        {t("songs.applyPreset")}
                      </button>
                      <button
                        className="danger"
                        onClick={() => removePreset(p.name)}
                        title={t("songs.removePreset")}
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderArrangementEditor = () => {
    if (!work) return null;
    if (!activeArr) {
      return (
        <div className="arrangement-box">
          <div className="empty-hint">
            {t("songs.arrangementEmpty")}
            <br />
            <button className="primary" onClick={createArrangement}>
              {t("songs.newArrangement")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="arrangement-box">
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("songs.arrangementName")}</label>
            <input
              value={activeArr.name}
              onChange={(e) => renameArrangement(activeArr.id, e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button
              className="danger"
              onClick={() => removeArrangement(activeArr.id)}
            >
              <Icon name="trash" className="btn-ic" />
            </button>
          </div>
        </div>
        <div className="muted-text" style={{ fontSize: 12 }}>
          {t("songs.arrangementHint")}
        </div>
        <div className="arrangement-items">
          {work.slides.map((slide) => {
            const included = activeArr.order.includes(slide.id);
            const pos = activeArr.order.indexOf(slide.id);
            return (
              <div key={slide.id} className={`arrangement-row ${included ? "in" : ""}`}>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => toggleInclude(slide.id)}
                />
                <span className="slide-chip-label">{slide.label || `Slide`}</span>
                <span className="slide-chip-preview">
                  {slide.text.split("\n")[0] || "…"}
                </span>
                <button
                  className="icon"
                  disabled={!included || pos <= 0}
                  onClick={() => moveInArrangement(slide.id, -1)}
                  title={t("songs.moveUp")}
                >
                  <Icon name="chevronUp" size={15} />
                </button>
                <button
                  className="icon"
                  disabled={!included || pos < 0 || pos >= activeArr.order.length - 1}
                  onClick={() => moveInArrangement(slide.id, 1)}
                  title={t("songs.moveDown")}
                >
                  <Icon name="chevronDown" size={15} />
                </button>
                <button
                  className="icon primary"
                  disabled={!included}
                  onClick={() => goLiveSlide(work, pos, work.title)}
                  title={t("songs.goLive")}
                >
                  <Icon name="play" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLayers = (slide: SongSlide) => {
    const layers = slide.layers ?? [];
    const open = expandedLayers[slide.id];
    return (
      <div className="layers-box">
        <div className="layers-head">
          <button
            className="icon"
            onClick={() =>
              setExpandedLayers((m) => ({ ...m, [slide.id]: !open }))
            }
          >
            {open ? "−" : "+"}
          </button>
          <span className="muted-text">
            {t("songs.layers")} ({layers.length})
          </span>
          {open && (
            <>
              <button className="icon" onClick={() => addLayer(slide.id, "text")}>
                T+
              </button>
              <button className="icon" onClick={() => addLayer(slide.id, "image")}>
                I+
              </button>
            </>
          )}
        </div>
        {open && (
          <div className="layers-list">
            {layers.length === 0 && (
              <div className="muted-text" style={{ fontSize: 12 }}>
                {t("songs.layerHint")}
              </div>
            )}
            {layers.map((layer, i) => (
              <div key={layer.id} className="layer-row">
                <span className="layer-idx">{i + 1}</span>
                <div className="layer-fields">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(e) =>
                        patchLayer(slide.id, layer.id, { visible: e.target.checked })
                      }
                    />
                    Hiện
                  </label>
                  {layer.kind === "text" ? (
                    <input
                      value={layer.text}
                      placeholder={t("songs.layerTextPlaceholder")}
                      onChange={(e) =>
                        patchLayer(slide.id, layer.id, { text: e.target.value })
                      }
                    />
                  ) : (
                    <select
                      value={layer.image_path}
                      onChange={(e) =>
                        patchLayer(slide.id, layer.id, { image_path: e.target.value })
                      }
                    >
                      <option value="">(chọn ảnh…)</option>
                      {media.map((m) => (
                        <option key={m.id} value={m.file_path}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="layer-nums">
                    <label>
                      X
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={layer.x}
                        onChange={(e) =>
                          patchLayer(slide.id, layer.id, { x: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label>
                      Y
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={layer.y}
                        onChange={(e) =>
                          patchLayer(slide.id, layer.id, { y: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label>
                      W
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={layer.w}
                        onChange={(e) =>
                          patchLayer(slide.id, layer.id, { w: Number(e.target.value) || 10 })
                        }
                      />
                    </label>
                    <label>
                      H
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={layer.h}
                        onChange={(e) =>
                          patchLayer(slide.id, layer.id, { h: Number(e.target.value) || 10 })
                        }
                      />
                    </label>
                    {layer.kind === "text" && (
                      <>
                        <label>
                          Cỡ
                          <input
                            type="number"
                            min={1}
                            max={40}
                            value={layer.font_size}
                            onChange={(e) =>
                              patchLayer(slide.id, layer.id, {
                                font_size: Number(e.target.value) || 4,
                              })
                            }
                          />
                        </label>
                        <label>
                          <input
                            type="color"
                            value={layer.color}
                            onChange={(e) =>
                              patchLayer(slide.id, layer.id, { color: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          <select
                            value={layer.align}
                            onChange={(e) =>
                              patchLayer(slide.id, layer.id, {
                                align: e.target.value as Layer["align"],
                              })
                            }
                          >
                            <option value="center">G</option>
                            <option value="left">L</option>
                            <option value="right">R</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Mờ
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(e) =>
                          patchLayer(slide.id, layer.id, {
                            opacity: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
                <button
                  className="icon danger"
                  onClick={() => removeLayer(slide.id, layer.id)}
                  title={t("songs.deleteSlide")}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSlidesGrid = () => {
    if (!work) return null;
    return (
      <div className="slides-grid" ref={gridRef} onScroll={handleGridScroll}>
        {work.slides.map((slide, index) => {
          const liveSlide = gridLiveSlides[index];
          const isLive = liveSongIndex === index;
          const loaded = index < renderCount;
          return (
            <div
              key={slide.id}
              className={`slide-grid-item ${isLive ? "live" : ""} ${dragBgOver === slide.id ? "bg-over" : ""}`}
              data-index={index}
              draggable
              onDragStart={(e) => {
                const tag = (e.target as HTMLElement).tagName;
                if (
                  tag === "INPUT" ||
                  tag === "TEXTAREA" ||
                  tag === "SELECT" ||
                  tag === "BUTTON"
                ) {
                  e.preventDefault();
                  return;
                }
                const payload: SlideDragData = {
                  songId: work.id,
                  slideId: slide.id,
                  title: work.title,
                  label: slide.label,
                };
                e.dataTransfer.setData(SLIDE_DRAG_TYPE, JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("application/x-pwc-media")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (dragBgOver !== slide.id) setDragBgOver(slide.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragBgOver === slide.id) setDragBgOver(null);
              }}
              onDrop={(e) => {
                if (dragBgOver === slide.id) setDragBgOver(null);
                const path = e.dataTransfer.getData("application/x-pwc-media");
                if (!path) return;
                e.preventDefault();
                updateSlide(slide.id, { background: path });
              }}
            >
              <button
                className="slide-grid-preview"
                onClick={() => goLiveSlide(work, index, work.title)}
                title={t("songs.goLive")}
              >
                {loaded ? (
                  <LazyPreview slide={liveSlide} />
                ) : (
                  <span className="slide-grid-skeleton" />
                )}
                {isLive && (
                  <span className="slide-grid-live-badge">
                    <Icon name="play" size={12} />
                  </span>
                )}
              </button>
              <button
                className="slide-grid-delete"
                title={t("songs.deleteSlide")}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSlide(slide.id);
                }}
              >
                <Icon name="x" size={12} />
              </button>
              <div className="slide-grid-footer">
                <span className="slide-grid-index">{index + 1}</span>
                <input
                  className="slide-grid-label"
                  value={slide.label}
                  placeholder={t("songs.slideLabel")}
                  onChange={(e) => updateSlide(slide.id, { label: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSlidesList = () => {
    if (!work) return null;
    return (
      <div className="slides-list">
        {work.slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`slide-card ${dragBgOver === slide.id ? "bg-over" : ""}`}
            draggable
            onDragStart={(e) => {
              const tag = (e.target as HTMLElement).tagName;
              if (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                tag === "BUTTON"
              ) {
                e.preventDefault();
                return;
              }
              const payload: SlideDragData = {
                songId: work.id,
                slideId: slide.id,
                title: work.title,
                label: slide.label,
              };
              e.dataTransfer.setData(SLIDE_DRAG_TYPE, JSON.stringify(payload));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("application/x-pwc-media")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (dragBgOver !== slide.id) setDragBgOver(slide.id);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dragBgOver === slide.id) setDragBgOver(null);
            }}
            onDrop={(e) => {
              if (dragBgOver === slide.id) setDragBgOver(null);
              const path = e.dataTransfer.getData("application/x-pwc-media");
              if (!path) return;
              e.preventDefault();
              updateSlide(slide.id, { background: path });
            }}
          >
            <div className="slide-top">
              <input
                className="slide-label-input"
                value={slide.label}
                placeholder={t("songs.slideLabel")}
                onChange={(e) => updateSlide(slide.id, { label: e.target.value })}
              />
              <select
                className="slide-template-select"
                value={slide.template_id ?? ""}
                title={t("songs.template")}
                onChange={(e) =>
                  updateSlide(slide.id, { template_id: e.target.value || null })
                }
              >
                <option value="">{t("songs.templateDefault")}</option>
                {songTemplates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
              <select
                className="slide-template-select"
                value={slide.background ?? ""}
                title={t("songs.slideBg")}
                onChange={(e) =>
                  updateSlide(slide.id, { background: e.target.value || null })
                }
              >
                <option value="">{t("songs.slideBgNone")}</option>
                {media.map((m) => (
                  <option key={m.id} value={m.file_path}>
                    {m.name}
                  </option>
                ))}
                {(!!slide.background &&
                  !media.some((m) => m.file_path === slide.background)) && (
                  <option value={slide.background}>{(slide.background)}</option>
                )}
              </select>
              <button
                className="primary"
                onClick={() => goLiveSlide(work, index, work.title)}
                title={t("songs.goLive")}
              >
                <Icon name="play" className="btn-ic" />
                {t("songs.goLive")}
              </button>
            </div>
            <textarea
              className="slide-text"
              value={slide.text}
              placeholder={t("songs.slideText")}
              onChange={(e) => updateSlide(slide.id, { text: e.target.value })}
              onFocus={() => setActiveSlideId(slide.id)}
              onKeyDown={(e) => {
                if (!e.ctrlKey) return;
                const f = slide.formatting ?? {};
                if (e.code === "KeyB") {
                  e.preventDefault();
                  patchFormatting(slide.id, {
                    bold: f.bold ? undefined : true,
                  });
                } else if (e.code === "KeyI") {
                  e.preventDefault();
                  patchFormatting(slide.id, {
                    italic: f.italic ? undefined : true,
                  });
                } else if (e.code === "KeyU") {
                  e.preventDefault();
                  patchFormatting(slide.id, {
                    underline: f.underline ? undefined : true,
                  });
                } else if (e.code === "KeyS") {
                  e.preventDefault();
                  if (saveTimer.current) window.clearTimeout(saveTimer.current);
                  saveSong(work);
                } else if (e.code === "KeyD") {
                  e.preventDefault();
                  const idx = work.slides.findIndex((s) => s.id === slide.id);
                  if (idx < 0) return;
                  const copy = { ...slide, id: uid() };
                  const slides = [...work.slides];
                  slides.splice(idx + 1, 0, copy);
                  const next = {
                    ...work,
                    slides,
                    arrangements: (work.arrangements ?? []).map((a) => ({
                      ...a,
                      order: a.order
                        .map((sid) =>
                          sid === slide.id ? [sid, copy.id] : [sid],
                        )
                        .flat(),
                    })),
                  };
                  scheduleSave(next);
                  setWork(next);
                  setActiveSlideId(copy.id);
                }
              }}
            />
            <div className="slide-text-tools">
              <button
                type="button"
                title={t("songs.insertVb")}
                onClick={() =>
                  updateSlide(slide.id, { text: slide.text + "[_VB]" })
                }
              >
                [_VB]
              </button>
            </div>
            <input
              className="slide-notes-input"
              value={slide.notes ?? ""}
              placeholder={t("songs.slideNotes")}
              onChange={(e) => updateSlide(slide.id, { notes: e.target.value })}
            />
            {renderFormatToolbar(slide)}
            {renderLayers(slide)}
            <div className="slide-actions">
              <button
                className="icon"
                disabled={index === 0}
                onClick={() => moveSlide(index, -1)}
                title={t("songs.moveUp")}
              >
                <Icon name="chevronUp" size={15} />
              </button>
              <button
                className="icon"
                disabled={index === work.slides.length - 1}
                onClick={() => moveSlide(index, 1)}
                title={t("songs.moveDown")}
              >
                <Icon name="chevronDown" size={15} />
              </button>
              <div className="spacer" />
              <button
                className="icon danger"
                onClick={() => removeSlide(slide.id)}
                title={t("songs.deleteSlide")}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSlidesHeader = () => (
    <div className="panel-head" style={{ padding: 0, borderBottom: "none" }}>
      <h2 style={{ fontSize: 13 }}>
        {t("songs.slides")} ({work ? work.slides.length : 0})
      </h2>
      <div className="view-toggle" role="group" aria-label="Xem">
        <button
          className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
          onClick={() => setViewMode("grid")}
          title={t("songs.gridView")}
        >
          <Icon name="grid" size={14} />
        </button>
        <button
          className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
          onClick={() => setViewMode("list")}
          title={t("songs.listView")}
        >
          <Icon name="list" size={14} />
        </button>
      </div>
      <button onClick={addSlide}>
        <Icon name="plus" className="btn-ic" />
        {t("songs.addSlide")}
      </button>
    </div>
  );

  const renderSlidesViews = () => (
    <>
      {renderSlidesHeader()}
      {viewMode === "grid" ? renderSlidesGrid() : renderSlidesList()}
    </>
  );

  const renderEditorBody = () => {
    if (!work) return null;
    return (
      <>
        <div className="field-row">
          <div className="field">
            <label>{t("songs.titleField")}</label>
            <input
              value={work.title}
              onChange={(e) => updateWork({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>{t("songs.artist")}</label>
            <input
              value={work.artist}
              onChange={(e) => updateWork({ artist: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 90 }}>
            <label>{t("songs.key")}</label>
            <input
              value={work.key}
              onChange={(e) => updateWork({ key: e.target.value })}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>{t("songs.ccli")}</label>
            <input
              value={work.ccli}
              onChange={(e) => updateWork({ ccli: e.target.value })}
            />
          </div>
          <div className="field">
            <label>{t("songs.copyright")}</label>
            <input
              value={work.copyright}
              onChange={(e) => updateWork({ copyright: e.target.value })}
            />
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label>{t("songs.template")}</label>
            <select
              value={work.template_id ?? ""}
              onChange={(e) => updateWork({ template_id: e.target.value || null })}
              title="Template mặc định cho bài hát"
            >
              <option value="">{t("songs.templateDefault")}</option>
              {songTemplates.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="panel-head" style={{ padding: 0, borderBottom: "none" }}>
          <h2 style={{ fontSize: 13 }}>{t("songs.arrangements")}</h2>
          <select
            value={activeArrangement ?? ""}
            onChange={(e) => setActiveArrangement(e.target.value || null)}
          >
            <option value="">{t("songs.arrangementDefault")}</option>
            {arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {!activeArr && (
            <button onClick={createArrangement}>
              <Icon name="plus" className="btn-ic" />
              {t("songs.newArrangement")}
            </button>
          )}
        </div>
        {activeArr ? (
          renderArrangementEditor()
        ) : (
          <>
            <div className="quick-paste-box">
              <div className="panel-head" style={{ padding: 0, borderBottom: "none" }}>
                <h2 style={{ fontSize: 13 }}>{t("songs.quickPaste")}</h2>
                <button className="primary" onClick={applyQuickPaste}>
                  <Icon name="zap" className="btn-ic" />
                  {t("songs.autoSplit")}
                </button>
              </div>
              <textarea
                className="quick-paste-input"
                value={quickPaste}
                placeholder={t("songs.quickPasteHint")}
                onChange={(e) => setQuickPaste(e.target.value)}
              />
            </div>
            {renderSlidesViews()}
          </>
        )}
      </>
    );
  };

  if (editingId) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <button className="ghost sm" onClick={() => setEditingId(null)} title={t("edit.back")}>
            <Icon name="chevronLeft" size={14} />
            {t("edit.back")}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="list-title" style={{ fontSize: 14 }}>
              {work?.title || t("songs.noTitle")}
            </div>
          </div>
          <button className="primary" onClick={() => setEditingId(null)}>
            {t("edit.done")}
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div className="panel-body">{renderEditorBody()}</div>
        </div>
        {showImportExport && <ImportExportModal onClose={() => setShowImportExport(false)} />}
      </div>
    );
  }

  return (
    <div className="panel" style={{ flexDirection: "row" }}>
      <div className="list-pane">
        <div className="panel-head">
          <h2>{t("songs.title")}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowImportExport(true)} title={t("toolbar.ccliReport") + " / Nhập & Xuất đa định dạng"}>
              Nhập/Xuất
            </button>
            <button className="primary" onClick={createSong}>
              <Icon name="plus" className="btn-ic" />
              {t("songs.add")}
            </button>
          </div>
        </div>
        <div className="list-search-wrap">
          <Icon name="search" size={13} />
          <input
            className="list-search"
            type="search"
            placeholder={t("songs.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="list-items">
          {songs.length === 0 && <div className="empty-hint">{t("songs.empty")}</div>}
          {songs.length > 0 && visibleSongs.length === 0 && (
            <div className="empty-hint">{t("songs.searchNone")}</div>
          )}
          {visibleSongs.map((song) => (
            <div
              key={song.id}
              className={`list-item ${selectedId === song.id ? "active" : ""}`}
              onClick={() => selectSong(song.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title">{song.title || t("songs.noTitle")}</div>
                <div className="list-sub">
                  {song.artist || "—"} · {song.slides.length} {t("songs.slideCount")}
                </div>
              </div>
              <button
                className="icon danger"
                title={t("songs.deleteSong")}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSong(song);
                }}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ flex: 1, minWidth: 0 }}>
        {!work ? (
          <div className="empty-hint">{t("songs.selectHint")}</div>
        ) : (
          <div className="panel-body">
            <div className="panel-head" style={{ padding: 0, borderBottom: "none" }}>
              <h2 style={{ fontSize: 13 }}>{work.title || t("songs.noTitle")}</h2>
              <button className="primary" onClick={() => openEditor(work.id)}>
                {t("songs.editSong")}
              </button>
            </div>
            {renderSlidesGrid()}
          </div>
        )}
      </div>
      {showImportExport && <ImportExportModal onClose={() => setShowImportExport(false)} />}
    </div>
  );
}
