# Wallet Analysis Jobs

PolySignal mantiene dos conceptos nuevos para el analizador de links de Polymarket:

- `wallet_profiles`: perfiles persistidos de wallets candidatas.
- `wallet_analysis_jobs`: jobs persistidos para analisis profundo de wallets por mercado.

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

En este sprint base el job se crea y persiste el mercado resuelto, pero el analisis profundo completo queda para un sprint posterior.

## Candidates

`wallet_analysis_candidates` guarda resultados por wallet dentro de un job:

- lado observado (`side` / `outcome`)
- metrica de posicion observada en el mercado
- score y confidence
- metricas 30d disponibles
- razones y riesgos

Desde un candidate se puede crear o actualizar un `wallet_profile`.

## Copy Trading Demo

Cuando una wallet candidata pase mas adelante a `demo_follow`, el alta en `copy_wallets` debe usar el baseline actual:

- `copy_wallets.created_at` marca el inicio de seguimiento efectivo
- trades anteriores a ese momento no son validos para Copy Trading demo

## Advertencia de producto

La futura balanza YES/NO de wallets no debe presentarse como garantia de victoria.

Copy obligatorio:

`Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.`
