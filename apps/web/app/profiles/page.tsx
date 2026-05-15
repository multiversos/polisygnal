"use client";

import { useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS,
  HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD,
  HIGHLIGHTED_PROFILE_MIN_WIN_RATE,
  getHighlightedProfiles,
  HIGHLIGHTED_PROFILES_STORAGE_EVENT,
  removeHighlightedProfile,
  type HighlightedWalletProfile,
  type HighlightedProfileRefreshStatus,
  updateHighlightedProfile,
} from "../lib/highlightedProfiles";
import {
  fetchPersistentHighlightedProfiles,
  hidePersistentProfile,
  mergePersistentAndLocalProfiles,
  profileMeetsPersistentCriteria,
  syncLocalHighlightedProfilesToBackend,
  upsertPersistentHighlightedProfile,
} from "../lib/persistentHighlightedProfiles";
import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "../lib/polymarketWalletProfile";
import type { WalletPublicMarketHistoryItem } from "../lib/walletIntelligenceTypes";

type ProfileFilter = "all" | "pnl" | "recent" | "win80" | "win90";
type ProfilesStorageMode = "loading" | "local_fallback" | "mixed" | "persistent";

type RefreshWalletResponse = {
  limitations?: string[];
  profile?: {
    avatarUrl?: string | null;
    closedMarkets?: number | null;
    lastUpdatedAt?: string | null;
    losses?: number | null;
    markets?: WalletPublicMarketHistoryItem[];
    name?: string | null;
    observedCapitalUsd?: number | null;
    profileUrl?: string | null;
    proxyWallet?: string | null;
    pseudonym?: string | null;
    realizedPnl?: number | null;
    shortAddress?: string | null;
    source?: string | null;
    unrealizedPnl?: number | null;
    verifiedBadge?: boolean | null;
    walletAddress?: string | null;
    winRate?: number | null;
    wins?: number | null;
    xUsername?: string | null;
  };
  status?: "failed" | "partial" | "unavailable" | "updated";
  warnings?: string[];
};

type BulkRefreshProgress = {
  active: boolean;
  done: number;
  failed: number;
  partial: number;
  total: number;
  updated: number;
};

function formatUsd(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    style: "currency",
  }).format(value);
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value?: string | null): string {
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

function profileName(profile: HighlightedWalletProfile): string {
  return profile.pseudonym || profile.name || profile.shortAddress;
}

function hasPnl(profile: HighlightedWalletProfile): boolean {
  return typeof profile.realizedPnl === "number" || typeof profile.unrealizedPnl === "number";
}

function profileMeetsCurrentCriteria(profile: HighlightedWalletProfile): boolean {
  return (
    profile.winRate >= HIGHLIGHTED_PROFILE_MIN_WIN_RATE &&
    profile.closedMarkets >= HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS &&
    (hasPnl(profile) || (profile.observedCapitalUsd ?? 0) >= HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD)
  );
}

function mergeNumber(previous: number | null | undefined, next: number | null | undefined): number | null | undefined {
  return typeof next === "number" && Number.isFinite(next) ? next : previous;
}

function mergeString(previous: string | null | undefined, next: string | null | undefined): string | null | undefined {
  return typeof next === "string" && next.trim() ? next : previous;
}

function mergeBoolean(previous: boolean | null | undefined, next: boolean | null | undefined): boolean | null | undefined {
  return typeof next === "boolean" ? next : previous;
}

function mergeRefreshedProfile(
  profile: HighlightedWalletProfile,
  refresh: RefreshWalletResponse,
): HighlightedWalletProfile {
  const refreshed = refresh.profile;
  const now = refreshed?.lastUpdatedAt || new Date().toISOString();
  const safeWalletAddress = isPolymarketWalletAddress(refreshed?.walletAddress)
    ? refreshed!.walletAddress!.trim()
    : profile.walletAddress;
  const builtProfileUrl = buildPolymarketWalletProfileUrl(safeWalletAddress);
  const profileUrl =
    (typeof refreshed?.profileUrl === "string" && refreshed.profileUrl === builtProfileUrl
      ? refreshed.profileUrl
      : null) ||
    builtProfileUrl ||
    profile.profileUrl;
  const merged: HighlightedWalletProfile = {
    ...profile,
    avatarUrl: mergeString(profile.avatarUrl, refreshed?.avatarUrl),
    closedMarkets: mergeNumber(profile.closedMarkets, refreshed?.closedMarkets) ?? profile.closedMarkets,
    history: Array.isArray(refreshed?.markets) && refreshed!.markets!.length > 0 ? refreshed!.markets : profile.history,
    lastUpdatedAt: now,
    losses: mergeNumber(profile.losses, refreshed?.losses),
    name: mergeString(profile.name, refreshed?.name),
    observedCapitalUsd: mergeNumber(profile.observedCapitalUsd, refreshed?.observedCapitalUsd),
    profileUrl,
    proxyWallet: mergeString(profile.proxyWallet, refreshed?.proxyWallet),
    pseudonym: mergeString(profile.pseudonym, refreshed?.pseudonym),
    realizedPnl: mergeNumber(profile.realizedPnl, refreshed?.realizedPnl),
    refreshError:
      refresh.status === "failed" || refresh.status === "unavailable"
        ? "No pudimos actualizar este perfil con las fuentes publicas disponibles."
        : null,
    refreshStatus:
      refresh.status === "unavailable" || refresh.status === "failed"
        ? "failed"
        : refresh.status === "partial"
          ? "partial"
          : "updated",
    shortAddress: mergeString(profile.shortAddress, refreshed?.shortAddress) ?? profile.shortAddress,
    source: mergeString(profile.source, refreshed?.source) ?? profile.source,
    sourceLimitations: refresh.limitations ?? profile.sourceLimitations ?? [],
    sourceWarnings: refresh.warnings ?? profile.sourceWarnings ?? [],
    stale: refresh.status !== "updated",
    unrealizedPnl: mergeNumber(profile.unrealizedPnl, refreshed?.unrealizedPnl),
    updatedAt: now,
    verifiedBadge: mergeBoolean(profile.verifiedBadge, refreshed?.verifiedBadge),
    walletAddress: safeWalletAddress,
    winRate: mergeNumber(profile.winRate, refreshed?.winRate) ?? profile.winRate,
    wins: mergeNumber(profile.wins, refreshed?.wins),
    xUsername: mergeString(profile.xUsername, refreshed?.xUsername),
  };
  return {
    ...merged,
    noLongerQualifies: !profileMeetsCurrentCriteria(merged),
  };
}

function refreshStatusCopy(status?: HighlightedProfileRefreshStatus, stale?: boolean): string {
  if (status === "refreshing") {
    return "Actualizando...";
  }
  if (status === "updated") {
    return "Actualizado";
  }
  if (status === "partial") {
    return "Actualizacion parcial";
  }
  if (status === "failed") {
    return "No se pudo actualizar";
  }
  return stale ? "Datos locales" : "Listo para actualizar";
}

function syncStatusCopy(profile: HighlightedWalletProfile): string {
  if (profile.syncStatus === "synced") {
    return "Sincronizado";
  }
  if (profile.syncStatus === "pending") {
    return "Pendiente de sincronizar";
  }
  if (profile.syncStatus === "failed") {
    return "Error al sincronizar";
  }
  return "Solo local";
}

function matchesFilter(profile: HighlightedWalletProfile, filter: ProfileFilter): boolean {
  if (filter === "win80") {
    return profile.winRate >= 0.8;
  }
  if (filter === "win90") {
    return profile.winRate >= 0.9;
  }
  if (filter === "pnl") {
    return hasPnl(profile);
  }
  if (filter === "recent") {
    const lastSeen = new Date(profile.lastSeenAt).getTime();
    return Number.isFinite(lastSeen) && Date.now() - lastSeen < 1000 * 60 * 60 * 24 * 14;
  }
  return true;
}

export default function ProfilesPage() {
  const [bulkProgress, setBulkProgress] = useState<BulkRefreshProgress | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const [profiles, setProfiles] = useState<HighlightedWalletProfile[]>([]);
  const [query, setQuery] = useState("");
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [storageMode, setStorageMode] = useState<ProfilesStorageMode>("loading");
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async (migrateLocal: boolean) => {
      const localProfiles = getHighlightedProfiles();
      if (!cancelled) {
        setProfiles(localProfiles);
      }
      try {
        const persistent = await fetchPersistentHighlightedProfiles();
        if (cancelled) {
          return;
        }
        const merged = mergePersistentAndLocalProfiles(persistent.profiles, localProfiles);
        setProfiles(merged);
        setStorageMode(localProfiles.length > 0 && persistent.profiles.length > 0 ? "mixed" : "persistent");
        setSyncNotice(null);

        if (migrateLocal) {
          const pending = localProfiles.filter(
            (profile) => profile.syncStatus !== "synced" && profileMeetsPersistentCriteria(profile),
          );
          if (pending.length > 0) {
            setSyncNotice("Sincronizando perfiles locales con el registro persistente.");
            const result = await syncLocalHighlightedProfilesToBackend(pending);
            if (cancelled) {
              return;
            }
            try {
              const refreshed = await fetchPersistentHighlightedProfiles();
              setProfiles(mergePersistentAndLocalProfiles(refreshed.profiles, getHighlightedProfiles()));
            } catch {
              setProfiles(getHighlightedProfiles());
            }
            setStorageMode(result.failed > 0 ? "mixed" : "persistent");
            setSyncNotice(
              result.failed > 0
                ? "Algunos perfiles siguen solo en este navegador; se reintentara mas tarde."
                : "Perfiles locales sincronizados con el registro persistente.",
            );
          }
        }
      } catch {
        if (cancelled) {
          return;
        }
        setProfiles(localProfiles);
        setStorageMode("local_fallback");
        setSyncNotice("Mostrando perfiles guardados en este navegador por ahora.");
      }
    };

    void loadProfiles(true);
    const syncProfiles = () => void loadProfiles(false);
    window.addEventListener(HIGHLIGHTED_PROFILES_STORAGE_EVENT, syncProfiles);
    return () => {
      cancelled = true;
      window.removeEventListener(HIGHLIGHTED_PROFILES_STORAGE_EVENT, syncProfiles);
    };
  }, []);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return profiles
      .filter((profile) => matchesFilter(profile, filter))
      .filter((profile) => {
        if (!normalizedQuery) {
          return true;
        }
        return [
          profile.walletAddress,
          profile.shortAddress,
          profile.pseudonym,
          profile.name,
          profile.xUsername,
          ...profile.sourceMarkets.map((market) => market.sourceMarketTitle || market.sourceMarketSlug || ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [filter, profiles, query]);

  const averageWinRate =
    profiles.length > 0 ? profiles.reduce((sum, profile) => sum + profile.winRate, 0) / profiles.length : null;
  const observedCapital = profiles.reduce((sum, profile) => sum + (profile.observedCapitalUsd ?? 0), 0);
  const pnlProfiles = profiles.filter(hasPnl).length;

  const copyWallet = async (profile: HighlightedWalletProfile) => {
    try {
      await navigator.clipboard.writeText(profile.walletAddress);
      setCopiedId(profile.id);
      window.setTimeout(() => setCopiedId((current) => (current === profile.id ? null : current)), 1400);
    } catch {
      setCopiedId(null);
    }
  };

  const removeProfile = (profile: HighlightedWalletProfile) => {
    if (profile.syncStatus === "synced" || profile.persistentId) {
      hidePersistentProfile(profile.walletAddress);
      removeHighlightedProfile(profile.walletAddress);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setSyncNotice("Perfil oculto en este navegador. El registro global no se borra sin auth/admin.");
      return;
    }
    setProfiles(removeHighlightedProfile(profile.walletAddress));
  };

  const refreshProfile = async (profile: HighlightedWalletProfile): Promise<HighlightedProfileRefreshStatus> => {
    if (!isPolymarketWalletAddress(profile.walletAddress)) {
      const failedProfile: HighlightedWalletProfile = {
        ...profile,
        refreshError: "Wallet invalida para actualizar.",
        refreshStatus: "failed",
        sourceWarnings: ["No se actualizo porque la wallet guardada no tiene formato publico valido."],
        stale: true,
      };
      setProfiles(updateHighlightedProfile(failedProfile));
      return "failed";
    }

    setRefreshingIds((current) => new Set([...current, profile.id]));
    try {
      const response = await fetch("/api/profiles/refresh-wallet", {
        body: JSON.stringify({ walletAddress: profile.walletAddress }),
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
      });
      const text = await response.text();
      if (!response.ok || text.length > 128_000) {
        throw new Error("refresh_failed");
      }
      const payload = JSON.parse(text) as RefreshWalletResponse;
      const merged = mergeRefreshedProfile(profile, payload);
      setProfiles(updateHighlightedProfile(merged));
      if (merged.refreshStatus !== "failed") {
        try {
          const persistent = await upsertPersistentHighlightedProfile(merged);
          const syncedProfile: HighlightedWalletProfile = {
            ...merged,
            persistentId: persistent.persistentId,
            syncError: null,
            syncStatus: "synced",
            syncedAt: persistent.syncedAt ?? new Date().toISOString(),
          };
          setProfiles(updateHighlightedProfile(syncedProfile));
        } catch {
          const pendingProfile: HighlightedWalletProfile = {
            ...merged,
            syncError: "Actualizacion guardada localmente; sincronizacion persistente pendiente.",
            syncStatus: "failed",
          };
          setProfiles(updateHighlightedProfile(pendingProfile));
        }
      }
      return merged.refreshStatus ?? "partial";
    } catch {
      const failedProfile: HighlightedWalletProfile = {
        ...profile,
        lastUpdatedAt: new Date().toISOString(),
        refreshError: "No pudimos actualizar este perfil con las fuentes publicas disponibles.",
        refreshStatus: "failed",
        sourceWarnings: [
          "La actualizacion fallo o la fuente publica no respondio. Se conserva el perfil local guardado.",
        ],
        stale: true,
        syncStatus: profile.syncStatus,
      };
      setProfiles(updateHighlightedProfile(failedProfile));
      return "failed";
    } finally {
      setRefreshingIds((current) => {
        const next = new Set(current);
        next.delete(profile.id);
        return next;
      });
    }
  };

  const refreshAllProfiles = async () => {
    if (profiles.length === 0 || bulkProgress?.active) {
      return;
    }
    const targets = [...profiles];
    const progress: BulkRefreshProgress = {
      active: true,
      done: 0,
      failed: 0,
      partial: 0,
      total: targets.length,
      updated: 0,
    };
    setBulkProgress(progress);
    for (const profile of targets) {
      const status = await refreshProfile(profile);
      progress.done += 1;
      if (status === "updated") {
        progress.updated += 1;
      } else if (status === "partial") {
        progress.partial += 1;
      } else {
        progress.failed += 1;
      }
      setBulkProgress({ ...progress });
    }
    setBulkProgress({ ...progress, active: false });
  };

  return (
    <main className="dashboard-shell profiles-page">
      <MainNavigation />
      <section className="profiles-hero">
        <div>
          <p className="eyebrow">Wallet Intelligence</p>
          <h1>Perfiles</h1>
          <p>Billeteras publicas detectadas con historial fuerte en Polymarket.</p>
          <p>No es recomendacion de copy-trading; solo organiza datos publicos verificables.</p>
        </div>
        <div className="profiles-hero-actions">
          <span className="badge external-hint">
            {storageMode === "persistent"
              ? "Registro persistente"
              : storageMode === "mixed"
                ? "Sincronizacion parcial"
                : storageMode === "local_fallback"
                  ? "Guardado local por ahora"
                  : "Cargando perfiles"}
          </span>
          <button
            disabled={profiles.length === 0 || Boolean(bulkProgress?.active)}
            onClick={() => void refreshAllProfiles()}
            type="button"
          >
            {bulkProgress?.active ? "Actualizando todos..." : "Actualizar todos"}
          </button>
        </div>
      </section>

      {syncNotice ? (
        <section className="profiles-refresh-status" aria-live="polite">
          <strong>{syncNotice}</strong>
          <span>
            Sin auth, quitar un perfil del registro persistente lo oculta solo en este navegador.
          </span>
        </section>
      ) : null}

      {bulkProgress ? (
        <section className="profiles-refresh-status" aria-live="polite">
          {bulkProgress.active ? (
            <strong>Actualizando {bulkProgress.done + 1 > bulkProgress.total ? bulkProgress.total : bulkProgress.done + 1} de {bulkProgress.total}</strong>
          ) : (
            <strong>Actualizacion terminada</strong>
          )}
          <span>
            {bulkProgress.updated} actualizados, {bulkProgress.partial} parciales, {bulkProgress.failed} fallidos.
          </span>
        </section>
      ) : null}

      <section className="profiles-kpis" aria-label="Resumen de perfiles">
        <div><span>Perfiles guardados</span><strong>{profiles.length}</strong></div>
        <div><span>Promedio win rate</span><strong>{formatPercent(averageWinRate)}</strong></div>
        <div><span>Capital observado total</span><strong>{formatUsd(observedCapital || null)}</strong></div>
        <div><span>Con PnL real</span><strong>{pnlProfiles}</strong></div>
      </section>

      <section className="profiles-controls" aria-label="Filtros de perfiles">
        {[
          ["all", "Todos"],
          ["win80", "winRate >= 80%"],
          ["win90", "winRate >= 90%"],
          ["pnl", "Con PnL"],
          ["recent", "Actividad reciente"],
        ].map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value as ProfileFilter)}
            type="button"
          >
            {label}
          </button>
        ))}
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar wallet, nombre o mercado"
          type="search"
          value={query}
        />
      </section>

      {filteredProfiles.length > 0 ? (
        <section className="profiles-list" aria-label="Perfiles destacados">
          {filteredProfiles.map((profile) => {
            const latestMarket = profile.sourceMarkets[profile.sourceMarkets.length - 1];
            const isRefreshing = refreshingIds.has(profile.id);
            const canRefresh = isPolymarketWalletAddress(profile.walletAddress);
            const refreshStatus = isRefreshing ? "refreshing" : profile.refreshStatus;
            return (
              <article className="profile-card" key={profile.id}>
                <div className="profile-card-heading">
                  <span className="profile-avatar" aria-hidden="true">
                    {profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : profileName(profile).slice(0, 1)}
                  </span>
                  <div>
                    <strong>{profileName(profile)}</strong>
                    <span>{profile.walletAddress}</span>
                  </div>
                  <div className="profile-card-status">
                    <span className={profile.noLongerQualifies ? "badge muted" : "badge external-hint"}>
                      {profile.noLongerQualifies ? "Ya no cumple criterio" : "Perfil destacado"}
                    </span>
                    <span className="badge muted">{refreshStatusCopy(refreshStatus, profile.stale)}</span>
                    <span className="badge muted">{syncStatusCopy(profile)}</span>
                  </div>
                </div>

                <div className="profile-card-grid">
                  <div><span>Win rate real</span><strong>{formatPercent(profile.winRate)}</strong></div>
                  <div><span>Mercados cerrados</span><strong>{formatNumber(profile.closedMarkets)}</strong></div>
                  <div><span>Wins/Losses</span><strong>{profile.wins ?? "No disponible"} / {profile.losses ?? "No disponible"}</strong></div>
                  <div><span>PnL real</span><strong>{formatUsd(profile.realizedPnl ?? profile.unrealizedPnl)}</strong></div>
                  <div><span>Capital observado</span><strong>{formatUsd(profile.observedCapitalUsd)}</strong></div>
                  <div><span>Ultimo mercado visto</span><strong>{latestMarket?.sourceMarketTitle || latestMarket?.sourceMarketSlug || "No disponible"}</strong></div>
                  <div><span>Ultima actualizacion</span><strong>{formatDate(profile.lastUpdatedAt ?? profile.updatedAt)}</strong></div>
                </div>

                <div className="profile-card-actions">
                  <a href={profile.profileUrl} rel="noopener noreferrer" target="_blank">Ver perfil en Polymarket</a>
                  <button
                    disabled={!canRefresh || isRefreshing}
                    onClick={() => void refreshProfile(profile)}
                    type="button"
                  >
                    {isRefreshing ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button onClick={() => copyWallet(profile)} type="button">
                    {copiedId === profile.id ? "Wallet copiada" : "Copiar wallet"}
                  </button>
                  <button onClick={() => removeProfile(profile)} type="button">
                    {profile.syncStatus === "synced" || profile.persistentId ? "Ocultar en este navegador" : "Quitar perfil"}
                  </button>
                </div>
                {!canRefresh ? (
                  <p className="profile-warning">Esta wallet no tiene formato publico valido para actualizar.</p>
                ) : null}
                {profile.refreshError ? (
                  <p className="profile-warning">{profile.refreshError}</p>
                ) : null}

                <details className="profile-card-details">
                  <summary>Ver detalle</summary>
                  <div className="profile-detail-section">
                    <strong>Auditoria de actualizacion</strong>
                    <p>Ultima actualizacion: {formatDate(profile.lastUpdatedAt ?? profile.updatedAt)}</p>
                    <p>Estado: {refreshStatusCopy(profile.refreshStatus, profile.stale)}</p>
                    <p>Sincronizacion: {syncStatusCopy(profile)}</p>
                    <p>Fuente: {profile.source || "Fuente publica no especificada"}</p>
                    {profile.syncError ? (
                      <p>{profile.syncError}</p>
                    ) : null}
                    {profile.stale ? (
                      <p>Algunos datos pueden venir de localStorage porque la fuente publica no devolvio todo en la ultima consulta.</p>
                    ) : null}
                    {(profile.sourceWarnings ?? []).length > 0 ? (
                      <p>Warnings: {profile.sourceWarnings!.slice(0, 3).join(" | ")}</p>
                    ) : null}
                    {(profile.sourceLimitations ?? []).length > 0 ? (
                      <p>Limitaciones: {profile.sourceLimitations!.slice(0, 3).join(" | ")}</p>
                    ) : null}
                  </div>
                  <div className="profile-detail-section">
                    <strong>Mercados donde fue detectado por PolySignal</strong>
                    {profile.sourceMarkets.length > 0 ? (
                      profile.sourceMarkets.map((market) => (
                        <p key={`${market.sourceMarketUrl || market.sourceMarketSlug || market.detectedAt}`}>
                          {market.sourceMarketTitle || market.sourceMarketSlug || "Mercado no disponible"} · {formatDate(market.detectedAt)}
                          {market.sourceMarketUrl ? (
                            <>
                              {" "}
                              <a href={market.sourceMarketUrl} rel="noopener noreferrer" target="_blank">Abrir mercado</a>
                            </>
                          ) : null}
                        </p>
                      ))
                    ) : (
                      <p>No hay mercados relacionados guardados.</p>
                    )}
                  </div>
                  <div className="profile-detail-section">
                    <strong>Historial publico disponible</strong>
                    {profile.history && profile.history.length > 0 ? (
                      profile.history.slice(0, 10).map((history, index) => (
                        <p key={`${history.conditionId || history.marketTitle || "history"}-${index}`}>
                          {history.marketTitle || history.marketSlug || "Mercado no disponible"} · {history.result} · PnL {formatUsd(history.realizedPnl)}
                        </p>
                      ))
                    ) : (
                      <p>Historial no disponible desde la fuente publica actual.</p>
                    )}
                  </div>
                  <p className="profile-warning">Historial pasado no garantiza resultados futuros.</p>
                  <p className="profile-warning">No es recomendacion de copy-trading.</p>
                </details>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="profiles-empty">
          <strong>No hay perfiles destacados guardados todavia.</strong>
          <p>
            Los perfiles destacados apareceran cuando analices mercados con wallets publicas que cumplan los criterios.
            PolySignal solo guardara wallets con winRate real, al menos 50 mercados cerrados y PnL real o capital
            observado relevante.
          </p>
          <p>
            Perfiles v2 usa un registro persistente de datos publicos y conserva localStorage como respaldo si la
            sincronizacion no esta disponible o quedan perfiles pendientes.
          </p>
        </section>
      )}
    </main>
  );
}
