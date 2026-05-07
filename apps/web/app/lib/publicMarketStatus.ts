export type PublicMarketStatusInput = {
  active?: boolean | null;
  closed?: boolean | null;
  hasAnalysis?: boolean | null;
  hasPrice?: boolean | null;
  isPartial?: boolean | null;
  lifecycleStatus?: string | null;
};

export type PublicMarketStatus = {
  detail: string;
  label:
    | "Activo"
    | "Analizado"
    | "Cerrado"
    | "En observación"
    | "Información parcial"
    | "Pendiente";
  tone: "data-only" | "low-confidence" | "neutral" | "opportunity" | "watchlist";
};

export function getPublicMarketStatus(input: PublicMarketStatusInput): PublicMarketStatus {
  if (
    input.closed === true ||
    input.active === false ||
    input.lifecycleStatus === "closed" ||
    input.lifecycleStatus === "expired"
  ) {
    return {
      detail: "Fuera de revisión activa",
      label: "Cerrado",
      tone: "neutral",
    };
  }

  if (input.isPartial || input.lifecycleStatus === "missed_live_snapshot") {
    return {
      detail: "Faltan precios recientes",
      label: "Información parcial",
      tone: "neutral",
    };
  }

  if (input.hasAnalysis) {
    return {
      detail: "Listo para revisar",
      label: "Analizado",
      tone: "opportunity",
    };
  }

  if (input.hasPrice) {
    return {
      detail: "Tiene precios para seguimiento",
      label: "En observación",
      tone: "watchlist",
    };
  }

  if (input.active === true || input.lifecycleStatus === "live") {
    return {
      detail: "Mercado disponible",
      label: "Activo",
      tone: "data-only",
    };
  }

  return {
    detail: "Esperando más datos",
    label: "Pendiente",
    tone: "neutral",
  };
}
