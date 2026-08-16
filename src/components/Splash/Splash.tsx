import { useT } from "../../lib/i18n";

export default function Splash() {
  const t = useT();
  return (
    <div className="splash-root">
      <div className="splash-brand">
        <svg
          width="72"
          height="72"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="spl-bg" x1="32" y1="32" x2="480" y2="480" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3C7EFF" />
              <stop offset="1" stopColor="#8C48FF" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="496" height="496" rx="112" fill="url(#spl-bg)" />
          <polygon
            points="256,148 240,236 148,256 240,276 256,364 272,276 364,256 272,236"
            fill="white"
          />
          <circle cx="352" cy="160" r="11" fill="white" opacity="0.9" />
          <circle cx="128" cy="344" r="8" fill="white" opacity="0.9" />
          <circle cx="428" cy="326" r="7" fill="white" opacity="0.9" />
          <circle cx="196" cy="122" r="6" fill="white" opacity="0.85" />
        </svg>
        <div className="splash-name">
          <h1>ProWorship</h1>
          <span>{t("app.subtitle")}</span>
        </div>
      </div>
      <div className="splash-loading">
        <div className="splash-bar">
          <div className="splash-bar-fill" />
        </div>
      </div>
    </div>
  );
}
