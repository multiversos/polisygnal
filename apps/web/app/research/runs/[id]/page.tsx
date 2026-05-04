"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../../../components/MainNavigation";
import {
  fetchResearchRunDetail,
  fetchResearchRunQualityGate,
  type ResearchQualityGate,
  type ResearchRunDetail,
} from "../../../lib/researchRuns";

const statusLabels: Record<string, string> = {
  completed: "Completado",
  failed: "Fallido",
  pending_agent: "Pendiente de agente",
  running: "En curso",
};

const modeLabels: Record<string, string> = {
  cheap_research: "Research económico",
  codex_agent: "Codex Agent",
  local_only: "Solo local",
};

const qualityGateLabels: Record<string, string> = {
  error: "Error",
  not_available: "No disponible",
  validation_pass: "Validacion aprobada",
  validation_rejected: "Validacion rechazada",
  validation_review_required: "Requiere revisión",
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

function formatStatus(status?: string): string {
  return status ? statusLabels[status] ?? status.replaceAll("_", " ") : "N/D";
}

function formatMode(mode?: string): string {
  return mode ? modeLabels[mode] ?? mode.replaceAll("_", " ") : "N/D";
}

function buildIngestCommand(run: ResearchRunDetail): string {
  return run.ingest_command || `python -m app.commands.ingest_codex_research --run-id ${run.id}`;
}

function buildDryRunCommand(run: ResearchRunDetail): string {
  const command = buildIngestCommand(run);
  return command.includes("--dry-run") ? command : `${command} --dry-run`;
}

function formatGateValue(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") {
    return "N/D";
  }
  return String(value);
}

function formatIssueLabel(issue: { code?: string | null; message: string }): string {
  return issue.code ? `${issue.code.replaceAll("_", " ")}: ${issue.message}` : issue.message;
}

function qualityGateHelpText(statusValue?: string): string {
  if (statusValue === "validation_pass") {
    return "La respuesta pasó validación, pero la ingesta sigue siendo una acción separada fuera de esta UI.";
  }
  if (statusValue === "validation_review_required") {
    return "Requiere revisión humana antes de ingestar. No se debe crear predicción sin revisar fuentes y contexto.";
  }
  if (statusValue === "validation_rejected") {
    return "El Quality Gate rechazo la respuesta. No ingestar.";
  }
  if (statusValue === "error") {
    return "El reporte existe pero no pudo leerse de forma segura.";
  }
  return "Ejecuta dry-run para generar un reporte de validacion antes de cualquier ingestion manual.";
}

function PathRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="research-detail-path-row">
      <span>{label}</span>
      <code>{value || "No disponible"}</code>
    </div>
  );
}

export default function ResearchRunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const [run, setRun] = useState<ResearchRunDetail | null>(null);
  const [qualityGate, setQualityGate] = useState<ResearchQualityGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, gate] = await Promise.all([
        fetchResearchRunDetail(runId),
        fetchResearchRunQualityGate(runId),
      ]);
      setRun(detail);
      setQualityGate(gate);
    } catch {
      setError("Detalle de research run en preparacion.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const commands = useMemo(() => {
    if (!run) {
      return { dryRun: "", ingest: "" };
    }
    return {
      dryRun: qualityGate?.dry_run_command || buildDryRunCommand(run),
      ingest: buildIngestCommand(run),
    };
  }, [qualityGate?.dry_run_command, run]);

  const copyText = async (label: string, value: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("No se pudo copiar automáticamente; copia el comando manualmente.");
    }
  };

  return (
    <main className="dashboard-shell research-detail-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Centro de investigacion</p>
          <h1>Research run {run ? `#${run.id}` : ""}</h1>
          <p className="subtitle">
            Detalle operativo del packet. Esta página no ingesta respuestas, no
            llama OpenAI y no crea predicciones.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="analysis-link secondary" href="/research">
            Volver a investigacion
          </Link>
          <button className="theme-toggle" onClick={() => void loadRun()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Quality Gate primero:</strong>
        <span>
          Usa dry-run y revisa el Quality Gate antes de cualquier ingestion manual.
          No hay boton para ingestar desde esta UI.
        </span>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>Run no disponible</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {loading ? (
        <section className="dashboard-panel">
          <div className="empty-state">Cargando research run...</div>
        </section>
      ) : run ? (
        <>
          <section className="metric-grid" aria-label="Resumen del research run">
            <article className="metric-card">
              <span>Estado</span>
              <strong>{formatStatus(run.status)}</strong>
              <p>{formatMode(run.research_mode)}</p>
            </article>
            <article className="metric-card">
              <span>Market</span>
              <strong>#{run.market_id}</strong>
              <p>{run.market?.sport ?? "Sin deporte"}</p>
            </article>
            <article className="metric-card">
              <span>Findings</span>
              <strong>{run.findings_count}</strong>
              <p>{run.has_report ? "Reporte disponible" : "Sin reporte"}</p>
            </article>
            <article className="metric-card">
              <span>Prediccion</span>
              <strong>{run.has_prediction ? "Si" : "No"}</strong>
              <p>{run.prediction_family ?? "Sin familia"}</p>
            </article>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Mercado asociado</p>
                <h2>{run.market?.question ?? `Mercado #${run.market_id}`}</h2>
              </div>
              <Link className="analysis-link" href={`/markets/${run.market_id}`}>
                Ver mercado
              </Link>
            </div>
            <dl className="research-detail-grid">
              <div>
                <dt>Inicio</dt>
                <dd>{formatDate(run.started_at)}</dd>
              </div>
              <div>
                <dt>Fin</dt>
                <dd>{formatDate(run.finished_at)}</dd>
              </div>
              <div>
                <dt>Modo</dt>
                <dd>{formatMode(run.research_mode)}</dd>
              </div>
              <div>
                <dt>Web search</dt>
                <dd>{run.web_search_used ? "Si" : "No"}</dd>
              </div>
            </dl>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Packet</p>
                <h2>Rutas del paquete</h2>
              </div>
              {run.status === "pending_agent" ? (
                <span className="badge status-pending_agent">Pendiente de respuesta</span>
              ) : null}
            </div>
            <div className="research-detail-paths">
              <PathRow label="Request JSON" value={run.request_path} />
              <PathRow label="Packet Markdown" value={run.packet_path} />
              <PathRow label="Response esperada" value={run.expected_response_path} />
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Comandos</p>
                <h2>Quality Gate e ingestion manual</h2>
              </div>
              {copied ? <span className="badge muted">{copied}</span> : null}
            </div>
            <div className="command-list">
              <article className="command-card">
                <span>Dry-run recomendado</span>
                <code>{commands.dryRun}</code>
                <button
                  className="theme-toggle"
                  onClick={() => void copyText("Dry-run copiado", commands.dryRun)}
                  type="button"
                >
                  Copiar comando
                </button>
              </article>
              <article className="command-card warning">
                <span>Ingestion avanzada manual</span>
                <code>{commands.ingest}</code>
                <p>
                  Usa este comando solo despues de revisar el dry-run y el Quality Gate.
                </p>
                <button
                  className="theme-toggle"
                  onClick={() => void copyText("Comando avanzado copiado", commands.ingest)}
                  type="button"
                >
                  Copiar comando
                </button>
              </article>
            </div>
          </section>

          <section className="dashboard-panel quality-gate-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Validacion</p>
                <h2>Quality Gate</h2>
              </div>
              <span className={`badge quality-gate-status ${qualityGate?.status ?? "not_available"}`}>
                {qualityGateLabels[qualityGate?.status ?? "not_available"] ?? "No disponible"}
              </span>
            </div>
            <p className="section-note">
              El Quality Gate valida fuentes, evidencia, limites de ajuste y modo
              mock/real antes de permitir una predicción manualmente ingestada.
            </p>
            <div className="quality-gate-command">
              <span>Comando dry-run</span>
              <code>{qualityGate?.dry_run_command ?? commands.dryRun}</code>
              <button
                className="theme-toggle"
                onClick={() =>
                  void copyText("Dry-run de Quality Gate copiado", qualityGate?.dry_run_command ?? commands.dryRun)
                }
                type="button"
              >
                Copiar dry-run
              </button>
            </div>
            <p className="quality-gate-help">
              {qualityGateHelpText(qualityGate?.status)}
            </p>
            {qualityGate?.report_exists ? (
              <div className="quality-gate-report">
                <dl className="research-detail-grid">
                  <div>
                    <dt>Recommended action</dt>
                    <dd>{formatGateValue(qualityGate.recommended_action)}</dd>
                  </div>
                  <div>
                    <dt>Severity</dt>
                    <dd>{formatGateValue(qualityGate.severity)}</dd>
                  </div>
                  <div>
                    <dt>Source quality</dt>
                    <dd>{formatGateValue(qualityGate.source_quality_score)}</dd>
                  </div>
                  <div>
                    <dt>Evidence balance</dt>
                    <dd>{formatGateValue(qualityGate.evidence_balance_score)}</dd>
                  </div>
                  <div>
                    <dt>Confidence adjusted</dt>
                    <dd>{formatGateValue(qualityGate.confidence_adjusted)}</dd>
                  </div>
                  <div>
                    <dt>Research mode</dt>
                    <dd>{formatGateValue(qualityGate.research_mode)}</dd>
                  </div>
                  <div>
                    <dt>Source review</dt>
                    <dd>
                      {qualityGate.source_review_required === null ||
                      qualityGate.source_review_required === undefined
                        ? "N/D"
                        : qualityGate.source_review_required
                          ? "Si"
                          : "No"}
                    </dd>
                  </div>
                  <div>
                    <dt>Reporte</dt>
                    <dd>{qualityGate.validation_report_name ?? "Disponible"}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="empty-state">
                No hay reporte de validación guardado todavía. Ejecuta dry-run para generarlo.
              </div>
            )}
            {qualityGate?.errors.length ? (
              <div>
                <h3 className="quality-gate-subtitle">Errores</h3>
                <div className="quality-badge-row">
                  {qualityGate.errors.map((issue) => (
                    <span className="quality-badge danger" key={formatIssueLabel(issue)}>
                      {formatIssueLabel(issue)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {qualityGate?.warnings.length ? (
              <div>
                <h3 className="quality-gate-subtitle">Warnings</h3>
                <div className="quality-badge-row">
                  {qualityGate.warnings.map((issue) => (
                    <span className="quality-badge warning" key={formatIssueLabel(issue)}>
                      {formatIssueLabel(issue)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {qualityGate?.instructions.length ? (
              <ul className="quality-gate-list">
                {qualityGate.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            ) : null}
            {qualityGate?.system_warnings.length ? (
              <div className="quality-badge-row">
                {qualityGate.system_warnings.map((warning) => (
                  <span className="quality-badge warning" key={warning}>
                    {warning.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Salidas guardadas</p>
                <h2>Findings, reporte y predicción</h2>
              </div>
            </div>
            <div className="research-output-grid">
              <article>
                <strong>{run.findings_count}</strong>
                <span>Findings</span>
              </article>
              <article>
                <strong>{run.has_report ? "Si" : "No"}</strong>
                <span>Reporte</span>
              </article>
              <article>
                <strong>{run.has_prediction ? "Si" : "No"}</strong>
                <span>Prediccion</span>
              </article>
            </div>
            {run.status === "pending_agent" ? (
              <p className="section-note">
                Pendiente de respuesta del agente. Guarda la response JSON en la ruta
                esperada y valida con dry-run antes de ingestar.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="dashboard-panel">
          <div className="empty-state">No se encontro el research run.</div>
        </section>
      )}
    </main>
  );
}
