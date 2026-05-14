"use client";

import type { MarketOverviewItem } from "../lib/marketOverview";
import {
  formatProbability as formatPublicProbability,
  getMarketImpliedProbabilities,
} from "../lib/marketProbabilities";

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

function missingFields(item?: MarketOverviewItem | null): string[] {
  const missing: string[] = [];
  const probabilities = getMarketImpliedProbabilities({
    marketNoPrice: item?.latest_snapshot?.no_price,
    marketYesPrice: item?.latest_snapshot?.yes_price,
  });
  if (!probabilities && !(item?.market?.outcomes ?? []).some((outcome) => toNumber(outcome.price) !== null)) {
    missing.push("precio YES/NO");
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

  const probabilities = getMarketImpliedProbabilities({
    marketNoPrice: item?.latest_snapshot?.no_price,
    marketYesPrice: item?.latest_snapshot?.yes_price,
  });
  const ids = tokenIds(item);
  const missing = missingFields(item);
  const outcomes = item?.market?.outcomes ?? [];

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
          <DetailStat
            label="Precio YES"
            value={probabilities ? formatPublicProbability(probabilities.yes) : formatMetric(item?.latest_snapshot?.yes_price)}
          />
          <DetailStat
            label="Precio NO"
            value={probabilities ? formatPublicProbability(probabilities.no) : formatMetric(item?.latest_snapshot?.no_price)}
          />
          <DetailStat
            label="Probabilidad implicita"
            value={probabilities ? `YES ${formatPublicProbability(probabilities.yes)} / NO ${formatPublicProbability(probabilities.no)}` : "No disponible"}
          />
          <DetailStat label="Volumen" value={formatMetric(item?.latest_snapshot?.volume)} />
          <DetailStat label="Liquidez" value={formatMetric(item?.latest_snapshot?.liquidity)} />
          <DetailStat label="Spread" value={formatMetric(item?.latest_snapshot?.spread)} />
          <DetailStat label="Hora del evento" value={formatDateTime(item?.market?.end_date)} />
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
                <article key={`${outcome.label}-${outcome.token_id ?? index}`} role="listitem">
                  <span>{outcome.label || "Outcome sin nombre"}</span>
                  <strong>{outcome.side || "UNKNOWN"}</strong>
                  <small>Precio: {formatMetric(outcome.price)}</small>
                  <small>TokenId: {outcome.token_id || "No disponible"}</small>
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
            <p>Los campos principales disponibles se muestran arriba. Tendencia historica solo aparece cuando hay historico real cargado.</p>
          )}
          {ids.length > 0 ? <p>Token IDs detectados: {ids.join(", ")}</p> : null}
        </div>
      </section>
    </div>
  );
}
