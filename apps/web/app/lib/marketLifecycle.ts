export type MarketLifecycleStatus =
  | "live"
  | "closed"
  | "expired"
  | "missed_live_snapshot"
  | "unknown";

export type MarketLifecycleInput = {
  active?: boolean | null;
  closed?: boolean | null;
  close_time?: string | null;
  end_date?: string | null;
  question?: string | null;
  event_slug?: string | null;
  market_slug?: string | null;
  latest_snapshot?: unknown | null;
  latest_prediction?: unknown | null;
};

export type MarketLifecycle = {
  status: MarketLifecycleStatus;
  isExpired: boolean;
  isReviewableLive: boolean;
  label: string;
  detail: string;
  closeTime?: string | null;
};

export function deriveMarketLifecycle(
  input: MarketLifecycleInput,
  nowMs = Date.now(),
): MarketLifecycle {
  const closeTime = input.close_time ?? input.end_date ?? null;
  const closeTimestamp = parseTimestamp(closeTime);
  const hasSnapshot = Boolean(input.latest_snapshot);
  const isClosed = input.closed === true || input.active === false;
  const isPastByDateHint =
    closeTimestamp === null && isPastDateOnly(extractMarketDateHint(input), nowMs);

  if ((closeTimestamp !== null && closeTimestamp < nowMs) || isPastByDateHint) {
    if (!hasSnapshot) {
      return buildLifecycle(
        "missed_live_snapshot",
        "Sin snapshot en vivo",
        "Mercado vencido; no se scorea retroactivamente.",
        closeTime,
      );
    }
    return buildLifecycle(
      "expired",
      "Cerrado",
      "Mercado vencido; se conserva como dato historico.",
      closeTime,
    );
  }

  if (isClosed) {
    if (!hasSnapshot) {
      return buildLifecycle(
        "missed_live_snapshot",
        "Sin snapshot en vivo",
        "Mercado cerrado sin snapshot util para scoring.",
        closeTime,
      );
    }
    return buildLifecycle("closed", "Cerrado", "Mercado cerrado.", closeTime);
  }

  if (closeTimestamp === null && !closeTime) {
    return buildLifecycle(
      "unknown",
      "Fecha no confirmada",
      "No hay close_time estructurado para decidir vencimiento.",
      closeTime,
    );
  }

  return buildLifecycle("live", "Activo", "Mercado vivo o futuro.", closeTime);
}

export function isMissedLiveSnapshot(input: MarketLifecycleInput, nowMs = Date.now()): boolean {
  return deriveMarketLifecycle(input, nowMs).status === "missed_live_snapshot";
}

export function isClosedOrExpiredMarket(
  input: MarketLifecycleInput,
  nowMs = Date.now(),
): boolean {
  const lifecycle = deriveMarketLifecycle(input, nowMs);
  return lifecycle.status === "closed" || lifecycle.status === "expired";
}

export function isReviewableLiveMarket(input: MarketLifecycleInput, nowMs = Date.now()): boolean {
  return deriveMarketLifecycle(input, nowMs).isReviewableLive;
}

function buildLifecycle(
  status: MarketLifecycleStatus,
  label: string,
  detail: string,
  closeTime?: string | null,
): MarketLifecycle {
  return {
    status,
    label,
    detail,
    closeTime,
    isExpired:
      status === "closed" || status === "expired" || status === "missed_live_snapshot",
    isReviewableLive: status === "live" || status === "unknown",
  };
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function extractMarketDateHint(input: MarketLifecycleInput): string | null {
  return (
    extractDateOnly(input.event_slug) ??
    extractDateOnly(input.market_slug) ??
    extractDateOnly(input.question)
  );
}

function extractDateOnly(value?: string | null): string | null {
  return value?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function isPastDateOnly(value: string | null, nowMs: number): boolean {
  if (!value) {
    return false;
  }
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getTime() < today.getTime();
}
