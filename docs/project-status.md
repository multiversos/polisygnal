# PolySignal Project Status

## Snapshot

- fecha de corte: `2026-05-10`
- etapa: `visible_product_mvp`
- foco actual: preparar arquitectura futura de usuarios/clientes sin activar auth ni escrituras
- frontend: https://polisygnal-web.vercel.app
- backend: https://polisygnal.onrender.com
- ultimo deploy production verificado antes de este bloque: `02dcacd`
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

- frontend publico con tema sobrio, deportes con iconos propios y navegacion publica limpia.
- `/sports/soccer` muestra busqueda, filtros, ordenamiento, cards de partidos, mercados dentro de cada card y auto-refresh.
- `/watchlist` esta disponible como Mi lista local del navegador.
- Alertas se conectan honestamente con mercados seguidos y datos visibles.
- `/history` esta disponible como Historial local para medir analisis guardados
  sin inventar resultados.
- `/analyze` esta disponible para validar enlaces de Polymarket, compararlos con
  mercados ya cargados y guardar resultados locales en Historial.
- `/analyze` muestra probabilidad del mercado basada en precio visible cuando
  existe y solo muestra estimacion PolySignal si el dato real esta disponible.
- privacidad local visible: Historial y Mi lista explican que los datos se
  guardan en este navegador, no se sincronizan todavia y pueden borrarse.
- seguridad baseline completada: headers, smoke contra fugas sensibles,
  hardening de `/analyze`, proxy constrained y Dependabot activo.
- `/internal/data-status` existe como pagina oculta, solo lectura, sin enlace publico.
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
- `docs/security-plan.md`: modelo de acceso futuro, privacidad local y controles
  pendientes.

Estado actual:

- Historial sigue en localStorage.
- Mi lista sigue en localStorage.
- Alertas leen Mi lista local.
- Analizar enlace puede guardar analisis en historial local.
- No se creo auth real.
- No se crearon tablas reales.
- No se ejecutaron migraciones.

Riesgos pendientes:

- localStorage no sincroniza entre dispositivos;
- los registros locales pueden ser manipulados por el navegador;
- no existe backend persistente de usuarios;
- snapshots/analisis de soccer siguen con datos stale hasta refresh
  supervisado;
- npm audit mantiene 2 moderadas via Next/PostCSS, documentadas sin force fix.

## Proximo Dia

Prioridad recomendada:

1. Disenar auth tecnico y proveedor de sesiones, sin implementarlo todavia.
2. Preparar un schema draft de customer data, sin migracion real.
3. Definir RLS o backend ownership checks antes de cualquier tabla de usuario.
4. Repetir diagnostics de frescura solo en entorno con Neon confirmado.
5. Ejecutar import/refresh real solo con dry-run limpio, supervision explicita y
   limites conservadores.
