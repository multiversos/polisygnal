"use client";

import { useState } from "react";

export type SportSelectorOption = {
  id: string;
  apiValue: string | null;
  label: string;
  icon: string;
  tone: string;
  backendSupported: boolean;
  statusLabel?: string;
  disabledMessage?: string;
};

const comingSoonMessage = "Este deporte estará disponible más adelante.";

export const allSportsOption = {
  id: "all",
  apiValue: null,
  label: "Todos",
  icon: "*",
  tone: "all",
  backendSupported: true,
} as const satisfies SportSelectorOption;

export const primarySportOptions = [
  {
    id: "basketball",
    apiValue: "basketball",
    label: "Baloncesto",
    icon: "B",
    tone: "basketball",
    backendSupported: true,
  },
  {
    id: "nfl",
    apiValue: "nfl",
    label: "NFL",
    icon: "N",
    tone: "nfl",
    backendSupported: true,
  },
  {
    id: "soccer",
    apiValue: "soccer",
    label: "Fútbol",
    icon: "F",
    tone: "soccer",
    backendSupported: true,
  },
  {
    id: "tennis",
    apiValue: "tennis",
    label: "Tenis",
    icon: "T",
    tone: "tennis",
    backendSupported: true,
  },
  {
    id: "baseball",
    apiValue: "baseball",
    label: "Béisbol",
    icon: "BB",
    tone: "baseball",
    backendSupported: true,
  },
  {
    id: "horse_racing",
    apiValue: "horse_racing",
    label: "Carreras de caballos",
    icon: "H",
    tone: "horse-racing",
    backendSupported: true,
  },
] as const satisfies readonly SportSelectorOption[];

export const secondarySportOptions = [
  {
    id: "ufc",
    apiValue: null,
    label: "UFC",
    icon: "U",
    tone: "ufc",
    backendSupported: false,
    statusLabel: "Próximamente",
    disabledMessage: comingSoonMessage,
  },
  {
    id: "cricket",
    apiValue: null,
    label: "Críquet",
    icon: "C",
    tone: "cricket",
    backendSupported: false,
    statusLabel: "Próximamente",
    disabledMessage: comingSoonMessage,
  },
  {
    id: "nhl",
    apiValue: null,
    label: "NHL / Hockey",
    icon: "HK",
    tone: "nhl",
    backendSupported: false,
    statusLabel: "Próximamente",
    disabledMessage: comingSoonMessage,
  },
] as const satisfies readonly SportSelectorOption[];

export const sportsSelectorOptions = [
  allSportsOption,
  ...primarySportOptions,
  ...secondarySportOptions,
] as const satisfies readonly SportSelectorOption[];

const sportAliases: Record<string, string> = {
  nba: "basketball",
  mlb: "baseball",
  baseball: "baseball",
  mma: "ufc",
  ufc: "ufc",
  hockey: "nhl",
};

export function getSportSelectorOption(value: string): SportSelectorOption {
  const normalizedValue = sportAliases[value] ?? value;
  return (
    sportsSelectorOptions.find((option) => option.id === normalizedValue) ??
    allSportsOption
  );
}

export function getSportApiFilter(value: string): string | null {
  const option = getSportSelectorOption(value);
  if (!option.backendSupported || !option.apiValue) {
    return null;
  }
  return option.apiValue;
}

export function isSportBackendEnabled(value: string): boolean {
  return getSportSelectorOption(value).backendSupported;
}

export function matchesSelectedSport(
  sport: string | null | undefined,
  selectedSport: string,
): boolean {
  if (selectedSport === "all") {
    return true;
  }
  const apiValue = getSportSelectorOption(selectedSport).apiValue;
  if (apiValue === "basketball") {
    return sport === "basketball" || sport === "nba";
  }
  if (apiValue === "baseball") {
    return sport === "baseball" || sport === "mlb";
  }
  return sport === apiValue;
}

export function SportsSelectorBar({
  activeLabel = "Activo",
  description = "Selecciona un deporte para filtrar los mercados próximos.",
  kicker = "Filtro principal",
  onSelect,
  selectedSport,
  title = "Deportes en PolySignal",
}: {
  activeLabel?: string;
  description?: string;
  kicker?: string;
  onSelect: (sport: string) => void;
  selectedSport: string;
  title?: string;
}) {
  const activeOption = getSportSelectorOption(selectedSport);
  const primaryOptions = [allSportsOption, ...primarySportOptions];
  const [disabledNotice, setDisabledNotice] = useState<string | null>(null);

  return (
    <section className="sports-selector-panel" aria-label={title}>
      <div className="sports-selector-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="sports-selector-active">
          {activeLabel}: {activeOption.label}
        </span>
      </div>
      <div className="sports-selector-group" role="list">
        {primaryOptions.map((option) => {
          const selected = option.id === selectedSport;
          return (
            <button
              aria-pressed={selected}
              className={`sport-selector-chip tone-${option.tone} ${
                selected ? "selected" : ""
              }`}
              key={option.id}
              onClick={() => onSelect(option.id)}
              type="button"
            >
              <span className="sport-selector-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className="sports-selector-secondary" aria-label="Otros deportes">
        <span>Otros</span>
        <div className="sports-selector-group secondary" role="list">
          {secondarySportOptions.map((option) => (
            <button
              aria-disabled="true"
              className={`sport-selector-chip disabled tone-${option.tone}`}
              key={option.id}
              onClick={() =>
                setDisabledNotice(
                  `${option.label}: ${
                    option.disabledMessage ?? "No disponible todavía."
                  }`,
                )
              }
              title={option.disabledMessage}
              type="button"
            >
              <span className="sport-selector-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span>{option.label}</span>
              <span className="sport-selector-status">{option.statusLabel}</span>
            </button>
          ))}
        </div>
        {disabledNotice ? (
          <p className="sports-selector-disabled-note" role="status">
            {disabledNotice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
