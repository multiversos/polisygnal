import { getDisplayMarketPrices } from "./marketDataDisplay";
import type { MarketOverviewItem } from "./marketOverview";
import type { SamanthaResearchReport } from "./samanthaResearchTypes";
import { buildSportsContextEvidence } from "./sportsContext";
import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";

export type IndependentEvidenceStatus =
  | "available"
  | "partial"
  | "not_connected"
  | "unavailable"
  | "timeout"
  | "insufficient"
  | "blocked";

export type IndependentEvidenceCategory =
  | "market"
  | "wallets"
  | "external_odds"
  | "sports_context"
  | "injuries"
  | "recent_form"
  | "schedule_context"
  | "news"
  | "historical_comparable"
  | "samantha_research"
  | "kalshi_comparable"
  | "other";

export type IndependentEvidenceItem = {
  category: IndependentEvidenceCategory;
  checkedAt: string | null;
  confidence: "high" | "low" | "medium" | "unknown";
  direction: "YES" | "NO" | "neutral" | "unknown";
  id: string;
  isIndependent: boolean;
  label: string;
  limitations: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  status: IndependentEvidenceStatus;
  summary: string;
};

export type IndependentEvidenceSummary = {
  availableAuxiliaryCount: number;
  availableIndependentCount: number;
  enoughForEstimate: boolean;
  items: IndependentEvidenceItem[];
  missingRequiredCategories: string[];
  reason: string;
};

type BuildIndependentEvidenceSummaryInput = {
  agentName?: string;
  item: MarketOverviewItem;
  samanthaStatus?: "completed" | "insufficient" | "partial" | "pending" | "unavailable";
  samanthaReport?: SamanthaResearchReport;
  suggestedDecisionAvailable?: boolean;
  walletSummary: WalletIntelligenceSummary;
};

type MarketVertical = "generic" | "politics" | "sports";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compactUsd(value: unknown): string | null {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }
  return new Intl.NumberFormat("es", {
    currency: "USD",
    maximumFractionDigits: parsed >= 100 ? 0 : 2,
    notation: parsed >= 100000 ? "compact" : "standard",
    style: "currency",
  }).format(parsed);
}

function normalizeStatusLabel(status: IndependentEvidenceStatus): string {
  if (status === "available") {
    return "Disponible";
  }
  if (status === "partial") {
    return "Parcial";
  }
  if (status === "not_connected") {
    return "Fuente no conectada";
  }
  if (status === "timeout") {
    return "Timeout";
  }
  if (status === "blocked") {
    return "Bloqueada";
  }
  if (status === "insufficient") {
    return "Insuficiente";
  }
  return "No disponible";
}

export function getIndependentEvidenceStatusLabel(status: IndependentEvidenceStatus): string {
  return normalizeStatusLabel(status);
}

function marketVertical(item: MarketOverviewItem): MarketVertical {
  const sport = (item.market?.sport_type || "").trim().toLowerCase();
  if (sport) {
    return "sports";
  }
  const text = [
    item.market?.market_type,
    item.market?.question,
    item.market?.event_title,
    item.market?.event_slug,
    item.market?.market_slug,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
  if (
    text.includes("president") ||
    text.includes("presidential") ||
    text.includes("nominee") ||
    text.includes("democrat") ||
    text.includes("republican") ||
    text.includes("election") ||
    text.includes("senate") ||
    text.includes("governor")
  ) {
    return "politics";
  }
  return "generic";
}

function latestCheckedAt(item: MarketOverviewItem): string | null {
  return item.latest_snapshot?.captured_at || item.latest_prediction?.run_at || item.market?.close_time || null;
}

function firstExternalEvidenceUrl(report?: SamanthaResearchReport): string | null {
  return (
    report?.evidence.find(
      (item) =>
        item.sourceUrl &&
        item.sourceType !== "reddit" &&
        item.sourceType !== "social" &&
        item.reliability !== "unknown",
    )?.sourceUrl || null
  );
}

function samanthaExternalEvidenceCount(report?: SamanthaResearchReport): number {
  if (!report || report.status === "failed") {
    return 0;
  }
  const evidenceCount = report.evidence.filter(
    (item) =>
      item.sourceType !== "reddit" &&
      item.sourceType !== "social" &&
      item.reliability !== "unknown" &&
      item.direction !== "UNKNOWN",
  ).length;
  const oddsCount =
    report.oddsComparison?.found &&
    report.oddsComparison.direction !== "UNKNOWN" &&
    report.oddsComparison.reliability !== "unknown"
      ? 1
      : 0;
  const kalshiCount =
    report.kalshiComparison?.found &&
    report.kalshiComparison.equivalent &&
    report.kalshiComparison.direction !== "UNKNOWN" &&
    report.kalshiComparison.reliability !== "unknown"
      ? 1
      : 0;
  return evidenceCount + oddsCount + kalshiCount;
}

function buildMarketEvidence(item: MarketOverviewItem): IndependentEvidenceItem {
  const display = getDisplayMarketPrices(item);
  const volume = compactUsd(item.latest_snapshot?.volume);
  const liquidity = compactUsd(item.latest_snapshot?.liquidity);
  const hasStructuredMarketData =
    display.mode !== "unavailable" ||
    volume !== null ||
    liquidity !== null ||
    Boolean(item.market?.question || item.market?.event_title);
  const marketSummary =
    display.mode === "outcome"
      ? `Precio y outcomes visibles desde Polymarket. ${display.cards
          .slice(0, 2)
          .map((card) => `${card.name} ${card.price?.toFixed(3) ?? "sin dato"}`)
          .join(" / ")}`
      : display.mode === "binary"
        ? "Precio YES/NO visible desde Polymarket."
        : hasStructuredMarketData
          ? "Mercado identificado, pero sin precio visible completo."
          : "No hay datos de mercado suficientes desde Polymarket.";

  const marketDirection =
    display.leader?.label === "YES"
      ? "YES"
      : display.leader?.label === "NO"
        ? "NO"
        : "unknown";
  return {
    category: "market",
    checkedAt: latestCheckedAt(item),
    confidence: display.mode === "unavailable" ? "unknown" : "low",
    direction: marketDirection,
    id: "market_reference",
    isIndependent: false,
    label: "Precio de mercado",
    limitations: ["Referencia de Polymarket; no es estimacion propia de PolySignal."],
    sourceName: "Polymarket",
    sourceUrl: item.market?.market_slug
      ? `https://polymarket.com/market/${item.market.market_slug}`
      : item.market?.event_slug
        ? `https://polymarket.com/event/${item.market.event_slug}`
        : null,
    status: hasStructuredMarketData ? "available" : "unavailable",
    summary: [marketSummary, volume ? `Volumen ${volume}.` : null, liquidity ? `Liquidez ${liquidity}.` : null]
      .filter(Boolean)
      .join(" "),
  };
}

function buildWalletEvidence(summary: WalletIntelligenceSummary): IndependentEvidenceItem {
  let status: IndependentEvidenceStatus = "unavailable";
  if (summary.queryStatus === "timeout") {
    status = "timeout";
  } else if (summary.available && summary.relevantWalletsCount > 0) {
    status = "available";
  } else if (summary.available) {
    status = "partial";
  } else if (summary.queryStatus === "empty") {
    status = "insufficient";
  } else if (summary.queryStatus === "unavailable") {
    status = "unavailable";
  }

  const capital = compactUsd(summary.analyzedCapitalUsd);
  const neutral = compactUsd(summary.neutralCapitalUsd);
  return {
    category: "wallets",
    checkedAt: summary.checkedAt || null,
    confidence: summary.confidence === "none" ? "unknown" : summary.confidence,
    direction:
      summary.signalDirection === "YES" || summary.signalDirection === "NO"
        ? summary.signalDirection
        : "neutral",
    id: "wallet_intelligence",
    isIndependent: false,
    label: "Billeteras",
    limitations: [
      "Senal auxiliar basada en actividad publica; no basta sola para una estimacion responsable.",
      ...(summary.limitations ?? []).slice(0, 2),
    ].filter(Boolean),
    sourceName: "Wallet Intelligence",
    sourceUrl: null,
    status,
    summary: summary.available
      ? [
          `${summary.relevantWalletsCount} billeteras relevantes.`,
          capital ? `Capital observado ${capital}.` : null,
          neutral ? `Capital neutral ${neutral}.` : null,
          summary.highlightedProfilesCount
            ? `${summary.highlightedProfilesCount} perfiles destacados.`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : summary.reason || "Wallet Intelligence no devolvio actividad publica util para este mercado.",
  };
}

function buildSamanthaEvidence(input: BuildIndependentEvidenceSummaryInput): IndependentEvidenceItem {
  const report = input.samanthaReport;
  const independentCount = samanthaExternalEvidenceCount(report);
  let status: IndependentEvidenceStatus = "not_connected";
  if (report?.status === "completed" && independentCount > 0) {
    status = "available";
  } else if (report?.status === "partial" || report?.status === "completed") {
    status = "partial";
  } else if (report?.status === "failed") {
    status = "insufficient";
  } else if (input.samanthaStatus === "unavailable") {
    status = "unavailable";
  } else if (input.samanthaStatus === "pending") {
    status = "timeout";
  }

  return {
    category: "samantha_research",
    checkedAt: report?.completedAt || null,
    confidence:
      report?.suggestedEstimate?.confidence === "high" ||
      report?.suggestedEstimate?.confidence === "medium" ||
      report?.suggestedEstimate?.confidence === "low"
        ? report.suggestedEstimate.confidence
        : "unknown",
    direction:
      report?.suggestedEstimate?.decision === "YES" || report?.suggestedEstimate?.decision === "NO"
        ? report.suggestedEstimate.decision
        : "unknown",
    id: "samantha_research",
    isIndependent: independentCount > 0,
    label: "Samantha Research",
    limitations: [
      independentCount > 0
        ? "Solo cuenta como soporte independiente cuando trae evidencia externa validada."
        : "Si solo resume mercado y billeteras, sigue siendo una lectura parcial.",
      ...(report?.warnings ?? []).slice(0, 2),
    ].filter(Boolean),
    sourceName: report ? input.agentName || "Samantha" : null,
    sourceUrl: firstExternalEvidenceUrl(report),
    status,
    summary:
      report?.status === "completed" && independentCount > 0
        ? `${input.agentName || "Samantha"} devolvio evidencia externa validada en ${independentCount} categoria(s).`
        : report?.status === "partial"
          ? `${input.agentName || "Samantha"} solo tiene market/wallet data o evidencia externa insuficiente.`
          : report?.status === "failed"
            ? `${input.agentName || "Samantha"} no encontro senales suficientes para una lectura independiente.`
            : input.samanthaStatus === "unavailable"
              ? `${input.agentName || "Samantha"} no esta disponible desde el bridge actual.`
              : `${input.agentName || "Samantha"} no tiene todavia un reporte con soporte independiente suficiente.`,
  };
}

function buildExternalOddsEvidence(input: BuildIndependentEvidenceSummaryInput): IndependentEvidenceItem {
  const comparison = input.samanthaReport?.oddsComparison;
  const available =
    comparison?.found &&
    comparison.direction !== "UNKNOWN" &&
    comparison.reliability !== "unknown";
  return {
    category: "external_odds",
    checkedAt: input.samanthaReport?.completedAt || null,
    confidence: available ? comparison?.reliability || "unknown" : "unknown",
    direction:
      comparison?.direction === "YES" || comparison?.direction === "NO"
        ? comparison.direction
        : "unknown",
    id: "external_odds",
    isIndependent: true,
    label:
      marketVertical(input.item) === "politics"
        ? "Odds/mercados comparables"
        : "Odds externas",
    limitations: [
      available
        ? "Usables solo si el mercado, fecha, lado y linea son comparables."
        : "PolySignal no tiene un proveedor directo de odds externas conectado en esta version.",
    ],
    sourceName: available ? input.agentName || "Samantha" : null,
    sourceUrl: null,
    status: available ? "available" : "not_connected",
    summary: available
      ? comparison?.summary || "Comparacion externa disponible."
      : "Odds externas no conectadas todavia.",
  };
}

function buildContextEvidence(item: MarketOverviewItem): IndependentEvidenceItem {
  const sportsContext = buildSportsContextEvidence(item);
  const vertical = marketVertical(item);
  const title = item.market?.event_title || item.market?.question || null;
  const outcomes = item.market?.outcomes?.filter((outcome) => Boolean(outcome?.label)).length ?? 0;
  const hasDate = Boolean(item.market?.close_time || item.market?.end_date);
  const hasContext = Boolean(title || outcomes > 1 || hasDate);
  const label =
    vertical === "sports"
      ? "Contexto deportivo/evento"
      : vertical === "politics"
        ? "Contexto politico/evento"
        : "Contexto del evento";
  return {
    category: "sports_context",
    checkedAt: sportsContext.checkedAt || latestCheckedAt(item),
    confidence: hasContext ? "low" : "unknown",
    direction: "neutral",
    id: "event_context",
    isIndependent: sportsContext.status === "available",
    label,
    limitations: [
      ...(vertical === "sports"
        ? sportsContext.limitations
        : ["El contexto del evento ayuda a organizar la revision, pero no crea una estimacion por si solo."]),
    ],
    sourceName: vertical === "sports" ? "Polymarket/Gamma" : "Polymarket",
    sourceUrl: null,
    status:
      vertical === "sports"
        ? sportsContext.status === "partial"
          ? "partial"
          : sportsContext.status === "available"
            ? "available"
            : sportsContext.status === "insufficient"
              ? "insufficient"
              : "unavailable"
        : hasContext
          ? "partial"
          : "unavailable",
    summary:
      vertical === "sports"
        ? sportsContext.participants.length >= 2
          ? `Equipos y fecha detectados desde Polymarket: ${sportsContext.participants.join(" vs ")}, ${sportsContext.eventDate ?? "sin fecha"}. ${sportsContext.isHomeAwayReliable ? "Local/visitante confirmado." : "Local/visitante no confirmado por fuente externa."}`
          : "No hay suficiente contexto deportivo estructurado."
        : vertical === "politics"
          ? hasContext
            ? "Titulo y fecha del evento disponibles; faltan encuestas, noticias o comparables externos."
            : "No hay suficiente contexto politico estructurado."
          : hasContext
            ? "Evento identificado, pero faltan fuentes externas especificas para estimar."
            : "No hay suficiente contexto del evento.",
  };
}

function buildNewsEvidence(item: MarketOverviewItem): IndependentEvidenceItem {
  const vertical = marketVertical(item);
  const label =
    vertical === "sports"
      ? "Noticias/lesiones"
      : vertical === "politics"
        ? "Noticias/encuestas"
        : "Noticias/contexto externo";
  return {
    category: vertical === "sports" ? "injuries" : "news",
    checkedAt: null,
    confidence: "unknown",
    direction: "unknown",
    id: "external_news_context",
    isIndependent: true,
    label,
    limitations: ["Pendiente de fuente independiente conectada."],
    sourceName: null,
    sourceUrl: null,
    status: "not_connected",
    summary:
      vertical === "sports"
        ? "No hay proveedor conectado para lesiones, disponibilidad o noticias deportivas verificadas."
        : vertical === "politics"
          ? "No hay proveedor conectado para noticias, encuestas o contexto politico verificable."
          : "No hay proveedor conectado para noticias o contexto externo verificable.",
  };
}

function buildSportsInjuriesEvidence(item: MarketOverviewItem): IndependentEvidenceItem | null {
  if (marketVertical(item) !== "sports") {
    return null;
  }
  const sportsContext = buildSportsContextEvidence(item);
  return {
    category: "injuries",
    checkedAt: sportsContext.checkedAt,
    confidence: "unknown",
    direction: "unknown",
    id: "sports_injuries",
    isIndependent: sportsContext.injuries.available,
    label: "Lesiones/disponibilidad",
    limitations: ["No hay fuente de lesiones conectada todavia."],
    sourceName: sportsContext.injuries.sourceName,
    sourceUrl: null,
    status: sportsContext.injuries.available ? "available" : "not_connected",
    summary:
      sportsContext.injuries.summary ||
      "No hay fuente de lesiones conectada todavia.",
  };
}

function buildSportsRecentFormEvidence(item: MarketOverviewItem): IndependentEvidenceItem | null {
  if (marketVertical(item) !== "sports") {
    return null;
  }
  const sportsContext = buildSportsContextEvidence(item);
  return {
    category: "recent_form",
    checkedAt: sportsContext.checkedAt,
    confidence: "unknown",
    direction: "unknown",
    id: "sports_recent_form",
    isIndependent: sportsContext.recentForm.available,
    label: "Forma reciente",
    limitations: ["No hay forma reciente conectada todavia."],
    sourceName: sportsContext.recentForm.sourceName,
    sourceUrl: null,
    status: sportsContext.recentForm.available ? "available" : "not_connected",
    summary:
      sportsContext.recentForm.summary ||
      "No hay forma reciente conectada todavia.",
  };
}

function buildSportsScheduleEvidence(item: MarketOverviewItem): IndependentEvidenceItem | null {
  if (marketVertical(item) !== "sports") {
    return null;
  }
  const sportsContext = buildSportsContextEvidence(item);
  return {
    category: "schedule_context",
    checkedAt: sportsContext.checkedAt,
    confidence: "unknown",
    direction: "neutral",
    id: "sports_schedule_context",
    isIndependent: sportsContext.scheduleContext.available,
    label: "Calendario/descanso",
    limitations: ["No hay calendario/descanso conectado todavia."],
    sourceName: sportsContext.scheduleContext.sourceName,
    sourceUrl: null,
    status: sportsContext.scheduleContext.available ? "available" : "not_connected",
    summary:
      sportsContext.scheduleContext.available
        ? "Contexto de calendario/descanso disponible."
        : "No hay calendario/descanso conectado todavia.",
  };
}

function buildHistoricalEvidence(item: MarketOverviewItem, walletSummary: WalletIntelligenceSummary): IndependentEvidenceItem {
  const evidenceCount =
    toNumber(item.evidence_summary?.evidence_count) ?? 0 +
    (toNumber(item.evidence_summary?.odds_evidence_count) ?? 0) +
    (toNumber(item.evidence_summary?.news_evidence_count) ?? 0);
  const historyCount = walletSummary.historyAvailableCount ?? 0;
  const highlightedCount = walletSummary.highlightedProfilesCount ?? 0;
  const available = evidenceCount > 0;
  const partial = !available && (historyCount > 0 || highlightedCount > 0);
  return {
    category: "historical_comparable",
    checkedAt: item.evidence_summary?.latest_evidence_at || walletSummary.checkedAt || null,
    confidence: available ? "medium" : partial ? "low" : "unknown",
    direction: "neutral",
    id: "historical_calibration",
    isIndependent: available,
    label: "Historial/calibracion",
    limitations: [
      available
        ? "Solo cuenta si viene de evidencia estructurada real."
        : "Perfiles o wallets ayudan como contexto, pero no reemplazan calibracion externa suficiente.",
    ],
    sourceName: available ? "PolySignal" : partial ? "Wallet Intelligence" : null,
    sourceUrl: null,
    status: available ? "available" : partial ? "partial" : "unavailable",
    summary: available
      ? `${evidenceCount} evidencia(s) estructurada(s) ya disponibles para calibracion.`
      : partial
        ? `${historyCount} wallets con historial publico y ${highlightedCount} perfiles destacados visibles como contexto auxiliar.`
        : "No hay calibracion o historico estructurado suficiente en este analisis.",
  };
}

function requiredLabelsForVertical(vertical: MarketVertical): string[] {
  if (vertical === "sports") {
    return [
      "Samantha Research",
      "Odds externas",
      "Contexto deportivo/evento",
      "Lesiones/disponibilidad",
      "Forma reciente",
      "Calendario/descanso",
    ];
  }
  if (vertical === "politics") {
    return ["Samantha Research", "Odds/mercados comparables", "Noticias/encuestas"];
  }
  return ["Samantha Research", "Odds externas", "Noticias/contexto externo"];
}

export function buildIndependentEvidenceSummary(
  input: BuildIndependentEvidenceSummaryInput,
): IndependentEvidenceSummary {
  const items = [
    buildMarketEvidence(input.item),
    buildWalletEvidence(input.walletSummary),
    buildExternalOddsEvidence(input),
    buildContextEvidence(input.item),
    buildSportsInjuriesEvidence(input.item),
    buildSportsRecentFormEvidence(input.item),
    buildSportsScheduleEvidence(input.item),
    buildNewsEvidence(input.item),
    buildHistoricalEvidence(input.item, input.walletSummary),
    buildSamanthaEvidence(input),
  ].filter((item): item is IndependentEvidenceItem => Boolean(item));
  const availableIndependentCount = items.filter(
    (item) => item.isIndependent && item.status === "available",
  ).length;
  const availableAuxiliaryCount = items.filter(
    (item) => !item.isIndependent && (item.status === "available" || item.status === "partial"),
  ).length;
  const requiredLabels = new Set(requiredLabelsForVertical(marketVertical(input.item)));
  const missingRequiredCategories = items
    .filter((item) => requiredLabels.has(item.label) && item.status !== "available")
    .map((item) => `${item.label}: ${normalizeStatusLabel(item.status)}`);
  const enoughForEstimate = input.suggestedDecisionAvailable === true;
  const reason = enoughForEstimate
    ? "Hay suficiente evidencia validada para separar una estimacion propia del precio del mercado."
    : availableIndependentCount === 0
      ? "Solo hay referencia de mercado y senales auxiliares. Faltan fuentes externas comparables para una estimacion propia."
      : "Hay algo de soporte independiente, pero todavia no alcanza para habilitar una estimacion propia responsable.";

  return {
    availableAuxiliaryCount,
    availableIndependentCount,
    enoughForEstimate,
    items,
    missingRequiredCategories,
    reason,
  };
}
