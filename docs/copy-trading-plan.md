# Copy Trading / Copiar Wallets

## Alcance

Copiar Wallets permite seguir wallets publicas de Polymarket y simular, en modo demo, que PolySignal copia operaciones usando un monto fijo definido por el usuario. La primera version es read-only para lectura publica y no ejecuta trading real.

## Modo Demo

- Modo inicial: `demo`.
- Monto inicial: `5 USD`.
- Copiar compras: activo.
- Copiar ventas: activo.
- Modo real: preparado, pero bloqueado con `real_trading_not_configured`.

El demo tick lee actividad publica de wallets seguidas, normaliza trades, deduplica por `dedupe_key`, guarda trades nuevos y crea ordenes con status `simulated`, `skipped` o `blocked`.

## Montos

Cada wallet usa un monto fijo por trade. No se copia el tamano original de la wallet seguida.

Presets:

- `$1`
- `$5`
- `$10`
- `$20`
- `Personalizado`

Reglas:

- `preset` solo acepta 1, 5, 10 o 20.
- `custom` acepta decimales positivos.
- cero, negativo o NaN se rechazan.
- si `copy_amount_usd` supera `max_trade_usd`, se limita a `max_trade_usd` y se registra `capped_by_max_trade_usd`.

## Persistencia

Tablas nuevas:

- `copy_wallets`
- `copy_detected_trades`
- `copy_orders`
- `copy_bot_events`

La migracion esta en `apps/api/alembic/versions/0018_copy_trading_wallets.py`. No debe aplicarse contra produccion sin autorizacion explicita.

## Lectura De Wallets

Inputs aceptados:

- direccion `0x...` valida;
- URL publica de Polymarket que contenga una direccion `0x...`.

La lectura reutiliza `PolymarketDataClient.get_trades_for_user`. Si la fuente publica no responde, el sistema registra un evento limpio y la UI muestra que no se pudo leer actividad publica.

## Ordenes Simuladas

Para BUY:

- si `copy_buys=true`, crea orden demo `simulated`;
- si `copy_buys=false`, crea `skipped` con `copy_buys_disabled`.

Para SELL:

- si `copy_sells=true`, crea orden demo `simulated`;
- si `copy_sells=false`, crea `skipped` con `copy_sells_disabled`.

Otras reglas:

- trade viejo: `trade_too_old`;
- sin precio: `missing_price`;
- sin side: `missing_side`;
- monto invalido: `invalid_copy_amount`;
- duplicado: no se vuelve a crear trade ni orden.

Calculo demo:

- `intended_amount_usd = copy_amount_usd` o cap por `max_trade_usd`;
- `intended_size = intended_amount_usd / source_price`;
- `simulated_price = source_price`.

## Endpoints

- `GET /copy-trading/status`
- `GET /copy-trading/wallets`
- `POST /copy-trading/wallets`
- `PATCH /copy-trading/wallets/{wallet_id}`
- `DELETE /copy-trading/wallets/{wallet_id}`
- `GET /copy-trading/trades`
- `GET /copy-trading/orders`
- `GET /copy-trading/events`
- `POST /copy-trading/wallets/{wallet_id}/scan`
- `POST /copy-trading/demo/tick`
- `GET /copy-trading/watcher/status`
- `POST /copy-trading/watcher/start`
- `POST /copy-trading/watcher/stop`
- `POST /copy-trading/watcher/run-once`

## Modo Real

Se agrego una interfaz preparada:

- `validate_real_trading_config()`
- `prepare_order()`
- `submit_order()`

Por ahora siempre bloquea ejecucion real con `real_trading_not_configured`. No pide claves privadas, no guarda seed phrases, no firma ordenes y no llama endpoints reales de ejecucion.

## Validacion

Backend:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest tests/test_copy_trading.py
```

Frontend:

```powershell
npm.cmd run build:web
npm.cmd --workspace apps/web run security:checks
npm.cmd --workspace apps/web run smoke:production
```

## Limitaciones

- No hay autenticacion ni ownership por usuario.
- No hay trading real.
- El watcher demo vive en memoria; si el proceso se reinicia, su estado se pierde.
- No hay scheduler persistente ni distribuido.
- La lectura depende de disponibilidad publica de Polymarket Data API.
- El historial real de posiciones cerradas queda para un sprint posterior.

## Watcher demo automatico

- El watcher demo escanea wallets activas en modo `demo` cada `5 segundos`.
- Reutiliza la misma logica segura de `demo tick`: lectura publica, dedupe, deteccion de BUY/SELL, ordenes demo `simulated` o `skipped`, y eventos auditables.
- No ejecuta operaciones reales, no firma ordenes, no usa private keys y no llama CLOB real.
- `Auto-refresh` de frontend y `watcher demo` son cosas distintas:
  - `Auto-refresh` solo vuelve a leer status, wallets, trades, orders y events.
  - `Watcher demo` busca trades nuevos y crea compras/ventas demo automaticamente desde backend.
- El watcher puede iniciarse, pausarse o correrse una vez mediante endpoints controlados.
- Usa un lock interno para evitar ejecuciones solapadas y no arranca un segundo loop si ya hay uno activo.
- Si una wallet falla, registra error limpio y sigue con las demas.
- Esta version en memoria es suficiente para demo inicial. La siguiente etapa natural es moverlo a worker o scheduler dedicado.
- Si el trade entra dentro de la ventana configurada por wallet, se marca como `Copiable ahora` y crea simulacion demo automatica.
- Si el trade llega tarde o ya es historico, queda registrado con texto humano y sin tratarse como error grave.

## Copy Trading tiempo real - ruta tecnica

Fase actual:

- Auto-refresh frontend cada 5s.
- Demo tick manual.
- Watcher demo backend cada 5s con control start/stop/run-once.
- Lectura publica por backend/proxy.

Fase siguiente:

- Backend polling mas fino por wallet activa.
- Cola de deteccion con dedupe y persistencia de estado.
- Estado por wallet.

Fase avanzada:

- WebSocket de mercado de Polymarket para precios y orderbook de markets detectados.
- Usar WebSocket para precio actual, spread y slippage.
- Las credenciales y user channel deben quedarse server-side.
- No exponer API credentials en frontend.

Fase real:

- ordenes FAK/FOK;
- limites;
- auditoria;
- emergency stop;
- modo real sigue bloqueado hasta sprint especifico.

## Demo positions and PnL

- Cada BUY demo `simulated` abre una posicion demo si hay precio, monto y outcome suficientes.
- Cada SELL demo `simulated` intenta cerrar la posicion abierta mas reciente de la misma wallet y del mismo asset/outcome.
- Las posiciones abiertas muestran `PnL actual` usando precio publico de mercado si esta disponible.
- Si no hay precio actual confiable, la UI muestra `Precio actual pendiente` y no inventa profit ni perdida.
- Las posiciones cerradas guardan `PnL final` y pasan al historial de copias demo.
- El dashboard expone:
  - `Copias demo abiertas`
  - `Historial de copias demo`
  - `Resumen PnL demo`
- La fuente de precio actual es de solo lectura publica. No ejecuta operaciones reales, no firma ordenes y no usa credenciales privadas.
- Limitaciones del MVP:
  - cierre parcial todavia no tiene ledger avanzado;
  - slippage, fees y best bid/ask no se modelan todavia;
  - si llega un SELL sin posicion abierta, se registra un evento limpio y el sistema sigue vivo.
- Siguiente evolucion natural:
  - ledger demo mas robusto;
  - PnL por wallet mas detallado;
  - precios en tiempo real por canal mas estable;
  - modelado de slippage y fees;
  - worker dedicado para watcher y valuacion.
