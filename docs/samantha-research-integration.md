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
- Camino B preparado: puente automatico server-side seguro, apagado por
  defecto y con fallback manual obligatorio cuando no esta configurado.
- PolySignal genera un `SamanthaResearchBrief`.
- El usuario lo lleva a Samantha fuera de PolySignal.
- Samantha devuelve un `SamanthaResearchReport`.
- El usuario pega el reporte en `/analyze`.
- PolySignal valida, sanitiza y muestra evidencia.

No hay scraping, DB writes ni ejecucion directa de procesos de Samantha desde
PolySignal. El puente automatico solo puede activarse con configuracion
server-side explicita y allowlisted; sin esa configuracion el producto queda en
fallback manual.

## Auditoria Camino B

`apps/web/app/api/samantha-polysignal-analysis/` existia como carpeta local
ignored/untracked. Su `route.ts` consultaba el backend de PolySignal y
`/markets/overview` para buscar mercados, por lo que pertenecia al enfoque
viejo de matching interno. Se retiro del working tree local y no se integro ni
se stageo.

`N:/samantha` existe como bridge WhatsApp/OpenClaw. La auditoria encontro
health/webhooks, modo `POLYSIGNAL_ANALYST_MODE`, logs de analista y scripts de
prueba, pero no habia un endpoint directo y seguro que aceptara el
`SamanthaTaskPacket` desde PolySignal.

Se agrego en Samantha un endpoint local/dev compatible:

- `POST /polysignal/research-task`
- contrato: `src/polysignal/samantha-task-contract.js`
- cola local: `data/polysignal/research-tasks-pending.jsonl`
- audit log local: `data/polysignal/research-audit-log.jsonl`

Este endpoint esta deshabilitado por defecto y, cuando se habilita, acepta la
tarea y la deja pendiente. No inventa reportes ni ejecuta investigacion
automatica si Samantha no tiene una capa real disponible. Samantha ahora tambien
tiene un composer local seguro que puede producir `completed` solo cuando se le
entrega evidencia estructurada real y el reporte pasa un contrato espejo
compatible con PolySignal; sin esa evidencia sigue devolviendo `manual_needed`.

## Camino B: puente automatico seguro

Archivos:

- `apps/web/app/lib/samanthaBridgeTypes.ts`
- `apps/web/app/lib/samanthaBridge.ts`
- `apps/web/app/api/samantha/send-research/route.ts`

Modo por defecto:

- `disabled` o `manual_fallback`.
- `/api/samantha/send-research` devuelve una respuesta controlada con
  `automaticAvailable=false` y `fallbackRequired=true`.
- El `DeepAnalysisJob` queda `awaiting_samantha`, no `completed`.

Configuracion server-side opcional:

- `SAMANTHA_BRIDGE_ENABLED`
- `SAMANTHA_BRIDGE_URL` (local dev: `http://127.0.0.1:8787/polysignal/research-task`)
- `SAMANTHA_BRIDGE_TOKEN`
- `SAMANTHA_BRIDGE_ALLOW_LOCALHOST`
- `SAMANTHA_BRIDGE_TIMEOUT_MS`
- `SAMANTHA_BRIDGE_MAX_REQUEST_BYTES`
- `SAMANTHA_BRIDGE_MAX_RESPONSE_BYTES`

Controles:

- no usa variables `NEXT_PUBLIC`;
- no acepta URL destino enviada por el cliente;
- valida endpoint allowlisted desde server env;
- bloquea credenciales, redirects peligrosos, puertos no permitidos, redes
  privadas y protocolos no HTTP/HTTPS;
- usa timeout corto, `credentials: omit`, `redirect: error`, `no-store` y
  limites de request/response;
- devuelve solo acuse/reporte normalizado, nunca payload crudo ni tokens;
- si Samantha devuelve reporte, PolySignal vuelve a validarlo con
  `parseSamanthaResearchReport` antes de aceptarlo.

## Integracion con DeepAnalysisJob

El flujo manual de Samantha ahora es una etapa del job local del analizador:

1. `/analyze` crea un `DeepAnalysisJob`.
2. PolySignal lee Polymarket y analiza el mercado seleccionado.
3. Wallet Intelligence se revisa solo para el mercado seleccionado si hay id
   compatible.
4. PolySignal genera el brief de Samantha.
5. PolySignal intenta Camino B solo si existe configuracion segura.
6. Si el bridge no esta configurado, el job queda en `awaiting_samantha` con
   fallback manual.
7. Si el bridge acepta la tarea, el job puede pasar por
   `sending_to_samantha`, `samantha_researching`,
   `receiving_samantha_report` y `validating_samantha_report`.
8. El usuario puede copiar o descargar el brief en cualquier momento y usarlo
   fuera de PolySignal.
9. El usuario pega el reporte estructurado si Samantha lo devuelve por fuera
   del puente.
10. PolySignal valida y sanitiza el reporte.
11. Si el reporte es valido, el paso `awaiting_samantha_report` pasa a
   `completed`.
12. Si hay senales, `scoring_evidence` se marca `completed`.
13. Si la estimacion sugerida pasa las compuertas, `generating_decision` y el
    job se marcan `completed`.
14. Si no alcanza, el job queda `ready_to_score` o `awaiting_samantha`, sin
    prediccion final.

Este estado vive en localStorage y sirve para reabrir el analisis desde
`/history`. No ejecuta Samantha automaticamente y no escribe en Neon.

## Samantha Task Packet

El brief tecnico se envuelve en un `SamanthaTaskPacket` para que el usuario
pueda entregar una tarea completa a Samantha sin explicar manualmente el
contrato.

Archivo:

- `apps/web/app/lib/samanthaTaskPacket.ts`

El paquete contiene:

- `researchBriefJson`: brief estructurado del mercado.
- `samanthaInstructionsText`: instrucciones legibles para Samantha.
- `expectedReportSchema`: schema esperado del reporte JSON.
- `safetyRules`: reglas operativas y de privacidad.
- `returnInstructions`: instrucciones de devolucion.
- `taskPacketJson`: paquete completo serializado.

Acciones disponibles en `/analyze`:

- `Copiar tarea para Samantha`
- `Descargar tarea JSON`
- `Descargar instrucciones TXT`
- `Copiar schema de respuesta`
- `Descargar brief JSON`

El texto del paquete indica que Samantha debe investigar con fuentes reales,
clasificar evidencia como YES/NO/NEUTRAL/UNKNOWN, tratar Reddit/social como
senal debil, usar Kalshi solo si el equivalente es claro, usar odds solo si son
comparables y devolver solo JSON valido. Tambien prohibe trading, bases de
datos, secretos, doxxing, identificacion de personas reales detras de wallets y
fuentes inventadas.

## Rutas seguras

### Endpoint local en Samantha

Para usar Camino B en desarrollo local:

1. En Samantha, configurar solo en entorno local:
   - `POLYSIGNAL_RESEARCH_BRIDGE_ENABLED=true`
   - `POLYSIGNAL_RESEARCH_BRIDGE_TOKEN=<token-local>`
   - `POLYSIGNAL_RESEARCH_BRIDGE_ALLOW_REMOTE=false`
2. En PolySignal, configurar solo server-side:
   - `SAMANTHA_BRIDGE_ENABLED=true`
   - `SAMANTHA_BRIDGE_URL=http://127.0.0.1:8787/polysignal/research-task`
   - `SAMANTHA_BRIDGE_TOKEN=<mismo-token-local>`
   - `SAMANTHA_BRIDGE_ALLOW_LOCALHOST=true`
3. Iniciar Samantha localmente.
4. Analizar un enlace en `/analyze`.

Respuesta esperada si Samantha acepta la tarea sin investigacion inmediata:

```json
{
  "ok": true,
  "status": "accepted",
  "taskId": "samantha-task-...",
  "mode": "queued_or_manual",
  "message": "Task accepted; research pending"
}
```

PolySignal interpreta esa respuesta como `samantha_researching` o
`awaiting_samantha`; el Radar permanece visible y el fallback manual sigue
disponible. El job no queda `completed`.

Samantha tambien expone consulta local de estado:

```text
GET http://127.0.0.1:8787/polysignal/research-task/:taskId
```

PolySignal no llama esa URL desde el cliente. `/analyze` usa el endpoint
same-origin `POST /api/samantha/research-status`, que recibe solo `taskId` y
consulta el bridge desde server-side. No acepta `endpoint`, `targetUrl`,
`callbackUrl` ni destinos enviados por el cliente.

Estados esperados:

- `pending` / `processing`: la investigacion sigue pendiente y el job se
  mantiene `samantha_researching`.
- `manual_needed`: Samantha no tiene investigacion automatica suficiente; el job
  vuelve a `awaiting_samantha` y el fallback manual sigue visible.
- `completed`: solo se acepta si incluye un reporte validado por PolySignal.
- `failed_safe`: error seguro; no se genera decision ni precision.

Procesamiento local en Samantha:

```powershell
npm run polysignal:research:list
npm run polysignal:research:process -- --task-id=<task-id>
npm run polysignal:research:process -- --task-id=<task-id> --fixture=strongEvidenceInput
```

El procesador valida de nuevo la tarea encolada y llama al composer local. El
argumento `--fixture=strongEvidenceInput` es solo para pruebas de contrato: usa
evidencia controlada test-only y no representa investigacion real. En el flujo
normal, si no hay proveedor real de investigacion externa autorizado ni
evidencia estructurada suficiente, escribe `manual_needed`. No inventa
evidencia.

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

Contrato espejo en Samantha:

- `N:/samantha/src/polysignal/polysignal-report-contract.js`
- `N:/samantha/src/polysignal/samantha-report-composer.js`

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

- JSON invalido o texto demasiado largo para ser un reporte estructurado
- reportes sin version `1.0`
- evidencia sin `sourceName`, `title` o `summary`
- URLs peligrosas o no publicas
- estimates fuera de `0..100`
- estimates con `confidence=none`
- Reddit/social con confiabilidad `high`
- Kalshi no equivalente usado como senal fuerte YES/NO
- texto que parezca secreto
- direcciones completas de wallet

Samantha aplica las mismas barreras antes de escribir `completed` en
`research-results.jsonl`: rechaza full wallets, secretos, scripts,
trading/copy-trading, ROI/win rate claims, Reddit/social con confiabilidad alta
y Kalshi no equivalente como senal fuerte. Si el reporte no tiene al menos dos
senales reales alineadas para el lado sugerido, queda `manual_needed`.

Samantha tambien tiene una primera capa de sports research para soccer y NBA en
modo conservador:

- `N:/samantha/src/polysignal/sports-research-contract.js`
- `N:/samantha/src/polysignal/sports-research-sources.js`
- `N:/samantha/src/polysignal/sports-research-adapter.js`
- `N:/samantha/src/polysignal/nba-research-adapter.js`
- `N:/samantha/src/polysignal/nba-injury-report-source.js`
- `N:/samantha/src/polysignal/nba-context-signals.js`

Esta capa no hace scraping ni busqueda generica. Si no recibe evidencia
deportiva estructurada desde una fuente permitida/manual, devuelve
`manual_needed` con checks sugeridos: match center oficial, updates oficiales
de equipos y noticias deportivas reputadas. Solo puede ayudar a `completed`
cuando hay al menos dos senales reales alineadas de confiabilidad media/alta y
el reporte completo sigue pasando las compuertas de PolySignal.

Para NBA, Samantha detecta mercados por titulo/slug, intenta extraer equipos,
fecha y tipo de mercado, y prioriza disponibilidad/lesiones desde NBA Official
Injury Report como fuente oficial. No hay fetch/parser automatico todavia; sin
nota estructurada segura devuelve `manual_needed` y recomienda revisar NBA
Official Injury Report, pagina oficial del juego/calendario, updates oficiales
de equipos y noticias NBA reputadas. Una sola nota de jugador `questionable` o
`probable` queda informativa y no fuerza porcentaje.

PolySignal sanitiza:

- textos largos
- quotes largas
- control chars
- listas de evidencia demasiado grandes

La UI separa validacion y aplicacion:

1. `Validar reporte` revisa el JSON y muestra errores especificos.
2. Si es valido, PolySignal muestra un resumen antes de aplicar:
   evidencias totales, senales YES, NO, NEUTRAL y UNKNOWN.
3. `Cargar reporte al analisis` actualiza el `DeepAnalysisJob` local.

Errores comunes:

- JSON invalido.
- Falta `version`.
- Falta evidencia estructurada.
- Estimate fuera de rango.
- Reddit/social marcado con confiabilidad alta.
- Kalshi no equivalente usado como senal fuerte.
- URL peligrosa.
- Texto demasiado largo.
- Posible secreto detectado.
- Direccion completa de wallet.

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

## Historial y rendimiento

Los analisis guardados que esperan investigacion externa se muestran como
pendientes, no como fallos:

- `/history` muestra `Pendiente de investigacion`, `Samantha recibio la tarea`
  o `Necesita reporte manual`, fecha de brief si existe y accion
  `Continuar analisis`.
- `/performance` separa `Pendientes de investigacion` de `Pendientes de
  resolucion`.
- `awaiting_samantha` y `ready_to_score` no cuentan para precision hasta que
  exista decision clara y resultado final verificable.

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
