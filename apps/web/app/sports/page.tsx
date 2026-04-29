"use client";

import Link from "next/link";

import { MainNavigation } from "../components/MainNavigation";
import {
  sportsSelectorOptions,
  type SportSelectorOption,
} from "../components/SportsSelectorBar";

const visibleSports = [
  "nba",
  "nfl",
  "soccer",
  "mma",
  "tennis",
  "cricket",
  "mlb",
  "nhl",
];

const sportDescriptions: Record<string, string> = {
  nba: "Partidos de baloncesto NBA con enfoque en ganador/perdedor.",
  nfl: "Partidos NFL y mercados cercanos de ganador del juego.",
  soccer: "Futbol global: clubes, ligas y cruces proximos.",
  mma: "Eventos UFC/MMA cercanos con mercados de ganador de pelea.",
  tennis: "Cruces de tenis ATP/WTA y torneos principales.",
  cricket: "Partidos de cricket cercanos, T20, ODI o ligas.",
  mlb: "Beisbol MLB y mercados de ganador de partido.",
  nhl: "Hockey NHL y mercados de ganador de partido.",
};

function getVisibleSportOptions(): SportSelectorOption[] {
  return visibleSports.reduce<SportSelectorOption[]>((items, id) => {
    const option = sportsSelectorOptions.find((sport) => sport.id === id);
    if (option) {
      items.push(option);
    }
    return items;
  }, []);
}

export default function SportsIndexPage() {
  const sports = getVisibleSportOptions();

  return (
    <main className="dashboard-shell sports-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Deportes</p>
          <h1>Deportes en PolySignal</h1>
          <p className="subtitle">
            Vista por deporte de mercados proximos. En esta etapa priorizamos
            partidos de los proximos 7 dias y ganador/perdedor del partido.
          </p>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          Estas paginas organizan mercados ya sincronizados. No crean datos,
          research, predicciones, ordenes ni apuestas.
        </span>
      </section>

      <section className="sports-index-grid" aria-label="Deportes disponibles">
        {sports.map((sport) => (
          <article className={`sport-overview-card tone-${sport.tone}`} key={sport.id}>
            <span className="sport-overview-icon" aria-hidden="true">
              {sport.icon}
            </span>
            <div>
              <h2>{sport.label}</h2>
              <p>{sportDescriptions[sport.id] ?? "Mercados deportivos proximos."}</p>
            </div>
            <Link className="analysis-link" href={`/sports/${sport.id}`}>
              Ver deporte
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
