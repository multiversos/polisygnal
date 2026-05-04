"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { primarySportOptions } from "../components/SportsSelectorBar";
import { fetchApiJson, friendlyApiError } from "../lib/api";
import {
  fetchAnalysisReadiness,
  fetchDataHealthOverview,
  fetchLiveUpcomingDiscovery,
  fetchRefreshPriorities,
  fetchRefreshRuns,
  fetchSnapshotGaps,
  type AnalysisReadiness,
  type DataHealthOverview,
  type LiveUpcomingDiscovery,
  type RefreshPriorities,
  type RefreshRuns,
  type SnapshotGaps,
} from "../lib/dataHealth";

type MarketOverviewHealthItem = {
  scoring_mode?: string | null;
  market?: {
    sport_type?: string | null;
  } | null;
  latest_snapshot?: {
    captured_at?: string | null;
  } | null;
  latest_prediction?: unknown | null;
};

type MarketOverviewHealthResponse = {
  total_count?: number;
  items?: MarketOverviewHealthItem[];
};

const sportLabels: Record<string, string> = {
  nba: "Baloncesto",
  basketball: "Baloncesto",
  nfl: "NFL",
  soccer: "Fútbol",
  mma: "UFC",
  nhl: "NHL",
  tennis: "Tenis",
  cricket: "Cricket",
  mlb: "Béisbol",
  baseball: "Béisbol",
  ufc: "UFC",
  horse_racing: "Carreras de caballos",
  other: "Otro",
};

const freshnessStatusLabels: Record<string, string> = {
  fresh: "Fresco",
  stale: "Stale",
  incomplete: "Incompleto",
  unknown: "Desconocido",
};

const recommendedActionLabels: Record<string, string> = {
  ok: "OK",
  needs_snapshot: "Necesita snapshot",
  review_market: "Revisar mercado",
  exclude_from_scoring: "Excluir del score",
};

const readinessStatusLabels: Record<string, string> = {
  ready: "Listo",
  needs_refresh: "Necesita refresh",
  blocked: "Bloqueado",
};

const readinessActionLabels: Record<string, string> = {
  listo_para_research_packet: "Listo para Research Packet",
  ejecutar_refresh_snapshot_dry_run: "Probar snapshot dry-run",
  revisar_o_descartar_por_ahora: "Revisar o descartar por ahora",
  demasiado_cerca_del_cierre_revisar_solo_si_ya_tiene_datos:
    "Demasiado cerca del cierre",
  refresh_posible_pero_ventana_corta: "Refresh posible, ventana corta",
  buen_candidato_para_refresh_controlado: "Buen candidato para refresh",
};

const discoveryStatusLabels: Record<string, string> = {
  already_local_ready: "Local listo",
  already_local_missing_snapshot: "Local sin datos",
  missing_local_market: "Falta en local",
  remote_missing_price: "Remoto sin precio",
  unsupported: "No soportado",
};

const readinessSourceLabels: Record<string, string> = {
  local_existing: "Local",
  imported_from_discovery: "Discovery",
  snapshot_from_discovery: "Snapshot reciente",
};

function formatDate(value?: string | null): string {
  if (!value) {
    return "N/D";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSport(value: string): string {
  return sportLabels[value] ?? value.replaceAll("_", " ");
}

function formatFreshnessStatus(value: string): string {
  return freshnessStatusLabels[value] ?? value.replaceAll("_", " ");
}

function formatRecommendedAction(value: string): string {
  return recommendedActionLabels[value] ?? value.replaceAll("_", " ");
}

function formatReadinessStatus(value: string): string {
  return readinessStatusLabels[value] ?? value.replaceAll("_", " ");
}

function formatReadinessAction(value: string): string {
  return readinessActionLabels[value] ?? value.replaceAll("_", " ");
}

function formatDiscoveryStatus(value: string): string {
  return discoveryStatusLabels[value] ?? value.replaceAll("_", " ");
}

function formatReadinessSource(value?: string | null): string {
  return value ? readinessSourceLabels[value] ?? value.replaceAll("_", " ") : "Local";
}

function buildSnapshotCommand(marketId: number): string {
  return `python -m app.commands.refresh_market_snapshots --market-id ${marketId} --dry-run --json`;
}

function buildMetadataCommand(marketId: number): string {
  return `python -m app.commands.refresh_market_metadata --market-id ${marketId} --dry-run --json`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function fetchMarketOverviewHealth(): Promise<MarketOverviewHealthResponse> {
  return fetchApiJson<MarketOverviewHealthResponse>("/markets/overview?limit=100");
}

function isClosingTooSoon(label?: string | null): boolean {
  return label === "Menos de 1h" || label === "1-6h";
}

export default function DataHealthPage() {
  const [marketOverview, setMarketOverview] = useState<MarketOverviewHealthResponse | null>(null);
  const [overview, setOverview] = useState<DataHealthOverview | null>(null);
  const [analysisReadiness, setAnalysisReadiness] = useState<AnalysisReadiness | null>(null);
  const [snapshotGaps, setSnapshotGaps] = useState<SnapshotGaps | null>(null);
  const [refreshPriorities, setRefreshPriorities] = useState<RefreshPriorities | null>(null);
  const [refreshRuns, setRefreshRuns] = useState<RefreshRuns | null>(null);
  const [liveDiscovery, setLiveDiscovery] = useState<LiveUpcomingDiscovery | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDataHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        withTimeout(fetchMarketOverviewHealth(), 10000, "market-overview"),
        withTimeout(fetchDataHealthOverview(), 10000, "overview"),
          withTimeout(
            fetchAnalysisReadiness({ days: 7, limit: 12, min_hours_to_close: 24 }),
            70000,
            "readiness",
          ),
        withTimeout(fetchSnapshotGaps({ days: 7, limit: 50 }), 30000, "snapshot-gaps"),
        withTimeout(fetchRefreshPriorities({ days: 7, limit: 12 }), 30000, "refresh-priorities"),
        withTimeout(fetchRefreshRuns({ limit: 10 }), 10000, "refresh-runs"),
          withTimeout(
            fetchLiveUpcomingDiscovery({ days: 7, limit: 25, min_hours_to_close: 24 }),
            70000,
            "live-discovery",
          ),
      ]);
      const [
        marketOverviewResult,
        overviewResult,
        analysisReadinessResult,
        snapshotGapsResult,
        refreshPrioritiesResult,
        refreshRunsResult,
        liveDiscoveryResult,
      ] = results;

      if (marketOverviewResult.status === "fulfilled") {
        setMarketOverview(marketOverviewResult.value);
      }
      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      }
      if (analysisReadinessResult.status === "fulfilled") {
        setAnalysisReadiness(analysisReadinessResult.value);
      }
      if (snapshotGapsResult.status === "fulfilled") {
        setSnapshotGaps(snapshotGapsResult.value);
      }
      if (refreshPrioritiesResult.status === "fulfilled") {
        setRefreshPriorities(refreshPrioritiesResult.value);
      }
      if (refreshRunsResult.status === "fulfilled") {
        setRefreshRuns(refreshRunsResult.value);
      }
      if (liveDiscoveryResult.status === "fulfilled") {
        setLiveDiscovery(liveDiscoveryResult.value);
      }
      const successfulResults = results.filter((result) => result.status === "fulfilled").length;
      if (results.some((result) => result.status === "rejected")) {
        setError(
          successfulResults > 0
            ? "Algunos diagnósticos avanzados todavía no están conectados. Los datos principales disponibles siguen visibles."
            : "No se pudo cargar la salud de datos. Reintenta cuando la API esté disponible.",
        );
      }
    } catch (error) {
      setError(friendlyApiError(error, "salud de datos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDataHealth();
  }, [loadDataHealth]);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      window.setTimeout(() => setCopiedCommand(null), 1600);
    } catch {
      setCopiedCommand(null);
    }
  };
  const readyAnalysisItems =
    analysisReadiness?.items.filter((item) => item.readiness_status === "ready").slice(0, 6) ?? [];
  const marketOverviewItems = marketOverview?.items ?? [];
  const overviewTotalMarkets = marketOverview?.total_count ?? marketOverviewItems.length;
  const overviewWithPredictions = marketOverviewItems.filter((item) =>
    Boolean(item.latest_prediction),
  ).length;
  const overviewWithSnapshots = marketOverviewItems.filter((item) =>
    Boolean(item.latest_snapshot),
  ).length;
  const overviewFallbackOnly = marketOverviewItems.filter(
    (item) => item.scoring_mode === "fallback_only",
  ).length;
  const sportsWithData = new Set(
    marketOverviewItems
      .map((item) => item.market?.sport_type)
      .filter((sport): sport is string => Boolean(sport)),
  );
  const primarySportsWithData = primarySportOptions.filter((sport) =>
    sportsWithData.has(sport.apiValue),
  );
  const primarySportsWithoutData = primarySportOptions.filter(
    (sport) => !sportsWithData.has(sport.apiValue),
  );
  const latestOverviewSnapshot = marketOverviewItems
    .map((item) => item.latest_snapshot?.captured_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const hasAnyDataHealthPanel =
    Boolean(marketOverview) ||
    Boolean(overview) ||
    Boolean(analysisReadiness) ||
    Boolean(snapshotGaps) ||
    Boolean(refreshPriorities) ||
    Boolean(refreshRuns) ||
    Boolean(liveDiscovery);

  return (
    <main className="dashboard-shell data-health-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Salud de datos</h1>
          <p className="subtitle">
            Cobertura y frescura de mercados y snapshots. Esta página explica
            calidad de datos, no predicciones ni recomendaciones.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="text-link" href="/help/data-issues">
            Playbook de datos
          </Link>
          <button className="theme-toggle" onClick={() => void loadDataHealth()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Read-only:</strong>
        <span>
          No ejecuta sync, no llama APIs externas y no inventa precios ni fuentes.
        </span>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>
            {hasAnyDataHealthPanel ? "Diagnóstico parcial" : "Salud de datos no disponible"}
          </strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Market overview</p>
            <h2>Resumen real del dashboard</h2>
            <p className="section-note">
              Fuente: /markets/overview. Este bloque solo lee datos ya cargados;
              no ejecuta discovery, imports, snapshots ni scoring.
            </p>
          </div>
          <span className="badge muted">
            {loading ? "Cargando" : `${overviewTotalMarkets} mercados`}
          </span>
        </div>

        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>Markets visibles</span>
            <strong>{loading ? "..." : overviewTotalMarkets}</strong>
            <p>Devueltos por /markets/overview</p>
          </article>
          <article className="metric-card">
            <span>Con predicción</span>
            <strong>{loading ? "..." : overviewWithPredictions}</strong>
            <p>Items con latest_prediction</p>
          </article>
          <article className="metric-card">
            <span>Con snapshot</span>
            <strong>{loading ? "..." : overviewWithSnapshots}</strong>
            <p>Items con latest_snapshot</p>
          </article>
          <article className="metric-card">
            <span>Fallback only</span>
            <strong>{loading ? "..." : overviewFallbackOnly}</strong>
            <p>Score informativo o datos parciales</p>
          </article>
          <article className="metric-card">
            <span>Deportes con datos</span>
            <strong>{loading ? "..." : primarySportsWithData.length}</strong>
            <p>{primarySportsWithData.map((sport) => sport.label).join(", ") || "Ninguno"}</p>
          </article>
          <article className="metric-card">
            <span>Sin datos todavía</span>
            <strong>{loading ? "..." : primarySportsWithoutData.length}</strong>
            <p>
              {primarySportsWithoutData.map((sport) => sport.label).join(", ") ||
                "Todos los principales tienen datos"}
            </p>
          </article>
          <article className="metric-card">
            <span>Última actualización</span>
            <strong>{loading ? "..." : formatDate(latestOverviewSnapshot)}</strong>
            <p>Snapshot más reciente en overview</p>
          </article>
        </div>
      </section>

      <section className="metric-grid" aria-label="Resumen de salud de datos">
        <article className="metric-card">
          <span>Mercados totales</span>
          <strong>{loading ? "..." : overview?.total_markets ?? 0}</strong>
          <p>{overview?.active_markets ?? 0} activos</p>
        </article>
        <article className="metric-card">
          <span>Próximos mercados</span>
          <strong>{loading ? "..." : overview?.upcoming_markets_count ?? 0}</strong>
          <p>Ventana operativa actual</p>
        </article>
        <article className="metric-card">
          <span>Con snapshots</span>
          <strong>{loading ? "..." : overview?.markets_with_snapshots ?? 0}</strong>
          <p>{overview?.markets_missing_snapshots ?? 0} sin snapshot</p>
        </article>
        <article className="metric-card">
          <span>Faltan precios</span>
          <strong>{loading ? "..." : overview?.markets_missing_prices ?? 0}</strong>
          <p>Último snapshot sin SÍ/NO completo</p>
        </article>
        <article className="metric-card">
          <span>Sin cierre</span>
          <strong>{loading ? "..." : overview?.markets_missing_close_time ?? 0}</strong>
          <p>Mercados sin close_time</p>
        </article>
        <article className="metric-card">
          <span>Último snapshot</span>
          <strong>{loading ? "..." : formatDate(overview?.latest_snapshot_at)}</strong>
          <p>Frescura local</p>
        </article>
      </section>

      <section className="dashboard-panel live-discovery-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Polymarket live</p>
            <h2>Descubrimiento en vivo de mercados próximos</h2>
            <p className="section-note">
              Este diagnóstico consulta Polymarket en modo lectura. No guarda datos,
              no crea snapshots, no ejecuta trading ni predicciones.
            </p>
          </div>
          <span className="badge muted">
            {liveDiscovery?.summary.total_remote_checked ?? 0} remotos revisados
          </span>
        </div>

        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>Ya en local</span>
            <strong>{loading ? "..." : liveDiscovery?.summary.already_local_count ?? 0}</strong>
            <p>Coinciden por id, slug o condition_id</p>
          </article>
          <article className="metric-card">
            <span>Faltan en local</span>
            <strong>{loading ? "..." : liveDiscovery?.summary.missing_local_count ?? 0}</strong>
            <p>Podrían requerir import controlado</p>
          </article>
          <article className="metric-card">
            <span>Con precio remoto</span>
            <strong>{loading ? "..." : liveDiscovery?.summary.remote_with_price_count ?? 0}</strong>
            <p>Payload trae precios SÍ/NO</p>
          </article>
          <article className="metric-card">
            <span>Con condition_id</span>
            <strong>
              {loading ? "..." : liveDiscovery?.summary.remote_with_condition_id_count ?? 0}
            </strong>
            <p>Útil para Wallet Intelligence</p>
          </article>
        </div>

        <div className="command-card standalone-command">
          <div>
            <span>Discovery read-only</span>
            <code>python -m app.commands.discover_live_upcoming_markets --days 7 --limit 50 --json</code>
          </div>
          <button
            onClick={() =>
              void copyCommand(
                "python -m app.commands.discover_live_upcoming_markets --days 7 --limit 50 --json",
              )
            }
            type="button"
          >
            {copiedCommand ===
            "python -m app.commands.discover_live_upcoming_markets --days 7 --limit 50 --json"
              ? "Copiado"
              : "Copiar"}
          </button>
        </div>
        <div className="command-card standalone-command">
          <div>
            <span>Import metadata dry-run</span>
            <code>
              python -m app.commands.import_live_discovered_markets --days 7 --limit 25 --max-import 3 --dry-run --json
            </code>
            <p>
              No importa desde la UI. Ejecuta dry-run primero y usa --apply solo con
              límites pequeños.
            </p>
          </div>
          <button
            onClick={() =>
              void copyCommand(
                "python -m app.commands.import_live_discovered_markets --days 7 --limit 25 --max-import 3 --dry-run --json",
              )
            }
            type="button"
          >
            {copiedCommand ===
            "python -m app.commands.import_live_discovered_markets --days 7 --limit 25 --max-import 3 --dry-run --json"
              ? "Copiado"
              : "Copiar"}
          </button>
        </div>
        <div className="command-card standalone-command">
          <div>
            <span>Snapshot desde discovery dry-run</span>
            <code>
              python -m app.commands.create_snapshots_from_discovery --days 7 --limit 25 --max-snapshots 3 --dry-run --json
            </code>
            <p>
              Usa solo precios binarios del payload remoto. No deriva precios ni crea
              predicciones.
            </p>
          </div>
          <button
            onClick={() =>
              void copyCommand(
                "python -m app.commands.create_snapshots_from_discovery --days 7 --limit 25 --max-snapshots 3 --dry-run --json",
              )
            }
            type="button"
          >
            {copiedCommand ===
            "python -m app.commands.create_snapshots_from_discovery --days 7 --limit 25 --max-snapshots 3 --dry-run --json"
              ? "Copiado"
              : "Copiar"}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Consultando discovery live limitado...</div>
        ) : !liveDiscovery || liveDiscovery.items.length === 0 ? (
          <div className="empty-state">
            No hay mercados remotos próximos que coincidan con los filtros actuales.
          </div>
        ) : (
          <div className="refresh-plan-grid">
            {liveDiscovery.items.slice(0, 6).map((item) => (
              <article
                className="refresh-plan-card"
                key={`${item.remote_id ?? item.title}-${item.close_time ?? "sin-cierre"}`}
              >
                <div className="refresh-plan-card-header">
                  <div>
                    <span className="eyebrow">{formatSport(item.sport)}</span>
                    <h3>{item.title}</h3>
                  </div>
                  {item.local_market_id ? (
                    <Link className="text-link" href={`/markets/${item.local_market_id}`}>
                      Ver local
                    </Link>
                  ) : null}
                </div>
                <div className="snapshot-gap-meta">
                  <span className="reason-chip">
                    {formatDiscoveryStatus(item.discovery_status)}
                  </span>
                  <span className="reason-chip">Cierre {formatDate(item.close_time)}</span>
                  {item.has_remote_price ? (
                    <span className="data-quality-label fresh">Precio remoto</span>
                  ) : (
                    <span className="warning-chip">Sin precio remoto</span>
                  )}
                  {item.condition_id ? (
                    <span className="reason-chip">condition_id</span>
                  ) : (
                    <span className="warning-chip">Sin condition_id</span>
                  )}
                </div>
                <div className="data-health-notes">
                  {item.reasons.slice(0, 4).map((reason) => (
                    <span className="reason-chip" key={`${item.remote_id}-${reason}`}>
                      {reason}
                    </span>
                  ))}
                  {item.warnings.slice(0, 3).map((warning) => (
                    <span className="warning-chip" key={`${item.remote_id}-${warning}`}>
                      {warning}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel ready-markets-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Discovery a análisis</p>
            <h2>Listos para análisis</h2>
            <p className="section-note">
              Mercados con snapshot, precio SÍ/NO, score calculado y ventana útil.
              El comando prepara un Research Packet; no se ejecuta desde la UI.
            </p>
          </div>
          <span className="badge muted">{readyAnalysisItems.length} visibles</span>
        </div>

        {loading ? (
          <div className="empty-state">Buscando mercados listos...</div>
        ) : readyAnalysisItems.length === 0 ? (
          <div className="empty-state">
            No hay mercados listos en esta ventana. Revisa candidatos de refresh o discovery.
          </div>
        ) : (
          <div className="readiness-list">
            {readyAnalysisItems.map((item) => (
              <article className="readiness-card ready" key={`ready-highlight-${item.market_id}`}>
                <div className="readiness-score">
                  <span>Readiness</span>
                  <strong>{item.readiness_score}</strong>
                </div>
                <div className="readiness-card-body">
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">
                        {formatSport(item.sport)} · {formatReadinessSource(item.source)}
                      </span>
                      <h3>{item.title}</h3>
                      <p className="section-note">
                        {item.ready_reason || "Listo para generar Research Packet manual."}
                      </p>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver análisis
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className="readiness-status ready">Listo</span>
                    <span className="reason-chip">SÍ {item.yes_price ?? "N/D"}</span>
                    <span className="reason-chip">NO {item.no_price ?? "N/D"}</span>
                    <span className="reason-chip">{item.time_window_label}</span>
                    <span className="reason-chip">Cierre {formatDate(item.close_time)}</span>
                  </div>
                  <div className="refresh-command-list compact-command-list">
                    <div className="command-card">
                      <div>
                        <span>Research Packet manual</span>
                        <code>{item.suggested_research_packet_command}</code>
                      </div>
                      <button
                        onClick={() => void copyCommand(item.suggested_research_packet_command)}
                        type="button"
                      >
                        {copiedCommand === item.suggested_research_packet_command
                          ? "Copiado"
                          : "Copiar"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel readiness-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Primeros análisis</p>
            <h2>Preparación para primeros análisis</h2>
            <p className="section-note">
              Separa mercados listos de los que necesitan refresh o deben quedar bloqueados.
              Esta vista no ejecuta refresh, research ni predicciones.
            </p>
            <p className="section-note">
              Para pruebas E2E, prioriza mercados con 24h a 7 días antes del cierre.
            </p>
          </div>
          <span className="badge muted">
            {analysisReadiness?.summary.total_checked ?? 0} revisados
          </span>
        </div>

        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>Listos</span>
            <strong>{loading ? "..." : analysisReadiness?.summary.ready_count ?? 0}</strong>
            <p>Con snapshot, precios y deporte claro</p>
          </article>
          <article className="metric-card">
            <span>Necesitan refresh</span>
            <strong>
              {loading ? "..." : analysisReadiness?.summary.refresh_needed_count ?? 0}
            </strong>
            <p>Candidatos buenos sin snapshot/precio</p>
          </article>
          <article className="metric-card">
            <span>Bloqueados</span>
            <strong>{loading ? "..." : analysisReadiness?.summary.blocked_count ?? 0}</strong>
            <p>Inciertos, stale o no aptos por ahora</p>
          </article>
          <article className="metric-card">
            <span>Score pendiente</span>
            <strong>
              {loading ? "..." : analysisReadiness?.summary.score_pending_count ?? 0}
            </strong>
            <p>Normalmente por falta de precio</p>
          </article>
        </div>

        {loading ? (
          <div className="empty-state">Calculando readiness...</div>
        ) : !analysisReadiness || analysisReadiness.items.length === 0 ? (
          <div className="empty-state">
            No hay mercados próximos para evaluar en la ventana actual.
          </div>
        ) : (
          <div className="readiness-list">
            {analysisReadiness.items.slice(0, 12).map((item) => (
              <article
                className={`readiness-card ${item.readiness_status}`}
                key={`readiness-${item.market_id}`}
              >
                <div className="readiness-score">
                  <span>Readiness</span>
                  <strong>{item.readiness_score}</strong>
                </div>
                <div className="readiness-card-body">
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">{formatSport(item.sport)}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver mercado
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className={`readiness-status ${item.readiness_status}`}>
                      {formatReadinessStatus(item.readiness_status)}
                    </span>
                    <span className="reason-chip">{item.data_quality_label}</span>
                    <span className={`data-quality-label ${item.freshness_status}`}>
                      {formatFreshnessStatus(item.freshness_status)}
                    </span>
                    <span className="reason-chip">{formatReadinessSource(item.source)}</span>
                    <span className="reason-chip">
                      {formatReadinessAction(item.suggested_next_action)}
                    </span>
                    <span className="reason-chip">{item.time_window_label}</span>
                    {isClosingTooSoon(item.time_window_label) ? (
                      <span className="warning-chip">Cierra demasiado pronto</span>
                    ) : null}
                    <span className="reason-chip">Cierre {formatDate(item.close_time)}</span>
                  </div>
                  <div className="snapshot-gap-meta">
                    {item.yes_price !== null && item.yes_price !== undefined ? (
                      <span className="reason-chip">SÍ {Number(item.yes_price) * 100}%</span>
                    ) : (
                      <span className="warning-chip">Falta precio SÍ</span>
                    )}
                    {item.no_price !== null && item.no_price !== undefined ? (
                      <span className="reason-chip">NO {Number(item.no_price) * 100}%</span>
                    ) : (
                      <span className="warning-chip">Falta precio NO</span>
                    )}
                    {item.missing_fields.includes("snapshot") ? (
                      <span className="warning-chip">Sin snapshot</span>
                    ) : null}
                    {item.polysignal_score_status === "pending" ? (
                      <span className="warning-chip">Score pendiente</span>
                    ) : null}
                  </div>
                  {item.missing_fields.length > 0 ? (
                    <div className="data-health-notes">
                      {item.missing_fields.slice(0, 6).map((field) => (
                        <span className="reason-chip" key={`${item.market_id}-${field}`}>
                          Falta {field.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {item.readiness_status === "needs_refresh" ? (
                    <div className="refresh-command-list compact-command-list">
                      <div className="command-card">
                        <div>
                          <span>Snapshot dry-run</span>
                          <code>{item.suggested_refresh_snapshot_command}</code>
                        </div>
                        <button
                          onClick={() => void copyCommand(item.suggested_refresh_snapshot_command)}
                          type="button"
                        >
                          {copiedCommand === item.suggested_refresh_snapshot_command
                            ? "Copiado"
                            : "Copiar"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Diagnóstico seguro</p>
            <h2>Gaps de snapshots</h2>
            <p className="section-note">
              Mercados próximos que necesitan snapshots o precios. Esta vista no ejecuta sync
              ni llama Polymarket.
            </p>
          </div>
          <span className="badge muted">
            {snapshotGaps?.total_checked ?? 0} revisados
          </span>
        </div>

        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>Sin snapshot</span>
            <strong>{loading ? "..." : snapshotGaps?.missing_snapshot_count ?? 0}</strong>
            <p>Necesitan captura local</p>
          </article>
          <article className="metric-card">
            <span>Faltan precios</span>
            <strong>{loading ? "..." : snapshotGaps?.missing_price_count ?? 0}</strong>
            <p>SÍ/NO incompleto</p>
          </article>
          <article className="metric-card">
            <span>Snapshot viejo</span>
            <strong>{loading ? "..." : snapshotGaps?.stale_snapshot_count ?? 0}</strong>
            <p>Mayor a la ventana segura</p>
          </article>
        </div>

        {loading ? (
          <div className="empty-state">Cargando gaps de snapshots...</div>
        ) : !snapshotGaps || snapshotGaps.items.length === 0 ? (
          <div className="empty-state">
            No hay mercados próximos con los filtros actuales.
          </div>
        ) : (
          <div className="snapshot-gap-list">
            {snapshotGaps.items.slice(0, 10).map((item) => (
              <article className="snapshot-gap-card" key={item.market_id}>
                <div>
                  <span className="eyebrow">{formatSport(item.sport)}</span>
                  <h3>{item.title}</h3>
                  <p>
                    Cierre {formatDate(item.close_time)} · Snapshot{" "}
                    {formatDate(item.latest_snapshot_at)}
                  </p>
                </div>
                <div className="snapshot-gap-meta">
                  <span className={`data-quality-label ${item.freshness_status}`}>
                    {formatFreshnessStatus(item.freshness_status)}
                  </span>
                  <span className="reason-chip">
                    {formatRecommendedAction(item.recommended_action)}
                  </span>
                  {!item.has_yes_price || !item.has_no_price ? (
                    <span className="warning-chip">Precio incompleto</span>
                  ) : null}
                </div>
                <a className="text-link" href={`/markets/${item.market_id}`}>
                  Ver análisis
                </a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel refresh-priority-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Priorización</p>
            <h2>Prioridad de actualización</h2>
            <p className="section-note">
              Ranking read-only de mercados próximos que conviene revisar primero con
              refresh controlado. No ejecuta comandos desde la UI.
            </p>
            <p className="section-note">
              Para pruebas E2E, prioriza mercados con 24h a 7 días antes del cierre.
            </p>
          </div>
          <span className="badge muted">
            {refreshPriorities?.returned ?? 0} priorizados
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Calculando prioridades de refresh...</div>
        ) : !refreshPriorities || refreshPriorities.items.length === 0 ? (
          <div className="empty-state">
            No hay candidatos de refresh con los filtros actuales.
          </div>
        ) : (
          <div className="refresh-priority-list">
            {refreshPriorities.items.slice(0, 8).map((item) => (
              <article className="refresh-priority-card" key={`priority-${item.market_id}`}>
                <div className="refresh-priority-score">
                  <span>Prioridad</span>
                  <strong>{item.refresh_priority_score}</strong>
                </div>
                <div className="refresh-priority-body">
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">{formatSport(item.sport)}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver mercado
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className={`data-quality-label ${item.freshness_status}`}>
                      {formatFreshnessStatus(item.freshness_status)}
                    </span>
                    <span className="reason-chip">{item.data_quality_label}</span>
                    {item.missing_snapshot ? (
                      <span className="warning-chip">Sin snapshot</span>
                    ) : null}
                    {item.missing_price ? (
                      <span className="warning-chip">Precio incompleto</span>
                    ) : null}
                    <span className="reason-chip">{item.time_window_label}</span>
                    {isClosingTooSoon(item.time_window_label) ? (
                      <span className="warning-chip">Cierra demasiado pronto</span>
                    ) : null}
                    <span className="reason-chip">Cierre {formatDate(item.close_time)}</span>
                  </div>
                  <div className="data-health-notes">
                    {item.reasons.slice(0, 5).map((reason) => (
                      <span className="reason-chip" key={`${item.market_id}-${reason}`}>
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="refresh-command-list compact-command-list">
                    <div className="command-card">
                      <div>
                        <span>Snapshot dry-run</span>
                        <code>{item.suggested_command_snapshot}</code>
                      </div>
                      <button
                        onClick={() => void copyCommand(item.suggested_command_snapshot)}
                        type="button"
                      >
                        {copiedCommand === item.suggested_command_snapshot ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="command-card">
                      <div>
                        <span>Metadata dry-run</span>
                        <code>{item.suggested_command_metadata}</code>
                      </div>
                      <button
                        onClick={() => void copyCommand(item.suggested_command_metadata)}
                        type="button"
                      >
                        {copiedCommand === item.suggested_command_metadata ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel refresh-plan-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Plan operativo</p>
            <h2>Plan de actualización controlada</h2>
            <p className="section-note">
              Usa estos comandos primero en dry-run. La UI solo los muestra y copia;
              no ejecuta refresh, sync, predicciones ni trading.
            </p>
          </div>
          <span className="badge muted">
            {snapshotGaps?.items.length ?? 0} candidatos
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Preparando plan de actualización...</div>
        ) : !snapshotGaps || snapshotGaps.items.length === 0 ? (
          <div className="empty-state">
            No hay gaps activos para planificar refresh con los filtros actuales.
          </div>
        ) : (
          <div className="refresh-plan-grid">
            {snapshotGaps.items.slice(0, 6).map((item) => {
              const snapshotCommand = buildSnapshotCommand(item.market_id);
              const metadataCommand = buildMetadataCommand(item.market_id);
              return (
                <article className="refresh-plan-card" key={`refresh-${item.market_id}`}>
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">{formatSport(item.sport)}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver mercado
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className={`data-quality-label ${item.freshness_status}`}>
                      {formatFreshnessStatus(item.freshness_status)}
                    </span>
                    <span className="reason-chip">
                      {formatRecommendedAction(item.recommended_action)}
                    </span>
                    <span className="reason-chip">
                      Cierre {formatDate(item.close_time)}
                    </span>
                  </div>
                  <div className="refresh-command-list">
                    <div className="command-card">
                      <div>
                        <span>Snapshot dry-run</span>
                        <code>{snapshotCommand}</code>
                      </div>
                      <button onClick={() => void copyCommand(snapshotCommand)} type="button">
                        {copiedCommand === snapshotCommand ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="command-card">
                      <div>
                        <span>Metadata dry-run</span>
                        <code>{metadataCommand}</code>
                      </div>
                      <button onClick={() => void copyCommand(metadataCommand)} type="button">
                        {copiedCommand === metadataCommand ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="refresh-run-section">
          <div className="panel-heading compact-heading">
            <div>
              <p className="eyebrow">Auditoría</p>
              <h3>Refresh runs recientes</h3>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando auditoría de refresh...</div>
          ) : !refreshRuns || refreshRuns.items.length === 0 ? (
            <div className="empty-state">
              Aún no hay refresh runs auditados.
            </div>
          ) : (
            <div className="refresh-run-list">
              {refreshRuns.items.map((run) => (
                <article className="refresh-run-card" key={run.id}>
                  <div>
                    <strong>
                      #{run.id} {run.refresh_type === "snapshot" ? "Snapshots" : "Metadata"}
                    </strong>
                    <span>{formatDate(run.started_at)}</span>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className="reason-chip">{run.mode}</span>
                    <span className={`data-quality-label ${run.status}`}>
                      {run.status}
                    </span>
                    <span className="reason-chip">
                      {run.markets_checked} revisados
                    </span>
                    <span className="reason-chip">
                      {run.markets_updated} actualizados
                    </span>
                    {run.errors_count > 0 ? (
                      <span className="warning-chip">{run.errors_count} errores</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Cobertura</p>
            <h2>Por deporte</h2>
          </div>
          <span className="badge muted">
            {overview?.coverage_by_sport.length ?? 0} deportes
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Cargando cobertura...</div>
        ) : !overview || overview.coverage_by_sport.length === 0 ? (
          <div className="empty-state">No hay mercados para resumir todavía.</div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Deporte</th>
                  <th>Total</th>
                  <th>Con snapshot</th>
                  <th>Faltan precios</th>
                  <th>Sin cierre</th>
                </tr>
              </thead>
              <tbody>
                {overview.coverage_by_sport.map((item) => (
                  <tr key={item.sport}>
                    <td>{formatSport(item.sport)}</td>
                    <td>{item.total}</td>
                    <td>{item.with_snapshot}</td>
                    <td>{item.missing_price}</td>
                    <td>{item.missing_close_time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Lectura operativa</p>
            <h2>Qué explica esta vista</h2>
          </div>
        </div>
        <div className="data-health-notes">
          <span className="reason-chip">Scores pendientes suelen faltar precios o snapshots.</span>
          <span className="reason-chip">sport=other indica clasificación incompleta.</span>
          <span className="reason-chip">Sin cierre limita filtros de próximos 7 días.</span>
        </div>
      </section>
    </main>
  );
}
