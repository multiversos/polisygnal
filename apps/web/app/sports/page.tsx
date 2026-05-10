"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  primarySportOptions,
  secondarySportOptions,
  SportIcon,
} from "../components/SportsSelectorBar";
import { formatLastUpdated, useAutoRefresh } from "../lib/useAutoRefresh";

const sportDescriptions: Record<string, string> = {
  basketball: "Partidos de baloncesto con la liga como metadata separada.",
  nfl: "Partidos NFL y mercados cercanos de ganador del juego.",
  soccer: "Fútbol global: clubes, ligas y cruces próximos.",
  tennis: "Cruces de tenis ATP/WTA y torneos principales.",
  baseball: "Béisbol y mercados de ganador de partido.",
  horse_racing: "Carreras de caballos y mercados de ganador de carrera.",
  ufc: "UFC/MMA estará disponible más adelante.",
  cricket: "Críquet estará disponible más adelante.",
  nhl: "Hockey/NHL estará disponible más adelante.",
};

export default function SportsIndexPage() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());
  const refreshSportsView = useCallback(() => {
    setUpdatedAt(new Date());
  }, []);
  useAutoRefresh(refreshSportsView);

  return (
    <main className="dashboard-shell sports-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Deportes</p>
          <h1>Deportes en PolySignal</h1>
          <p className="subtitle">
            Vista sencilla por deporte. Hoy priorizamos partidos cercanos y
            mercados con precios activos.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="refresh-button" onClick={refreshSportsView} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          Estas páginas organizan mercados disponibles para revisión manual. No
          crean apuestas ni ejecutan operaciones automáticas.
        </span>
      </section>

      <section className="sports-index-section" aria-label="Deportes principales">
        <div className="panel-heading">
          <div>
            <h2>Deportes principales</h2>
            <p>Disponibles para revisar mercados deportivos.</p>
          </div>
        </div>
        <div className="sports-index-grid">
          {primarySportOptions.map((sport) => (
          <article className={`sport-overview-card tone-${sport.tone}`} key={sport.id}>
            <span className="sport-overview-icon" aria-hidden="true">
              <SportIcon name={sport.icon} />
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
          <p>Visibles como próximos deportes, todavía sin mercados.</p>
          </div>
        </div>
        <div className="sports-index-grid secondary">
          {secondarySportOptions.map((sport) => (
            <article
              className={`sport-overview-card disabled tone-${sport.tone}`}
              key={sport.id}
            >
              <span className="sport-overview-icon" aria-hidden="true">
                <SportIcon name={sport.icon} />
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
