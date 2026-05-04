"use client";

export type SportSelectorOption = {
  id: string;
  apiValue: string | null;
  label: string;
  icon: string;
  tone: string;
  backendSupported: boolean;
};

export const sportsSelectorOptions = [
  {
    id: "all",
    apiValue: null,
    label: "Todos",
    icon: "✦",
    tone: "all",
    backendSupported: true,
  },
  {
    id: "basketball",
    apiValue: "basketball",
    label: "Baloncesto",
    icon: "🏀",
    tone: "basketball",
    backendSupported: true,
  },
  {
    id: "nfl",
    apiValue: "nfl",
    label: "NFL",
    icon: "🏈",
    tone: "nfl",
    backendSupported: true,
  },
  {
    id: "soccer",
    apiValue: "soccer",
    label: "Fútbol",
    icon: "⚽",
    tone: "soccer",
    backendSupported: true,
  },
  {
    id: "nhl",
    apiValue: "nhl",
    label: "NHL",
    icon: "🏒",
    tone: "nhl",
    backendSupported: true,
  },
  {
    id: "mma",
    apiValue: "mma",
    label: "UFC",
    icon: "🥊",
    tone: "mma",
    backendSupported: true,
  },
  {
    id: "tennis",
    apiValue: "tennis",
    label: "Tenis",
    icon: "🎾",
    tone: "tennis",
    backendSupported: true,
  },
  {
    id: "cricket",
    apiValue: "cricket",
    label: "Cricket",
    icon: "🏏",
    tone: "cricket",
    backendSupported: true,
  },
  {
    id: "mlb",
    apiValue: "mlb",
    label: "Béisbol",
    icon: "⚾",
    tone: "mlb",
    backendSupported: true,
  },
] as const satisfies readonly SportSelectorOption[];

export function getSportSelectorOption(value: string): SportSelectorOption {
  const normalizedValue = value === "nba" ? "basketball" : value;
  return (
    sportsSelectorOptions.find((option) => option.id === normalizedValue) ??
    sportsSelectorOptions[0]
  );
}

export function getSportApiFilter(value: string): string | null {
  const option = getSportSelectorOption(value);
  if (!option.backendSupported || !option.apiValue) {
    return null;
  }
  return option.apiValue;
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
      <div className="sports-selector-scroll" role="list">
        {sportsSelectorOptions.map((option) => {
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
    </section>
  );
}
