import { useT } from "../lib/i18n";
import OverlaysModal from "./OverlaysModal";

export default function OverlaysPanel() {
  const t = useT();
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("toolbar.overlays")}</h2>
      </div>
      <div className="panel-body">
        <OverlaysModal embedded onClose={() => {}} />
      </div>
    </div>
  );
}