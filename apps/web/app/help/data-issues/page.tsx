"use client";

import Link from "next/link";

import { MainNavigation } from "../../components/MainNavigation";

const playbookSections = [
  {
    title: "PolySignal Score pendiente",
    cause: "Suele faltar snapshot, precio SÍ/NO, señal externa o predicción guardada.",
    action: "Diagnosticar con analysis, data-quality y snapshot-gaps. No inventar probabilidades.",
  },
  {
    title: "Sin snapshot",
    cause: "El mercado existe localmente, pero no hay captura de precios.",
    action: "Usar inspect_snapshot_gaps y marcar waiting_for_data o review_required.",
  },
  {
    title: "Sin precio SÍ/NO",
    cause: "El snapshot está incompleto o el mercado tiene datos parciales.",
    action: "Mantener score pendiente/preliminar y priorizar mercados con precios reales.",
  },
  {
    title: "Mercado stale",
    cause: "close_time pasado, snapshot viejo, mercado cerrado o posible desalineación temporal.",
    action: "Revisar manualmente, no usar para predicción previa y actualizar workflow.",
  },
  {
    title: "Quality Gate review_required",
    cause: "Mock estructural, fuentes débiles, balance insuficiente o revisión de fuente requerida.",
    action: "No ingestar. Revisar warnings y repetir solo con fuentes reales verificables.",
  },
  {
    title: "Señal Kalshi sin vínculo",
    cause: "Título distinto, match_confidence bajo o mercado no sincronizado localmente.",
    action: "Revisar en coincidencias. No vincular si el match es ambiguo.",
  },
  {
    title: "sport=other",
    cause: "Falta señal deportiva suficiente o patrón de clasificación conservador.",
    action: "Mejorar patrones si hay evidencia clara; dejar other si sigue ambiguo.",
  },
  {
    title: "Futuros pausados",
    cause: "El mercado es future/championship y está fuera del foco de próximos 7 días.",
    action: "Mantener soporte, mostrar badge y dejar para análisis posterior.",
  },
];

const commands = [
  "GET /markets/{market_id}/analysis",
  "GET /research/upcoming-sports/data-quality?days=7&limit=50",
  "GET /data-health/snapshot-gaps?days=7&limit=50",
  "GET /research/runs/{run_id}/quality-gate",
  "python -m app.commands.inspect_snapshot_gaps --days 7 --limit 50",
];

export default function DataIssuesHelpPage() {
  return (
    <main className="dashboard-shell help-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Ayuda operativa</p>
          <h1>Resolver problemas de datos</h1>
          <p className="subtitle">
            Guía para entender scores pendientes, snapshots faltantes, mercados stale
            y Quality Gate en revisión. No es recomendación de apuesta.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="text-link" href="/data-health">
            Volver a salud de datos
          </Link>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Principio clave:</strong>
        <span>
          PolySignal no inventa probabilidades, precios, mercados ni fuentes. Si faltan
          datos mínimos, el estado correcto es pendiente o requiere revisión.
        </span>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Playbook</p>
            <h2>Problemas frecuentes</h2>
          </div>
          <span className="badge muted">{playbookSections.length} casos</span>
        </div>
        <div className="help-card-grid">
          {playbookSections.map((section) => (
            <article className="help-card" key={section.title}>
              <h3>{section.title}</h3>
              <p>
                <strong>Causa probable:</strong> {section.cause}
              </p>
              <p>
                <strong>Acción:</strong> {section.action}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Diagnóstico</p>
            <h2>Endpoints y comandos útiles</h2>
          </div>
        </div>
        <div className="command-list">
          {commands.map((command) => (
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
            <h2>Qué no hacer</h2>
          </div>
        </div>
        <div className="data-health-notes">
          <span className="warning-chip">No crear snapshots o precios falsos.</span>
          <span className="warning-chip">No ingestar mock_structural como research real.</span>
          <span className="warning-chip">No crear predicciones automáticas.</span>
          <span className="warning-chip">No ejecutar trading ni órdenes.</span>
          <span className="warning-chip">No hacer sync masivo desde esta revisión.</span>
        </div>
      </section>
    </main>
  );
}
