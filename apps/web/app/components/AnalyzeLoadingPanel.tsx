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
  | "error"
  | "pending"
  | "running";

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

type AnalyzeProgressPanelProps = {
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
  samanthaPending?: boolean;
};

const ANALYZE_PROGRESS_STEPS: AnalyzeProgressStep[] = [
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
    detail: "Revisamos actividad publica disponible sin mostrar direcciones completas.",
    id: "reviewing_wallets",
    label: "Revisando billeteras",
    phases: ["research"],
  },
  {
    detail: "Samantha usa el puente automatico cuando esta configurado y reporta fuentes no disponibles.",
    id: "preparing_samantha",
    label: "Samantha analizando",
    phases: ["preparing_samantha", "sending_samantha", "samantha_researching", "awaiting_samantha", "validating_report"],
  },
  {
    detail: "Preparamos una lectura completa o parcial con las fuentes reales disponibles.",
    id: "ready",
    label: "Preparando lectura",
    phases: ["ready_to_score", "preparing"],
  },
];

function activeStepIndex(phase: AnalyzeLoadingPhase): number {
  const index = ANALYZE_PROGRESS_STEPS.findIndex((step) =>
    step.phases.includes(phase),
  );
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
  index: number,
  activeIndex: number,
  issue: AnalyzeProgressIssue,
  samanthaPending: boolean,
): AnalyzeProgressStepStatus {
  if (issue && index === activeIndex) {
    return issue === "timeout" ? "attention" : "error";
  }
  if (samanthaPending && index === 4) {
    return "attention";
  }
  if (index < activeIndex) {
    return "completed";
  }
  if (index === activeIndex) {
    return "running";
  }
  return "pending";
}

function statusLabel(status: AnalyzeProgressStepStatus): string {
  if (status === "completed") {
    return "Completado";
  }
  if (status === "running") {
    return "En curso";
  }
  if (status === "attention") {
    return "Necesita atencion";
  }
  if (status === "error") {
    return "Error";
  }
  return "Pendiente";
}

function markerForStatus(status: AnalyzeProgressStepStatus, index: number): string {
  if (status === "completed") {
    return "✓";
  }
  if (status === "attention") {
    return "!";
  }
  if (status === "error") {
    return "×";
  }
  return String(index + 1);
}

export function AnalyzeProgressPanel({
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
  samanthaPending = false,
}: AnalyzeProgressPanelProps) {
  if (!isVisible) {
    return null;
  }

  const activeIndex = activeStepIndex(phase);
  const title = samanthaPending
    ? "Samantha sigue analizando fuentes automaticas"
    : issue
      ? "No pudimos completar esta busqueda ahora"
      : "Analisis en progreso";
  const description = samanthaPending
    ? "Ya detectamos el mercado. Si una fuente automatica no esta disponible, PolySignal prepara una lectura parcial honesta."
    : "PolySignal avanza por etapas reales. No usamos porcentajes falsos ni asumimos evidencia que no existe.";
  const showRecovery =
    Boolean(issue) || elapsedSeconds >= 45 || samanthaPending || !isBusy;

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
        {ANALYZE_PROGRESS_STEPS.map((step, index) => {
          const status = statusForStep(index, activeIndex, issue, samanthaPending);
          return (
            <li className={`analyze-progress-step ${status}`} key={step.id}>
              <span className="analyze-progress-step-marker" aria-hidden="true">
                {markerForStatus(status, index)}
              </span>
              <span className="analyze-progress-step-copy">
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
              <span className="analyze-progress-step-status">{statusLabel(status)}</span>
            </li>
          );
        })}
      </ol>

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
