# PolySignal Project Status

## Snapshot

- fecha de corte: `2026-05-04`
- etapa: `visible_product_mvp`
- foco actual: hacer la app navegable, conectada y util con datos reales
- frontend: https://polisygnal-web.vercel.app
- backend: https://polisygnal.onrender.com
- ultimo deploy production verificado: `72fbb368593de448bc94b47c1951f591e4df513b`
- proxy same-origin: activo en `/api/backend/[...path]`
- diagnostico de build: `/api/build-info`

No usar estos dominios incorrectos:

- `https://polisignal.onrender.com`
- `https://polysignal.onrender.com`

## Estado de datos

Estado validado antes de esta cola nocturna:

- `events`: 4
- `markets`: 20
- `market_snapshots`: 20
- `predictions`: 20
- `predictions_distinct_markets`: 20
- deporte con datos reales: `soccer`
- deportes principales aun vacios: `basketball`, `nfl`, `tennis`, `baseball`, `horse_racing`

Endpoints backend sanos:

- `/health`
- `/markets`
- `/markets/overview`
- `/markets/overview?sport_type=soccer&limit=20`

Estado visible verificado:

- dashboard muestra mercados reales.
- `/sports/soccer` renderiza 20 cards en produccion limpia/headless.
- `/sports/basketball` muestra empty state limpio porque `total_count=0`.
- modulos futuros aparecen como "Modulo en preparacion".
- si un navegador normal muestra datos viejos, revisar cache con
  `/api/build-info` y el checklist manual.

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
