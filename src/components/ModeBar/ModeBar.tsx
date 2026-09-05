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

const LIBRARY_TABS: { key: LibraryMode; labelKey: string; icon: IconName; color: string }[] = [
  { key: "songs", labelKey: "tab.songs", icon: "music", color: "#c084fc" },
  { key: "bible", labelKey: "tab.bible", icon: "bible", color: "#5b9dff" },
  { key: "media", labelKey: "tab.media", icon: "image", color: "#34d399" },
  { key: "audio", labelKey: "tab.audio", icon: "audio", color: "#fbbf24" },
];

const TOOL_TABS: { key: ToolMode; labelKey: string; icon: IconName; color: string }[] = [
  { key: "edit", labelKey: "tab.edit", icon: "layout", color: "#22d3ee" },
  { key: "overlays", labelKey: "tab.overlays", icon: "layers", color: "#2dd4bf" },
  { key: "functions", labelKey: "tab.functions", icon: "grid", color: "#94a3b8" },
  { key: "props", labelKey: "tab.props", icon: "timer", color: "#f472b6" },
  { key: "obs", labelKey: "tab.obs", icon: "broadcast", color: "#f87171" },
];

export default function ModeBar({
  centerView,
  onLibraryMode,
  onToolMode,
  onShow,
}: Props) {
  const t = useT();
  const activeLibrary =
    centerView.kind === "editor" ? centerView.editor : null;
  return (
    <div className="modebar">
      <div className="modebar-group">
        <button
          className={centerView.kind === "show" ? "active" : ""}
          onClick={onShow}
          title={t("tab.presentation")}
          style={{ "--tab-color": "#4ade80" } as React.CSSProperties}
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
            style={{ "--tab-color": x.color } as React.CSSProperties}
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
            style={{ "--tab-color": x.color } as React.CSSProperties}
          >
            <Icon name={x.icon} size={14} />
            {t(x.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
