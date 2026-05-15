import type { DeepAnalysisJob } from "./deepAnalysisJob";
import type { SamanthaResearchBrief, SamanthaResearchReport } from "./samanthaResearchTypes";
import type { SamanthaTaskPacket } from "./samanthaTaskPacket";

export type SamanthaBridgeMode = "disabled" | "manual_fallback" | "automatic";

export type SamanthaBridgeErrorCode =
  | "bridge_disabled"
  | "bridge_not_configured"
  | "invalid_bridge_config"
  | "invalid_request"
  | "payload_too_large"
  | "request_failed"
  | "request_timeout"
  | "invalid_response"
  | "report_invalid";

export type SamanthaBridgeStatus =
  | "completed"
  | "disabled"
  | "failed_safe"
  | "fallback_required"
  | "insufficient_data"
  | "manual_needed"
  | "partial"
  | "pending"
  | "sending"
  | "sent"
  | "samantha_researching"
  | "report_received"
  | "report_invalid"
  | "timeout"
  | "unavailable"
  | "error";

export type SamanthaBridgeConfig = {
  allowLocalhost: boolean;
  automaticAvailable: boolean;
  endpointConfigured: boolean;
  maxRequestBytes: number;
  maxResponseBytes: number;
  mode: SamanthaBridgeMode;
  reason: string;
  timeoutMs: number;
};

export type SamanthaBridgeTask = {
  brief: SamanthaResearchBrief;
  createdAt: string;
  deepAnalysisJobId?: DeepAnalysisJob["id"];
  id: string;
  normalizedUrl: string;
  taskPacket: SamanthaTaskPacket;
};

export type SamanthaResearchRequest = {
  brief: SamanthaResearchBrief;
  deepAnalysisJobId?: DeepAnalysisJob["id"];
  normalizedUrl: string;
};

export type SamanthaResearchResponse = {
  accepted?: boolean;
  message?: string;
  report?: SamanthaResearchReport;
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
    | "researching"
    | "unavailable";
  taskId?: string;
  warnings?: string[];
};

export type SamanthaBridgeSendResult = {
  automaticAvailable: boolean;
  checkedAt: string;
  errorCode?: SamanthaBridgeErrorCode;
  fallbackRequired: boolean;
  mode: SamanthaBridgeMode;
  reason: string;
  report?: SamanthaResearchReport;
  status: SamanthaBridgeStatus;
  taskId?: string;
  validationErrors?: string[];
  warnings: string[];
};

export type SamanthaBridgeLookupResult = SamanthaBridgeSendResult & {
  bridgeTaskStatus?: "pending" | "processing" | "completed" | "manual_needed" | "failed_safe";
};
