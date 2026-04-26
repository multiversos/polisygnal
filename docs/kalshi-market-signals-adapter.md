# Kalshi Market Signals Adapter

## 1. Objetivo

El objetivo del adaptador de Kalshi es agregar una segunda fuente de señales de mercado para comparar precios y probabilidades implícitas contra Polymarket dentro de PolySignal.

Kalshi debe tratarse como una fuente externa read-only:

- No ejecuta trading.
- No crea órdenes.
- No reemplaza la investigación propia de PolySignal.
- No se usa como verdad absoluta.
- No se presenta como recomendación de apuesta.
- Sirve para detectar divergencias que ameritan investigación adicional.

Ejemplo conceptual:

| Fuente | Señal |
| --- | --- |
| Polymarket YES price | `0.5250` |
| Kalshi implied probability | `0.4900` |
| PolySignal research probability | `0.5100` |
| Interpretación | `hold`, sin edge claro |

## 2. Diagnóstico de la API de Kalshi

La documentación oficial de Kalshi indica que existen endpoints públicos de market data sin autenticación en:

```text
https://api.elections.kalshi.com/trade-api/v2
```

Aunque el subdominio contiene `elections`, la propia documentación indica que da acceso a mercados de todas las categorías, no solo elecciones.

Fuentes consultadas:

- Quick Start Market Data: https://docs.kalshi.com/getting_started/quick_start_market_data
- Get Markets: https://docs.kalshi.com/api-reference/market/get-markets
- Get Market: https://docs.kalshi.com/api-reference/market/get-market
- Get Market Orderbook: https://docs.kalshi.com/api-reference/market/get-market-orderbook
- Get Events: https://docs.kalshi.com/api-reference/events/get-events
- Get Event Metadata: https://docs.kalshi.com/api-reference/events/get-event-metadata
- Get Trades: https://docs.kalshi.com/api-reference/market/get-trades
- Get Filters for Sports: https://docs.kalshi.com/api-reference/search/get-filters-for-sports
- Get Account API Limits: https://docs.kalshi.com/api-reference/account/get-account-api-limits

### 2.1 Endpoints útiles

| Endpoint | Uso | Auth observada | Comentario |
| --- | --- | --- | --- |
| `GET /markets` | Listar mercados | Público en prueba mínima | Soporta `limit`, `cursor`, `status`, `series_ticker`, `event_ticker`, `tickers`, `mve_filter`. |
| `GET /markets/{ticker}` | Obtener mercado por ticker | Público/documentado sin headers en la página principal | Devuelve precios, volumen, reglas y metadata del mercado. |
| `GET /markets/{ticker}/orderbook` | Obtener orderbook | Quick Start dice público; la página de referencia muestra headers de auth | En prueba mínima respondió sin credenciales. |
| `GET /markets/orderbooks` | Obtener varios orderbooks | Página de referencia muestra headers de auth | Útil más adelante para batching, pero requiere confirmar auth en implementación. |
| `GET /markets/trades` | Trades recientes | Público en docs | Soporta `limit`, `cursor`, `ticker`, `min_ts`, `max_ts`. |
| `GET /events` | Listar eventos | Público en docs | Soporta `limit`, `cursor`, `status`, `series_ticker`, `with_nested_markets`, `with_milestones`. |
| `GET /events/{event_ticker}` | Evento por ticker | Público en docs | Incluye mercados del evento. |
| `GET /events/{event_ticker}/metadata` | Metadata visual/deportiva | Público en docs | Incluye `image_url`, `market_details`, `featured_image_url`, `competition`, `competition_scope`. |
| `GET /series` | Listar series | Público en docs | Permite descubrir plantillas/categorías. |
| `GET /series/{series_ticker}` | Serie por ticker | Público en docs | Incluye categoría, tags y settlement sources. |
| `GET /search/filters_by_sport` | Filtros por deporte | Público en prueba mínima | Devuelve deportes y filtros disponibles. |
| `GET /account/limits` | Límites de cuenta | Requiere auth | No usar sin credenciales explícitas. |
| `POST /portfolio/orders` y endpoints de órdenes | Trading | Requiere auth | Fuera de alcance de PolySignal. |

### 2.2 Prueba pública mínima realizada

Se ejecutaron consultas `GET` públicas, sin credenciales y sin guardar datos:

```text
GET https://api.elections.kalshi.com/trade-api/v2/markets?limit=1&status=open
GET https://api.elections.kalshi.com/trade-api/v2/search/filters_by_sport
GET https://api.elections.kalshi.com/trade-api/v2/markets/{ticker}/orderbook?depth=3
```

Resultado observado:

- `GET /markets?limit=1&status=open` respondió correctamente.
- `GET /search/filters_by_sport` respondió correctamente y listó deportes como Basketball, Baseball, Tennis, Soccer, Hockey, Golf y MMA.
- `GET /markets/{ticker}/orderbook?depth=3` respondió correctamente sin headers de autenticación.
- No se usaron API keys.
- No se escribieron datos en la base.

## 3. Datos útiles para PolySignal

Kalshi ofrece campos directamente útiles para una comparación de mercado:

| Campo Kalshi | Uso en PolySignal |
| --- | --- |
| `ticker` | Identificador único del mercado Kalshi. |
| `event_ticker` | Identificador del evento Kalshi. |
| `title` | Texto para matching contra pregunta Polymarket. |
| `subtitle`, `yes_sub_title`, `no_sub_title` | Contexto adicional para matching. |
| `status` | Filtrar mercados abiertos/cerrados. |
| `yes_bid_dollars` | Mejor bid YES en formato decimal dólar. |
| `yes_ask_dollars` | Mejor ask YES en formato decimal dólar. |
| `no_bid_dollars` | Mejor bid NO. |
| `no_ask_dollars` | Mejor ask NO. |
| `last_price_dollars` | Último precio operado. |
| `volume_fp`, `volume_24h_fp` | Actividad del mercado. |
| `liquidity_dollars` | Liquidez reportada. |
| `open_interest_fp` | Interés abierto. |
| `rules_primary`, `rules_secondary` | Reglas de resolución. |
| `close_time`, `expiration_time`, `expected_expiration_time` | Fechas para comparar temporada/evento. |
| `response_price_units` | Unidad de precio, observada como `usd_cent`. |
| `orderbook_fp.yes_dollars`, `orderbook_fp.no_dollars` | Profundidad del libro por lado. |
| `event.metadata.image_url`, `featured_image_url`, `competition` | Contexto visual y deportivo. |

## 4. Conversión a probabilidad implícita

Kalshi expone precios como strings decimales, por ejemplo:

```json
{
  "yes_bid_dollars": "0.4500",
  "yes_ask_dollars": "0.5500",
  "last_price_dollars": "0.5000"
}
```

Reglas propuestas:

1. Convertir strings a `Decimal`.
2. Normalizar a rango `0.0000` a `1.0000`.
3. Preferir mid price cuando existan bid y ask confiables:

```text
mid_price = (best_yes_bid + best_yes_ask) / 2
```

4. Usar `last_price_dollars` como fallback si no hay bid/ask.
5. Calcular spread:

```text
spread = best_yes_ask - best_yes_bid
```

6. Penalizar `source_confidence` si:

- El spread es alto.
- No hay bid/ask.
- El volumen es bajo o cero.
- La liquidez es baja o cero.
- El open interest está ausente o es bajo.
- El orderbook tiene poca profundidad.

7. Nunca convertir Kalshi en señal fuerte si `match_confidence` es bajo.

### Nota sobre orderbooks

La documentación explica que Kalshi devuelve bids YES y bids NO, no asks directos, porque en mercados binarios un bid YES a precio `X` equivale a un ask NO en `1 - X`, y un bid NO a precio `Y` equivale a un ask YES en `1 - Y`.

Por eso, para una señal robusta:

```text
best_yes_bid = mejor precio en yes_dollars
best_yes_ask = 1 - best_no_bid
spread = best_yes_ask - best_yes_bid
mid_price = (best_yes_bid + best_yes_ask) / 2
```

Si la API de `GET /markets` ya trae `yes_bid_dollars` y `yes_ask_dollars`, esos campos pueden usarse primero. El orderbook debe servir para validar profundidad y calcular una señal más confiable.

## 5. Arquitectura propuesta

PolySignal ya separa clientes, servicios, modelos, schemas, rutas y comandos. Kalshi debería integrarse con esa misma estructura sin mezclarse con Polymarket.

### 5.1 Archivos sugeridos

```text
apps/api/app/clients/kalshi.py
apps/api/app/services/external_market_signals.py
apps/api/app/services/kalshi_signal_mapper.py
apps/api/app/services/market_signal_matching.py
apps/api/app/models/external_market_signal.py
apps/api/app/schemas/external_market_signal.py
apps/api/app/api/routes_external_signals.py
apps/api/app/commands/fetch_kalshi_signals.py
apps/api/tests/test_kalshi_client.py
apps/api/tests/test_external_market_signals.py
apps/api/tests/test_market_signal_matching.py
```

### 5.2 Responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| `clients/kalshi.py` | Cliente HTTP read-only, timeouts, parsing Pydantic, sin credenciales por defecto. |
| `services/kalshi_signal_mapper.py` | Convertir payloads de Kalshi a señales normalizadas. |
| `services/market_signal_matching.py` | Comparar mercado Polymarket contra mercado Kalshi y producir `match_confidence`. |
| `services/external_market_signals.py` | Orquestar búsqueda, scoring de fuente y persistencia opcional. |
| `models/external_market_signal.py` | Tabla genérica para fuentes externas. |
| `schemas/external_market_signal.py` | Response models para API y dashboard. |
| `routes_external_signals.py` | Endpoints read-only/proxy y señales guardadas. |
| `commands/fetch_kalshi_signals.py` | CLI controlado con `--dry-run` por defecto. |

## 6. Tabla genérica propuesta

Tabla sugerida:

```text
external_market_signals
```

Debe ser genérica para Kalshi, sportsbooks, otros prediction markets y odds providers.

### 6.1 Campos recomendados para MVP

| Campo | Tipo sugerido | Nota |
| --- | --- | --- |
| `id` | integer PK | Interno. |
| `source` | string | `kalshi`, futuro `sportsbook`, etc. |
| `source_market_id` | string nullable | ID externo si existe. |
| `source_event_id` | string nullable | ID/event ticker externo. |
| `source_ticker` | string nullable | Ticker Kalshi. |
| `polymarket_market_id` | integer nullable FK | Mercado local comparado. |
| `title` | string | Título externo. |
| `yes_probability` | numeric nullable | Probabilidad implícita normalizada. |
| `no_probability` | numeric nullable | `1 - yes_probability` si aplica. |
| `best_yes_bid` | numeric nullable | Bid YES normalizado. |
| `best_yes_ask` | numeric nullable | Ask YES normalizado. |
| `best_no_bid` | numeric nullable | Bid NO normalizado. |
| `best_no_ask` | numeric nullable | Ask NO normalizado. |
| `mid_price` | numeric nullable | Señal principal si bid/ask son confiables. |
| `last_price` | numeric nullable | Fallback. |
| `volume` | numeric nullable | Actividad. |
| `liquidity` | numeric nullable | Profundidad/liquidez. |
| `open_interest` | numeric nullable | Interés abierto. |
| `spread` | numeric nullable | `best_yes_ask - best_yes_bid`. |
| `source_confidence` | numeric nullable | Calidad de señal de fuente. |
| `match_confidence` | numeric nullable | Confianza del matching contra Polymarket. |
| `match_reason` | text nullable | Razón legible. |
| `warnings` | JSON nullable | Alertas de spread, match débil, datos faltantes. |
| `raw_json` | JSON nullable | Payload parcial/raw para auditoría. |
| `fetched_at` | datetime | Cuándo se consultó la fuente. |
| `created_at` | datetime | Cuándo se guardó localmente. |

### 6.2 Campos que pueden esperar

Para el primer MVP se puede posponer:

- `source_event_id` si se usa solo ticker.
- `best_no_ask` si no se calcula desde YES.
- `raw_json` completo si preocupa tamaño, aunque conviene guardar un raw reducido.
- Índices avanzados por `source`, `source_ticker`, `polymarket_market_id`, `fetched_at`.

Recomendación: empezar con la tabla genérica completa pero con todos los campos externos nullable, para evitar migraciones repetidas.

## 7. Matching Polymarket/Kalshi

El matching es el mayor riesgo técnico. No se debe asumir equivalencia por texto parecido.

### 7.1 Señales de matching

Comparar:

- Pregunta/título.
- Participantes/equipos.
- Deporte.
- `market_shape`.
- Año/temporada.
- Fecha de cierre/expiración.
- Reglas de resolución.
- Ticker/event title de Kalshi.
- Subtítulos YES/NO.
- Competición o scope en metadata.

### 7.2 Score propuesto

`match_confidence` en rango `0.0` a `1.0`.

| Factor | Peso sugerido |
| --- | --- |
| Mismo deporte | 0.15 |
| Mismos participantes principales | 0.25 |
| Mismo `market_shape` | 0.20 |
| Misma temporada/año | 0.15 |
| Fechas compatibles | 0.10 |
| Reglas compatibles | 0.10 |
| Texto/ticker coherente | 0.05 |

### 7.3 Umbrales

| Score | Interpretación |
| --- | --- |
| `>= 0.80` | Comparable con confianza alta. |
| `0.60 - 0.79` | Posible comparación, requiere revisión. |
| `0.40 - 0.59` | Relación débil, solo mostrar como candidato. |
| `< 0.40` | No comparar como equivalente. |

### 7.4 Warnings

Ejemplos:

- `weak_match_confidence`
- `missing_participants`
- `season_mismatch`
- `market_shape_mismatch`
- `ambiguous_title`
- `rules_not_compared`
- `kalshi_market_is_multivariate`
- `high_spread`
- `low_liquidity`
- `stale_source_data`

## 8. Endpoints read-only propuestos

### 8.1 Proxy / diagnóstico sin DB

Estos endpoints consultarían Kalshi sin guardar datos:

```text
GET /external-signals/kalshi/markets?limit=10&status=open
GET /external-signals/kalshi/markets/{ticker}
GET /external-signals/kalshi/orderbook/{ticker}
GET /external-signals/kalshi/events?limit=10&status=open
GET /external-signals/kalshi/events/{event_ticker}
GET /external-signals/kalshi/sports-filters
```

Reglas:

- Read-only.
- Sin credenciales por defecto.
- Timeout corto.
- Rate limit interno simple.
- No usar endpoints de portfolio, orders o account salvo configuración explícita futura.

### 8.2 Señales guardadas

Estos endpoints leerían datos guardados localmente:

```text
GET /markets/{market_id}/external-signals
GET /external-signals?source=kalshi&limit=50
```

### 8.3 Fetch controlado futuro

Un endpoint de fetch que guarda datos debería esperar a un sprint posterior y requerir flags claros. Mejor empezar por CLI.

## 9. CLI futuro

Comando sugerido:

```text
python -m app.commands.fetch_kalshi_signals --limit 5 --dry-run
```

Opciones:

```text
--limit 5
--query "NBA Finals"
--sport nba
--market-shape championship
--market-id 133
--dry-run
--save
--max-orderbooks 5
```

Reglas:

- `--dry-run` por defecto.
- `--save` explícito para persistir.
- Nunca crear orders/trades.
- Nunca leer credenciales si no son necesarias.
- Mostrar resumen:
  - ticker
  - title
  - implied probability
  - spread
  - source_confidence
  - match_confidence
  - warnings

## 10. Dashboard futuro

Agregar una sección:

```text
External Market Signals
```

Para cada candidate:

| Campo | UI |
| --- | --- |
| Polymarket YES price | Precio actual del mercado local. |
| Kalshi implied probability | Segunda opinión de mercado. |
| Diferencia Kalshi vs Polymarket | Badge neutral, positivo o divergente. |
| `source_confidence` | Calidad del dato Kalshi. |
| `match_confidence` | Qué tan equivalente parece el mercado. |
| Warnings | Spread alto, liquidez baja, match débil. |
| `fetched_at` | Frescura de la señal. |
| Ticker Kalshi | Link o referencia textual. |

Interpretación visual:

- Mercados alineados: Kalshi y Polymarket están cerca.
- Requiere investigación: diferencia alta con buen match y buena source confidence.
- Comparación débil: match confidence bajo.
- Señal poco confiable: spread alto o liquidez baja.

Texto obligatorio:

```text
Las señales externas ayudan a priorizar investigación. No son recomendación de apuesta.
PolySignal no ejecuta apuestas automáticas ni crea órdenes.
```

## 11. Integración con scoring

Kalshi no debe mezclarse con `scoring_v1` sin control. Propuesta:

1. Mantener `scoring_v1` intacto.
2. Guardar Kalshi en `external_market_signals`.
3. Exponerlo en dashboard primero.
4. Más adelante crear un componente opcional:

```text
external_market_signal_component
```

Reglas:

- Ignorar señales con `match_confidence < 0.80`.
- Penalizar señales con `source_confidence < 0.70`.
- No empujar probabilidad más allá de un límite conservador.
- Mostrar la contribución en `components_json`.
- Mantener `confidence_score` separado de probabilidad de ganar.

## 12. Riesgos técnicos

- El matching entre plataformas puede ser ambiguo.
- Kalshi puede tener mercados multivariados que no equivalen a un mercado binario simple de Polymarket.
- La API usa cursor pagination; hay que evitar fetch masivo accidental.
- Algunas páginas de referencia muestran auth en endpoints que el Quick Start presenta como públicos; conviene implementar manejo flexible de 401.
- Los campos de precio pueden venir como strings decimales y deben manejarse con `Decimal`.
- Un spread alto puede hacer que el mid price sea poco informativo.
- La liquidez o volumen pueden ser cero.
- Deportes y categorías pueden no mapear 1:1 con la clasificación de PolySignal.
- Hay que evitar que el dashboard muestre divergencias como órdenes de acción.

## 13. Riesgos legales y regulatorios

Kalshi ofrece contratos de eventos regulados. PolySignal debe mantener lenguaje y comportamiento conservador:

- Solo lectura de datos públicos o autorizados.
- No creación de órdenes.
- No ejecución de trades.
- No automatización de apuestas.
- No presentación como consejo financiero, de inversión o de apuestas.
- Usar lenguaje de "señal externa", "comparación" y "requiere investigación".
- Evitar lenguaje como "apuesta segura", "comprar", "vender" o "trade recomendado".

## 14. Roadmap propuesto

### Fase A - Diagnóstico/API client

- Crear `clients/kalshi.py`.
- Implementar endpoints read-only:
  - `get_markets`
  - `get_market`
  - `get_market_orderbook`
  - `get_events`
  - `get_event_metadata`
  - `get_sports_filters`
- Agregar timeouts y manejo de 401/429/5xx.
- Tests con fixtures, no llamadas reales obligatorias.

### Fase B - External Market Signals Foundation

- Crear migración `external_market_signals`.
- Crear modelo y schema.
- Crear servicio normalizador.
- Crear endpoint read-only para señales guardadas.
- Crear CLI `fetch_kalshi_signals --dry-run`.

### Fase C - Matching Polymarket/Kalshi

- Reutilizar `classification.py`.
- Reutilizar extracción de participantes.
- Implementar `match_confidence`.
- Guardar `match_reason` y `warnings`.
- Tests por deporte y market shape.

### Fase D - Dashboard

- Mostrar sección "External Market Signals".
- Comparar Polymarket YES price vs Kalshi implied probability.
- Mostrar badges de source confidence y match confidence.
- Mostrar warnings.
- Mantener lenguaje read-only/no betting.

### Fase E - Scoring opcional

- Usar Kalshi como componente opcional.
- No alterar `scoring_v1` por defecto.
- Guardar impacto en `components_json`.
- Ignorar señales débiles.
- Mantener controles humanos.

## 15. Recomendación final

Recomendación: implementar el adaptador, pero por fases.

La próxima tarea debería ser solo Fase A:

- Cliente Kalshi read-only.
- Fixtures de payload realista.
- Normalización de precios a probabilidad.
- Tests.
- CLI o endpoint proxy con `limit` estricto y sin persistencia.

No conviene empezar guardando datos todavía. Primero hay que estabilizar:

- formato real de respuestas,
- manejo de orderbooks,
- cálculo de probabilidad,
- y matching de mercados.

Una vez validado eso, avanzar a `external_market_signals`.

## 16. Fase A implementada: cliente read-only + CLI dry-run

La primera fase técnica queda limitada a inspección read-only y normalización local. No persiste datos, no crea migraciones y no agrega endpoints FastAPI públicos todavía.

Archivos principales:

```text
apps/api/app/clients/kalshi.py
apps/api/app/schemas/kalshi.py
apps/api/app/services/kalshi_market_signals.py
apps/api/app/commands/inspect_kalshi_markets.py
apps/api/tests/fixtures/kalshi/
apps/api/tests/test_kalshi_market_signals.py
```

### 16.1 Comando dry-run

Listar mercados abiertos:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.inspect_kalshi_markets --limit 3 --status open
```

Salida JSON:

```powershell
.\.venv\Scripts\python.exe -m app.commands.inspect_kalshi_markets --limit 3 --status open --json
```

Inspeccionar un ticker específico:

```powershell
.\.venv\Scripts\python.exe -m app.commands.inspect_kalshi_markets --ticker KALSHI_TICKER --json
```

Inspeccionar orderbook con profundidad pequeña:

```powershell
.\.venv\Scripts\python.exe -m app.commands.inspect_kalshi_markets --ticker KALSHI_TICKER --orderbook --depth 3 --json
```

El CLI imprime explícitamente:

```text
DRY RUN / READ ONLY - no se guardan datos y no se ejecuta trading.
```

### 16.2 Qué datos muestra

Cada mercado normalizado puede mostrar:

- `source_ticker`
- `event_ticker`
- `title`
- `status`
- `yes_probability`
- `no_probability`
- `mid_price`
- `spread`
- `volume`
- `open_interest`
- `source_confidence`
- `warnings`

### 16.3 Cálculo de probabilidad

Reglas implementadas:

- Si hay `yes_bid` y `yes_ask`, usa:

```text
mid_price = (yes_bid + yes_ask) / 2
yes_probability = mid_price
```

- Si faltan bid/ask, usa `last_price` como fallback.
- Si los precios vienen como `45`, se interpretan como centavos y se convierten a `0.4500`.
- Si los precios vienen como `0.4500`, se conservan como decimal y no se dividen dos veces.
- La probabilidad se limita al rango `0.0000` a `1.0000`.

### 16.4 Source confidence

`source_confidence` mide la calidad operativa de la señal Kalshi, no la probabilidad de que ocurra el evento.

Baja cuando:

- falta bid/ask completo;
- el spread es alto;
- falta volumen;
- el volumen es cero;
- falta open interest;
- el open interest es cero;
- el mercado no está `open` o `active`;
- se usa `last_price` como fallback.

### 16.5 Garantías de seguridad de Fase A

- No usa credenciales.
- No lee `.env` con secretos para auth de Kalshi.
- No llama endpoints de orders, portfolio o account.
- No ejecuta trades.
- No crea órdenes.
- No guarda datos en DB.
- No crea `research_runs`.
- No crea `predictions`.
- No crea tabla `external_market_signals`.

### 16.6 Próximos pasos

Después de validar Fase A con fixtures y pruebas read-only, los siguientes sprints deberían ser:

1. Crear tabla genérica `external_market_signals`.
2. Implementar matching Polymarket/Kalshi con `match_confidence`.
3. Exponer señales guardadas en endpoints read-only.
4. Mostrar comparación Kalshi vs Polymarket en el dashboard.
5. Evaluar uso opcional en scoring, solo si `source_confidence` y `match_confidence` son altos.
## 17. Fase B implementada: External Market Signals Foundation

Fase B agrega la base generica para guardar senales externas de mercado sin acoplar PolySignal a Kalshi. La tabla y los endpoints estan pensados para que despues puedan convivir otras fuentes, como otros prediction markets u odds providers, siempre bajo el mismo principio: datos read-only para comparacion, no trading.

### 17.1 Tabla creada

La migracion `0008_external_market_signals.py` crea la tabla:

```text
external_market_signals
```

Campos principales:

| Campo | Uso |
| --- | --- |
| `source` | Fuente externa, por ejemplo `kalshi`. |
| `source_market_id` | Identificador externo del mercado si existe. |
| `source_event_id` | Identificador externo del evento si existe. |
| `source_ticker` | Ticker Kalshi u otro identificador de la fuente. |
| `polymarket_market_id` | Mercado local relacionado, nullable porque el matching aun no es obligatorio. |
| `title` | Titulo externo usado para auditoria y matching futuro. |
| `yes_probability`, `no_probability` | Probabilidades implicitas normalizadas en rango `0.0` a `1.0`. |
| `best_yes_bid`, `best_yes_ask`, `best_no_bid`, `best_no_ask` | Precios normalizados cuando estan disponibles. |
| `mid_price`, `last_price`, `spread` | Senal de precio y calidad del mercado. |
| `volume`, `liquidity`, `open_interest` | Actividad y profundidad cuando la fuente los expone. |
| `source_confidence` | Calidad heuristica de la senal de la fuente. |
| `match_confidence`, `match_reason` | Matching contra Polymarket, reservado para uso gradual. |
| `warnings` | Alertas estructuradas. |
| `raw_json` | Resumen auditable del payload normalizado, sin secretos. |
| `fetched_at`, `created_at` | Timestamps de consulta y persistencia local. |

La tabla no crea predicciones, no crea research runs y no implica ninguna accion de trading.

### 17.2 CLI controlado

Se agrego el comando:

```powershell
.\.venv\Scripts\python.exe -m app.commands.fetch_kalshi_signals --limit 3 --status open --json
```

Por defecto corre en modo:

```text
DRY RUN / READ ONLY
```

Para guardar senales en DB se requiere pedirlo de forma explicita:

```powershell
.\.venv\Scripts\python.exe -m app.commands.fetch_kalshi_signals --limit 1 --status open --persist --json
```

El modo `--persist` solo guarda filas en `external_market_signals`. No llama endpoints de trading, no crea ordenes, no crea `predictions` y no crea `research_runs`.

### 17.3 Endpoints read-only

Fase B expone senales ya guardadas, sin llamar Kalshi en vivo:

```text
GET /external-signals
GET /external-signals/kalshi
GET /markets/{market_id}/external-signals
```

Estos endpoints:

- solo leen la base local;
- no hacen fetch remoto;
- no guardan datos;
- no ejecutan trading;
- no crean predicciones;
- no crean research runs.

### 17.4 Matching inicial

Se agrego un modulo heuristico inicial para estimar relacion entre un mercado de Polymarket y una senal externa:

```text
app.services.external_market_matching
```

Compara:

- similitud textual de titulo/pregunta;
- participantes NBA detectables;
- anos/temporadas;
- pistas de forma de mercado como `match_winner` o `championship`.

El resultado incluye:

- `match_confidence`;
- `match_reason`;
- `warnings`.

Este matching es conservador. Si la confianza es baja, la senal debe mostrarse como posible relacion, no como equivalente.

### 17.5 Garantias de seguridad de Fase B

- No usa credenciales Kalshi.
- No usa OpenAI API.
- No llama endpoints de account, portfolio u orders.
- No ejecuta trades.
- No crea ordenes.
- No crea predicciones.
- No crea research runs.
- No descarga assets externos.
- No convierte Kalshi en recomendacion de apuesta.

### 17.6 Proximos pasos

1. Poblar senales Kalshi de forma controlada con `--persist` y limites pequenos.
2. Mejorar matching Polymarket/Kalshi con mas deportes y market shapes.
3. Agregar dashboard de `External Market Signals`.
4. Mostrar diferencia entre Polymarket YES price y Kalshi implied probability.
5. Usar estas senales en scoring solo como componente opcional, y solo con `source_confidence` y `match_confidence` altos.
