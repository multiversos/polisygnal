# Real Trading Safety Plan

## Estado actual

- Fase activa: `DEMO`
- `real_trading_available` sigue en `false`
- `demo_only` sigue en `true`
- No hay firma de ordenes
- No hay envio de ordenes reales
- No hay uso operativo de CLOB real
- No se piden `private key`, `seed phrase`, API keys ni secrets

Este sprint prepara una arquitectura segura para evolucionar desde demo sin abrir ninguna ruta de ejecucion real.

## Arquitectura por fases

### 1. DEMO

Que hace:

- Lee actividad publica de wallets seguidas.
- Normaliza y deduplica trades detectados.
- Calcula un monto fijo de copia.
- Crea `copy_orders` con estado `simulated`, `skipped` o `blocked`.
- Abre y cierra `copy_demo_positions`.
- Calcula PnL demo con precios publicos.

Que NO hace:

- No usa wallet de ejecucion.
- No construye payload listo para CLOB.
- No firma.
- No envia ordenes.
- No toca fondos.

### 2. DRY_RUN

Que haria:

- Mantener lectura publica y deteccion actual.
- Resolver una wallet de referencia opcional solo como identidad operativa futura, sin firmar.
- Consultar quote, top of book, midpoint o ultimo precio publico disponible para estimar entrada y salida.
- Construir una `execution_intent` persistible y auditable.
- Calcular latencia, edge, fees estimadas, slippage estimado y PnL neto estimado.
- Decidir `worth_copying=true/false` con motivo de rechazo si aplica.

Que NO haria:

- No firma payloads.
- No envia ordenes.
- No necesita `private key`.
- No necesita `seed phrase`.
- No activa `real_trading_available`.

### 3. SIGNED_DRY_RUN

Que haria:

- Reutilizar la misma `execution_intent` del `dry_run`.
- Construir payload exacto de orden futura.
- Firmar localmente o en un signer aislado.
- Guardar solo metadata segura del intento y huellas de auditoria.
- Medir tiempo de construccion y tiempo de firma.

Que NO haria:

- No envia ordenes.
- No toca fondos.
- No habilita worker live.
- No habilita operacion automatica.

### 4. LIVE

Que haria:

- Firmar y enviar ordenes reales solo despues de desbloqueos manuales.
- Aplicar risk engine estricto antes de cada orden.
- Requerir kill switch, limites, reconciliacion y auditoria.

Que NO debe hacer sin aprobacion explicita:

- No activar fondos por defecto.
- No correr con configuracion abierta.
- No saltarse approval gates ni limites.

## Capa generica de ejecucion

Propuesta:

- `ExecutionMode = demo | dry_run | signed_dry_run | live`
- `ExecutionIntent`: representa la decision de copia y su payload abstracto.
- `ExecutionSimulator`: enriquece la intent con mediciones, quotes y costos estimados.
- `ExecutionRiskDecision`: resultado final con `worth_copying`, `rejection_reason`, limites aplicados y severidad.
- `ExecutionDispatcher`: punto unico que decide si una intent solo se simula, se firma sin enviar, o en un futuro se envia.

Separacion sugerida:

- `copy_trading_detector`: sigue detectando y normalizando trades fuente.
- `copy_trading_risk_rules`: mantiene reglas de negocio y se expande a costos/latencia.
- `copy_trading_execution_modes`: enum, helpers y validaciones de transicion.
- `copy_trading_execution_simulator`: quote, costos, latencia, worth-copying.
- `copy_trading_execution_dispatcher`: orquesta flujo por modo.
- `copy_trading_signing`: futuro, aislado y no activado en Sprint 0.
- `copy_trading_live_executor`: futuro, aislado y apagado por defecto.

## Flujo propuesto por trade

1. Detectar trade fuente y persistir `copy_detected_trade`.
2. Calcular `ExecutionIntent` base.
3. Resolver contexto de mercado y quote de PolySignal.
4. Medir latencias desde source hasta `ready_to_send_at`.
5. Estimar fees, spread y slippage.
6. Evaluar `worth_copying`.
7. Persistir `execution_attempt` con decision final.
8. Ejecutar segun modo:
9. `demo`: crear `copy_order` simulado y abrir/cerrar `copy_demo_position`.
10. `dry_run`: persistir intento y resultado del simulador, sin firma ni envio.
11. `signed_dry_run`: persistir intento firmado, sin envio.
12. `live`: futuro, no habilitado en este sprint.

## Endpoints futuros necesarios

No implementar en este sprint. Solo reserva de arquitectura.

- `GET /copy-trading/execution/status`
- `GET /copy-trading/execution/attempts`
- `GET /copy-trading/execution/attempts/{attempt_id}`
- `POST /copy-trading/dry-run/tick`
- `POST /copy-trading/wallets/{wallet_id}/dry-run-scan`
- `POST /copy-trading/signed-dry-run/prepare`
- `POST /copy-trading/signed-dry-run/sign`
- `POST /copy-trading/live/enable`
- `POST /copy-trading/live/disable`
- `POST /copy-trading/live/kill-switch`

Guardrails requeridos para endpoints futuros:

- `live` y `signed_dry_run` deben devolver `403` o `409` hasta que exista habilitacion manual explicita.
- Ningun endpoint debe aceptar `private_key` ni `seed_phrase` en request bodies.
- Ningun endpoint debe exponer secretos en respuestas o logs.

## Tablas y campos futuros

No implementar en este sprint. Solo diseno.

### `copy_execution_attempts`

Campos sugeridos:

- `id`
- `wallet_id`
- `detected_trade_id`
- `execution_mode`
- `status`
- `action`
- `condition_id`
- `asset`
- `outcome`
- `source_proxy_wallet`
- `source_transaction_hash`
- `source_wallet_trade_at`
- `detected_at`
- `worth_copying`
- `rejection_reason`
- `created_at`
- `updated_at`

### `copy_execution_metrics`

Campos sugeridos:

- `execution_attempt_id`
- `detection_latency_ms`
- `quote_started_at`
- `quote_finished_at`
- `order_build_started_at`
- `order_build_finished_at`
- `signature_started_at`
- `signature_finished_at`
- `ready_to_send_at`
- `total_latency_ms`

### `copy_execution_pricing`

Campos sugeridos:

- `execution_attempt_id`
- `source_entry_price`
- `polysignal_entry_quote_price`
- `entry_price_delta`
- `source_exit_price`
- `polysignal_exit_quote_price`
- `exit_price_delta`
- `estimated_fees`
- `estimated_spread`
- `estimated_slippage`
- `gross_pnl_source`
- `gross_pnl_polysignal`
- `estimated_net_pnl`

### `copy_execution_risk_checks`

Campos sugeridos:

- `execution_attempt_id`
- `max_trade_usd_applied`
- `max_daily_usd_applied`
- `max_slippage_bps_applied`
- `max_delay_seconds_applied`
- `min_expected_edge_usd`
- `passed`
- `failure_code`
- `failure_message`

## Diseno del Execution Simulator

Objetivo:

- Medir si un trade seria copiable en condiciones reales sin firmar ni enviar nada.

Inputs:

- `CopyWallet`
- `CopyDetectedTrade`
- `ExecutionMode`
- quote/book snapshot publico disponible
- reloj monotonic y timestamps UTC
- posicion abierta local si el trade es `sell`

Outputs:

- `ExecutionSimulationResult`
- `worth_copying`
- `rejection_reason`
- pricing del source vs PolySignal
- costos estimados
- latencia completa

Metricas requeridas:

- `source_wallet_trade_at`
- `detected_at`
- `detection_latency_ms`
- `source_entry_price`
- `polysignal_entry_quote_price`
- `entry_price_delta`
- `source_exit_price`
- `polysignal_exit_quote_price`
- `exit_price_delta`
- `quote_started_at`
- `quote_finished_at`
- `order_build_started_at`
- `order_build_finished_at`
- `signature_started_at`
- `signature_finished_at`
- `ready_to_send_at`
- `total_latency_ms`
- `gross_pnl_source`
- `gross_pnl_polysignal`
- `estimated_fees`
- `estimated_slippage`
- `estimated_net_pnl`
- `worth_copying`
- `rejection_reason`

Semantica sugerida:

- `signature_*` queda `null` en `dry_run`
- `signature_*` puede poblarse en `signed_dry_run`
- `ready_to_send_at` existe aunque no se envie, para medir readiness

## Medicion de latencia

Definiciones:

- `source_wallet_trade_at`: timestamp fuente del trade original
- `detected_at`: cuando PolySignal persiste el trade detectado
- `detection_latency_ms = detected_at - source_wallet_trade_at`
- `quote_duration_ms = quote_finished_at - quote_started_at`
- `order_build_duration_ms = order_build_finished_at - order_build_started_at`
- `signature_duration_ms = signature_finished_at - signature_started_at`
- `total_latency_ms = ready_to_send_at - source_wallet_trade_at`

Reglas:

- Usar UTC para persistencia y `perf_counter`/monotonic para intervalos internos.
- Guardar la ausencia de timestamps como `null`, no inventar valores.
- Si falta timestamp fuente confiable, marcar `rejection_reason=missing_source_timestamp` para BUY live-like.

## Comparacion source price vs PolySignal price

Entrada:

- `source_entry_price` viene del trade fuente.
- `polysignal_entry_quote_price` viene del quote o del mejor proxy publico disponible.

Salida:

- `entry_price_delta = polysignal_entry_quote_price - source_entry_price`
- `entry_price_delta_bps = (entry_price_delta / source_entry_price) * 10000`

Misma logica para salida:

- `source_exit_price`
- `polysignal_exit_quote_price`
- `exit_price_delta`
- `exit_price_delta_bps`

Politica sugerida:

- No copiar BUY si `entry_price_delta_bps` supera el umbral permitido por wallet o por safety default.
- Permitir SELL de cierre aunque llegue tarde si existe posicion abierta, pero registrar latencia y deterioro de precio.

## Fees, spread y slippage

### PnL bruto

- `gross_pnl_source = source_exit_value - source_entry_value`
- `gross_pnl_polysignal = estimated_exit_value - estimated_entry_value`

### Fee estimada

Modelo inicial:

- `estimated_fees = entry_fee_estimate + exit_fee_estimate`

La fuente exacta de fee futura debe salir de la integracion oficial, nunca de valores hardcodeados opacos en el frontend.

### Spread estimado

Modelo inicial:

- `estimated_spread = abs(best_ask - best_bid)` si existe libro
- fallback: `abs(quote_price - last_trade_price)` si no hay best bid/ask

### Slippage estimado

Modelo inicial:

- `estimated_slippage = abs(executable_price - reference_price) * intended_size`

Donde:

- `reference_price` puede ser midpoint o mejor precio observado al inicio del quote
- `executable_price` puede ser precio estimado para el tamano deseado

### PnL neto estimado

- `estimated_net_pnl = gross_pnl_polysignal - estimated_fees - estimated_slippage`

## Reglas de worth-copying

No copiar si:

- `expected_edge <= estimated_fees + estimated_slippage + min_edge_buffer`
- `entry_price_delta_bps > max_slippage_bps`
- el BUY llega fuera de ventana y el precio ya corrio demasiado
- falta precio fuente o quote confiable
- el monto viola `max_trade_usd`
- el acumulado diario viola `max_daily_usd`
- el mercado no tiene identificadores suficientes
- el market status o liquidez no es confiable

SELL:

- Si hay posicion abierta, priorizar cierre aunque llegue tarde.
- Registrar `rejection_reason` solo si no puede cerrarse con seguridad o falta mapping de posicion.

## Riesgo obligatorio antes de LIVE

- `kill switch` global
- `kill switch` por wallet
- allowlist de wallets de ejecucion
- limites por trade, dia, mercado y wallet
- max slippage bps
- max delay seconds
- cooldown entre ordenes
- bloqueo de doble envio por `dedupe_key`
- reconciliacion post-trade
- auditoria inmutable de intent, firma y envio
- alertas ante error de quote, firma o submit
- modo `paper-first` previo a habilitar live

## Seguridad de secretos

Principios:

- Nunca guardar secrets en repo.
- Nunca imprimir secrets completos en logs.
- Nunca aceptar `private_key` o `seed_phrase` desde UI.
- Nunca almacenar material sensible en tablas de negocio.

Diseno futuro:

- Variables de entorno claras y separadas por modo.
- Signer aislado fuera del request path si hace falta.
- Posibilidad de firma fuera del servidor principal.
- Sanitizacion obligatoria de errores para evitar exponer URLs o credenciales.
- Metadata de auditoria solo con fingerprints, ids y timestamps.

Recomendacion:

- Si en el futuro se usa firma server-side, envolverla en un helper interno con interfaz minima.
- Si se usa firma client-side o signer externo, el backend debe recibir solo resultado firmado o referencia segura, nunca seed phrase.

## Desbloqueos manuales requeridos antes de LIVE

- Revision de arquitectura y threat model
- Confirmacion legal/operativa
- Runbook de incident response
- Dry runs exitosos con metricas suficientes
- Signed dry runs exitosos sin filtracion de secretos
- Kill switch probado
- Alerting probado
- Reconciliacion probada
- Approval humana documentada para cambiar `real_trading_available`

## Checklist antes de LIVE

- `real_trading_available` sigue `false` hasta aprobacion manual
- existen tests para guardrails de bloqueo
- existe `ExecutionSimulator` con metricas
- existe modelo de fees/slippage validado
- existen quotes confiables
- existe signer seguro
- existe kill switch global y por wallet
- existe reconciliacion post-submit
- existe observabilidad y alerting
- existe rollback operativo
- existe smoke test especifico de live gates

## Rollback y kill switch

Rollback esperado:

- bajar `real_trading_available` a `false`
- deshabilitar `ExecutionMode.live`
- pausar dispatcher live
- rechazar submit en API con `409`
- mantener solo `demo` y `dry_run`

Kill switch minimo:

- switch global en backend
- switch por wallet
- switch por market
- switch por signer
- switch por latency degradation

Triggers sugeridos:

- slippage fuera de rango
- quote source inestable
- errores de reconciliacion
- latencia total fuera de SLA
- errores consecutivos de submit o firma

## Confirmacion actual

- `real_trading_available` sigue en `false`
- `real_trading_enabled` sigue forzado a `false` por wallet
- el worker actual sigue siendo `demo-only`
- no se implemento `live`
- no se implemento firma real
- no se envio ninguna orden real
