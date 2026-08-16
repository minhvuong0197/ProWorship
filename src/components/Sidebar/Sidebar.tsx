import { useT } from "../../lib/i18n";
import Icon from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";

export type Tab =
  | "presentation"
  | "songs"
  | "edit"
  | "media"
  | "audio"
  | "playlists"
  | "bible"
  | "obs"
  | "overlays"
  | "functions"
  | "props";

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { key: Tab; labelKey: string; icon: IconName }[] = [
  { key: "presentation", labelKey: "tab.presentation", icon: "presentation" },
  { key: "songs", labelKey: "tab.songs", icon: "music" },
  { key: "edit", labelKey: "tab.edit", icon: "layout" },
  { key: "media", labelKey: "tab.media", icon: "film" },
  { key: "audio", labelKey: "tab.audio", icon: "audio" },
  { key: "bible", labelKey: "tab.bible", icon: "book" },
  { key: "playlists", labelKey: "tab.playlists", icon: "list" },
  { key: "overlays", labelKey: "tab.overlays", icon: "layers" },
  { key: "functions", labelKey: "tab.functions", icon: "grid" },
  { key: "props", labelKey: "tab.props", icon: "presentation" },
  { key: "obs", labelKey: "tab.obs", icon: "camera" },
];

export default function Sidebar({ tab, onTabChange }: Props) {
  const t = useT();
  return (
    <nav className="sidebar">
      {TABS.map((x) => (
        <button
          key={x.key}
          className={tab === x.key ? "active" : ""}
          onClick={() => onTabChange(x.key)}
        >
          <span className="tab-icon">
            <Icon name={x.icon} size={17} />
          </span>
          {t(x.labelKey)}
        </button>
      ))}
    </nav>
  );
}
