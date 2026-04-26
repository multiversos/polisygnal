# Project Status

## Snapshot

- fecha de corte: `2026-04-25`
- etapa: `operational_mvp`
- foco actual: convertir el MVP operativo en un producto accionable y aumentar cobertura de evidence
- ultima corrida full del pipeline en estado sano: `2026-04-25 18:10 CDT`

## Estado real del sistema

Al `2026-04-25`, el pipeline principal esta en `ok`, con `reports`, `briefing`, `diff` y `dashboard` tambien en `ok`, y `partial_error_count = 0`.

Hechos operativos del snapshot:

- `141` mercados evaluados por scoring
- `8` mercados con evidence real
- `133` mercados por snapshot fallback
- `8` mercados con match de odds
- `5` mercados con match de news
- `6` top opportunities en reportes
- `2` items de watchlist
- `1` review flag en briefing

Fuente:

- `logs/market_pipeline/latest-summary.json`
- `logs/reports/latest-summary.json`
- `logs/briefings/latest-summary.json`

## Lo que ya esta hecho

- backend MVP operativo y auditable
- sync manual de Polymarket y discovery por scope
- snapshots periodicos y lectura historica
- evidence pipeline v1 con The Odds API y ESPN RSS
- scoring v1 con trazabilidad explicable
- evaluation history y summary
- reports, briefing, diff y dashboard como artifacts
- estado operativo consolidado por HTTP

## Donde estamos

PolySignal ya no esta en fase de "proyecto base". Ya esta en fase de `operational_mvp`.

Eso significa:

- el core tecnico existe y corre
- ya hay visibilidad operativa real
- el cuello de botella dejo de ser infraestructura basica
- el siguiente salto de valor viene de cobertura, consumo de producto y disciplina de ejecucion

## Lo que falta

Las brechas mas claras hoy son:

1. cobertura de evidence
   - solo `8 / 141` mercados usan evidence real
2. consumo de producto
   - el backend es fuerte, pero la experiencia final sigue siendo tecnica
3. monitoreo proactivo
   - hay visibilidad, pero no alerting
4. guardrails de calidad
   - falta institucionalizar regresion y calibracion del scoring
5. capa de IA
   - sigue pendiente la clasificacion y priorizacion inteligente de noticias

## Riesgos principales

- demasiada utilidad del scoring sigue dependiendo de fallback y no de evidence real
- el dashboard actual existe, pero todavia no reemplaza un producto navegable
- la operacion sigue muy apoyada en Windows local y lectura manual de estado
- sin disciplina de gestion, README, roadmap y tasks pueden volver a desalinearse

## Prioridades siguientes

1. consolidar Linear como sistema de ejecucion real y automatizar sync repo -> Linear
2. expandir coverage de evidence y matching
3. convertir briefing + diff + dashboard en una experiencia de consumo accionable
4. agregar alerting operacional
5. crear guardrails de calidad para scoring
