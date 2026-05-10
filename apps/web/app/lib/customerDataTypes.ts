export type UserRole = "admin" | "user";

export type AnalysisResult = "cancelled" | "hit" | "miss" | "pending" | "unknown";

export type AnalysisSource = "link_analyzer" | "manual" | "market_detail" | "unknown";

export type AnalysisStatus = "open" | "resolved" | "unknown";

export type PredictedSide = "NO" | "UNKNOWN" | "YES";

export type ConfidenceLevel = "Alta" | "Baja" | "Desconocida" | "Media";

export type CustomerProfile = {
  createdAt: string;
  displayName?: string | null;
  email: string;
  id: string;
  role: UserRole;
  updatedAt: string;
};

export type UserAnalysisHistoryRecord = {
  analyzedAt: string;
  confidence?: ConfidenceLevel | null;
  createdAt: string;
  id: string;
  marketId?: string | null;
  marketNoProbability?: number | null;
  marketUrl?: string | null;
  marketYesProbability?: number | null;
  outcome?: "CANCELLED" | "NO" | "UNKNOWN" | "YES" | null;
  ownerId: string;
  polySignalNoProbability?: number | null;
  polySignalYesProbability?: number | null;
  predictedSide?: PredictedSide | null;
  reasons?: string[] | null;
  result: AnalysisResult;
  source: AnalysisSource;
  sport?: string | null;
  status: AnalysisStatus;
  title: string;
  updatedAt: string;
};

export type UserWatchlistRecord = {
  createdAt: string;
  id: string;
  marketId: string;
  ownerId: string;
  sport?: string | null;
  status?: string | null;
  title: string;
  updatedAt: string;
};

export type UserAlertType =
  | "market_updated"
  | "missing_information"
  | "review_ready"
  | "status_changed";

export type UserAlertPreference = {
  alertType: UserAlertType;
  createdAt: string;
  enabled: boolean;
  id: string;
  marketId?: string | null;
  ownerId: string;
  updatedAt: string;
};
