"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../../components/MainNavigation";
import {
  SportsSelectorBar,
  getSportSelectorOption,
  isSportBackendEnabled,
  sportsSelectorOptions,
  type SportSelectorOption,
} from "../../components/SportsSelectorBar";

type PolySignalScore = {
  score_probability?: string | number | null;
  market_yes_price?: string | number | null;
  edge_percent_points?: string | number | null;
  confidence_label?: string | null;
  color_hint?: string | null;
  label?: string | null;
};

type UpcomingSportsMarket = {
  market_id: number;
  question: string;
  event_title?: string | null;
  sport: string;
  market_shape: string;
  close_time?: string | null;
  event_time?: string | null;
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  urgency_score?: string | number | null;
  reasons?: string[];
  warnings?: string[];
  polysignal_score?: PolySignalScore | null;
};

type UpcomingSportsResponse = {
  count: number;
  limit: number;
  items: UpcomingSportsMarket[];
  counts?: Record<string, number>;
};

type UpcomingDataQualityItem = {
  market_id: number;
  quality_label: string;
  has_snapshot: boolean;
  has_yes_price: boolean;
  has_no_price: boolean;
  has_polysignal_score: boolean;
  missing_fields: string[];
  warnings: string[];
};

type UpcomingDataQualityResponse = {
  summary: Record<string, number>;
  items: UpcomingDataQualityItem[];
};

type PageState = {
  items: UpcomingSportsMarket[];
  counts: Record<string, number> | null;
  qualitySummary: Record<string, number> | null;
  qualityItems: UpcomingDataQualityItem[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const supportedSportIds = new Set<string>(
  sportsSelectorOptions
    .filter((option) => option.id !== "all" && option.backendSupported)
    .map((option) => option.id),
);
const knownSportIds = new Set<string>(
  sportsSelectorOptions
    .filter((option) => option.id !== "all")
    .map((option) => option.id),
);

function resolveSportOption(value: string): SportSelectorOption {
  const option = getSportSelectorOption(value);
  if (
    option.id !== "all" &&
    (supportedSportIds.has(option.id) || knownSportIds.has(option.id))
  ) {
    return option;
  }
  return getSportSelectorOption("all");
}

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

function normalizeProbability(value: unknown): number | null {
  const number = toNumber(value);
  if (number === null || number < 0) {
    return null;
  }
  if (number <= 1) {
    return number;
  }
  if (number <= 100) {
    return number / 100;
  }
  return null;
}

function formatPercent(value: unknown): string {
  const number = normalizeProbability(value);
  if (number === null) {
    return "--";
  }
  return `${(number * 100).toFixed(1)}%`;
}

function formatMetric(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }
  return new Intl.NumberFormat("es", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatScore(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  return number.toFixed(1);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPercentPoints(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }
  return `${number > 0 ? "+" : ""}${number.toFixed(1)} pts`;
}

function formatMarketShape(value: string): string {
  const labels: Record<string, string> = {
    match_winner: "Ganador del partido",
    championship: "Campeonato",
    futures: "Futuro",
    player_prop: "Jugador",
    team_prop: "Equipo",
    yes_no_generic: "SI/NO",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function buildUpcomingPath(option: SportSelectorOption): string {
  const params = new URLSearchParams({
    limit: "20",
    days: "7",
    include_futures: "false",
    focus: "match_winner",
  });
  if (option.apiValue) {
    params.set("sport", option.apiValue);
  }
  return `/research/upcoming-sports?${params.toString()}`;
}

function buildDataQualityPath(option: SportSelectorOption): string {
  const params = new URLSearchParams({
    limit: "50",
    days: "7",
  });
  if (option.apiValue) {
    params.set("sport", option.apiValue);
  }
  return `/research/upcoming-sports/data-quality?${params.toString()}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function PolySignalMiniScore({
  dataQuality,
  score,
}: {
  dataQuality?: UpcomingDataQualityItem;
  score?: PolySignalScore | null;
}) {
  if (!score?.score_probability) {
    return (
      <div className="sports-market-score warning">
        <span>PolySignal SI</span>
        <strong>pendiente</strong>
        <p>
          {dataQuality?.has_snapshot === false || dataQuality?.has_yes_price === false
            ? "Faltan precios o snapshots para estimar."
            : "Faltan datos suficientes para estimar."}
        </p>
      </div>
    );
  }

  return (
    <div className={`sports-market-score ${score.color_hint ?? "neutral"}`}>
      <span>PolySignal SI</span>
      <strong>{formatPercent(score.score_probability)}</strong>
      <p>
        Mercado SI {formatPercent(score.market_yes_price)} · Diferencia{" "}
        {formatPercentPoints(score.edge_percent_points)} · Confianza{" "}
        {score.confidence_label ?? "N/D"}
      </p>
    </div>
  );
}

function DataQualityMiniBadges({ item }: { item?: UpcomingDataQualityItem }) {
  if (!item) {
    return null;
  }
  const badges: string[] = [];
  if (!item.has_snapshot) {
    badges.push("Sin snapshot");
  }
  if (!item.has_yes_price || !item.has_no_price) {
    badges.push("Faltan precios");
  }
  if (!item.has_polysignal_score) {
    badges.push("Score pendiente");
  }
  if (badges.length === 0) {
    badges.push(item.quality_label);
  }
  return (
    <div className="data-quality-badges">
      {badges.slice(0, 4).map((badge) => (
        <span className="warning-chip" key={badge}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function SportMarketCard({
  dataQuality,
  market,
}: {
  dataQuality?: UpcomingDataQualityItem;
  market: UpcomingSportsMarket;
}) {
  return (
    <article className="sports-market-card">
      <div className="sports-market-card-header">
        <div className="badge-row">
          <span className="candidate-id">#{market.market_id}</span>
          <span className="badge">{formatMarketShape(market.market_shape)}</span>
          <span className="badge muted">Cierra {formatDateTime(market.close_time)}</span>
        </div>
        <span className="urgency-pill medium">{formatScore(market.urgency_score)}</span>
      </div>
      <h2>{market.question || "Mercado sin titulo"}</h2>
      {market.event_title ? <p>{market.event_title}</p> : null}
      <DataQualityMiniBadges item={dataQuality} />

      <div className="sports-market-metrics">
        <div>
          <span>Precio SI</span>
          <strong>{formatPercent(market.market_yes_price)}</strong>
        </div>
        <div>
          <span>Precio NO</span>
          <strong>{formatPercent(market.market_no_price)}</strong>
        </div>
        <div>
          <span>Liquidez</span>
          <strong>{formatMetric(market.liquidity)}</strong>
        </div>
        <div>
          <span>Volumen</span>
          <strong>{formatMetric(market.volume)}</strong>
        </div>
      </div>

      <PolySignalMiniScore dataQuality={dataQuality} score={market.polysignal_score} />

      <div className="sports-market-actions">
        <Link className="analysis-link" href={`/markets/${market.market_id}`}>
          Ver analisis
        </Link>
      </div>
    </article>
  );
}

export default function SportDetailPage() {
  const params = useParams<{ sport: string }>();
  const router = useRouter();
  const sportId = String(params.sport ?? "all");
  const sportOption = useMemo(() => resolveSportOption(sportId), [sportId]);
  const selectedSport = sportOption.id === "all" ? "all" : sportOption.id;
  const sportIsEnabled = isSportBackendEnabled(selectedSport);
  const [state, setState] = useState<PageState>({
    items: [],
    counts: null,
    qualitySummary: null,
    qualityItems: [],
    loading: true,
    error: null,
    updatedAt: null,
  });

  const loadSport = useCallback(async () => {
    if (!sportIsEnabled) {
      setState((current) => ({
        ...current,
        items: [],
        counts: null,
        qualitySummary: null,
        qualityItems: [],
        loading: false,
        error: null,
        updatedAt: null,
      }));
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [upcoming, quality] = await Promise.all([
        fetchJson<UpcomingSportsResponse>(buildUpcomingPath(sportOption)),
        fetchJson<UpcomingDataQualityResponse>(buildDataQualityPath(sportOption)),
      ]);
      setState({
        items: upcoming.items ?? [],
        counts: upcoming.counts ?? null,
        qualitySummary: quality.summary ?? null,
        qualityItems: quality.items ?? [],
        loading: false,
        error: null,
        updatedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo cargar el deporte.",
      }));
    }
  }, [sportIsEnabled, sportOption]);

  useEffect(() => {
    void loadSport();
  }, [loadSport]);

  const qualityByMarketId = useMemo(() => {
    return new Map(state.qualityItems.map((item) => [item.market_id, item]));
  }, [state.qualityItems]);

  const handleSelectSport = (nextSport: string) => {
    if (nextSport === "all") {
      router.push("/sports");
      return;
    }
    router.push(`/sports/${nextSport}`);
  };

  return (
    <main className="dashboard-shell sports-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Deportes</p>
          <h1>Proximos partidos de {sportOption.label}</h1>
          <p className="subtitle">
            Solo proximos 7 dias, ganador/perdedor del partido. Los mercados se
            muestran desde datos reales ya sincronizados en PolySignal.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="refresh-button"
            disabled={state.loading || !sportIsEnabled}
            onClick={() => void loadSport()}
            type="button"
          >
            {state.loading ? "Cargando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>No es recomendacion de apuesta:</strong>
        <span>
          Esta vista organiza mercados deportivos para revision manual. No
          ejecuta research, predicciones, ordenes ni trading.
        </span>
      </section>

      <SportsSelectorBar
        activeLabel="Deporte"
        description="Cambia de deporte sin salir de la vista de proximos partidos."
        kicker="Vista por deporte"
        onSelect={handleSelectSport}
        selectedSport={selectedSport}
        title="Cambiar deporte"
      />

      {sportOption.id === "all" ? (
        <section className="alert-panel" role="status">
          <strong>Deporte no reconocido</strong>
          <span>
            Vuelve al indice de deportes o selecciona un chip soportado.
          </span>
        </section>
      ) : null}

      {!sportIsEnabled && sportOption.id !== "all" ? (
        <section className="alert-panel" role="status">
          <strong>{sportOption.statusLabel ?? "No disponible todavia"}</strong>
          <span>
            {sportOption.disabledMessage ??
              "Este deporte estara disponible mas adelante."}
          </span>
        </section>
      ) : null}

      {state.error ? (
        <section className="alert-panel" role="status">
          <strong>Datos no disponibles</strong>
          <span>{state.error}</span>
        </section>
      ) : null}

      <section className="data-quality-summary" aria-label="Calidad de datos">
        <div>
          <span>Mercados</span>
          <strong>{state.loading ? "..." : state.items.length}</strong>
        </div>
        <div>
          <span>Completos</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.complete_count ?? 0}</strong>
        </div>
        <div>
          <span>Parciales</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.partial_count ?? 0}</strong>
        </div>
        <div>
          <span>Faltan precios</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.missing_price_count ?? 0}</strong>
        </div>
        <p>
          Actualizado {state.updatedAt ? formatDateTime(state.updatedAt.toISOString()) : "al cargar"}.
          La calidad de datos explica por que un score puede quedar pendiente.
        </p>
      </section>

      <section className="panel sports-market-section">
        <div className="panel-heading">
          <div>
            <h2>Mercados proximos</h2>
            <p>
              Filtro activo: {sportOption.label} · ventana 7 dias · futuros
              pausados.
            </p>
          </div>
          {sportIsEnabled ? (
            <a
              className="text-link"
              href={`${API_BASE_URL}${buildUpcomingPath(sportOption)}`}
              rel="noreferrer"
              target="_blank"
            >
              Ver JSON
            </a>
          ) : (
            <span className="badge muted">Sin consulta al backend</span>
          )}
        </div>

        {!sportIsEnabled ? (
          <div className="empty-state">
            <strong>{sportOption.label} esta en preparacion.</strong>
            <p>
              La categoria se muestra como roadmap, pero no carga mercados,
              discovery, scoring ni datos remotos todavia.
            </p>
          </div>
        ) : state.loading ? (
          <div className="empty-state">Cargando mercados de {sportOption.label}...</div>
        ) : state.items.length === 0 ? (
          <div className="empty-state">
            <strong>No hay mercados proximos para {sportOption.label}.</strong>
            <p>
              Puede que falten datos sincronizados recientes o que Polymarket no
              tenga partidos disponibles para este deporte dentro de 7 dias. No
              se muestran datos inventados.
            </p>
          </div>
        ) : (
          <div className="sports-market-grid">
            {state.items.map((market) => (
              <SportMarketCard
                dataQuality={qualityByMarketId.get(market.market_id)}
                key={market.market_id}
                market={market}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
