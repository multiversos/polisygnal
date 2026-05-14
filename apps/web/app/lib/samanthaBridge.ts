import {
  getAnalysisAgentBridgeConfig,
  lookupAnalysisAgentResearchTask,
  sendAnalysisAgentResearchTask,
  validateAnalysisAgentTask,
} from "./analysisAgentBridge";
import type {
  SamanthaBridgeConfig,
  SamanthaBridgeLookupResult,
  SamanthaBridgeSendResult,
  SamanthaBridgeTask,
} from "./samanthaBridgeTypes";

export function getSamanthaBridgeConfig(): SamanthaBridgeConfig {
  const config = getAnalysisAgentBridgeConfig();
  return {
    allowLocalhost: config.allowLocalhost,
    automaticAvailable: config.automaticAvailable,
    endpointConfigured: config.endpointConfigured,
    maxRequestBytes: config.maxRequestBytes,
    maxResponseBytes: config.maxResponseBytes,
    mode: config.mode,
    reason: config.reason,
    timeoutMs: config.timeoutMs,
  };
}

export function validateSamanthaBridgeTask(
  task: SamanthaBridgeTask,
  config = getSamanthaBridgeConfig(),
): { errors: string[]; valid: boolean } {
  return validateAnalysisAgentTask(task, {
    ...getAnalysisAgentBridgeConfig(),
    allowLocalhost: config.allowLocalhost,
    automaticAvailable: config.automaticAvailable,
    endpointConfigured: config.endpointConfigured,
    maxRequestBytes: config.maxRequestBytes,
    maxResponseBytes: config.maxResponseBytes,
    mode: config.mode,
    reason: config.reason,
    timeoutMs: config.timeoutMs,
  });
}

export async function sendSamanthaResearchTask(task: SamanthaBridgeTask): Promise<SamanthaBridgeSendResult> {
  const result = await sendAnalysisAgentResearchTask(task);
  return {
    automaticAvailable: result.automaticAvailable,
    checkedAt: result.checkedAt,
    errorCode: result.errorCode === "agent_disabled" || result.errorCode === "agent_not_configured"
      ? "bridge_disabled"
      : result.errorCode,
    fallbackRequired: result.fallbackRequired,
    mode: result.mode,
    reason: result.reason,
    report: result.report,
    status: result.status === "agent_researching" ? "samantha_researching" : result.status,
    taskId: result.taskId,
    validationErrors: result.validationErrors,
    warnings: result.warnings,
  };
}

export async function lookupSamanthaResearchTask(taskId: string): Promise<SamanthaBridgeLookupResult> {
  const result = await lookupAnalysisAgentResearchTask(taskId);
  return {
    automaticAvailable: result.automaticAvailable,
    bridgeTaskStatus: result.bridgeTaskStatus,
    checkedAt: result.checkedAt,
    errorCode: result.errorCode === "agent_disabled" || result.errorCode === "agent_not_configured"
      ? "bridge_disabled"
      : result.errorCode,
    fallbackRequired: result.fallbackRequired,
    mode: result.mode,
    reason: result.reason,
    report: result.report,
    status: result.status === "agent_researching" ? "samantha_researching" : result.status,
    taskId: result.taskId,
    validationErrors: result.validationErrors,
    warnings: result.warnings,
  };
}
