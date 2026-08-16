import { useT } from "../lib/i18n";
import FunctionsModal from "./FunctionsModal";

export default function FunctionsPanel() {
  const t = useT();
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t("toolbar.functions")}</h2>
      </div>
      <div className="panel-body">
        <FunctionsModal embedded onClose={() => {}} />
      </div>
    </div>
  );
}