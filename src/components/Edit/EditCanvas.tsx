import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { EditItem, EditSlide } from "../../lib/types";
import { STAGE_W, STAGE_H, RenderItemContent, RenderSlideBg } from "./SlideView";
import { useT } from "../../lib/i18n";
import { editBusy } from "../../lib/editBusy";

interface Props {
  slide: EditSlide | null;
  selectedIds: string[];
  showGrid: boolean;
  snapEnabled: boolean;
  onSelectItem: (id: string | null, additive?: boolean) => void;
  onPatchItems: (patches: { id: string; patch: Partial<EditItem> }[]) => void;
  onPatchItem: (itemId: string, patch: Partial<EditItem>) => void;
  onRemoveItems: (ids: string[]) => void;
  onHistoryStart: () => void;
  onHistoryEnd: () => void;
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

const GRID = 5;

interface Orig {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  mode: "move" | "resize";
  handle?: Handle;
  startX: number;
  startY: number;
  origs: Record<string, Orig>;
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export default function EditCanvas({
  slide,
  selectedIds,
  showGrid,
  snapEnabled,
  onSelectItem,
  onPatchItems,
  onPatchItem,
  onRemoveItems,
  onHistoryStart,
  onHistoryEnd,
}: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragState = useRef<DragState | null>(null);
  const patchItemsRef = useRef(onPatchItems);
  const snapRef = useRef(snapEnabled);
  patchItemsRef.current = onPatchItems;
  snapRef.current = snapEnabled;

  useEffect(() => {
    editBusy.active = selectedIds.length > 0;
    return () => {
      editBusy.active = false;
    };
  }, [selectedIds]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / STAGE_W, r.height / STAGE_H);
      setScale(Math.min(Math.max(s, 0.1), 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toStage = useCallback(
    (clientX: number, clientY: number) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return {
        x: (clientX - r.left) / scale,
        y: (clientY - r.top) / scale,
      };
    },
    [scale],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const p = toStage(e.clientX, e.clientY);
      const state = dragState.current;
      if (!state) return;
      if (state.mode === "move") {
        const dxPct = (p.x - state.startX) / STAGE_W * 100;
        const dyPct = (p.y - state.startY) / STAGE_H * 100;
        const patches: { id: string; patch: Partial<EditItem> }[] = [];
        for (const item of slide?.items ?? []) {
          const o = state.origs[item.id];
          if (!o) continue;
          let nx = o.x + dxPct;
          let ny = o.y + dyPct;
          if (snapRef.current) {
            nx = snap(nx);
            ny = snap(ny);
          }
          patches.push({
            id: item.id,
            patch: {
              x: clamp(nx, 0, Math.max(100 - item.w, 0)),
              y: clamp(ny, 0, Math.max(100 - item.h, 0)),
            },
          });
        }
        if (patches.length) patchItemsRef.current(patches);
      } else {
        const item = slide?.items.find((it) => it.id in state.origs);
        if (!item) return;
        const o = state.origs[item.id];
        const dxPct = (p.x - state.startX) / STAGE_W * 100;
        const dyPct = (p.y - state.startY) / STAGE_H * 100;
        let { x, y, w, h } = { x: o.x, y: o.y, w: o.w, h: o.h };
        const handle = state.handle ?? "se";
        if (handle.includes("e")) w = o.w + dxPct;
        if (handle.includes("s")) h = o.h + dyPct;
        if (handle.includes("w")) {
          w = o.w - dxPct;
          x = o.x + dxPct;
        }
        if (handle.includes("n")) {
          h = o.h - dyPct;
          y = o.y + dyPct;
        }
        let nx = clamp(x, 0, 100 - 2);
        let ny = clamp(y, 0, 100 - 2);
        let nw = Math.max(w, 2);
        let nh = Math.max(h, 2);
        if (snapRef.current) {
          nx = snap(nx);
          ny = snap(ny);
          nw = snap(nw);
          nh = snap(nh);
        }
        onPatchItem(item.id, { x: nx, y: ny, w: nw, h: nh });
      }
    };
    const onUp = () => {
      dragState.current = null;
      setDrag(null);
      onHistoryEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, slide, toStage, onPatchItem, onHistoryEnd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedIds.length === 0) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const items = (slide?.items ?? []).filter(
        (it) => selectedIds.includes(it.id) && !it.locked,
      );
      if (items.length === 0) return;
      if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        onHistoryStart();
        onRemoveItems(selectedIds);
        onHistoryEnd();
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      const dir =
        e.code === "ArrowUp"
          ? { dx: 0, dy: -step }
          : e.code === "ArrowDown"
            ? { dx: 0, dy: step }
            : e.code === "ArrowLeft"
              ? { dx: -step, dy: 0 }
              : e.code === "ArrowRight"
                ? { dx: step, dy: 0 }
                : null;
      if (!dir) return;
      e.preventDefault();
      onHistoryStart();
      const patches = items.map((it) => {
        let nx = it.x + dir.dx;
        let ny = it.y + dir.dy;
        if (snapRef.current) {
          nx = snap(nx);
          ny = snap(ny);
        }
        return {
          id: it.id,
          patch: {
            x: clamp(nx, 0, Math.max(100 - it.w, 0)),
            y: clamp(ny, 0, Math.max(100 - it.h, 0)),
          },
        };
      });
      patchItemsRef.current(patches);
      onHistoryEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, slide, onRemoveItems, onHistoryStart, onHistoryEnd]);

  const startMove = (e: React.PointerEvent, item: EditItem) => {
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    onSelectItem(item.id, additive);
    if (item.locked) return;
    const ids = additive && selectedIds.includes(item.id)
      ? selectedIds
      : additive
        ? [...selectedIds, item.id]
        : [item.id];
    const p = toStage(e.clientX, e.clientY);
    const origs: Record<string, Orig> = {};
    for (const it of slide?.items ?? []) {
      if (ids.includes(it.id)) {
        origs[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
      }
    }
    const st = { mode: "move" as const, startX: p.x, startY: p.y, origs };
    dragState.current = st;
    setDrag(st);
    onHistoryStart();
  };

  const startResize = (e: React.PointerEvent, item: EditItem, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    const p = toStage(e.clientX, e.clientY);
    const origs: Record<string, Orig> = {
      [item.id]: { x: item.x, y: item.y, w: item.w, h: item.h },
    };
    const st = { mode: "resize" as const, handle, startX: p.x, startY: p.y, origs };
    dragState.current = st;
    setDrag(st);
    onHistoryStart();
  };

  const ordered = slide
    ? slide.items.slice().sort((a, b) => a.zIndex - b.zIndex)
    : [];

  return (
    <div className="edit-canvas-wrap" ref={wrapRef}>
      {!slide ? (
        <div className="empty-hint">{t("edit.noSlide")}</div>
      ) : (
        <div
          className="edit-canvas-stage"
          style={{ width: STAGE_W * scale, height: STAGE_H * scale }}
        >
          <div
            className="edit-canvas-scale"
            ref={stageRef}
            style={{
              width: STAGE_W,
              height: STAGE_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {showGrid && <div className="edit-canvas-grid" />}
            <RenderSlideBg slide={slide} />
            {ordered
              .filter((it) => it.visible)
              .map((item) => {
                const selected = selectedIds.includes(item.id);
                const style: CSSProperties = {
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.w}%`,
                  height: `${item.h}%`,
                  opacity: item.opacity,
                  filter: item.style.filter || undefined,
                  zIndex: item.zIndex,
                };
                return (
                  <div
                    key={item.id}
                    className={`edit-item ${selected ? "selected" : ""} ${item.locked ? "locked" : ""}`}
                    style={style}
                    onPointerDown={(e) => startMove(e, item)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RenderItemContent item={item} pxPerVh={9} />
                    {selected && !item.locked && (
                      <div className="edit-item-handles">
                        {HANDLES.map((h) => (
                          <span
                            key={h}
                            className={`edit-handle ${h}`}
                            onPointerDown={(e) => startResize(e, item, h)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {drag && (
              <div className="edit-drag-guides">
                <span className="guide-v" style={{ left: `${drag.origs[Object.keys(drag.origs)[0]]?.x ?? 0}%` }} />
                <span className="guide-h" style={{ top: `${drag.origs[Object.keys(drag.origs)[0]]?.y ?? 0}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
