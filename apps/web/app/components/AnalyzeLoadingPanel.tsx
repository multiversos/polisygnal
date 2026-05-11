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
};

const ANALYZE_LOADING_STEPS: AnalyzeLoadingStep[] = [
  {
    detail: "Revisamos que el enlace pertenezca a Polymarket y tenga una ruta segura.",
    label: "Validando enlace",
    phase: "validating",
  },
  {
    detail: "Comparamos el enlace con los mercados que PolySignal ya tiene cargados.",
    label: "Buscando coincidencias en PolySignal",
    phase: "matching",
  },
  {
    detail: "Detectamos partido, equipos y fecha cuando esos datos estan disponibles.",
    label: "Detectando contexto del partido",
    phase: "context",
  },
  {
    detail: "Separamos probabilidad del mercado, datos recientes y senales independientes.",
    label: "Revisando preparacion de datos",
    phase: "readiness",
  },
  {
    detail: "Comprobamos si ya hay evidencia externa real o si sigue pendiente.",
    label: "Revisando investigacion externa",
    phase: "research",
  },
  {
    detail: "Armamos la lectura final sin inventar estimaciones ni evidencia.",
    label: "Preparando lectura final",
    phase: "preparing",
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
    return "Listo";
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
      <div className="analyze-loading-top">
        <div className="analyze-loading-copy">
          <p className="eyebrow">Analisis en curso</p>
          <h2>Analizando mercado</h2>
          <p>
            PolySignal esta revisando el enlace y preparando la lectura con los
            datos disponibles.
          </p>
          <strong>{message || activeStep.detail}</strong>
        </div>
        <div className="analyze-scouting-visual" aria-hidden="true">
          <div className="scouting-radar">
            <span className="scouting-radar-ring outer" />
            <span className="scouting-radar-ring middle" />
            <span className="scouting-radar-ring inner" />
            <span className="scouting-radar-line horizontal" />
            <span className="scouting-radar-line vertical" />
            <span className="scouting-radar-sweep" />
            <span className="scouting-radar-dot primary" />
            <span className="scouting-radar-dot secondary" />
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
                {index + 1}
              </span>
              <span className="analyze-loading-step-copy">
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
              <span className="analyze-loading-step-status">{statusLabel(status)}</span>
            </li>
          );
        })}
      </ol>

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
