import type { DeepAnalysisJobStep } from "../lib/deepAnalysisJob";
import { jobStepStatusLabel } from "../lib/deepAnalysisJob";

export type AnalyzeLoadingPhase =
  | "validating"
  | "matching"
  | "context"
  | "readiness"
  | "research"
  | "preparing_samantha"
  | "sending_samantha"
  | "samantha_researching"
  | "awaiting_samantha"
  | "validating_report"
  | "ready_to_score"
  | "preparing";

export type AnalyzeProgressIssue = "error" | "timeout" | null;

type AnalyzeProgressStepStatus =
  | "attention"
  | "completed"
  | "completed_empty"
  | "completed_with_data"
  | "error"
  | "failed_safe"
  | "pending"
  | "running"
  | "skipped"
  | "unavailable"
  | "warning";

type AnalyzeProgressStep = {
  detail: string;
  id:
    | "reading_link"
    | "detecting_market"
    | "loading_polymarket"
    | "reviewing_wallets"
    | "preparing_samantha"
    | "ready";
  label: string;
  phases: AnalyzeLoadingPhase[];
};

export type AnalyzeProgressStepOverride = {
  detail?: string;
  status: AnalyzeProgressStepStatus;
  statusLabel?: string;
  summary?: string;
};

export type AnalyzeProgressStepOverrides = Partial<Record<AnalyzeProgressStep["id"], AnalyzeProgressStepOverride>>;

type AnalyzeProgressStepAction = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

export type AnalyzeProgressStepActions = Partial<Record<AnalyzeProgressStep["id"], AnalyzeProgressStepAction>>;

type AnalyzeProgressPanelProps = {
  agentName?: string;
  canSaveForLater?: boolean;
  elapsedSeconds: number;
  isBusy: boolean;
  isVisible: boolean;
  issue?: AnalyzeProgressIssue;
  jobSteps?: DeepAnalysisJobStep[];
  onEditLink: () => void;
  onRetry: () => void;
  onSaveForLater?: () => void;
  phase: AnalyzeLoadingPhase;
  stepActions?: AnalyzeProgressStepActions;
  stepOverrides?: AnalyzeProgressStepOverrides;
  samanthaPending?: boolean;
};

function analysisProgressSteps(agentName: string): AnalyzeProgressStep[] {
  return [
    {
      detail: "Validamos que sea un enlace seguro de Polymarket.",
      id: "reading_link",
      label: "Leyendo enlace",
      phases: ["validating"],
    },
    {
      detail: "Detectamos si el enlace apunta a un mercado unico o a un evento con varias opciones.",
      id: "detecting_market",
      label: "Detectando mercado",
      phases: ["matching"],
    },
    {
      detail: "Leemos precio, volumen, liquidez y estado desde fuentes publicas de Polymarket.",
      id: "loading_polymarket",
      label: "Cargando datos de Polymarket",
      phases: ["context", "readiness"],
    },
    {
      detail: "Revisamos actividad publica disponible sin identificar personas reales.",
      id: "reviewing_wallets",
      label: "Revisando billeteras",
      phases: ["research"],
    },
    {
      detail: `${agentName} usa el puente automatico cuando esta configurado y reporta fuentes no disponibles.`,
      id: "preparing_samantha",
      label: `${agentName} analizando`,
      phases: ["preparing_samantha", "sending_samantha", "samantha_researching", "awaiting_samantha", "validating_report"],
    },
    {
      detail: "Preparamos una lectura completa o parcial con las fuentes reales disponibles.",
      id: "ready",
      label: "Preparando lectura",
      phases: ["ready_to_score", "preparing"],
    },
  ];
}

function activeStepIndex(phase: AnalyzeLoadingPhase, steps: AnalyzeProgressStep[]): number {
  const index = steps.findIndex((step) => step.phases.includes(phase));
  return Math.max(index, 0);
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundos`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min ${remainder.toString().padStart(2, "0")} s`;
}

function elapsedHint(seconds: number, issue: AnalyzeProgressIssue): string {
  if (issue === "timeout") {
    return "No pudimos completar esta busqueda ahora. Puedes reintentar o revisar el enlace.";
  }
  if (issue === "error") {
    return "La busqueda se detuvo de forma segura. No mostramos detalles tecnicos ni datos internos.";
  }
  if (seconds >= 180) {
    return "Parece que esta busqueda se quedo esperando respuesta. Puedes reintentar sin perder el enlace.";
  }
  if (seconds >= 90) {
    return "Si no cambia, puedes reintentar o guardar este analisis para continuarlo luego.";
  }
  if (seconds >= 45) {
    return "Esta tardando mas de lo normal, pero puedes seguir esperando.";
  }
  return "Esto normalmente toma unos segundos.";
}

function statusForStep(
  step: AnalyzeProgressStep,
  index: number,
  activeIndex: number,
  issue: AnalyzeProgressIssue,
  samanthaPending: boolean,
  override?: AnalyzeProgressStepOverride,
): AnalyzeProgressStepStatus {
  if (override) {
    return override.status;
  }
  if (issue && index === activeIndex) {
    return issue === "timeout" ? "attention" : "error";
  }
  if (samanthaPending && index === 4) {
    return "attention";
  }
  if (index < activeIndex) {
    if (step.id === "reading_link" || step.id === "detecting_market") {
      return "completed_with_data";
    }
    if (step.id === "loading_polymarket") {
      return "warning";
    }
    if (step.id === "reviewing_wallets") {
      return "pending";
    }
    if (step.id === "preparing_samantha") {
      return "running";
    }
    return "warning";
  }
  if (index === activeIndex) {
    return "running";
  }
  return "pending";
}

function statusLabel(status: AnalyzeProgressStepStatus, override?: AnalyzeProgressStepOverride): string {
  if (override?.statusLabel) {
    return override.statusLabel;
  }
  if (status === "completed" || status === "completed_with_data") {
    return "Completado";
  }
  if (status === "completed_empty") {
    return "Sin datos relevantes";
  }
  if (status === "running") {
    return "En curso";
  }
  if (status === "attention" || status === "warning") {
    return "Necesita atencion";
  }
  if (status === "unavailable") {
    return "Fuente no disponible";
  }
  if (status === "skipped") {
    return "No aplica";
  }
  if (status === "error" || status === "failed_safe") {
    return "No se pudo completar";
  }
  return "Pendiente";
}

function markerForStatus(status: AnalyzeProgressStepStatus, index: number): string {
  if (status === "completed" || status === "completed_with_data") {
    return "✓";
  }
  if (
    status === "attention" ||
    status === "completed_empty" ||
    status === "skipped" ||
    status === "unavailable" ||
    status === "warning"
  ) {
    return "!";
  }
  if (status === "error" || status === "failed_safe") {
    return "×";
  }
  return String(index + 1);
}

export function AnalyzeProgressPanel({
  agentName = "Samantha",
  canSaveForLater = false,
  elapsedSeconds,
  isBusy,
  isVisible,
  issue = null,
  jobSteps,
  onEditLink,
  onRetry,
  onSaveForLater,
  phase,
  stepActions,
  stepOverrides,
  samanthaPending = false,
}: AnalyzeProgressPanelProps) {
  if (!isVisible) {
    return null;
  }

  const steps = analysisProgressSteps(agentName);
  const activeIndex = activeStepIndex(phase, steps);
  const title = samanthaPending
    ? `${agentName} sigue analizando fuentes automaticas`
    : issue
      ? "No pudimos completar esta busqueda ahora"
      : "Analisis en progreso";
  const description = samanthaPending
    ? "Ya detectamos el mercado. Si una fuente automatica no esta disponible, PolySignal prepara una lectura parcial honesta."
    : "PolySignal avanza por etapas reales. No usamos porcentajes falsos ni asumimos evidencia que no existe.";
  const showRecovery =
    Boolean(issue) || elapsedSeconds >= 45 || samanthaPending || !isBusy;
  const reviewedSources = steps
    .map((step) => ({ step, override: stepOverrides?.[step.id] }))
    .filter(({ override }) => Boolean(override?.summary || override?.statusLabel));

  return (
    <section
      aria-busy={isBusy ? "true" : "false"}
      aria-live="polite"
      className={`analyze-progress-panel ${issue ? issue : ""} ${samanthaPending ? "samantha-pending" : ""}`}
      role="status"
    >
      <div className="analyze-progress-header">
        <div>
          <p className="eyebrow">Progreso del analisis</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="analyze-progress-timer">
          <span>Analizando hace</span>
          <strong>{formatElapsed(elapsedSeconds)}</strong>
          <small>{elapsedHint(elapsedSeconds, issue)}</small>
        </div>
      </div>

      <ol className="analyze-progress-steps" aria-label="Etapas del analisis">
        {steps.map((step, index) => {
          const override = stepOverrides?.[step.id];
          const action = stepActions?.[step.id];
          const status = statusForStep(step, index, activeIndex, issue, samanthaPending, override);
          return (
            <li className={`analyze-progress-step ${status}`} key={step.id}>
              <span className="analyze-progress-step-marker" aria-hidden="true">
                {markerForStatus(status, index)}
              </span>
              <span className="analyze-progress-step-copy">
                <strong>{step.label}</strong>
                <small>{override?.detail ?? step.detail}</small>
                {override?.summary ? <em>{override.summary}</em> : null}
              </span>
              <span className="analyze-progress-step-controls">
                <span className="analyze-progress-step-status">{statusLabel(status, override)}</span>
                {action ? (
                  <button
                    disabled={action.disabled}
                    onClick={action.onClick}
                    type="button"
                  >
                    {action.label}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {reviewedSources.length > 0 ? (
        <div className="analyze-progress-sources" aria-label="Fuentes revisadas">
          <strong>Fuentes revisadas</strong>
          <ul>
            {reviewedSources.map(({ step, override }) => (
              <li key={step.id}>
                <span>{step.label}</span>
                <small>{override?.statusLabel ?? statusLabel(override?.status ?? "pending")}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {jobSteps && jobSteps.length > 0 ? (
        <div className="analyze-progress-job" aria-label="Estado local del analisis">
          <strong>Estado guardado del analisis</strong>
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

      {showRecovery ? (
        <div className="analyze-progress-actions" aria-label="Acciones de recuperacion">
          <button disabled={isBusy} onClick={onRetry} type="button">
            Reintentar
          </button>
          <button onClick={onEditLink} type="button">
            Editar enlace
          </button>
          <a href="/history">Ver historial</a>
          {canSaveForLater && onSaveForLater ? (
            <button disabled={isBusy} onClick={onSaveForLater} type="button">
              Guardar para continuar luego
            </button>
          ) : null}
          {samanthaPending ? <a href="/methodology">Ver metodologia</a> : null}
        </div>
      ) : null}

      <p className="analyze-progress-footnote">
        Si falta una fuente automatica, el analisis queda como lectura parcial o sin senales suficientes.
        PolySignal no convierte esperas ni precios de mercado en predicciones propias.
      </p>
    </section>
  );
}

export const AnalyzeLoadingPanel = AnalyzeProgressPanel;
