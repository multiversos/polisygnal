# Deep Analyzer Engine Plan

Fecha de corte: `2026-05-12`.

Este documento define la arquitectura futura del Analizador profundo de
PolySignal. Este sprint solo prepara contratos, helpers conservadores y UI de
readiness. No activa llamadas externas nuevas, scraping, jobs, migraciones ni
predicciones nuevas.

## Regla principal

El Analizador de enlaces tiene un solo modo: analisis profundo.

La fuente primaria para resolver el mercado sigue siendo Polymarket/Gamma/CLOB
read-only. Los datos internos de PolySignal no son fuente principal de matching
del enlace.

Si una capa no tiene datos reales, debe quedar como `pending`, `blocked`,
`unavailable` o `partial`. No se rellenan noticias, odds, Kalshi matches,
wallets, win rate, ROI, resultados ni probabilidades.

## Auditoria de modulos existentes

### Polymarket, Gamma y CLOB

- Frontend:
  - `apps/web/app/lib/polymarketLinkResolver.ts`
  - `apps/web/app/api/analyze-polymarket-link/route.ts`
  - `apps/web/app/lib/polymarketResolutionAdapter.ts`
  - `apps/web/app/api/resolve-polymarket/route.ts`
- Backend:
  - `apps/api/app/clients/polymarket.py`
  - `apps/api/app/clients/clob.py`
  - `apps/api/app/clients/polymarket_data.py`

Estado:

- Conectado para `/analyze` en modo read-only via Gamma estructurado.
- Devuelve mercado, evento, outcomes, precios, volumen, liquidez, ids y estado
  cuando Gamma los trae.
- No usa mercados internos como fallback.
- Reutilizable como `PolymarketMarketReader`.

Riesgos:

- Dependencia de disponibilidad Gamma.
- Algunos mercados no traen ids compatibles para wallet intelligence.
- No debe devolver payload crudo.

### Movimiento del mercado

- Backend:
  - `GET /markets/{market_id}/price-history`
  - `apps/api/app/services/market_price_history.py`
  - `apps/api/app/clients/clob.py` encapsula `prices-history`.
- Frontend:
  - historial local puede guardar precios visibles del analisis.

Estado:

- Existe para mercados internos con snapshots/historial.
- No esta conectado al analizador live de Polymarket si el mercado no existe
  internamente.
- Readiness parcial: volumen/liquidez/precios actuales ya se muestran.

Falta:

- Adaptador live por `conditionId`/token id para historial de precio sin DB
  interna.
- Rate limit y cache si se consulta CLOB live.

### Wallet Intelligence

- Backend:
  - `apps/api/app/clients/polymarket_data.py`
  - `apps/api/app/services/wallet_intelligence.py`
  - `apps/api/app/schemas/wallet_intelligence.py`
  - `GET /markets/{market_id}/wallet-intelligence`
- Frontend:
  - `apps/web/app/lib/walletIntelligenceTypes.ts`
  - `apps/web/app/lib/walletIntelligence.ts`
  - `apps/web/app/lib/walletIntelligenceAdapter.ts`

Estado:

- Conectado read-only para ids compatibles.
- Filtra umbral `$100+`.
- Abrevia direcciones.
- Puede indicar capital observado y sesgo YES/NO/Neutral si la fuente lo trae.
- No calcula win rate ni ROI historico confiable.

Reutilizable como:

- `WalletIntelligenceAnalyzer`.

Riesgos:

- No doxxing.
- No copy-trading.
- No direccion completa por defecto.
- Wallets pueden hacer hedge o perder.

### Perfiles publicos de wallets

- Backend:
  - `polymarket_data.py` tiene funciones preparadas:
    `get_user_profile`, `get_user_positions`, `get_user_closed_positions`.
- Frontend:
  - tipos para `WalletPerformanceProfile`.

Estado:

- Preparado, no integrado al analizador profundo.
- No hay win rate/ROI confiable visible en UI.

Falta:

- Fuente estructurada de posiciones cerradas por wallet.
- Matching de mercados resueltos.
- Politica de retencion, rate limits y privacidad.

### Evidence, odds y noticias

- Backend:
  - `apps/api/app/services/evidence_pipeline.py`
  - `apps/api/app/clients/the_odds_api.py`
  - `apps/api/app/clients/espn_rss.py`
  - `GET /markets/{market_id}/evidence`
  - `GET /evidence/latest-run`
  - `GET /evidence/runs`
- Frontend:
  - `apps/web/app/lib/evidenceTypes.ts`
  - `apps/web/app/lib/researchReadiness.ts`

Estado:

- Evidence pipeline legacy existe para subset NBA interno.
- Puede consultar The Odds API y ESPN RSS cuando se ejecuta el pipeline backend
  con configuracion y API key.
- El analizador actual no activa esas llamadas.
- La UI actual solo muestra readiness o fuentes reales si ya existen.

Falta:

- Backend job dedicado por enlace live.
- Allowlist/rate limit/cache para research web.
- Normalizacion multi-categoria, no solo NBA.

### Research externo

- Backend:
  - `apps/api/app/services/research/pipeline.py`
  - `apps/api/app/services/research/openai_client.py`
  - `apps/api/app/services/research/codex_agent_adapter.py`
  - `POST /markets/{market_id}/research/run`
  - `GET /markets/{market_id}/research/latest`
  - `GET /research/runs`
  - `GET /research/runs/{run_id}/quality-gate`
- Docs:
  - `docs/external-research-plan.md`
  - `docs/codex-agent-research-adapter.md`

Estado:

- Backend tiene foundation de research, local fallback, OpenAI web_search
  opcional y packet flow para agente externo.
- Es operativo/legacy para mercados internos y puede escribir runs, findings,
  reports y predictions si se ejecuta.
- No esta conectado al analizador live Polymarket-first.
- No se activa en este sprint.

Riesgos:

- Requiere secrets, allowlist, rate limit, cache, backend jobs y quality gate.
- No debe ejecutarse desde frontend.
- No se deben guardar HTML crudo ni payloads no sanitizados.

### Kalshi

- Backend:
  - `apps/api/app/clients/kalshi.py`
  - `apps/api/app/services/kalshi_market_signals.py`
  - `apps/api/app/services/external_market_signals.py`
  - `apps/api/app/services/external_market_signal_matching.py`
  - `apps/api/app/api/routes_external_signals.py`
  - comandos `fetch_kalshi_signals.py`, `inspect_kalshi_markets.py`,
    `match_external_signals.py`
- Docs:
  - `docs/kalshi-market-signals-adapter.md`

Estado:

- Cliente read-only y normalizacion de probabilidades existen.
- Hay endpoints para senales externas ya persistidas o unmatched.
- No hay comparador conectado a `/analyze`.
- No se llama Kalshi en este sprint.

Falta:

- Matching por pregunta, categoria, fecha y reglas.
- Control de rate limit/cache.
- Politica de confianza y explicacion de diferencias entre exchanges.

### Decision, scoring e historial

- Backend:
  - `apps/api/app/services/scoring.py`
  - `apps/api/app/services/research/scoring.py`
  - `apps/api/app/services/market_decisions.py`
- Frontend:
  - `apps/web/app/lib/analysisDecision.ts`
  - `apps/web/app/lib/analysisHistory.ts`
  - `apps/web/app/lib/analysisLifecycle.ts`
  - `apps/web/app/lib/analyzerResult.ts`
  - `apps/web/app/lib/estimationSignals.ts`
  - `apps/web/app/lib/polySignalEstimateEngine.ts`

Estado:

- Frontend v0 es conservador: no genera estimacion si faltan senales
  independientes.
- Historial mide precision solo con prediccion clara y resultado confiable.
- Pendientes, cancelados, unknown y sin decision fuerte no cuentan.

Falta:

- Decision engine profundo backend con versionado.
- Persistencia por usuario.
- Jobs de seguimiento/resolucion.

## Arquitectura objetivo

### 1. PolymarketMarketReader

- Input: URL validada o slugs/ids de Polymarket.
- Output: mercado normalizado, outcomes, precios, volumen, liquidez, estado,
  ids.
- Estado actual: implementado para `/analyze` via Gamma read-only.
- Fuente: Gamma/Polymarket/CLOB.
- Riesgos: disponibilidad, payload incompleto.
- Decision: no genera decision; solo capa base.

### 2. MarketMovementAnalyzer

- Input: market id, condition id, token ids, snapshots/precios.
- Output: movimiento de precio, volumen, liquidez, volatilidad, cambios.
- Estado actual: parcial para mercados internos; pendiente para live markets.
- Fuente: CLOB/Gamma/snapshots.
- Requiere API externa: si consulta CLOB live.
- Decision: senal auxiliar futura, no unica.

### 3. WalletIntelligenceAnalyzer

- Input: market id/condition id compatible.
- Output: wallets relevantes `$100+`, capital observado, sesgo YES/NO/Neutral,
  warnings.
- Estado actual: conectado read-only si id compatible.
- Fuente: endpoint backend read-only.
- Decision: senal auxiliar; no decide sola.

### 4. WalletProfileAnalyzer

- Input: wallets publicas abreviadas internamente, closed positions
  estructuradas.
- Output: resolved markets, win rate real, ROI real, consistencia, riesgo.
- Estado actual: no conectado.
- Fuente: Polymarket Data API si se aprueba.
- Riesgos: privacidad, rate limit, doxxing.
- Decision: podria elevar confianza si hay historial real.

### 5. ExternalResearchAgent

- Input: mercado, categoria, participantes, fecha, fuentes permitidas.
- Output: hallazgos con fuente, cita, confiabilidad, direccion, frescura.
- Estado actual: foundation backend existe, no conectado al analizador.
- Requiere API externa: si se activa web/news.
- Riesgos: fuente falsa, contenido crudo, costos, rate limit.
- Decision: puede aportar evidencia independiente solo tras quality gate.

### 6. OddsComparator

- Input: mercado Polymarket, participantes/fecha, proveedor odds.
- Output: implied probability externa, dispersion, movimiento, consenso.
- Estado actual: cliente The Odds API legacy para NBA.
- Requiere API externa: si se activa.
- Decision: senal independiente futura, no unica.

### 7. KalshiComparator

- Input: pregunta/fecha/categoria de Polymarket.
- Output: contrato Kalshi comparable, probabilidad, liquidez, warnings.
- Estado actual: cliente y normalizador existen; no conectado a `/analyze`.
- Requiere API externa o senales persistidas.
- Decision: senal externa futura si el match es confiable.

### 8. CategoryContextAnalyzer

- Input: categoria, deporte, politica, cripto, economia, noticias,
  entretenimiento.
- Output: factores relevantes por vertical y faltantes.
- Estado actual: contexto deportivo basico para soccer y categoria/slug.
- Decision: readiness; no predice solo.

### 9. EvidenceScorer

- Input: senales reales de las capas anteriores.
- Output: balance de evidencia, confianza, motivos, warning de calidad.
- Estado actual: helper v0 conservador; scoring backend legacy existe.
- Decision: compuerta necesaria antes de DecisionEngine.

### 10. DecisionEngine

- Input: evidence score, calibracion, market price separado.
- Output: YES/NO/WEAK/NONE, probabilidades PolySignal si existen, confidence.
- Estado actual: no genera nuevas probabilidades.
- Regla actual: precio de mercado no es estimacion PolySignal.

### 11. HistoryTracker

- Input: resultado de analisis, decision, fuentes resumidas.
- Output: registro local/futuro persistente de seguimiento.
- Estado actual: localStorage.
- Decision: no decide; registra.

### 12. ResolutionVerifier

- Input: URL/slugs/ids y registro guardado.
- Output: pending/hit/miss/cancelled/unknown/no_clear_decision.
- Estado actual: local read-only via datos guardados y Gamma estructurado.
- Decision: solo cuenta acierto/fallo con resultado confiable.

## Contratos frontend agregados

- `apps/web/app/lib/deepAnalyzerTypes.ts`
  - Tipos de capas, senales, mercado, decision y resultado profundo.
- `apps/web/app/lib/deepAnalyzerEngine.ts`
  - Helpers v0 conservadores.
  - Construyen capas desde mercado Polymarket y Wallet Intelligence.
  - No hacen fetch.
  - No escriben DB.
  - No generan yes/no probability.
- `apps/web/app/lib/deepAnalysisProgress.ts`
  - Modelo de progreso real/futuro.
  - Marca que perfiles, research externo, odds y Kalshi requieren backend o
    fuente externa antes de correr.

## Estado v0 del motor

Con solo datos de Polymarket:

- `polymarket_market`: available.
- `market_movement`: partial/unavailable segun volumen/liquidez visibles.
- `wallet_intelligence`: available solo si el endpoint trae datos reales.
- `wallet_profiles`: blocked.
- `external_research`: blocked.
- `odds_comparison`: blocked.
- `kalshi_comparison`: blocked.
- `category_context`: partial si hay slug/categoria.
- `evidence_scoring`: blocked.
- `decision`: pending / none.

Decision v0:

- `available=false`.
- `side=NONE`.
- `countsForAccuracy=false`.
- Reason: faltan fuentes independientes suficientes.

## Requisitos antes de activar capas externas

- Backend job o workflow server-side.
- Allowlist estricta por proveedor.
- Rate limit por usuario/IP/job.
- Cache y deduplicacion.
- Timeout corto.
- No raw HTML.
- No payload crudo al navegador.
- Redaccion de errores.
- Tests con mocks.
- Quality gate antes de cualquier prediccion.
- Versionado del motor y explicacion de fuentes.

## No en este sprint

- No llamadas externas nuevas.
- No scraping.
- No odds reales nuevas.
- No Kalshi live.
- No profiles/win rate/ROI real.
- No DB writes.
- No predicciones nuevas.
- No scoring real.
