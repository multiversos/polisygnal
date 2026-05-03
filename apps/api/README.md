# PolySignal API

Backend FastAPI del MVP de PolySignal.

## Endpoints del MVP

- `GET /`
- `GET /app`
- `GET /app/meta`
- `GET /briefing`
- `GET /briefing/latest`
- `GET /briefing/runs`
- `GET /briefing/{run_id}`
- `GET /diff/latest`
- `GET /diff/runs`
- `GET /diff/{run_id}`
- `GET /health`
- `GET /markets`
- `GET /markets/{id}`
- `GET /markets/{id}/evidence`
- `GET /markets/overview`
- `GET /markets/{id}/prediction`
- `GET /markets/{id}/predictions`
- `POST /markets/{id}/resolve`
- `GET /markets/{id}/snapshots`
- `GET /evaluation/history`
- `GET /evaluation/history/{market_id}`
- `GET /evaluation/summary`
- `GET /pipeline/latest`
- `GET /pipeline/runs`
- `GET /pipeline/{run_id}`
- `GET /reports/latest`
- `GET /reports/runs`
- `GET /reports/{run_id}`
- `GET /snapshots/latest`
- `GET /snapshots/runs`
- `GET /snapshots/{run_id}`
- `GET /status`
- `GET /status/history`
- `GET /status/history/compare`
- `GET /status/history/summary`
- `GET /dashboard/latest`
- `GET /dashboard/latest/meta`
- `GET /evidence/latest-run`
- `GET /evidence/runs`
- `GET /evidence/{run_id}`
- `GET /scoring/latest`
- `GET /scoring/runs`
- `GET /scoring/{run_id}`
- `POST /sync/polymarket`

## Setup local

Desde `apps/api`:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

### Supabase

Este backend trata Supabase como PostgreSQL administrado. No requiere
`SUPABASE_SERVICE_ROLE_KEY` ni `SUPABASE_SECRET_KEY` para las rutas actuales; la
conexion se hace por SQLAlchemy usando una URL privada de base de datos.

Variables aceptadas para la URL de base de datos, en orden de preferencia:

- `DATABASE_URL`
- `POLYSIGNAL_DATABASE_URL`
- `SUPABASE_DATABASE_URL`

Ejemplo de placeholder:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
```

Usa el pooler de Supabase si tu entorno no tiene IPv6 o si despliegas desde una
plataforma serverless. No pegues este valor en codigo, frontend ni logs.

Diagnostico no destructivo:

```powershell
.\.venv\Scripts\python -m app.commands.check_supabase_config
.\.venv\Scripts\python -m app.commands.check_supabase_config --connect
```

El segundo comando ejecuta solo `SELECT 1` y no imprime secretos.

Tests:

```powershell
.\.venv\Scripts\python -m pytest
```

## Variables relevantes

- `DATABASE_URL`
  URL privada de PostgreSQL para SQLAlchemy/Alembic. Puede apuntar a Postgres
  local o al connection string de Supabase. Tambien se aceptan los aliases
  `POLYSIGNAL_DATABASE_URL` y `SUPABASE_DATABASE_URL`.
- `POLYSIGNAL_POLYMARKET_BASE_URL`
  Gamma API para discovery.
- `POLYSIGNAL_CLOB_BASE_URL`
  CLOB API para pricing.
- `POLYSIGNAL_MVP_DISCOVERY_SCOPE`
  Scope del MVP. Valores validos: `nba`, `sports`, `all`.
- `POLYSIGNAL_POLYMARKET_SPORTS_TAG_ID`
  Tag fuente para sports en Gamma. Default: `1`.
- `POLYSIGNAL_POLYMARKET_NBA_TAG_ID`
  Tag fuente para NBA en Gamma. Default: `745`.
- `POLYSIGNAL_SNAPSHOT_BATCH_SIZE`
  Tamano de lote para lookups de Gamma/CLOB durante snapshots.
- `POLYSIGNAL_SNAPSHOT_HISTORY_DEFAULT_LIMIT`
  Limite por defecto para historico de snapshots en API.
- `POLYSIGNAL_SNAPSHOT_HISTORY_MAX_LIMIT`
  Limite maximo permitido para historico de snapshots.
- `ODDS_API_KEY`
  API key de The Odds API para evidencia estructurada de odds.
- `POLYSIGNAL_ODDS_API_BASE_URL`
  Base URL de The Odds API.
- `POLYSIGNAL_ODDS_API_TIMEOUT_SECONDS`
  Timeout del cliente de odds.
- `POLYSIGNAL_ODDS_API_REGIONS`
  Regiones enviadas al endpoint de odds. Default: `us`.
- `POLYSIGNAL_ODDS_API_MARKETS`
  Mercados de The Odds API. Default: `h2h`.
- `POLYSIGNAL_ODDS_HIGH_CONTRADICTION_DELTA`
  Delta simple para marcar `high_contradiction` en odds.
- `POLYSIGNAL_ESPN_NBA_RSS_URL`
  Feed RSS NBA de ESPN.
- `POLYSIGNAL_ESPN_RSS_TIMEOUT_SECONDS`
  Timeout del cliente RSS.
- `POLYSIGNAL_EVIDENCE_NEWS_SUMMARY_MAX_LENGTH`
  Longitud maxima del summary de evidencia news.
- `POLYSIGNAL_SCORING_MODEL_VERSION`
  Version persistida del modelo de scoring.
- `POLYSIGNAL_SCORING_ODDS_WINDOW_HOURS`
  Ventana reciente para usar evidencia `odds` en scoring.
- `POLYSIGNAL_SCORING_NEWS_WINDOW_HOURS`
  Ventana reciente para usar evidencia `news` en scoring.
- `POLYSIGNAL_SCORING_FRESHNESS_WINDOW_HOURS`
  Ventana simple para bonus de frescura.
- `POLYSIGNAL_SCORING_LOW_LIQUIDITY_THRESHOLD`
  Umbral configurable para penalizar baja liquidez.

## Discovery y sync

Discovery usa Gamma API.

- Endpoint principal: `GET /events?active=true&closed=false`
- Cuando `POLYSIGNAL_MVP_DISCOVERY_SCOPE=nba`, el sync intenta filtrar desde origen con `tag_id=745`
- Cuando `POLYSIGNAL_MVP_DISCOVERY_SCOPE=sports`, el sync intenta filtrar con `tag_id=1`
- Ademas del filtro en origen, se aplica un filtro interno explicito para no persistir ruido si Gamma devuelve eventos fuera del scope

Sync manual por API:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/sync/polymarket' | ConvertTo-Json -Depth 5
```

## Snapshots de mercado

Pricing y metricas de mercado usan dos fuentes separadas:

- Gamma API:
  `GET /markets?id=...` para `volume` y `liquidity`
- CLOB API:
  `GET /midpoint`, `GET /spread`, `GET /book`, `POST /last-trades-prices`

Comando base:

```powershell
.\.venv\Scripts\python -m app.commands.capture_market_snapshots
```

Con limite manual:

```powershell
.\.venv\Scripts\python -m app.commands.capture_market_snapshots --limit 25
```

El comando devuelve JSON con:

- `started_at`
- `finished_at`
- `duration_seconds`
- `markets_considered`
- `snapshots_created`
- `snapshots_skipped`
- `partial_errors`
- `partial_error_count`

## Automatizacion simple en Windows

La automatizacion recomendada del MVP usa:

Estos scripts se ejecutan desde la raiz del repo.

- `scripts/run_market_snapshots.ps1`
  wrapper operativo con logs y resumen
- `scripts/install_market_snapshot_task.ps1`
  instalacion reproducible del Task Scheduler
- `scripts/remove_market_snapshot_task.ps1`
  remocion rapida de la tarea

Wrapper recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_snapshots.ps1
```

Instalar el task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_snapshot_task.ps1
```

Ver ultimo resumen:

```powershell
Get-Content .\logs\market_snapshots\latest-summary.json
```

## Auditoria HTTP de etapas del pipeline

Estos endpoints no recalculan snapshots, evidence ni scoring en runtime HTTP.
Solo leen artifacts ya persistidos en `logs/market_pipeline/<stage>/`.

Fuente de verdad por etapa:

- snapshots:
  `logs/market_pipeline/snapshots/latest-summary.json`
  y `logs/market_pipeline/snapshots/<run_id>.summary.json`
- evidence:
  `logs/market_pipeline/evidence/latest-summary.json`
  y `logs/market_pipeline/evidence/<run_id>.summary.json`
- scoring:
  `logs/market_pipeline/scoring/latest-summary.json`
  y `logs/market_pipeline/scoring/<run_id>.summary.json`

Endpoints de auditoria:

- `GET /snapshots/latest`
- `GET /snapshots/runs`
- `GET /snapshots/{run_id}`
- `GET /evidence/latest-run`
- `GET /evidence/runs`
- `GET /evidence/{run_id}`
- `GET /scoring/latest`
- `GET /scoring/runs`
- `GET /scoring/{run_id}`

Ejemplos:

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

Comportamiento operativo esperado:

- `latest`
  devuelve el ultimo artifact disponible de la etapa
- `runs`
  devuelve una lista compacta ordenada de mas reciente a mas antiguo
- `/{run_id}`
  devuelve el detalle resumido de una corrida puntual
- si no hay corridas, `latest` responde con `artifact_available=false`
- si el `run_id` no existe, responde `404` con mensaje claro
- si el summary esta incompleto, la respuesta usa lo disponible y prioriza campos compactos

## Estado operativo HTTP

`GET /status` resume la salud y frescura del MVP completo en una sola llamada.
No ejecuta pipeline, no recalcula scoring y no lee base de datos para reconstruir etapas.
Solo reutiliza los artifacts ya persistidos por las capas existentes.

Componentes resumidos:

- `pipeline`
- `snapshots`
- `evidence`
- `scoring`
- `reports`
- `briefing`
- `diff`

Bloque adicional:

- `dashboard`

Campos por componente:

- `artifact_available`
- `health_status`
- `status`
- `generated_at`
- `run_id`
- `age_seconds`
- `freshness_status`
- `partial_error_count`
- `artifact_incomplete`
- `message`
- `paths`
- `details`

Campos globales:

- `overall_status`
- `generated_at`
- `components_ok`
- `components_warning`
- `components_error`
- `components_missing`
- `freshness_thresholds`
- `recent_non_ok_components`

Campos de `dashboard`:

- `artifact_available`
- `dashboard_available`
- `status`
- `generated_at`
- `dashboard_path`
- `overall_status`
- `total_top_opportunities`
- `total_watchlist`
- `warning_reason`

Regla simple para `dashboard_available`:

- `true` solo si existe bloque `dashboard`, `dashboard.ran = true`, `dashboard.status = ok` y `dashboard_path` no es `null`
- `false` si el bloque falta, viene en `warning` o `error`, no corrio o no trae `dashboard_path`

Regla simple para `dashboard.generated_at`:

- se deriva del `generated_at` del latest summary del pipeline solamente cuando existe bloque `dashboard`
- si el bloque `dashboard` falta, devuelve `null`

Reglas simples de freshness:

- `fresh` si la ultima corrida tiene `<= 10800` segundos de edad
- `aging` si tiene `<= 21600` segundos de edad
- `stale` si supera `21600` segundos
- `unknown` si no hay timestamp usable

Reglas simples de overall:

- `error` si cualquier componente esta en `error`
- `missing` si falta un componente critico: `pipeline`, `snapshots`, `evidence` o `scoring`
- `warning` si no hay errores ni faltantes criticos, pero existe algun `warning` o falta un componente no critico
- `ok` si todo el resumen actual esta sano

Nota:

- el bloque `dashboard` es solo informativo en `GET /status`
- no cambia `overall_status` global ni los conteos `components_ok`, `components_warning`, `components_error` y `components_missing`
- `recent_non_ok_components` tambien puede incluir `dashboard` cuando el latest summary del pipeline trae `dashboard.status = warning` o `error`

Ejemplo:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status' | ConvertTo-Json -Depth 8
```

## Dashboard HTML por HTTP

`GET /` redirige a `GET /dashboard/latest`.
`GET /app` tambien redirige a `GET /dashboard/latest`.
`GET /app/meta` devuelve metadata minima del shell de entrada reutilizando exactamente `GET /dashboard/latest/meta`.

`GET /dashboard/latest` sirve directamente el artifact `logs/dashboard/latest-dashboard.html`.
No regenera dashboard en runtime, no recalcula nada y responde `404` claro si el archivo todavia no existe.

`GET /dashboard/latest/meta` devuelve metadata minima del mismo artifact:

- `artifact_available`
- `path`
- `generated_at`

Si el artifact no existe, responde `200` con `artifact_available = false`, `path = null` y `generated_at = null`.
`generated_at` se deriva de forma simple desde el filesystem del archivo servido, sin abrir otra fuente.

Ejemplo:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:8000/dashboard/latest' -OutFile latest-dashboard.html
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/dashboard/latest/meta' | ConvertTo-Json -Depth 4
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/app/meta' | ConvertTo-Json -Depth 4
```

## Historial operativo HTTP

`GET /status/history` resume tendencia operativa usando solamente los summaries historicos ya persistidos del pipeline.
No ejecuta etapas, no recalcula estado desde base de datos y no reconstruye corridas en runtime.

Fuente de verdad:

- `logs/market_pipeline/<run_id>.summary.json`
- dentro de cada summary reutiliza los bloques ya embebidos de:
  - `steps.snapshots`
  - `steps.evidence`
  - `steps.scoring`
  - `reports`
  - `briefing`
  - `diff`
  - `dashboard`

Alcance operativo del historial:

- sigue corridas end-to-end del pipeline
- no intenta inventar una linea temporal unificada a partir de corridas manuales aisladas fuera del pipeline

Filtros soportados:

- `limit`
- `status`
- `component`

Campos utiles por item:

- `run_id`
- `generated_at`
- `overall_status`
- `components`
- `non_ok_components`
- `dashboard_available`
- `dashboard_status`
- `pipeline_status`
- `reports_status`
- `briefing_status`
- `diff_status`
- `partial_error_count`
- `run_gap_seconds`
- `freshness_status`
- `summary_path`

Regla simple para `dashboard_available`:

- `true` solo si existe bloque `dashboard`, `dashboard.ran = true`, `dashboard.status = ok` y `dashboard_path` no es `null`
- `false` si el bloque falta, viene en `warning` o `error`, no corrio o no trae `dashboard_path`

Regla simple de freshness del historial:

- para el item mas reciente, `run_gap_seconds` mide el tiempo desde esa corrida hasta ahora
- para items historicos, `run_gap_seconds` mide el hueco hasta la corrida mas nueva siguiente
- `fresh`, `aging` y `stale` usan los mismos thresholds que `GET /status`

Ejemplos:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?status=warning' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history?component=evidence' | ConvertTo-Json -Depth 8
```

## Resumen de tendencia del historial operativo

`GET /status/history/summary` agrega conteos compactos sobre el mismo window historico que usa `GET /status/history`.
No ejecuta etapas, no recalcula pipeline y no abre otra fuente de verdad.
Solo reutiliza los mismos summaries de `logs/market_pipeline/<run_id>.summary.json` y sus bloques embebidos.

Filtros soportados:

- `limit`
- `status`
- `component`

Campos principales:

- `generated_at`
- `window_size`
- `matched_count`
- `dashboard_available_count`
- `overall_status_counts`
- `trend_signal`
- `most_problematic_components`
- `components`

Reglas simples de `trend_signal`:

- `no_data`
  si no hay corridas en el window filtrado
- `stable`
  si no hubo `warning`, `error` ni `missing`
- `attention_needed`
  si hubo `error`, `missing` o un componente acumula muchos no-ok dentro del window
- `degraded`
  en los demas casos con mezcla de estados

Ejemplos:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/summary?component=evidence' | ConvertTo-Json -Depth 8
```

## Comparacion simple entre windows historicos

`GET /status/history/compare` reutiliza exactamente la misma base historica que `GET /status/history` y `GET /status/history/summary`.
No ejecuta pipeline, no recalcula scoring y no abre otra fuente distinta.

Definicion simple:

- window actual:
  las ultimas `N` corridas que matchean el filtro
- window anterior:
  las `N` corridas inmediatamente anteriores que matchean el mismo filtro

Filtros soportados:

- `limit`
- `status`
- `component`

Campos principales:

- `generated_at`
- `window_size`
- `matched_count`
- `filters`
- `current_window`
- `previous_window`
- `comparison`
- `component_trends`
- `most_degraded_components`
- `most_improved_components`
- `top_attention_components`
- `trend_signal`

Disponibilidad historica de dashboard:

- `GET /status/history` agrega `dashboard_available` y `dashboard_status` por run
- `GET /status/history/summary` agrega `dashboard_available_count` para el window actual filtrado
- `current_window` y `previous_window` agregan `dashboard_available_count`
- `comparison` agrega `dashboard_available_delta` cuando la comparacion entre windows esta lista

Regla simple de comparacion:

- primero compara `error_count + missing_count`
- si eso empata, compara `warning_count + error_count + missing_count`
- si baja en el window actual, `improved`
- si sube, `degraded`
- si se mantiene, `stable`
- si no hay bloque anterior completo, `insufficient_history`

Lectura por componente:

- `component_trends` devuelve un item por `pipeline`, `snapshots`, `evidence`, `scoring`, `reports`, `briefing` y `diff`
- cada item expone `current_non_ok_count`, `previous_non_ok_count`, `delta_non_ok` y `trend`
- tambien incluye `current_status_counts` y `previous_status_counts` para no tener que recomputar la lectura por componente fuera de la API
- cada item agrega `changed_from` y `changed_to` para ver la transicion exacta del estado del componente entre el run previo y el actual
- cada item agrega `latest_changed_run_id`, `latest_changed_generated_at`, `latest_changed_summary_path`, `previous_changed_run_id`, `previous_changed_generated_at`, `previous_changed_summary_path` y `change_reason` para saltar rapido al par de artifacts mas util
- tambien expone `latest_changed_artifact_available` y `previous_changed_artifact_available` para marcar si esos summaries siguen existiendo en disco

Regla simple para `latest_changed_run_id`:

- si el componente `improved`, apunta al run mas antiguo del `current_window`
- si el componente `degraded`, apunta al run mas reciente del `current_window` donde el componente esta `non-ok`
- si el componente esta `stable`, devuelve `null`
- si hay `insufficient_history`, devuelve `null`

Regla simple para `previous_changed_run_id`:

- si el componente `improved`, apunta al run mas reciente del `previous_window` donde ese componente estaba `non-ok`
- si el componente `degraded`, apunta al run mas reciente del `previous_window` donde ese componente estaba `ok`
- si el componente esta `stable`, devuelve `null`
- si hay `insufficient_history`, devuelve `null`

Regla simple para `*_summary_path`:

- usa exactamente el `summary_path` del mismo history item ya elegido para `latest_changed_run_id` o `previous_changed_run_id`
- si ese summary file ya no existe o no hay path usable, devuelve `null`
- si el run historico existe pero el bloque del componente fue parcial, el endpoint igual devuelve el path del summary del pipeline si ese archivo sigue disponible

Regla simple para `changed_from` y `changed_to`:

- usa exactamente los mismos history items ya elegidos para `previous_changed_run_id` y `latest_changed_run_id`
- `changed_from` es el estado del componente en el run previo seleccionado
- `changed_to` es el estado del componente en el run actual seleccionado
- si el componente esta `stable` o hay `insufficient_history`, ambos devuelven `null`
- si el run existe pero el estado del componente no viene usable dentro del history item, devuelve `unknown`

Valores posibles de `change_reason`:

- `stable`
- `insufficient_history`
- `first_current_window_run_after_improvement`
- `latest_current_window_non_ok_run`

Ejemplos:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare?limit=5' | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status/history/compare?component=evidence' | ConvertTo-Json -Depth 8
```

## Evidence pipeline MVP

Esta fase agrega evidencia inicial para `sports / nba / winner` usando solo:

- The Odds API
  endpoint objetivo: `/v4/sports/basketball_nba/odds`
- ESPN RSS NBA
  feed: `https://www.espn.com/espn/rss/nba/news`

### Esquema

Se agregan dos tablas:

- `sources`
- `evidence_items`

Persistencia minima:

- `sources`
  `market_id`, `provider`, `source_type`, `external_id`, `title`, `url`, `published_at`, `fetched_at`, `raw_json`, `raw_text`
- `evidence_items`
  `market_id`, `source_id`, `provider`, `evidence_type`, `stance`, `strength`, `confidence`, `summary`, `high_contradiction`, `bookmaker_count`, `metadata_json`

### Matching NBA

Reglas MVP:

- se extraen equipos desde `market.question`
- se usa un diccionario fijo de los 30 equipos NBA con variantes conocidas
- no hay fuzzy matching ni embeddings
- solo pasan a evidence los mercados con `2` equipos NBA concretos en la pregunta
- para odds:
  - si hay dos equipos, el match exige que ambos coincidan con `home_team` y `away_team`
- mercados con un solo equipo tipo finals/champion/series futures se registran como `skipped_non_matchable`
- mercados de premios/jugadores/coaches o formas no parseables se registran como `skipped_unsupported_shape`
- los `skipped` no cuentan como warning operacional

### Reglas de odds

- `bookmaker_count`
  cantidad de bookmakers con cuota usable para el equipo objetivo
- `confidence`
  - `1 -> 0.25`
  - `2 -> 0.50`
  - `3-4 -> 0.75`
  - `5+ -> 1.00`
- `strength`
  promedio simple de probabilidad implicita
- `stance`
  - `favor` si `implied_prob >= 0.55`
  - `against` si `implied_prob <= 0.45`
  - `neutral` si cae entre ambos
- `high_contradiction`
  heuristica simple: `max(implied_prob) - min(implied_prob) >= POLYSIGNAL_ODDS_HIGH_CONTRADICTION_DELTA`

### Reglas de news

Para ESPN RSS:

- se guarda `title`
- se guarda `published_at`
- se guarda `url`
- `raw_text = title + description`
- `source_type = "news"`

En `evidence_items`:

- `evidence_type = "news"`
- `stance = "unknown"`
- `strength = null`
- `confidence = null`
- `summary = titulo + descripcion truncada`
- `high_contradiction = false`

### Comandos

Evidencia para un mercado puntual:

```powershell
.\.venv\Scripts\python -m app.commands.capture_market_evidence --market-id 155
```

Evidencia para un subconjunto de mercados `nba / winner`:

```powershell
.\.venv\Scripts\python -m app.commands.capture_nba_winner_evidence --limit 25
```

### Lectura HTTP de evidencia

Leer evidencia persistida de un mercado:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/evidence' | ConvertTo-Json -Depth 8
```

Filtrar por tipo:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/evidence?evidence_type=news' | ConvertTo-Json -Depth 8
```

La respuesta incluye:

- datos del `evidence_item`
- `source` relacionado embebido
- orden por fecha mas reciente primero
- `404` cuando el mercado no existe

### Transparencia operativa de evidence

El estado operativo de evidence ya queda visible por HTTP en respuestas de mercado:

- `GET /markets/{id}`
- `GET /markets/{id}/prediction`
- `GET /markets/{id}/predictions`
- `GET /markets/overview`

Campos expuestos:

- `evidence_eligible`
- `evidence_shape`
- `evidence_skip_reason`

Regla operativa del MVP:

- `matchup`
  mercado con `2` equipos NBA concretos; puede pasar a evidence
- `futures`
  mercado tipo finals/champion/conference con `1` equipo o forma future no matcheable
- `ambiguous`
  mercado de premios/jugadores/coaches o forma no parseable para este pipeline

Interpretacion simple:

- `evidence_eligible = true`
  el mercado puede intentar match contra Odds API + ESPN RSS
- `evidence_eligible = false`
  el mercado se salta por diseno y no debe leerse como warning operativo
- `evidence_skip_reason`
  explica por que se salta, por ejemplo `single_team_market`

## Lectura HTTP de scoring

Prediccion mas reciente:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/prediction' | ConvertTo-Json -Depth 8
```

Historico simple:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/155/predictions?limit=10' | ConvertTo-Json -Depth 8
```

La respuesta incluye:

- `market`
  metadata minima del mercado
- `prediction`
  prediccion mas reciente, o `null` si el mercado aun no tiene scoring
- `latest_prediction`
  prediccion mas reciente en el endpoint historico
- `items`
  historial en orden de mas reciente a mas antiguo

Cada prediction expone:

- `id`
- `market_id`
- `run_at`
- `model_version`
- `yes_probability`
- `no_probability`
- `confidence_score`
- `edge_signed`
- `edge_magnitude`
- `edge_class`
- `opportunity`
- `review_confidence`
- `review_edge`
- `explanation_json`

## Resolucion manual y evaluacion minima

Esta fase agrega solo una capa minima de evaluacion.
No resuelve mercados desde Polymarket, no escribe `was_correct` en `predictions` y no expone historial avanzado.

Tabla nueva:

- `market_outcomes`
  - `market_id` unico
  - `resolved_outcome`
    `yes`, `no` o `cancelled`
  - `resolution_source`
    default `manual`
  - `notes`
  - `resolved_at`

Resolver un mercado manualmente:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/markets/155/resolve' -ContentType 'application/json' -Body '{"resolved_outcome":"yes","notes":"manual close"}' | ConvertTo-Json -Depth 8
```

Reglas del endpoint:

- valida que el mercado exista
- valida que el mercado no este ya resuelto
- valida `resolved_outcome`
- crea el outcome
- marca `markets.closed = true`
- devuelve el registro creado

Resumen minimo de evaluacion:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/evaluation/summary' | ConvertTo-Json -Depth 8
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

Campos incluidos:

- `accuracy`
- `opportunity_accuracy`
- `brier_score`
- `total_predictions`
- `evaluable`
- `cancelled`
- `pending`
- `first_resolution`
- `last_resolution`

Reglas simples:

- usa join entre `predictions` y `market_outcomes`
- `cancelled` no cuenta como acierto ni fallo
- correcta si `yes_probability >= 0.50` y outcome `yes`
- correcta si `yes_probability < 0.50` y outcome `no`
- `opportunity_accuracy` solo cuenta predictions con `opportunity = true`
- `brier_score = mean((yes_probability - actual_outcome)^2)`
- `actual_outcome = 1.0` para `yes`
- `actual_outcome = 0.0` para `no`

Campos por item de `GET /evaluation/history`:

- `market_id`
- `question`
- `prediction_id`
- `run_at`
- `resolved_at`
- `resolved_outcome`
- `yes_probability`
- `no_probability`
- `opportunity`
- `was_correct`
- `brier_component`

Reglas simples del historial:

- usa join entre `predictions`, `market_outcomes` y `markets`
- ordena por `resolved_at` descendente
- soporta solo `limit`
- si `resolved_outcome = cancelled`, devuelve `was_correct = null` y `brier_component = null`

Lectura simple por mercado:

- `GET /evaluation/history/{market_id}` devuelve `market_id`, `question`, `resolved_outcome`, `resolved_at` e `items`
- usa el mismo join entre `predictions`, `market_outcomes` y `markets`
- ordena `items` por `run_at` ascendente
- si el mercado no existe, responde `404`
- si el mercado existe pero no tiene outcome, responde `404` claro
- si el mercado existe, tiene outcome y no tiene predictions, responde `200` con `items = []`

Comportamiento:

- `404` cuando el mercado no existe
- `200` con payload vacio consistente cuando el mercado existe pero aun no tiene predictions

## Overview agregado de mercados

Endpoint principal del Sprint 6:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview' | ConvertTo-Json -Depth 8
```

Filtros simples soportados:

- `sport_type`
  default `nba`
- `market_type`
  default `winner`
- `active`
  opcional
- `opportunity_only`
  opcional
- `evidence_eligible_only`
  opcional
- `evidence_only`
  solo mercados cuyo scoring uso evidence real
- `fallback_only`
  solo mercados scoreados por fallback de snapshot
- `bucket`
  `priority`, `watchlist`, `review_fallback`, `fallback_only`, `no_prediction`
- `edge_class`
  opcional: `no_signal`, `moderate`, `strong`, `review`
- `sort_by`
  opcional: `priority`, `edge_magnitude`, `confidence_score`, `run_at`
- `limit`
- `offset`

Orden por defecto:

- `opportunity = true` primero
- luego `evidence_eligible = true`
- luego mayor `edge_magnitude`
- luego mayor `confidence_score`
- luego `run_at` mas reciente

La respuesta incluye por item:

- `market`
  metadata minima del mercado
- `latest_snapshot`
  ultimo snapshot persistido o `null`
- `latest_prediction`
  ultima prediction persistida o `null`
- `evidence_summary`
  contadores y `latest_evidence_at`
- `priority_rank`
  posicion agregada en el orden actual
- `priority_bucket`
  senal operativa simple: `priority`, `watchlist`, `review_fallback`, `fallback_only`, `no_prediction`
- `scoring_mode`
  `evidence_backed`, `fallback_only` o `no_prediction`

Dentro de `market`, el overview tambien expone:

- `evidence_eligible`
- `evidence_shape`
- `evidence_skip_reason`

Comportamiento operativo importante:

- si un mercado no es elegible para evidence, `evidence_summary` se devuelve en cero en el overview
- eso evita que evidencia legacy contamine la lectura operativa aunque el mercado siga teniendo historial previo

Ejemplos utiles:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?evidence_eligible_only=true&sort_by=confidence_score&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?opportunity_only=true&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?bucket=watchlist&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?evidence_only=true&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?fallback_only=true&sort_by=priority&limit=25' | ConvertTo-Json -Depth 8
```

## Export operativa simple

Comando base:

```powershell
.\.venv\Scripts\python -m app.commands.export_market_overview --preset top_opportunities --format json --limit 25
```

Presets disponibles:

- `top_opportunities`
- `watchlist`
- `evidence_backed`
- `fallback_only`
- `all`

Exportar a archivo JSON:

```powershell
.\.venv\Scripts\python -m app.commands.export_market_overview --preset top_opportunities --format json --limit 25 --output .\..\..\logs\exports\top_opportunities.json
```

Exportar a CSV:

```powershell
.\.venv\Scripts\python -m app.commands.export_market_overview --preset fallback_only --format csv --limit 50 --output .\..\..\logs\exports\fallback_only.csv
```

Filtros reutilizables del comando:

- `--bucket`
- `--opportunity-only`
- `--evidence-only`
- `--fallback-only`
- `--evidence-eligible-only`
- `--sort-by`
- `--limit`

## Briefing operativo compacto

Endpoint compacto para responder rapido que revisar ahora:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing' | ConvertTo-Json -Depth 8
```

Lectura de artifacts ya generados:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/latest' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/runs?limit=10' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/briefing/20260421_161034' | ConvertTo-Json -Depth 8
```

Query params simples:

- `sport_type`
  default `nba`
- `market_type`
  default `winner`
- `active`
  default `true`
- `top_limit`
  default `5`
- `watchlist_limit`
  default `5`
- `review_limit`
  default `5`

La respuesta resume:

- `top_opportunities`
- `watchlist`
- `review_flags`
- `operational_counts`
- `freshness`

Nota operativa:

- el briefing filtra internamente a mercados no cerrados para alinearse con el subset operativo del pipeline

Generar archivos compactos manualmente:

```powershell
.\.venv\Scripts\python -m app.commands.generate_briefing
```

Por defecto escribe en `logs/briefings`:

- `latest-briefing.json`
- `latest-briefing.txt`
- archivos timestamped por corrida

El briefing reutiliza la priorizacion actual del overview:

- `top_opportunities`
  primeros mercados con `opportunity = true` y orden `priority`
- `watchlist`
  primeros mercados con `bucket = watchlist`
- `review_flags`
  mercados con `review_edge = true` o `review_confidence = true`

Wrapper operativo desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_briefing.ps1
```

Artifacts adicionales del wrapper en `logs/briefings`:

- `latest-summary.json`
- `<timestamp>.summary.json`
- `runs.log`

Regla importante:

- `GET /briefing/latest`, `GET /briefing/runs` y `GET /briefing/{run_id}` leen solo artifacts existentes en `logs/briefings`
- no recalculan el briefing en runtime HTTP
- si falta el JSON principal de una corrida, la respuesta sigue siendo consistente y devuelve metadata + `briefing = null`

## Dashboard HTML estatico

Comando base:

```powershell
.\.venv\Scripts\python -m app.commands.generate_dashboard
```

Salida por default:

- `logs/dashboard/latest-dashboard.html`
- `logs/dashboard/<timestamp>.dashboard.html`

Fuentes reutilizadas por el comando:

- equivalente interno de `GET /briefing`
- equivalente interno de `GET /markets/overview?opportunity_only=true`
- equivalente interno de `GET /evaluation/summary`

Adicionalmente, si el status operativo ya esta disponible por artifacts, el dashboard muestra `overall_status`.

Regla importante:

- el comando genera solo un artifact HTML estatico
- no crea endpoints nuevos
- no hace llamadas HTTP hacia la propia API
- no cambia DB ni recalcula scoring

Ejemplo con limites explicitos:

```powershell
.\.venv\Scripts\python -m app.commands.generate_dashboard --top-limit 5 --watchlist-limit 5
```

Wrapper operativo desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_dashboard.ps1
```

## Diff operativo entre corridas

Comando base:

```powershell
.\.venv\Scripts\python -m app.commands.generate_market_diff
```

Wrapper operativo desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_diff.ps1
```

Fuente de verdad del diff:

- snapshot compacto derivado de `markets/overview`
- un snapshot por corrida guardado en `logs/diffs`
- comparacion contra el snapshot previo mas reciente

Thresholds simples del MVP:

- `yes_probability >= 0.05`
- `confidence_score >= 0.10`
- `edge_magnitude >= 0.05`

El diff resume:

- mercados que entraron en `top_opportunities`
- mercados que salieron de `top_opportunities`
- cambios de `priority_bucket`
- cambios materiales en score, confidence o edge

Lectura HTTP simple del diff mas reciente:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/latest' | ConvertTo-Json -Depth 8
```

Listado corto de corridas disponibles:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/runs?limit=10' | ConvertTo-Json -Depth 8
```

Detalle de una corrida puntual:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/diff/20260421_161036' | ConvertTo-Json -Depth 8
```

Regla importante:

- los endpoints leen artifacts existentes en `logs/diffs`
- no recalcula el diff en runtime HTTP
- si `latest-diff.json` no existe, usa `latest-summary.json` y snapshots solo para devolver una respuesta consistente
- `GET /diff/runs` usa `*.summary.json` timestamped como indice del historico
- `GET /diff/{run_id}` usa el `*.summary.json` de esa corrida y, si existe, el `*.diff.json` asociado

Artefactos en `logs/diffs`:

- `latest-diff.json`
- `latest-diff.txt`
- `latest-summary.json`
- `latest-snapshot.json`
- archivos timestamped por corrida
- `runs.log`

## Reports por HTTP desde artifacts

Lectura del ultimo bundle de reports:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/latest' | ConvertTo-Json -Depth 8
```

Listado corto de corridas:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/runs?limit=10' | ConvertTo-Json -Depth 8
```

Detalle de una corrida puntual:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/reports/20260421_161302' | ConvertTo-Json -Depth 8
```

Regla importante:

- los endpoints leen artifacts ya existentes en `logs/reports`
- no recalculan exports en runtime HTTP
- cada detalle devuelve metadata de la corrida y los JSON por preset cuando estan disponibles
- si falta el JSON de un preset, ese preset sigue apareciendo con metadata y `json_payload = null`

## Reportes operativos periodicos

Wrapper operativo desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_reports.ps1
```

Defaults del wrapper:

- presets:
  `top_opportunities`, `watchlist`, `evidence_backed`, `fallback_only`
- formatos:
  `json`, `csv`
- limite:
  `50`

Artefactos generados en `logs/reports`:

- `latest-top-opportunities.json`
- `latest-top-opportunities.csv`
- `latest-watchlist.json`
- `latest-watchlist.csv`
- `latest-evidence-backed.json`
- `latest-evidence-backed.csv`
- `latest-fallback-only.json`
- `latest-fallback-only.csv`
- archivos timestamped por corrida
- `latest-summary.json`
- `runs.log`

Summary operativo:

- `started_at`
- `finished_at`
- `duration_seconds`
- `status`
- `presets`
- `formats`
- `generated_presets`
- `partial_error_count`

Frecuencia recomendada del MVP:

- cada `120` minutos
- razon:
  mantiene el reporte alineado con el pipeline/scoring actual sin generar ruido excesivo

Instalar la tarea programada:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_reports_task.ps1 -RunAfterCreate
```

Eliminar la tarea:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remove_market_reports_task.ps1
```

Como revisar si corrio bien:

- abrir `logs/reports/latest-summary.json`
- revisar `generated_presets`
- revisar `logs/reports/runs.log`
- consultar la tarea:

```powershell
schtasks /Query /TN "PolySignal-Market-Reports" /V /FO LIST
```

Ejemplos:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?opportunity_only=true&limit=25' | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/overview?edge_class=review&limit=10' | ConvertTo-Json -Depth 8
```

### Salida de comandos

Ambos comandos devuelven JSON con:

- `status`
- `started_at`
- `finished_at`
- `duration_seconds`
- `sources_created`
- `sources_updated`
- `evidence_created`
- `evidence_updated`
- `markets_eligible_for_evidence`
- `markets_matchup_shape`
- `markets_futures_shape`
- `markets_ambiguous_shape`
- `markets_skipped_non_matchable`
- `markets_skipped_unsupported_shape`
- `markets_with_odds_match`
- `markets_with_news_match`
- `odds_matches`
- `odds_missing_api_key`
- `odds_no_match`
- `news_items_matched`
- `skipped_markets`
- `partial_errors`

### Contexto deportivo estructurado

La etapa de evidence deja una sola convencion para contexto deportivo estructurado y esa es la fuente de verdad que usa scoring:

- path canonico:
  `evidence_items.metadata_json.structured_context`
- version actual:
  `sports_context_v1`
- campos numericos canonicos:
  `injury_score`, `form_score`, `rest_score`, `home_advantage_score`

Shape persistido:

```json
{
  "structured_context": {
    "version": "sports_context_v1",
    "injury_score": "0.0000",
    "form_score": "0.0000",
    "rest_score": "0.0000",
    "home_advantage_score": "0.0000",
    "availability": {
      "injury_score": false,
      "form_score": false,
      "rest_score": false,
      "home_advantage_score": false
    },
    "reasons": {
      "injury_score": "missing_injury_score",
      "form_score": "missing_form_score",
      "rest_score": "missing_rest_score",
      "home_advantage_score": "missing_home_advantage_score"
    }
  }
}
```

Reglas simples del MVP:

- scoring lee primero y de forma canonica solo `metadata_json.structured_context`
- si un provider trae `raw_json.structured_context` con el mismo shape, evidence lo normaliza y lo persiste en `metadata_json.structured_context`
- si falta un componente, evidence lo deja en `0.0000` con `availability = false`
- si existe dato usable, evidence lo deja visible con valor pequeno y `availability = true`
- valores pequenos y acotados por componente:
  maximo absoluto `0.0150`

Derivacion minima actual:

- odds:
  deriva `home_advantage_score` desde `home_team` y `away_team` del evento matcheado
- news:
  acepta `raw_json.structured_context` con el shape canonico
  y, si no viene completo, intenta derivar senales chicas de `injury_score`, `form_score` y `rest_score` desde texto persistido

Importante:

- esta capa no cambia la formula principal `market + odds`
- solo deja contexto estructurado persistido y reusable
- si no hay contexto suficiente, scoring mantiene el comportamiento actual y aplica `0.0`

### Mercado externo y line movement

La etapa de evidence tambien deja una convencion canonica para mercado externo en odds. Scoring usa este bloque como capa pequena y explicita despues de `market + odds + structured_context`.

- path canonico:
  `evidence_items.metadata_json.external_market`
- version actual:
  `external_market_v1`
- campos canonicos:
  `opening_implied_prob`, `current_implied_prob`, `line_movement_score`, `consensus_strength`

Shape persistido:

```json
{
  "external_market": {
    "version": "external_market_v1",
    "opening_implied_prob": null,
    "current_implied_prob": "0.5917",
    "line_movement_score": "0.0000",
    "consensus_strength": "0.7500",
    "availability": {
      "opening_implied_prob": false,
      "current_implied_prob": true,
      "line_movement_score": false,
      "consensus_strength": true
    },
    "reasons": {
      "opening_implied_prob": "missing_opening_implied_prob",
      "current_implied_prob": "derived_from_current_bookmaker_odds",
      "line_movement_score": "missing_opening_implied_prob",
      "consensus_strength": "derived_from_bookmaker_count_and_dispersion"
    }
  }
}
```

Reglas simples del MVP:

- `current_implied_prob` se deriva del promedio de implied probability de bookmakers del evento odds matcheado
- `opening_implied_prob` se acepta si el provider ya lo trae en `raw_json.external_market.opening_implied_prob`; si falta, queda `null`
- `line_movement_score` se deriva como `current_implied_prob - opening_implied_prob` cuando ambos existen
- `line_movement_score` esta acotado a maximo absoluto `0.0150`
- `consensus_strength` se deriva de profundidad de bookmakers y dispersion simple entre implied probabilities
- `consensus_strength` afecta confianza con una bonificacion pequena; no mueve agresivamente probabilidad
- si faltan datos, `line_movement_score` y `consensus_strength` quedan en `0.0000` o no disponibles, y scoring mantiene comportamiento equivalente

### Data quality score

Scoring calcula un `data_quality_score` explicativo en rango `0.0000` a `1.0000` usando solo senales ya cargadas en el contexto de scoring.
No cambia la probabilidad base ni recalcula datos externos.

Formula simple:

- `valid_odds`:
  `+0.2500` si hay odds validas recientes
- `useful_evidence_count`:
  hasta `+0.1500`, proporcional a `min(evidence_count / 2, 1)`
- `structured_context_available`:
  `+0.1500` si existe al menos un componente de `structured_context`
- `external_market_available`:
  `+0.1500` si existe `external_market` usable
- `liquidity_available`:
  `+0.1000` si el snapshot trae liquidez
- `liquidity_above_threshold`:
  `+0.1000` si la liquidez supera `POLYSIGNAL_SCORING_LOW_LIQUIDITY_THRESHOLD`
- `low_contradiction`:
  `+0.1000` si hay evidencia util y no hay `high_contradiction`
- `high_contradiction_penalty`:
  `-0.1500` si hay `high_contradiction`

Uso en confidence:

- si `data_quality_score >= 0.5000`, agrega un apoyo menor:
  `0.0300 * data_quality_score`
- si es menor, no modifica `confidence_score`
- nunca modifica `yes_probability`

`explanation_json.data_quality` muestra:

- `data_quality_score`
- rango
- regla de apoyo a confianza
- componentes con `code`, `weight`, `value`, `applied` y `note`

### Action score

Scoring calcula un `action_score` explicativo en rango `0.0000` a `1.0000`.
Es solo una senal operativa de priorizacion: no cambia `yes_probability`, no cambia `opportunity`, no escribe columnas nuevas y no dispara trading.

Formula simple:

- `edge_magnitude`:
  peso `0.4000`, normalizado contra `0.2500`
- `confidence_score`:
  peso `0.2500`, usa el `confidence_score` ya calculado
- `data_quality_score`:
  peso `0.2000`, usa el score explicativo de calidad de datos
- `opportunity_bonus`:
  peso `0.1000`, solo si la regla existente de `opportunity` ya dio `true`
- `liquidity_signal`:
  peso `0.0500`, `1.0` si la liquidez supera el umbral, `0.5` si hay liquidez baja, `0.0` si falta

La suma se acota a `0.0000` - `1.0000`.
Si faltan datos, el score sigue funcionando con los componentes disponibles.

`explanation_json.action` muestra:

- `action_score`
- rango
- `usage = prioritization_only`
- impacto nulo sobre probabilidad y `opportunity`
- componentes con `code`, `weight`, `value`, `applied` y `note`

### Comportamiento sin `ODDS_API_KEY`

Si `ODDS_API_KEY` no esta configurada:

- el pipeline no falla
- se omite solo la parte de odds
- ESPN RSS sigue procesandose
- el comando devuelve un warning claro en `partial_errors`

## Historico

Historico persistido en base:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/1/snapshots?limit=20' | ConvertTo-Json -Depth 5
```

Detalle enriquecido:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/markets/1' | ConvertTo-Json -Depth 5
```

Nota importante:

- El cliente CLOB ya encapsula `GET /prices-history`, pero el endpoint historico expone el historico persistido localmente en `market_snapshots`

## Scoring v1 MVP

Scoring v1 aplica solo a mercados `sports / nba / winner`.

Persistencia:

- tabla `predictions`
  `market_id`, `run_at`, `model_version`, `yes_probability`, `no_probability`, `confidence_score`, `edge_signed`, `edge_magnitude`, `edge_class`, `opportunity`, `review_confidence`, `review_edge`, `explanation_json`

Ventanas recientes del MVP:

- `odds`: `POLYSIGNAL_SCORING_ODDS_WINDOW_HOURS` (default `24`)
- `news`: `POLYSIGNAL_SCORING_NEWS_WINDOW_HOURS` (default `48`)
- `freshness`: `POLYSIGNAL_SCORING_FRESHNESS_WINDOW_HOURS` (default `24`)

Liquidez baja:

- `POLYSIGNAL_SCORING_LOW_LIQUIDITY_THRESHOLD` (default `50000`)

Formula de probabilidad:

- si hay evidencia `odds` valida:
  `yes_probability = (0.40 * market_yes_price) + (0.60 * odds_implied_prob)`
- si no hay `odds` valida:
  `yes_probability = market_yes_price`
- siempre:
  `no_probability = 1 - yes_probability`

Comandos manuales:

```powershell
.\.venv\Scripts\python -m app.commands.score_market --market-id 155
```

```powershell
.\.venv\Scripts\python -m app.commands.score_nba_winner_markets --limit 25
```

El batch de scoring recorre el subconjunto operativo del MVP:

- `sport_type = nba`
- `market_type = winner`
- `active = true`
- `closed = false`

Wrapper operativo recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_scoring.ps1 -Limit 25
```

Salida util:

- `prediction_id`
- `market_id`
- `model_version`
- `yes_probability`
- `no_probability`
- `confidence_score`
- `edge_signed`
- `edge_magnitude`
- `edge_class`
- `opportunity`
- `review_confidence`
- `review_edge`
- `used_odds_count`
- `used_news_count`
- `partial_errors`
- `partial_error_count`
- `predictions_updated`

Notas:

- `news` no mueve direccion en v1; solo impacta `confidence_score`
- el ajuste estructurado deportivo usa solo `evidence_items.metadata_json.structured_context`
- `injury_score`, `form_score`, `rest_score` y `home_advantage_score` son pequenos y explicitos; si faltan, quedan en `0.0000`
- line movement usa solo `evidence_items.metadata_json.external_market.line_movement_score` y queda visible en `explanation_json.external_market`
- `consensus_strength` queda visible en `explanation_json.external_market` y afecta solo la confianza
- `data_quality_score` queda visible en `explanation_json.data_quality` y puede dar un apoyo menor a `confidence_score`; no cambia probabilidad
- `action_score` queda visible en `explanation_json.action`; sirve solo para priorizacion/orden operativo y no cambia probabilidad ni `opportunity`
- el scoring no se dispara automaticamente desde evidence pipeline en esta fase
- el scoring sigue corriendo para todo `nba / winner`, pero ignora evidence en mercados no elegibles para este pipeline
- `explanation_json` deja trazabilidad simple de inputs, bonuses, penalties, counts y summary
- Todavia no hay WebSockets, tiempo real ni clasificacion con IA de noticias

## Automatizacion simple de scoring en Windows

Esta fase deja una automatizacion equivalente al flujo de snapshots:

Estos scripts se ejecutan desde la raiz del repo.

- `scripts/run_market_scoring.ps1`
  wrapper manual con resumen y logs
- `scripts/install_market_scoring_task.ps1`
  crea o actualiza la tarea programada
- `scripts/remove_market_scoring_task.ps1`
  elimina la tarea

Frecuencia recomendada para MVP:

- cada `120` minutos
- razon:
  el scoring no es tiempo real, `predictions` es append-only y esta cadencia da visibilidad operativa sin generar demasiado ruido

Ejecutar wrapper manual:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_scoring.ps1 -Limit 25
```

Instalar la tarea programada:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_scoring_task.ps1 -EveryMinutes 120 -Limit 25
```

Eliminar la tarea:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remove_market_scoring_task.ps1
```

Logs de scoring:

- `logs/market_scoring/latest-summary.json`
- `logs/market_scoring/<timestamp>.summary.json`
- `logs/market_scoring/<timestamp>.command-output.txt`
- `logs/market_scoring/runs.log`

Como revisar si corrio bien:

- abrir `logs/market_scoring/latest-summary.json`
- verificar `status`, `markets_considered`, `predictions_created`, `predictions_updated` y `partial_error_count`
- consultar la tarea:

```powershell
schtasks /Query /TN "PolySignal-Market-Scoring" /V /FO LIST
```

## Orquestacion simple del pipeline MVP

Esta fase deja un wrapper secuencial y auditable para:

1. snapshots
2. evidence
3. scoring
4. reports
5. briefing
6. diff
7. dashboard

Scripts principales desde la raiz del repo:

- `scripts/run_market_evidence.ps1`
  wrapper operativo de evidence para `nba / winner`
- `scripts/run_market_pipeline.ps1`
  ejecuta snapshots -> evidence -> scoring -> reports -> briefing -> diff en orden
- `scripts/run_market_briefing.ps1`
  wrapper operativo del briefing compacto
- `scripts/run_market_diff.ps1`
  wrapper operativo del diff entre corridas
- `scripts/run_market_dashboard.ps1`
  wrapper operativo del dashboard HTML estatico
- `scripts/install_market_pipeline_task.ps1`
  instala la tarea programada del pipeline
- `scripts/remove_market_pipeline_task.ps1`
  elimina la tarea del pipeline

Subset operativo del pipeline:

- `discovery_scope = nba`
- `market_type = winner`
- `active = true`
- `closed = false`

Frecuencia recomendada para MVP:

- cada `120` minutos
- razon:
  mantiene el flujo alineado sin convertir el MVP en casi tiempo real y sin generar demasiada carga/logs

Wrapper manual:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_market_pipeline.ps1 -Limit 25
```

Notas de ejecucion:

- por defecto corre tambien `reports`, `briefing`, `diff` y `dashboard` al final
- si `pipeline` termina en `error`, no corren `reports`, `briefing`, `diff` ni `dashboard`
- si `pipeline` termina en `ok` o `warning`, `reports` si corre para dejar salidas frescas
- `briefing` corre solo cuando `reports` queda en `ok`
- `diff` corre solo cuando `briefing` queda en `ok`
- `dashboard` corre como ultimo paso solo cuando `pipeline`, `reports` y `briefing` quedaron utilizables
- si `dashboard` falla, el pipeline maestro no oculta el problema: lo deja visible como `warning` en el bloque `dashboard`
- para debug puntual todavia se puede usar `-SkipReports`

Instalar la tarea programada:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_market_pipeline_task.ps1 -EveryMinutes 120
```

Eliminar la tarea:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remove_market_pipeline_task.ps1
```

Logs del pipeline:

- `logs/market_pipeline/latest-summary.json`
- `logs/market_pipeline/<timestamp>.summary.json`
- `logs/market_pipeline/<timestamp>.snapshots.wrapper-output.txt`
- `logs/market_pipeline/<timestamp>.evidence.wrapper-output.txt`
- `logs/market_pipeline/<timestamp>.scoring.wrapper-output.txt`
- `logs/market_pipeline/runs.log`
- `logs/reports/latest-summary.json`
- `logs/briefings/latest-summary.json`
- `logs/diffs/latest-summary.json`
- `logs/dashboard/latest-summary.json`
- `logs/dashboard/latest-dashboard.html`

Cada corrida deja:

- `status`
- `started_at`
- `finished_at`
- `duration_seconds`
- `partial_error_count`
- `pipeline`
  bloque con `status`, `steps` y `operational_summary`
- `reports`
  bloque con `status`, `generated_presets` y `summary_path`
- `briefing`
  bloque con `status`, `json_path`, `txt_path` y conteos basicos
- `diff`
  bloque con `status`, `comparison_ready`, `json_path`, `txt_path` y conteos de cambios
- `dashboard`
  bloque con `status`, `dashboard_path` y conteos compactos de top opportunities/watchlist
- `steps`
  con resumen de `snapshots`, `evidence` y `scoring`
- `operational_summary`
  con agregados cortos de evidence y scoring para lectura rapida

Campos operativos nuevos mas utiles:

- `operational_summary.evidence.markets_eligible_for_evidence`
- `operational_summary.evidence.markets_skipped_non_matchable`
- `operational_summary.evidence.markets_skipped_unsupported_shape`
- `operational_summary.evidence.markets_with_odds_match`
- `operational_summary.evidence.markets_with_news_match`
- `operational_summary.scoring.markets_scored_with_any_evidence`
- `operational_summary.scoring.markets_scored_with_snapshot_fallback`
- `operational_summary.scoring.used_odds_count`
- `operational_summary.scoring.used_news_count`

Filosofia de fallos:

- una etapa con `warning` o `error` queda registrada en `steps`
- el pipeline intenta continuar con las etapas siguientes para no fallar de forma opaca
- el estado global queda en `ok`, `warning` o `error` segun el peor resultado observado

Como revisar si corrio bien:

- abrir `logs/market_pipeline/latest-summary.json`
- revisar `pipeline.status`
- revisar `reports.status`
- revisar `briefing.status`
- revisar `diff.status`
- revisar `reports.generated_presets`
- revisar `briefing.json_path` y `briefing.txt_path`
- revisar `diff.json_path` y `diff.txt_path`
- revisar `dashboard.dashboard_path`
- revisar `steps.snapshots.summary.command_payload`
- revisar `steps.evidence.summary.command_payload`
- revisar `steps.scoring.summary.command_payload`
- revisar `logs/reports/latest-summary.json`
- revisar `logs/briefings/latest-summary.json`
- revisar `logs/diffs/latest-summary.json`
- revisar `logs/dashboard/latest-summary.json`
- abrir `logs/dashboard/latest-dashboard.html`
- consultar la tarea:

```powershell
schtasks /Query /TN "PolySignal-Market-Pipeline" /V /FO LIST
```

Nota operativa actual:

- la corrida full validada del pipeline + reports + briefing + diff debe quedar en `ok`
- evidence considero `141` mercados, proceso `8`, salto `47` como `non_matchable` y `86` como `unsupported_shape`
- scoring proceso `141` mercados: `8` usando evidence real y `133` por fallback de snapshot
- reports deja frescos `top_opportunities`, `watchlist`, `evidence_backed` y `fallback_only`
- briefing deja frescos `latest-briefing.json` y `latest-briefing.txt`
- diff deja frescos `latest-diff.json` y `latest-diff.txt`
- esos `skipped` quedaron visibles en summary sin contaminar `partial_errors`

## Pipeline por HTTP desde artifacts

Lectura de la corrida mas reciente:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/latest' | ConvertTo-Json -Depth 8
```

Listado corto de corridas:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/runs?limit=10' | ConvertTo-Json -Depth 8
```

Detalle de una corrida puntual:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/pipeline/20260421_160938' | ConvertTo-Json -Depth 8
```

Regla importante:

- estos endpoints leen solo artifacts existentes en `logs/market_pipeline`
- no recalculan pipeline, reports, briefing ni diff en runtime HTTP
- si una corrida antigua no tiene bloques `reports`, `briefing` o `diff`, la respuesta sigue siendo consistente y devuelve esos bloques en `null`
- el detalle compacta `steps` para exponer estados y metricas utiles sin arrastrar payloads gigantes como `skipped_markets`

## Reconciliacion de evidencia legacy

Esta fase deja una estrategia simple e hibrida para mercados `nba / winner`:

- exclusión operativa:
  scoring ignora evidence en mercados no elegibles y el overview muestra `evidence_summary = 0`
- limpieza explicita:
  un comando opcional permite borrar evidencia legacy del MVP en mercados que hoy ya son `skipped`

Alcance del comando:

- revisa solo mercados `sport_type = nba`, `market_type = winner`, `active = true`, `closed = false`
- conserva evidencia valida de mercados elegibles
- solo toca providers del MVP actual:
  `the_odds_api` y `espn_rss`

Dry-run:

```powershell
.\.venv\Scripts\python -m app.commands.reconcile_legacy_evidence
```

Aplicar limpieza:

```powershell
.\.venv\Scripts\python -m app.commands.reconcile_legacy_evidence --apply
```

Salida util:

- `markets_considered`
- `markets_eligible`
- `markets_non_eligible`
- `markets_with_legacy_evidence`
- `markets_cleaned`
- `sources_found`
- `evidence_found`
- `sources_deleted`
- `evidence_deleted`
- `cleaned_markets`
- `partial_error_count`

Uso recomendado:

- correr primero sin `--apply`
- revisar `cleaned_markets`
- aplicar solo cuando el subconjunto listado coincida con markets `skipped` por diseno
