"use client";

import { API_BASE_URL } from "./api";

export type ResearchPacketResult = {
  status: string;
  market_id: number;
  research_run_id: number;
  mode: string;
  research_status: string;
  request_path: string;
  packet_path: string;
  expected_response_path: string;
  ingest_command: string;
  ingest_dry_run_command: string;
  notes?: string | null;
};

export async function generateResearchPacket(
  marketId: number | string,
  notes?: string | null,
): Promise<ResearchPacketResult> {
  const response = await fetch(`${API_BASE_URL}/markets/${marketId}/research-packet`, {
    cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "codex_agent",
      notes: notes?.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`/markets/${marketId}/research-packet responded ${response.status}`);
  }

  return response.json() as Promise<ResearchPacketResult>;
}
