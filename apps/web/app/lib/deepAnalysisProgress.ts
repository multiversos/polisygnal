export type DeepAnalysisProgressState =
  | "queued"
  | "reading_polymarket"
  | "analyzing_market_movement"
  | "analyzing_wallets"
  | "profiling_wallets"
  | "preparing_samantha_brief"
  | "waiting_samantha_report"
  | "researching_external_sources"
  | "comparing_odds"
  | "comparing_kalshi"
  | "scoring_evidence"
  | "generating_decision"
  | "completed"
  | "failed";

export type DeepAnalysisProgressStep = {
  canRunNow: boolean;
  isLongRunning: boolean;
  label: string;
  publicCopy: string;
  requiresBackendJob: boolean;
  requiresExternalSource: boolean;
  state: DeepAnalysisProgressState;
};

export const DEEP_ANALYSIS_PROGRESS_STEPS: DeepAnalysisProgressStep[] = [
  {
    canRunNow: true,
    isLongRunning: false,
    label: "En cola",
    publicCopy: "Preparando analisis profundo.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "queued",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Leyendo Polymarket",
    publicCopy: "Leyendo mercado, outcomes, precios y estado desde Polymarket.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "reading_polymarket",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Analizando mercado",
    publicCopy: "Revisando volumen, liquidez y datos visibles disponibles.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "analyzing_market_movement",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Revisando billeteras",
    publicCopy: "Revisando datos publicos de billeteras cuando hay id compatible.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "analyzing_wallets",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Perfilando wallets",
    publicCopy: "Pendiente de integracion: historial cerrado y desempeno real por wallet.",
    requiresBackendJob: true,
    requiresExternalSource: true,
    state: "profiling_wallets",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Brief para Samantha",
    publicCopy: "Preparando brief estructurado para investigacion externa manual.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "preparing_samantha_brief",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Reporte de Samantha",
    publicCopy: "Esperando que el usuario pegue un reporte estructurado validable.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "waiting_samantha_report",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Investigacion externa",
    publicCopy: "Pendiente de integracion segura de noticias, fuentes oficiales y senales sociales debiles.",
    requiresBackendJob: true,
    requiresExternalSource: true,
    state: "researching_external_sources",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Comparando odds",
    publicCopy: "Pendiente de proveedor, rate limit, cache y revision de cumplimiento.",
    requiresBackendJob: true,
    requiresExternalSource: true,
    state: "comparing_odds",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Comparando Kalshi",
    publicCopy: "Pendiente de integracion de contratos equivalentes y matching auditado.",
    requiresBackendJob: true,
    requiresExternalSource: true,
    state: "comparing_kalshi",
  },
  {
    canRunNow: false,
    isLongRunning: true,
    label: "Evaluando evidencia",
    publicCopy: "Pendiente de fuentes independientes suficientes y control de calidad.",
    requiresBackendJob: true,
    requiresExternalSource: false,
    state: "scoring_evidence",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Preparando decision",
    publicCopy: "Preparando lectura responsable sin crear prediccion si faltan evidencias.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "generating_decision",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Completado",
    publicCopy: "Analisis profundo preparado con los datos disponibles.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "completed",
  },
  {
    canRunNow: true,
    isLongRunning: false,
    label: "Error",
    publicCopy: "No pudimos completar la lectura ahora.",
    requiresBackendJob: false,
    requiresExternalSource: false,
    state: "failed",
  },
];

export function getDeepAnalysisProgressStep(
  state: DeepAnalysisProgressState,
): DeepAnalysisProgressStep {
  return (
    DEEP_ANALYSIS_PROGRESS_STEPS.find((step) => step.state === state) ??
    {
      canRunNow: true,
      isLongRunning: false,
      label: "En cola",
      publicCopy: "Preparando analisis profundo.",
      requiresBackendJob: false,
      requiresExternalSource: false,
      state: "queued",
    }
  );
}

export function getDeepAnalysisProgressPlan(): DeepAnalysisProgressStep[] {
  return DEEP_ANALYSIS_PROGRESS_STEPS;
}

export function getRunnableDeepAnalysisSteps(): DeepAnalysisProgressStep[] {
  return DEEP_ANALYSIS_PROGRESS_STEPS.filter((step) => step.canRunNow);
}
