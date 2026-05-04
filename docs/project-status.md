# PolySignal Project Status

## Snapshot

- fecha de corte: `2026-05-03`
- etapa: `visible_product_mvp`
- foco actual: hacer la app navegable, conectada y util con datos reales
- frontend: https://polisygnal-web.vercel.app
- backend: https://polisygnal.onrender.com

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

Sprints pendientes inmediatos:

- SPRINT 29: plan de normalizacion de `market_type`.
- SPRINT 30: documentar pipeline limitado dry-run.
- SPRINT 31: pulir copy visible en espanol.

## Guardrails

- No commitear `.env` reales.
- No imprimir connection strings ni secretos.
- No ejecutar imports, discovery, scoring productivo ni trading desde la UI.
- Usar `/api/backend/[...path]` como proxy same-origin para evitar CORS en Vercel.
- Mantener UFC, cricket y NHL/Hockey visibles pero desactivados.

## Proximo Dia

Prioridad recomendada:

1. Verificar deploy de Vercel con el checklist manual.
2. Confirmar `/sports/soccer` y dashboard en produccion.
3. Decidir si se poblara otro deporte con un importador nuevo o si se mejora discovery por categoria.
4. Completar docs de normalizacion de market types y pipeline dry-run.
