# PolySignal Project Status

## Snapshot

- fecha de corte: `2026-05-13`
- etapa: `visible_product_mvp`
- foco actual: `/analyze` como centro del producto, con arquitectura Deep Analyzer read-only preparada y sin auth ni escrituras
- frontend: https://polisygnal-web.vercel.app
- backend: https://polisygnal.onrender.com
- ultimo deploy production reportado antes de este sprint: `f7b9513`
- proxy same-origin: activo en `/api/backend/[...path]`
- diagnostico de build: `/api/build-info`

No usar estos dominios incorrectos:

- `https://polisignal.onrender.com`
- `https://polysignal.onrender.com`

## Estado de datos

Estado validado antes de esta cola nocturna:

- `/sports/soccer` muestra `75` mercados reales mediante paginacion por offset.
- `match_card_count`: alrededor de `24`.
- con snapshot: `60`.
- sin snapshot: `15`.
- con analisis/prediction: `50`.
- sin analisis/prediction: `25`.
- stale 48h: `50`.
- deporte con datos fuertes: `soccer`.
- UFC, cricket y NHL/Hockey siguen visibles pero desactivados.

Endpoints backend sanos:

- `/health`
- `/markets`
- `/markets/overview`
- `/markets/overview?sport_type=soccer&limit=50`
- `/markets/overview?sport_type=soccer&limit=50&offset=50`

Estado visible verificado:

- `/` ahora posiciona el Analizador de enlaces como entrada principal del
  producto: hero con CTA `Analizar enlace`, CTA a Historial, tres pasos
  `Pega un enlace -> Confirma el mercado -> Guarda y mide` y resumen de capas
  revisadas sin prometer resultados.
- frontend publico con tema sobrio, deportes con iconos propios y navegacion publica limpia.
- `/sports/soccer` muestra busqueda, filtros, ordenamiento, cards de partidos, mercados dentro de cada card y auto-refresh.
- `/watchlist` esta disponible como Mi lista local del navegador.
- Alertas se conectan honestamente con mercados seguidos y datos visibles.
- `/history` esta disponible como Historial local para medir analisis guardados
  sin inventar resultados.
- `/analyze` esta disponible para validar enlaces de Polymarket, resolverlos
  directamente desde Polymarket/Gamma read-only y guardar resultados locales en
  Historial.
- `/analyze` ahora usa una direccion visual Samantha-first tipo SaaS
  financiero/deportivo: fondo dark navy, sidebar glass oscuro, logo PolySignal
  mas grande, hero con banner degradado, ilustracion CSS/SVG editable,
  flujo visual de tres pasos, vista previa con gauge semicircular, mini grafica,
  riesgo y resumen Samantha. Es un cambio visual/UX; no cambia backend, Neon,
  `.env`, migraciones, trading, scoring ni datos reales.
- El estado inicial de `/analyze` explica el flujo antes de pegar un enlace:
  detectar mercado, confirmar si hay varias opciones, analizar solo el mercado
  elegido y guardar la lectura para medirla con el tiempo.
- `/analyze` ahora organiza el resultado como centro de analisis mediante
  `analyzerResult.ts`: mercado detectado, probabilidad de mercado, estimacion
  PolySignal si existe, contexto, investigacion, Wallet Intelligence, historial
  relacionado y resolucion/verificacion.
- El resultado seleccionado de `/analyze` se presenta con `AnalyzerReport.tsx`:
  resumen ejecutivo compacto, fuentes visibles, capas avanzadas plegables,
  Wallet Intelligence con drilldown seguro y acciones claras para guardar,
  ver historial, abrir detalle o seguir mercado.
- `/analyze` usa flujo `Detectar -> Confirmar -> Analizar -> Guardar ->
  Verificar resultado`: un enlace primero se valida, luego se resuelve desde
  Polymarket/Gamma por slug de evento o mercado, y despues el usuario confirma
  un mercado antes de ejecutar el analisis profundo. Esto evita abrir multiples
  fichas completas para mercados relacionados pero incorrectos.
- Regla nueva de arquitectura: los mercados internos de PolySignal no son la
  fuente principal del Analizador de enlaces. Si Polymarket/Gamma no devuelve
  un evento o mercado, `/analyze` muestra un no-match honesto y no busca una
  alternativa en `/markets/overview`, `/sports/soccer` ni mercados cargados.
- Existe un endpoint seguro `POST /api/analyze-polymarket-link` que acepta solo
  URLs de Polymarket, construye internamente llamadas allowlisted a Gamma
  (`/events?slug=...` o `/markets?slug=...`) y devuelve datos normalizados:
  evento, mercados, outcomes/precios, volumen, liquidez, estado, ids remotos y
  condition id cuando existen. No devuelve payload crudo.
- Para enlaces exactos `/market/...`, si `/markets?slug=...` no devuelve datos
  pero el slug contiene un evento fechado, el resolver consulta el evento
  estructurado correspondiente y conserva solo el market slug exacto. No usa
  mercados internos como fallback.
- El selector posterior a la deteccion usa solo mercados devueltos por
  Polymarket para ese evento/mercado. Un enlace NBA no puede mostrar futbol y
  un enlace LaLiga no puede mostrar otros partidos que solo compartan liga,
  fecha o un equipo.
- Cuando un evento devuelve muchos markets, el selector se mantiene compacto con
  filtro local y `Ver mas mercados`; no abre reportes profundos para todos.
- QA reciente protege los casos NBA Thunder/Lakers y LaLiga Celta/Levante:
  resuelven desde Gamma o muestran no-match honesto, sin cross-sport fallback.
- El parser de enlaces ahora extrae locale, categoria, liga/deporte, slug
  completo, fecha y codigos de equipos desde URLs como
  `/es/sports/laliga/lal-cel-lev-2026-05-12`. Liga, fecha sola, año o un solo
  equipo no bastan para match fuerte.
- El ranking vive en `analyzerMatchRanking.ts`: slug de evento/mercado exacto
  y market id remoto/local exacto pesan mas que terminos secundarios. Si hay
  match exacto/fuerte, se ocultan coincidencias debiles.
- Wallet Intelligence se consulta solo para el mercado seleccionado, no para
  todas las coincidencias secundarias del enlace. En mercados resueltos desde
  Gamma sin market id local compatible, queda no disponible de forma honesta; no
  se busca otro mercado interno.
- Wallet Intelligence en el reporte muestra capital observado, sesgo
  YES/NO/Neutral, confianza, umbral `100 USD+` y direcciones abreviadas solo
  cuando existen datos reales. El detalle queda detras de `Ver todas las
  billeteras analizadas` y no muestra direcciones completas, ROI/win rate
  inventados ni copy-trading.
- `/analyze` muestra probabilidad del mercado basada en precio visible cuando
  existe y solo muestra estimacion PolySignal si el dato real esta disponible.
- `/analyze` ahora prepara la direccion de producto "solo analisis profundo":
  el reporte muestra capas de Deep Analyzer como Polymarket, movimiento del
  mercado, Wallet Intelligence, perfiles de billeteras, investigacion externa,
  odds externas, Kalshi, contexto, scoring de evidencia, historial y resolucion.
  Las capas futuras aparecen como pendientes de integracion o no disponibles;
  no se presentan como evidencia real.
- Existen contratos frontend conservadores para el futuro motor profundo:
  `deepAnalyzerTypes.ts`, `deepAnalyzerEngine.ts` y `deepAnalysisProgress.ts`.
  No hacen fetch, no escriben DB, no activan research externo, no consultan
  odds/Kalshi y no generan probabilidades PolySignal nuevas.
- El MVP de continuidad del analizador guarda metadatos seguros del
  DeepAnalysisJob en Historial: `deepAnalysisJobId`, estado de investigacion,
  `bridgeTaskId` de Samantha cuando existe, estado del bridge, fecha de envio y
  enlace Polymarket original. `/history` permite continuar el analisis y
  actualizar la lectura automatica por task id, sin marcar `accepted`,
  `pending`, `processing` ni `manual_needed` como completados.
- Existe contrato interno para Samantha Research:
  `samanthaResearchTypes.ts`, `samanthaResearchBrief.ts`,
  `samanthaTaskPacket.ts` y `samanthaResearchReport.ts`. `/analyze` prepara
  contexto seguro para Samantha automaticamente; las herramientas de copia,
  descarga, schema y validacion manual quedan fuera del flujo publico y solo
  pueden usarse en debug local con `NEXT_PUBLIC_SHOW_ANALYZER_DEBUG_TOOLS=1`.
- Camino B para Samantha automatica esta preparado pero apagado por defecto:
  `samanthaBridgeTypes.ts`, `samanthaBridge.ts` y
  `POST /api/samantha/send-research` permiten enviar el contexto solo si hay
  configuracion server-side segura (`SAMANTHA_BRIDGE_ENABLED` y endpoint
  allowlisted). Sin configuracion, la ruta responde fuente automatica no
  disponible y el `DeepAnalysisJob` queda como lectura parcial/pendiente.
- `/analyze` ya soporta estados operativos del puente:
  `sending_to_samantha`, `samantha_researching`,
  `receiving_samantha_report` y `validating_samantha_report`. La espera ahora
  se muestra como progreso por etapas con tiempo transcurrido, mensajes a
  esperas largas, timeout controlado, reintento y acciones de recuperacion. No
  usa porcentajes falsos ni marca completado si falta investigacion externa.
- Auditoria local: existia una carpeta ignored/untracked
  `apps/web/app/api/samantha-polysignal-analysis/` con un route viejo que usaba
  backend `/markets/overview`; se retiro del working tree local porque violaba
  la regla Polymarket-first y no se integro a Camino B.
- `N:/samantha` existe como bridge WhatsApp/OpenClaw. Se agrego un endpoint
  local/dev `POST /polysignal/research-task` para recibir el Task Packet de
  PolySignal, validarlo, escribir una cola local sanitizada y responder
  `accepted`/`queued_or_manual`. Esta deshabilitado por defecto y no inventa
  reportes ni ejecuta investigacion automatica si no hay capa real configurada.
- Samantha ahora tambien expone `GET /polysignal/research-task/:taskId` para
  consultar estado local (`pending`, `processing`, `manual_needed`, `completed`
  o `failed_safe`) y un procesador local
  `npm run polysignal:research:process`. PolySignal consulta esto mediante
  `/api/samantha/research-status`, sin aceptar destinos enviados por el cliente.
- Samantha tiene un contrato espejo y report composer local:
  `src/polysignal/polysignal-report-contract.js` y
  `src/polysignal/samantha-report-composer.js`. El procesador puede escribir
  `completed` solo si recibe evidencia estructurada real suficiente y el
  reporte pasa las mismas barreras que PolySignal; sin evidencia autorizada
  sigue devolviendo `manual_needed`.
- Samantha ahora tiene una primera capa segura de sports research para soccer y
  NBA (`sports-research-contract`, `sports-research-sources`,
  `sports-research-adapter`, `nba-research-adapter`,
  `nba-injury-report-source`, `nba-context-signals`). No hace scraping ni
  busqueda generica; sin evidencia deportiva estructurada devuelve
  `manual_needed` con fuentes recomendadas para revision manual. En NBA,
  prioriza NBA Official Injury Report, disponibilidad, equipos/fecha y contexto
  basico, pero no inventa lesiones ni schedule si no hay fuente.
- Samantha ahora tiene un flujo NBA manual-controlado:
  `POST /polysignal/nba/manual-evidence`,
  `src/polysignal/nba-manual-evidence-contract.js`,
  `scripts/add-nba-manual-evidence.js` y storage local sanitizado
  `data/polysignal/nba-manual-evidence.jsonl`. Acepta solo evidencia
  estructurada con fuente, URL segura y timestamp; rechaza scripts, secretos,
  wallets completas, odds-like fields, betting advice, copy-trading y payload
  crudo. Al procesar una task NBA, Samantha revalida esa evidencia y puede
  producir `completed` solo con dos senales alineadas medium/high de fuentes
  distintas y gates de reporte aprobadas. Sigue sin fetch automatico ni
  produccion automatizada.
- El paquete para Samantha incluye brief JSON, instrucciones TXT, schema de
  respuesta, reglas de seguridad e instrucciones de devolucion. Prohibe fuentes
  inventadas, trading, Neon, `.env`, doxxing, secretos, copy-trading y
  identificacion de personas reales detras de wallets.
- Al validar reportes de Samantha, PolySignal rechaza JSON invalido, textos
  demasiado largos, URLs peligrosas, secretos, direcciones completas de wallet,
  estimates fuera de rango, Reddit/social con confiabilidad alta y Kalshi no
  equivalente usado como senal fuerte.
- Los jobs `awaiting_samantha` quedan visibles en Historial como `Pendiente de
  investigacion` o `Fuente automatica no disponible` con accion
  `Continuar analisis`/`Actualizar lectura automatica`.
  `/performance` separa pendientes de investigacion de pendientes de resolucion
  y no los cuenta como fallos.
- La estimacion PolySignal pasa por una compuerta de calidad: si el valor solo
  replica el precio visible del mercado, se muestra como probabilidad del
  mercado y no como estimacion propia.
- Existe una arquitectura v0 para estimacion independiente:
  `estimationSignals.ts`, `polySignalEstimateEngine.ts` y
  `evidenceTypes.ts`. Por ahora devuelve `available=false` cuando faltan
  senales independientes; no inventa porcentajes.
- Existe una primera compuerta conservadora para porcentaje PolySignal en
  `polySignalSignalMixer.ts`. Solo puede generar porcentaje si el mercado fue
  leido desde Polymarket, hay reporte Samantha validado con estimacion aceptada
  y existe al menos un soporte independiente real: evidencia externa fuerte,
  Wallet Intelligence suficiente, perfil de billetera con historial cerrado,
  odds comparables o Kalshi equivalente. El precio del mercado queda como
  referencia y no se copia como estimacion propia.
- Las compuertas de estimacion ahora tienen fixtures y scripts dedicados:
  `test:estimate-gates` prueba casos pendientes/disponibles sin repetir la
  logica principal, y `test:samantha-report-validation` prueba reportes
  Samantha validos, debiles e invalidos. Los fixtures son controlados y no se
  muestran como datos reales.
- Existe una primera capa de contexto deportivo para futbol:
  `soccerMatchContext.ts` extrae equipos y fecha desde datos ya cargados,
  mantiene local/visitante como desconocido si no esta estructurado y no
  inventa liga desde slugs.
- `/analyze`, `/markets/[id]` e `/internal/data-status` muestran preparacion
  de datos de futbol. El score de preparacion es no predictivo: mide datos
  disponibles, no probabilidad de resultado.
- Existe una primera capa de readiness de investigacion externa:
  `ResearchFinding`, `researchReadiness.ts` y UI de evidencia pendiente. No
  llama fuentes externas ni muestra fixtures/demo como datos reales.
- `/analyze` muestra un panel de progreso guiado mientras trabaja: etapas
  reales de lectura de enlace, busqueda en Polymarket, confirmacion de
  coincidencias, preparacion de Samantha, espera de investigacion externa y
  revision final. Incluye contador visible, mensajes honestos cuando tarda mas
  de lo normal, timeout/reintento y estado claro cuando Samantha sigue
  pendiente. No usa una barra de progreso inventada ni convierte esperas en
  evidencia.
- No hay flujo de captura de pantalla, OCR ni subida de imagenes en el
  analizador de enlaces.
- Existe una capa real de Wallet Intelligence para el analizador:
  `walletIntelligenceTypes.ts`, `walletIntelligence.ts`,
  `polymarketWalletIntelligence.ts`, `walletProfiles.ts` y
  `/api/polymarket-wallet-intelligence`. Para enlaces pegados, `/analyze` usa
  el `conditionId`/token IDs resueltos desde Polymarket y consulta
  Polymarket Data API en modo read-only; no usa mercados internos como fuente
  primaria. La UI resume capital observado, sesgo YES/NO/Neutral, perfiles
  basicos solo si hay historial cerrado real, confianza y advertencias como
  senal auxiliar, no como prediccion final. Si faltan datos, muestra estado
  normal de no disponibilidad.
- El guardado desde `/analyze` usa el resultado unificado para conservar en
  Historial un resumen local de capas y wallet summary agregado. No guarda
  payloads crudos ni direcciones completas.
- `AnalyzerReport` cierra con `Que puedes hacer ahora`: guardar analisis o
  seguimiento, ver historial, seguir mercado, ver detalle y analizar otro
  enlace.
- `/history` esta conectado de vuelta al analizador con CTA `Analizar nuevo
  enlace`, empty state hacia `/analyze` y acciones `Reanalizar enlace` cuando
  el registro local conserva URL.
- `/history` puede intentar `Actualizar resultados` de forma automatica usando
  datos read-only disponibles; no pide al usuario marcar YES/NO manualmente.
- hit/miss solo se calcula cuando existe outcome confiable y una prediccion
  clara PolySignal guardada. El umbral inicial es `55%`: YES `>=55%` o NO
  `>=55%`. La probabilidad del mercado no crea `predicted_side`; pending,
  cancelled, weak/no-estimate y unknown no cuentan como fallos.
- Historial verifica resultados en este orden: outcome read-only ya guardado,
  detalle/overview PolySignal, matching por URL/slug y finalmente
  `/api/resolve-polymarket`, que consulta Gamma de forma estructurada por
  `event_slug`. Si Gamma no entrega outcome confiable, no se inventa resultado.
- privacidad local visible: Historial y Mi lista explican que los datos se
  guardan en este navegador, no se sincronizan todavia y pueden borrarse.
- seguridad baseline completada: headers, smoke contra fugas sensibles,
  hardening de `/analyze`, proxy constrained y Dependabot activo.
- `/internal/data-status` existe como pagina oculta, solo lectura, sin enlace publico.
- produccion tolera fallas transitorias 502/503/504 con reintentos cortos y
  mensajes publicos suaves.
- si un navegador normal muestra datos viejos, revisar cache con
  `/api/build-info` y el checklist manual.

## Comandos seguros actuales

Validaciones frontend:

```powershell
npm.cmd --workspace apps/web run build
npm.cmd --workspace apps/web run security:checks
npm.cmd --workspace apps/web run smoke:production
```

Tests backend dirigidos para comandos seguros:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_refresh_existing_soccer_markets_command.py tests/test_refresh_soccer_markets_command.py tests/test_inspect_soccer_market_health_command.py
```

Diagnosticos read-only/dry-run:

```powershell
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
.\.venv\Scripts\python.exe -m app.commands.inspect_soccer_market_health --json
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --limit 25 --stale-hours 48 --report-json logs\reports\dry-runs\existing-soccer-refresh-local-dry-run.json --json
```

`refresh_existing_soccer_markets` es dry-run por defecto. Cualquier apply futuro
debe ejecutarse solo en entorno confirmado con Neon, despues de preflight seguro
y revision manual del reporte. No usar `--delete-existing`, trading, migraciones
ni scheduler real sin autorizacion explicita.

## Sprints Completados 1-11

- Render backend vivo con health checks.
- Neon configurado como Postgres principal con URL directa para migraciones.
- Alembic aplicado contra Neon.
- Driver Postgres agregado para Render.
- Pipeline minimo E2E: markets, snapshots y predictions para soccer.
- `sport_type` normalizado a deportes generales; NBA no es deporte canonico.
- Deportes principales priorizados en UI.
- Deportes secundarios visibles como "Otros" pero desactivados.
- Comando generico `score_missing_markets` agregado.
- Dashboard principal conectado a `/markets/overview`.
- Pagina de analisis de mercado funcional.

## Cola Nocturna

Sprints completados en esta ronda:

- SPRINT 14: filtros de revision del dashboard.
- SPRINT 15: cards de mercado mas legibles.
- SPRINT 16: pagina `/sports/[sport]` pulida.
- SPRINT 17: estados reutilizables de loading/empty/error.
- SPRINT 18: modulos futuros aclarados como "en preparacion".
- SPRINT 19: resumen real de data health desde `/markets/overview`.
- SPRINT 20: briefing derivado desde market overview.
- SPRINT 21: alertas operativas derivadas.
- SPRINT 22: workflow visual derivado.
- SPRINT 23: estado vacio de decisiones mejorado.
- SPRINT 24: detalle de mercado pulido.
- SPRINT 25: tipos compartidos de market overview.
- SPRINT 26: helper API endurecido.
- SPRINT 27: checklist manual de smoke test.
- SPRINT 33: diagnostico seguro de build/deploy.
- SPRINT 34: diagnosticos de dry-run del importador con `--debug-skips`.
- SPRINT 35: limites de discovery/import aclarados.
- SPRINT 36: clasificacion de market types comunes para nuevos imports.

Sprints pendientes inmediatos:

- Ejecutar dry-run diagnostics por deporte con `--debug-skips`.
- Validar el impacto de la normalizacion de `market_type` en nuevos imports.
- Mejorar discovery por deporte antes de poblar deportes vacios.
- Poblar deportes principales solo cuando `would_import > 0` y con limites.

## Guardrails

- No commitear `.env` reales.
- No imprimir connection strings ni secretos.
- No ejecutar imports, discovery, scoring productivo ni trading desde la UI.
- Usar `/api/backend/[...path]` como proxy same-origin para evitar CORS en Vercel.
- Mantener UFC, cricket y NHL/Hockey visibles pero desactivados.
- Dependabot esta preparado para npm, pip y GitHub Actions, sin auto-merge.
- `npm audit` encontro vulnerabilidades moderadas via Next/PostCSS; no usar
  `npm audit fix --force` porque propone un cambio rompedor. Revisar en una
  ventana planificada de mantenimiento.
- `/sports/soccer` usa paginacion offset de 50 porque requests mayores como
  `limit=75` o `limit=100` pueden dar 504. No subir limites sin medir.
- El smoke de produccion reintenta errores transitorios, pero sigue fallando si
  todos los intentos fallan.
- No hay auth real, tablas de usuario, migraciones de usuario ni backend
  persistente para Historial/Mi lista.
- Neon real no esta disponible localmente; no usar diagnosticos locales como
  autorizacion para cambios de produccion.

## Customer Data Readiness

Documentacion preparada:

- `docs/customer-data-architecture.md`: auditoria de datos locales, modelo
  futuro por usuario, access control y migracion de localStorage a cuenta.
- `docs/privacy-launch-checklist.md`: checklist antes de login, DB, pagos,
  investigacion externa y lanzamiento con clientes.
- `docs/production-troubleshooting.md`: runbook de 504/proxy/backend/frontend.
- `docs/security-plan.md`: modelo de acceso futuro, privacidad local y controles
  pendientes.
- `docs/soccer-data-readiness.md`: auditoria de datos futbolisticos disponibles,
  inferencias seguras y fuentes deportivas futuras.
- `docs/external-research-plan.md`: plan de integracion segura de fuentes
  externas con allowlist, rate limit, cache y backend server-side.
- `docs/wallet-intelligence-plan.md`: auditoria de fuentes de wallets/trades,
  modelo futuro, umbral, privacidad y reglas anti copy-trading.
- `docs/deep-analyzer-engine-plan.md`: auditoria de modulos existentes,
  arquitectura objetivo del motor profundo y contratos v0 conservadores.
- `docs/samantha-research-integration.md`: contrato manual de brief/reporte
  para Samantha y reglas de seguridad.
- `docs/runbooks/samantha-research-manual.md`: runbook operativo para el flujo
  manual con Samantha.

Estado actual:

- Historial sigue en localStorage.
- Mi lista sigue en localStorage.
- Alertas ahora se enfocan en analisis guardados y no en una lista generica de
  mercados.
- Analizar enlace es el flujo principal del producto y resuelve enlaces desde
  Polymarket/Gamma/CLOB en modo read-only.
- Historial puede guardar lecturas del analizador, verificar resultados cuando
  hay outcome confiable y alimentar la pagina `/performance`.
- Deportes, briefing y watchlist quedan como rutas legacy ocultas de la
  navegacion principal.
- QA post-pivot protege que `/alerts` dependa de analisis guardados, que
  `/methodology` explique el umbral de 55% y que el detalle de mercado apunte
  de vuelta al Analizador/Historial en vez de deportes.
- Deep Analyzer ahora tiene un job local (`DeepAnalysisJob`) con progreso real
  en el navegador: lee Polymarket, analiza el mercado, revisa Wallet
  Intelligence cuando puede, prepara brief de Samantha y queda esperando reporte
  externo validable.
- `/analyze` muestra `Estado del analisis profundo`; no marca el analisis como
  completado si falta reporte de Samantha o evidencia suficiente.
- `/history` puede guardar analisis pendientes de investigacion con
  `deepAnalysisJobId`, `awaitingResearch` y `researchStatus`, y ofrece
  `Continuar analisis`.
- No se creo auth real.
- No se crearon tablas reales.
- No se ejecutaron migraciones.

Riesgos pendientes:

- localStorage no sincroniza entre dispositivos;
- los registros locales pueden ser manipulados por el navegador;
- no existe backend persistente de usuarios;
- la resolucion automatica local depende de datos disponibles y no sustituye
  un job backend persistente futuro;
- DeepAnalysisJob vive en localStorage y no reemplaza un backend job
  persistente, queue, locks, retries, ownership ni auditoria por cuenta;
- el contexto de futbol todavia no incluye liga estructurada, local/visitante,
  forma reciente, lesiones, suspensiones, odds externas ni calibracion;
- la investigacion externa real todavia no esta conectada a APIs deportivas,
  odds, noticias o fuentes oficiales;
- Wallet Intelligence ya esta conectada como consulta read-only sanitizada en
  el Analizador y detalle de mercado, pero faltan rate limits mas fuertes,
  politica de retencion y calculo confiable de win rate/ROI desde historial
  resuelto;
- snapshots/analisis de soccer siguen con datos stale hasta refresh
  supervisado;
- npm audit mantiene 2 moderadas via Next/PostCSS, documentadas sin force fix.

## Proximo Dia

Prioridad recomendada:

1. Consolidar el flujo `/analyze` -> `/history` -> `/performance` como producto
   principal.
2. Convertir los contratos Deep Analyzer en backend job seguro, con mocks y
   quality gate antes de activar fuentes externas.
3. Preparar backend persistente para analisis guardados, sin migracion real aun.
4. Disenar auth tecnico y ownership checks antes de cualquier tabla de usuario.
5. Planificar jobs de seguimiento y resolucion contra Polymarket/Gamma/CLOB.
6. Mantener deportes/markets legacy ocultos hasta decidir si se archivan o
   redirigen.
