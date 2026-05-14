"use client";

import {
  getDisplayMarketPrices,
  getMarketOutcomePrices,
  type MarketOutcomePrice,
} from "../lib/marketDataDisplay";
import type { MarketOverviewItem } from "../lib/marketOverview";
import { formatProbability as formatPublicProbability } from "../lib/marketProbabilities";

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
  return new Intl.NumberFormat("en-US", {
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
  if (getDisplayMarketPrices(item).mode === "unavailable") {
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

function renderBinaryProbability(yes: MarketOutcomePrice | undefined, no: MarketOutcomePrice | undefined): string {
  return `YES ${formatPublicProbability(yes?.probability)} / NO ${formatPublicProbability(no?.probability)}`;
}

export function MarketDataDetails({ item, onClose, open }: MarketDataDetailsProps) {
  if (!open) {
    return null;
  }

  const ids = tokenIds(item);
  const missing = missingFields(item);
  const outcomes = getMarketOutcomePrices(item);
  const displayPrices = getDisplayMarketPrices(item);
  const yesSummary = displayPrices.cards.find((card) => card.side === "YES");
  const noSummary = displayPrices.cards.find((card) => card.side === "NO");

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
          {displayPrices.mode === "binary" ? (
            <>
              <DetailStat label="Precio YES" value={formatPrice(yesSummary?.price)} />
              <DetailStat label="Precio NO" value={formatPrice(noSummary?.price)} />
              <DetailStat label="Probabilidad implicita" value={renderBinaryProbability(yesSummary, noSummary)} />
            </>
          ) : displayPrices.mode === "outcome" ? (
            <>
              {displayPrices.cards.map((outcome) => (
                <DetailStat
                  key={`${outcome.name}-${outcome.tokenId ?? outcome.side}`}
                  label={outcome.name}
                  value={`Precio ${formatPrice(outcome.price)} - Prob. ${formatPublicProbability(outcome.probability)}`}
                />
              ))}
              {displayPrices.hiddenOutcomeCount > 0 ? (
                <DetailStat label="Outcomes adicionales" value={`+${displayPrices.hiddenOutcomeCount} outcomes mas`} />
              ) : null}
              {displayPrices.leader ? (
                <DetailStat
                  label="Lider por precio de mercado"
                  value={`${displayPrices.leader.label} - ${formatPrice(displayPrices.leader.price)} (${formatPublicProbability(displayPrices.leader.price)})`}
                />
              ) : null}
            </>
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
                  <span>Outcome</span>
                  <strong>{outcome.name || "Outcome sin nombre"}</strong>
                  <small>Precio: {formatPrice(outcome.price)}</small>
                  <small>Probabilidad implicita: {formatPublicProbability(outcome.probability)}</small>
                  {outcome.side === "YES" || outcome.side === "NO" ? <small>Side: {outcomeSideLabel(outcome)}</small> : null}
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
