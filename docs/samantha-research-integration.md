# Samantha Research Integration

Fecha de corte: `2026-05-12`.

Samantha es el agente externo de investigacion profunda del usuario. No vive en
este repo y no debe ejecutarse automaticamente desde PolySignal en esta fase.

## Estado actual

Auditoria local:

- No hay integracion directa `Samantha` u `OpenClaw` dentro del codigo de
  PolySignal.
- `.gitignore` ya excluye `.openclaw/`, por lo que el estado local privado de
  OpenClaw no debe commitearse.
- Existe un flujo backend legacy de `Codex Agent Research` por archivos JSON:
  `prepare_codex_research`, `ingest_codex_research`,
  `apps/api/app/services/research/codex_agent_adapter.py` y
  `logs/research-agent/*`.
- Ese flujo backend puede crear runs, findings, reports o predictions si se
  ejecuta. No se usa para Samantha en este sprint.

Decision de arquitectura:

- Integracion v0 por archivo/texto estructurado manual.
- PolySignal genera un `SamanthaResearchBrief`.
- El usuario lo lleva a Samantha fuera de PolySignal.
- Samantha devuelve un `SamanthaResearchReport`.
- El usuario pega el reporte en `/analyze`.
- PolySignal valida, sanitiza y muestra evidencia.

No hay envio automatico a terceros, scraping, llamadas externas nuevas, DB
writes ni ejecucion de procesos de Samantha desde PolySignal.

## Integracion con DeepAnalysisJob

El flujo manual de Samantha ahora es una etapa del job local del analizador:

1. `/analyze` crea un `DeepAnalysisJob`.
2. PolySignal lee Polymarket y analiza el mercado seleccionado.
3. Wallet Intelligence se revisa solo para el mercado seleccionado si hay id
   compatible.
4. PolySignal genera el brief de Samantha.
5. El job queda en `awaiting_samantha`.
6. El usuario copia o descarga el brief y lo usa fuera de PolySignal.
7. El usuario pega el reporte estructurado.
8. PolySignal valida y sanitiza el reporte.
9. Si el reporte es valido, el paso `awaiting_samantha_report` pasa a
   `completed`.
10. Si hay senales, `scoring_evidence` se marca `completed`.
11. Si la estimacion sugerida pasa las compuertas, `generating_decision` y el
    job se marcan `completed`.
12. Si no alcanza, el job queda `ready_to_score` o `awaiting_samantha`, sin
    prediccion final.

Este estado vive en localStorage y sirve para reabrir el analisis desde
`/history`. No ejecuta Samantha automaticamente y no escribe en Neon.

## Rutas seguras

Briefs:

- Generados en memoria desde `AnalyzerReport`.
- Se pueden copiar al clipboard o descargar como archivo local.
- No se guardan en DB.
- No contienen raw payloads, full wallet addresses, secrets ni datos personales.

Reportes:

- Se pegan manualmente en `/analyze`.
- Se validan con `parseSamanthaResearchReport`.
- Se muestran solo si pasan validacion.
- No se guardan automaticamente.
- No alteran Historial salvo que una futura accion explicita lo implemente.

## Contrato del brief

Archivo de tipos:

- `apps/web/app/lib/samanthaResearchTypes.ts`

Builder:

- `apps/web/app/lib/samanthaResearchBrief.ts`

Campos principales:

- version `1.0`
- taskType `deep_market_research`
- mercado Polymarket normalizado
- outcomes/precios visibles
- volumen/liquidez si existen
- Wallet Intelligence resumida, sin direcciones completas
- research goals
- safety rules

Research goals soportados:

- external_news
- official_sources
- reddit_social_weak_signal
- odds_comparison
- kalshi_comparison
- sports_context
- political_context
- crypto_context
- economic_context

## Contrato del report

Parser/validator:

- `apps/web/app/lib/samanthaResearchReport.ts`

Campos principales:

- version `1.0`
- status `completed | partial | failed`
- marketUrl
- evidence[]
- oddsComparison
- kalshiComparison
- suggestedEstimate
- warnings

Cada evidencia debe incluir:

- title
- sourceName
- sourceType
- checkedAt
- direction YES/NO/NEUTRAL/UNKNOWN
- reliability high/medium/low/unknown
- summary
- sourceUrl opcional segura

## Reglas de validacion

PolySignal rechaza:

- reportes sin version `1.0`
- evidencia sin `sourceName`, `title` o `summary`
- URLs peligrosas o no publicas
- estimates fuera de `0..100`
- estimates con `confidence=none`
- Reddit/social con confiabilidad `high`
- Kalshi no equivalente usado como senal fuerte YES/NO
- texto que parezca secreto
- direcciones completas de wallet

PolySignal sanitiza:

- textos largos
- quotes largas
- control chars
- listas de evidencia demasiado grandes

## Reglas para Samantha

Samantha debe:

- devolver solo JSON estructurado que cumpla el contrato;
- no inventar fuentes, noticias, odds, Kalshi matches, wallets, ROI, win rate ni
  resultados;
- marcar `UNKNOWN` o `NEUTRAL` si no hay evidencia;
- tratar Reddit/social como senal debil;
- usar Kalshi solo si el mercado equivalente es claro;
- usar odds solo si mercado, fecha, lado y linea son comparables;
- no identificar personas reales detras de wallets;
- no recomendar copy-trading;
- no prometer ganancias;
- no tocar Neon, `.env`, migraciones, comandos `--apply`, trading ni scoring.

## Uso en Deep Analyzer

Reporte valido:

- alimenta la capa `Samantha Research`;
- puede generar senales YES/NO/NEUTRAL;
- odds se aceptan solo si el reporte las marca comparables;
- Kalshi se acepta solo si `equivalent=true`;
- un `suggestedEstimate` solo se acepta si pasa la compuerta estricta:
  dos senales independientes no-sociales alineadas, confianza suficiente y
  probabilidades validas.

Si no pasa la compuerta:

- la evidencia se muestra como contexto;
- no se crea decision PolySignal;
- no cuenta para precision.

## Futuro

Antes de automatizar Samantha:

- ejecutar en backend o workflow server-side;
- usar allowlist de herramientas y destinos;
- rate limit y cache;
- no raw HTML;
- validacion de fuente/citas;
- logs redacted;
- persistencia por cuenta;
- aprobacion explicita antes de guardar evidencia en DB.
