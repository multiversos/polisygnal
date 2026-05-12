import type { CSSProperties, ReactNode } from "react";

import {
  jobStepStatusLabel,
  type DeepAnalysisJobStep,
} from "../lib/deepAnalysisJob";

export type AnalyzeLoadingPhase =
  | "validating"
  | "matching"
  | "context"
  | "readiness"
  | "research"
  | "preparing";

type AnalyzeLoadingPanelProps = {
  phase: AnalyzeLoadingPhase;
  jobSteps?: DeepAnalysisJobStep[];
  message?: string;
  isVisible: boolean;
};

type AnalyzeLoadingStep = {
  detail: string;
  label: string;
  phase: AnalyzeLoadingPhase;
  shortLabel: string;
};

type RadarMarketCategory = {
  angle: number;
  icon: ReactNode;
  id: string;
  label: string;
  shortLabel?: string;
  status: "detected" | "scanning" | "pending";
};

const ANALYZE_LOADING_STEPS: AnalyzeLoadingStep[] = [
  {
    detail: "Validacion segura del enlace",
    label: "Detectando enlace",
    phase: "validating",
    shortLabel: "Enlace",
  },
  {
    detail: "Mercado, outcomes y estado",
    label: "Leyendo Polymarket",
    phase: "matching",
    shortLabel: "Polymarket",
  },
  {
    detail: "Volumen, liquidez y precios visibles",
    label: "Analizando mercado seleccionado",
    phase: "context",
    shortLabel: "Mercado",
  },
  {
    detail: "Capas disponibles y pendientes",
    label: "Evaluando senales disponibles",
    phase: "readiness",
    shortLabel: "Senales",
  },
  {
    detail: "Revisando datos disponibles de billeteras",
    label: "Revisando billeteras",
    phase: "research",
    shortLabel: "Wallets",
  },
  {
    detail: "Sin prediccion si faltan evidencias",
    label: "Preparando decision",
    phase: "preparing",
    shortLabel: "Decision",
  },
];

const DEEP_LAYER_PREVIEW = [
  "Samantha Research: brief listo",
  "Perfiles de billeteras: pendiente",
  "Investigacion externa: pendiente",
  "Odds externas: pendiente",
  "Kalshi: pendiente",
] as const;

const RESULT_SKELETONS = [
  "Mercado detectado",
  "Selector de mercados",
  "Probabilidad del mercado",
  "Estimacion PolySignal",
  "Wallet Intelligence",
  "Resultado/verificacion",
] as const;

function CategoryIcon({ id }: { id: string }) {
  if (id === "sports") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M6 12h12M12 4c2 2 3 5 3 8s-1 6-3 8M12 4c-2 2-3 5-3 8s1 6 3 8" />
      </svg>
    );
  }
  if (id === "basketball") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4v16M6.5 6.5c3.5 2 5 5.5 5 11M17.5 6.5c-3.5 2-5 5.5-5 11" />
      </svg>
    );
  }
  if (id === "baseball") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M8 5c2.5 4.5 2.5 9.5 0 14M16 5c-2.5 4.5-2.5 9.5 0 14M7.5 9l2 1M7.5 13l2 1M16.5 9l-2 1M16.5 13l-2 1" />
      </svg>
    );
  }
  if (id === "news") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 6h12a2 2 0 0 1 2 2v10H7a2 2 0 0 1-2-2V6Z" />
        <path d="M8 9h6M8 12h8M8 15h5M19 9h1v8a1 1 0 0 1-1 1" />
      </svg>
    );
  }
  if (id === "politics") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 10h14M7 10v7M11 10v7M15 10v7M19 17H5M12 4l7 4H5l7-4Z" />
      </svg>
    );
  }
  if (id === "markets") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 18V7M10 18v-5M15 18V9M20 18V5M4 18h17" />
      </svg>
    );
  }
  if (id === "crypto") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7" />
        <path d="M10 7v10M14 7v10M9 9h4.5a2 2 0 0 1 0 4H9M9 13h5a2 2 0 0 1 0 4H9" />
      </svg>
    );
  }
  if (id === "history") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M6 5h11a2 2 0 0 1 2 2v12H8a2 2 0 0 1-2-2V5Z" />
        <path d="M9 9h6M9 12h7M9 15h4M6 17H5a2 2 0 0 1-2-2V7" />
      </svg>
    );
  }
  if (id === "resolution") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
        <circle cx="12" cy="12" r="4" />
        <path d="m10.5 12 1.1 1.2 2.2-2.5" />
      </svg>
    );
  }
  if (id === "wallets") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 7.5h12.5A2.5 2.5 0 0 1 20 10v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5A2.5 2.5 0 0 1 6.5 6H17" />
        <path d="M16 12h4M16 15h4M8 11h4M8 14h3" />
        <circle cx="17" cy="13.5" r=".7" />
      </svg>
    );
  }
  if (id === "profiles") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M4 19c.8-3 2.4-5 4-5s3.2 2 4 5M12 19c.8-3 2.4-5 4-5s3.2 2 4 5" />
      </svg>
    );
  }
  if (id === "research") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4M8 9h6M8 12h4" />
      </svg>
    );
  }
  if (id === "samantha") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M6 5h8l4 4v10H6V5Z" />
        <path d="M14 5v4h4M8 13h8M8 16h5M9 9h2" />
      </svg>
    );
  }
  if (id === "odds") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 17V7h14v10H5Z" />
        <path d="M8 14h2M12 14h4M8 10h8M6 20h12" />
      </svg>
    );
  }
  if (id === "kalshi") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 18 12 5l7 13H5Z" />
        <path d="M10 15h4M11 12l2-2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2 2.5 3 5 3 8s-1 5.5-3 8M12 4c-2 2.5-3 5-3 8s1 5.5 3 8" />
    </svg>
  );
}

const RADAR_MARKET_CATEGORIES: RadarMarketCategory[] = [
  {
    angle: 310,
    icon: <CategoryIcon id="sports" />,
    id: "sports",
    label: "Deportes",
    shortLabel: "en radar",
    status: "scanning",
  },
  {
    angle: 338,
    icon: <CategoryIcon id="news" />,
    id: "news",
    label: "Noticias",
    shortLabel: "contexto",
    status: "scanning",
  },
  {
    angle: 6,
    icon: <CategoryIcon id="politics" />,
    id: "politics",
    label: "Politica",
    shortLabel: "neutral",
    status: "pending",
  },
  {
    angle: 34,
    icon: <CategoryIcon id="markets" />,
    id: "markets",
    label: "Mercados",
    shortLabel: "actividad",
    status: "detected",
  },
  {
    angle: 62,
    icon: <CategoryIcon id="crypto" />,
    id: "crypto",
    label: "Cripto",
    shortLabel: "categoria",
    status: "pending",
  },
  {
    angle: 90,
    icon: <CategoryIcon id="wallets" />,
    id: "wallets",
    label: "Billeteras",
    shortLabel: "publicas",
    status: "scanning",
  },
  {
    angle: 118,
    icon: <CategoryIcon id="history" />,
    id: "history",
    label: "Historial",
    shortLabel: "local",
    status: "scanning",
  },
  {
    angle: 146,
    icon: <CategoryIcon id="profiles" />,
    id: "profiles",
    label: "Perfiles",
    shortLabel: "pendiente",
    status: "pending",
  },
  {
    angle: 174,
    icon: <CategoryIcon id="samantha" />,
    id: "samantha",
    label: "Samantha",
    shortLabel: "brief",
    status: "pending",
  },
  {
    angle: 202,
    icon: <CategoryIcon id="research" />,
    id: "research",
    label: "Research",
    shortLabel: "pendiente",
    status: "pending",
  },
  {
    angle: 230,
    icon: <CategoryIcon id="odds" />,
    id: "odds",
    label: "Odds",
    shortLabel: "futura",
    status: "pending",
  },
  {
    angle: 258,
    icon: <CategoryIcon id="kalshi" />,
    id: "kalshi",
    label: "Kalshi",
    shortLabel: "futura",
    status: "pending",
  },
  {
    angle: 286,
    icon: <CategoryIcon id="resolution" />,
    id: "resolution",
    label: "Resolucion",
    shortLabel: "outcome",
    status: "pending",
  },
];

function stepStatus(stepIndex: number, activeIndex: number): "completed" | "active" | "pending" {
  if (stepIndex < activeIndex) {
    return "completed";
  }
  if (stepIndex === activeIndex) {
    return "active";
  }
  return "pending";
}

function statusLabel(status: "completed" | "active" | "pending"): string {
  if (status === "completed") {
    return "OK";
  }
  if (status === "active") {
    return "Ahora";
  }
  return "Pendiente";
}

export function AnalyzeLoadingPanel({
  phase,
  jobSteps,
  message,
  isVisible,
}: AnalyzeLoadingPanelProps) {
  if (!isVisible) {
    return null;
  }

  const activeIndex = Math.max(
    ANALYZE_LOADING_STEPS.findIndex((step) => step.phase === phase),
    0,
  );
  const activeStep = ANALYZE_LOADING_STEPS[activeIndex];

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="analyze-loading-panel"
      role="status"
    >
      <div className="analyze-loading-header">
        <div>
          <p className="eyebrow">Analisis en curso</p>
          <h2>Analizando mercado</h2>
          <p>
            PolySignal esta revisando el enlace, detectando el tipo de mercado
            y preparando una lectura segura.
          </p>
        </div>
        <span className="analyze-loading-phase-pill">{message || activeStep.detail}</span>
      </div>

      <div className="analyze-loading-stage">
        <div
          aria-label="Radar visual de categorias de mercado"
          className="analyze-scouting-visual"
        >
          <div className="scouting-radar-shell">
            <div className="scouting-radar">
              <span className="scouting-radar-grid" />
              <span className="scouting-radar-ring outer" />
              <span className="scouting-radar-ring middle" />
              <span className="scouting-radar-ring inner" />
              <span className="scouting-radar-line horizontal" />
              <span className="scouting-radar-line vertical" />
              <span className="scouting-radar-sweep" />
              <span className="scouting-radar-pulse" />
              <span className="scouting-radar-dot primary" />
              <span className="scouting-radar-dot secondary" />
              <span className="scouting-radar-dot tertiary" />
              <span className="scouting-radar-core">
                <span className="scouting-radar-core-mark" />
                <span className="scouting-radar-core-label">PS</span>
              </span>
              <div className="radar-market-categories">
                {RADAR_MARKET_CATEGORIES.map((category) => (
                  <span
                    className={`radar-market-category ${category.status}`}
                    key={category.id}
                    style={{ "--category-angle": `${category.angle}deg` } as CSSProperties}
                  >
                    <span className="radar-market-category-chip">
                      <span className="radar-market-category-icon" aria-hidden="true">
                        {category.icon}
                      </span>
                      <span className="radar-market-category-copy">
                        <strong>{category.label}</strong>
                        {category.shortLabel ? <small>{category.shortLabel}</small> : null}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="scouting-legend">
              <span>Escaneando categorias</span>
              <span>Datos disponibles</span>
              <span>Cobertura pendiente</span>
            </div>
          </div>
        </div>

        <ol className="analyze-loading-steps" aria-label="Pasos del analisis">
          {ANALYZE_LOADING_STEPS.map((step, index) => {
            const status = stepStatus(index, activeIndex);
            return (
              <li className={`analyze-loading-step ${status}`} key={step.phase}>
                <span className="analyze-loading-step-marker" aria-hidden="true">
                  {status === "completed" ? "OK" : index + 1}
                </span>
                <span className="analyze-loading-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
                <span className="analyze-loading-step-status">{status === "active" ? step.shortLabel : statusLabel(status)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="analyze-loading-skeletons" aria-label="Vista previa del resultado">
        {RESULT_SKELETONS.map((label, index) => (
          <article className="analyze-loading-skeleton-card" key={label}>
            <span>{label}</span>
            <div className="skeleton-line wide" />
            <div className="skeleton-line medium" />
            <div className="skeleton-line short" />
            {index % 2 === 0 ? (
              <div className="skeleton-pill-row" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="scouting-legend deep-layer-preview" aria-label="Capas futuras preparadas">
        {DEEP_LAYER_PREVIEW.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {jobSteps && jobSteps.length > 0 ? (
        <div className="deep-job-preview" aria-label="Estado del Deep Analysis Job">
          <strong>Deep Analysis Job</strong>
          <ol>
            {jobSteps.slice(0, 6).map((step) => (
              <li className={step.status} key={step.id}>
                <span>{jobStepStatusLabel(step.status)}</span>
                <small>{step.label}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="analyze-loading-footnote">
        Detectando primero y analizando solo el mercado confirmado. Las capas no
        integradas se muestran como pendientes, no como evidencia real.
      </p>
    </section>
  );
}
