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
  explanation: string;
  label:
    | "Activo"
    | "Analizado"
    | "Cerrado"
    | "En observación"
    | "Información parcial"
    | "Pendiente";
  tone: "data-only" | "low-confidence" | "neutral" | "opportunity" | "watchlist";
};

export const PUBLIC_MARKET_STATUS_EXPLANATIONS: Record<PublicMarketStatus["label"], string> = {
  Activo: "El mercado está disponible para revisión.",
  Analizado: "Este mercado tiene información suficiente para mostrar una lectura inicial.",
  Cerrado: "Este mercado ya no está activo.",
  "En observación": "Estamos siguiendo este mercado, pero todavía falta más información para destacarlo.",
  "Información parcial": "Este mercado tiene algunos datos disponibles, pero todavía no está completo.",
  Pendiente: "Este mercado todavía está esperando más actividad o información.",
};

export function explainPublicMarketStatus(label: PublicMarketStatus["label"]): string {
  return PUBLIC_MARKET_STATUS_EXPLANATIONS[label];
}

export function getPublicMarketStatus(input: PublicMarketStatusInput): PublicMarketStatus {
  if (
    input.closed === true ||
    input.active === false ||
    input.lifecycleStatus === "closed" ||
    input.lifecycleStatus === "expired"
  ) {
    return {
      detail: PUBLIC_MARKET_STATUS_EXPLANATIONS.Cerrado,
      explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS.Cerrado,
      label: "Cerrado",
      tone: "neutral",
    };
  }

  if (input.isPartial || input.lifecycleStatus === "missed_live_snapshot") {
    return {
      detail: PUBLIC_MARKET_STATUS_EXPLANATIONS["Información parcial"],
      explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS["Información parcial"],
      label: "Información parcial",
      tone: "neutral",
    };
  }

  if (input.hasAnalysis) {
    return {
      detail: PUBLIC_MARKET_STATUS_EXPLANATIONS.Analizado,
      explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS.Analizado,
      label: "Analizado",
      tone: "opportunity",
    };
  }

  if (input.hasPrice) {
    return {
      detail: PUBLIC_MARKET_STATUS_EXPLANATIONS["En observación"],
      explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS["En observación"],
      label: "En observación",
      tone: "watchlist",
    };
  }

  if (input.active === true || input.lifecycleStatus === "live") {
    return {
      detail: PUBLIC_MARKET_STATUS_EXPLANATIONS.Activo,
      explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS.Activo,
      label: "Activo",
      tone: "data-only",
    };
  }

  return {
    detail: PUBLIC_MARKET_STATUS_EXPLANATIONS.Pendiente,
    explanation: PUBLIC_MARKET_STATUS_EXPLANATIONS.Pendiente,
    label: "Pendiente",
    tone: "neutral",
  };
}
