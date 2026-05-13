# Analyzer Estimate Gates

PolySignal can show a market probability whenever Polymarket exposes prices, but
it can only show a PolySignal percentage after conservative evidence gates pass.
The price visible on Polymarket is a reference, not the PolySignal estimate.

## Gate A - Polymarket Market Reference

Gate A passes only when `/analyze` has read the selected market directly from
Polymarket/Gamma/CLOB and has a visible market-implied YES/NO reference.

This reference is saved and displayed as `Probabilidad del mercado`. It is never
copied into `estimateYesProbability`, `estimateNoProbability`, `predictedSide`,
or history accuracy.

## Gate B - Validated Samantha Report

Gate B passes only when a Samantha report:

- uses report version `1.0`;
- validates through `samanthaResearchReport.ts`;
- includes source-backed evidence;
- includes a `suggestedEstimate` inside `0..100`;
- has a clear YES or NO decision at or above the `55%` threshold;
- has at least two medium/high non-social signals that match that decision.

Reports can still be useful context when Gate B fails. In that case they do not
create a PolySignal percentage.

## Gate C - Independent Support

Gate C requires at least one real support beyond the market reference:

- Wallet Intelligence with enough public wallet activity.
- Wallet profile history with enough resolved closed-position data.
- Comparable external odds from a validated report.
- Equivalent Kalshi comparison from a validated report.
- Strong external evidence from a validated Samantha report.

Weak wallet activity, incomplete wallet profiles, Reddit/social-only evidence,
non-equivalent Kalshi, or unsupported odds do not pass Gate C.

## When A Percentage Appears

PolySignal shows `Estimacion PolySignal` only when A, B, and C all pass. The
percentage comes from the validated Samantha estimate after the gates pass; the
market price remains a separate reference contribution marked as not used for
the estimate.

If the resulting YES or NO side is at least `55%`, the saved item can count for
history accuracy later, but only after Polymarket confirms the final outcome.

## When It Stays Pending

The estimate remains pending when:

- Samantha has not returned a valid report.
- Samantha returned context without an accepted estimate.
- The market reference is missing.
- Independent support is missing.
- The accepted estimate does not create a clear YES/NO side.

Pending, manual-needed, cancelled, unknown, market-price-only, and no-clear
decision states do not count as hits or misses.

## Test Fixtures

The controlled test fixtures live in
`apps/web/app/lib/__fixtures__/samanthaReports.ts`.

- `strongValidSamanthaReport`: valid Samantha estimate with strong external
  evidence.
- `weakValidSamanthaReport`: valid context, but insufficient for a final
  estimate.
- `validButNoIndependentGateReport`: valid report shape with insufficient
  evidence, used to prove pending behavior.
- `invalidSamanthaReport` and `invalidSamanthaReportCases`: unsafe or invalid
  payloads for validator tests.

Run the focused checks:

```powershell
npm.cmd --workspace apps/web run test:estimate-gates
npm.cmd --workspace apps/web run test:samantha-report-validation
```

Samantha also keeps mirror contract fixtures in
`N:/samantha/src/polysignal/__fixtures__/polysignal-report-fixtures.js`.
Those fixtures are local test inputs for the queue processor and are never
treated as production evidence. `strongEvidenceInput` can produce a completed
report only in tests; normal queued tasks still return `manual_needed` unless a
real structured evidence package is provided.
