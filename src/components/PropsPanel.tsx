import { useT } from "../lib/i18n";
import PropsModal from "./PropsModal";

export default function PropsPanel() {
  const t = useT();
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("toolbar.props")}</h2>
      </div>
      <div className="panel-body">
        <PropsModal embedded onClose={() => {}} />
      </div>
    </div>
  );
}