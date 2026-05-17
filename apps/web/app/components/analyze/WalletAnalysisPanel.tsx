"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createWalletAnalysisJob,
  fetchPolySignalMarketSignals,
  fetchWalletAnalysisCandidates,
  fetchWalletAnalysisJob,
  fetchWalletProfiles,
  followWalletProfileInDemo,
  runWalletAnalysisJobStep,
  saveWalletAnalysisCandidateAsProfile,
  settlePendingPolySignalMarketSignals,
  settlePolySignalMarketSignal,
  updateWalletProfile,
  type PolySignalMarketSignal,
  type PolySignalMarketSignalMetrics,
  type WalletAnalysisCandidate,
  type WalletAnalysisCandidateSortBy,
  type WalletAnalysisConfidence,
  type WalletAnalysisJobRead,
  type WalletAnalysisSortOrder,
  type WalletProfileRead,
  type WalletProfileStatus,
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

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es").format(value);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "sin dato";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "sin dato";
  }
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function metricStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    estimated: "Estimado",
    unavailable: "No disponible",
    verified: "Verificado",
  };
  return labels[status] || status;
}

function formatMetricWithStatus(
  status: string,
  value: unknown,
  formatter: (value: unknown) => string,
): string {
  if (status === "unavailable") {
    return "No disponible";
  }
  const formatted = formatter(value);
  if (formatted === "sin dato") {
    return "No disponible";
  }
  return formatted;
}

function jobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    resolving_market: "Resolviendo mercado",
    discovering_wallets: "Descubriendo wallets",
    analyzing_wallets: "Analizando wallets",
    scoring: "Calculando balanza",
    completed: "Completado",
    partial: "Parcial",
    failed: "Fallido",
    cancelled: "Cancelado",
  };
  return labels[status] || status;
}

function profileStatusLabel(status: WalletProfileStatus): string {
  const labels: Record<WalletProfileStatus, string> = {
    candidate: "Candidata",
    watching: "Observar",
    demo_follow: "Demo follow",
    paused: "Pausada",
    rejected: "Rechazada",
  };
  return labels[status];
}

function signalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_resolution: "Pendiente",
    resolved_hit: "Acertada",
    resolved_miss: "Fallida",
    cancelled: "Cancelada",
    unknown: "No verificable",
    no_clear_signal: "Sin senal clara",
  };
  return labels[status] || status;
}

function summaryMetricLabel(value?: string | number | null): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(parsed > 1 ? parsed / 100 : parsed);
}

function scoreEntries(signal: WalletAnalysisJobRead["signal_summary"]) {
  if (!signal?.outcome_scores_json) {
    return [];
  }
  const entries = Object.entries(signal.outcome_scores_json)
    .map(([label, value]) => ({
      label,
      value: toNumber(value) ?? 0,
    }))
    .filter((entry) => entry.value > 0);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return entries
    .map((entry) => ({
      label: entry.label,
      percent: total > 0 ? entry.value / total : 0,
      raw: entry.value,
    }))
    .sort((left, right) => right.percent - left.percent);
}

function confidenceLabel(confidence?: WalletAnalysisConfidence | null): string {
  const labels: Record<WalletAnalysisConfidence, string> = {
    high: "alta",
    medium: "media",
    low: "baja",
  };
  if (!confidence) {
    return "sin dato";
  }
  return labels[confidence];
}

function confidenceBadgeLabel(confidence?: WalletAnalysisConfidence | null): string {
  const labels: Record<WalletAnalysisConfidence, string> = {
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };
  if (!confidence) {
    return "Sin dato";
  }
  return labels[confidence];
}

function normalizeSideLabel(value?: string | null): string {
  if (!value) {
    return "Sin lado claro";
  }
  const normalized = value.trim();
  if (!normalized) {
    return "Sin lado claro";
  }
  return normalized.toUpperCase() === "YES" || normalized.toUpperCase() === "NO"
    ? normalized.toUpperCase()
    : normalized;
}

function humanizeTechnicalWarning(warning: string): string {
  const normalized = warning.trim().toLowerCase();
  if (!normalized) {
    return "Algunos datos requieren revision tecnica.";
  }
  if (normalized.startsWith("wallet_fetch_failed:")) {
    return "Algunas wallets no devolvieron historial completo.";
  }
  if (normalized.includes("multiple_event_markets_resolved_to_primary_market")) {
    return "El mercado fue normalizado al mercado principal del evento.";
  }
  if (normalized.includes("partial") || normalized.includes("incomplete")) {
    return "Algunos datos son parciales.";
  }
  if (normalized.includes("insufficient_history") || normalized.includes("history")) {
    return "Parte de las wallets no tenia historial suficiente.";
  }
  if (normalized.includes("timeout") || normalized.includes("rate_limit")) {
    return "Algunas consultas tardaron demasiado y devolvieron datos parciales.";
  }
  if (normalized.includes("market_resolved") || normalized.includes("resolved_to_primary")) {
    return "El mercado fue consolidado con su referencia principal.";
  }
  return "Algunos datos requieren revision tecnica.";
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function SignalDisclaimer({ signalCopy }: { signalCopy: string }) {
  return (
    <div className="focus-notice active" role="status">
      <strong>Senal PolySignal</strong>
      <span>{signalCopy}</span>
    </div>
  );
}

export function WalletAnalysisPanel({ marketTitle, normalizedUrl }: WalletAnalysisPanelProps) {
  const [job, setJob] = useState<WalletAnalysisJobRead | null>(null);
  const [candidates, setCandidates] = useState<WalletAnalysisCandidate[]>([]);
  const [profiles, setProfiles] = useState<WalletProfileRead[]>([]);
  const [signals, setSignals] = useState<PolySignalMarketSignal[]>([]);
  const [signalsTotal, setSignalsTotal] = useState(0);
  const [signalMetrics, setSignalMetrics] = useState<PolySignalMarketSignalMetrics | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [stepAutoAdvance, setStepAutoAdvance] = useState(false);
  const [stepInFlight, setStepInFlight] = useState(false);
  const [sortBy, setSortBy] = useState<WalletAnalysisCandidateSortBy>("score");
  const [sortOrder, setSortOrder] = useState<WalletAnalysisSortOrder>("desc");
  const [sideFilter, setSideFilter] = useState<string>("ALL");
  const [confidenceFilter, setConfidenceFilter] = useState<WalletAnalysisConfidence | "ALL">("ALL");
  const [signalStatusFilter, setSignalStatusFilter] = useState<string>("ALL");
  const stepTimerRef = useRef<number | null>(null);

  const profileByWallet = useMemo(() => {
    const map = new Map<string, WalletProfileRead>();
    for (const profile of profiles) {
      map.set(profile.wallet_address.toLowerCase(), profile);
    }
    return map;
  }, [profiles]);

  const scoreSummary = useMemo(() => scoreEntries(job?.signal_summary), [job?.signal_summary]);
  const favoredScore = scoreSummary[0] ?? null;
  const secondaryScore = scoreSummary[1] ?? null;
  const favoredSideLabel = normalizeSideLabel(
    job?.signal_summary?.predicted_side || job?.signal_summary?.predicted_outcome || favoredScore?.label,
  );
  const technicalWarnings = useMemo(
    () => uniqueStrings([...(job?.warnings || []), ...((job?.signal_summary?.warnings_json || []) as string[])]),
    [job?.signal_summary?.warnings_json, job?.warnings],
  );
  const warningSummary = useMemo(
    () => uniqueStrings(technicalWarnings.map((warning) => humanizeTechnicalWarning(warning))).slice(0, 3),
    [technicalWarnings],
  );
  const signalCopy = useMemo(() => {
    if (!job?.signal_summary || !favoredScore) {
      return "Todavia no hay una senal PolySignal persistida para este job.";
    }
    const favored = normalizeSideLabel(favoredScore.label);
    const runnerUp = secondaryScore
      ? `${normalizeSideLabel(secondaryScore.label)} ${formatPercent(secondaryScore.percent)}`
      : "sin contraparte clara";
    return `${favored} domina la balanza con ${formatPercent(favoredScore.percent)} frente a ${runnerUp}. Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.`;
  }, [favoredScore, job?.signal_summary, secondaryScore]);

  useEffect(() => {
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setJob(null);
    setCandidates([]);
    setProfiles([]);
    setSignals([]);
    setSignalsTotal(0);
    setSignalMetrics(null);
    setJobError(null);
    setActionMessage(null);
    setBusy(false);
    setCandidatesLoading(false);
    setProfilesLoading(false);
    setSignalsLoading(false);
    setStepAutoAdvance(false);
    setStepInFlight(false);
    setSortBy("score");
    setSortOrder("desc");
    setSideFilter("ALL");
    setConfidenceFilter("ALL");
    setSignalStatusFilter("ALL");
  }, [normalizedUrl]);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current !== null) {
        window.clearTimeout(stepTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    void fetchWalletProfiles({ limit: 12 })
      .then((result) => {
        if (!cancelled) {
          setProfiles(result.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJobError("No pudimos cargar los perfiles de wallets ahora.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfilesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedUrl]);

  useEffect(() => {
    if (!job?.id || !ACTIVE_JOB_STATUSES.has(job.status)) {
      return;
    }
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (document.hidden) {
        return;
      }
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
      confidence: confidenceFilter === "ALL" ? undefined : confidenceFilter,
      jobId: job.id,
      limit: 20,
      side: sideFilter === "ALL" ? undefined : sideFilter,
      sortBy,
      sortOrder,
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
  }, [confidenceFilter, job?.id, sideFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!job?.id && !job?.market_slug) {
      setSignals([]);
      return;
    }
    let cancelled = false;
    setSignalsLoading(true);
    void fetchPolySignalMarketSignals({
      confidence: undefined,
      jobId: job?.id || undefined,
      limit: 6,
      marketSlug: job?.market_slug || undefined,
      signalStatus: signalStatusFilter === "ALL" ? undefined : (signalStatusFilter as never),
    })
      .then((result) => {
        if (!cancelled) {
          setSignals(result.items);
          setSignalsTotal(result.total);
          setSignalMetrics(result.metrics);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJobError("No pudimos cargar el historial de senales ahora.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSignalsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.market_slug, signalStatusFilter]);

  async function refreshProfiles() {
    const result = await fetchWalletProfiles({ limit: 12 });
    setProfiles(result.items);
  }

  async function refreshSignals(nextJob?: WalletAnalysisJobRead | null) {
    if (!nextJob?.id && !nextJob?.market_slug) {
      setSignals([]);
      setSignalsTotal(0);
      setSignalMetrics(null);
      return;
    }
    const result = await fetchPolySignalMarketSignals({
      jobId: nextJob?.id || undefined,
      limit: 6,
      marketSlug: nextJob?.market_slug || undefined,
      signalStatus: signalStatusFilter === "ALL" ? undefined : (signalStatusFilter as never),
    });
    setSignals(result.items);
    setSignalsTotal(result.total);
    setSignalMetrics(result.metrics);
  }

  async function handleCreateJob() {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const created = await createWalletAnalysisJob(normalizedUrl);
      setJob(created.market);
      setStepAutoAdvance(false);
      await refreshSignals(created.market);
      setActionMessage("Job de analisis profundo creado. Ya puedes ejecutar una pasada limitada.");
    } catch {
      setJobError("No pudimos crear el job de analisis profundo desde este enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function runJobStep(jobId: string, autoAdvance: boolean) {
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (stepInFlight) {
      return;
    }
    setStepInFlight(true);
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const result = await runWalletAnalysisJobStep({
        batchSize: 10,
        historyLimit: 100,
        jobId,
        maxRuntimeSeconds: 12,
        maxWallets: 50,
        maxWalletsDiscovery: 100,
      });
      setJob(result.market);
      await Promise.all([refreshProfiles(), refreshSignals(result.market)]);
      const baseMessage =
        result.run_state === "already_running"
          ? "Ya hay otro lote corto procesandose para este job."
          : result.message;
      setActionMessage(
        result.has_more
          ? `${baseMessage} Quedan mas wallets por procesar en lotes cortos.`
          : baseMessage,
      );
      if (autoAdvance && result.has_more && result.run_state !== "already_running" && !document.hidden) {
        setStepAutoAdvance(true);
        stepTimerRef.current = window.setTimeout(() => {
          void runJobStep(jobId, true);
        }, 1200);
      } else if (autoAdvance && result.has_more && document.hidden) {
        setStepAutoAdvance(false);
        setActionMessage(
          `${baseMessage} Quedan mas wallets por procesar. Reanuda el analisis cuando vuelvas a esta pestana.`,
        );
      } else {
        setStepAutoAdvance(false);
      }
    } catch {
      setStepAutoAdvance(false);
      setJobError("No pudimos ejecutar esta pasada limitada del analisis profundo.");
    } finally {
      setBusy(false);
      setStepInFlight(false);
    }
  }

  async function handleRunStep(autoAdvance: boolean) {
    if (!job?.id) {
      return;
    }
    if (!autoAdvance && stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (!autoAdvance) {
      setStepAutoAdvance(false);
    }
    await runJobStep(job.id, autoAdvance);
  }

  function handlePauseStep() {
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setStepAutoAdvance(false);
    setActionMessage("Avance automatico pausado. Puedes continuar el analisis por lotes cuando quieras.");
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
      await refreshSignals(refreshed);
      setActionMessage("Progreso refrescado.");
    } catch {
      setJobError("No pudimos refrescar este job ahora.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(candidate: WalletAnalysisCandidate) {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      await saveWalletAnalysisCandidateAsProfile(candidate.id);
      await refreshProfiles();
      setActionMessage("Wallet candidata guardada como perfil.");
    } catch {
      setJobError("No pudimos guardar esta wallet candidata como perfil.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileStatus(profileId: string, status: WalletProfileStatus) {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      await updateWalletProfile(profileId, { status });
      await refreshProfiles();
      setActionMessage(`Perfil actualizado a ${profileStatusLabel(status)}.`);
    } catch {
      setJobError("No pudimos actualizar el estado del perfil.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoFollow(profileId: string) {
    const confirmed = window.confirm(
      "Solo se copiaran trades nuevos desde ahora. No se copiara historial anterior. Continuar en modo demo?",
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const result = await followWalletProfileInDemo(profileId);
      await refreshProfiles();
      setActionMessage(result.message);
    } catch {
      setJobError("No pudimos activar este perfil para Copy Trading demo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettleSignal(signalId: string) {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const result = await settlePolySignalMarketSignal(signalId);
      await refreshSignals(job);
      setActionMessage(
        result.changed
          ? `Senal revisada: ${signalStatusLabel(result.signal.signal_status)}.`
          : `Senal revisada sin cambios: ${result.resolution.reason}`,
      );
    } catch {
      setJobError("No pudimos revisar la resolucion de esta senal ahora.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettlePendingSignals() {
    setBusy(true);
    setJobError(null);
    setActionMessage(null);
    try {
      const result = await settlePendingPolySignalMarketSignals({
        jobId: job?.id || undefined,
        limit: 6,
        marketSlug: job?.market_slug || undefined,
      });
      await refreshSignals(job);
      setActionMessage(
        `Revision de pendientes: ${result.checked} revisadas, ${result.resolved_hit} acertadas, ${result.resolved_miss} fallidas, ${result.still_pending} siguen pendientes.`,
      );
    } catch {
      setJobError("No pudimos revisar las senales pendientes ahora.");
    } finally {
      setBusy(false);
    }
  }

  function handleViewProfile(profileId: string) {
    const element = document.getElementById(`wallet-profile-${profileId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section className="dashboard-panel" aria-label="Analisis profundo de wallets">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Analisis profundo de wallets</p>
          <h3>{job?.market_title || marketTitle || "Analisis de wallets del mercado"}</h3>
          <p>
            Este flujo reutiliza el analizador viejo para resolver el link y usa el backend persistido para jobs,
            progreso, candidatas, perfiles y senal historica.
          </p>
        </div>
        <span className="badge muted">{job ? `Job ${jobStatusLabel(job.status)}` : "Sin job"}</span>
      </div>

      <p className="section-note">
        Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.
      </p>

      <div className="watchlist-actions">
        {!job ? (
          <button className="watchlist-button active" disabled={busy} onClick={() => void handleCreateJob()} type="button">
            {busy ? "Creando..." : "Analizar wallets del mercado"}
          </button>
        ) : (
          <>
            <button className="watchlist-button active" disabled={busy} onClick={() => void handleRunStep(true)} type="button">
              {busy
                ? "Procesando lote..."
                : stepAutoAdvance
                  ? "Continuar analisis por lotes"
                  : job.progress.wallets_analyzed > 0
                    ? "Analizar mas wallets"
                    : "Analizar wallets del mercado"}
            </button>
            <button className="watchlist-button" disabled={busy || !stepAutoAdvance} onClick={handlePauseStep} type="button">
              Pausar analisis
            </button>
            <button className="watchlist-button" disabled={busy} onClick={() => void handleRunStep(false)} type="button">
              Procesar siguiente lote
            </button>
            <button className="watchlist-button" disabled={busy} onClick={() => void handleRefreshJob()} type="button">
              Refrescar progreso
            </button>
          </>
        )}
      </div>

      {!job ? (
        <p className="section-note">
          Crea el job profundo desde este link y luego corre una pasada controlada del runner real. No activa Copy Trading
          real ni ejecuta dinero real.
        </p>
      ) : (
        <>
          <div className="wallet-report-summary">
            <div>
              <span>Mercado</span>
              <strong>{job.market_title || "Mercado sin titulo disponible"}</strong>
            </div>
            <div>
              <span>Outcomes</span>
              <strong>{job.outcomes.map((outcome) => outcome.label).join(" / ") || "sin dato"}</strong>
            </div>
            <div>
              <span>Fase actual</span>
              <strong>{jobStatusLabel(job.status)}</strong>
            </div>
          </div>

          <section className="wallet-balance-card" aria-label="Balanza PolySignal">
            <div className="wallet-balance-hero">
              <div>
                <p className="eyebrow">Balanza PolySignal</p>
                <h4>
                  {job.signal_summary
                    ? `Las wallets con historial suficiente favorecen ${favoredSideLabel}.`
                    : "Todavia no hay una balanza PolySignal persistida."}
                </h4>
                <p>
                  {job.signal_summary && favoredScore ? signalCopy : "Ejecuta un lote para construir una lectura estadistica basada en wallets analizadas."}
                </p>
                <p className="wallet-balance-copy">
                  Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.
                </p>
              </div>
              <div className="data-health-notes">
                {job.signal_summary ? (
                  <>
                    <span className="badge external-hint">{favoredSideLabel}</span>
                    <span className="badge">Confianza {confidenceBadgeLabel(job.signal_summary.confidence)}</span>
                    <span className="badge muted">{job.signal_summary.signal_status}</span>
                  </>
                ) : (
                  <span className="badge muted">Sin senal persistida todavia</span>
                )}
              </div>
            </div>

            <div className="wallet-report-summary">
              <div>
                <span>Lado favorecido</span>
                <strong>{job.signal_summary ? favoredSideLabel : "Sin lado claro"}</strong>
              </div>
              <div>
                <span>Porcentaje favorecido</span>
                <strong>{favoredScore ? formatPercent(favoredScore.percent) : "sin dato"}</strong>
              </div>
              <div>
                <span>Porcentaje contrario</span>
                <strong>{secondaryScore ? formatPercent(secondaryScore.percent) : "sin dato"}</strong>
              </div>
              <div>
                <span>Confianza</span>
                <strong>{job.signal_summary ? `Confianza ${confidenceLabel(job.signal_summary.confidence)}` : "sin dato"}</strong>
              </div>
              <div>
                <span>YES score</span>
                <strong>{formatMetric(job.signal_summary?.yes_score)}</strong>
              </div>
              <div>
                <span>NO score</span>
                <strong>{formatMetric(job.signal_summary?.no_score)}</strong>
              </div>
              <div>
                <span>Wallets encontradas</span>
                <strong>{formatCount(job.progress.wallets_found)}</strong>
              </div>
              <div>
                <span>Wallets analizadas</span>
                <strong>{formatCount(job.progress.wallets_analyzed)}</strong>
              </div>
              <div>
                <span>Historial suficiente</span>
                <strong>{formatCount(job.progress.wallets_with_sufficient_history)}</strong>
              </div>
              <div>
                <span>YES wallets</span>
                <strong>{formatCount(job.progress.yes_wallets)}</strong>
              </div>
              <div>
                <span>NO wallets</span>
                <strong>{formatCount(job.progress.no_wallets)}</strong>
              </div>
              <div>
                <span>Candidatas</span>
                <strong>{formatCount(job.candidates_count)}</strong>
              </div>
            </div>
          </section>

          {job.status === "partial" ? (
            <div className="focus-notice active" role="status">
              <strong>Analisis parcial utilizable</strong>
              <span>
                Se analizaron {formatCount(job.progress.wallets_analyzed)} de {formatCount(job.progress.wallets_found)} wallets encontradas.{" "}
                {formatCount(job.progress.wallets_with_sufficient_history)} wallets tenian historial suficiente. La senal se calculo con los datos disponibles.
                Puedes procesar otro lote para ampliar el analisis.
              </span>
            </div>
          ) : null}

          {job.status_detail ? (
            <div className="focus-notice active" role="status">
              <strong>Estado del analisis</strong>
              <span>{job.status_detail}</span>
            </div>
          ) : null}

          {ACTIVE_JOB_STATUSES.has(job.status) || stepAutoAdvance ? (
            <div className="focus-notice active" role="status">
              <strong>Analizando por lotes</strong>
              <span>
                Ultimo lote procesado: {job.progress.current_batch || 0}. La pagina no depende de una request larga:
                puedes continuar el analisis por steps cortos y refrescar el progreso cuando quieras.
              </span>
            </div>
          ) : null}

          <SignalDisclaimer signalCopy="Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas." />

          {warningSummary.length > 0 ? (
            <div className="focus-notice active" role="status">
              <strong>Lectura con datos parciales</strong>
              <span>{warningSummary.join(" ")}</span>
            </div>
          ) : null}

          <details className="wallet-report-drilldown wallet-technical-details">
            <summary>Advertencias tecnicas y detalles del job</summary>
            <div className="wallet-technical-details-body">
              <div className="wallet-report-summary">
                <div>
                  <span>Link</span>
                  <strong>{job.normalized_url}</strong>
                </div>
                <div>
                  <span>Condition ID</span>
                  <strong>{job.condition_id || "sin dato"}</strong>
                </div>
                <div>
                  <span>Market slug</span>
                  <strong>{job.market_slug || "sin dato"}</strong>
                </div>
                <div>
                  <span>Event slug</span>
                  <strong>{job.event_slug || "sin dato"}</strong>
                </div>
                <div>
                  <span>Lote actual</span>
                  <strong>{job.progress.current_batch}</strong>
                </div>
                <div>
                  <span>Estado tecnico</span>
                  <strong>{job.status}</strong>
                </div>
              </div>
              {warningSummary.length > 0 ? (
                <div className="wallet-warning-list">
                  {warningSummary.map((warning) => (
                    <span className="warning-chip" key={warning}>{warning}</span>
                  ))}
                </div>
              ) : null}
              {technicalWarnings.length > 0 ? (
                <div className="wallet-warning-list">
                  {technicalWarnings.map((warning) => (
                    <span className="warning-chip" key={warning}>{warning}</span>
                  ))}
                </div>
              ) : (
                <p className="section-note">No hay advertencias tecnicas adicionales para este job.</p>
              )}
            </div>
          </details>

          <div className="panel-heading" style={{ marginTop: "1rem" }}>
            <div>
              <p className="eyebrow">Wallets candidatas</p>
              <h4>Candidatas por lado</h4>
            </div>
            <div className="watchlist-actions">
              <label className="analyze-secondary-button" style={{ alignItems: "center", display: "inline-flex", gap: "0.5rem" }}>
                <span>Lado</span>
                <select value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}>
                  <option value="ALL">Todos</option>
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </label>
              <label className="analyze-secondary-button" style={{ alignItems: "center", display: "inline-flex", gap: "0.5rem" }}>
                <span>Confianza</span>
                <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as WalletAnalysisConfidence | "ALL")}>
                  <option value="ALL">Todas</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
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
              <label className="analyze-secondary-button" style={{ alignItems: "center", display: "inline-flex", gap: "0.5rem" }}>
                <span>Orden</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as WalletAnalysisSortOrder)}>
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </label>
            </div>
          </div>

          {candidatesLoading ? (
            <p className="section-note">Cargando wallets candidatas...</p>
          ) : candidates.length === 0 ? (
            <p className="section-note">
              Este job aun no tiene candidatas persistidas o la pasada limitada no encontro wallets con datos utiles.
            </p>
          ) : (
            <div className="wallet-report-table" role="list">
              {candidates.map((candidate) => {
                const profile = profileByWallet.get(candidate.wallet_address.toLowerCase());
                return (
                  <div className="wallet-candidate-card" key={candidate.id} role="listitem">
                    <div className="wallet-candidate-header">
                      <div>
                        <strong>{formatShortWallet(candidate.wallet_address)}</strong>
                        <span>{normalizeSideLabel(candidate.side || candidate.outcome || "lado sin confirmar")}</span>
                      </div>
                      <div className="data-health-notes">
                        <span className="badge">Score {formatMetric(candidate.score)}</span>
                        <span className="badge">Confianza {confidenceBadgeLabel(candidate.confidence)}</span>
                      </div>
                    </div>
                    <div className="wallet-report-summary wallet-candidate-metrics">
                      <div>
                        <span>ROI 30d - {metricStatusLabel(candidate.roi_30d_status)}</span>
                        <strong>{formatMetricWithStatus(candidate.roi_30d_status, candidate.roi_30d_value, formatPercent)}</strong>
                      </div>
                      <div>
                        <span>Win rate 30d - {metricStatusLabel(candidate.win_rate_30d_status)}</span>
                        <strong>{formatMetricWithStatus(candidate.win_rate_30d_status, candidate.win_rate_30d_value, formatPercent)}</strong>
                      </div>
                      <div>
                        <span>PnL 30d - {metricStatusLabel(candidate.pnl_30d_status)}</span>
                        <strong>{formatMetricWithStatus(candidate.pnl_30d_status, candidate.pnl_30d_value, formatUsd)}</strong>
                      </div>
                      <div>
                        <span>Trades 30d</span>
                        <strong>{formatCount(candidate.trades_30d)}</strong>
                      </div>
                      <div>
                        <span>Volumen 30d</span>
                        <strong>{candidate.volume_30d == null ? "No disponible" : formatUsd(candidate.volume_30d)}</strong>
                      </div>
                      <div>
                        <span>Mercados 30d</span>
                        <strong>{formatCount(candidate.markets_traded_30d)}</strong>
                      </div>
                    </div>
                    <div className="wallet-report-summary wallet-candidate-notes">
                      <div>
                        <span>Razones</span>
                        <strong>{candidate.reasons_json.slice(0, 3).join(" | ") || "Sin detalle adicional"}</strong>
                      </div>
                      <div>
                        <span>Riesgos</span>
                        <strong>{candidate.risks_json.slice(0, 3).join(" | ") || "Sin riesgos nuevos"}</strong>
                      </div>
                      <div>
                        <span>Perfil</span>
                        <strong>{profile ? profileStatusLabel(profile.status) : "Aun no guardado"}</strong>
                      </div>
                    </div>
                    <div className="watchlist-actions wallet-candidate-actions">
                      {!profile ? (
                        <button className="watchlist-button active" disabled={busy} onClick={() => void handleSaveProfile(candidate)} type="button">
                          Guardar perfil
                        </button>
                      ) : (
                        <>
                          <button className="watchlist-button" disabled={busy} onClick={() => handleViewProfile(profile.id)} type="button">
                            Ver perfil
                          </button>
                          <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "watching")} type="button">
                            Observar
                          </button>
                          <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "rejected")} type="button">
                            Rechazar
                          </button>
                          <button className="watchlist-button active" disabled={busy} onClick={() => void handleDemoFollow(profile.id)} type="button">
                            Seguir en demo
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel-heading" style={{ marginTop: "1rem" }}>
            <div>
              <p className="eyebrow">Wallet Profiles</p>
              <h4>Perfiles guardados</h4>
            </div>
            <span className="badge muted">{profiles.length} perfiles</span>
          </div>

          {profilesLoading ? (
            <p className="section-note">Cargando perfiles guardados...</p>
          ) : profiles.length === 0 ? (
            <p className="section-note">Todavia no hay perfiles guardados desde este flujo.</p>
          ) : (
            <div className="wallet-report-table" role="list">
              {profiles.map((profile) => (
                <div className="wallet-report-row" id={`wallet-profile-${profile.id}`} key={profile.id} role="listitem">
                  <div>
                    <strong>{profile.alias || formatShortWallet(profile.wallet_address)}</strong>
                    <span>{profileStatusLabel(profile.status)}</span>
                  </div>
                  <span>Score {formatMetric(profile.score)}</span>
                  <span>Confianza {profile.confidence}</span>
                  <span>ROI 30d - {formatMetricWithStatus(profile.roi_30d_status, profile.roi_30d_value, formatPercent)} ({metricStatusLabel(profile.roi_30d_status)})</span>
                  <span>Win rate 30d - {formatMetricWithStatus(profile.win_rate_30d_status, profile.win_rate_30d_value, formatPercent)} ({metricStatusLabel(profile.win_rate_30d_status)})</span>
                  <span>PnL 30d - {formatMetricWithStatus(profile.pnl_30d_status, profile.pnl_30d_value, formatUsd)} ({metricStatusLabel(profile.pnl_30d_status)})</span>
                  <span>Trades 30d {profile.trades_30d ?? 0}</span>
                  <span>Volumen {formatUsd(profile.volume_30d)}</span>
                  <span>Ultima actividad {formatDate(profile.last_activity_at)}</span>
                  <span>{profile.discovered_from_market || "mercado no disponible"}</span>
                  <span>Reasons {profile.reasons_json.slice(0, 2).join(" | ") || "sin detalle"}</span>
                  <span>Risks {profile.risks_json.slice(0, 2).join(" | ") || "sin riesgos nuevos"}</span>
                  <div className="watchlist-actions">
                    <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "candidate")} type="button">
                      Candidate
                    </button>
                    <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "watching")} type="button">
                      Observar
                    </button>
                    <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "paused")} type="button">
                      Pausar
                    </button>
                    <button className="watchlist-button" disabled={busy} onClick={() => void handleProfileStatus(profile.id, "rejected")} type="button">
                      Rechazar
                    </button>
                    <button className="watchlist-button active" disabled={busy} onClick={() => void handleDemoFollow(profile.id)} type="button">
                      Seguir en demo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="panel-heading" style={{ marginTop: "1rem" }}>
            <div>
              <p className="eyebrow">Historial de senales</p>
              <h4>Senales PolySignal guardadas</h4>
            </div>
            <span className="badge muted">{signalsTotal} senales</span>
          </div>

          <div className="watchlist-actions">
            <label className="analyze-secondary-button" style={{ alignItems: "center", display: "inline-flex", gap: "0.5rem" }}>
              <span>Estado</span>
              <select value={signalStatusFilter} onChange={(event) => setSignalStatusFilter(event.target.value)}>
                <option value="ALL">Todos</option>
                <option value="pending_resolution">Pendientes</option>
                <option value="resolved_hit">Acertadas</option>
                <option value="resolved_miss">Fallidas</option>
                <option value="cancelled">Canceladas</option>
                <option value="unknown">No verificables</option>
                <option value="no_clear_signal">Sin senal clara</option>
              </select>
            </label>
            <button className="watchlist-button" disabled={busy} onClick={() => void handleSettlePendingSignals()} type="button">
              Revisar pendientes
            </button>
          </div>

          {signalMetrics ? (
            <div className="wallet-report-summary">
              <div>
                <span>Total</span>
                <strong>{signalMetrics.total}</strong>
              </div>
              <div>
                <span>Pendientes</span>
                <strong>{signalMetrics.pending_resolution}</strong>
              </div>
              <div>
                <span>Acertadas</span>
                <strong>{signalMetrics.resolved_hit}</strong>
              </div>
              <div>
                <span>Fallidas</span>
                <strong>{signalMetrics.resolved_miss}</strong>
              </div>
              <div>
                <span>Canceladas</span>
                <strong>{signalMetrics.cancelled}</strong>
              </div>
              <div>
                <span>No verificables</span>
                <strong>{signalMetrics.unknown}</strong>
              </div>
              <div>
                <span>Win rate</span>
                <strong>{summaryMetricLabel(signalMetrics.win_rate)}</strong>
              </div>
              <div>
                <span>Win rate high</span>
                <strong>{summaryMetricLabel(signalMetrics.by_confidence.high?.win_rate)}</strong>
              </div>
              <div>
                <span>Win rate medium</span>
                <strong>{summaryMetricLabel(signalMetrics.by_confidence.medium?.win_rate)}</strong>
              </div>
              <div>
                <span>Win rate low</span>
                <strong>{summaryMetricLabel(signalMetrics.by_confidence.low?.win_rate)}</strong>
              </div>
            </div>
          ) : null}

          {signalsLoading ? (
            <p className="section-note">Cargando senales historicas...</p>
          ) : signals.length === 0 ? (
            <p className="section-note">Todavia no hay senales guardadas para este mercado o job.</p>
          ) : (
            <div className="wallet-report-table" role="list">
              {signals.map((signal) => (
                <div className="wallet-report-row" key={signal.id} role="listitem">
                  <div>
                    <strong>{signal.market_title || signal.market_slug || "Mercado sin titulo disponible"}</strong>
                    <span>{signalStatusLabel(signal.signal_status)}</span>
                  </div>
                  <span>{signal.predicted_side || signal.predicted_outcome || "sin lado claro"}</span>
                  <span>Score {formatPercent(signal.polysignal_score)}</span>
                  <span>Confianza {signal.confidence}</span>
                  <span>Resultado final {signal.final_outcome || "pendiente"}</span>
                  <span>Resuelta {formatDate(signal.resolved_at)}</span>
                  <span>Wallets analizadas {signal.wallets_analyzed ?? 0}</span>
                  <span>Historial suficiente {signal.wallets_with_sufficient_history ?? 0}</span>
                  <span>Creada {formatDate(signal.created_at)}</span>
                  <div className="watchlist-actions">
                    <button className="watchlist-button" disabled={busy} onClick={() => void handleSettleSignal(signal.id)} type="button">
                      Revisar resolucion
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {jobError ? (
        <div className="wallet-warning-list">
          <span className="warning-chip">{jobError}</span>
        </div>
      ) : null}

      {actionMessage ? <p className="section-note">{actionMessage}</p> : null}
    </section>
  );
}
