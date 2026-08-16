import { useEffect, useMemo, useRef, useState } from "react";
import type { SlideDragData, Template } from "../lib/types";
import { SLIDE_DRAG_TYPE, uid } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";
import TemplateEditorWindow from "./TemplateEditor/TemplateEditorWindow";

const CATEGORY_LABELS: Record<string, string> = {
  lyric: "settings.tplCatLyric",
  bible: "settings.tplCatBible",
  christmas: "settings.tplCatChristmas",
  easter: "settings.tplCatEaster",
  notice: "settings.tplCatNotice",
  other: "settings.tplCatOther",
};

export default function TemplatesPanel() {
  const t = useT();
  const templates = useAppStore((s) => s.templates);
  const songs = useAppStore((s) => s.songs);
  const settings = useAppStore((s) => s.settings);
  const saveTemplate = useAppStore((s) => s.saveTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const restoreDefaultTemplates = useAppStore((s) => s.restoreDefaultTemplates);
  const setSettings = useAppStore((s) => s.setSettings);

  const [filterCat, setFilterCat] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; tpl: Template } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const visible: Template[] = useMemo(
    () =>
      filterCat === "all"
        ? templates
        : templates.filter((x) => (x.category || "other") === filterCat),
    [templates, filterCat],
  );

  const add = () => {
    const tp: Template = {
      id: uid(),
      name: t("settings.newTemplate"),
      category: filterCat === "all" ? "lyric" : filterCat,
      bg_color: "#000000",
      text_color: "#ffffff",
      font_size: 6,
      align: "center",
      position: "center",
      elements: [],
    };
    saveTemplate(tp);
    openEditor(tp.id);
  };

  const openEditor = (id: string | null) => {
    setEditingId(id);
  };

  const duplicate = (src: Template) => {
    const tp: Template = {
      ...src,
      id: uid(),
      name: `${src.name} (bản sao)`,
      elements: (src.elements ?? []).map((el) => ({ ...el, id: uid() })),
      overrides: (src.overrides ?? []).map((ov) => ({ ...ov, id: uid() })),
    };
    saveTemplate(tp);
  };

  const remove = (tp: Template) => {
    if (!window.confirm(`${t("settings.templateDelete")} "${tp.name}"?`)) return;
    deleteTemplate(tp.id);
  };

  const createTemplateFromSlide = (data: SlideDragData) => {
    const song = songs.find((s) => s.id === data.songId);
    const slide = song?.slides.find((s) => s.id === data.slideId);
    const fmt = slide?.formatting;
    const align = fmt?.align_h === "left" || fmt?.align_h === "right" ? fmt.align_h : "center";
    const tp: Template = {
      id: uid(),
      name: data.title ? `${data.title} · ${data.label || "Slide"}` : "Mẫu từ slide",
      category: "lyric",
      bg_color: "#000000",
      text_color: fmt?.color ?? "#ffffff",
      font_size: fmt?.font_size ?? 6,
      align,
      position: "center",
      elements: [
        {
          id: uid(),
          kind: "text",
          content: "{text}",
          x: 25,
          y: 35,
          w: 50,
          h: 30,
          color: fmt?.color ?? "#ffffff",
          font_size: fmt?.font_size ?? 6,
          align,
          bold: !!fmt?.bold,
          italic: !!fmt?.italic,
          underline: !!fmt?.underline,
          opacity: 1,
          visible: true,
        },
      ],
    };
    saveTemplate(tp);
    openEditor(tp.id);
  };

  const setDefaultFor = (category: string, tplId: string) => {
    if (!settings) return;
    if (category === "bible")
      setSettings({ ...settings, default_bible_template_id: tplId });
    else setSettings({ ...settings, default_template_id: tplId });
  };

  const isDefaultFor = (category: string, tplId: string) =>
    category === "bible"
      ? settings?.default_bible_template_id === tplId
      : settings?.default_template_id === tplId;

  const catLabel = (cat?: string) => CATEGORY_LABELS[cat || "other"] ?? CATEGORY_LABELS.other;

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
        <TemplateEditorWindow initialTemplateId={editingId} onClose={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="panel" style={{ flexDirection: "column" }}>
      <div className="panel-head">
        <h2>{t("templates.title")}</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="ghost sm"
            onClick={() => {
              if (window.confirm(t("settings.restoreTemplatesConfirm"))) {
                restoreDefaultTemplates();
              }
            }}
            title={t("settings.restoreTemplates")}
          >
            <Icon name="repeat" size={13} />
          </button>
          <button className="primary" onClick={add}>
            {t("settings.newTemplate")}
          </button>
        </div>
      </div>
      <div className="tpl-filter" style={{ padding: "8px 10px" }}>
        <button className={filterCat === "all" ? "active" : ""} onClick={() => setFilterCat("all")}>
          {t("settings.tplCatAll")}
        </button>
        {Object.entries(CATEGORY_LABELS).map(([value, labelKey]) => (
          <button
            key={value}
            className={filterCat === value ? "active" : ""}
            onClick={() => setFilterCat(value)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="tpl-drop-hint">{t("templates.dropHint")}</div>
      <div
        className={`templates-grid ${dragOver ? "drop-over" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(SLIDE_DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (dragOver) setDragOver(false);
        }}
        onDrop={(e) => {
          if (dragOver) setDragOver(false);
          const raw = e.dataTransfer.getData(SLIDE_DRAG_TYPE);
          if (!raw) return;
          e.preventDefault();
          try {
            createTemplateFromSlide(JSON.parse(raw) as SlideDragData);
          } catch {
            /* ignore malformed payload */
          }
        }}
      >
        {visible.map((tp: Template) => (
          <div
            key={tp.id}
            className="tpl-card"
            onClick={() => openEditor(tp.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY, tpl: tp });
            }}
          >
            <div
              className="tpl-card-preview"
              style={{
                background: tp.bg_color,
                color: tp.text_color,
                justifyContent:
                  tp.position === "top"
                    ? "flex-start"
                    : tp.position === "bottom"
                      ? "flex-end"
                      : "center",
              }}
            >
              <div style={{ textAlign: tp.align, fontSize: `${Math.max(2, tp.font_size * 0.5)}vh` }}>
                {tp.name}
              </div>
            </div>
            <div className="tpl-card-actions">
              <span className="tpl-card-cat">{t(catLabel(tp.category))}</span>
              <button
                className="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor(tp.id);
                }}
                title={t("templates.edit")}
              >
                ✎
              </button>
              <button
                className={`sm ${isDefaultFor(tp.category || "other", tp.id) ? "primary" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDefaultFor(tp.category || "other", tp.id);
                }}
                title={t("templates.setDefault")}
              >
                ★
              </button>
              <button
                className="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicate(tp);
                }}
                title={t("templates.duplicate")}
              >
                ⧉
              </button>
              <button
                className="sm danger"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(tp);
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="tpl-drop-empty">{t("templates.dropHint")}</div>}
      </div>
      {menu && (
        <div
          className="tpl-context-menu"
          ref={menuRef}
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - 160),
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button onClick={() => { openEditor(menu.tpl.id); setMenu(null); }}>
            <span className="tpl-ctx-glyph">✎</span>
            {t("templates.edit")}
          </button>
          <button onClick={() => { duplicate(menu.tpl); setMenu(null); }}>
            <span className="tpl-ctx-glyph">⧉</span>
            {t("templates.duplicate")}
          </button>
          <button onClick={() => { setDefaultFor(menu.tpl.category || "other", menu.tpl.id); setMenu(null); }}>
            <span className="tpl-ctx-glyph">★</span>
            {t("templates.setDefault")}
          </button>
          <button
            className="danger"
            onClick={() => { remove(menu.tpl); setMenu(null); }}
          >
            <Icon name="x" size={14} />
            {t("templates.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
