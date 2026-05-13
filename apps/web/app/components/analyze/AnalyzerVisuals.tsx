type IconName = "check" | "link" | "shield" | "sparkles";

export function AnalyzeIcon({ name }: { name: IconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "analyze-ui-icon",
    fill: "none",
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
  };
  switch (name) {
    case "check":
      return (
        <svg {...commonProps}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.5 4.2L18 9l-4.5 1.8L12 15l-1.5-4.2L6 9l4.5-1.8L12 3Z" />
          <path d="m5 15 .8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Zm14-1 .7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 14Z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...commonProps}>
          <path d="M9.5 14.5 8 16a3.2 3.2 0 0 1-4.5-4.5L6 9a3.2 3.2 0 0 1 4.5 0" />
          <path d="M14.5 9.5 16 8a3.2 3.2 0 0 1 4.5 4.5L18 15a3.2 3.2 0 0 1-4.5 0" />
          <path d="m8.5 15.5 7-7" />
        </svg>
      );
  }
}

export function HeroSignalIllustration() {
  return (
    <div className="analyze-hero-visual" aria-hidden="true">
      <div className="hero-dashboard-card">
        <div className="hero-card-top">
          <span />
          <span />
          <span />
        </div>
        <div className="hero-poly-mark">P</div>
        <svg className="hero-chart-svg" viewBox="0 0 260 130" role="presentation">
          <defs>
            <linearGradient id="heroChartFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="heroChartStroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="48%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <path d="M18 102 C52 94 58 70 88 76 C121 84 132 38 164 46 C194 54 205 24 242 18 L242 120 L18 120 Z" fill="url(#heroChartFill)" />
          <path d="M18 102 C52 94 58 70 88 76 C121 84 132 38 164 46 C194 54 205 24 242 18" fill="none" stroke="url(#heroChartStroke)" strokeLinecap="round" strokeWidth="6" />
          <path d="M22 120H248M22 84H248M22 48H248" stroke="rgba(203,213,225,.12)" />
          <circle cx="88" cy="76" r="5" fill="#22D3EE" />
          <circle cx="164" cy="46" r="5" fill="#34D399" />
          <circle cx="242" cy="18" r="5" fill="#8B5CF6" />
        </svg>
      </div>
      <div className="hero-lens">
        <span />
      </div>
      <div className="hero-signal-chip chip-a">Samantha</div>
      <div className="hero-signal-chip chip-b">Signal +</div>
    </div>
  );
}

export function GaugeChart({ value }: { value?: number | null }) {
  const safeValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : null;
  const dash = safeValue === null ? 0 : 188 * (safeValue / 100);
  return (
    <div className="preview-gauge" aria-label={safeValue === null ? "Probabilidad pendiente" : `Probabilidad ${Math.round(safeValue)}%`}>
      <svg viewBox="0 0 220 132" role="presentation">
        <path className="gauge-track" d="M30 110a80 80 0 0 1 160 0" />
        <path
          className="gauge-value"
          d="M30 110a80 80 0 0 1 160 0"
          style={{ strokeDasharray: `${dash} 188` }}
        />
      </svg>
      <strong>{safeValue === null ? "--%" : `${Math.round(safeValue)}%`}</strong>
    </div>
  );
}

export function MiniLineChart({ active = false }: { active?: boolean }) {
  return (
    <svg className={`mini-line-chart ${active ? "active" : ""}`} viewBox="0 0 220 96" aria-hidden="true">
      <defs>
        <linearGradient id="miniLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M12 78 L48 62 L82 66 L118 38 L154 48 L202 22 L202 88 L12 88 Z" fill="url(#miniLineFill)" />
      <polyline points="12,78 48,62 82,66 118,38 154,48 202,22" />
      <path d="M12 88H208M12 56H208M12 24H208" />
      <circle cx="202" cy="22" r="4" />
    </svg>
  );
}
