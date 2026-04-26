# PolySignal

PolySignal es un MVP para descubrir mercados de Polymarket, persistirlos en PostgreSQL y exponer metadata, historico basico y evidencia estructurada por API/backend.

## Estado actual

Backend listo para:

- discovery y sync manual de mercados usando Gamma API
- scope reducido del MVP a `sports`, con foco por defecto en `sport_type = nba`
- snapshots periodicos de mercado usando CLOB para pricing y Gamma para `volume/liquidity`
- detalle enriquecido de mercado con ultimo snapshot e historico reciente
- lectura HTTP de evidencia persistida por mercado
- lectura HTTP de scoring persistido por mercado
- resolucion manual minima de mercados y resumen HTTP de evaluacion
- overview HTTP agregado para inspeccion operativa de mercados `nba / winner`
- briefing HTTP compacto para lectura operativa rapida del subset actual
- transparencia HTTP del estado operativo de evidence por mercado y en overview
- auditoria HTTP de snapshots, evidence y scoring leyendo artifacts persistidos
- estado operativo HTTP consolidado del MVP via `GET /status`
- historial operativo HTTP del pipeline via `GET /status/history`
- resumen agregado del historial operativo via `GET /status/history/summary`
- comparacion simple entre windows historicos via `GET /status/history/compare`
- automatizacion simple de scoring v1 en Windows via PowerShell y Task Scheduler
- automatizacion simple de snapshots en Windows via PowerShell y Task Scheduler
- orquestacion simple del pipeline completo `snapshots -> evidence -> scoring`
- evidence pipeline inicial para `sports / nba / winner` con The Odds API y ESPN RSS
- scoring engine v1 persistible para `sports / nba / winner`

Todavia no incluye:

- WebSockets
- tiempo real
- clasificacion con IA de noticias

## Estructura

```text
apps/
  api/
  web/
  worker/
packages/
  shared/
  scoring/
  polymarket_client/
  evidence/
  llm/
docs/
infra/
scripts/
```

## Backend

Setup rapido:

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Tests:

```powershell
.\.venv\Scripts\python -m pytest
```

Sync manual:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/sync/polymarket' | ConvertTo-Json -Depth 5
```

Snapshots manuales por wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_snapshots.ps1 -Limit 25
```

Instalar automatizacion periodica:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_snapshot_task.ps1
```

Evidence pipeline por mercado:

```powershell
.\.venv\Scripts\python -m app.commands.capture_market_evidence --market-id 155
```

Evidence pipeline por lote NBA winner:

```powershell
.\.venv\Scripts\python -m app.commands.capture_nba_winner_evidence --limit 25
```

Regla operativa actual de evidence:

- solo procesa mercados con `2` equipos NBA concretos en la pregunta
- mercados de un solo equipo tipo futures o finals winner se registran como `skipped`
- mercados de premios/jugadores/coaches o formas no parseables se registran como `skipped`
- esos `skipped` no cuentan como warning operacional

Campos HTTP utiles para inspeccion operativa:

- `evidence_eligible`
- `evidence_shape`
- `evidence_skip_reason`

Reconciliacion segura de evidencia legacy del MVP:

```powershell
.\.venv\Scripts\python -m app.commands.reconcile_legacy_evidence
.\.venv\Scripts\python -m app.commands.reconcile_legacy_evidence --apply
```

Scoring manual por mercado:

```powershell
.\.venv\Scripts\python -m app.commands.score_market --market-id 155
```

Scoring manual por lote NBA winner:

```powershell
.\.venv\Scripts\python -m app.commands.score_nba_winner_markets --limit 25
```

El batch de scoring usa el subconjunto operativo del MVP:

- mercados `sport_type = nba`
- `market_type = winner`
- `active = true`
- `closed = false`

Scoring manual por wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_scoring.ps1 -Limit 25
```

Instalar automatizacion periodica de scoring:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_scoring_task.ps1 -EveryMinutes 120 -Limit 25
```

Ver ultimo resumen de scoring:

```powershell
Get-Content .\logs\market_scoring\latest-summary.json
```

Pipeline completo manual:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_pipeline.ps1 -Limit 25
```

El wrapper principal ahora deja el flujo completo del MVP en una sola corrida:

1. snapshots
2. evidence
3. scoring
4. reports
5. briefing
6. diff

Instalar automatizacion periodica del pipeline:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_pipeline_task.ps1 -EveryMinutes 120
```

Tarea principal recomendada del MVP:

- `PolySignal-Market-Pipeline`
- corre `pipeline + reports + briefing + diff`
- deja reportes, briefing y diff frescos al final de cada corrida normal

Las otras tareas quedan utiles para mantenimiento, debug o corridas manuales separadas.

Ver ultimo resumen del pipeline:

```powershell
Get-Content .\logs\market_pipeline\latest-summary.json
```

Auditoria HTTP del pipeline principal desde artifacts:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/latest' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/20260421_160938' | ConvertTo-Json -Depth 8
```

Auditoria HTTP por etapa interna desde artifacts existentes:

- estos endpoints no recalculan nada en runtime
- leen `logs/market_pipeline/snapshots`, `logs/market_pipeline/evidence` y `logs/market_pipeline/scoring`

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/snapshots/latest' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/snapshots/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/snapshots/20260421_200903' | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evidence/latest-run' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evidence/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evidence/20260421_201014' | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri 'http://127.0.0.1:8000/scoring/latest' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/scoring/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/scoring/20260421_201018' | ConvertTo-Json -Depth 8
```

Estado operativo consolidado desde artifacts existentes:

- `GET /status` resume `pipeline`, `snapshots`, `evidence`, `scoring`, `reports`, `briefing` y `diff`
- no ejecuta nada en runtime; solo reutiliza los artifacts ya persistidos
- expone `overall_status`, counts globales y frescura simple por componente

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' | ConvertTo-Json -Depth 8
```

Historial operativo compacto desde artifacts historicos del pipeline:

- `GET /status/history` usa los summaries timestamped de `logs/market_pipeline`
- reutiliza los bloques embebidos de snapshots, evidence, scoring, reports, briefing y diff
- no ejecuta nada en runtime

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?status=warning' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?component=evidence' | ConvertTo-Json -Depth 8
```

Resumen agregado del mismo historial operativo:

- `GET /status/history/summary` usa exactamente la misma fuente de verdad que `GET /status/history`
- agrega conteos por componente y por `overall_status` sobre el window actual
- no recalcula nada ni abre otra fuente

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary?component=evidence' | ConvertTo-Json -Depth 8
```

Comparacion simple entre el window actual y el bloque anterior:

- `GET /status/history/compare` usa exactamente la misma fuente de verdad que `GET /status/history`
- compara el bloque actual contra el bloque inmediatamente anterior del mismo tamano
- incluye `component_trends` para ver mejora, degradacion o estabilidad por componente
- cada componente ahora tambien expone `changed_from` y `changed_to` para mostrar transiciones compactas como `warning -> ok` o `ok -> missing`
- cada componente tambien expone `latest_changed_run_id`, `latest_changed_generated_at`, `latest_changed_summary_path`, `previous_changed_run_id`, `previous_changed_generated_at`, `previous_changed_summary_path` y `change_reason`
- si el summary real del run ya no existe, el path queda en `null` y la bandera `*_artifact_available` queda en `false`
- no recalcula nada en runtime

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare?component=evidence' | ConvertTo-Json -Depth 8
```

Ver ultimo resumen de reports refrescados por el pipeline:

```powershell
Get-Content .\logs\reports\latest-summary.json
```

Ver ultimo resumen de briefing refrescado por el pipeline:

```powershell
Get-Content .\logs\briefings\latest-summary.json
```

Ver ultimo resumen de diff refrescado por el pipeline:

```powershell
Get-Content .\logs\diffs\latest-summary.json
```

Leer evidencia por mercado:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/evidence' | ConvertTo-Json -Depth 8
```

Leer scoring mas reciente por mercado:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/prediction' | ConvertTo-Json -Depth 8
```

Leer historial de scoring por mercado:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/predictions?limit=10' | ConvertTo-Json -Depth 8
```

Resolver un mercado manualmente:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/markets/155/resolve' -ContentType 'application/json' -Body '{"resolved_outcome":"yes","notes":"manual close"}' | ConvertTo-Json -Depth 8
```

Historial simple de evaluacion:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evaluation/history' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evaluation/history?limit=10' | ConvertTo-Json -Depth 8
```

Historial de evaluacion por mercado resuelto:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evaluation/history/155' | ConvertTo-Json -Depth 8
```

Resumen minimo de evaluacion:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evaluation/summary' | ConvertTo-Json -Depth 8
```

La evaluacion usa solo join entre `predictions` y `market_outcomes`.
`cancelled` no cuenta como acierto ni fallo y el endpoint devuelve solo `accuracy`, `opportunity_accuracy`, `brier_score`, totales y periodo de resolucion.
`GET /evaluation/history` devuelve filas compactas ordenadas por `resolved_at` descendente con `was_correct` y `brier_component` calculados en runtime, sin persistir esos campos.
`GET /evaluation/history/{market_id}` devuelve el detalle de un mercado resuelto con `items` ordenados por `run_at` ascendente y reutiliza exactamente la misma lógica de `was_correct` y `brier_component`.

Overview agregado para revisar varios mercados NBA winner:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview' | ConvertTo-Json -Depth 8
```

Overview filtrado solo a oportunidades:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?opportunity_only=true&limit=25' | ConvertTo-Json -Depth 8
```

Overview priorizado por regla operativa del MVP:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

Overview solo para mercados elegibles con foco en confianza:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?evidence_eligible_only=true&sort_by=confidence_score&limit=25' | ConvertTo-Json -Depth 8
```

Overview solo con evidence-backed:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?evidence_only=true&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

Overview solo con fallback-only:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?fallback_only=true&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

Export simple de prioridades:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.export_market_overview --preset top_opportunities --format json --limit 25 --output ..\..\logs\exports\top_opportunities.json
```

Reportes operativos periodicos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_reports.ps1
```

Briefing operativo compacto:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing' | ConvertTo-Json -Depth 8
```

Auditoria HTTP del briefing desde artifacts:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/latest' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/20260421_161034' | ConvertTo-Json -Depth 8
```

Generar briefing manual a archivos:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.generate_briefing
```

Wrapper operativo manual de briefing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_briefing.ps1
```

Diff manual entre corridas:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_diff.ps1
```

Leer el diff mas reciente por HTTP:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/latest' | ConvertTo-Json -Depth 8
```

Auditoria HTTP de reports desde artifacts:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/latest' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/runs?limit=10' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/20260421_161302' | ConvertTo-Json -Depth 8
```

Listar corridas de diff disponibles:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/runs?limit=10' | ConvertTo-Json -Depth 8
```

Leer una corrida puntual de diff por `run_id`:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/20260421_161036' | ConvertTo-Json -Depth 8
```

Archivos esperados del diff:

- `logs/diffs/latest-diff.json`
- `logs/diffs/latest-diff.txt`
- `logs/diffs/latest-summary.json`
- `logs/diffs/latest-snapshot.json`
- `logs/diffs/<run_id>.summary.json`
- `logs/diffs/<timestamp>.diff.json`

Los endpoints HTTP de pipeline, briefing, reports y diff reutilizan esos artifacts ya generados; no recalculan nada en runtime.

Archivos esperados:

- `logs/briefings/latest-briefing.json`
- `logs/briefings/latest-briefing.txt`

El briefing se enfoca en mercados abiertos/no cerrados para quedar alineado con la lectura operativa real del pipeline.

Instalar automatizacion periodica de reportes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_reports_task.ps1 -RunAfterCreate
```

Ver ultimo summary de reportes:

```powershell
Get-Content .\logs\reports\latest-summary.json
```

Mas detalle del backend:

- [apps/api/README.md](/N:/projects/polimarket/apps/api/README.md)

## Frontend

Frontend base en Next.js:

```powershell
npm.cmd install
npm.cmd run dev:web
```

## Linear y ejecucion

El proyecto ahora incluye una base de sincronizacion con Linear y un sistema documental para operar el roadmap y el estado real del MVP sin perder trazabilidad.

Archivos clave:

- `docs/project-status.md`
- `docs/reglamento-operativo.md`
- `docs/linear-project-board.json`
- `docs/linear-sync.md`
- `docs/decision-log.md`

Dry run del sync:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.sync_linear
```

Login OAuth local con aprobacion web:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.login_linear
```

Aplicar cambios en Linear:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.sync_linear --apply
```

## Siguiente paso recomendado

La siguiente fase natural es aprovechar `briefing + diff` para una capa de consumo todavia mas accionable, por ejemplo un digest HTTP o un resumen de cambios de corrida sin necesidad de leer todo el overview/export.
