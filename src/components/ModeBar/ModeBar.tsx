import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";
import type {
  CenterView,
  LibraryMode,
  ToolMode,
} from "../../lib/nav";

interface Props {
  centerView: CenterView;
  onLibraryMode: (m: LibraryMode) => void;
  onToolMode: (m: ToolMode) => void;
  onShow: () => void;
}

const LIBRARY_TABS: { key: LibraryMode; labelKey: string; icon: IconName }[] = [
  { key: "songs", labelKey: "tab.songs", icon: "music" },
  { key: "bible", labelKey: "tab.bible", icon: "book" },
  { key: "media", labelKey: "tab.media", icon: "film" },
  { key: "audio", labelKey: "tab.audio", icon: "audio" },
];

const TOOL_TABS: { key: ToolMode; labelKey: string; icon: IconName }[] = [
  { key: "edit", labelKey: "tab.edit", icon: "layout" },
  { key: "overlays", labelKey: "tab.overlays", icon: "layers" },
  { key: "functions", labelKey: "tab.functions", icon: "grid" },
  { key: "props", labelKey: "tab.props", icon: "presentation" },
  { key: "obs", labelKey: "tab.obs", icon: "camera" },
];

export default function ModeBar({
  centerView,
  onLibraryMode,
  onToolMode,
  onShow,
}: Props) {
  const t = useT();
  const activeLibrary =
    centerView.kind === "library"
      ? centerView.mode
      : centerView.kind === "editor"
        ? centerView.editor
        : null;
  return (
    <div className="modebar">
      <div className="modebar-group">
        <button
          className={centerView.kind === "show" ? "active" : ""}
          onClick={onShow}
          title={t("tab.presentation")}
        >
          <Icon name="presentation" size={14} />
          {t("tab.presentation")}
        </button>
      </div>
      <div className="modebar-sep" />
      <div className="modebar-group">
        {LIBRARY_TABS.map((x) => (
          <button
            key={x.key}
            className={activeLibrary === x.key ? "active" : ""}
            onClick={() => onLibraryMode(x.key)}
            title={t(x.labelKey)}
          >
            <Icon name={x.icon} size={14} />
            {t(x.labelKey)}
          </button>
        ))}
      </div>
      <div className="modebar-sep" />
      <div className="modebar-group">
        {TOOL_TABS.map((x) => (
          <button
            key={x.key}
            className={
              centerView.kind === "tool" && centerView.mode === x.key
                ? "active"
                : ""
            }
            onClick={() => onToolMode(x.key)}
            title={t(x.labelKey)}
          >
            <Icon name={x.icon} size={14} />
            {t(x.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
