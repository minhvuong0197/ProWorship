import { useState } from "react";
import type { MediaItem, AudioItem, EditItem, EditItemStyle, EditItemType, EditSlide } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { FONT_OPTIONS, ensureFontsLoaded } from "../../lib/fonts";
import Icon from "../Icon/Icon";
import { typeLabel } from "./helpers";

type Tab = "content" | "style" | "items" | "filters" | "slide";

interface Props {
  slide: EditSlide | null;
  activeItem: EditItem | null;
  items: EditItem[];
  selectedIds: string[];
  media: MediaItem[];
  audio: AudioItem[];
  onSelectItem: (id: string | null) => void;
  onPatchSlide: (patch: Partial<EditSlide>) => void;
  onPatchItem: (patch: Partial<EditItem>) => void;
  onPatchItemStyle: (patch: Partial<EditItemStyle>) => void;
  onAddItem: (type: EditItemType) => void;
  onRemoveItems: (ids: string[]) => void;
  onReorderZ: (dir: -1 | 1) => void;
  onReorderTo: (id: string, toIndex: number) => void;
}

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "content", labelKey: "edit.tabContent" },
  { key: "style", labelKey: "edit.tabStyle" },
  { key: "items", labelKey: "edit.tabItems" },
  { key: "filters", labelKey: "edit.tabFilters" },
  { key: "slide", labelKey: "edit.tabSlide" },
];

const FILTER_PRESETS: { label: string; value: string }[] = [
  { label: "Không", value: "" },
  { label: "Mờ", value: "blur(3px)" },
  { label: "Sáng", value: "brightness(1.25)" },
  { label: "Tối", value: "brightness(0.7)" },
  { label: "Tương phản", value: "contrast(1.15)" },
  { label: "Đen trắng", value: "grayscale(1)" },
  { label: "Nâu cổ", value: "sepia(0.6)" },
  { label: "Xoay màu", value: "hue-rotate(90deg)" },
  { label: "Đảo màu", value: "invert(1)" },
];

export default function EditInspector(props: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("items");

  return (
    <div className="edit-inspector">
      <div className="edit-tabs">
        {TABS.map((x) => (
          <button
            key={x.key}
            className={tab === x.key ? "active" : ""}
            onClick={() => setTab(x.key)}
            title={t(x.labelKey)}
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>
      <div className="edit-tab-body">
        {tab === "content" && <ContentTab {...props} />}
        {tab === "style" && <StyleTab {...props} />}
        {tab === "items" && <ItemsTab {...props} />}
        {tab === "filters" && <FiltersTab {...props} />}
        {tab === "slide" && <SlideTab {...props} />}
      </div>
    </div>
  );
}

function ContentTab({
  activeItem,
  media,
  audio,
  onPatchItem,
}: Props) {
  const t = useT();
  if (!activeItem) {
    return <div className="empty-hint">{t("edit.selectItemHint")}</div>;
  }
  const isText = activeItem.type === "text";
  return (
    <div className="inspector-fields">
      <label className="format-item">
        {t("edit.itemName")}
        <input
          value={activeItem.name}
          onChange={(e) => onPatchItem({ name: e.target.value })}
        />
      </label>
      {isText ? (
        <label className="format-item">
          {t("edit.itemContent")}
          <textarea
            rows={8}
            value={activeItem.content}
            onChange={(e) => onPatchItem({ content: e.target.value })}
          />
        </label>
      ) : (
        <MediaPicker
          item={activeItem}
          media={media}
          audio={audio}
          onPick={(path) => onPatchItem({ content: path })}
        />
      )}
    </div>
  );
}

function MediaPicker({
  item,
  media,
  audio,
  onPick,
}: {
  item: EditItem;
  media: MediaItem[];
  audio: AudioItem[];
  onPick: (path: string) => void;
}) {
  const t = useT();
  let sources: { id: string; name: string; path: string }[] = [];
  if (item.type === "image") {
    sources = media
      .filter((m) => m.kind === "image")
      .map((m) => ({ id: m.id, name: m.name, path: m.file_path }));
  } else if (item.type === "video") {
    sources = media
      .filter((m) => m.kind === "video")
      .map((m) => ({ id: m.id, name: m.name, path: m.file_path }));
  } else if (item.type === "audio") {
    sources = audio.map((a) => ({ id: a.id, name: a.name, path: a.file_path }));
  }
  return (
    <>
      <label className="format-item">
        {t("edit.mediaSource")}
        <select
          value={item.content}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="">{t("edit.noSource")}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.path}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {item.content && (
        <div className="muted-text" style={{ wordBreak: "break-all" }}>
          {item.content}
        </div>
      )}
    </>
  );
}

function StyleTab({
  activeItem,
  onPatchItem,
  onPatchItemStyle,
}: Props) {
  const t = useT();
  if (!activeItem) {
    return <div className="empty-hint">{t("edit.selectItemHint")}</div>;
  }
  const st = activeItem.style;
  const isText = activeItem.type === "text";
  const hasMedia = activeItem.type === "image" || activeItem.type === "video";
  const hasBox = activeItem.type === "shape" || activeItem.type === "text" || hasMedia;
  return (
    <div className="inspector-fields">
      <div className="field-row wrap">
        <label className="format-item">
          Độ trong suốt
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={activeItem.opacity}
            onChange={(e) => onPatchItem({ opacity: Number(e.target.value) })}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={activeItem.visible}
            onChange={(e) => onPatchItem({ visible: e.target.checked })}
          />
          {t("edit.visible")}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={activeItem.locked}
            onChange={(e) => onPatchItem({ locked: e.target.checked })}
          />
          {t("edit.locked")}
        </label>
      </div>

      {isText && (
        <>
          <div className="field-row wrap">
            <label className="format-item">
              {t("settings.fontFamily")}
              <select
                value={st.font_family ?? ""}
                onChange={(e) => {
                  ensureFontsLoaded();
                  onPatchItemStyle({ font_family: e.target.value || "" });
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
            <label className="format-item">
              {t("settings.fontSize")} (vh)
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={st.font_size ?? 4}
                onChange={(e) =>
                  onPatchItemStyle({ font_size: Number(e.target.value) || 4 })
                }
              />
            </label>
            <label className="format-item">
              {t("settings.textColor")}
              <input
                type="color"
                value={st.color ?? "#ffffff"}
                onChange={(e) => onPatchItemStyle({ color: e.target.value })}
              />
            </label>
          </div>
          <div className="field-row wrap">
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!st.bold}
                onChange={(e) => onPatchItemStyle({ bold: e.target.checked })}
              />
              <b>B</b>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!st.italic}
                onChange={(e) => onPatchItemStyle({ italic: e.target.checked })}
              />
              <i>I</i>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!st.underline}
                onChange={(e) => onPatchItemStyle({ underline: e.target.checked })}
              />
              <u>U</u>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!st.outline_enabled}
                onChange={(e) =>
                  onPatchItemStyle({ outline_enabled: e.target.checked })
                }
              />
              {t("songs.outline")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!st.shadow_enabled}
                onChange={(e) =>
                  onPatchItemStyle({ shadow_enabled: e.target.checked })
                }
              />
              {t("songs.shadow")}
            </label>
          </div>
          {(st.outline_enabled || st.shadow_enabled) && (
            <div className="field-row wrap">
              {st.outline_enabled && (
                <>
                  <input
                    type="color"
                    value={st.outline_color ?? "#000000"}
                    onChange={(e) =>
                      onPatchItemStyle({ outline_color: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={st.outline_width ?? 2}
                    title={t("songs.outlineWidth")}
                    onChange={(e) =>
                      onPatchItemStyle({ outline_width: Number(e.target.value) || 0 })
                    }
                  />
                </>
              )}
              {st.shadow_enabled && (
                <>
                  <input
                    type="color"
                    value={st.shadow_color ?? "#000000"}
                    onChange={(e) =>
                      onPatchItemStyle({ shadow_color: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    min={-30}
                    max={30}
                    value={st.shadow_offset_x ?? 0}
                    title="X"
                    onChange={(e) =>
                      onPatchItemStyle({ shadow_offset_x: Number(e.target.value) || 0 })
                    }
                  />
                  <input
                    type="number"
                    min={-30}
                    max={30}
                    value={st.shadow_offset_y ?? 4}
                    title="Y"
                    onChange={(e) =>
                      onPatchItemStyle({ shadow_offset_y: Number(e.target.value) || 0 })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={st.shadow_blur ?? 12}
                    title={t("songs.shadowBlur")}
                    onChange={(e) =>
                      onPatchItemStyle({ shadow_blur: Number(e.target.value) || 0 })
                    }
                  />
                </>
              )}
            </div>
          )}
          <div className="field-row wrap">
            <label className="format-item">
              {t("settings.align")} H
              <select
                value={st.align_h ?? "center"}
                onChange={(e) =>
                  onPatchItemStyle({
                    align_h: e.target.value as EditItemStyle["align_h"],
                  })
                }
              >
                <option value="left">{t("settings.alignLeft")}</option>
                <option value="center">{t("settings.alignCenter")}</option>
                <option value="right">{t("settings.alignRight")}</option>
              </select>
            </label>
            <label className="format-item">
              {t("settings.alignV")}
              <select
                value={st.align_v ?? "middle"}
                onChange={(e) =>
                  onPatchItemStyle({
                    align_v: e.target.value as EditItemStyle["align_v"],
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
                value={st.line_height ?? 1.35}
                onChange={(e) =>
                  onPatchItemStyle({ line_height: Number(e.target.value) || 1.35 })
                }
              />
            </label>
            <label className="format-item">
              {t("songs.letterSpacing")} (px)
              <input
                type="number"
                min={-5}
                max={30}
                value={st.letter_spacing ?? 0}
                onChange={(e) =>
                  onPatchItemStyle({ letter_spacing: Number(e.target.value) || 0 })
                }
              />
            </label>
          </div>
        </>
      )}

      {hasMedia && (
        <label className="format-item">
          {t("edit.fitMode")}
          <select
            value={st.fit_mode ?? "cover"}
            onChange={(e) =>
              onPatchItemStyle({
                fit_mode: e.target.value as EditItemStyle["fit_mode"],
              })
            }
          >
            <option value="cover">Phủ kín</option>
            <option value="contain">Vừa khung</option>
            <option value="fill">Kéo giãn</option>
          </select>
        </label>
      )}

      {hasBox && (
        <div className="field-row wrap">
          <label className="format-item">
            {t("edit.bgColor")}
            <input
              type="color"
              value={st.bg_color || "#00000000"}
              onChange={(e) => onPatchItemStyle({ bg_color: e.target.value })}
            />
          </label>
          <label className="format-item">
            {t("edit.border")}
            <input
              type="number"
              min={0}
              max={20}
              value={st.border_width ?? 0}
              onChange={(e) =>
                onPatchItemStyle({ border_width: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label className="format-item">
            {t("edit.borderColor")}
            <input
              type="color"
              value={st.border_color ?? "#ffffff"}
              onChange={(e) => onPatchItemStyle({ border_color: e.target.value })}
            />
          </label>
          <label className="format-item">
            {t("edit.radius")}
            <input
              type="number"
              min={0}
              max={50}
              value={st.radius ?? 0}
              onChange={(e) =>
                onPatchItemStyle({ radius: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}

function ItemsTab({
  slide,
  items,
  selectedIds,
  onSelectItem,
  onAddItem,
  onRemoveItems,
  onReorderTo,
}: Props) {
  const t = useT();
  const sorted = items.slice().sort((a, b) => b.zIndex - a.zIndex);
  return (
    <div className="edit-items-tab">
      <div className="edit-add-row">
        {(["text", "image", "video", "shape", "audio"] as EditItemType[]).map(
          (type) => (
            <button key={type} className="sm" onClick={() => onAddItem(type)}>
              + {typeLabel(type)}
            </button>
          ),
        )}
      </div>
      <div className="edit-layers-list">
        {sorted.length === 0 && (
          <div className="muted-text" style={{ fontSize: 12 }}>
            {t("edit.emptyLayers")}
          </div>
        )}
        {sorted.map((item, i) => {
          const isSelected = selectedIds.includes(item.id);
          const canUp = i > 0;
          const canDown = i < sorted.length - 1;
          return (
            <div
              key={item.id}
              className={`edit-layer-row ${isSelected ? "active" : ""}`}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  onSelectItem(item.id);
                } else {
                  onSelectItem(item.id);
                }
              }}
            >
              <button
                className="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                  onReorderTo(item.id, Math.max(0, i - 1));
                }}
                disabled={!canUp}
                title={t("edit.bringForward")}
              >
                <Icon name="chevronUp" size={13} />
              </button>
              <button
                className="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                  onReorderTo(item.id, Math.min(sorted.length - 1, i + 1));
                }}
                disabled={!canDown}
                title={t("edit.sendBackward")}
              >
                <Icon name="chevronDown" size={13} />
              </button>
              <span className="edit-layer-name">
                {item.name || typeLabel(item.type)}
              </span>
              <button
                className="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                }}
                title={t("edit.visible")}
              >
                <Icon name={item.visible ? "eye" : "eyeOff"} size={14} />
              </button>
              <button
                className="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                }}
                title={t("edit.locked")}
              >
                <Icon name={item.locked ? "slash" : "square"} size={13} />
              </button>
              <button
                className="icon danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItems([item.id]);
                }}
                title={t("songs.deleteSlide")}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {slide && (
        <div className="muted-text" style={{ fontSize: 11, padding: "6px 2px" }}>
          {sorted.length} {t("edit.itemCount")}
        </div>
      )}
    </div>
  );
}

function FiltersTab({ activeItem, onPatchItemStyle }: Props) {
  const t = useT();
  if (!activeItem) {
    return <div className="empty-hint">{t("edit.selectItemHint")}</div>;
  }
  const current = activeItem.style.filter ?? "";
  return (
    <div className="inspector-fields">
      <div className="filter-preset-grid">
        {FILTER_PRESETS.map((p) => (
          <button
            key={p.value}
            className={`sm ${current === p.value ? "active" : ""}`}
            onClick={() => onPatchItemStyle({ filter: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="format-item">
        {t("templates.bgFilter")}
        <input
          value={current}
          placeholder="brightness(1.1) contrast(1.2)"
          onChange={(e) => onPatchItemStyle({ filter: e.target.value })}
        />
      </label>
      <div className="muted-text" style={{ fontSize: 11 }}>
        {t("edit.filterHint")}
      </div>
    </div>
  );
}

function SlideTab({
  slide,
  media,
  onPatchSlide,
}: Props) {
  const t = useT();
  if (!slide) {
    return <div className="empty-hint">{t("edit.selectSlideHint")}</div>;
  }
  return (
    <div className="inspector-fields">
      <label className="format-item">
        {t("songs.slideLabel")}
        <input
          value={slide.label}
          onChange={(e) => onPatchSlide({ label: e.target.value })}
        />
      </label>
      <div className="field-row wrap">
        <label className="format-item">
          {t("settings.bgColor")}
          <input
            type="color"
            value={slide.bg_color || "#000000"}
            onChange={(e) => onPatchSlide({ bg_color: e.target.value })}
          />
        </label>
        <label className="format-item">
          {t("songs.slideBg")}
          <select
            value={slide.background ?? ""}
            onChange={(e) =>
              onPatchSlide({ background: e.target.value || null })
            }
          >
            <option value="">{t("songs.slideBgNone")}</option>
            {media.map((m) => (
              <option key={m.id} value={m.file_path}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row wrap">
        <label className="format-item">
          {t("preview.transition")}
          <select
            value={slide.transition}
            onChange={(e) =>
              onPatchSlide({ transition: e.target.value as EditSlide["transition"] })
            }
          >
            <option value="cut">Cắt</option>
            <option value="fade">Mờ dần</option>
          </select>
        </label>
        <label className="format-item">
          {t("obs.transitionDuration")}
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={slide.transition_duration_ms}
            onChange={(e) =>
              onPatchSlide({
                transition_duration_ms: Number(e.target.value) || 0,
              })
            }
          />
        </label>
      </div>
      <label className="format-item">
        {t("songs.slideNotes")}
        <textarea
          rows={4}
          value={slide.notes}
          onChange={(e) => onPatchSlide({ notes: e.target.value })}
        />
      </label>
    </div>
  );
}
