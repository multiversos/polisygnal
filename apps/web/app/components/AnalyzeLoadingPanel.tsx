import { useEffect, useMemo, useState } from "react";

import type { DeepAnalysisJobStep } from "../lib/deepAnalysisJob";
import { jobStepStatusLabel } from "../lib/deepAnalysisJob";
import {
  ANALYZE_PROGRESS_MIN_STEP_MS,
  isImmediateAnalyzeStepStatus,
  isTerminalAnalyzeStepStatus,
  remainingStepRevealMs,
} from "../lib/analyzerProgressReveal";

export type AnalyzeLoadingPhase =
  | "validating"
  | "matching"
  | "context"
  | "readiness"
  | "research"
  | "wallet_profiles"
  | "wallet_history"
  | "wallet_consistency"
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
  | "limited"
  | "pending"
  | "running"
  | "skipped"
  | "timeout"
  | "unavailable"
  | "warning";

type AnalyzeProgressStep = {
  detail: string;
  id:
    | "reading_link"
    | "detecting_market"
    | "loading_polymarket"
    | "reviewing_wallets"
    | "enriching_profiles"
    | "building_wallet_history"
    | "validating_wallet_consistency"
    | "preparing_samantha"
    | "ready";
  label: string;
  optional?: boolean;
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

type AnalyzeAgentOperationalStatus = {
  bridgeLabel: string;
  healthLabel: string;
  maxWaitLabel: string;
  retryLabel: string;
};

type AnalyzeAgentRecoveryActions = {
  marketDetailsAvailable?: boolean;
  onContinuePartial: () => void;
  onOpenMarketDetails: () => void;
  onOpenWalletDetails: () => void;
  onRetryAgent: () => void;
  visible?: boolean;
  walletDetailsAvailable?: boolean;
};

type AnalyzeProgressPanelProps = {
  agentOperationalStatus?: AnalyzeAgentOperationalStatus;
  agentRecoveryActions?: AnalyzeAgentRecoveryActions;
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
  progressKey?: string | number;
  stepActions?: AnalyzeProgressStepActions;
  stepOverrides?: AnalyzeProgressStepOverrides;
  samanthaPending?: boolean;
};

function analysisProgressSteps(
  agentName: string,
  phase: AnalyzeLoadingPhase,
  stepOverrides?: AnalyzeProgressStepOverrides,
): AnalyzeProgressStep[] {
  const steps: AnalyzeProgressStep[] = [
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
      detail: "Enriquecemos perfiles publicos cuando la fuente los entrega.",
      id: "enriching_profiles",
      label: "Enriqueciendo perfiles",
      optional: true,
      phases: ["wallet_profiles"],
    },
    {
      detail: "Construimos historial por wallet solo con mercados cerrados publicos disponibles.",
      id: "building_wallet_history",
      label: "Construyendo historial de wallets",
      optional: true,
      phases: ["wallet_history"],
    },
    {
      detail: "Comparamos capital, actividades y limites de fuente para evitar una lectura exagerada.",
      id: "validating_wallet_consistency",
      label: "Validando consistencia de capital",
      optional: true,
      phases: ["wallet_consistency"],
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
  return steps.filter((step) => !step.optional || step.phases.includes(phase) || Boolean(stepOverrides?.[step.id]));
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

function elapsedHint(
  seconds: number,
  issue: AnalyzeProgressIssue,
  sourcesConsulted = false,
  agentName = "Samantha",
): string {
  if (issue === "timeout") {
    if (sourcesConsulted) {
      return `Mercado, datos y billeteras ya fueron consultados. ${agentName} no respondio a tiempo; puedes reintentar o continuar parcial.`;
    }
    return "No pudimos completar esta busqueda ahora. Puedes reintentar o revisar el enlace.";
  }
  if (issue === "error") {
    return "La busqueda se detuvo de forma segura. No mostramos detalles tecnicos ni datos internos.";
  }
  if (sourcesConsulted && seconds >= 180) {
    return `Mercado, datos y billeteras ya fueron consultados. Parece que ${agentName} sigue esperando respuesta; puedes reintentar.`;
  }
  if (sourcesConsulted && seconds >= 90) {
    return "Puedes seguir esperando o reintentar sin perder el enlace.";
  }
  if (sourcesConsulted && seconds >= 45) {
    return "Esto esta tardando mas de lo normal. PolySignal conserva los datos ya encontrados.";
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
  if (samanthaPending && step.id === "preparing_samantha") {
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
    if (
      step.id === "enriching_profiles" ||
      step.id === "building_wallet_history" ||
      step.id === "validating_wallet_consistency"
    ) {
      return "skipped";
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
  if (status === "completed") {
    return "Listo";
  }
  if (status === "completed_with_data") {
    return "Datos encontrados";
  }
  if (status === "completed_empty") {
    return "Sin datos relevantes";
  }
  if (status === "limited") {
    return "Datos limitados";
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
  if (status === "timeout") {
    return "No respondio";
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
    status === "limited" ||
    status === "skipped" ||
    status === "timeout" ||
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

function runningOverrideForStep(
  step: AnalyzeProgressStep,
  agentName: string,
): AnalyzeProgressStepOverride {
  if (step.id === "reading_link") {
    return {
      detail: "Validando enlace de Polymarket...",
      status: "running",
      statusLabel: "Validando enlace",
      summary: "Revisamos dominio, protocolo y formato antes de consultar fuentes.",
    };
  }
  if (step.id === "detecting_market") {
    return {
      detail: "Consultando Polymarket/Gamma...",
      status: "running",
      statusLabel: "Detectando mercado",
      summary: "Buscando si el enlace apunta a un mercado unico o a un evento.",
    };
  }
  if (step.id === "loading_polymarket") {
    return {
      detail: "Leyendo precios, outcomes, volumen y liquidez...",
      status: "running",
      statusLabel: "Leyendo datos",
      summary: "Aun no se marca como cargado hasta tener respuesta real.",
    };
  }
  if (step.id === "reviewing_wallets") {
    return {
      detail: "Consultando Wallet Intelligence...",
      status: "running",
      statusLabel: "Consultando billeteras",
      summary: "La fuente puede devolver actividad, sin actividad o no disponible.",
    };
  }
  if (step.id === "enriching_profiles") {
    return {
      detail: "Buscando datos publicos de perfil cuando hay wallet completa valida...",
      status: "running",
      statusLabel: "Enriqueciendo perfiles",
      summary: "No inventamos nombres, avatares ni identidades.",
    };
  }
  if (step.id === "building_wallet_history") {
    return {
      detail: "Revisando mercados cerrados publicos por wallet...",
      status: "running",
      statusLabel: "Construyendo historial",
      summary: "Win rate y PnL solo aparecen si la fuente los entrega.",
    };
  }
  if (step.id === "validating_wallet_consistency") {
    return {
      detail: "Comparando wallets relevantes, actividades y capital observado...",
      status: "running",
      statusLabel: "Validando consistencia",
      summary: "Mercados grandes pueden quedar parciales si la fuente devuelve pocos datos.",
    };
  }
  if (step.id === "preparing_samantha") {
    return {
      detail: `${agentName} esta revisando fuentes automaticas disponibles...`,
      status: "running",
      statusLabel: `${agentName} analizando`,
      summary: "Esperando respuesta del agente analizador.",
    };
  }
  return {
    detail: "Preparando la lectura con las fuentes reales disponibles...",
    status: "running",
    statusLabel: "Preparando lectura",
    summary: "No convertimos esperas ni precios de mercado en prediccion propia.",
  };
}

function pendingOverrideForStep(step: AnalyzeProgressStep): AnalyzeProgressStepOverride {
  return {
    detail: step.detail,
    status: "pending",
    statusLabel: "Pendiente",
  };
}

function terminalActionReady(status: AnalyzeProgressStepStatus): boolean {
  return isTerminalAnalyzeStepStatus(status);
}

export function AnalyzeProgressPanel({
  agentOperationalStatus,
  agentRecoveryActions,
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
  progressKey,
  stepActions,
  stepOverrides,
  samanthaPending = false,
}: AnalyzeProgressPanelProps) {
  const steps = useMemo(() => analysisProgressSteps(agentName, phase, stepOverrides), [agentName, phase, stepOverrides]);
  const activeIndex = activeStepIndex(phase, steps);
  const [visualStepIndex, setVisualStepIndex] = useState(0);
  const [visualStepStartedAt, setVisualStepStartedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const now = Date.now();
    setVisualStepIndex(0);
    setVisualStepStartedAt(now);
  }, [agentName, isVisible, progressKey]);

  const realStepStates = useMemo(
    () =>
      steps.map((step, index) => {
        const override = stepOverrides?.[step.id];
        const status = statusForStep(step, index, activeIndex, issue, samanthaPending, override);
        return { override, status, step };
      }),
    [activeIndex, issue, samanthaPending, stepOverrides, steps],
  );

  const currentVisualStatus = realStepStates[visualStepIndex]?.status;

  useEffect(() => {
    if (!isVisible || visualStepIndex >= realStepStates.length || !currentVisualStatus) {
      return;
    }
    if (!isTerminalAnalyzeStepStatus(currentVisualStatus)) {
      return;
    }
    const remainingMs = remainingStepRevealMs({
      elapsedMs: Date.now() - visualStepStartedAt,
      status: currentVisualStatus,
    });
    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      setVisualStepIndex((current) => Math.min(current + 1, realStepStates.length));
      setVisualStepStartedAt(now);
    }, remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [currentVisualStatus, isVisible, realStepStates.length, visualStepIndex, visualStepStartedAt]);

  const visibleStepStates = realStepStates.map(({ override, status, step }, index) => {
    const terminal = terminalActionReady(status);
    const isRevealed = index < visualStepIndex || visualStepIndex >= steps.length;
    const isCurrent = index === visualStepIndex;
    const shouldHoldCurrent =
      isCurrent &&
      terminal &&
      !isImmediateAnalyzeStepStatus(status) &&
      remainingStepRevealMs({
        elapsedMs: Date.now() - visualStepStartedAt,
        status,
      }) > 0;

    if (isRevealed) {
      return {
        actionReady: terminal,
        override,
        status,
        step,
      };
    }

    if (shouldHoldCurrent) {
      return {
        actionReady: false,
        override: runningOverrideForStep(step, agentName),
        status: "running" as AnalyzeProgressStepStatus,
        step,
      };
    }

    if (isCurrent) {
      return {
        actionReady: terminal,
        override,
        status,
        step,
      };
    }

    return {
      actionReady: false,
      override: pendingOverrideForStep(step),
      status: "pending" as AnalyzeProgressStepStatus,
      step,
    };
  });

  if (!isVisible) {
    return null;
  }

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
  const showAgentRecovery = Boolean(agentRecoveryActions?.visible);
  const showAgentOperationalStatus = Boolean(agentOperationalStatus && (samanthaPending || showAgentRecovery));
  const reviewedSources = visibleStepStates
    .filter(({ actionReady, override }) => actionReady && Boolean(override?.summary || override?.statusLabel));
  const consultedStepIds = new Set(
    visibleStepStates
      .filter(({ actionReady, step }) => actionReady && step.id !== "reading_link" && step.id !== "detecting_market")
      .map(({ step }) => step.id),
  );
  const sourcesConsultedForWait =
    consultedStepIds.has("loading_polymarket") && consultedStepIds.has("reviewing_wallets");

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
          <small>{elapsedHint(elapsedSeconds, issue, sourcesConsultedForWait, agentName)}</small>
        </div>
      </div>

      {reviewedSources.length > 0 ? (
        <div className="analyze-progress-sources" aria-label="Resumen encontrado hasta ahora">
          <strong>Resumen encontrado hasta ahora</strong>
          <ul>
            {reviewedSources.map(({ override, step }) => (
              <li key={step.id}>
                <span>{step.label}</span>
                <small>{override?.summary ?? override?.statusLabel ?? "Consultado"}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showAgentOperationalStatus && agentOperationalStatus ? (
        <div className="analyze-agent-status" aria-label={`Estado operativo de ${agentName}`}>
          <strong>{agentOperationalStatus.bridgeLabel}</strong>
          <span>{agentOperationalStatus.healthLabel}</span>
          <span>{agentOperationalStatus.maxWaitLabel}</span>
          <span>{agentOperationalStatus.retryLabel}</span>
        </div>
      ) : null}

      <ol className="analyze-progress-steps" aria-label="Etapas del analisis">
        {visibleStepStates.map(({ actionReady, override, status, step }, index) => {
          const realAction = stepActions?.[step.id];
          const action = realAction
            ? {
                ...realAction,
                disabled: !actionReady || realAction.disabled,
                label: actionReady ? realAction.label : "Preparando...",
              }
            : null;
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

      {showAgentRecovery && agentRecoveryActions ? (
        <div className="analyze-agent-recovery" aria-label="Recuperacion del agente analizador">
          <div>
            <strong>{agentName} no respondio a tiempo</strong>
            <p>
              Mercado, datos y billeteras ya fueron consultados. Puedes reintentar el agente o
              continuar con una lectura parcial basada en las fuentes disponibles.
            </p>
          </div>
          <div className="analyze-progress-actions">
            <button disabled={isBusy} onClick={agentRecoveryActions.onRetryAgent} type="button">
              Reintentar {agentName}
            </button>
            <button onClick={agentRecoveryActions.onContinuePartial} type="button">
              Continuar con lectura parcial
            </button>
            <button
              disabled={!agentRecoveryActions.marketDetailsAvailable}
              onClick={agentRecoveryActions.onOpenMarketDetails}
              type="button"
            >
              Ver datos
            </button>
            <button
              disabled={!agentRecoveryActions.walletDetailsAvailable}
              onClick={agentRecoveryActions.onOpenWalletDetails}
              type="button"
            >
              Ver billeteras
            </button>
          </div>
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
