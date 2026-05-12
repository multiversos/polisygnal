import {
  getPublicMarketStatus,
  type PublicMarketStatus,
  type PublicMarketStatusInput,
} from "./publicMarketStatus";

type NumericValue = number | string | null | undefined;

// Real fields currently available in market overview/detail:
// updatedAt (prediction run or price capture), closeTime, active/closed,
// hasAnalysis, hasPrice, volume, liquidity, and partial-data flags.
// Public labels below must stay descriptive and must not imply advice.
export type PublicMarketInsightInput = PublicMarketStatusInput & {
  closeTime?: string | null;
  liquidity?: NumericValue;
  updatedAt?: string | null;
  volume?: NumericValue;
};

export type PublicMarketInsight = {
  action: string;
  label: "Cerrado" | "En observación" | "Información parcial" | "Para revisar" | "Seguir de cerca";
  reason: string;
  status: PublicMarketStatus;
  tone: "data-only" | "low-confidence" | "neutral" | "opportunity" | "watchlist";
};

export type PublicMarketActivity = {
  detail: string;
  label:
    | "Actividad baja"
    | "Actualizado recientemente"
    | "Con actividad"
    | "Datos limitados"
    | "Mercado cerrado"
    | "Próximo partido"
    | "Sin cambios recientes";
  tone: "data-only" | "low-confidence" | "neutral" | "opportunity" | "watchlist";
};

function toNumber(value: NumericValue): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasActivity(input: PublicMarketInsightInput): boolean {
  return (toNumber(input.volume) ?? 0) > 0 || (toNumber(input.liquidity) ?? 0) > 0;
}

function isRecent(value?: string | null, nowMs = Date.now()): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const ageMs = nowMs - parsed;
  return ageMs >= 0 && ageMs <= 48 * 60 * 60 * 1000;
}

function isSoon(value?: string | null, nowMs = Date.now()): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return parsed >= nowMs && parsed <= nowMs + 7 * 24 * 60 * 60 * 1000;
}

export function getMarketActivityLabel(
  input: PublicMarketInsightInput,
  nowMs = Date.now(),
): PublicMarketActivity | null {
  const status = getPublicMarketStatus(input);
  const activeEnough = hasActivity(input);
  const recent = isRecent(input.updatedAt, nowMs);
  const soon = isSoon(input.closeTime, nowMs);

  if (status.label === "Cerrado") {
    return {
      detail: "Este mercado queda como referencia.",
      label: "Mercado cerrado",
      tone: "neutral",
    };
  }

  if (status.label === "Información parcial") {
    return {
      detail: "Hay algunos datos, pero todavía falta información para destacarlo.",
      label: "Datos limitados",
      tone: "neutral",
    };
  }

  if (recent) {
    return {
      detail: "Recibió información nueva recientemente.",
      label: "Actualizado recientemente",
      tone: "opportunity",
    };
  }

  if (soon) {
    return {
      detail: "El partido o mercado está cerca en el calendario visible.",
      label: "Próximo partido",
      tone: "watchlist",
    };
  }

  if (activeEnough) {
    return {
      detail: "Tiene volumen o liquidez visible para revisión.",
      label: "Con actividad",
      tone: "watchlist",
    };
  }

  if (input.updatedAt) {
    return {
      detail: "No vemos información reciente suficiente para destacarlo.",
      label: "Sin cambios recientes",
      tone: "neutral",
    };
  }

  if (input.hasPrice) {
    return {
      detail: "Tiene precio visible, pero poca actividad adicional.",
      label: "Actividad baja",
      tone: "data-only",
    };
  }

  return null;
}

export function getMarketReviewPriority(input: PublicMarketInsightInput, nowMs = Date.now()): number {
  const status = getPublicMarketStatus(input);
  const activity = getMarketActivityLabel(input, nowMs);
  let priority = 0;

  if (status.label !== "Cerrado") {
    priority += 100;
  }
  if (status.label === "Analizado") {
    priority += 50;
  }
  if (activity?.label === "Actualizado recientemente") {
    priority += 35;
  }
  if (activity?.label === "Próximo partido") {
    priority += 25;
  }
  if (hasActivity(input)) {
    priority += 15;
  }
  if (status.label === "Información parcial") {
    priority -= 25;
  }
  if (status.label === "Cerrado") {
    priority -= 100;
  }

  return priority;
}

export function getMarketReviewReason(
  input: PublicMarketInsightInput,
  nowMs = Date.now(),
): PublicMarketInsight {
  const status = getPublicMarketStatus(input);
  const activeEnough = hasActivity(input);
  const recent = isRecent(input.updatedAt, nowMs);
  const soon = isSoon(input.closeTime, nowMs);

  if (status.label === "Cerrado") {
    return {
      action: "Queda como referencia para consultar el historial.",
      label: "Cerrado",
      reason: "Mercado cerrado; no requiere revisión inmediata.",
      status,
      tone: "neutral",
    };
  }

  if (status.label === "Información parcial") {
    return {
      action: "Puedes guardarlo y volver a revisarlo cuando haya más información.",
      label: "Información parcial",
      reason: "Tiene datos limitados; conviene revisarlo más tarde.",
      status,
      tone: "neutral",
    };
  }

  if (status.label === "Analizado" && recent) {
    return {
    action: "Revisa el detalle o guarda una lectura desde el Analizador para seguirlo.",
      label: "Para revisar",
      reason: "Tiene análisis disponible y datos recientes.",
      status,
      tone: "opportunity",
    };
  }

  if (status.label === "Analizado") {
    return {
      action: "Revisa el detalle antes de decidir si quieres seguirlo.",
      label: "Para revisar",
      reason: "Tiene información suficiente para una lectura inicial.",
      status,
      tone: "opportunity",
    };
  }

  if (soon && activeEnough) {
    return {
      action: "Puede valer la pena seguirlo de cerca.",
      label: "Seguir de cerca",
      reason: "Partido próximo con mercado activo.",
      status,
      tone: "watchlist",
    };
  }

  if (status.label === "En observación" || status.label === "Activo") {
    return {
      action: "Guárdalo si quieres revisarlo más rápido después.",
      label: "En observación",
      reason: "Mercado con información suficiente para seguir de cerca.",
      status,
      tone: "watchlist",
    };
  }

  return {
    action: "Espera más actividad antes de priorizarlo.",
    label: "En observación",
    reason: "Aún falta información para destacarlo.",
    status,
    tone: "neutral",
  };
}
