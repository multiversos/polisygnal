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

1. Abrir `/analyze`.
2. Pegar un link valido de evento o mercado de Polymarket.
3. Confirmar que PolySignal resuelve la URL desde Polymarket/Gamma/CLOB y muestra selector si hace falta.
4. Confirmar el mercado y crear el analisis profundo.
5. Confirmar que Radar Analytics sigue visible mientras el job corre o espera a Samantha.
6. Enviar o guardar la tarea Samantha. Si el bridge local esta configurado, debe aparecer `taskId`.
7. Ver el estado pendiente: `accepted`, `pending`, `processing` o `manual_needed` no deben mostrar `completed`.
8. Confirmar que el bloque de progreso explica que el analisis no termino y muestra:
   - Consultar resultado de Samantha
   - Cargar reporte manual
   - Descargar tarea
   - Copiar instrucciones
   - Guardar y continuar despues
   - Ver en historial
9. Si Samantha devuelve `manual_needed`, confirmar que se muestra como investigacion manual requerida, no como error fatal.
10. Guardar el analisis en `/history`.
11. Ir a `/history` y confirmar que el item muestra:
    - mercado y link original de Polymarket;
    - continuidad por `deepAnalysisJobId`;
    - `bridgeTaskId` cuando existe;
    - estado humano como `Pendiente de investigacion`, `Samantha recibio la tarea` o `Necesita reporte manual`;
    - acciones para continuar, consultar Samantha, cargar reporte manual, ver detalle y abrir/reanalizar el enlace.
12. Hacer click en `Continuar analisis` desde History y confirmar que `/analyze` restaura URL y job.
13. Hacer click en `Consultar resultado de Samantha` desde History cuando exista task id.
14. Confirmar que `pending`, `processing` o `manual_needed` actualizan History sin marcar el job como completado.
15. Cargar un reporte manual estructurado solo si existe evidencia real validable.
16. Abrir `/performance` y confirmar que los pendientes de investigacion aparecen separados y no cuentan como fallos ni precision.

## Manual Report Test

1. Paste a structured Samantha report into `/analyze`.
2. Click `Validar reporte`.
3. If valid, click `Cargar reporte al analisis`.
4. Confirm PolySignal validates/sanitizes evidence before updating the DeepAnalysisJob.
5. Confirm no prediction is generated unless the report passes the conservative estimate gates.
6. Run `npm.cmd --workspace apps/web run test:samantha-report-validation` to
   confirm invalid report fixtures are rejected before manual QA.

## Samantha Queue Composer Test

1. In `N:/samantha`, run `npm run polysignal:research:list` and choose a safe
   pending task id.
2. Run `npm run polysignal:research:process -- --task-id=<task-id>`.
3. Confirm the normal result is `manual_needed` when no authorized evidence
   package exists.
4. For local contract testing only, run
   `npm run polysignal:research:process -- --task-id=<task-id> --fixture=strongEvidenceInput`
   against a fresh safe task.
5. Confirm a completed report is only produced from the controlled fixture and
   still validates through PolySignal before it affects the estimate gates.

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
