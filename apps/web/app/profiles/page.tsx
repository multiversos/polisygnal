"use client";

import { useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  getHighlightedProfiles,
  HIGHLIGHTED_PROFILES_STORAGE_EVENT,
  removeHighlightedProfile,
  type HighlightedWalletProfile,
} from "../lib/highlightedProfiles";

type ProfileFilter = "all" | "pnl" | "recent" | "win80" | "win90";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const [profiles, setProfiles] = useState<HighlightedWalletProfile[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const syncProfiles = () => setProfiles(getHighlightedProfiles());
    syncProfiles();
    window.addEventListener(HIGHLIGHTED_PROFILES_STORAGE_EVENT, syncProfiles);
    return () => window.removeEventListener(HIGHLIGHTED_PROFILES_STORAGE_EVENT, syncProfiles);
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
    setProfiles(removeHighlightedProfile(profile.walletAddress));
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
        <span className="badge external-hint">localStorage v1</span>
      </section>

      <section className="profiles-kpis" aria-label="Resumen de perfiles">
        <div><span>Perfiles guardados</span><strong>{profiles.length}</strong></div>
        <div><span>Win rate promedio</span><strong>{formatPercent(averageWinRate)}</strong></div>
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
                  <span className="badge external-hint">Perfil destacado</span>
                </div>

                <div className="profile-card-grid">
                  <div><span>Win rate real</span><strong>{formatPercent(profile.winRate)}</strong></div>
                  <div><span>Mercados cerrados</span><strong>{formatNumber(profile.closedMarkets)}</strong></div>
                  <div><span>Wins/Losses</span><strong>{profile.wins ?? "No disponible"} / {profile.losses ?? "No disponible"}</strong></div>
                  <div><span>PnL real</span><strong>{formatUsd(profile.realizedPnl ?? profile.unrealizedPnl)}</strong></div>
                  <div><span>Capital observado</span><strong>{formatUsd(profile.observedCapitalUsd)}</strong></div>
                  <div><span>Ultimo mercado visto</span><strong>{latestMarket?.sourceMarketTitle || latestMarket?.sourceMarketSlug || "No disponible"}</strong></div>
                </div>

                <div className="profile-card-actions">
                  <a href={profile.profileUrl} rel="noopener noreferrer" target="_blank">Ver perfil en Polymarket</a>
                  <button onClick={() => copyWallet(profile)} type="button">
                    {copiedId === profile.id ? "Wallet copiada" : "Copiar wallet"}
                  </button>
                  <button onClick={() => removeProfile(profile)} type="button">Quitar perfil</button>
                </div>

                <details className="profile-card-details">
                  <summary>Ver detalle</summary>
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
            Analiza un mercado con Wallet Intelligence. PolySignal solo guardara wallets con winRate real,
            al menos 50 mercados cerrados y PnL real o capital observado relevante.
          </p>
        </section>
      )}
    </main>
  );
}
