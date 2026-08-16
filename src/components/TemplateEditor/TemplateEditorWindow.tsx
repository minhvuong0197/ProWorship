import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Template, TemplateElement, TemplateElementKind, StyleOverride } from "../../lib/types";
import { uid } from "../../lib/types";
import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import { parseCss } from "../StyledText";
import { EL_LABELS, isTextual, newElement, newTemplate, renderElBody } from "./helpers";
import { api } from "../../lib/api";
import { clampReferenceRect, REF_TOKEN_RE, useAutoRepositionRef } from "../../lib/useAutoFit";

const win = getCurrentWebviewWindow();

const SONG_TOKENS: { token: string; hintKey: string }[] = [
  { token: "{text}", hintKey: "templates.token_text" },
  { token: "{title}", hintKey: "templates.token_title" },
  { token: "{label}", hintKey: "templates.token_label" },
  { token: "{date}", hintKey: "templates.token_date" },
  { token: "{time}", hintKey: "templates.token_time" },
  { token: "{day}", hintKey: "templates.token_day" },
  { token: "{month}", hintKey: "templates.token_month" },
  { token: "{year}", hintKey: "templates.token_year" },
  { token: "%TITLE%", hintKey: "templates.token_title" },
  { token: "%SLIDE_LABEL%", hintKey: "templates.token_label" },
  { token: "%TEXT%", hintKey: "templates.token_text" },
  { token: "%DATE%", hintKey: "templates.token_date" },
  { token: "%TIME%", hintKey: "templates.token_time" },
  { token: "%HOUR%", hintKey: "templates.token_hour" },
  { token: "%MINUTE%", hintKey: "templates.token_minute" },
  { token: "%SECOND%", hintKey: "templates.token_second" },
  { token: "%DAY_OF_WEEK%", hintKey: "templates.token_day" },
  { token: "%MONTH%", hintKey: "templates.token_month" },
  { token: "%YEAR%", hintKey: "templates.token_year" },
];

const BIBLE_TOKENS: { token: string; hintKey: string }[] = [
  { token: "{scripture_text}", hintKey: "templates.token_scripture_text" },
  { token: "{scripture_reference}", hintKey: "templates.token_scripture_reference" },
  { token: "{scripture_name}", hintKey: "templates.token_scripture_name" },
  { token: "{scripture_book}", hintKey: "templates.token_scripture_book" },
  { token: "{scripture_chapter}", hintKey: "templates.token_scripture_chapter" },
  { token: "{scripture_verse}", hintKey: "templates.token_scripture_verse" },
  { token: "{scripture_verses}", hintKey: "templates.token_scripture_verses" },
  { token: "{label}", hintKey: "templates.token_label" },
  { token: "{title}", hintKey: "templates.token_title" },
  { token: "{date}", hintKey: "templates.token_date" },
  { token: "{time}", hintKey: "templates.token_time" },
  { token: "{day}", hintKey: "templates.token_day" },
  { token: "%SCRIPTURETEXT%", hintKey: "templates.token_scripture_text" },
  { token: "%SCRIPTUREREF%", hintKey: "templates.token_scripture_reference" },
  { token: "%BIBLENAME%", hintKey: "templates.token_scripture_name" },
  { token: "%BIBLECHAPTER%", hintKey: "templates.token_scripture_chapter" },
  { token: "%BIBLEVERSE%", hintKey: "templates.token_scripture_verse" },
  { token: "%BIBLEVERSES%", hintKey: "templates.token_scripture_verses" },
  { token: "%DATE%", hintKey: "templates.token_date" },
  { token: "%TIME%", hintKey: "templates.token_time" },
  { token: "%HOUR%", hintKey: "templates.token_hour" },
  { token: "%MINUTE%", hintKey: "templates.token_minute" },
  { token: "%SECOND%", hintKey: "templates.token_second" },
  { token: "%DAY_OF_WEEK%", hintKey: "templates.token_day" },
  { token: "%MONTH%", hintKey: "templates.token_month" },
  { token: "%YEAR%", hintKey: "templates.token_year" },
];

interface Props {
  initialTemplateId?: string | null;
  onClose?: () => void;
}

export default function TemplateEditorWindow({ initialTemplateId, onClose }: Props) {
  const t = useT();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingId, setEditingId] = useState<string | null>(
    () => initialTemplateId ?? new URLSearchParams(window.location.search).get("id"),
  );
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const [nameDraft, setNameDraft] = useState<string>("");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    api
      .getTemplates()
      .then((list) => {
        setTemplates(list);
        if (!editingId && list.length > 0) setEditingId(list[0].id);
      })
      .catch(() => {});

    listen<string>("template-editor-open", (ev) => {
      if (ev.payload) setEditingId(ev.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editing: Template | null = useMemo(
    () => templates.find((tt) => tt.id === editingId) ?? null,
    [templates, editingId],
  );

  useEffect(() => {
    if (!editing) return;
    if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current);
    setNameDraft(editing.name);
  }, [editingId, editing?.name]);

  const persist = (patch: Partial<Template>) => {
    if (!editing) return;
    const next = { ...editing, ...patch };
    setTemplates((prev) => prev.map((x) => (x.id === next.id ? next : x)));
    save(next);
  };

  const save = async (tpl: Template) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      await api.saveTemplate(tpl);
    } catch (err) {
      console.error("[template-editor] save failed:", err);
    } finally {
      loadingRef.current = false;
    }
  };

  const updateName = (value: string) => {
    if (!editing) return;
    setNameDraft(value);
    if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current);
    nameTimerRef.current = window.setTimeout(() => persist({ name: value }), 400);
  };

  const patchEl = (id: string, patch: Partial<TemplateElement>) => {
    if (!editing) return;
    persist({
      elements: (editing.elements ?? []).map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  };

  const addElement = (kind: TemplateElementKind) => {
    if (!editing) return;
    const el = newElement(kind);
    persist({ elements: [...(editing.elements ?? []), el] });
    setSelectedEl(el.id);
  };

  const removeElement = (id: string) => {
    if (!editing) return;
    persist({ elements: (editing.elements ?? []).filter((el) => el.id !== id) });
    setSelectedEl((cur) => (cur === id ? null : cur));
  };

  const duplicateElement = (id: string) => {
    if (!editing) return;
    const src = (editing.elements ?? []).find((el) => el.id === id);
    if (!src) return;
    const copy = { ...src, id: uid(), x: src.x + 2, y: src.y + 2 };
    persist({ elements: [...(editing.elements ?? []), copy] });
    setSelectedEl(copy.id);
  };

  const moveElement = (id: string, dir: -1 | 1) => {
    if (!editing) return;
    const els = [...(editing.elements ?? [])];
    const i = els.findIndex((el) => el.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= els.length) return;
    [els[i], els[j]] = [els[j], els[i]];
    persist({ elements: els });
  };

  const snapTargets = () => {
    const vs = new Set<number>([0, 50, 100]);
    const hs = new Set<number>([0, 50, 100]);
    for (const el of editing?.elements ?? []) {
      if (!el.visible) continue;
      vs.add(el.x);
      vs.add(el.x + el.w);
      vs.add(el.x + el.w / 2);
      hs.add(el.y);
      hs.add(el.y + el.h);
      hs.add(el.y + el.h / 2);
    }
    return { vs: [...vs].sort((a, b) => a - b), hs: [...hs].sort((a, b) => a - b) };
  };

  const snapTo = (val: number, targets: number[], snapRange = 0.6) => {
    for (const tgt of targets) {
      if (Math.abs(val - tgt) <= snapRange) return { val: tgt, snap: true };
    }
    return { val, snap: false };
  };

  const beginDrag = (e: React.MouseEvent, id: string, mode: "move" | "nw" | "ne" | "sw" | "se") => {
    e.stopPropagation();
    e.preventDefault();
    if (!editing || !canvasRef.current) return;
    setSelectedEl(id);
    const canvas = canvasRef.current;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const el = (editing.elements ?? []).find((x) => x.id === id);
    if (!el) return;
    const sX = el.x;
    const sY = el.y;
    const sW = el.w;
    const sH = el.h;
    const { vs, hs } = snapTargets();

    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / cw) * 100;
      const dy = ((ev.clientY - startY) / ch) * 100;
      let gV: number | null = null;
      let gH: number | null = null;
      if (mode === "move") {
        let nx = sX + dx;
        let ny = sY + dy;
        const sx = snapTo(nx, vs);
        const sy = snapTo(ny, hs);
        nx = sx.val;
        ny = sy.val;
        if (sx.snap) gV = nx;
        if (sy.snap) gH = ny;
        patchEl(id, {
          x: Math.max(-100, Math.min(100, nx)),
          y: Math.max(-100, Math.min(100, ny)),
        });
      } else {
        let nx = sX;
        let ny = sY;
        let nw = sW;
        let nh = sH;
        if (mode === "nw" || mode === "ne") {
          const sy = snapTo(sY + dy, hs);
          ny = sy.val;
          if (sy.snap) gH = ny;
        }
        if (mode === "sw" || mode === "se") {
          const sy = snapTo(sH + dy, hs);
          nh = sy.val;
          if (sy.snap) gH = nh;
        }
        if (mode === "nw" || mode === "sw") {
          const sx = snapTo(sX + dx, vs);
          nx = sx.val;
          if (sx.snap) gV = nx;
        }
        if (mode === "ne" || mode === "se") {
          const sx = snapTo(sW + dx, vs);
          nw = sx.val;
          if (sx.snap) gV = nw;
        }
        patchEl(id, { x: nx, y: ny, w: nw, h: nh });
      }
      setGuides({ v: gV, h: gH });
    };
    const onUp = () => {
      setGuides({ v: null, h: null });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const selected = (editing?.elements ?? []).find((el) => el.id === selectedEl) ?? null;

  const addOverride = () => {
    if (!editing) return;
    persist({
      overrides: [...(editing.overrides ?? []), { id: uid(), match: "", bold: true, transform: "none" }],
    });
  };

  const patchOverride = (id: string, patch: Partial<StyleOverride>) => {
    if (!editing) return;
    persist({
      overrides: (editing.overrides ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  };

  const removeOverride = (id: string) => {
    if (!editing) return;
    persist({ overrides: (editing.overrides ?? []).filter((x) => x.id !== id) });
  };

  const closeWindow = () => {
    if (onClose) {
      onClose();
    } else {
      win.close();
    }
  };

  if (!editing) {
    return (
      <div className="tpl-win">
        <div className="tpl-win-topbar">
          <button className="icon" onClick={closeWindow} title="Đóng">
            <Icon name="x" size={16} />
          </button>
          <h2>{t("templates.title")}</h2>
          <div className="grow" />
          <button className="primary sm" onClick={() => { const nt = newTemplate(); save(nt); setTemplates((p) => [...p, nt]); setEditingId(nt.id); }}>
            {t("settings.newTemplate")}
          </button>
        </div>
        <div className="tpl-win-body">
          <div className="tpl-win-list">
            {templates.map((tp) => (
              <div
                key={tp.id}
                className={`tpl-win-item ${editingId === tp.id ? "sel" : ""}`}
                onClick={() => setEditingId(tp.id)}
              >
                <span className="swatch" style={{ background: tp.bg_color }} />
                <span className="name">{tp.name}</span>
                <span className="cat">{tp.category || "other"}</span>
              </div>
            ))}
            {templates.length === 0 && <div className="empty-hint">{t("templates.empty")}</div>}
          </div>
          <div className="tpl-win-editor">
            <div className="empty-hint">{t("templates.selectHint")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tpl-win">
      <div className="tpl-win-topbar">
        <button className="icon" onClick={closeWindow} title={t("templates.back")}>
          <Icon name="x" size={16} />
        </button>
        <input value={nameDraft} onChange={(e) => updateName(e.target.value)} style={{ maxWidth: 220 }} />
        <span className="bible-book-sub">{editing.category || "other"}</span>
        <div className="grow" />
        <button className="sm" onClick={() => addElement("text")}>T+ {t("templates.addText")}</button>
        <button className="sm" onClick={() => addElement("image")}>I+ {t("templates.addImage")}</button>
        {selected && (
          <>
            <button className="sm" onClick={() => duplicateElement(selected.id)}>
              ⧉ {t("templates.copy")}
            </button>
            <button className="sm danger" onClick={() => removeElement(selected.id)}>
              <Icon name="x" size={13} /> {t("templates.delete")}
            </button>
          </>
        )}
      </div>
      <div className="tpl-win-body">
        <div className="tpl-win-list">
          {templates.map((tp) => (
            <div
              key={tp.id}
              className={`tpl-win-item ${editingId === tp.id ? "sel" : ""}`}
              onClick={() => setEditingId(tp.id)}
            >
              <span className="swatch" style={{ background: tp.bg_color }} />
              <span className="name">{tp.name}</span>
              <span className="cat">{tp.category || "other"}</span>
            </div>
          ))}
          <button
            className="sm"
            onClick={() => {
              const nt = newTemplate();
              save(nt);
              setTemplates((p) => [...p, nt]);
              setEditingId(nt.id);
            }}
          >
            + {t("settings.newTemplate")}
          </button>
        </div>
        <div className="tpl-main" style={{ flex: 1, minWidth: 0 }}>
          <div className="tpl-layers">
            <div className="tpl-add">
              <div className="tpl-pane-head">{t("templates.add")}</div>
              <div className="tpl-add-grid">
                {(["text", "image", "line", "chord", "scroll", "countdown", "clock", "icon", "box"] as TemplateElementKind[]).map((k) => (
                  <button key={k} onClick={() => addElement(k)}>
                    <span className="tpl-add-icon"><Icon name={EL_LABELS[k]} size={16} /></span>
                    {t(`templates.elem_${k}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="tpl-pane-head tpl-layers-head">{t("templates.layers")}</div>
            <div className="tpl-layer-list">
              {(editing.elements ?? []).map((el, i) => (
                <div
                  key={el.id}
                  className={`tpl-layer ${selectedEl === el.id ? "sel" : ""}`}
                  onClick={() => setSelectedEl(el.id)}
                >
                  <span className="tpl-layer-icon"><Icon name={EL_LABELS[el.kind]} size={14} /></span>
                  <span className="tpl-layer-name">
                    {isTextual(el.kind)
                      ? el.content || t("templates.elem_text")
                      : el.kind === "box"
                        ? t("templates.box")
                        : t("templates.elem_image")}
                  </span>
                  <button
                    className={`tpl-layer-eye ${!el.visible ? "off" : ""}`}
                    title={t("templates.visible")}
                    onClick={(e) => {
                      e.stopPropagation();
                      patchEl(el.id, { visible: !el.visible });
                    }}
                  >
                    {el.visible ? <Icon name="eye" size={14} /> : <Icon name="eyeOff" size={14} />}
                  </button>
                  <button className="tpl-layer-up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveElement(el.id, -1); }}>
                    <Icon name="chevronUp" size={14} />
                  </button>
                  <button
                    className="tpl-layer-down"
                    disabled={i === (editing.elements ?? []).length - 1}
                    onClick={(e) => { e.stopPropagation(); moveElement(el.id, 1); }}
                  >
                    <Icon name="chevronDown" size={14} />
                  </button>
                  <button className="tpl-layer-del" onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              {(editing.elements ?? []).length === 0 && (
                <div className="tpl-layer-empty">{t("templates.emptyLayers")}</div>
              )}
            </div>
          </div>
          <div className="tpl-center">
            <div
              className="tpl-canvas"
              ref={canvasRef}
              style={{ background: editing.bg_color }}
              onClick={() => setSelectedEl(null)}
            >
              {(editing.elements ?? []).map((el) => (
                <TplElementBox
                  key={el.id}
                  el={el}
                  elements={editing.elements ?? []}
                  selected={selectedEl === el.id}
                  overrides={editing.overrides}
                  isBible={editing.category === "bible"}
                  onSelect={(id) => setSelectedEl(id)}
                  onDragStart={(e, id, mode) => beginDrag(e, id, mode)}
                />
              ))}
              <div className="tpl-canvas-hint">{t("templates.canvasHint")}</div>
              {guides.v !== null && <div className="tpl-guide v" style={{ left: `${guides.v}%` }} />}
              {guides.h !== null && <div className="tpl-guide h" style={{ top: `${guides.h}%` }} />}
            </div>
          </div>
          <div className="tpl-inspector">
            {selected ? (
              <ElementProps
                el={selected}
                onPatch={(patch) => patchEl(selected.id, patch)}
                onRemove={() => removeElement(selected.id)}
                isBible={editing.category === "bible"}
              />
            ) : (
              <TemplateProps
                tpl={editing}
                onPatch={persist}
                overrides={editing.overrides ?? []}
                onAddOverride={addOverride}
                onPatchOverride={patchOverride}
                onRemoveOverride={removeOverride}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TplElementBox({
  el,
  elements,
  selected,
  overrides,
  isBible,
  onSelect,
  onDragStart,
}: {
  el: TemplateElement;
  elements: TemplateElement[];
  selected: boolean;
  overrides?: StyleOverride[];
  isBible: boolean;
  onSelect: (id: string) => void;
  onDragStart: (
    e: React.MouseEvent,
    id: string,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isRef =
    !!el.visible && el.kind === "text" && REF_TOKEN_RE.test(el.content ?? "");
  const topPx = useAutoRepositionRef(hostRef, isRef ? el : null, elements, {
    marginPct: 2,
  });
  const rect = isRef ? clampReferenceRect(el) : el;
  const style: CSSProperties = {
    left: `${rect.x}%`,
    top: topPx !== null ? `${topPx}px` : `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
    opacity: el.visible ? el.opacity : 0.25,
    ...parseCss(el.css),
  };
  return (
    <div
      ref={hostRef}
      data-el-id={el.id}
      className={`tpl-el ${selected ? "sel" : ""}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(el.id);
      }}
      onMouseDown={(e) => onDragStart(e, el.id, "move")}
    >
      {renderElBody(el, overrides, isBible)}
      {selected && (
        <>
          <span className="tpl-handle nw" onMouseDown={(e) => onDragStart(e, el.id, "nw")} />
          <span className="tpl-handle ne" onMouseDown={(e) => onDragStart(e, el.id, "ne")} />
          <span className="tpl-handle sw" onMouseDown={(e) => onDragStart(e, el.id, "sw")} />
          <span className="tpl-handle se" onMouseDown={(e) => onDragStart(e, el.id, "se")} />
        </>
      )}
    </div>
  );
}

function TemplateProps(props: {
  tpl: Template;
  onPatch: (p: Partial<Template>) => void;
  overrides: StyleOverride[];
  onAddOverride: () => void;
  onPatchOverride: (id: string, p: Partial<StyleOverride>) => void;
  onRemoveOverride: (id: string) => void;
}) {
  const t = useT();
  const { tpl, onPatch, overrides, onAddOverride, onPatchOverride, onRemoveOverride } = props;
  return (
    <div className="tpl-props">
      <div className="field">
        <label>{t("settings.templateCategory")}</label>
        <select
          value={tpl.category || "other"}
          onChange={(e) => onPatch({ category: e.target.value })}
        >
          {["lyric", "bible", "christmas", "easter", "notice", "other"].map((c) => (
            <option key={c} value={c}>{t(`settings.tplCat${c[0].toUpperCase()}${c.slice(1)}`)}</option>
          ))}
        </select>
      </div>
      <div className="field-row wrap">
        <div className="field">
          <label>{t("settings.bgColor")}</label>
          <input type="color" value={tpl.bg_color} onChange={(e) => onPatch({ bg_color: e.target.value })} />
        </div>
        <div className="field">
          <label>{t("settings.textColor")}</label>
          <input type="color" value={tpl.text_color} onChange={(e) => onPatch({ text_color: e.target.value })} />
        </div>
        <div className="field">
          <label>{t("settings.fontSize")}</label>
          <input
            type="number"
            min={2}
            max={14}
            step={1}
            value={tpl.font_size}
            onChange={(e) => onPatch({ font_size: Number(e.target.value) || 6 })}
          />
        </div>
      </div>
      <div className="field">
        <label>{t("templates.bgFilter")}</label>
        <input
          placeholder="blur(4px) brightness(0.8)…"
          value={tpl.bg_filter || ""}
          onChange={(e) => onPatch({ bg_filter: e.target.value })}
        />
      </div>
      <div className="tpl-prop-section">{t("templates.overrides")}</div>
      <div className="tpl-overrides">
        {overrides.map((ov) => (
          <div key={ov.id} className="tpl-override-row">
            <input
              placeholder={t("templates.overrideMatch")}
              value={ov.match}
              onChange={(e) => onPatchOverride(ov.id, { match: e.target.value })}
            />
            <label className="check-row" title="B">
              <input type="checkbox" checked={!!ov.bold} onChange={(e) => onPatchOverride(ov.id, { bold: e.target.checked })} />
              B
            </label>
            <label className="check-row" title="I">
              <input type="checkbox" checked={!!ov.italic} onChange={(e) => onPatchOverride(ov.id, { italic: e.target.checked })} />
              I
            </label>
            <input type="color" value={ov.color || "#ffffff"} onChange={(e) => onPatchOverride(ov.id, { color: e.target.value })} />
            <button className="tpl-override-del" onClick={() => onRemoveOverride(ov.id)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <button className="sm" onClick={onAddOverride}>+ {t("templates.addOverride")}</button>
      </div>
    </div>
  );
}

function ElementProps(props: {
  el: TemplateElement;
  onPatch: (p: Partial<TemplateElement>) => void;
  onRemove: () => void;
  isBible: boolean;
}) {
  const t = useT();
  const { el, onPatch, onRemove, isBible } = props;
  return (
    <div className="tpl-props">
      <div className="field">
        <label>{t(`templates.elem_${el.kind}`)}</label>
        <textarea
          rows={2}
          value={el.content}
          onChange={(e) => onPatch({ content: e.target.value })}
        />
      </div>
      {isTextual(el.kind) && (
        <div className="tpl-dyn-hint">
          {isBible ? t("templates.dynBibleHint") : t("templates.dynHint")}
        </div>
      )}
      {isTextual(el.kind) && (
        <div className="tpl-tokens">
          <span className="muted-text" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
            {t("templates.dynInsert")}
          </span>
          <div className="tpl-token-list">
            {(isBible ? BIBLE_TOKENS : SONG_TOKENS).map((tk) => (
              <button
                key={tk.token}
                className="tpl-token"
                title={t(tk.hintKey)}
                onClick={() =>
                  onPatch({
                    content: el.content
                      ? `${el.content} ${tk.token}`
                      : tk.token,
                  })
                }
              >
                {tk.token}
              </button>
            ))}
          </div>
        </div>
      )}
      {isTextual(el.kind) && (
        <div className="field-row wrap">
          <label className="check-row" title={t("templates.bold")}>
            <input type="checkbox" checked={el.bold} onChange={(e) => onPatch({ bold: e.target.checked })} />
            B
          </label>
          <label className="check-row" title={t("templates.italic")}>
            <input type="checkbox" checked={el.italic} onChange={(e) => onPatch({ italic: e.target.checked })} />
            I
          </label>
          <label className="check-row" title={t("templates.outline")}>
            <input type="checkbox" checked={!!el.outline} onChange={(e) => onPatch({ outline: e.target.checked })} />
            {t("templates.outline")}
          </label>
          <label className="check-row" title={t("templates.shadow")}>
            <input type="checkbox" checked={!!el.shadow} onChange={(e) => onPatch({ shadow: e.target.checked })} />
            {t("templates.shadow")}
          </label>
        </div>
      )}
      <div className="field-row wrap">
        <div className="field fs">
          <label>{t("settings.fontSize")}</label>
          <input
            type="number"
            min={0.5}
            max={40}
            step={0.5}
            value={el.font_size}
            onChange={(e) => onPatch({ font_size: Number(e.target.value) || 5 })}
          />
        </div>
        <div className="field">
          <label>{t("settings.textColor")}</label>
          <input type="color" value={el.color} onChange={(e) => onPatch({ color: e.target.value })} />
        </div>
        <div className="field">
          <label>{t("settings.align")}</label>
          <select value={el.align} onChange={(e) => onPatch({ align: e.target.value as TemplateElement["align"] })}>
            <option value="center">{t("settings.alignCenter")}</option>
            <option value="left">{t("settings.alignLeft")}</option>
            <option value="right">{t("settings.alignRight")}</option>
          </select>
        </div>
      </div>
      {el.kind === "text" && (
        <div className="field">
          <label>{t("templates.autoSize")}</label>
          <select
            value={el.auto_size ? el.fit_mode ?? "shrink" : "off"}
            onChange={(e) => {
              const v = e.target.value;
              onPatch({ auto_size: v !== "off", fit_mode: v as "shrink" | "grow" | "none" });
            }}
          >
            <option value="off">{t("templates.autoSizeOff")}</option>
            <option value="shrink">{t("templates.autoSizeShrink")}</option>
            <option value="grow">{t("templates.autoSizeGrow")}</option>
          </select>
        </div>
      )}
      <div className="tpl-prop-section">{t("templates.position")}</div>
      <div className="field-row wrap">
        {(["x", "y", "w", "h"] as const).map((key) => (
          <div className="field" key={key}>
            <label>{key.toUpperCase()}</label>
            <input
              type="number"
              min={key === "x" || key === "y" ? -100 : 1}
              max={100}
              value={Math.round(el[key])}
              onChange={(e) =>
                onPatch({ [key]: Number(e.target.value) || (key === "x" || key === "y" ? 0 : 10) })
              }
            />
          </div>
        ))}
      </div>
      <div className="field">
        <label>{t("templates.css")}</label>
        <textarea
          rows={2}
          placeholder="letter-spacing:2px; text-shadow:0 0 8px red;"
          value={el.css ?? ""}
          onChange={(e) => onPatch({ css: e.target.value })}
        />
      </div>
      <button className="sm danger" onClick={onRemove}>
        <Icon name="x" size={13} /> {t("templates.delete")}
      </button>
    </div>
  );
}
