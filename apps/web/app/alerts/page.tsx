"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ANALYSIS_HISTORY_STORAGE_EVENT,
  getAnalysisHistory,
  type AnalysisHistoryItem,
} from "../lib/analysisHistory";
import { getAnalysisLifecycleState } from "../lib/analysisLifecycle";
import {
  deleteProfileAlert,
  getProfileAlerts,
  markProfileAlertRead,
  PROFILE_ALERTS_STORAGE_EVENT,
  type ProfileAlert,
} from "../lib/profileAlerts";
import { formatLastUpdated } from "../lib/useAutoRefresh";

function formatDate(value?: string): string {
  if (!value) {
    return "sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "sin fecha";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function analyzerHrefForItem(item: AnalysisHistoryItem): string | null {
  if (!item.url) {
    return null;
  }
  const params = new URLSearchParams({ auto: "1", url: item.url });
  return `/analyze?${params.toString()}`;
}

function formatUsd(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
    style: "currency",
  }).format(value);
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function profileAlertTypeLabel(type: ProfileAlert["type"]): string {
  if (type === "high_winrate_profile_seen") {
    return "Perfil con winRate alto volvio a aparecer";
  }
  if (type === "large_position_detected") {
    return "Actividad publica relevante";
  }
  if (type === "new_market_activity") {
    return "Nueva actividad publica";
  }
  if (type === "profile_refresh_change") {
    return "Cambio en actualizacion";
  }
  return "Perfil destacado detectado";
}

function profileAlertSeverityLabel(severity: ProfileAlert["severity"]): string {
  if (severity === "important") {
    return "Importante";
  }
  if (severity === "watch") {
    return "Observar";
  }
  return "Info";
}

export default function AlertsPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [profileAlerts, setProfileAlerts] = useState<ProfileAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const history = await getAnalysisHistory();
      setItems(history);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos leer los analisis guardados ahora.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfileAlerts = useCallback(() => {
    setProfileAlerts(getProfileAlerts());
  }, []);

  useEffect(() => {
    void loadHistory();
    loadProfileAlerts();
  }, [loadHistory, loadProfileAlerts]);

  useEffect(() => {
    const syncHistory = () => {
      void loadHistory();
    };
    window.addEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, syncHistory);
    window.addEventListener("storage", syncHistory);
    return () => {
      window.removeEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, syncHistory);
      window.removeEventListener("storage", syncHistory);
    };
  }, [loadHistory]);

  useEffect(() => {
    window.addEventListener(PROFILE_ALERTS_STORAGE_EVENT, loadProfileAlerts);
    window.addEventListener("storage", loadProfileAlerts);
    return () => {
      window.removeEventListener(PROFILE_ALERTS_STORAGE_EVENT, loadProfileAlerts);
      window.removeEventListener("storage", loadProfileAlerts);
    };
  }, [loadProfileAlerts]);

  const pendingItems = useMemo(() => {
    return items
      .filter((item) => item.result === "pending" || item.status === "open")
      .slice(0, 8);
  }, [items]);
  const unknownItems = useMemo(() => {
    return items
      .filter((item) => item.result === "unknown" || item.status === "unknown")
      .slice(0, 5);
  }, [items]);
  const unreadProfileAlerts = useMemo(() => {
    return profileAlerts.filter((alert) => !alert.read);
  }, [profileAlerts]);

  const handleMarkProfileAlertRead = (alertId: string) => {
    setProfileAlerts(markProfileAlertRead(alertId));
  };

  const handleDeleteProfileAlert = (alertId: string) => {
    setProfileAlerts(deleteProfileAlert(alertId));
  };

  return (
    <main className="dashboard-shell alerts-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Alertas</p>
          <h1>Seguimiento de analisis guardados y perfiles</h1>
          <p className="subtitle">
            Alertas enfocadas en perfiles destacados detectados y lecturas guardadas:
            actividad publica, pendientes de resolucion y enlaces que conviene revisar.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/analyze">
            Analizar enlace
          </a>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadHistory()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Alertas locales de monitoreo:</strong>
        <span>
          Las alertas de perfiles viven en este navegador. No son recomendaciones
          ni instrucciones de operacion.
        </span>
      </section>

      {error ? (
        <section className="alert-panel compact" role="status">
          <strong>Alertas no disponibles</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de alertas">
        <article className="metric-card">
          <span>Alertas de perfiles</span>
          <strong>{profileAlerts.length}</strong>
          <p>{unreadProfileAlerts.length} sin leer</p>
        </article>
        <article className="metric-card">
          <span>Pendientes</span>
          <strong>{loading ? "..." : pendingItems.length}</strong>
          <p>Esperan resultado final</p>
        </article>
        <article className="metric-card">
          <span>Revisar</span>
          <strong>{loading ? "..." : unknownItems.length}</strong>
          <p>No se pudieron verificar</p>
        </article>
        <article className="metric-card">
          <span>Analisis guardados</span>
          <strong>{loading ? "..." : items.length}</strong>
          <p>Registros locales</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Alertas de perfiles</p>
            <h2>Actividad de perfiles destacados</h2>
            <p>Se generan cuando Wallet Intelligence detecta una wallet publica destacada en un mercado analizado.</p>
          </div>
        </div>

        {profileAlerts.length === 0 ? (
          <div className="empty-state compact">
            <strong>No hay alertas todavia.</strong>
            <p>Cuando un perfil destacado aparezca en un mercado analizado, lo veras aqui.</p>
            <a className="analysis-link" href="/analyze">
              Analizar enlace
            </a>
          </div>
        ) : unreadProfileAlerts.length === 0 ? (
          <div className="empty-state compact">
            <strong>Todas las alertas están revisadas.</strong>
            <p>Puedes conservarlas como bitacora local o eliminarlas cuando ya no las necesites.</p>
          </div>
        ) : null}

        {profileAlerts.length > 0 ? (
          <div className="profile-alerts-list">
            {profileAlerts.map((alert) => (
              <article className={`profile-alert-card ${alert.severity} ${alert.read ? "read" : "unread"}`} key={alert.id}>
                <div className="profile-alert-card-header">
                  <span className="profile-avatar" aria-hidden="true">
                    {alert.profileImageUrl ? <img alt="" src={alert.profileImageUrl} /> : alert.shortAddress.slice(2, 3).toUpperCase()}
                  </span>
                  <div>
                    <strong>{profileAlertTypeLabel(alert.type)}</strong>
                    <span>{alert.pseudonym || alert.shortAddress}</span>
                  </div>
                  <div className="profile-card-status">
                    <span className={`badge ${alert.severity === "important" ? "external-hint" : "muted"}`}>
                      {profileAlertSeverityLabel(alert.severity)}
                    </span>
                    <span className={alert.read ? "badge muted" : "badge external-hint"}>
                      {alert.read ? "Leida" : "Nueva"}
                    </span>
                  </div>
                </div>
                <h3>{alert.marketTitle}</h3>
                <p className="section-note">{alert.reason}</p>
                <div className="profile-alert-metrics">
                  <span>Outcome {alert.outcome || "No disponible"}</span>
                  <span>Monto {formatUsd(alert.amountUsd)}</span>
                  <span>Posicion {alert.positionSize !== null ? alert.positionSize : "No disponible"}</span>
                  <span>Win rate {formatPercent(alert.winRate)}</span>
                  <span>Cerrados {alert.closedMarkets ?? "No disponible"}</span>
                  <span>{formatDate(alert.createdAt)}</span>
                </div>
                <div className="profile-alert-actions">
                  {alert.profileUrl ? (
                    <a href={alert.profileUrl} rel="noopener noreferrer" target="_blank">
                      Ver perfil público
                    </a>
                  ) : null}
                  {alert.marketUrl ? (
                    <a href={alert.marketUrl} rel="noopener noreferrer" target="_blank">
                      Ver mercado
                    </a>
                  ) : null}
                  {!alert.read ? (
                    <button onClick={() => handleMarkProfileAlertRead(alert.id)} type="button">
                      Marcar como leida
                    </button>
                  ) : null}
                  <button onClick={() => handleDeleteProfileAlert(alert.id)} type="button">
                    Eliminar alerta
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Alertas de analisis guardados</p>
            <h2>Pendientes de resolución</h2>
            <p>Usa Historial para buscar resultados finales disponibles.</p>
          </div>
          <a className="analysis-link secondary" href="/history">
            Actualizar resultados
          </a>
        </div>

        {items.length === 0 ? (
          <div className="empty-state compact">
            <strong>Todavia no tienes analisis guardados.</strong>
            <p>Pega un enlace de Polymarket para crear el primer seguimiento.</p>
            <a className="analysis-link" href="/analyze">
              Analizar enlace
            </a>
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>No hay analisis pendientes de resolucion.</strong>
            <p>Cuando guardes una lectura abierta, aparecera aqui.</p>
          </div>
        ) : (
          <div className="history-list compact">
            {pendingItems.map((item) => {
              const lifecycle = getAnalysisLifecycleState(item);
              const href = analyzerHrefForItem(item);
              return (
                <article className="history-card" key={item.id}>
                  <div className="history-card-header">
                    <span className="badge external-hint">{lifecycle.label}</span>
                    <span className="timestamp-pill">{formatDate(item.analyzedAt)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="section-note">{lifecycle.summary}</p>
                  <p className="section-note">{item.nextCheckHint || lifecycle.nextCheckHint}</p>
                  <div className="watchlist-actions">
                    <a className="analysis-link" href="/history">
                      Actualizar resultados
                    </a>
                    {href ? (
                      <a className="analysis-link secondary" href={href}>
                        Reanalizar enlace
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisar</p>
            <h2>Analisis sin verificacion confiable</h2>
            <p>No cuentan como fallos. Puedes volver a intentar cuando el mercado tenga resultado.</p>
          </div>
        </div>
        {unknownItems.length === 0 ? (
          <div className="empty-state compact">Sin revisiones pendientes.</div>
        ) : (
          <div className="history-list compact">
            {unknownItems.map((item) => {
              const href = analyzerHrefForItem(item);
              return (
                <article className="history-card" key={item.id}>
                  <h3>{item.title}</h3>
                  <p className="section-note">
                    {item.resolutionReason || "No pudimos verificar el resultado todavia."}
                  </p>
                  {href ? (
                    <a className="analysis-link secondary" href={href}>
                      Reanalizar enlace
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
