# Wallet Analysis Jobs

PolySignal mantiene tres conceptos nuevos para el analizador de links de Polymarket:

- `wallet_profiles`: perfiles persistidos de wallets candidatas.
- `wallet_analysis_jobs`: jobs persistidos para analisis profundo de wallets por mercado.
- `polysignal_market_signals`: snapshots historicos de la balanza que produjo un job.

## Wallet Profiles

Un `wallet_profile` representa una wallet candidata para observacion o seguimiento futuro.

Estados soportados:

- `candidate`
- `watching`
- `demo_follow`
- `paused`
- `rejected`

Metadatos clave:

- `score`: senal agregada de calidad relativa.
- `confidence`: `low`, `medium` o `high`.
- metricas 30d con estado independiente:
  - `verified`
  - `estimated`
  - `unavailable`

Ejemplos:

- `roi_30d_status = unavailable` significa que no hay datos suficientes para reportar ROI real.
- `win_rate_30d_status = estimated` significa que hay una aproximacion parcial, no una metrica exacta garantizada.

## Wallet Analysis Jobs

Un `wallet_analysis_job` guarda el progreso de un analisis profundo iniciado desde un link de Polymarket.

Estados soportados:

- `pending`
- `resolving_market`
- `discovering_wallets`
- `analyzing_wallets`
- `scoring`
- `completed`
- `partial`
- `failed`
- `cancelled`

Campos de progreso:

- `wallets_found`
- `wallets_analyzed`
- `wallets_with_sufficient_history`
- `yes_wallets`
- `no_wallets`
- `current_batch`

El runner por lotes de este sprint procesa el job sin bloquear una request larga:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.wallet_analysis_runner --once --job-id <job_id> --max-wallets 100
```

El runner:

- resuelve el job pendiente
- descubre wallets del mercado por posiciones y trades publicos
- procesa wallets por lotes
- guarda candidatos por `side` / `outcome`
- persiste progreso y warnings
- termina en `completed`, `partial` o `failed`

## Resolver canonico del link

La fuente de verdad para resolver metadata del mercado ahora es el backend:

```powershell
POST /wallet-analysis/resolve-link
{
  "polymarket_url": "https://polymarket.com/market/..."
}
```

La respuesta intenta devolver metadata completa y consistente:

- `source_url`
- `normalized_url`
- `market_title`
- `condition_id`
- `market_slug`
- `event_slug`
- `outcomes`
- `token_ids`
- `warnings`

Si falta metadata importante, el backend devuelve `status = partial` y deja warnings explicitos. La UI de `/analyze` debe tratar este resolver como la fuente principal y dejar el resolver TypeScript viejo solo como compatibilidad.

### Flujo minimo desde la API

1. Crear job desde el link de Polymarket:

```powershell
POST /wallet-analysis/jobs
{
  "polymarket_url": "https://polymarket.com/market/..."
}
```

2. Ejecutar una pasada limitada y controlada:

```powershell
POST /wallet-analysis/jobs/{job_id}/run-once
{
  "max_wallets": 50,
  "max_wallets_discovery": 100,
  "batch_size": 20,
  "history_limit": 100
}
```

3. Leer progreso y resumen del job:

```powershell
GET /wallet-analysis/jobs/{job_id}
```

4. Leer candidatas del job con paginacion, filtros y orden:

```powershell
GET /wallet-analysis/jobs/{job_id}/candidates?sort_by=score&sort_order=desc&limit=10
```

5. Guardar una candidata como perfil:

```powershell
POST /wallet-analysis/candidates/{candidate_id}/save-profile
```

6. Listar o actualizar perfiles guardados:

```powershell
GET /wallet-profiles?status=watching&limit=20
PATCH /wallet-profiles/{profile_id}
```

7. Activar demo-follow controlado para un perfil:

```powershell
POST /wallet-profiles/{profile_id}/demo-follow
```

Este paso:

- hace upsert en `copy_wallets`
- mantiene `mode = demo`
- mantiene `real_trading_enabled = false`
- usa `copy_wallets.created_at` como baseline
- no copia trades historicos anteriores al alta

El endpoint `run-once` es de control/manual para este sprint. No es un proceso `forever`, no reemplaza un worker persistente y no debe usarse como request larga sin limites.

Interpretacion de estado:

- `completed`: el job termino dentro de los limites configurados.
- `partial`: el job termino, pero no pudo analizar todo el universo descubierto por limites de lote o tiempo.
- `failed`: hubo un error no recuperable y se guardo un error sanitizado.

## Candidates

`wallet_analysis_candidates` guarda resultados por wallet dentro de un job:

- lado observado (`side` / `outcome`)
- metrica de posicion observada en el mercado
- score y confidence
- metricas 30d disponibles
- razones y riesgos

Desde un candidate se puede crear o actualizar un `wallet_profile`.

Guardar una candidata como perfil:

- crea o actualiza por `wallet_address`
- conserva notas manuales existentes
- no activa Copy Trading automaticamente
- deja el status inicial en `candidate`

### Estados de metricas 30d

Cada metrica puede quedar en uno de estos estados:

- `verified`: la API devolvio suficiente historia para justificar la metrica observada.
- `estimated`: la historia parece parcial o truncada por limites del fetch.
- `unavailable`: no hay datos suficientes para reportarla honestamente.

Ejemplos:

- `roi_30d_status = unavailable` significa que no hay base suficiente para calcular ROI real.
- `win_rate_30d_status = estimated` significa que la metrica existe, pero la muestra puede estar incompleta.

## PolySignal Market Signals

`polysignal_market_signals` congela la salida historica del job para poder resolverla despues contra el resultado real del mercado.

Campos relevantes:

- `predicted_side` / `predicted_outcome`
- `polysignal_score`
- `confidence`
- `yes_score` / `no_score`
- `wallets_analyzed`
- `wallets_with_sufficient_history`
- `signal_status`

Estados iniciales:

- `pending_resolution`
- `no_clear_signal`

Estados de resolucion preparados para un sprint posterior:

- `resolved_hit`
- `resolved_miss`
- `cancelled`
- `unknown`

En este sprint la resolucion real del mercado queda preparada, pero el settlement automatico completo se implementara despues.

Endpoints minimos:

```powershell
GET /polysignal-market-signals?limit=25
GET /polysignal-market-signals/{signal_id}
```

## Copy Trading Demo

Cuando una wallet candidata pase mas adelante a `demo_follow`, el alta en `copy_wallets` debe usar el baseline actual:

- `copy_wallets.created_at` marca el inicio de seguimiento efectivo
- trades anteriores a ese momento no son validos para Copy Trading demo
- el worker demo solo procesara trades nuevos desde ese momento

## Advertencia de producto

La futura balanza YES/NO de wallets no debe presentarse como garantia de victoria.

Copy obligatorio:

`Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.`
