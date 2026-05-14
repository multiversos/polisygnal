import type { DeepAnalysisJob } from "./deepAnalysisJob";
import type { SamanthaResearchBrief, SamanthaResearchReport } from "./samanthaResearchTypes";
import type { SamanthaTaskPacket } from "./samanthaTaskPacket";

export type AnalysisAgentAuthMode = "bearer" | "header-token" | "none";
export type AnalysisAgentProviderId = "custom" | "jarvis" | "samantha" | string;

export type AnalysisAgentProvider = {
  authMode: AnalysisAgentAuthMode;
  description: string;
  displayName: string;
  enabled: boolean;
  endpointConfigured: boolean;
  endpointUrl: string | null;
  id: AnalysisAgentProviderId;
  timeoutMs: number;
};

export type AnalysisAgentMode = "disabled" | "manual_fallback" | "automatic";

export type AnalysisAgentErrorCode =
  | "agent_disabled"
  | "agent_not_configured"
  | "bridge_disabled"
  | "bridge_not_configured"
  | "invalid_bridge_config"
  | "invalid_request"
  | "payload_too_large"
  | "request_failed"
  | "request_timeout"
  | "invalid_response"
  | "report_invalid";

export type AnalysisAgentStatus =
  | "disabled"
  | "fallback_required"
  | "manual_needed"
  | "pending"
  | "sending"
  | "sent"
  | "agent_researching"
  | "samantha_researching"
  | "report_received"
  | "report_invalid"
  | "error";

export type AnalysisAgentBridgeConfig = {
  agentId: string;
  agentName: string;
  allowLocalhost: boolean;
  automaticAvailable: boolean;
  endpointConfigured: boolean;
  maxRequestBytes: number;
  maxResponseBytes: number;
  mode: AnalysisAgentMode;
  provider: AnalysisAgentProvider;
  reason: string;
  timeoutMs: number;
};

export type AnalysisAgentTask = {
  agentId?: string;
  agentName?: string;
  brief: SamanthaResearchBrief;
  createdAt: string;
  deepAnalysisJobId?: DeepAnalysisJob["id"];
  id: string;
  normalizedUrl: string;
  taskPacket: SamanthaTaskPacket;
};

export type AnalysisAgentRequest = {
  category: string | null;
  eventSlug: string | null;
  liquidity: number | null;
  marketId: string | null;
  marketProbability: number | null;
  marketSlug: string | null;
  polymarketUrl: string;
  prices: object | null;
  question: string | null;
  source: "polysignal";
  title: string;
  volume: number | null;
  walletIntelligence: object | null;
};

export type AnalysisAgentKeySignal = {
  confidence: "low" | "medium" | "high";
  direction: "YES" | "NO" | "neutral" | "unknown";
  isReal: boolean;
  label: string;
  source: string;
};

export type AnalysisAgentSuggestedDecision = {
  available: boolean;
  confidence: "low" | "medium" | "high" | null;
  probability: number | null;
  reason: string;
  side: "YES" | "NO" | null;
};

export type AnalysisAgentResponse = {
  agentId: string;
  agentName: string;
  checkedAt: string;
  keySignals: AnalysisAgentKeySignal[];
  limitations: string[];
  risks: string[];
  sourcesUsed: string[];
  status: "completed" | "partial" | "insufficient_data" | "failed_safe" | "unavailable";
  suggestedDecision: AnalysisAgentSuggestedDecision;
  summary: string;
};

export type AnalysisAgentRawResponse = {
  accepted?: boolean;
  analysis?: AnalysisAgentResponse;
  message?: string;
  report?: SamanthaResearchReport;
  researchReport?: SamanthaResearchReport;
  status?:
    | "accepted"
    | "completed"
    | "failed"
    | "failed_safe"
    | "insufficient_data"
    | "manual_needed"
    | "partial"
    | "pending"
    | "processing"
    | "queued"
    | "unavailable"
    | "researching";
  summary?: string;
  taskId?: string;
  version?: string;
  warnings?: string[];
};

export type AnalysisAgentSendResult = {
  agentId: string;
  agentName: string;
  analysis?: AnalysisAgentResponse;
  automaticAvailable: boolean;
  checkedAt: string;
  errorCode?: AnalysisAgentErrorCode;
  fallbackRequired: boolean;
  mode: AnalysisAgentMode;
  reason: string;
  report?: SamanthaResearchReport;
  status: AnalysisAgentStatus;
  taskId?: string;
  validationErrors?: string[];
  warnings: string[];
};

export type AnalysisAgentLookupResult = AnalysisAgentSendResult & {
  bridgeTaskStatus?: "pending" | "processing" | "completed" | "manual_needed" | "failed_safe";
};
