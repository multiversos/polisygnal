"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createWalletAnalysisJob,
  fetchWalletAnalysisCandidates,
  fetchWalletAnalysisJob,
  runWalletAnalysisJobOnce,
  saveWalletAnalysisCandidateAsProfile,
  type WalletAnalysisCandidate,
  type WalletAnalysisCandidateSortBy,
  type WalletAnalysisJobRead,
} from "../../lib/walletAnalysis";

type WalletAnalysisPanelProps = {
  marketTitle?: string | null;
  normalizedUrl: string;
};

const ACTIVE_JOB_STATUSES = new Set([
  "resolving_market",
  "discovering_wallets",
  "analyzing_wallets",
  "scoring",
]);

function formatShortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
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

function formatMetric(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 1,
  }).format(parsed);
}

function formatUsd(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: parsed >= 100 ? 0 : 2,
  }).format(parsed);
}

function formatPercent(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return new Intl.NumberFormat("es", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(normalized);
}

function metricLabel(candidate: WalletAnalysisCandidate, field: "roi" | "win_rate" | "pnl"): string {
  if (field === "roi") {
    if (candidate.roi_30d_status === "unavailable") {
      return "ROI 30d no disponible";
    }
    return `ROI 30d ${formatPercent(candidate.roi_30d_value)} (${candidate.roi_30d_status})`;
  }
  if (field === "win_rate") {
    if (candidate.win_rate_30d_status === "unavailable") {
      return "Win rate 30d no disponible";
    }
    return `Win rate 30d ${formatPercent(candidate.win_rate_30d_value)} (${candidate.win_rate_30d_status})`;
  }
  if (candidate.pnl_30d_status === "unavailable") {
    return "PnL 30d no disponible";
  }
  return `PnL 30d ${formatUsd(candidate.pnl_30d_value)} (${candidate.pnl_30d_status})`;
}

export function WalletAnalysisPanel({ marketTitle, normalizedUrl }: WalletAnalysisPanelProps) {
  const [job, setJob] = useState<WalletAnalysisJobRead | null>(null);
  const [candidates, setCandidates] = useState<WalletAnalysisCandidate[]>([]);
  const [jobError, setJobError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [savedCandidateIds, setSavedCandidateIds] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<WalletAnalysisCandidateSortBy>("score");

  useEffect(() => {
    setJob(null);
    setCandidates([]);
    setJobError(null);
    setActionMessage(null);
    setBusy(false);
    setCandidatesLoading(false);
    setSavedCandidateIds(new Set());
    setSortBy("score");
  }, [normalizedUrl]);

  useEffect(() => {
    if (!job?.id || !ACTIVE_JOB_STATUSES.has(job.status)) {
      return;
    }
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const nextJob = await fetchWalletAnalysisJob(job.id);
        if (!cancelled) {
          setJob(nextJob);
        }
      } catch {
        if (!cancelled) {
          setJobError("No pudimos refrescar el progreso del analisis profundo ahora.");
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job?.id) {
      return;
    }
    let cancelled = false;
    setCandidatesLoading(true);
    void fetchWalletAnalysisCandidates({
      jobId: job.id,
      limit: 12,
      sortBy,
      sortOrder: "desc",
    })
      .then((result) => {
        if (!cancelled) {
          setCandidates(result.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJobError("No pudimos cargar las wallets candidatas ahora.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCandidatesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, sortBy]);

  const signalCopy = useMemo(() => {
    if (!job?.signal_summary) {
      return "Todavia no hay una senal PolySignal persistida para este job.";
    }
    const score = formatPercent(job.signal_summary.polysignal_score);
    const side = job.signal_summary.predicted_side || job.signal_summary.predicted_outcome || "sin lado dominante";
    return `${side} ${score}. Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.`;
  }, [job?.signal_summary]);

  async function handleCreateJob() {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const created = await createWalletAnalysisJob(normalizedUrl);
      setJob(created.market);
      setActionMessage("Job de analisis profundo creado. Aun no corrio discovery.");
    } catch {
      setJobError("No pudimos crear el job de analisis profundo desde este enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunOnce() {
    if (!job?.id) {
      return;
    }
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const result = await runWalletAnalysisJobOnce({
        jobId: job.id,
        maxWallets: 50,
        maxWalletsDiscovery: 100,
        batchSize: 20,
        historyLimit: 100,
      });
      setJob(result.market);
      setActionMessage(result.message);
    } catch {
      setJobError("No pudimos ejecutar esta pasada limitada del analisis profundo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshJob() {
    if (!job?.id) {
      return;
    }
    setBusy(true);
    setJobError(null);
    try {
      const refreshed = await fetchWalletAnalysisJob(job.id);
      setJob(refreshed);
      setActionMessage("Progreso refrescado.");
    } catch {
      setJobError("No pudimos refrescar este job ahora.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(candidateId: string) {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      await saveWalletAnalysisCandidateAsProfile(candidateId);
      setSavedCandidateIds((current) => new Set(current).add(candidateId));
      setActionMessage("Wallet candidata guardada como perfil.");
    } catch {
      setJobError("No pudimos guardar esta wallet candidata como perfil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-panel" aria-label="Analisis profundo de wallets">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Analisis profundo de wallets</p>
          <h3>{marketTitle || "Analisis de wallets del mercado"}</h3>
          <p>
            Reutiliza el analizador viejo para resolver el link y luego corre una pasada limitada del runner real por lotes.
          </p>
        </div>
        <span className="badge muted">
          {job ? `Job ${job.status}` : "Sin job"}
        </span>
      </div>

      <p className="section-note">
        Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.
      </p>

      <div className="watchlist-actions">
        {!job ? (
          <button className="watchlist-button active" disabled={busy} onClick={() => void handleCreateJob()} type="button">
            {busy ? "Creando..." : "Crear job profundo"}
          </button>
        ) : (
          <>
            <button className="watchlist-button active" disabled={busy} onClick={() => void handleRunOnce()} type="button">
              {busy ? "Ejecutando..." : "Ejecutar analisis limitado"}
            </button>
            <button className="watchlist-button" disabled={busy} onClick={() => void handleRefreshJob()} type="button">
              Refrescar progreso
            </button>
          </>
        )}
      </div>

      {job ? (
        <>
          <div className="wallet-report-summary">
            <div>
              <span>Status</span>
              <strong>{job.status}</strong>
            </div>
            <div>
              <span>Wallets encontradas</span>
              <strong>{job.progress.wallets_found}</strong>
            </div>
            <div>
              <span>Wallets analizadas</span>
              <strong>{job.progress.wallets_analyzed}</strong>
            </div>
            <div>
              <span>Historial suficiente</span>
              <strong>{job.progress.wallets_with_sufficient_history}</strong>
            </div>
            <div>
              <span>YES</span>
              <strong>{job.progress.yes_wallets}</strong>
            </div>
            <div>
              <span>NO</span>
              <strong>{job.progress.no_wallets}</strong>
            </div>
          </div>

          <div className="data-health-notes">
            <span className="badge">Batch actual {job.progress.current_batch}</span>
            <span className="badge muted">Candidates {job.candidates_count}</span>
            {job.signal_summary ? (
              <span className="badge external-hint">Senal {job.signal_summary.signal_status}</span>
            ) : null}
          </div>

          <div className="wallet-report-summary">
            <div>
              <span>Condition ID</span>
              <strong>{job.condition_id || "sin dato"}</strong>
            </div>
            <div>
              <span>Outcomes</span>
              <strong>{job.outcomes.map((outcome) => outcome.side || outcome.label).join(" / ") || "sin dato"}</strong>
            </div>
          </div>

          <div className="focus-notice active" role="status">
            <strong>Senal PolySignal</strong>
            <span>{signalCopy}</span>
          </div>

          {job.warnings.length > 0 ? (
            <div className="wallet-warning-list">
              {job.warnings.slice(0, 6).map((warning) => (
                <span className="warning-chip" key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}

          <div className="panel-heading" style={{ marginTop: "1rem" }}>
            <div>
              <p className="eyebrow">Wallets candidatas</p>
              <h4>Candidatas principales</h4>
            </div>
            <label className="analyze-secondary-button" style={{ alignItems: "center", display: "inline-flex", gap: "0.5rem" }}>
              <span>Ordenar</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as WalletAnalysisCandidateSortBy)}>
                <option value="score">Score</option>
                <option value="volume_30d">Volumen 30d</option>
                <option value="win_rate_30d">Win rate 30d</option>
                <option value="pnl_30d">PnL 30d</option>
                <option value="created_at">Mas recientes</option>
              </select>
            </label>
          </div>

          {candidatesLoading ? (
            <p className="section-note">Cargando wallets candidatas...</p>
          ) : candidates.length === 0 ? (
            <p className="section-note">
              Este job aun no tiene candidatas persistidas o la pasada limitada no encontro wallets con datos utiles.
            </p>
          ) : (
            <div className="wallet-report-table" role="list">
              {candidates.map((candidate) => (
                <div className="wallet-report-row" key={candidate.id} role="listitem">
                  <div>
                    <strong>{formatShortWallet(candidate.wallet_address)}</strong>
                    <span>{candidate.side || candidate.outcome || "lado sin confirmar"}</span>
                  </div>
                  <span>Score {formatMetric(candidate.score)}</span>
                  <span>Volumen {formatUsd(candidate.volume_30d)}</span>
                  <span>{metricLabel(candidate, "win_rate")}</span>
                  <span>{metricLabel(candidate, "roi")}</span>
                  <span>{metricLabel(candidate, "pnl")}</span>
                  <span>Confianza {candidate.confidence}</span>
                  <button
                    className={`watchlist-button ${savedCandidateIds.has(candidate.id) ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => void handleSaveProfile(candidate.id)}
                    type="button"
                  >
                    {savedCandidateIds.has(candidate.id) ? "Perfil guardado" : "Guardar perfil"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="section-note">
          Crea el job profundo desde este mismo link y luego corre una pasada controlada del runner real. No activa copy trading ni ejecuta nada en dinero real.
        </p>
      )}

      {jobError ? (
        <div className="wallet-warning-list">
          <span className="warning-chip">{jobError}</span>
        </div>
      ) : null}

      {actionMessage ? (
        <p className="section-note">{actionMessage}</p>
      ) : null}
    </section>
  );
}
