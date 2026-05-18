"use client";

import type {
  CopyTradingStatus,
  CopyTradingWatcherStatus,
  CopyTradingWatcherWalletScanResult,
} from "../../lib/copyTradingTypes";
import { formatDateTime, formatDurationMs } from "../../lib/copyTrading";

type CopyWatcherPanelProps = {
  error?: string | null;
  loading?: boolean;
  status: CopyTradingStatus | null;
  statusLoading?: boolean;
  watcher: CopyTradingWatcherStatus | null;
};

export function CopyWatcherPanel({
  error = null,
  loading = false,
  status,
  statusLoading = false,
  watcher,
}: CopyWatcherPanelProps) {
  const persistedStateLabel =
    loading && !watcher ? "Consultando estado del worker..." : describeWorkerState(watcher?.worker_status ?? "unknown");
  const walletScanResults = watcher?.last_result?.wallet_scan_results ?? [];
  const topSlowWallets = walletScanResults
    .filter((entry) => entry.status === "slow")
    .sort((left, right) => (right.duration_ms ?? 0) - (left.duration_ms ?? 0))
    .slice(0, 3);
  const timeoutWallets = walletScanResults.filter((entry) => entry.status === "timeout").slice(0, 3);
  const pendingWalletsList = walletScanResults
    .filter((entry) => entry.status === "skipped_budget" || entry.status === "skipped_priority")
    .slice(0, 4);
  const scannedWallets = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "wallets_scanned",
    watcher?.last_result?.scanned_wallet_count ?? watcher?.scanned_wallet_count ?? 0,
  );
  const pendingWallets = watcher?.last_result?.pending_wallet_count ?? watcher?.pending_wallet_count ?? 0;
  const tradesDetected = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "trades_detected",
    watcher?.last_result?.trades_detected ?? 0,
  );
  const demoOrdersCreated = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "demo_orders_created",
    watcher?.last_result?.orders_simulated ?? 0,
  );
  const positionsOpened = getLastResultNumber(watcher?.last_result_json ?? null, "positions_opened", 0);
  const positionsClosed = getLastResultNumber(watcher?.last_result_json ?? null, "positions_closed", 0);
  const nextRunLabel = formatDateTime(watcher?.next_run_at);
  const cycleMessage = watcher?.last_result?.cycle_budget_exceeded
    ? "Ciclo recortado por carga"
    : watcher?.is_over_interval
      ? "Atrasado por carga"
      : persistedStateLabel;
  const resultSummary = watcher?.last_result_json
    ? `Ultimo resultado: wallets ${scannedWallets} | trades ${tradesDetected} | ordenes demo ${demoOrdersCreated} | posiciones abiertas ${positionsOpened} | posiciones cerradas ${positionsClosed}`
    : loading
      ? "Ultimo resultado: consultando..."
      : "Ultimo resultado: sin ejecuciones todavia";
  const persistentSummary = !watcher
    ? "Consultando estado del worker..."
    : watcher.worker_status === "not_started"
      ? "Worker demo no iniciado todavia."
      : `${persistedStateLabel}. Heartbeat ${formatDateTime(watcher.last_heartbeat_at)}.`;
  const workerTone = getWorkerTone(watcher?.worker_status ?? "unknown", Boolean(error));
  const workerLabel = getWorkerBadgeLabel(watcher?.worker_status ?? "unknown", Boolean(error));
  const lastLoopLabel = formatDateTime(watcher?.last_loop_finished_at || watcher?.last_run_finished_at || watcher?.last_run_at);
  const lastSuccessLabel = formatDateTime(watcher?.last_success_at);
  const walletsActiveLabel = statusLoading && !status ? "Cargando..." : String(status?.wallets_enabled ?? "-");
  const warningsCount =
    (watcher?.skipped_due_to_budget_count ?? 0) +
    (watcher?.skipped_due_to_priority_count ?? 0) +
    (watcher?.errored_wallet_count ?? 0) +
    (watcher?.timeout_count ?? 0);
  const primaryMetrics = [
    {
      detail: persistentSummary,
      emphasis: "primary" as const,
      label: "Estado del worker",
      tone: workerTone,
      value: workerLabel,
    },
    {
      detail: watcher?.is_over_interval ? `Atrasado ${watcher.behind_by_seconds}s sobre el intervalo.` : "Senal de vida persistida en Render.",
      emphasis: "primary" as const,
      label: "Ultimo heartbeat",
      tone: watcher?.is_over_interval ? "warning" as const : "neutral" as const,
      value: formatDateTime(watcher?.last_heartbeat_at),
    },
    {
      detail: "Ultimo ciclo confirmado por el watcher.",
      emphasis: "primary" as const,
      label: "Ultimo loop",
      tone: "neutral" as const,
      value: lastLoopLabel,
    },
    {
      detail: "Ultima pasada sin error persistido.",
      emphasis: "primary" as const,
      label: "Ultimo exito",
      tone: "neutral" as const,
      value: lastSuccessLabel,
    },
    {
      detail: watcher?.consecutive_errors ? "El watcher conserva errores consecutivos hasta la siguiente pasada sana." : "Sin errores consecutivos.",
      emphasis: "primary" as const,
      label: "Errores consecutivos",
      tone: (watcher?.consecutive_errors ?? 0) > 0 ? "negative" as const : "positive" as const,
      value: String(watcher?.consecutive_errors ?? 0),
    },
    {
      detail: "Wallets demo habilitadas para escaneo.",
      emphasis: "primary" as const,
      label: "Wallets activas",
      tone: "neutral" as const,
      value: walletsActiveLabel,
    },
    {
      detail: cycleMessage,
      emphasis: "wide" as const,
      label: "Ultimo resultado",
      tone: warningsCount > 0 || watcher?.is_over_interval ? "warning" as const : "neutral" as const,
      value: summarizeResult(scannedWallets, tradesDetected, demoOrdersCreated, positionsOpened, positionsClosed),
    },
  ];
  const activityMetrics = [
    {
      detail: "Cadencia prevista del watcher en Render.",
      label: "Intervalo objetivo",
      tone: "neutral" as const,
      value: watcher?.interval_seconds ? `${watcher.interval_seconds}s` : "-",
    },
    {
      detail: "Tiempo maximo por pasada antes de dejar wallets para el proximo ciclo.",
      label: "Budget por ciclo",
      tone: "neutral" as const,
      value: watcher?.cycle_budget_seconds ? `${watcher.cycle_budget_seconds}s` : "-",
    },
    {
      detail: "Duracion de la ultima pasada completada.",
      label: "Ultimo ciclo",
      tone: "neutral" as const,
      value: formatDurationMs(watcher?.last_run_duration_ms),
    },
    {
      detail: "Promedio reciente registrado por el worker.",
      label: "Promedio reciente",
      tone: "neutral" as const,
      value: formatDurationMs(watcher?.average_run_duration_ms),
    },
    {
      detail: "Wallets leidas ahora vs wallets aplazadas al proximo ciclo.",
      label: "Escaneadas / pendientes",
      tone: pendingWallets > 0 ? "warning" as const : "neutral" as const,
      value: `${scannedWallets} / ${pendingWallets}`,
    },
    {
      detail: "Trades detectados en la pasada persistida.",
      label: "Trades detectados",
      tone: "neutral" as const,
      value: String(tradesDetected),
    },
    {
      detail: "Ordenes demo nuevas creadas por el worker.",
      label: "Ordenes demo nuevas",
      tone: demoOrdersCreated > 0 ? "positive" as const : "neutral" as const,
      value: String(demoOrdersCreated),
    },
  ];
  const operationsMetrics = [
    {
      detail: "Posiciones demo abiertas durante la ultima pasada.",
      label: "Posiciones abiertas",
      tone: positionsOpened > 0 ? "positive" as const : "neutral" as const,
      value: String(positionsOpened),
    },
    {
      detail: "Posiciones demo cerradas durante la ultima pasada.",
      label: "Posiciones cerradas",
      tone: positionsClosed > 0 ? "positive" as const : "neutral" as const,
      value: String(positionsClosed),
    },
    {
      detail: "Wallets que tardaron demasiado pero terminaron.",
      label: "Wallets lentas",
      tone: (watcher?.slow_wallet_count ?? 0) > 0 ? "warning" as const : "neutral" as const,
      value: String(watcher?.slow_wallet_count ?? 0),
    },
    {
      detail: "Timeouts reales detectados por el ciclo.",
      label: "Timeouts reales",
      tone: (watcher?.timeout_count ?? 0) > 0 ? "warning" as const : "neutral" as const,
      value: String(watcher?.timeout_count ?? 0),
    },
    {
      detail: "Wallets aplazadas por budget.",
      label: "Saltadas por budget",
      tone: (watcher?.skipped_due_to_budget_count ?? 0) > 0 ? "warning" as const : "neutral" as const,
      value: String(watcher?.skipped_due_to_budget_count ?? 0),
    },
    {
      detail: "Wallets aplazadas por prioridad.",
      label: "Saltadas por prioridad",
      tone: (watcher?.skipped_due_to_priority_count ?? 0) > 0 ? "warning" as const : "neutral" as const,
      value: String(watcher?.skipped_due_to_priority_count ?? 0),
    },
    {
      detail: "Wallets con aviso tecnico o error recuperable.",
      label: "Con aviso",
      tone: (watcher?.errored_wallet_count ?? 0) > 0 ? "warning" as const : "neutral" as const,
      value: String(watcher?.errored_wallet_count ?? 0),
    },
  ];
  const technicalMetrics = [
    {
      detail: "Siguiente intento programado por el watcher.",
      label: "Proximo escaneo",
      tone: "neutral" as const,
      value: nextRunLabel,
    },
    {
      detail: "Inicio del ciclo actual si sigue en curso.",
      label: "Ciclo en curso desde",
      tone: "neutral" as const,
      value: formatDateTime(watcher?.current_run_started_at),
    },
    {
      detail: "Ultimo timestamp de pasada persistido.",
      label: "Ultimo escaneo",
      tone: "neutral" as const,
      value: formatDateTime(watcher?.last_run_at),
    },
    {
      detail: "Lectura consolidada del scheduler.",
      label: "Estado del ciclo",
      tone: "neutral" as const,
      value: cycleMessage,
    },
    {
      detail: "Wallets que pasan al proximo barrido.",
      label: "Pending wallets",
      tone: pendingWallets > 0 ? "warning" as const : "neutral" as const,
      value: String(pendingWallets),
    },
    {
      detail: "Suma de timeouts, avisos y recortes.",
      label: "Warnings tecnicos",
      tone: warningsCount > 0 ? "warning" as const : "neutral" as const,
      value: String(warningsCount),
    },
  ];

  return (
    <section className="copy-panel copy-watcher-panel">
      <div className="copy-watcher-header">
        <div className="copy-panel-heading">
          <span>Watcher demo</span>
          <strong>Estado del worker en Render</strong>
        </div>
        <div className="copy-status-strip" aria-live="polite">
          <span className={`copy-badge ${workerTone}`}>{workerLabel}</span>
          <span className="copy-badge subtle">Heartbeat {formatDateTime(watcher?.last_heartbeat_at)}</span>
          {watcher?.timeout_count ? <span className="copy-badge warning">Timeouts: {watcher.timeout_count}</span> : null}
        </div>
      </div>
      <p className="copy-field-helper">
        El worker demo en Render escanea wallets, detecta trades y actualiza el estado persistido. Esta pagina solo
        muestra estado y resultados. No ejecuta operaciones reales.
      </p>
      {error ? (
        <div className="copy-status-strip" aria-live="polite">
          <span className="copy-badge locked">{error}</span>
        </div>
      ) : null}
      {loading && !watcher ? (
        <div className="copy-empty-state">Consultando estado del worker...</div>
      ) : (
        <div className="copy-watcher-grid">
          <div className={`copy-performance-banner ${workerTone === "positive" ? "neutral" : workerTone}`} aria-live="polite">
            <div>
              <span>Estado persistido del worker</span>
              <strong>{persistentSummary}</strong>
            </div>
            <small>{resultSummary}</small>
          </div>

          <div className="copy-watcher-primary-grid">
            {primaryMetrics.map((metric) => (
              <WatcherMetricCard
                detail={metric.detail}
                emphasis={metric.emphasis}
                key={metric.label}
                label={metric.label}
                tone={metric.tone}
                value={metric.value}
              />
            ))}
          </div>

          <div className="copy-performance-section-grid">
            <section className="copy-performance-subsection">
              <div className="copy-performance-subsection-heading">
                <span>Actividad del watcher</span>
                <strong>Cadencia y lectura del ultimo ciclo</strong>
              </div>
              <WatcherMetricList items={activityMetrics} />
            </section>

            <section className="copy-performance-subsection">
              <div className="copy-performance-subsection-heading">
                <span>Resumen operativo</span>
                <strong>Salidas, avisos y recortes del ultimo barrido</strong>
              </div>
              <WatcherMetricList items={operationsMetrics} />
            </section>
          </div>

          <div className="copy-status-strip">
            <span className="copy-badge subtle">La automatizacion corre en Render. Esta vista solo refresca estado y resultados.</span>
            <span className="copy-badge subtle">Modo demo: no ejecuta dinero real.</span>
            <span className="copy-badge subtle">
              Posiciones abiertas {statusLoading && !status ? "..." : String(status?.open_demo_positions_count ?? "-")}
            </span>
            {watcher?.skipped_due_to_budget_count ? (
              <span className="copy-badge warning">Pendiente por carga no es error: vuelve en el proximo ciclo.</span>
            ) : null}
            {watcher?.timeout_count ? (
              <span className="copy-badge locked">Timeout real: una wallet o la API tardaron demasiado.</span>
            ) : null}
          </div>

          <details className="copy-watcher-technical">
            <summary>
              <span>Detalles tecnicos del worker</span>
              <small>Budget, contadores internos y wallets con incidencias.</small>
            </summary>

            <div className="copy-watcher-technical-grid">
              <section className="copy-performance-subsection">
                <div className="copy-performance-subsection-heading">
                  <span>Metadatos tecnicos</span>
                  <strong>Estado interno del scheduler</strong>
                </div>
                <WatcherMetricList compact items={technicalMetrics} />
              </section>

              <div className="copy-watcher-technical-sections">
                {topSlowWallets.length > 0 ? (
                  <WatcherWalletList title="Top wallets lentas" wallets={topSlowWallets} />
                ) : null}

                {timeoutWallets.length > 0 ? (
                  <WatcherWalletList title="Wallets con timeout real" wallets={timeoutWallets} />
                ) : null}

                {pendingWalletsList.length > 0 ? (
                  <WatcherWalletList title="Wallets pendientes para proximo ciclo" wallets={pendingWalletsList} />
                ) : null}

                {watcher?.last_error ? (
                  <section className="copy-wallet-subsection">
                    <span className="copy-wallet-subsection-title">Ultimo error persistido</span>
                    <div className="copy-wallet-details">
                      <small>{watcher.last_error}</small>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function WatcherMetricCard({
  detail,
  emphasis,
  label,
  tone,
  value,
}: {
  detail: string;
  emphasis: "primary" | "wide";
  label: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "locked";
  value: string;
}) {
  return (
    <article className={`copy-watcher-card ${tone} ${emphasis}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function WatcherMetricList({
  compact = false,
  items,
}: {
  compact?: boolean;
  items: Array<{
    detail: string;
    label: string;
    tone: "positive" | "negative" | "neutral" | "warning";
    value: string;
  }>;
}) {
  return (
    <div className={`copy-performance-list ${compact ? "compact" : ""}`}>
      {items.map((item) => (
        <div className="copy-performance-list-item" key={item.label}>
          <div className="copy-performance-list-copy">
            <span>{item.label}</span>
            <small>{item.detail}</small>
          </div>
          <strong className={`copy-performance-list-value ${item.tone}`}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function WatcherWalletList({
  title,
  wallets,
}: {
  title: string;
  wallets: CopyTradingWatcherWalletScanResult[];
}) {
  return (
    <section className="copy-wallet-subsection">
      <span className="copy-wallet-subsection-title">{title}</span>
      <div className="copy-wallet-details">
        {wallets.map((wallet) => (
          <small key={`${title}-${wallet.wallet_id}`}>{formatWalletScanLine(wallet)}</small>
        ))}
      </div>
    </section>
  );
}

function getLastResultNumber(
  payload: Record<string, unknown> | null,
  key: string,
  fallback: number,
): number {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatWalletScanLine(entry: CopyTradingWatcherWalletScanResult): string {
  const alias = entry.alias || entry.wallet_address_short;
  const duration = entry.duration_ms === null ? "sin tiempo" : formatDurationMs(entry.duration_ms);
  const status =
    entry.status === "timeout"
      ? "Timeout real"
      : entry.status === "slow"
        ? "Wallet lenta"
        : entry.status === "skipped_budget"
          ? "Pendiente por carga"
          : entry.status === "skipped_priority"
            ? "Pendiente por prioridad"
            : entry.status === "skipped_paused"
              ? "Pausada"
              : entry.status === "error"
                ? "Con aviso"
                : "Saludable";
  const reason = entry.reason ? ` | ${entry.reason}` : "";
  return `${alias} | ${status} | ${duration}${reason}${entry.next_scan_hint ? ` | ${entry.next_scan_hint}` : ""}`;
}

function describeWorkerState(state: CopyTradingWatcherStatus["worker_status"]): string {
  switch (state) {
    case "running":
      return "Activo";
    case "stale":
      return "Desactualizado";
    case "stopped":
      return "Detenido";
    case "error":
      return "Error";
    case "not_started":
      return "No iniciado";
    default:
      return "Estado desconocido";
  }
}

function getWorkerTone(
  state: CopyTradingWatcherStatus["worker_status"],
  hasError: boolean,
): "positive" | "negative" | "neutral" | "warning" | "locked" {
  if (hasError) {
    return "locked";
  }
  switch (state) {
    case "running":
      return "positive";
    case "stale":
      return "warning";
    case "stopped":
    case "error":
      return "negative";
    case "not_started":
    case "unknown":
    default:
      return "neutral";
  }
}

function getWorkerBadgeLabel(
  state: CopyTradingWatcherStatus["worker_status"],
  hasError: boolean,
): string {
  if (hasError) {
    return "Error real";
  }
  switch (state) {
    case "running":
      return "Activo";
    case "stale":
      return "Stale";
    case "stopped":
      return "Detenido";
    case "error":
      return "Error";
    case "not_started":
      return "No iniciado";
    default:
      return "Estado desconocido";
  }
}

function summarizeResult(
  scannedWallets: number,
  tradesDetected: number,
  demoOrdersCreated: number,
  positionsOpened: number,
  positionsClosed: number,
): string {
  return `${scannedWallets} wallets | ${tradesDetected} trades | ${demoOrdersCreated} ordenes | ${positionsOpened}/${positionsClosed} pos.`;
}
