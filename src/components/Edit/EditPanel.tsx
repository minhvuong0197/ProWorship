import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EditItem,
  EditItemStyle,
  EditItemType,
  EditShow,
  EditSlide,
} from "../../lib/types";
import { uid } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import EditCanvas from "./EditCanvas";
import EditInspector from "./EditInspector";
import {
  newShow,
  newSlide,
  newItem,
  maxZIndex,
  moveItemZ,
  patchItem,
  patchItemStyle,
  alignItems,
  type AlignMode,
} from "./helpers";
import { RenderSlideContent } from "./SlideView";

const MAX_HISTORY = 60;

export default function EditPanel() {
  const t = useT();
  const editShows = useAppStore((s) => s.editShows);
  const media = useAppStore((s) => s.media);
  const audio = useAppStore((s) => s.audio);
  const saveEditShow = useAppStore((s) => s.saveEditShow);
  const deleteEditShow = useAppStore((s) => s.deleteEditShow);

  const [activeShowId, setActiveShowId] = useState<string | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [work, setWork] = useState<EditShow | null>(null);
  const [dragSlideId, setDragSlideId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const historyRef = useRef<{ past: EditShow[]; future: EditShow[] }>({
    past: [],
    future: [],
  });
  const historyTimer = useRef<number | null>(null);
  const pendingSnapshot = useRef<EditShow | null>(null);
  const workRef = useRef<EditShow | null>(null);

  useEffect(() => {
    workRef.current = work;
  }, [work]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (historyTimer.current) window.clearTimeout(historyTimer.current);
    };
  }, []);

  const scheduleSave = (next: EditShow) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveEditShow(next), 350);
  };

  // ---- History (undo / redo) ----
  const pushHistory = useCallback((snapshot: EditShow | null) => {
    if (!snapshot) return;
    const hist = historyRef.current;
    hist.past.push(JSON.parse(JSON.stringify(snapshot)) as EditShow);
    if (hist.past.length > MAX_HISTORY) hist.past.shift();
    hist.future = [];
  }, []);

  const snapshotForHistory = useCallback((show: EditShow) => {
    pendingSnapshot.current = JSON.parse(JSON.stringify(show)) as EditShow;
  }, []);

  const commitHistory = useCallback(() => {
    if (!pendingSnapshot.current) return;
    const snap = pendingSnapshot.current;
    const current = workRef.current;
    if (current && JSON.stringify(current) !== JSON.stringify(snap)) {
      pushHistory(snap);
    }
    pendingSnapshot.current = null;
  }, [pushHistory]);

  const undo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.past.length === 0 || !work) return;
    const prev = hist.past.pop()!;
    hist.future.push(JSON.parse(JSON.stringify(work)) as EditShow);
    setWork(prev);
    scheduleSave(prev);
  }, [work, scheduleSave]);

  const redo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.future.length === 0 || !work) return;
    const next = hist.future.pop()!;
    hist.past.push(JSON.parse(JSON.stringify(work)) as EditShow);
    setWork(next);
    scheduleSave(next);
  }, [work, scheduleSave]);

  useEffect(() => {
    if (!activeShowId) {
      setWork(null);
      setActiveSlideId(null);
      setSelectedIds([]);
      historyRef.current = { past: [], future: [] };
      pendingSnapshot.current = null;
      return;
    }
    const show = editShows.find((s) => s.id === activeShowId);
    if (!show) return;
    const copy = JSON.parse(JSON.stringify(show)) as EditShow;
    setWork(copy);
    setActiveSlideId(
      (prev) =>
        (prev && copy.slides.some((s) => s.id === prev))
          ? prev
          : copy.slides[0]?.id ?? null,
    );
    setSelectedIds([]);
    historyRef.current = { past: [], future: [] };
    pendingSnapshot.current = null;
  }, [activeShowId, editShows]);

  const createShow = () => {
    const show = newShow();
    setActiveShowId(show.id);
    setWork(show);
    setActiveSlideId(show.slides[0]?.id ?? null);
    setSelectedIds([]);
    saveEditShow(show);
  };

  const deleteShow = (show: EditShow) => {
    if (!window.confirm(`${t("edit.deleteShowConfirm")} "${show.name}"?`)) return;
    if (activeShowId === show.id) {
      setActiveShowId(null);
      setWork(null);
      setActiveSlideId(null);
      setSelectedIds([]);
    }
    deleteEditShow(show.id);
  };

  const updateWork = (patch: Partial<EditShow>) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  };

  const updateSlide = (slideId: string, patch: Partial<EditSlide>) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === slideId ? { ...sl, ...patch } : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
  };

  const mapItems = (fn: (items: EditItem[]) => EditItem[]) => {
    if (!activeSlideId) return;
    setWork((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        slides: prev.slides.map((sl) =>
          sl.id === activeSlideId ? { ...sl, items: fn(sl.items) } : sl,
        ),
      };
      scheduleSave(next);
      return next;
    });
  };

  const activeSlide = work?.slides.find((s) => s.id === activeSlideId) ?? null;
  const activeItem = activeSlide?.items.find((it) => it.id === selectedIds[selectedIds.length - 1]) ?? null;

  const selectItem = useCallback(
    (id: string | null, additive = false) => {
      setSelectedIds((prev) => {
        if (!id) return [];
        if (additive) {
          return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        }
        return [id];
      });
    },
    [],
  );

  const patchActiveItem = (patch: Partial<EditItem>) => {
    if (!activeItem?.id) return;
    mapItems((items) => patchItem(items, activeItem.id, patch));
  };

  const patchItems = (patches: { id: string; patch: Partial<EditItem> }[]) => {
    mapItems((items) =>
      items.map((it) => {
        const p = patches.find((x) => x.id === it.id);
        return p ? { ...it, ...p.patch } : it;
      }),
    );
  };

  const patchActiveItemStyle = (patch: Partial<EditItemStyle>) => {
    if (!activeItem?.id) return;
    mapItems((items) => patchItemStyle(items, activeItem.id, patch));
  };

  const addItem = (type: EditItemType) => {
    if (!activeSlide) return;
    let path = "";
    if (type === "image") path = media.find((m) => m.kind === "image")?.file_path ?? "";
    if (type === "video") path = media.find((m) => m.kind === "video")?.file_path ?? "";
    if (type === "audio") path = audio[0]?.file_path ?? "";
    const item = newItem(type, maxZIndex(activeSlide.items) + 1, path);
    mapItems((items) => [...items, item]);
    setSelectedIds([item.id]);
  };

  const removeItems = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    mapItems((items) => items.filter((it) => !idSet.has(it.id)));
    setSelectedIds([]);
  };

  const reorderZ = (dir: -1 | 1) => {
    if (!activeItem?.id) return;
    mapItems((items) => moveItemZ(items, activeItem.id, dir));
  };

  const applyAlign = (mode: AlignMode) => {
    if (!activeSlide || selectedIds.length === 0) return;
    mapItems((items) => alignItems(items, selectedIds, mode));
  };

  const addSlide = () => {
    const sl = newSlide(work?.slides.length ?? 0);
    setWork((prev) => {
      if (!prev) return prev;
      const next = { ...prev, slides: [...prev.slides, sl] };
      scheduleSave(next);
      return next;
    });
    setActiveSlideId(sl.id);
    setSelectedIds([]);
  };

  const duplicateSlide = (id: string) => {
    setWork((prev) => {
      if (!prev) return prev;
      const idx = prev.slides.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const src = prev.slides[idx];
      const copy: EditSlide = {
        ...src,
        id: uid(),
        label: `${src.label || t("edit.slides")} (bản sao)`,
        items: src.items.map((it) => ({ ...it, id: uid() })),
      };
      const slides = [...prev.slides];
      slides.splice(idx + 1, 0, copy);
      const next = { ...prev, slides };
      scheduleSave(next);
      return next;
    });
  };

  const removeSlide = (id: string) => {
    setWork((prev) => {
      if (!prev) return prev;
      const next = { ...prev, slides: prev.slides.filter((s) => s.id !== id) };
      scheduleSave(next);
      return next;
    });
    if (activeSlideId === id) {
      setActiveSlideId(work?.slides.find((s) => s.id !== id)?.id ?? null);
      setSelectedIds([]);
    }
  };

  const dropSlide = (targetId: string) => {
    if (!work || !dragSlideId || dragSlideId === targetId) return;
    const from = work.slides.findIndex((s) => s.id === dragSlideId);
    const to = work.slides.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const slides = [...work.slides];
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    const next = { ...work, slides };
    setWork(next);
    scheduleSave(next);
    setDragSlideId(null);
  };

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const code = e.code.toLowerCase();
      if (code === "keyz" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (code === "keyz" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (code === "keyy") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    const onNew = () => createShow();
    const onDuplicate = () => {
      if (activeSlideId) duplicateSlide(activeSlideId);
    };
    const onSave = () => {
      if (!work) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveEditShow(work);
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
  }, [work, activeSlideId, activeShowId]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  if (!activeShowId) {
    return (
      <div className="panel edit-panel">
        <div className="panel-head edit-topbar">
          <h2>{t("edit.title")}</h2>
          <div className="field-row">
            <select
              value={activeShowId ?? ""}
              onChange={(e) => setActiveShowId(e.target.value || null)}
            >
              <option value="">{t("edit.selectShow")}</option>
              {editShows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="primary" onClick={createShow} title={t("edit.newShow")}>
              <Icon name="plus" className="btn-ic" />
              {t("edit.newShow")}
            </button>
          </div>
        </div>
        <div className="empty-hint" style={{ flex: 1 }}>
          {t("edit.selectShowHint")}
        </div>
      </div>
    );
  }

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
      <div className="edit-full-topbar">
        <button className="icon" onClick={() => setActiveShowId(null)} title={t("edit.back")}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <input
          className="edit-show-name"
          value={work?.name ?? ""}
          placeholder={t("edit.showName")}
          onChange={(e) => updateWork({ name: e.target.value })}
        />
        <div className="edit-tool-sep" />
        <button
          className={`icon ${canUndo ? "" : "disabled"}`}
          onClick={undo}
          disabled={!canUndo}
          title={t("shortcuts.action.undo") + " (Ctrl+Z)"}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          className={`icon ${canRedo ? "" : "disabled"}`}
          onClick={redo}
          disabled={!canRedo}
          title={t("shortcuts.action.redo") + " (Ctrl+Y)"}
        >
          <Icon name="redo" size={16} />
        </button>
        <div className="edit-tool-sep" />
        <button className="icon" onClick={() => applyAlign("left")} title={t("edit.alignLeft")} disabled={selectedIds.length === 0}>
          <Icon name="alignLeft" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("centerH")} title={t("edit.alignCenterH")} disabled={selectedIds.length === 0}>
          <Icon name="alignCenter" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("right")} title={t("edit.alignRight")} disabled={selectedIds.length === 0}>
          <Icon name="alignRight" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("top")} title={t("edit.alignTop")} disabled={selectedIds.length === 0}>
          <Icon name="alignTop" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("centerV")} title={t("edit.alignCenterV")} disabled={selectedIds.length === 0}>
          <Icon name="alignMiddle" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("bottom")} title={t("edit.alignBottom")} disabled={selectedIds.length === 0}>
          <Icon name="alignBottom" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("distributeH")} title={t("edit.distributeH")} disabled={selectedIds.length < 3}>
          <Icon name="distributeH" size={15} />
        </button>
        <button className="icon" onClick={() => applyAlign("distributeV")} title={t("edit.distributeV")} disabled={selectedIds.length < 3}>
          <Icon name="distributeV" size={15} />
        </button>
        <div className="edit-tool-sep" />
        <button className="icon" onClick={() => reorderZ(-1)} title={t("edit.sendBackward")} disabled={!activeItem}>
          <Icon name="chevronDown" size={16} />
        </button>
        <button className="icon" onClick={() => reorderZ(1)} title={t("edit.bringForward")} disabled={!activeItem}>
          <Icon name="chevronUp" size={16} />
        </button>
        <div className="edit-tool-sep" />
        <button
          className={`icon ${showGrid ? "active" : ""}`}
          onClick={() => setShowGrid((v) => !v)}
          title={t("edit.toggleGrid")}
        >
          <Icon name="grid" size={15} />
        </button>
        <button
          className={`icon ${snapEnabled ? "active" : ""}`}
          onClick={() => setSnapEnabled((v) => !v)}
          title={t("edit.toggleSnap")}
        >
          <Icon name="magnet" size={15} />
        </button>
        <div className="edit-tool-sep" />
        <button className="sm danger" onClick={() => deleteShow(work!)} title={t("edit.deleteShow")}>
          <Icon name="trash" size={14} />
        </button>
        <button className="primary sm" onClick={() => setActiveShowId(null)}>
          {t("edit.done")}
        </button>
      </div>

      <div className="edit-main">
        <aside className="edit-left">
          <div className="panel-head" style={{ padding: "6px 8px" }}>
            <span className="muted-text">
              {t("edit.slides")} ({work?.slides.length ?? 0})
            </span>
            <button className="primary sm" onClick={addSlide}>
              <Icon name="plus" className="btn-ic" />
              {t("songs.addSlide")}
            </button>
          </div>
          <div className="edit-slides-list">
            {(work?.slides ?? []).map((slide, index) => (
              <div
                key={slide.id}
                className={`edit-thumb ${activeSlideId === slide.id ? "active" : ""} ${
                  dragSlideId === slide.id ? "dragging" : ""
                }`}
                onClick={() => {
                  setActiveSlideId(slide.id);
                  setSelectedIds([]);
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragSlideId(slide.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropSlide(slide.id);
                }}
                onDragEnd={() => setDragSlideId(null)}
              >
                <div className="edit-thumb-canvas">
                  <RenderSlideContent slide={slide} pxPerVh={1.1} />
                </div>
                <div className="edit-thumb-meta">
                  <span className="edit-thumb-label">
                    {index + 1}. {slide.label || t("edit.slides")}
                  </span>
                  <span className="edit-thumb-count">
                    {slide.items.length} {t("edit.itemsShort")}
                  </span>
                </div>
                <div className="edit-thumb-actions">
                  <button
                    className="icon"
                    title={t("edit.duplicateSlide")}
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateSlide(slide.id);
                    }}
                  >
                    <Icon name="layers" size={13} />
                  </button>
                  <button
                    className="icon danger"
                    title={t("songs.deleteSlide")}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlide(slide.id);
                    }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section
          className="edit-center"
          onClick={() => setSelectedIds([])}
        >
          <EditCanvas
            slide={activeSlide}
            selectedIds={selectedIds}
            showGrid={showGrid}
            snapEnabled={snapEnabled}
            onSelectItem={selectItem}
            onPatchItems={patchItems}
            onPatchItem={(id, patch) => patchItems([{ id, patch }])}
            onRemoveItems={removeItems}
            onHistoryStart={() => work && snapshotForHistory(work)}
            onHistoryEnd={commitHistory}
          />
        </section>

        <aside className="edit-right">
          <EditInspector
            slide={activeSlide}
            activeItem={activeItem}
            items={activeSlide?.items ?? []}
            selectedIds={selectedIds}
            media={media}
            audio={audio}
            onSelectItem={(id) => selectItem(id)}
            onPatchSlide={(patch) => activeSlideId && updateSlide(activeSlideId, patch)}
            onPatchItem={patchActiveItem}
            onPatchItemStyle={patchActiveItemStyle}
            onAddItem={addItem}
            onRemoveItems={removeItems}
            onReorderZ={reorderZ}
            onReorderTo={(id, toIndex) => {
              mapItems((items) => {
                const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
                const from = sorted.findIndex((it) => it.id === id);
                if (from < 0) return items;
                const [moved] = sorted.splice(from, 1);
                sorted.splice(toIndex, 0, moved);
                return sorted.map((it, i) => ({ ...it, zIndex: i + 1 }));
              });
            }}
          />
        </aside>
      </div>
    </div>
  );
}
