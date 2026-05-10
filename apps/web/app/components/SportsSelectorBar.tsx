"use client";

import { useState } from "react";

export type SportIconName =
  | "all"
  | "basketball"
  | "nfl"
  | "soccer"
  | "tennis"
  | "baseball"
  | "horse_racing"
  | "ufc"
  | "cricket"
  | "nhl";

export type SportSelectorOption = {
  id: string;
  apiValue: string | null;
  label: string;
  icon: SportIconName;
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
  icon: "all",
  tone: "all",
  backendSupported: true,
} as const satisfies SportSelectorOption;

export const primarySportOptions = [
  {
    id: "basketball",
    apiValue: "basketball",
    label: "Baloncesto",
    icon: "basketball",
    tone: "basketball",
    backendSupported: true,
  },
  {
    id: "nfl",
    apiValue: "nfl",
    label: "NFL",
    icon: "nfl",
    tone: "nfl",
    backendSupported: true,
  },
  {
    id: "soccer",
    apiValue: "soccer",
    label: "Fútbol",
    icon: "soccer",
    tone: "soccer",
    backendSupported: true,
  },
  {
    id: "tennis",
    apiValue: "tennis",
    label: "Tenis",
    icon: "tennis",
    tone: "tennis",
    backendSupported: true,
  },
  {
    id: "baseball",
    apiValue: "baseball",
    label: "Béisbol",
    icon: "baseball",
    tone: "baseball",
    backendSupported: true,
  },
  {
    id: "horse_racing",
    apiValue: "horse_racing",
    label: "Carreras de caballos",
    icon: "horse_racing",
    tone: "horse-racing",
    backendSupported: true,
  },
] as const satisfies readonly SportSelectorOption[];

export const secondarySportOptions = [
  {
    id: "ufc",
    apiValue: null,
    label: "UFC",
    icon: "ufc",
    tone: "ufc",
    backendSupported: false,
    statusLabel: "Próximamente",
    disabledMessage: comingSoonMessage,
  },
  {
    id: "cricket",
    apiValue: null,
    label: "Críquet",
    icon: "cricket",
    tone: "cricket",
    backendSupported: false,
    statusLabel: "Próximamente",
    disabledMessage: comingSoonMessage,
  },
  {
    id: "nhl",
    apiValue: null,
    label: "NHL / Hockey",
    icon: "nhl",
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
                <SportIcon name={option.icon} />
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
                <SportIcon name={option.icon} />
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

export function SportIcon({ name }: { name: SportIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "sport-icon-svg",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (name) {
    case "all":
      return (
        <svg {...commonProps}>
          <path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z" />
        </svg>
      );
    case "basketball":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4.8 9.2c3.8 1.5 9.2 1.5 14.4 0M4.8 14.8c3.8-1.5 9.2-1.5 14.4 0M12 4c-1.7 2.8-1.7 13.2 0 16M8 5.1c2.6 4.1 2.6 9.7 0 13.8M16 5.1c-2.6 4.1-2.6 9.7 0 13.8" />
        </svg>
      );
    case "nfl":
      return (
        <svg {...commonProps}>
          <path d="M5.5 16.6c-2.4-2.4-.4-7.4 3.5-10.1s8.7-3.1 10.5-.9.1 7-3.8 10-7.8 3.4-10.2 1Z" />
          <path d="m8.2 15.8 7.7-7.7M11 13l3 3M12.6 11.4l3 3M14.2 9.8l3 3" />
        </svg>
      );
    case "soccer":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="m12 8.2 3.1 2.2-1.2 3.6h-3.8l-1.2-3.6L12 8.2Z" />
          <path d="m12 4 1.2 4.2M19.4 9.4l-4.3 1M16.8 18.1 13.9 14M7.2 18.1l2.9-4.1M4.6 9.4l4.3 1" />
        </svg>
      );
    case "tennis":
      return (
        <svg {...commonProps}>
          <circle cx="9.5" cy="9.5" r="5.8" />
          <path d="M13.6 13.6 20 20M7 5.2c2.9.4 5.4 2.8 5.9 5.7M5.2 7c2.7.3 5.5 3.1 5.8 5.8" />
        </svg>
      );
    case "baseball":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.2 5.4c1.5 1.7 2.3 3.9 2.3 6.6s-.8 4.9-2.3 6.6M15.8 5.4c-1.5 1.7-2.3 3.9-2.3 6.6s.8 4.9 2.3 6.6" />
          <path d="M8.2 8.1h1.4M8.4 11h1.5M8.3 13.9h1.4M15.6 8.1h-1.4M15.4 11h-1.5M15.7 13.9h-1.4" />
        </svg>
      );
    case "horse_racing":
      return (
        <svg {...commonProps}>
          <path d="M7 5v7a5 5 0 0 0 10 0V5" />
          <path d="M10 5v7a2 2 0 0 0 4 0V5M7 17h10M8.5 8.5h.01M15.5 8.5h.01" />
        </svg>
      );
    case "ufc":
      return (
        <svg {...commonProps}>
          <path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V11M10 11V6.8a1.5 1.5 0 0 1 3 0V11M13 11V7.4a1.5 1.5 0 0 1 3 0V12" />
          <path d="M16 10.2h1.2a1.8 1.8 0 0 1 1.8 1.8v1.2A6.8 6.8 0 0 1 12.2 20H11a6 6 0 0 1-6-6v-2a1.5 1.5 0 0 1 3 0v1" />
        </svg>
      );
    case "cricket":
      return (
        <svg {...commonProps}>
          <path d="m5 19 8.4-8.4 2 2L7 21H5v-2Z" />
          <path d="m14.6 9.4 2-2 2 2-2 2M18 5l1 1M5 6.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0Z" />
        </svg>
      );
    case "nhl":
      return (
        <svg {...commonProps}>
          <path d="M7 4v11.5c0 1.4 1.1 2.5 2.5 2.5H17" />
          <path d="M17 4v8.5c0 1.4-1.1 2.5-2.5 2.5H9M15 20h4M5 20h6" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
