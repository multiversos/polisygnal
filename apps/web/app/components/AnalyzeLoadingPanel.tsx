export type AnalyzeLoadingPhase =
  | "validating"
  | "matching"
  | "context"
  | "readiness"
  | "research"
  | "preparing";

type AnalyzeLoadingPanelProps = {
  phase: AnalyzeLoadingPhase;
  message?: string;
  isVisible: boolean;
};

type AnalyzeLoadingStep = {
  detail: string;
  label: string;
  phase: AnalyzeLoadingPhase;
  shortLabel: string;
};

const ANALYZE_LOADING_STEPS: AnalyzeLoadingStep[] = [
  {
    detail: "Enlace verificado",
    label: "Validando enlace",
    phase: "validating",
    shortLabel: "Ruta segura",
  },
  {
    detail: "Mercados cargados",
    label: "Buscando coincidencias",
    phase: "matching",
    shortLabel: "Matching local",
  },
  {
    detail: "Partido y equipos",
    label: "Detectando contexto",
    phase: "context",
    shortLabel: "Contexto deportivo",
  },
  {
    detail: "Datos disponibles",
    label: "Preparacion de datos",
    phase: "readiness",
    shortLabel: "Readiness",
  },
  {
    detail: "Cobertura disponible",
    label: "Investigacion externa",
    phase: "research",
    shortLabel: "Fuentes pendientes",
  },
  {
    detail: "Lectura final",
    label: "Preparando resultado",
    phase: "preparing",
    shortLabel: "Sin inventar datos",
  },
];

const RESULT_SKELETONS = [
  "Probabilidad del mercado",
  "Estimacion PolySignal",
  "Contexto del partido",
  "Investigacion externa",
  "Preparacion de datos",
] as const;

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
            PolySignal esta comparando el enlace con mercados cargados y
            preparando una lectura segura.
          </p>
        </div>
        <span className="analyze-loading-phase-pill">{message || activeStep.detail}</span>
      </div>

      <div className="analyze-loading-stage">
        <div className="analyze-scouting-visual" aria-hidden="true">
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
              </span>
            </div>
            <div className="scouting-legend">
              <span>Mercado</span>
              <span>Contexto</span>
              <span>Evidencia</span>
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
    </section>
  );
}
