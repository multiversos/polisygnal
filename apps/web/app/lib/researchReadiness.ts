import {
  normalizeResearchReliability,
  type ResearchFinding,
  type ResearchSourceType,
} from "./evidenceTypes";
import {
  extractSoccerMatchContext,
  getSoccerContextReadiness,
  type SoccerMatchContextInput,
} from "./soccerMatchContext";

export type ResearchCategoryId =
  | "advanced_stats"
  | "external_odds"
  | "historical_calibration"
  | "injuries_suspensions"
  | "league_fixture"
  | "recent_form"
  | "team_news";

export type RequiredResearchCategory = {
  description: string;
  id: ResearchCategoryId;
  label: string;
  required: boolean;
  sourceTypes: ResearchSourceType[];
};

export type ResearchCoverageCategory = RequiredResearchCategory & {
  findings: ResearchFinding[];
  status: "available" | "missing" | "partial";
};

export type ResearchCoverage = {
  availableCategories: number;
  categories: ResearchCoverageCategory[];
  label:
    | "Investigacion parcial"
    | "Investigacion suficiente para revision"
    | "Lista para estimacion futura"
    | "Sin investigacion externa";
  missing: string[];
  realFindingCount: number;
  readyForFutureEstimate: boolean;
  verifiedVisibleCount: number;
};

const REQUIRED_SOCCER_RESEARCH: RequiredResearchCategory[] = [
  {
    description: "Forma reciente, calendario y rendimiento basico de los equipos.",
    id: "recent_form",
    label: "Forma reciente",
    required: true,
    sourceTypes: ["stats_provider", "sports_news", "league"],
  },
  {
    description: "Disponibilidad de jugadores, lesiones y suspensiones.",
    id: "injuries_suspensions",
    label: "Lesiones/suspensiones",
    required: true,
    sourceTypes: ["injury_report", "official_team", "sports_news"],
  },
  {
    description: "Noticias oficiales o reportes relevantes de los equipos.",
    id: "team_news",
    label: "Noticias del equipo",
    required: true,
    sourceTypes: ["official_team", "sports_news"],
  },
  {
    description: "Fixture, liga, fecha y contexto del partido.",
    id: "league_fixture",
    label: "Datos de liga/fixture",
    required: true,
    sourceTypes: ["league", "stats_provider"],
  },
  {
    description: "Odds externas para comparar precio de mercado.",
    id: "external_odds",
    label: "Odds externas",
    required: true,
    sourceTypes: ["odds_reference"],
  },
  {
    description: "ELO, xG, ratings u otras estadisticas avanzadas.",
    id: "advanced_stats",
    label: "Estadisticas avanzadas",
    required: false,
    sourceTypes: ["stats_provider"],
  },
  {
    description: "Resultados historicos de PolySignal para calibrar confianza.",
    id: "historical_calibration",
    label: "Historial/calibracion",
    required: true,
    sourceTypes: ["unknown"],
  },
];

export function getRequiredResearchForSoccerMarket(
  _market?: SoccerMatchContextInput,
): RequiredResearchCategory[] {
  return REQUIRED_SOCCER_RESEARCH;
}

function findingMatchesCategory(finding: ResearchFinding, category: RequiredResearchCategory): boolean {
  if (!finding.isReal) {
    return false;
  }
  const reliability = normalizeResearchReliability(finding.sourceType, finding.reliability);
  if (reliability === "unknown") {
    return false;
  }
  return category.sourceTypes.includes(finding.sourceType);
}

export function getResearchCoverage(
  market: SoccerMatchContextInput,
  findings: ResearchFinding[] = [],
): ResearchCoverage {
  const context = extractSoccerMatchContext(market);
  const soccerReadiness = getSoccerContextReadiness(context);
  const realFindings = findings.filter((finding) => finding.isReal);
  const categories = getRequiredResearchForSoccerMarket(market).map((category) => {
    const categoryFindings = realFindings.filter((finding) => findingMatchesCategory(finding, category));
    const hasContext = category.id === "league_fixture" && soccerReadiness.readyForExternalResearch;
    const status: ResearchCoverageCategory["status"] =
      categoryFindings.length > 0 ? "available" : hasContext ? "partial" : "missing";
    return {
      ...category,
      findings: categoryFindings,
      status,
    };
  });
  const availableCategories = categories.filter((category) => category.status === "available").length;
  const requiredMissing = categories.filter(
    (category) => category.required && category.status !== "available",
  );
  const readyForFutureEstimate = requiredMissing.length === 0 && realFindings.length >= 3;

  return {
    availableCategories,
    categories,
    label: getResearchReadinessLabel({
      availableCategories,
      realFindingCount: realFindings.length,
      readyForFutureEstimate,
    }),
    missing: getMissingResearchCategories(market, findings),
    realFindingCount: realFindings.length,
    readyForFutureEstimate,
    verifiedVisibleCount: realFindings.filter((finding) => finding.isUserVisible).length,
  };
}

export function getResearchReadinessLabel(coverage: Pick<ResearchCoverage, "availableCategories" | "readyForFutureEstimate" | "realFindingCount">): ResearchCoverage["label"] {
  if (coverage.readyForFutureEstimate) {
    return "Lista para estimacion futura";
  }
  if (coverage.availableCategories >= 3) {
    return "Investigacion suficiente para revision";
  }
  if (coverage.realFindingCount > 0) {
    return "Investigacion parcial";
  }
  return "Sin investigacion externa";
}

export function getMissingResearchCategories(
  market: SoccerMatchContextInput,
  findings: ResearchFinding[] = [],
): string[] {
  return getResearchCoverageCategories(market, findings)
    .filter((category) => category.status !== "available")
    .map((category) => category.label);
}

function getResearchCoverageCategories(
  market: SoccerMatchContextInput,
  findings: ResearchFinding[] = [],
): ResearchCoverageCategory[] {
  const context = extractSoccerMatchContext(market);
  const soccerReadiness = getSoccerContextReadiness(context);
  const realFindings = findings.filter((finding) => finding.isReal);
  return getRequiredResearchForSoccerMarket(market).map((category) => {
    const categoryFindings = realFindings.filter((finding) => findingMatchesCategory(finding, category));
    const hasContext = category.id === "league_fixture" && soccerReadiness.readyForExternalResearch;
    return {
      ...category,
      findings: categoryFindings,
      status: categoryFindings.length > 0 ? "available" : hasContext ? "partial" : "missing",
    };
  });
}
