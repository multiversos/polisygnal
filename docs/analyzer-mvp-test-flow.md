# Analyzer MVP Test Flow

This checklist validates the current analyzer-first MVP without enabling automatic production research.

## Goal

PolySignal should feel usable even when Samantha only accepts a task or returns `manual_needed`.
The product must not invent evidence, must not mark the analysis as completed, and must keep the manual fallback available.

## Local/Production Expectations

- Production remains safe by default: Samantha automatic bridge is disabled unless explicitly configured server-side.
- Local/dev can use the Samantha bridge with temporary shell variables only.
- `accepted`, `pending`, `processing`, and `manual_needed` do not count as accuracy.
- Market price is never treated as a PolySignal estimate.

## Test Steps

1. Open `/analyze`.
2. Paste a real Polymarket event or market URL.
3. Confirm PolySignal resolves the URL from Polymarket/Gamma/CLOB and shows a market selector if needed.
4. Select one market and start the deep analysis.
5. Confirm Radar Analytics remains visible while the job is running or waiting for Samantha.
6. If the bridge is configured locally, confirm the Samantha task is sent and a `taskId` appears.
7. If Samantha returns `pending` or `accepted`, confirm the job remains pending and does not show `completed`.
8. Confirm the progress block says the analysis is not finished yet and shows:
   - Consult Samantha result
   - Load manual report
   - Download task
   - Copy instructions
   - Save and continue later
   - View in History
9. If Samantha returns `manual_needed`, confirm the report says manual research is required and is not shown as a fatal error.
10. Save the analysis to `/history`.
11. Open `/history` and confirm the item shows:
    - Original Polymarket link
    - DeepAnalysisJob id continuity through the continue link
    - Samantha task id when available
    - Research status such as `Pending`, `Samantha received task`, or `Manual report needed`
    - Actions to continue, consult Samantha, load a manual report, view detail, and reanalyze/open the link.
12. Click `Continuar analisis` from History and confirm `/analyze` restores the URL/job context.
13. Click `Consultar resultado de Samantha` from History when a task id exists.
14. Confirm `pending`, `processing`, or `manual_needed` updates History without marking the job completed.
15. Open `/performance` and confirm research-pending analyses are shown separately and do not count as misses.

## Manual Report Test

1. Paste a structured Samantha report into `/analyze`.
2. Click `Validar reporte`.
3. If valid, click `Cargar reporte al analisis`.
4. Confirm PolySignal validates/sanitizes evidence before updating the DeepAnalysisJob.
5. Confirm no prediction is generated unless the report passes the conservative estimate gates.
6. Run `npm.cmd --workspace apps/web run test:samantha-report-validation` to
   confirm invalid report fixtures are rejected before manual QA.

## Estimate Gate Test

1. Run `npm.cmd --workspace apps/web run test:estimate-gates`.
2. Confirm the script reports pending cases for:
   - no Samantha report;
   - market price only;
   - weak Samantha context;
   - valid-shape report without enough support.
3. Confirm the script reports available cases only when a valid Samantha report
   is paired with real independent support.
4. Confirm the market reference contribution is marked as reference, not used
   for the PolySignal estimate.

## What Must Not Happen

- No soccer fallback or internal-market matching for unrelated links.
- No full wallet addresses in UI or stored history.
- No tokens, raw payloads, stack traces, or secrets.
- No fake timers or simulated research.
- No `completed` state for `accepted`, `pending`, `processing`, or `manual_needed`.
- No accuracy impact for pending research or missing PolySignal estimates.
