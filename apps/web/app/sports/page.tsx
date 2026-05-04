"use client";

import Link from "next/link";

import { MainNavigation } from "../components/MainNavigation";
import {
  primarySportOptions,
  secondarySportOptions,
} from "../components/SportsSelectorBar";

const sportDescriptions: Record<string, string> = {
  basketball: "Partidos de baloncesto con la liga como metadata separada.",
  nfl: "Partidos NFL y mercados cercanos de ganador del juego.",
  soccer: "Fútbol global: clubes, ligas y cruces próximos.",
  tennis: "Cruces de tenis ATP/WTA y torneos principales.",
  baseball: "Béisbol y mercados de ganador de partido.",
  horse_racing: "Carreras de caballos y mercados de ganador de carrera.",
  ufc: "UFC/MMA se activará cuando el pipeline tenga soporte operativo.",
  cricket: "Críquet se mantiene visible como categoría futura.",
  nhl: "Hockey/NHL queda pausado hasta activar datos dedicados.",
};

export default function SportsIndexPage() {
  return (
    <main className="dashboard-shell sports-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Deportes</p>
          <h1>Deportes en PolySignal</h1>
          <p className="subtitle">
            Vista por deporte de mercados próximos. En esta etapa priorizamos
            partidos de los próximos 7 días y ganador/perdedor del partido.
          </p>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          Estas páginas organizan mercados ya sincronizados. No crean datos,
          research, predicciones, órdenes ni apuestas.
        </span>
      </section>

      <section className="sports-index-section" aria-label="Deportes principales">
        <div className="panel-heading">
          <div>
            <h2>Deportes principales</h2>
            <p>Activos para navegación, filtros y llamadas controladas al backend.</p>
          </div>
        </div>
        <div className="sports-index-grid">
          {primarySportOptions.map((sport) => (
          <article className={`sport-overview-card tone-${sport.tone}`} key={sport.id}>
            <span className="sport-overview-icon" aria-hidden="true">
              {sport.icon}
            </span>
            <div>
              <h2>{sport.label}</h2>
              <p>{sportDescriptions[sport.id] ?? "Mercados deportivos próximos."}</p>
            </div>
            <Link className="analysis-link" href={`/sports/${sport.id}`}>
              Ver deporte
            </Link>
          </article>
          ))}
        </div>
      </section>

      <section className="sports-index-section" aria-label="Otros deportes">
        <div className="panel-heading">
          <div>
            <h2>Otros</h2>
          <p>Visibles como roadmap, sin carga de datos ni llamadas al backend.</p>
          </div>
        </div>
        <div className="sports-index-grid secondary">
          {secondarySportOptions.map((sport) => (
            <article
              className={`sport-overview-card disabled tone-${sport.tone}`}
              key={sport.id}
            >
              <span className="sport-overview-icon" aria-hidden="true">
                {sport.icon}
              </span>
              <div>
                <h2>{sport.label}</h2>
                <p>{sportDescriptions[sport.id] ?? sport.disabledMessage}</p>
              </div>
              <span className="badge muted">{sport.statusLabel}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
