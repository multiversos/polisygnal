# Real Trading Readiness

## Objetivo

Definir una ruta segura y observada para evaluar si una wallet podria, en el futuro, avanzar desde demo hacia etapas mas cercanas a trading real.

Este documento no activa trading real.

## Principio central

El modo demo siempre existe.

Antes de considerar cualquier paso posterior, una wallet debe pasar un periodo minimo en `demo_follow` y acumular datos suficientes de:

- PnL demo cerrado
- win rate demo cerrado
- estabilidad temporal
- latencia de copia
- diferencia de precio entre source y PolySignal
- slippage y fees estimadas

## Flujo de decision de wallet

Ruta esperada:

- `candidate`
- `watching`
- `demo_follow`
- `dry_run_candidate`
- `signed_dry_run_candidate`
- `live_candidate_locked`

Interpretacion:

- `candidate`: wallet detectada o importada, sin evidencia suficiente.
- `watching`: se observa la wallet y su contexto, pero aun no entra a copia demo.
- `demo_follow`: se sigue con Copy Trading demo y se recolectan datos reales de copia sin tocar fondos.
- `dry_run_candidate`: ya hay suficiente evidencia demo para simular quotes, costos y latencia.
- `signed_dry_run_candidate`: futura etapa para validar payload y firma sin envio.
- `live_candidate_locked`: wallet teoricamente fuerte, pero live sigue bloqueado hasta revision manual.

## Regla obligatoria

Una wallet rentable en analisis no pasa directo a real.

Primero debe demostrar:

- rendimiento demo suficiente
- muestra cerrada suficiente
- latencia aceptable
- slippage razonable
- PnL neto estimado no negativo
- estabilidad de observacion

## Fuentes de datos para readiness

### Datos demo

Del track demo actual ya existen:

- `entry_price`
- `exit_price`
- `entry_amount_usd`
- `entry_size`
- `unrealized_pnl_usd`
- `realized_pnl_usd`
- `close_reason`
- `opened_at`
- `closed_at`

### Datos de perfil de wallet

Desde `wallet_profiles` ya existen:

- `score`
- `confidence`
- `roi_30d_status` y `roi_30d_value`
- `win_rate_30d_status` y `win_rate_30d_value`
- `pnl_30d_status` y `pnl_30d_value`
- `trades_30d`
- `volume_30d`
- `drawdown_30d_status` y `drawdown_30d_value`
- `markets_traded_30d`

### Datos de candidatos de analisis

Desde `wallet_analysis_candidates` ya existen:

- `wallet_address`
- `token_id`
- `side`
- `outcome`
- `observed_market_position_usd`
- `score`
- `confidence`
- `roi_30d_*`
- `win_rate_30d_*`
- `pnl_30d_*`
- `trades_30d`
- `volume_30d`
- `markets_traded_30d`
- `reasons_json`
- `risks_json`

### Datos de señales

Desde `polysignal_market_signals` ya existen:

- `market_slug`
- `condition_id`
- `predicted_side`
- `predicted_outcome`
- `polysignal_score`
- `confidence`
- `yes_score`
- `no_score`
- `outcome_scores_json`
- `wallets_analyzed`
- `wallets_with_sufficient_history`
- `warnings_json`
- `signal_status`

## Que falta antes de pensar en real

Todavia faltan mediciones consistentes y persistibles de:

- quote de PolySignal al momento de copia
- diferencia source vs quote de entrada
- diferencia source vs quote de salida
- fees estimadas confiables
- spread estimado confiable
- slippage estimado confiable
- latencia de quote, decision y `ready_to_send`
- tasa de trades fuera de ventana

Mientras falten esas fuentes, los modelos deben marcar esos campos como:

- `estimated`, o
- `unavailable`

Nunca como verificados por defecto.

## RealReadinessScore

El score de readiness debe mirar cinco grupos:

1. `Demo performance`
2. `Copyability`
3. `Wallet profile quality`
4. `Risk`
5. `Stability`

## Techos de avance

Si falta evidencia critica:

- sin demo suficiente: `not_ready` o `needs_more_demo_data`
- sin PnL demo cerrado confiable: no puede pasar de `needs_more_demo_data`
- sin latencia/slippage: como maximo `dry_run_candidate`
- aunque el score sea alto, con `real_trading_available=false` nunca hay live habilitado

## Confirmacion de seguridad

Nada de este flujo:

- firma ordenes
- envia ordenes reales
- usa private key
- usa seed phrase
- usa CLOB real operativo
- activa fondos
- cambia `real_trading_available` a `true`
