# PolySignal Project Status

## Snapshot

- fecha de corte: `2026-05-10`
- etapa: `visible_product_mvp`
- foco actual: mantener la experiencia publica util, sobria y fresca con datos reales
- frontend: https://polisygnal-web.vercel.app
- backend: https://polisygnal.onrender.com
- ultimo deploy production verificado antes de esta cola: `3cdf596`
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
- `/internal/data-status` existe como pagina oculta, solo lectura, sin enlace publico.
- si un navegador normal muestra datos viejos, revisar cache con
  `/api/build-info` y el checklist manual.

## Comandos seguros actuales

Validaciones frontend:

```powershell
npm.cmd --workspace apps/web run build
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

## Proximo Dia

Prioridad recomendada:

1. Ejecutar import dry-run diagnostics para `basketball`, `nfl`, `tennis`, `baseball` y `horse_racing`.
2. Revisar si los descartes vienen de deporte mal normalizado, `market_type`, fechas, outcomes o precios.
3. Ajustar discovery por deporte con tests antes de cualquier `--apply`.
4. Poblar deportes solo con `would_import > 0`, `max-import` explicito y smoke test posterior.
