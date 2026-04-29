"use client";

import Link from "next/link";

import { MainNavigation } from "../../components/MainNavigation";

const checklistSteps = [
  {
    title: "1. Elegir mercado próximo",
    body: "Usar próximos 7 días, match_winner, deporte claro y evitar futuros, props o mercados ambiguos.",
    links: [{ label: "Dashboard", href: "/" }, { label: "Deportes", href: "/sports" }],
  },
  {
    title: "2. Revisar calidad de datos",
    body: "Confirmar snapshots, precios SÍ/NO, close_time y frescura antes de confiar en cualquier score.",
    links: [{ label: "Salud de datos", href: "/data-health" }],
  },
  {
    title: "3. Generar Research Packet",
    body: "Desde /markets/{id}, crear el packet solo con una acción explícita del usuario.",
    links: [{ label: "Investigación", href: "/research" }],
  },
  {
    title: "4. Ejecutar Quality Gate dry-run",
    body: "Primero usar dry-run. Si queda review_required o reject, no ingestar.",
    code: "python -m app.commands.ingest_codex_research --run-id <RUN_ID> --dry-run",
  },
  {
    title: "5. Ingestar solo si pasa",
    body: "Solo continuar si la respuesta es real_web, tiene fuentes verificables y Quality Gate recomienda ingest.",
  },
  {
    title: "6. Revisar mercado",
    body: "Comprobar evidencia, reporte, PolySignal Score, timeline y estado del run en la UI.",
    links: [{ label: "Centro de investigación", href: "/research" }],
  },
  {
    title: "7. Registrar decisión y status",
    body: "Actualizar watchlist, workflow e historial de decisiones sin lenguaje de apuesta ni montos.",
    links: [{ label: "Workflow", href: "/workflow" }, { label: "Decisiones", href: "/decisions" }],
  },
  {
    title: "8. Registrar outcome más adelante",
    body: "Cuando exista resultado real verificado, registrarlo manualmente para backtesting.",
    links: [{ label: "Backtesting", href: "/backtesting" }],
  },
];

const safetyRules = [
  "No usar OpenAI API ni OPENAI_API_KEY.",
  "No ejecutar research automático ni ingestar responses automáticamente.",
  "No crear predicciones automáticas.",
  "No ejecutar trading, órdenes ni acciones con dinero.",
  "No inventar fuentes, precios, mercados ni evidencia.",
  "No commitear logs, packets, responses ni validation reports.",
];

const usefulCommands = [
  "GET /research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=20",
  "GET /research/upcoming-sports/data-quality?days=7&limit=50",
  "GET /data-health/snapshot-gaps?days=7&limit=50",
  "POST /markets/{market_id}/research-packet",
  "python -m app.commands.inspect_snapshot_gaps --days 7 --limit 50",
];

export default function E2ETrialPage() {
  return (
    <main className="dashboard-shell trial-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Trial E2E de investigación</h1>
          <p className="subtitle">
            Checklist manual para probar el flujo completo sin ejecutar investigación
            automática, predicciones automáticas ni trading.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="text-link" href="/research">
            Ver investigación
          </Link>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Seguro por diseño:</strong>
        <span>
          Esta página solo guía el proceso. No llama APIs externas, no genera packets
          por sí sola y no ingesta respuestas.
        </span>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Flujo operativo</p>
            <h2>Checklist del trial</h2>
          </div>
          <span className="badge muted">{checklistSteps.length} pasos</span>
        </div>
        <div className="trial-step-grid">
          {checklistSteps.map((step) => (
            <article className="trial-step-card" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.code ? <code className="command-block">{step.code}</code> : null}
              {step.links ? (
                <div className="quick-links">
                  {step.links.map((link) => (
                    <Link href={link.href} key={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comandos</p>
            <h2>Referencias útiles</h2>
          </div>
        </div>
        <div className="command-list">
          {usefulCommands.map((command) => (
            <code className="command-block" key={command}>
              {command}
            </code>
          ))}
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Límites</p>
            <h2>Reglas de seguridad</h2>
          </div>
        </div>
        <div className="data-health-notes">
          {safetyRules.map((rule) => (
            <span className="warning-chip" key={rule}>
              {rule}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
