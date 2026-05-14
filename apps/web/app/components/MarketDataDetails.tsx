"use client";

import type { MarketOverviewItem } from "../lib/marketOverview";
import {
  formatProbability as formatPublicProbability,
  getMarketImpliedProbabilities,
} from "../lib/marketProbabilities";

type MarketOutcomePrice = {
  name: string;
  price: number | null;
  probability: number | null;
  side: "NO" | "YES" | "outcome" | "unknown";
  tokenId: string | null;
};

type MarketDataDetailsProps = {
  item?: MarketOverviewItem | null;
  onClose: () => void;
  open: boolean;
};

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

function formatMetric(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: parsed >= 100 ? 0 : 2,
    notation: parsed >= 100000 ? "compact" : "standard",
  }).format(parsed);
}

function formatPrice(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 4,
  }).format(parsed);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "No disponible";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function marketTitle(item?: MarketOverviewItem | null): string {
  return item?.market?.question || item?.market?.event_title || item?.market?.market_slug || "Mercado Polymarket";
}

function marketStatus(item?: MarketOverviewItem | null): string {
  if (item?.market?.closed === true) {
    return "Cerrado";
  }
  if (item?.market?.active === true) {
    return "Activo";
  }
  if (item?.market?.active === false) {
    return "Inactivo";
  }
  return "Estado no disponible";
}

function tokenIds(item?: MarketOverviewItem | null): string[] {
  return (item?.market?.outcomes ?? [])
    .map((outcome) => outcome.token_id)
    .filter((value): value is string => Boolean(value));
}

function normalizeOutcomeSide(label: unknown, side: unknown): MarketOutcomePrice["side"] {
  const sideValue = typeof side === "string" ? side.trim().toUpperCase() : "";
  if (sideValue === "YES" || sideValue === "NO") {
    return sideValue;
  }
  const labelValue = typeof label === "string" ? label.trim().toLowerCase() : "";
  if (labelValue === "yes" || labelValue === "si" || labelValue === "sí") {
    return "YES";
  }
  if (labelValue === "no") {
    return "NO";
  }
  if (labelValue) {
    return "outcome";
  }
  return "unknown";
}

function outcomePrices(item?: MarketOverviewItem | null): MarketOutcomePrice[] {
  return (item?.market?.outcomes ?? [])
    .filter((outcome) => outcome.label || (outcome.price !== null && outcome.price !== undefined) || outcome.token_id)
    .map((outcome, index) => {
      const price = toNumber(outcome.price);
      return {
        name: outcome.label || `Outcome ${index + 1}`,
        price,
        probability: price !== null && price >= 0 && price <= 1 ? price : null,
        side: normalizeOutcomeSide(outcome.label, outcome.side),
        tokenId: outcome.token_id ?? null,
      };
    });
}

function binaryOutcomePrice(prices: MarketOutcomePrice[], side: "NO" | "YES"): number | null {
  return prices.find((outcome) => outcome.side === side)?.price ?? null;
}

function binaryProbabilities(item: MarketOverviewItem | null | undefined, prices: MarketOutcomePrice[]) {
  const snapshotProbabilities = getMarketImpliedProbabilities({
    marketNoPrice: item?.latest_snapshot?.no_price,
    marketYesPrice: item?.latest_snapshot?.yes_price,
  });
  if (snapshotProbabilities) {
    return snapshotProbabilities;
  }
  return getMarketImpliedProbabilities({
    marketNoPrice: binaryOutcomePrice(prices, "NO"),
    marketYesPrice: binaryOutcomePrice(prices, "YES"),
  });
}

function outcomeSideLabel(outcome: MarketOutcomePrice): string {
  if (outcome.side === "YES" || outcome.side === "NO") {
    return outcome.side;
  }
  if (outcome.side === "outcome") {
    return "Outcome";
  }
  return "No disponible";
}

function missingFields(item?: MarketOverviewItem | null): string[] {
  const missing: string[] = [];
  const probabilities = getMarketImpliedProbabilities({
    marketNoPrice: item?.latest_snapshot?.no_price,
    marketYesPrice: item?.latest_snapshot?.yes_price,
  });
  if (!probabilities && !(item?.market?.outcomes ?? []).some((outcome) => toNumber(outcome.price) !== null)) {
    missing.push("precios de outcomes");
  }
  if (toNumber(item?.latest_snapshot?.volume) === null) {
    missing.push("volumen");
  }
  if (toNumber(item?.latest_snapshot?.liquidity) === null) {
    missing.push("liquidez");
  }
  if (!item?.market?.condition_id) {
    missing.push("conditionId");
  }
  if (tokenIds(item).length === 0) {
    missing.push("token IDs");
  }
  return missing;
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MarketDataDetails({ item, onClose, open }: MarketDataDetailsProps) {
  if (!open) {
    return null;
  }

  const ids = tokenIds(item);
  const missing = missingFields(item);
  const outcomes = outcomePrices(item);
  const impliedProbabilities = binaryProbabilities(item, outcomes);
  const pricedOutcomes = outcomes.filter((outcome) => outcome.price !== null);
  const snapshotHasBinaryPrice =
    toNumber(item?.latest_snapshot?.yes_price) !== null || toNumber(item?.latest_snapshot?.no_price) !== null;
  const showBinarySummary =
    Boolean(impliedProbabilities) &&
    (snapshotHasBinaryPrice ||
      outcomes.some((outcome) => outcome.side === "YES") ||
      outcomes.some((outcome) => outcome.side === "NO"));
  const summaryOutcomes = pricedOutcomes.slice(0, 6);

  return (
    <div className="market-details-backdrop" role="presentation">
      <section aria-modal="true" className="market-details-drawer" role="dialog">
        <div className="market-details-header">
          <div>
            <p className="eyebrow">Datos de Polymarket</p>
            <h2>{marketTitle(item)}</h2>
            <p>Informacion estructurada real recibida para el mercado seleccionado.</p>
          </div>
          <button aria-label="Cerrar datos de mercado" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <div className="market-details-badges">
          <span className="badge external-hint">{marketStatus(item)}</span>
          <span className={missing.length > 0 ? "badge muted" : "badge external-hint"}>
            {missing.length > 0 ? "Datos limitados" : "Datos cargados"}
          </span>
        </div>

        <div className="market-details-summary">
          {showBinarySummary && impliedProbabilities ? (
            <>
              <DetailStat label="Precio YES" value={formatPrice(binaryOutcomePrice(outcomes, "YES") ?? item?.latest_snapshot?.yes_price)} />
              <DetailStat label="Precio NO" value={formatPrice(binaryOutcomePrice(outcomes, "NO") ?? item?.latest_snapshot?.no_price)} />
              <DetailStat
                label="Probabilidad implicita"
                value={`YES ${formatPublicProbability(impliedProbabilities.yes)} / NO ${formatPublicProbability(impliedProbabilities.no)}`}
              />
            </>
          ) : summaryOutcomes.length > 0 ? (
            summaryOutcomes.map((outcome) => (
              <DetailStat
                key={`${outcome.name}-${outcome.tokenId ?? outcome.side}`}
                label={outcome.name}
                value={`Precio ${formatPrice(outcome.price)} · Prob. ${formatPublicProbability(outcome.probability)}`}
              />
            ))
          ) : (
            <>
              <DetailStat label="Precio principal" value="No disponible" />
              <DetailStat label="Probabilidad implicita" value="No disponible" />
            </>
          )}
          <DetailStat label="Volumen" value={formatMetric(item?.latest_snapshot?.volume)} />
          <DetailStat label="Liquidez" value={formatMetric(item?.latest_snapshot?.liquidity)} />
          <DetailStat label="Spread" value={formatMetric(item?.latest_snapshot?.spread)} />
          <DetailStat label="Fecha disponible" value={formatDateTime(item?.market?.end_date)} />
          <DetailStat label="Cierre del mercado" value={formatDateTime(item?.market?.close_time ?? item?.market?.end_date)} />
          <DetailStat label="Deporte/categoria" value={item?.market?.sport_type || item?.market?.market_type || "No disponible"} />
          <DetailStat label="ConditionId" value={item?.market?.condition_id || "No disponible"} />
          <DetailStat label="Event slug" value={item?.market?.event_slug || "No disponible"} />
          <DetailStat label="Market slug" value={item?.market?.market_slug || "No disponible"} />
        </div>

        <div className="market-details-section">
          <strong>Outcomes y token IDs</strong>
          {outcomes.length > 0 ? (
            <div className="market-details-table" role="list">
              {outcomes.map((outcome, index) => (
                <article key={`${outcome.name}-${outcome.tokenId ?? index}`} role="listitem">
                  <span>{outcome.name || "Outcome sin nombre"}</span>
                  <strong>{outcomeSideLabel(outcome)}</strong>
                  <small>Precio: {formatPrice(outcome.price)}</small>
                  <small>Probabilidad: {formatPublicProbability(outcome.probability)}</small>
                  <small>TokenId: {outcome.tokenId || "No disponible"}</small>
                </article>
              ))}
            </div>
          ) : (
            <p>No hay outcomes estructurados disponibles para este mercado.</p>
          )}
        </div>

        <div className="market-details-section">
          <strong>Warnings y limitaciones</strong>
          {missing.length > 0 ? (
            <ul>
              <li>Datos faltantes: {missing.join(", ")}.</li>
              <li>No se inventan precios, volumen, liquidez, tendencia ni resolucion.</li>
            </ul>
          ) : (
            <p>Los campos principales disponibles se muestran arriba. Los precios pueden venir como YES/NO o como outcomes por equipo/opcion. Tendencia historica solo aparece cuando hay historico real cargado.</p>
          )}
          {ids.length > 0 ? <p>Token IDs detectados: {ids.join(", ")}</p> : null}
        </div>
      </section>
    </div>
  );
}
