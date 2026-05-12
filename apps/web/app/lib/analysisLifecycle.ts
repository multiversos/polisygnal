import { hasClearPrediction, shouldCountForAccuracy } from "./analysisDecision";
import type { AnalysisHistoryItem } from "./analysisHistory";

export type AnalysisLifecycleStatus =
  | "created"
  | "analyzing"
  | "saved"
  | "tracking"
  | "awaiting_resolution"
  | "resolved_hit"
  | "resolved_miss"
  | "cancelled"
  | "unknown"
  | "no_clear_decision";

export type AnalysisLifecycleEvent =
  | "analysis_reanalyzed"
  | "analysis_saved"
  | "accuracy_counted"
  | "link_submitted"
  | "market_resolved"
  | "result_checked";

export type AnalysisLifecycleState = {
  countableForAccuracy: boolean;
  event?: AnalysisLifecycleEvent;
  label: string;
  nextCheckHint: string;
  status: AnalysisLifecycleStatus;
  summary: string;
};

function hasFinalResolution(item: AnalysisHistoryItem): boolean {
  return (
    item.result === "hit" ||
    item.result === "miss" ||
    item.result === "cancelled" ||
    item.status === "resolved"
  );
}

export function getAnalysisLifecycleState(item: AnalysisHistoryItem): AnalysisLifecycleState {
  if (shouldCountForAccuracy(item) && item.result === "hit") {
    return {
      countableForAccuracy: true,
      event: "accuracy_counted",
      label: "Acerto verificado",
      nextCheckHint: "Ya cuenta en rendimiento.",
      status: "resolved_hit",
      summary: "Prediccion clara confirmada por el resultado final.",
    };
  }

  if (shouldCountForAccuracy(item) && item.result === "miss") {
    return {
      countableForAccuracy: true,
      event: "accuracy_counted",
      label: "Fallo verificado",
      nextCheckHint: "Ya cuenta en rendimiento.",
      status: "resolved_miss",
      summary: "Prediccion clara no coincidio con el resultado final.",
    };
  }

  if (item.result === "cancelled" || item.outcome === "CANCELLED") {
    return {
      countableForAccuracy: false,
      event: "market_resolved",
      label: "Cancelado",
      nextCheckHint: "No cuenta como fallo.",
      status: "cancelled",
      summary: "El mercado fue cancelado o no tuvo resultado operativo.",
    };
  }

  if (
    item.awaitingResearch ||
    item.researchStatus === "awaiting_samantha" ||
    item.researchStatus === "ready_to_score"
  ) {
    return {
      countableForAccuracy: false,
      event: "analysis_saved",
      label:
        item.researchStatus === "ready_to_score"
          ? "Evidencia cargada, decision pendiente"
          : "Pendiente de investigacion",
      nextCheckHint:
        item.researchStatus === "ready_to_score"
          ? "Reabrir el analizador para revisar evidencia y decidir si falta investigacion."
          : "Continuar en /analyze y cargar el reporte de Samantha.",
      status: "analyzing",
      summary:
        item.researchStatus === "ready_to_score"
          ? "Hay evidencia externa validada, pero no alcanza para una prediccion responsable."
          : "Analisis profundo iniciado; espera reporte de Samantha antes de generar decision.",
    };
  }

  if (!hasClearPrediction(item)) {
    return {
      countableForAccuracy: false,
      event: item.source === "link_analyzer" ? "analysis_saved" : undefined,
      label: "Sin decision clara",
      nextCheckHint: "No contara para precision salvo que exista una prediccion clara futura.",
      status: "no_clear_decision",
      summary: "Guardado como seguimiento, no como prediccion medible.",
    };
  }

  if (item.result === "pending" || item.status === "open") {
    return {
      countableForAccuracy: false,
      event: "analysis_saved",
      label: "Esperando resolucion",
      nextCheckHint: "Revisar cuando Polymarket confirme el resultado final.",
      status: "awaiting_resolution",
      summary: "Prediccion clara guardada, pendiente de resultado verificable.",
    };
  }

  if (hasFinalResolution(item)) {
    return {
      countableForAccuracy: false,
      event: "result_checked",
      label: "Resultado no medible",
      nextCheckHint: "No se suma a precision sin resultado confiable YES/NO.",
      status: "unknown",
      summary: "Hubo revision, pero el resultado no es suficiente para medir acierto.",
    };
  }

  return {
    countableForAccuracy: false,
    event: "result_checked",
    label: "Estado desconocido",
    nextCheckHint: "Actualizar resultados desde Historial.",
    status: "unknown",
    summary: "PolySignal aun no puede verificar este analisis.",
  };
}

export function getTrackingStatusForHistory(item: AnalysisHistoryItem): AnalysisLifecycleStatus {
  return getAnalysisLifecycleState(item).status;
}

export function getNextCheckHintForHistory(item: AnalysisHistoryItem): string {
  return getAnalysisLifecycleState(item).nextCheckHint;
}
