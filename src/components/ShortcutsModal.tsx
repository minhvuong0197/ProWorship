import { useMemo, useState } from "react";
import { SHORTCUTS, SHORTCUT_CATEGORIES } from "../lib/shortcuts";
import { useT } from "../lib/i18n";
import Icon from "./Icon/Icon";

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.filter(
      (s) =>
        t(`shortcuts.action.${s.action}`).toLowerCase().includes(q) ||
        s.combo.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [query, t]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("shortcuts.title")}</h2>
          <button className="icon" onClick={onClose} title={t("shortcuts.close")}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ padding: "8px 0" }}>
            <input
              style={{ width: "100%" }}
              placeholder={t("shortcuts.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {SHORTCUT_CATEGORIES.map((cat) => {
            const items = filtered.filter((s) => s.category === cat.id);
            if (!items.length) return null;
            return (
              <section key={cat.id}>
                <h3>{t(cat.labelKey)}</h3>
                <div className="shortcuts-table">
                  {items.map((s) => (
                    <div className="shortcuts-row" key={`${cat.id}-${s.action}`}>
                      <span className="shortcuts-action">
                        {t(`shortcuts.action.${s.action}`)}
                      </span>
                      <span className="shortcuts-key">{s.combo}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-hint">{t("shortcuts.noResults")}</div>
          )}
        </div>
      </div>
    </div>
  );
}