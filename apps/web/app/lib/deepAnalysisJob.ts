export type DeepAnalysisJobStatus =
  | "idle"
  | "running"
  | "sending_to_samantha"
  | "samantha_researching"
  | "receiving_samantha_report"
  | "validating_samantha_report"
  | "awaiting_samantha"
  | "ready_to_score"
  | "completed"
  | "failed";

export type DeepAnalysisJobStepId =
  | "reading_polymarket"
  | "analyzing_market"
  | "analyzing_wallets"
  | "profiling_wallets"
  | "preparing_samantha_research"
  | "awaiting_samantha_report"
  | "checking_odds"
  | "checking_kalshi"
  | "scoring_evidence"
  | "generating_decision"
  | "completed";

export type DeepAnalysisJobStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "blocked"
  | "failed";

export type DeepAnalysisJobStep = {
  id: DeepAnalysisJobStepId;
  label: string;
  status: DeepAnalysisJobStepStatus;
  summary: string;
  startedAt?: string;
  completedAt?: string;
  requiresManualInput?: boolean;
  requiresExternalIntegration?: boolean;
  warnings: string[];
};

export type DeepAnalysisJob = {
  id: string;
  url: string;
  normalizedUrl?: string;
  status: DeepAnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  marketTitle?: string;
  marketId?: string;
  eventSlug?: string;
  marketSlug?: string;
  steps: DeepAnalysisJobStep[];
  analysisAgent?: {
    agentId?: string;
    agentName?: string;
    status?: "completed" | "failed_safe" | "insufficient_data" | "partial" | "researching" | "unavailable";
  };
  briefReady?: boolean;
  samanthaBridge?: {
    automaticAvailable?: boolean;
    bridgeMode?: "automatic" | "local" | "manual_fallback";
    bridgeStatus?: "accepted" | "queued" | "pending" | "processing" | "manual_needed" | "completed" | "failed_safe";
    bridgeTaskId?: string;
    fallbackRequired?: boolean;
    fallbackAvailable?: boolean;
    lastAttemptAt?: string;
    reason?: string;
    sentToSamanthaAt?: string;
    status:
      | "not_configured"
      | "fallback_manual"
      | "sending"
      | "researching"
      | "report_received"
      | "report_invalid"
      | "failed";
    taskId?: string;
  };
  samanthaReportLoaded?: boolean;
  resultReady?: boolean;
  error?: string;
};

export type DeepAnalysisJobSummary = {
  headline: string;
  detail: string;
  nextAction: string;
  completedSteps: number;
  totalSteps: number;
};

type StepDefinition = {
  id: DeepAnalysisJobStepId;
  label: string;
  summary: string;
  requiresManualInput?: boolean;
  requiresExternalIntegration?: boolean;
  warnings?: string[];
};

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: "reading_polymarket",
    label: "Mercado leido desde Polymarket",
    summary: "Pendiente de leer mercado, outcomes, precios y estado desde Polymarket.",
  },
  {
    id: "analyzing_market",
    label: "Datos principales revisados",
    summary: "Pendiente de revisar volumen, liquidez, precios visibles y estado.",
  },
  {
    id: "analyzing_wallets",
    label: "Actividad de billeteras",
    summary: "Pendiente de revisar wallets publicas si hay id compatible.",
  },
  {
    id: "profiling_wallets",
    label: "Perfil de billeteras",
    requiresExternalIntegration: true,
    summary: "Pendiente de fuente confiable para historial cerrado por wallet.",
    warnings: ["No se infiere identidad personal ni se calcula ROI sin fuente real."],
  },
  {
    id: "preparing_samantha_research",
    label: "Samantha automatica preparada",
    summary: "Pendiente de preparar contexto seguro para el puente automatico de Samantha.",
  },
  {
    id: "awaiting_samantha_report",
    label: "Samantha analizando",
    requiresExternalIntegration: true,
    summary: "Pendiente de respuesta automatica o fuente disponible.",
  },
  {
    id: "checking_odds",
    label: "Odds externas",
    requiresExternalIntegration: true,
    summary: "Pendiente de proveedor comparable, rate limit y cache.",
  },
  {
    id: "checking_kalshi",
    label: "Kalshi",
    requiresExternalIntegration: true,
    summary: "Pendiente de comparador seguro de contratos equivalentes.",
  },
  {
    id: "scoring_evidence",
    label: "Scoring de evidencia",
    summary: "Pendiente de evidencia externa validada suficiente.",
  },
  {
    id: "generating_decision",
    label: "Decision PolySignal",
    summary: "Pendiente de evidencia suficiente; el precio del mercado no basta.",
  },
  {
    id: "completed",
    label: "Analisis listo",
    summary: "Pendiente de completar el job profundo.",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function randomJobId(): string {
  return `deep-job-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createSteps(startedAt: string): DeepAnalysisJobStep[] {
  return STEP_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    requiresExternalIntegration: definition.requiresExternalIntegration,
    requiresManualInput: definition.requiresManualInput,
    startedAt: index === 0 ? startedAt : undefined,
    status: index === 0 ? "running" : "pending",
    summary:
      index === 0
        ? "Leyendo mercado, outcomes, precios y estado desde Polymarket."
        : definition.summary,
    warnings: definition.warnings ?? [],
  }));
}

function patchStep(
  step: DeepAnalysisJobStep,
  patch: Partial<DeepAnalysisJobStep>,
  timestamp: string,
): DeepAnalysisJobStep {
  const status = patch.status ?? step.status;
  return {
    ...step,
    ...patch,
    completedAt:
      status === "completed" || status === "blocked" || status === "failed"
        ? patch.completedAt ?? step.completedAt ?? timestamp
        : patch.completedAt,
    startedAt:
      status === "running" || status === "completed"
        ? patch.startedAt ?? step.startedAt ?? timestamp
        : patch.startedAt ?? step.startedAt,
    status,
    warnings: patch.warnings ?? step.warnings,
  };
}

export function createDeepAnalysisJob(url: string): DeepAnalysisJob {
  const createdAt = nowIso();
  return {
    createdAt,
    id: randomJobId(),
    resultReady: false,
    status: "running",
    steps: createSteps(createdAt),
    updatedAt: createdAt,
    url,
  };
}

export function updateDeepAnalysisJobStep(
  job: DeepAnalysisJob,
  stepId: DeepAnalysisJobStepId,
  patch: Partial<DeepAnalysisJobStep>,
): DeepAnalysisJob {
  const updatedAt = nowIso();
  return {
    ...job,
    steps: job.steps.map((step) =>
      step.id === stepId ? patchStep(step, patch, updatedAt) : step,
    ),
    updatedAt,
  };
}

export function markJobPolymarketRead(
  job: DeepAnalysisJob,
  input: {
    eventSlug?: string;
    marketId?: string | number | null;
    marketSlug?: string;
    marketTitle?: string;
    normalizedUrl?: string;
  },
): DeepAnalysisJob {
  const next = updateDeepAnalysisJobStep(job, "reading_polymarket", {
    status: "completed",
    summary: "Polymarket leido: mercado, outcomes, precios y estado disponibles cuando la fuente los trae.",
  });
  return {
    ...next,
    eventSlug: input.eventSlug ?? next.eventSlug,
    marketId:
      input.marketId !== null && input.marketId !== undefined
        ? String(input.marketId)
        : next.marketId,
    marketSlug: input.marketSlug ?? next.marketSlug,
    marketTitle: input.marketTitle ?? next.marketTitle,
    normalizedUrl: input.normalizedUrl ?? next.normalizedUrl,
  };
}

export function markJobMarketAnalyzed(job: DeepAnalysisJob): DeepAnalysisJob {
  return updateDeepAnalysisJobStep(job, "analyzing_market", {
    status: "completed",
    summary: "Mercado analizado con datos visibles de Polymarket; no se genero estimacion propia.",
    warnings: ["El precio de mercado no es una estimacion PolySignal."],
  });
}

export function markJobWalletsAnalyzed(
  job: DeepAnalysisJob,
  input: { available: boolean; summary?: string; warnings?: string[] },
): DeepAnalysisJob {
  return updateDeepAnalysisJobStep(job, "analyzing_wallets", {
    status: input.available ? "completed" : "blocked",
    summary:
      input.summary ||
      (input.available
        ? "Wallet Intelligence revisada en modo read-only."
        : "Wallet Intelligence no disponible para este mercado sin id compatible o datos suficientes."),
    warnings: input.warnings ?? [],
  });
}

export function markJobSamanthaBriefReady(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string } = {},
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  const next = updateDeepAnalysisJobStep(job, "preparing_samantha_research", {
    status: "completed",
    summary: `Contexto de ${agentName} listo para el puente automatico seguro.`,
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: next.analysisAgent?.status,
    },
    briefReady: true,
  };
}

export function markJobSendingToSamantha(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string } = {},
): DeepAnalysisJob {
  const timestamp = nowIso();
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  const next = updateDeepAnalysisJobStep(job, "awaiting_samantha_report", {
    requiresExternalIntegration: true,
    status: "running",
    summary: `Enviando contexto a ${agentName} mediante el puente automatico configurado.`,
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: "researching",
    },
    resultReady: false,
    samanthaBridge: {
      automaticAvailable: true,
      bridgeMode: "automatic",
      bridgeStatus: "pending",
      fallbackRequired: false,
      fallbackAvailable: true,
      lastAttemptAt: timestamp,
      status: "sending",
      sentToSamanthaAt: timestamp,
    },
    status: "sending_to_samantha",
  };
}

export function markJobSamanthaResearching(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string; bridgeStatus?: "accepted" | "pending" | "processing" | "queued"; reason?: string; taskId?: string },
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  const next = updateDeepAnalysisJobStep(job, "awaiting_samantha_report", {
    requiresExternalIntegration: true,
    status: "running",
    summary: input.reason || `${agentName} recibio la tarea y la investigacion externa sigue pendiente.`,
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: "researching",
    },
    resultReady: false,
    samanthaBridge: {
      automaticAvailable: true,
      bridgeMode: "automatic",
      bridgeStatus: input.bridgeStatus ?? "accepted",
      bridgeTaskId: input.taskId,
      fallbackRequired: false,
      fallbackAvailable: true,
      lastAttemptAt: nowIso(),
      reason: input.reason,
      status: "researching",
      taskId: input.taskId,
    },
    status: "samantha_researching",
  };
}

export function markJobReceivingSamanthaReport(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string } = {},
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  const next = updateDeepAnalysisJobStep(job, "awaiting_samantha_report", {
    status: "running",
    summary: `Reporte candidato recibido desde ${agentName}; pendiente de validacion PolySignal.`,
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: "partial",
    },
    resultReady: false,
    samanthaBridge: {
      ...next.samanthaBridge,
      automaticAvailable: true,
      bridgeMode: "automatic",
      bridgeStatus: "completed",
      fallbackRequired: false,
      fallbackAvailable: true,
      lastAttemptAt: nowIso(),
      status: "report_received",
    },
    status: "receiving_samantha_report",
  };
}

export function markJobValidatingSamanthaReport(job: DeepAnalysisJob): DeepAnalysisJob {
  const next = updateDeepAnalysisJobStep(job, "scoring_evidence", {
    status: "running",
    summary: "Validando reporte de Samantha y convirtiendo evidencia en senales.",
  });
  return {
    ...next,
    resultReady: false,
    status: "validating_samantha_report",
  };
}

export function markJobSamanthaBridgeFallback(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string; automaticAvailable?: boolean; reason: string; warnings?: string[] },
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  let next = markJobAwaitingSamantha(job);
  next = updateDeepAnalysisJobStep(next, "awaiting_samantha_report", {
    requiresExternalIntegration: true,
    status: "blocked",
    summary: input.reason || `${agentName} automatico no esta conectado todavia.`,
    warnings: input.warnings ?? [],
  });
  next = updateDeepAnalysisJobStep(next, "scoring_evidence", {
    status: "blocked",
    summary: "La lectura queda parcial con Polymarket y Wallet Intelligence; el agente no aporto evidencia validada.",
  });
  next = updateDeepAnalysisJobStep(next, "generating_decision", {
    status: "blocked",
    summary: "No hay decision PolySignal porque el agente no devolvio senales suficientes o disponibles.",
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: input.automaticAvailable ? "failed_safe" : "unavailable",
    },
    samanthaBridge: {
      ...next.samanthaBridge,
      automaticAvailable: Boolean(input.automaticAvailable),
      bridgeMode: next.samanthaBridge?.bridgeMode ?? (input.automaticAvailable ? "automatic" : "manual_fallback"),
      bridgeStatus: "manual_needed",
      fallbackRequired: true,
      fallbackAvailable: true,
      lastAttemptAt: nowIso(),
      reason: input.reason,
      status: input.automaticAvailable ? "failed" : "fallback_manual",
    },
    resultReady: false,
    status: "ready_to_score",
  };
}

export function markJobAnalysisAgentReadingLoaded(
  job: DeepAnalysisJob,
  input: {
    agentId?: string;
    agentName?: string;
    analysisStatus: "completed" | "failed_safe" | "insufficient_data" | "partial" | "unavailable";
    reason: string;
    warnings?: string[];
  },
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  const terminalStatus =
    input.analysisStatus === "completed" || input.analysisStatus === "partial"
      ? "completed"
      : "blocked";
  let next = updateDeepAnalysisJobStep(job, "awaiting_samantha_report", {
    requiresExternalIntegration: true,
    status: terminalStatus,
    summary: input.reason || `${agentName} devolvio una lectura automatica parcial.`,
    warnings: input.warnings ?? [],
  });
  next = updateDeepAnalysisJobStep(next, "scoring_evidence", {
    status: "blocked",
    summary:
      input.analysisStatus === "completed" || input.analysisStatus === "partial"
        ? "El agente devolvio una lectura, pero PolySignal no crea estimacion propia sin reporte validado y senales suficientes."
        : "El agente no devolvio senales suficientes para scoring.",
  });
  next = updateDeepAnalysisJobStep(next, "generating_decision", {
    status: "blocked",
    summary: "No hay decision PolySignal; el precio de mercado o una lectura parcial no bastan.",
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status:
        input.analysisStatus === "completed"
          ? "completed"
          : input.analysisStatus === "partial"
            ? "partial"
            : input.analysisStatus === "insufficient_data"
              ? "insufficient_data"
              : input.analysisStatus === "unavailable"
                ? "unavailable"
                : "failed_safe",
    },
    briefReady: true,
    resultReady: false,
    samanthaBridge: {
      ...next.samanthaBridge,
      automaticAvailable: true,
      bridgeMode: "automatic",
      bridgeStatus:
        input.analysisStatus === "completed" || input.analysisStatus === "partial"
          ? "completed"
          : input.analysisStatus === "unavailable"
            ? "manual_needed"
            : "failed_safe",
      fallbackRequired:
        input.analysisStatus === "failed_safe" ||
        input.analysisStatus === "insufficient_data" ||
        input.analysisStatus === "unavailable",
      fallbackAvailable: true,
      lastAttemptAt: nowIso(),
      reason: input.reason,
      status:
        input.analysisStatus === "completed" || input.analysisStatus === "partial"
          ? "report_received"
          : "failed",
    },
    status: "ready_to_score",
  };
}

export function markJobAwaitingSamantha(
  job: DeepAnalysisJob,
  input: { agentId?: string; agentName?: string } = {},
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  let next = updateDeepAnalysisJobStep(job, "profiling_wallets", {
    status: "blocked",
    summary: "Perfil historico de wallets pendiente de fuente estructurada confiable.",
    warnings: ["No se calcula win rate ni ROI sin historial cerrado real."],
  });
  next = updateDeepAnalysisJobStep(next, "awaiting_samantha_report", {
    requiresExternalIntegration: true,
    status: "running",
    summary: `Esperando respuesta automatica de ${agentName} o una fuente segura disponible.`,
  });
  next = updateDeepAnalysisJobStep(next, "checking_odds", {
    status: "blocked",
    summary: "Odds externas pendientes de integracion segura; no se inventan odds.",
  });
  next = updateDeepAnalysisJobStep(next, "checking_kalshi", {
    status: "blocked",
    summary: "Kalshi pendiente de integracion segura; solo se aceptara si el reporte marca equivalencia clara.",
  });
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: "unavailable",
    },
    briefReady: true,
    resultReady: false,
    samanthaBridge: next.samanthaBridge ?? {
      automaticAvailable: false,
      bridgeMode: "manual_fallback",
      bridgeStatus: "manual_needed",
      fallbackRequired: true,
      fallbackAvailable: true,
      lastAttemptAt: nowIso(),
      reason: `${agentName} automatico no esta conectado todavia.`,
      status: "not_configured",
    },
    status: "awaiting_samantha",
  };
}

export function markJobSamanthaReportLoaded(
  job: DeepAnalysisJob,
  input: {
    acceptedEstimate: boolean;
    agentId?: string;
    agentName?: string;
    kalshiEquivalent?: boolean;
    oddsFound?: boolean;
    reportStatus?: "completed" | "failed" | "partial";
    signalCount: number;
  },
): DeepAnalysisJob {
  const agentName = input.agentName || job.analysisAgent?.agentName || "Samantha";
  let next = updateDeepAnalysisJobStep(job, "awaiting_samantha_report", {
    status: "completed",
    summary: `Reporte de ${agentName} cargado y validado localmente.`,
  });
  next = updateDeepAnalysisJobStep(next, "checking_odds", {
    status: input.oddsFound ? "completed" : "blocked",
    summary: input.oddsFound
      ? "Samantha reporto una comparacion de odds comparable y validable."
      : "No hay odds comparables cargadas; pendiente de integracion segura.",
  });
  next = updateDeepAnalysisJobStep(next, "checking_kalshi", {
    status: input.kalshiEquivalent ? "completed" : "blocked",
    summary: input.kalshiEquivalent
      ? "Samantha reporto un mercado Kalshi equivalente."
      : "No hay equivalente Kalshi aceptado; pendiente de integracion segura.",
  });
  next = updateDeepAnalysisJobStep(next, "scoring_evidence", {
    status: input.signalCount > 0 ? "completed" : "blocked",
    summary:
      input.signalCount > 0
        ? `Evidencia validada convertida en ${input.signalCount} senales estructuradas.`
        : "Reporte valido, pero sin senales suficientes para scoring.",
  });
  next = updateDeepAnalysisJobStep(next, "generating_decision", {
    status: input.acceptedEstimate ? "completed" : "blocked",
    summary: input.acceptedEstimate
      ? "Estimacion PolySignal aceptada por compuertas conservadoras de evidencia."
      : "Decision PolySignal bloqueada: la evidencia no alcanza una prediccion responsable.",
  });
  if (input.acceptedEstimate) {
    next = markJobCompleted(next);
  }
  return {
    ...next,
    analysisAgent: {
      agentId: input.agentId ?? next.analysisAgent?.agentId ?? "samantha",
      agentName,
      status: input.reportStatus === "failed" ? "failed_safe" : input.acceptedEstimate ? "completed" : "partial",
    },
    resultReady: input.acceptedEstimate,
    samanthaReportLoaded: true,
    status:
      input.acceptedEstimate
        ? "completed"
        : "ready_to_score",
  };
}

export function markJobCompleted(job: DeepAnalysisJob): DeepAnalysisJob {
  const next = updateDeepAnalysisJobStep(job, "completed", {
    status: "completed",
    summary: "Analisis profundo completado con evidencia validada.",
  });
  return {
    ...next,
    resultReady: true,
    status: "completed",
  };
}

export function markJobFailed(job: DeepAnalysisJob, error: string): DeepAnalysisJob {
  const current = getCurrentJobStep(job);
  const next = current
    ? updateDeepAnalysisJobStep(job, current.id, {
        status: "failed",
        summary: error,
      })
    : job;
  return {
    ...next,
    error,
    status: "failed",
  };
}

export function getCurrentJobStep(job: DeepAnalysisJob): DeepAnalysisJobStep | undefined {
  return (
    job.steps.find((step) => step.status === "running") ??
    job.steps.find((step) => step.status === "pending")
  );
}

export function getJobProgressSummary(job: DeepAnalysisJob): DeepAnalysisJobSummary {
  const completedSteps = job.steps.filter((step) => step.status === "completed").length;
  const totalSteps = job.steps.length;
  if (job.status === "completed") {
    return {
      completedSteps,
      detail: "La evidencia cargada paso las compuertas locales del Deep Analyzer.",
      headline: "Analisis profundo completado",
      nextAction: "Guardar en Historial y verificar resultado cuando Polymarket resuelva.",
      totalSteps,
    };
  }
  if (job.status === "ready_to_score") {
    return {
      completedSteps,
      detail: "Hay evidencia estructurada cargada, pero no basta para una estimacion final responsable.",
      headline: "Evidencia cargada, decision pendiente",
      nextAction: "Guardar como lectura parcial o volver a analizar cuando haya nuevas fuentes automaticas.",
      totalSteps,
    };
  }
  if (job.status === "sending_to_samantha") {
    const agentName = job.analysisAgent?.agentName || "Samantha";
    return {
      completedSteps,
      detail: `PolySignal esta enviando la tarea a ${agentName} desde el endpoint seguro configurado.`,
      headline: `Enviando a ${agentName}`,
      nextAction: "Mantener abierto el analisis o guardarlo como lectura parcial si tarda demasiado.",
      totalSteps,
    };
  }
  if (job.status === "samantha_researching") {
    const agentName = job.analysisAgent?.agentName || "Samantha";
    return {
      completedSteps,
      detail: job.samanthaBridge?.reason || `${agentName} recibio la tarea y la investigacion externa sigue pendiente.`,
      headline: `${agentName} investigando`,
      nextAction: "Esperar respuesta automatica o guardar esta lectura para volver despues.",
      totalSteps,
    };
  }
  if (job.status === "receiving_samantha_report" || job.status === "validating_samantha_report") {
    return {
      completedSteps,
      detail: "PolySignal recibio un reporte candidato y esta aplicando validacion estricta.",
      headline: "Validando reporte de Samantha",
      nextAction: "No guardar como prediccion hasta que el reporte pase las compuertas.",
      totalSteps,
    };
  }
  if (job.status === "awaiting_samantha") {
    const agentName = job.analysisAgent?.agentName || "Samantha";
    return {
      completedSteps,
      detail: job.samanthaBridge?.reason || "PolySignal leyo Polymarket, reviso capas disponibles y preparo el brief externo.",
      headline: "Analisis profundo iniciado",
      nextAction: `Guardar como lectura parcial o reintentar cuando ${agentName} automatico este disponible.`,
      totalSteps,
    };
  }
  if (job.status === "failed") {
    return {
      completedSteps,
      detail: job.error || "El job local no pudo avanzar.",
      headline: "Analisis profundo detenido",
      nextAction: "Reintentar desde el analizador.",
      totalSteps,
    };
  }
  return {
    completedSteps,
    detail: "PolySignal esta resolviendo el enlace y preparando capas del analisis profundo.",
    headline: "Analisis profundo en curso",
    nextAction: "Espera a que Polymarket y las capas locales terminen de revisarse.",
    totalSteps,
  };
}

export function jobStepStatusLabel(status: DeepAnalysisJobStepStatus): string {
  if (status === "completed") {
    return "Completado";
  }
  if (status === "running") {
    return "En curso";
  }
  if (status === "blocked") {
    return "Pendiente";
  }
  if (status === "failed") {
    return "Error";
  }
  return "Pendiente";
}
