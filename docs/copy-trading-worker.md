# Copy Trading Worker v1

## Estado actual

- estado: `preparado localmente`
- activacion en produccion: `pendiente`
- modo: `demo-only`
- comando base:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.copy_trading_worker --once
```

## Que hace

- Reutiliza `CopyTradingDemoWatcher.run_once()` para escanear wallets demo.
- Toma advisory lock en PostgreSQL para evitar dos workers simultaneos.
- Persiste estado y heartbeat en `copy_worker_state`.
- Guarda eventos importantes en `copy_bot_events`.
- Expone estado seguro via API para `/copy-trading/status` y `/copy-trading/watcher/status`.

## Que NO hace

- No ejecuta trading real.
- No firma ordenes.
- No usa CLOB real para ejecucion.
- No pide private key.
- No pide seed phrase.
- No activa soccer, NBA, sports legacy, snapshots ni predictions.
- No esta activado en produccion todavia.

## Comandos locales

Una sola vuelta:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.copy_trading_worker --once
```

Loop acotado de prueba:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.copy_trading_worker --loop --max-loops 3 --sleep-seconds 1
```

Loop futuro de larga vida:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.copy_trading_worker --loop --forever
```

## Variables sugeridas

- `POLYSIGNAL_COPY_WORKER_ENABLED=false`
- `POLYSIGNAL_COPY_WORKER_ALLOW_UNBOUNDED_LOOP=false`
- `POLYSIGNAL_COPY_WORKER_INTERVAL_SECONDS=5`
- `POLYSIGNAL_COPY_WORKER_CYCLE_TIMEOUT_SECONDS=8`
- `POLYSIGNAL_COPY_WORKER_LIVE_LIMIT=25`
- `POLYSIGNAL_COPY_WORKER_LIMIT=50`
- `POLYSIGNAL_COPY_WORKER_ERROR_BACKOFF_SECONDS=5`
- `POLYSIGNAL_COPY_WORKER_MAX_BACKOFF_SECONDS=60`
- `POLYSIGNAL_COPY_WORKER_HEARTBEAT_SECONDS=5`

Nota:

- algunas variables todavia son recomendacion operativa/documental para la siguiente etapa;
- la activacion real del proceso backend queda pendiente de un sprint posterior.

## Estado visible en API/UI

`/copy-trading/status` y `/copy-trading/watcher/status` pueden devolver:

- `not_started`
- `running`
- `stale`
- `stopped`
- `error`
- `unknown`

Campos utiles:

- `worker_status`
- `last_heartbeat_at`
- `last_loop_started_at`
- `last_loop_finished_at`
- `last_success_at`
- `last_error`
- `last_result_json`
- `consecutive_errors`

## Diagnostico rapido

`not_started`

- el worker no corrio todavia o no existe fila en `copy_worker_state`

`stale`

- hubo heartbeat previo, pero ya quedo viejo respecto al umbral de stale

`error`

- el ciclo mas reciente fallo y el estado persistido quedo en error o con errores consecutivos

`lock_unavailable`

- otro proceso ya tiene el advisory lock y este worker sale sin duplicar trabajo

## Deploy futuro

Objetivo futuro, no activado aun:

- correr como proceso backend/background worker separado del HTTP server
- usar el comando:

```powershell
python -m app.commands.copy_trading_worker --loop --forever
```

- mantener `POLYSIGNAL_COPY_WORKER_ENABLED=false` hasta la activacion manual
- no desplegar como API route ni como loop dentro de Vercel
