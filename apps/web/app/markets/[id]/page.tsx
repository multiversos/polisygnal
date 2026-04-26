"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type JsonPayload = Record<string, unknown> | unknown[];

type AnalysisParticipant = {
  name: string;
  role: string;
  logo_url?: string | null;
  image_url?: string | null;
  abbreviation?: string | null;
};

type AnalysisMarket = {
  id: number;
  polymarket_market_id: string;
  event_id: number;
  event_title?: string | null;
  event_category?: string | null;
  question: string;
  slug: string;
  sport_type?: string | null;
  market_type?: string | null;
  evidence_shape?: string | null;
  image_url?: string | null;
  icon_url?: string | null;
  event_image_url?: string | null;
  event_icon_url?: string | null;
  active: boolean;
  closed: boolean;
  end_date?: string | null;
  rules_text?: string | null;
  created_at: string;
  updated_at: string;
};

type AnalysisSnapshot = {
  id: number;
  market_id: number;
  captured_at: string;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  midpoint?: string | number | null;
  last_trade_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
};

type CandidateContext = {
  candidate_score: string | number;
  candidate_reasons: string[];
  warnings: string[];
  research_template_name: string;
  vertical: string;
  sport: string;
  market_shape: string;
  participants: AnalysisParticipant[];
};

type AnalysisPrediction = {
  id: number;
  prediction_family: string;
  research_run_id?: number | null;
  yes_probability: string | number;
  no_probability: string | number;
  confidence_score: string | number;
  edge_signed: string | number;
  edge_magnitude: string | number;
  edge_class: string;
  opportunity: boolean;
  recommendation?: string | null;
  run_at: string;
};

type AnalysisResearchRun = {
  id: number;
  status: string;
  vertical: string;
  subvertical?: string | null;
  market_shape: string;
  research_mode: string;
  model_used?: string | null;
  web_search_used: boolean;
  degraded_mode: boolean;
  confidence_score?: string | number | null;
  total_sources_found: number;
  total_sources_used: number;
  started_at: string;
  finished_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisFinding = {
  id: number;
  research_run_id: number;
  claim: string;
  stance: string;
  factor_type: string;
  evidence_summary: string;
  impact_score: string | number;
  credibility_score: string | number;
  freshness_score: string | number;
  source_name?: string | null;
  citation_url?: string | null;
  published_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisReport = {
  id: number;
  prediction_id?: number | null;
  research_run_id?: number | null;
  thesis: string;
  final_reasoning: string;
  recommendation: string;
  evidence_for: JsonPayload;
  evidence_against: JsonPayload;
  risks: JsonPayload;
  created_at: string;
  metadata_json?: JsonPayload | null;
};

type AnalysisEvidenceItem = {
  id: number;
  provider: string;
  evidence_type: string;
  stance: string;
  strength?: string | number | null;
  confidence?: string | number | null;
  summary: string;
  high_contradiction: boolean;
  source_name?: string | null;
  title?: string | null;
  url?: string | null;
  citation_url?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisExternalSignal = {
  id: number;
  source: string;
  source_ticker?: string | null;
  title?: string | null;
  yes_probability?: string | number | null;
  no_probability?: string | number | null;
  mid_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
  open_interest?: string | number | null;
  source_confidence?: string | number | null;
  match_confidence?: string | number | null;
  match_reason?: string | null;
  warnings?: JsonPayload | null;
  fetched_at: string;
};

type MarketAnalysis = {
  market: AnalysisMarket;
  latest_snapshot?: AnalysisSnapshot | null;
  candidate_context?: CandidateContext | null;
  latest_prediction?: AnalysisPrediction | null;
  prediction_history: AnalysisPrediction[];
  research_runs: AnalysisResearchRun[];
  research_findings: AnalysisFinding[];
  prediction_reports: AnalysisReport[];
  evidence_items: AnalysisEvidenceItem[];
  external_signals: AnalysisExternalSignal[];
  warnings: string[];
};

type EvidenceDisplayItem = {
  id: string;
  stance: string;
  label: string;
  claim: string;
  summary: string;
  sourceName?: string | null;
  citationUrl?: string | null;
  publishedAt?: string | null;
  impact?: string | number | null;
  credibility?: string | number | null;
  freshness?: string | number | null;
  metadata?: JsonPayload | null;
};

type LoadState = {
  analysis: MarketAnalysis | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const marketShapeLabels: Record<string, string> = {
  match_winner: "ganador de partido",
  championship: "campeonato",
  futures: "futuro/temporada",
  player_prop: "prop de jugador",
  team_prop: "prop de equipo",
  race_winner: "ganador de carrera",
  yes_no_generic: "sí/no general",
  other: "otro",
};

const participantRoleLabels: Record<string, string> = {
  yes_side: "lado SÍ",
  no_side: "lado NO",
  participant: "participante",
  unknown: "sin rol claro",
};

const sportLabels: Record<string, string> = {
  nba: "NBA",
  nfl: "NFL",
  soccer: "fútbol",
  horse_racing: "carreras de caballos",
  mlb: "MLB",
  tennis: "tenis",
  mma: "MMA",
  other: "otro",
};

const warningLabels: Record<string, string> = {
  missing_latest_snapshot: "sin snapshot reciente",
  no_evidence_found: "sin evidencia guardada",
  no_external_signals: "sin señales externas",
  no_prediction_found: "sin predicción investigada",
  missing_yes_price: "falta precio SÍ",
  missing_price_data: "faltan datos de precio",
  low_liquidity: "baja liquidez",
  low_volume: "bajo volumen",
  market_inactive_or_closed: "mercado inactivo o cerrado",
  generic_research_template: "template genérico",
};

const reasonLabels: Record<string, string> = {
  market_active_open: "mercado activo",
  valid_latest_snapshot: "precio válido",
  yes_price_in_research_band: "precio SÍ investigable",
  sports_metadata_present: "metadata deportiva",
  supported_sport: "deporte soportado",
  supported_market_shape: "tipo de mercado claro",
  specific_research_template: "template específico",
  high_liquidity: "alta liquidez",
  high_volume: "alto volumen",
  medium_liquidity: "liquidez media",
  medium_volume: "volumen medio",
  future_close_time: "cierre futuro",
  market_type_present: "tipo de mercado disponible",
};

const marketTermTranslations: Record<string, string> = {
  "NBA Eastern Conference Finals": "las Finales de la Conferencia Este de la NBA",
  "NBA Western Conference Finals": "las Finales de la Conferencia Oeste de la NBA",
  "NBA Eastern Conference Champion": "Campeón de la Conferencia Este de la NBA",
  "NBA Western Conference Champion": "Campeón de la Conferencia Oeste de la NBA",
  "Eastern Conference Champion": "Campeón de la Conferencia Este",
  "Western Conference Champion": "Campeón de la Conferencia Oeste",
  "NBA Championship": "el Campeonato de la NBA",
  "NBA Finals": "las Finales de la NBA",
  "NBA Rookie of the Year": "el Novato del Año de la NBA",
  "NBA MVP": "el MVP de la NBA",
  "Rookie of the Year": "el Novato del Año",
  "Super Bowl": "el Super Bowl",
  "World Series": "la Serie Mundial",
  "Champions League": "la Champions League",
  "Kentucky Derby": "el Kentucky Derby",
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
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

function formatProbability(value: unknown): string {
  const number = normalizeProbability(value);
  if (number === null) {
    return "N/D";
  }
  return `${(number * 100).toFixed(1)}%`;
}

function formatCompact(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  return new Intl.NumberFormat("es-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatScore(value: unknown): string {
  const number = toNumber(value);
  return number === null ? "N/D" : number.toFixed(1);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/D";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }
  return date.toLocaleString("es-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeToken(value?: string | null): string {
  return value?.replaceAll("_", " ").replaceAll("-", " ").trim() || "N/D";
}

function stripScoreSuffix(value: string): string {
  return value.split(":")[0].trim();
}

function formatReasonLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return reasonLabels[key] ?? humanizeToken(key);
}

function formatWarningLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return warningLabels[key] ?? humanizeToken(key);
}

function formatSportLabel(value?: string | null): string {
  return value ? sportLabels[value] ?? humanizeToken(value) : "deporte no definido";
}

function formatMarketShapeLabel(value?: string | null): string {
  return value ? marketShapeLabels[value] ?? humanizeToken(value) : "tipo no definido";
}

function formatParticipantRole(value?: string | null): string {
  return value ? participantRoleLabels[value] ?? humanizeToken(value) : "participante";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateCompetitionName(value: string): string {
  const trimmed = value.trim();
  const leadingYear = trimmed.match(/^(\d{4})\s+(.+)$/);
  if (leadingYear) {
    return `${translateCompetitionName(leadingYear[2])} ${leadingYear[1]}`;
  }
  const trailingYear = trimmed.match(/^(.+?)\s+(\d{4})$/);
  if (trailingYear) {
    return `${translateCompetitionName(trailingYear[1])} ${trailingYear[2]}`;
  }
  if (marketTermTranslations[trimmed]) {
    return marketTermTranslations[trimmed];
  }
  return Object.entries(marketTermTranslations)
    .sort(([a], [b]) => b.length - a.length)
    .reduce(
      (current, [english, spanish]) =>
        current.replace(new RegExp(`\\b${escapeRegExp(english)}\\b`, "gi"), spanish),
      trimmed,
    );
}

function ensureSpanishQuestion(value: string): string {
  const trimmed = value.trim().replace(/^¿+/, "").replace(/\?+$/, "");
  return `¿${trimmed}?`;
}

function spanishTeamSubject(teamName: string, hadEnglishThe: boolean): string {
  const cleanName = teamName.trim();
  const lastWord = cleanName.split(/\s+/).at(-1) ?? "";
  return hadEnglishThe || lastWord.endsWith("s") ? `los ${cleanName}` : cleanName;
}

function translateMarketTitleToSpanish(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return trimmed;
  }

  const playerOver = trimmed.match(/^Will\s+(.+?)\s+score\s+over\s+([0-9]+(?:\.[0-9]+)?)\s+points\?$/i);
  if (playerOver) {
    return ensureSpanishQuestion(`${playerOver[1].trim()} anotará más de ${playerOver[2]} puntos`);
  }

  const playerUnder = trimmed.match(/^Will\s+(.+?)\s+score\s+under\s+([0-9]+(?:\.[0-9]+)?)\s+points\?$/i);
  if (playerUnder) {
    return ensureSpanishQuestion(`${playerUnder[1].trim()} anotará menos de ${playerUnder[2]} puntos`);
  }

  const matchWinner = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+beat\s+(the\s+)?(.+?)\?$/i);
  if (matchWinner) {
    const teamA = matchWinner[2].trim();
    const teamB = spanishTeamSubject(matchWinner[4].trim(), Boolean(matchWinner[3]));
    const subject = spanishTeamSubject(teamA, Boolean(matchWinner[1]));
    const verb = subject.startsWith("los ") ? "vencerán" : "vencerá";
    return ensureSpanishQuestion(`${subject[0].toUpperCase()}${subject.slice(1)} ${verb} a ${teamB}`);
  }

  const winMarket = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+win\s+the\s+(.+?)\?$/i);
  if (winMarket) {
    const subject = spanishTeamSubject(winMarket[2].trim(), Boolean(winMarket[1]));
    const verb = subject.startsWith("los ") ? "Ganarán" : "Ganará";
    return ensureSpanishQuestion(`${verb} ${subject} ${translateCompetitionName(winMarket[3])}`);
  }

  return trimmed;
}

function translateMarketSubtitleToSpanish(text?: string | null): string {
  if (!text) {
    return "";
  }
  const trimmed = text.trim();
  const yearNbaChampion = trimmed.match(/^(\d{4})\s+NBA\s+Champion$/i);
  if (yearNbaChampion) {
    return `Campeón de la NBA ${yearNbaChampion[1]}`;
  }
  return translateCompetitionName(trimmed);
}

function getNoProbability(yesValue: unknown, noValue: unknown): number | null {
  const explicitNo = normalizeProbability(noValue);
  if (explicitNo !== null) {
    return explicitNo;
  }
  const yes = normalizeProbability(yesValue);
  return yes === null ? null : Math.max(0, Math.min(1, 1 - yes));
}

function probabilityWidth(yesValue: unknown, noValue: unknown): number {
  const yes = normalizeProbability(yesValue);
  if (yes !== null) {
    return Math.max(0, Math.min(100, yes * 100));
  }
  const no = getNoProbability(yesValue, noValue);
  return no === null ? 50 : Math.max(0, Math.min(100, (1 - no) * 100));
}

function participantInitials(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  return words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words.slice(0, 3).map((word) => word[0].toUpperCase()).join("");
}

function hasMetadataFlag(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasMetadataFlag(item, key));
  }
  const record = value as Record<string, unknown>;
  if (record[key] === true) {
    return true;
  }
  return Object.values(record).some((item) => hasMetadataFlag(item, key));
}

function externalWarnings(value: AnalysisExternalSignal["warnings"]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`);
}

function compareExternalToPolymarket(
  signal: AnalysisExternalSignal,
  snapshot?: AnalysisSnapshot | null,
): { diff: number | null; label: string; tone: string } {
  const external = normalizeProbability(signal.yes_probability ?? signal.mid_price);
  const polymarket = normalizeProbability(snapshot?.yes_price);
  if (external === null || polymarket === null) {
    return { diff: null, label: "Sin comparación", tone: "neutral" };
  }
  const diff = external - polymarket;
  const magnitude = Math.abs(diff);
  if (magnitude >= 0.08) {
    return { diff, label: "Divergencia alta", tone: "high-divergence" };
  }
  if (magnitude >= 0.03) {
    return { diff, label: "Divergente", tone: "divergent" };
  }
  return { diff, label: "Alineado", tone: "aligned" };
}

function evidenceGroup(stance: string): "for" | "against" | "neutral" {
  const normalized = stance.toLowerCase();
  if (["favor", "for", "yes", "support", "supports_yes"].includes(normalized)) {
    return "for";
  }
  if (["against", "contra", "no", "oppose", "opposes_yes"].includes(normalized)) {
    return "against";
  }
  return "neutral";
}

function buildEvidenceDisplayItems(analysis: MarketAnalysis): EvidenceDisplayItem[] {
  const findings = analysis.research_findings.map((finding) => ({
    id: `finding-${finding.id}`,
    stance: finding.stance,
    label: finding.factor_type,
    claim: finding.claim,
    summary: finding.evidence_summary,
    sourceName: finding.source_name,
    citationUrl: finding.citation_url,
    publishedAt: finding.published_at,
    impact: finding.impact_score,
    credibility: finding.credibility_score,
    freshness: finding.freshness_score,
    metadata: finding.metadata_json,
  }));

  const evidence = analysis.evidence_items.map((item) => ({
    id: `evidence-${item.id}`,
    stance: item.stance,
    label: item.evidence_type,
    claim: item.title || item.summary,
    summary: item.summary,
    sourceName: item.source_name || item.provider,
    citationUrl: item.citation_url || item.url,
    publishedAt: item.published_at || item.fetched_at,
    impact: item.strength,
    credibility: item.confidence,
    freshness: null,
    metadata: item.metadata_json,
  }));

  return [...findings, ...evidence];
}

function VisualAvatar({
  name,
  src,
  abbreviation,
}: {
  name: string;
  src?: string | null;
  abbreviation?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        className="candidate-avatar"
        src={src}
        alt={`${name} visual`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="candidate-avatar fallback" aria-hidden="true">
      {abbreviation || participantInitials(name)}
    </span>
  );
}

function PricePanel({ snapshot }: { snapshot?: AnalysisSnapshot | null }) {
  const yes = snapshot?.yes_price;
  const no = getNoProbability(snapshot?.yes_price, snapshot?.no_price);
  const hasPrice = normalizeProbability(yes) !== null || no !== null;

  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Polymarket</span>
          <h2>Precio del mercado</h2>
        </div>
        <span className="timestamp-pill">
          Snapshot {formatDateTime(snapshot?.captured_at)}
        </span>
      </div>
      <div className="market-price-panel analysis-price-panel">
        <div className="price-split">
          <div>
            <span>SÍ</span>
            <strong>{formatProbability(yes)}</strong>
          </div>
          <div>
            <span>NO</span>
            <strong>{formatProbability(no)}</strong>
          </div>
        </div>
        <div
          aria-label={`SÍ ${formatProbability(yes)} y NO ${formatProbability(no)}`}
          className={`probability-bar ${hasPrice ? "" : "neutral"}`}
          role="img"
        >
          <span
            className="probability-bar-yes"
            style={{ width: `${probabilityWidth(snapshot?.yes_price, snapshot?.no_price)}%` }}
          />
          <span className="probability-bar-no" />
        </div>
        <div className="market-depth-row">
          <div>
            <span>Liquidez</span>
            <strong>{formatCompact(snapshot?.liquidity)}</strong>
          </div>
          <div>
            <span>Volumen</span>
            <strong>{formatCompact(snapshot?.volume)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function CandidateContextPanel({ context }: { context?: CandidateContext | null }) {
  if (!context) {
    return (
      <section className="analysis-section">
        <h2>Por qué aparece como candidato</h2>
        <div className="empty-state">No hay contexto de candidato calculado.</div>
      </section>
    );
  }
  const score = Math.max(0, Math.min(100, toNumber(context.candidate_score) ?? 0));
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Selector</span>
          <h2>Por qué aparece como candidato</h2>
        </div>
        <strong className="candidate-score-pill">{formatScore(context.candidate_score)}</strong>
      </div>
      <p className="section-note">
        El puntaje de candidato prioriza mercados para investigar; no es recomendación de apuesta.
      </p>
      <div className="candidate-score-track">
        <span className="candidate-score-fill high" style={{ width: `${score}%` }} />
      </div>
      <div className="analysis-chip-columns">
        <div>
          <h3>Razones</h3>
          <div className="candidate-chip-list">
            {(context.candidate_reasons ?? []).length > 0 ? (
              context.candidate_reasons.map((reason) => (
                <span className="reason-chip" key={reason}>{formatReasonLabel(reason)}</span>
              ))
            ) : (
              <span className="quiet-text">Sin razones disponibles.</span>
            )}
          </div>
        </div>
        <div>
          <h3>Advertencias</h3>
          <div className="candidate-chip-list">
            {(context.warnings ?? []).length > 0 ? (
              context.warnings.map((warning) => (
                <span className="warning-chip" key={warning}>{formatWarningLabel(warning)}</span>
              ))
            ) : (
              <span className="quiet-text">Sin advertencias críticas.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExternalSignalsPanel({
  signals,
  snapshot,
}: {
  signals: AnalysisExternalSignal[];
  snapshot?: AnalysisSnapshot | null;
}) {
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Segunda opinión</span>
          <h2>Señales externas</h2>
        </div>
      </div>
      {signals.length === 0 ? (
        <div className="empty-state">No hay señales externas vinculadas a este mercado todavía.</div>
      ) : (
        <div className="analysis-card-grid">
          {signals.map((signal) => {
            const comparison = compareExternalToPolymarket(signal, snapshot);
            const warnings = externalWarnings(signal.warnings);
            return (
              <article className="external-signal-card" key={signal.id}>
                <div className="external-signal-header">
                  <div>
                    <div className="badge-row">
                      <span className="badge source-badge">{signal.source}</span>
                      <span className="badge muted">{signal.source_ticker || "sin ticker"}</span>
                    </div>
                    <h3>{signal.title || "Señal externa"}</h3>
                    <p>Actualizado {formatDateTime(signal.fetched_at)}</p>
                  </div>
                  <span className={`comparison-badge ${comparison.tone}`}>{comparison.label}</span>
                </div>
                <div className="external-signal-metrics">
                  <div><span>Prob. SÍ</span><strong>{formatProbability(signal.yes_probability)}</strong></div>
                  <div><span>Prob. NO</span><strong>{formatProbability(signal.no_probability)}</strong></div>
                  <div><span>Diferencia</span><strong>{comparison.diff === null ? "N/D" : `${(comparison.diff * 100).toFixed(1)} pts`}</strong></div>
                  <div><span>Diferencial</span><strong>{formatProbability(signal.spread)}</strong></div>
                  <div><span>Conf. fuente</span><strong>{formatProbability(signal.source_confidence)}</strong></div>
                  <div><span>Conf. match</span><strong>{formatProbability(signal.match_confidence)}</strong></div>
                </div>
                {signal.match_reason ? <p className="match-reason">Motivo: {signal.match_reason}</p> : null}
                {warnings.length > 0 ? (
                  <div className="warning-list">
                    {warnings.map((warning) => (
                      <span key={`${signal.id}-${warning}`}>{formatWarningLabel(warning)}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EvidenceCard({ item }: { item: EvidenceDisplayItem }) {
  const mockStructural = hasMetadataFlag(item.metadata, "mock_structural");
  const reviewRequired = hasMetadataFlag(item.metadata, "source_review_required");
  return (
    <article className="evidence-card">
      <div className="evidence-card-header">
        <span className="badge muted">{humanizeToken(item.label)}</span>
        {mockStructural ? <span className="badge muted">Mock / prueba estructural</span> : null}
        {reviewRequired ? <span className="warning-chip">Requiere revisión humana</span> : null}
      </div>
      <h3>{item.claim}</h3>
      <p>{item.summary}</p>
      <div className="evidence-meta-grid">
        <span>Impacto {formatScore(item.impact)}</span>
        <span>Credibilidad {formatScore(item.credibility)}</span>
        <span>Frescura {formatScore(item.freshness)}</span>
        <span>{formatDateTime(item.publishedAt)}</span>
      </div>
      <div className="source-row">
        <strong>{item.sourceName || "Fuente sin nombre"}</strong>
        {item.citationUrl ? (
          <a href={item.citationUrl} target="_blank" rel="noreferrer">
            Abrir fuente
          </a>
        ) : (
          <span>Fuente sin enlace verificable</span>
        )}
      </div>
    </article>
  );
}

function EvidencePanel({ analysis }: { analysis: MarketAnalysis }) {
  const items = buildEvidenceDisplayItems(analysis);
  const groups = {
    for: items.filter((item) => evidenceGroup(item.stance) === "for"),
    against: items.filter((item) => evidenceGroup(item.stance) === "against"),
    neutral: items.filter((item) => evidenceGroup(item.stance) === "neutral"),
  };
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Research</span>
          <h2>Evidencia y fuentes</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">No hay evidencia externa guardada todavía para este mercado.</div>
      ) : (
        <div className="evidence-groups">
          <div>
            <h3>A favor del SÍ</h3>
            {groups.for.length > 0 ? groups.for.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin evidencia a favor.</p>}
          </div>
          <div>
            <h3>En contra del SÍ</h3>
            {groups.against.length > 0 ? groups.against.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin evidencia en contra.</p>}
          </div>
          <div>
            <h3>Riesgos / neutral</h3>
            {groups.neutral.length > 0 ? groups.neutral.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin riesgos o notas neutrales.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function PredictionPanel({ analysis }: { analysis: MarketAnalysis }) {
  const prediction = analysis.latest_prediction;
  const report = analysis.prediction_reports[0];
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Reporte</span>
          <h2>Reporte de predicción</h2>
        </div>
      </div>
      {!prediction && !report ? (
        <div className="empty-state">No hay reporte de predicción investigada todavía.</div>
      ) : (
        <div className="prediction-report-grid">
          {prediction ? (
            <div className="analysis-stat-grid">
              <div><span>Familia</span><strong>{prediction.prediction_family}</strong></div>
              <div><span>Prob. SÍ</span><strong>{formatProbability(prediction.yes_probability)}</strong></div>
              <div><span>Prob. NO</span><strong>{formatProbability(prediction.no_probability)}</strong></div>
              <div><span>Confianza</span><strong>{formatProbability(prediction.confidence_score)}</strong></div>
              <div><span>Diferencia</span><strong>{formatProbability(prediction.edge_signed)}</strong></div>
              <div><span>Magnitud</span><strong>{formatProbability(prediction.edge_magnitude)}</strong></div>
            </div>
          ) : null}
          {report ? (
            <article className="report-card">
              <span className="badge muted">{report.recommendation}</span>
              <h3>Tesis</h3>
              <p>{report.thesis}</p>
              <h3>Razonamiento final</h3>
              <p>{report.final_reasoning}</p>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ResearchRunsPanel({ runs }: { runs: AnalysisResearchRun[] }) {
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Historial</span>
          <h2>Research runs</h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="empty-state">No hay investigaciones guardadas todavía para este mercado.</div>
      ) : (
        <div className="analysis-card-grid">
          {runs.map((run) => (
            <article className="run-card" key={run.id}>
              <div className="badge-row">
                <span className="badge">{run.status}</span>
                <span className="badge muted">{run.research_mode}</span>
                {run.degraded_mode ? <span className="warning-chip">modo degradado</span> : null}
              </div>
              <h3>Run #{run.id}</h3>
              <p>
                Fuentes usadas {run.total_sources_used}/{run.total_sources_found} · web search {run.web_search_used ? "sí" : "no"}
              </p>
              <p className="quiet-text">
                {formatDateTime(run.started_at)} - {formatDateTime(run.finished_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MarketAnalysisPage() {
  const params = useParams<{ id: string }>();
  const marketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [state, setState] = useState<LoadState>({
    analysis: null,
    loading: true,
    error: null,
    notFound: false,
  });

  const loadAnalysis = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null, notFound: false }));
    try {
      const analysis = await fetchJson<MarketAnalysis>(`/markets/${marketId}/analysis`);
      setState({ analysis, loading: false, error: null, notFound: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      setState({
        analysis: null,
        loading: false,
        error: message === "not_found" ? null : "No se pudo cargar el análisis del mercado.",
        notFound: message === "not_found",
      });
    }
  }, [marketId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const analysis = state.analysis;
  const translatedTitle = analysis ? translateMarketTitleToSpanish(analysis.market.question) : "";
  const originalChanged = Boolean(analysis && translatedTitle !== analysis.market.question);
  const participants = analysis?.candidate_context?.participants ?? [];
  const fallbackImage =
    analysis?.market.image_url ||
    analysis?.market.event_image_url ||
    analysis?.market.icon_url ||
    analysis?.market.event_icon_url ||
    null;
  const analysisJsonUrl = `${API_BASE_URL}/markets/${marketId}/analysis`;
  const researchPacketCommand = `python -m app.commands.prepare_codex_research --market-id ${marketId}`;

  const marketBadges = useMemo(() => {
    if (!analysis) {
      return [];
    }
    return [
      analysis.market.active && !analysis.market.closed ? "Activo" : "Inactivo/cerrado",
      formatSportLabel(analysis.candidate_context?.sport || analysis.market.sport_type),
      formatMarketShapeLabel(analysis.candidate_context?.market_shape || analysis.market.evidence_shape),
    ];
  }, [analysis]);

  return (
    <main className="dashboard-shell analysis-shell">
      <header className="analysis-topbar">
        <Link className="text-link" href="/">
          Volver al dashboard
        </Link>
        <div className="topbar-actions">
          <a className="text-link" href={analysisJsonUrl} target="_blank" rel="noreferrer">
            Ver JSON del análisis
          </a>
          <a className="text-link" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>
      </header>

      {state.loading ? (
        <section className="empty-state">Cargando análisis del mercado...</section>
      ) : state.notFound ? (
        <section className="empty-state">
          <strong>Mercado no encontrado</strong>
          <p>No existe un mercado local con ID #{marketId}.</p>
        </section>
      ) : state.error ? (
        <section className="alert-panel" role="status">
          <strong>API desconectada</strong>
          <span>{state.error} Revisa que FastAPI esté corriendo en {API_BASE_URL}.</span>
        </section>
      ) : analysis ? (
        <>
          <section className="analysis-hero">
            <div>
              <p className="eyebrow">Mercado #{analysis.market.id}</p>
              <h1 title={analysis.market.question}>{translatedTitle}</h1>
              {originalChanged ? (
                <p className="original-market-title">Original: {analysis.market.question}</p>
              ) : null}
              <p className="subtitle">
                {translateMarketSubtitleToSpanish(analysis.market.event_title) || analysis.market.slug}
              </p>
              <div className="badge-row">
                {marketBadges.map((badge) => (
                  <span className="badge" key={badge}>{badge}</span>
                ))}
                <span className="badge muted">Cierre {formatDateTime(analysis.market.end_date)}</span>
              </div>
            </div>
            <div className="analysis-participants">
              {participants.length > 0 ? (
                participants.slice(0, 3).map((participant) => (
                  <span className="participant-chip" key={participant.name}>
                    <VisualAvatar
                      name={participant.name}
                      src={participant.logo_url || participant.image_url || fallbackImage}
                      abbreviation={participant.abbreviation}
                    />
                      <span className="participant-copy">
                        <span className="participant-name">{participant.name}</span>
                        <span className="participant-role">{formatParticipantRole(participant.role)}</span>
                      </span>
                    </span>
                ))
              ) : (
                <span className="participant-chip">
                  <VisualAvatar
                    name={analysis.market.question}
                    src={fallbackImage}
                    abbreviation={participantInitials(analysis.market.question)}
                  />
                  <span className="participant-name">Visual del mercado</span>
                </span>
              )}
            </div>
          </section>

          <section className="safety-strip">
            <strong>Solo lectura:</strong>
            <span>
              Esta página no ejecuta research, no consulta Kalshi en vivo, no crea predicciones y no ejecuta apuestas automáticas.
            </span>
          </section>

          <div className="analysis-layout">
            <div className="analysis-main">
              <PricePanel snapshot={analysis.latest_snapshot} />
              <CandidateContextPanel context={analysis.candidate_context} />
              <ExternalSignalsPanel signals={analysis.external_signals} snapshot={analysis.latest_snapshot} />
              <EvidencePanel analysis={analysis} />
              <PredictionPanel analysis={analysis} />
              <ResearchRunsPanel runs={analysis.research_runs} />
            </div>

            <aside className="analysis-side">
              <section className="analysis-section">
                <h2>Qué falta por investigar</h2>
                <div className="candidate-chip-list">
                  {analysis.warnings.length > 0 ? (
                    analysis.warnings.map((warning) => (
                      <span className="warning-chip" key={warning}>{formatWarningLabel(warning)}</span>
                    ))
                  ) : (
                    <span className="reason-chip">Sin faltantes críticos</span>
                  )}
                </div>
              </section>

              <section className="analysis-section">
                <h2>Investigar este mercado</h2>
                <p className="section-note">
                  Para investigar este mercado, genera un Research Packet desde CLI. El packet debe revisarse con Quality Gate antes de ingestar.
                </p>
                <code className="command-block">{researchPacketCommand}</code>
                <p className="warning-text">
                  El packet es para investigación, no para trading ni apuestas automáticas.
                </p>
              </section>

              <section className="analysis-section">
                <h2>Links técnicos</h2>
                <div className="quick-links">
                  <a href={analysisJsonUrl} target="_blank" rel="noreferrer">Endpoint de análisis</a>
                  <a href={`${API_BASE_URL}/markets/${marketId}/external-signals`} target="_blank" rel="noreferrer">Señales externas del mercado</a>
                  <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">Documentación API</a>
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
