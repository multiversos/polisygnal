import type { MarketOverviewItem } from "./marketOverview";
import {
  getWalletSignalSummary,
  shouldUseWalletAsAuxiliarySignal,
} from "./walletIntelligence";
import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";
import type {
  DeepAnalysisLayer,
  DeepAnalysisLayerId,
  DeepAnalysisLayerStatus,
  DeepAnalysisSignal,
  DeepAnalysisSignalDirection,
  DeepAnalyzerDecision,
  DeepAnalyzerMarket,
  DeepAnalyzerMarketOutcome,
  DeepAnalyzerResult,
} from "./deepAnalyzerTypes";

const DEEP_ANALYZER_DECISION_THRESHOLD = 55;

type LayerDefinition = {
  id: DeepAnalysisLayerId;
  label: string;
  missing: string[];
  status: DeepAnalysisLayerStatus;
  summary: string;
  warnings?: string[];
};

const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: "polymarket_market",
    label: "Polymarket",
    missing: ["Enlace resuelto desde fuente estructurada"],
    status: "pending",
    summary: "Esperando datos estructurados de Polymarket.",
  },
  {
    id: "market_movement",
    label: "Movimiento del mercado",
    missing: ["Historial de precio", "Cambios de volumen", "Cambios de liquidez"],
    status: "unavailable",
    summary: "Movimiento historico pendiente de integracion.",
  },
  {
    id: "wallet_intelligence",
    label: "Wallet Intelligence",
    missing: ["Billeteras publicas relevantes", "Capital observado", "Lado YES/NO"],
    status: "unavailable",
    summary: "Datos de billeteras no disponibles para este mercado.",
    warnings: ["Senal auxiliar; no crea prediccion por si sola."],
  },
  {
    id: "wallet_profiles",
    label: "Perfiles de billeteras",
    missing: ["Historial cerrado por wallet", "Win rate real", "ROI historico real"],
    status: "blocked",
    summary: "Pendiente de fuente confiable de perfiles publicos.",
    warnings: ["No se infiere identidad personal de wallets."],
  },
  {
    id: "external_research",
    label: "Investigacion externa",
    missing: ["Noticias", "Fuentes oficiales", "Reddit/social como senal debil"],
    status: "blocked",
    summary: "Pendiente de integracion segura; no hay busqueda externa activa.",
  },
  {
    id: "odds_comparison",
    label: "Odds externas",
    missing: ["Proveedor de odds", "Match de evento", "Lineas comparables"],
    status: "blocked",
    summary: "Pendiente de proveedor y revision de cumplimiento.",
  },
  {
    id: "kalshi_comparison",
    label: "Kalshi",
    missing: ["Contrato equivalente", "Match por pregunta/fecha", "Liquidez comparable"],
    status: "blocked",
    summary: "Comparacion preparada como capa futura; no se consulta ahora.",
  },
  {
    id: "category_context",
    label: "Contexto por categoria",
    missing: ["Contexto especifico del mercado", "Factores por vertical"],
    status: "partial",
    summary: "Contexto basico desde categoria, deporte o slug cuando existe.",
  },
  {
    id: "evidence_scoring",
    label: "Scoring de evidencia",
    missing: ["Evidencia independiente suficiente", "Calibracion", "Control de calidad"],
    status: "blocked",
    summary: "Scoring profundo pendiente de fuentes independientes suficientes.",
  },
  {
    id: "decision",
    label: "Decision PolySignal",
    missing: ["Senales independientes suficientes"],
    status: "pending",
    summary: "Decision pendiente hasta superar la compuerta de evidencia.",
  },
  {
    id: "history_tracking",
    label: "Historial",
    missing: ["Guardado local del analisis"],
    status: "pending",
    summary: "Se puede guardar como seguimiento local si el usuario lo decide.",
  },
  {
    id: "resolution",
    label: "Resolucion",
    missing: ["Resultado final confiable de Polymarket"],
    status: "pending",
    summary: "Pendiente hasta que Polymarket confirme el resultado final.",
  },
];

function getLayerDefinition(id: DeepAnalysisLayerId): LayerDefinition {
  const definition = LAYER_DEFINITIONS.find((item) => item.id === id);
  if (definition) {
    return definition;
  }
  return {
    id,
    label: "Capa",
    missing: [],
    status: "unavailable",
    summary: "Capa no disponible.",
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeLayer(definition: LayerDefinition, checkedAt?: string): DeepAnalysisLayer {
  return {
    checkedAt,
    id: definition.id,
    label: definition.label,
    missing: definition.missing,
    signals: [],
    status: definition.status,
    summary: definition.summary,
    warnings: definition.warnings ?? [],
  };
}

function replaceLayer(
  result: DeepAnalyzerResult,
  layer: DeepAnalysisLayer,
): DeepAnalyzerResult {
  return {
    ...result,
    layers: result.layers.map((item) => (item.id === layer.id ? layer : item)),
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toOutcomeSide(value: unknown): DeepAnalyzerMarketOutcome["side"] {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "YES" || normalized === "NO" || normalized === "DRAW") {
    return normalized;
  }
  return "UNKNOWN";
}

function normalizeMarket(item: MarketOverviewItem): DeepAnalyzerMarket | undefined {
  const title = item.market?.question || item.market?.event_title || item.market?.market_slug;
  if (!title) {
    return undefined;
  }
  const source = item.market?.source;
  const safeSource =
    source === "clob" || source === "gamma" || source === "polymarket"
      ? source
      : "polymarket";
  return {
    active: item.market?.active ?? undefined,
    closeTime: item.market?.close_time ?? item.market?.end_date ?? undefined,
    closed: item.market?.closed ?? undefined,
    conditionId: item.market?.condition_id ?? undefined,
    eventSlug: item.market?.event_slug ?? undefined,
    liquidity: toNumber(item.latest_snapshot?.liquidity),
    marketSlug: item.market?.market_slug ?? undefined,
    outcomes: (item.market?.outcomes ?? [])
      .filter((outcome) => outcome.label)
      .map((outcome) => ({
        label: String(outcome.label),
        price: toNumber(outcome.price),
        side: toOutcomeSide(outcome.side),
      })),
    source: safeSource,
    title,
    volume: toNumber(item.latest_snapshot?.volume),
  };
}

function marketSignals(market: DeepAnalyzerMarket): DeepAnalysisSignal[] {
  const signals: DeepAnalysisSignal[] = [
    {
      confidence: "medium",
      direction: "UNKNOWN",
      isReal: true,
      label: "Mercado resuelto",
      reason: "El enlace produjo datos estructurados del mercado.",
      source: market.source,
      strength: "medium",
    },
  ];
  if (market.outcomes.some((outcome) => typeof outcome.price === "number")) {
    signals.push({
      confidence: "medium",
      direction: "UNKNOWN",
      isReal: true,
      label: "Precios visibles",
      reason: "Los precios son referencia del mercado, no estimacion PolySignal.",
      source: market.source,
      strength: "low",
    });
  }
  return signals;
}

function missingMarketMovement(market: DeepAnalyzerMarket): string[] {
  const missing = [];
  if (typeof market.volume !== "number") {
    missing.push("Volumen");
  }
  if (typeof market.liquidity !== "number") {
    missing.push("Liquidez");
  }
  missing.push("Historial de precio");
  return missing;
}

function mapWalletDirection(direction: WalletIntelligenceSummary["signalDirection"]): DeepAnalysisSignalDirection {
  if (direction === "YES" || direction === "NO") {
    return direction;
  }
  if (direction === "BOTH" || direction === "NEUTRAL") {
    return "NEUTRAL";
  }
  return "UNKNOWN";
}

function mapWalletConfidence(confidence: WalletIntelligenceSummary["confidence"]): DeepAnalysisSignal["confidence"] {
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return confidence;
  }
  return "unknown";
}

function initialDecision(reason: string): DeepAnalyzerDecision {
  return {
    available: false,
    confidence: "none",
    countsForAccuracy: false,
    reason,
    side: "NONE",
    threshold: DEEP_ANALYZER_DECISION_THRESHOLD,
  };
}

export function createInitialDeepAnalysis(
  url: string,
  normalizedUrl = url,
): DeepAnalyzerResult {
  const generatedAt = nowIso();
  return {
    analysisId: `deep-${Date.now()}`,
    decision: initialDecision(
      "Analisis profundo preparado; decision pendiente de fuentes independientes suficientes.",
    ),
    generatedAt,
    layers: LAYER_DEFINITIONS.map((definition) => makeLayer(definition, generatedAt)),
    normalizedUrl,
    url,
  };
}

export function buildDeepAnalysisFromPolymarketMarket(input: {
  item?: MarketOverviewItem | null;
  normalizedUrl: string;
  url?: string;
}): DeepAnalyzerResult {
  const result = createInitialDeepAnalysis(input.url ?? input.normalizedUrl, input.normalizedUrl);
  const market = input.item ? normalizeMarket(input.item) : undefined;
  if (!market) {
    return replaceLayer(result, {
      ...makeLayer(getLayerDefinition("polymarket_market"), result.generatedAt),
      missing: ["Mercado estructurado desde Polymarket"],
      status: "unavailable",
      summary: "No hay mercado estructurado para analizar sin inventar datos.",
      warnings: ["No se usa fallback interno ni cross-sport."],
    });
  }

  const withMarket: DeepAnalyzerResult = {
    ...result,
    market,
  };
  const movementMissing = missingMarketMovement(market);
  const movementAvailable = movementMissing.length <= 1;

  const withStructuredLayers = replaceLayer(
    replaceLayer(
      replaceLayer(withMarket, {
        checkedAt: result.generatedAt,
        id: "polymarket_market",
        label: "Polymarket",
        missing: [],
        signals: marketSignals(market),
        status: "available",
        summary: "Mercado, outcomes, estado y datos visibles leidos desde Polymarket.",
        warnings: ["El precio visible no es una estimacion PolySignal."],
      }),
      {
        checkedAt: result.generatedAt,
        id: "market_movement",
        label: "Movimiento del mercado",
        missing: movementMissing,
        signals: [],
        status: movementAvailable ? "partial" : "unavailable",
        summary: movementAvailable
          ? "Volumen o liquidez visibles; historial de precio pendiente."
          : "Movimiento historico y metricas de mercado aun incompletas.",
        warnings: ["No se infiere momentum sin historial estructurado."],
      },
    ),
    {
      checkedAt: result.generatedAt,
      id: "category_context",
      label: "Contexto por categoria",
      missing: ["Contexto especifico por vertical"],
      signals: [],
      status: market.eventSlug || market.marketSlug ? "partial" : "unavailable",
      summary: market.eventSlug || market.marketSlug
        ? "Categoria, slug o evento disponibles como contexto basico."
        : "Contexto de categoria pendiente.",
      warnings: ["El contexto basico no genera prediccion por si solo."],
    },
  );

  return {
    ...withStructuredLayers,
    decision: buildDeepDecision(withStructuredLayers),
  };
}

export function mergeWalletIntelligenceLayer(
  result: DeepAnalyzerResult,
  walletSummary?: WalletIntelligenceSummary | null,
): DeepAnalyzerResult {
  const walletReading = getWalletSignalSummary(walletSummary);
  const available = shouldUseWalletAsAuxiliarySignal(walletSummary);
  const signal: DeepAnalysisSignal[] =
    available && walletSummary
      ? [
          {
            confidence: mapWalletConfidence(walletSummary.confidence),
            direction: mapWalletDirection(walletSummary.signalDirection),
            isReal: true,
            label: walletReading.auxiliaryLabel,
            reason: walletReading.explanation,
            source: walletSummary.source === "backend" ? "Polymarket/Gamma read-only" : "wallet_intelligence",
            strength: walletSummary.confidence === "high" ? "medium" : "low",
          },
        ]
      : [];
  const next = replaceLayer(result, {
    checkedAt: walletSummary?.checkedAt ?? result.generatedAt,
    id: "wallet_intelligence",
    label: "Wallet Intelligence",
    missing: available ? ["Win rate confiable", "ROI historico completo"] : ["Billeteras publicas relevantes"],
    signals: signal,
    status: available ? "available" : "unavailable",
    summary: available
      ? `${walletReading.biasLabel}. ${walletReading.confidenceLabel}.`
      : "No hay suficiente actividad publica de billeteras para este mercado.",
    warnings: walletReading.warnings,
  });
  return {
    ...next,
    decision: buildDeepDecision(next),
  };
}

export function buildMissingResearchLayers(result: DeepAnalyzerResult): DeepAnalyzerResult {
  return ["external_research", "odds_comparison", "kalshi_comparison", "wallet_profiles"].reduce(
    (current, id) => {
      const existing = current.layers.find((layer) => layer.id === id);
      return existing ? replaceLayer(current, existing) : current;
    },
    result,
  );
}

export function canGenerateDecision(result: DeepAnalyzerResult): boolean {
  const realIndependentSignals = result.layers.flatMap((layer) =>
    layer.signals.filter(
      (signal) =>
        signal.isReal &&
        signal.source !== "polymarket" &&
        signal.source !== "gamma" &&
        signal.source !== "clob",
    ),
  );
  const evidenceLayer = result.layers.find((layer) => layer.id === "evidence_scoring");
  return Boolean(
    evidenceLayer?.status === "available" &&
      realIndependentSignals.length >= 2 &&
      result.decision.yesProbability !== undefined &&
      result.decision.noProbability !== undefined,
  );
}

export function buildDeepDecision(result: DeepAnalyzerResult): DeepAnalyzerDecision {
  if (canGenerateDecision(result)) {
    return result.decision;
  }
  const walletLayer = result.layers.find((layer) => layer.id === "wallet_intelligence");
  const hasWalletSignal = Boolean(walletLayer?.signals.some((signal) => signal.isReal));
  return initialDecision(
    hasWalletSignal
      ? "Hay senales auxiliares reales, pero no bastan para una estimacion propia responsable."
      : "Decision pendiente: faltan fuentes independientes suficientes y scoring de evidencia.",
  );
}

export function summarizeDeepAnalysis(result: DeepAnalyzerResult): string {
  const available = result.layers.filter((layer) => layer.status === "available").length;
  const partial = result.layers.filter((layer) => layer.status === "partial").length;
  const blocked = result.layers.filter((layer) => layer.status === "blocked").length;
  if (result.decision.available) {
    return "Analisis profundo con decision PolySignal disponible.";
  }
  return `Capas disponibles: ${available}; parciales: ${partial}; pendientes de integracion: ${blocked}. Sin decision PolySignal suficiente.`;
}
