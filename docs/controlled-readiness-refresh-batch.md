# Controlled Readiness Refresh Batch MVP

Fecha local de sesion: 2026-04-29

Este documento resume un batch controlado para intentar conseguir mercados
proximos con snapshot/precio real y estado `ready` o `partial` util para los
primeros analisis de PolySignal.

El objetivo no fue sincronizar masivamente ni crear analisis automaticos. El
flujo fue:

1. Recalcular readiness de proximos mercados.
2. Elegir candidatos claros `match_winner`.
3. Ejecutar dry-run por mercado.
4. Aplicar refresh a un maximo de 5 mercados.
5. Recalcular calidad/readiness.
6. Documentar resultados y riesgos.

## Readiness antes del batch

Comando read-only:

```bash
python -m app.commands.inspect_analysis_readiness --days 7 --limit 100 --json
```

Resumen inicial:

- Total revisado: 100
- Ready: 0
- Needs refresh: 80
- Blocked: 20
- Sin snapshot: 100
- Sin precio SI/NO: 100
- Score pendiente: 100

La conclusion inicial fue que la base local tenia mercados proximos claros,
pero la muestra principal seguia sin snapshots/precios locales suficientes para
calcular PolySignal Score completo.

## Candidatos elegidos para dry-run

Se eligieron 10 candidatos con score alto, shape `match_winner`, `close_time`
futuro dentro de 7 dias y deporte claro o razonablemente inferido. Se evitaron
mercados de marcador exacto, props, toss, top batter y futuros.

| market_id | Mercado | Deporte | Motivo |
| --- | --- | --- | --- |
| 31998 | Will Portland Thorns FC win on 2026-04-29? | soccer | Club claro, match winner, cierre cercano |
| 32000 | Will San Diego Wave FC win on 2026-04-29? | soccer | Club claro, match winner, cierre cercano |
| 53380 | ODI Series Bangladesh vs New Zealand: Bangladesh vs New Zealand | cricket | Partido claro, match winner |
| 53398 | Pakistan Super League: Rawalpindi Pindiz vs Islamabad United | cricket | Partido claro, match winner |
| 54582 | KBO: SSG Landers vs. Samsung Lions | mlb | Partido claro, match winner |
| 54585 | Atlanta Braves vs. Washington Nationals | mlb | Partido claro, match winner |
| 57082 | Wuerzburg vs. FC Bayern Munchen | soccer | Partido claro, match winner |
| 54589 | Philadelphia Phillies vs. Chicago Cubs | mlb | Partido claro, match winner |
| 55265 | Will SC Braga win on 2026-04-30? | soccer | Club claro, match winner |
| 55267 | Will SC Freiburg win on 2026-04-30? | soccer | Club claro, match winner |

## Resultados dry-run

Comando usado por mercado:

```bash
python -m app.commands.refresh_market_snapshots --market-id <ID> --dry-run --json
```

Resultado resumido:

| market_id | Resultado | Accion reportada | Motivo |
| --- | --- | --- | --- |
| 31998 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 32000 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 53380 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 53398 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 54582 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 54585 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 57082 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 54589 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 55265 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |
| 55267 | dry_run_ok | would_refresh | missing_snapshot, missing_prices |

El dry-run no creo snapshots, predictions ni research_runs.

## Applies ejecutados

Se aplico refresh controlado a 5 mercados como maximo:

```bash
python -m app.commands.refresh_market_snapshots --market-id <ID> --apply --json
```

| market_id | Resultado | Snapshot | SI | NO | Liquidez | Volumen | Nota |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 31998 | ok | creado | 29.0% | 71.0% | 901.7470 | 70.4828 | Datos reales disponibles |
| 53380 | warning | no | n/a | n/a | n/a | n/a | no_pricing_or_liquidity |
| 54585 | warning | no | n/a | n/a | n/a | n/a | no_pricing_or_liquidity |
| 57082 | warning | no | n/a | n/a | n/a | n/a | no_pricing_or_liquidity |
| 54589 | warning | no | n/a | n/a | n/a | n/a | no_pricing_or_liquidity |

No se ejecuto trading, no se crearon ordenes, no se crearon predictions y no se
crearon research_runs.

## Readiness despues del batch

Comandos:

```bash
python -m app.commands.recheck_data_quality --days 7 --limit 100 --json
python -m app.commands.inspect_analysis_readiness --days 7 --limit 100 --json
```

Data quality posterior:

- Total revisado: 100
- Completo: 1
- Parcial: 0
- Insuficiente: 99
- Sin snapshot: 99
- Sin precio SI/NO: 99
- Fresh: 1
- Incomplete: 99

Readiness posterior:

- Total revisado: 100
- Ready: 1
- Needs refresh: 79
- Blocked: 20
- Sin snapshot: 99
- Sin precio SI/NO: 99
- Score pendiente: 99

## Mercado que paso a ready

`31998` - Will Portland Thorns FC win on 2026-04-29?

- Evento: Portland Thorns FC vs. San Diego Wave FC
- Deporte: soccer
- Shape: match_winner
- Close time local: 2026-04-29 21:00:00-05:00
- Snapshot: si
- SI: 29.0%
- NO: 71.0%
- Liquidez: 901.7470
- Volumen: 70.4828
- Data quality: Completo
- Freshness: fresh
- PolySignal Score: calculado, `preliminary_composite`
- PolySignal SI: 29.0%
- Readiness score: 100
- Accion sugerida: listo_para_research_packet

Warnings observados en el analisis:

- `preliminary_score`
- `few_price_history_points`
- `low_confidence`
- `low_liquidity`
- `low_volume`

Esto significa que el mercado ya tiene datos minimos para probar el flujo, pero
el score sigue siendo preliminar y de baja confianza por historial corto y
liquidez/volumen bajos.

## Mercados que no mejoraron

Cuatro applies controlados no crearon snapshot porque el endpoint remoto no
devolvio pricing/liquidez suficiente:

- `53380` - Bangladesh vs New Zealand
- `54585` - Atlanta Braves vs. Washington Nationals
- `57082` - Wuerzburg vs. FC Bayern Munchen
- `54589` - Philadelphia Phillies vs. Chicago Cubs

Motivo comun:

- `no_pricing_or_liquidity`

Accion recomendada:

- No inventar precios.
- Mantenerlos como `needs_refresh` o revisar metadata.
- Reintentar solo de forma controlada si el mercado remoto empieza a devolver
  datos utiles.

## Verificacion UI

Se verifico que:

- `/data-health` responde correctamente.
- El mercado `31998` devuelve analysis con snapshot, precio SI/NO, data quality
  completa y PolySignal Score preliminar.
- Inmediatamente despues del refresh, el recheck CLI reflejo `ready_count=1`.
- Durante las validaciones finales, el mercado `31998` cruzo su `close_time`
  (`2026-04-29 21:00:00-05:00`) y el endpoint live de readiness dejo de
  contarlo como proximo. En `/markets/31998/analysis` se conserva el snapshot y
  el score preliminar, pero `freshness_status` paso a `stale` con razon
  `close_time_past`.
- El dashboard y `/data-health` quedan listos para mostrar mercados ready cuando
  existan candidatos que sigan dentro de la ventana proxima.

## Seguridad

Confirmado durante el batch:

- No OpenAI API.
- No Kalshi remoto.
- No trading.
- No ordenes.
- No predictions automaticas.
- No research_runs automaticos.
- No `.env`.
- No secretos.
- No logs commiteados.
- No snapshots inventados.
- No precios inventados.
- No sync masivo.
- Apply limitado a 5 mercados.

## Proximos pasos

1. Usar `31998` como candidato real para probar Research Packet sin ingesta
   automatica.
2. Seguir priorizando refresh con `/data-health` y `refresh-priorities`.
3. Reintentar mercados `needs_refresh` solo con dry-run previo.
4. Revisar por que varios mercados claros devuelven `no_pricing_or_liquidity`.
5. Considerar una vista de "mercados ready" por deporte para acelerar pruebas
   manuales.

## Batch v2 con ventana de tiempo

Fecha local de sesion: 2026-04-29 / 2026-04-30 UTC

El primer batch demostro que un mercado puede pasar a `ready` y expirar casi
de inmediato. El caso fue `31998`, que tuvo snapshot/precio real pero cruzo su
`close_time` poco despues. Para evitarlo, se ajusto la priorizacion operativa:

- Penalizar mercados con cierre pasado o cierre en menos de 1 hora.
- Penalizar mercados entre 1 y 6 horas.
- Priorizar mercados con ventana util de 24 horas a 7 dias.
- Mostrar `time_window_label` en readiness y prioridades.
- Filtrar por defecto el CLI de readiness con `--min-hours-to-close 6`.

### Diagnostico por ventana

Comando read-only:

```bash
python -m app.commands.inspect_analysis_readiness --days 7 --limit 200 --min-hours-to-close 0 --json
```

Resumen observado:

| Ventana | Total | Needs refresh | Blocked | Sin snapshot | Sin precio | Match winner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Menos de 1h | 1 | 0 | 0 | 0 | 0 | 0 |
| 1-6h | 1 | 0 | 0 | 0 | 0 | 0 |
| 6-24h | 76 | 40 | 36 | 76 | 76 | 76 |
| 1-3 dias | 122 | 78 | 44 | 122 | 122 | 122 |

Con el filtro recomendado:

```bash
python -m app.commands.inspect_analysis_readiness --days 7 --limit 100 --json
```

Resumen posterior:

- Total revisado: 98
- Ready: 0
- Needs refresh: 78
- Blocked: 20
- Sin snapshot: 98
- Sin precio SI/NO: 98
- Score pendiente: 98

Los candidatos principales quedaron en ventana `1-3 dias`, con accion
`buen_candidato_para_refresh_controlado`.

### Candidatos dry-run

Se eligieron 10 mercados con ventana util, shape `match_winner`, deporte claro
o razonablemente inferido, y sin props/futuros evidentes.

| market_id | Mercado | Deporte | Ventana | Dry-run |
| --- | --- | --- | --- | --- |
| 57513 | KBO: Lotte Giants vs. Kia Tigers | mlb | 1-3 dias | would_refresh |
| 57514 | KBO: Samsung Lions vs. Kiwoom Heroes | mlb | 1-3 dias | would_refresh |
| 57511 | KBO: LG Twins vs. Doosan Bears | mlb | 1-3 dias | would_refresh |
| 57512 | KBO: KT Wiz vs. SSG Landers | mlb | 1-3 dias | would_refresh |
| 55076 | Indian Premier League: Royal Challengers Bangalore vs Gujarat Titans | cricket | 1-3 dias | would_refresh |
| 55088 | Pakistan Super League: Hyderabad Kingsmen vs Islamabad United | cricket | 1-3 dias | would_refresh |
| 57518 | Boston Red Sox vs. Baltimore Orioles | mlb | 1-3 dias | would_refresh |
| 57522 | Colorado Rockies vs. New York Mets | mlb | 1-3 dias | would_refresh |
| 57524 | Minnesota Twins vs. Tampa Bay Rays | mlb | 1-3 dias | would_refresh |
| 57526 | Philadelphia Phillies vs. Atlanta Braves | mlb | 1-3 dias | would_refresh |

El dry-run no creo snapshots, predictions ni research_runs.

### Applies controlados

Se aplico refresh a 5 mercados unicos como maximo:

```bash
python -m app.commands.refresh_market_snapshots --market-id <ID> --apply --json
```

| market_id | Resultado | Snapshot | Motivo |
| --- | --- | --- | --- |
| 57513 | warning | no | no_pricing_or_liquidity |
| 57514 | warning | no | no_pricing_or_liquidity |
| 57511 | warning | no | no_pricing_or_liquidity |
| 57512 | warning | no | no_pricing_or_liquidity |
| 55076 | warning | no | no_pricing_or_liquidity |

No se aplico a nuevos mercados despues de esos 5. Se inspecciono nuevamente
`57513` para confirmar el motivo detallado del skip. No hubo snapshots creados.

### Recheck posterior

Comandos read-only:

```bash
python -m app.commands.recheck_data_quality --days 7 --limit 100 --json
python -m app.commands.inspect_analysis_readiness --days 7 --limit 100 --json
```

Data quality posterior:

- Total revisado: 100
- Completo: 0
- Parcial: 0
- Insuficiente: 100
- Sin snapshot: 100
- Sin precio SI/NO: 100
- Freshness: `incomplete` en 100 mercados

Readiness posterior:

- Total revisado: 98
- Ready: 0
- Needs refresh: 78
- Blocked: 20
- Sin snapshot: 98
- Sin precio SI/NO: 98
- Score pendiente: 98

### Resultado

La nueva priorizacion resolvio el problema de seleccionar mercados que cierran
demasiado pronto, pero el refresh controlado no obtuvo pricing/liquidez remoto
para los 5 applies. Esto es un resultado seguro: PolySignal no invento
snapshots ni precios y mantuvo los mercados como `needs_refresh`.

Proximos pasos recomendados:

1. Usar live discovery para encontrar mercados remotos con precio y condition_id.
2. Preferir imports/backfill controlados antes de snapshot refresh cuando la DB
   local tenga IDs viejos.
3. Reintentar snapshot refresh solo con dry-run y ventana de 24h a 7 dias.
4. Revisar clasificacion de mercados como KBO si siguen apareciendo como `mlb`
   por el fallback de deportes.
