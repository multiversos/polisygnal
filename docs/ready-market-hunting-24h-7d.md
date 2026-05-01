# Ready Market Hunting 24h-7d

Fecha: 2026-04-30

## Objetivo

Encontrar mercados reales proximos con ventana util entre 24h y 7d, preferiblemente 24h-72h, que puedan servir como candidatos para analisis manual en PolySignal.

Reglas aplicadas:

- No OpenAI API.
- No research automatico.
- No predicciones automaticas.
- No trading ni ordenes.
- No datos inventados.
- Import controlado con dry-run antes de apply.
- Snapshots creados solo desde pricing remoto real de Polymarket.
- Apply limitado a 3 mercados importados y 3 snapshots.

## Ajuste tecnico necesario

El primer discovery sin filtro minimo devolvia la primera pagina ordenada por `endDate`, empezando desde el momento actual. Esa pagina quedaba dominada por eventos con cierre menor a 24h.

Se agrego soporte read-only para `min_hours_to_close` en:

- `discover_live_upcoming_markets`
- `python -m app.commands.discover_live_upcoming_markets`
- `GET /research/live-upcoming-discovery`
- `import_live_discovered_markets`
- `create_snapshots_from_discovery`
- llamadas de dashboard/Data Health a readiness/discovery

Esto permite pedir discovery remoto desde `now + 24h` sin sync masivo.

## Discovery ejecutado

Comando principal:

```bash
python -m app.commands.discover_live_upcoming_markets --days 7 --limit 100 --min-hours-to-close 24 --json
```

Resumen:

- Remotos revisados: 595
- Items devueltos: 100
- Ya locales: 435
- Faltantes locales: 119
- Locales sin snapshot/precio: 435
- Remotos con precio: 554
- Remotos con `condition_id`: 554
- Remotos con `clob_token_ids`: 554
- Items `match_winner`: 85
- Candidatos 24h-72h encontrados: si

Ejemplos relevantes:

- `2082138`, Hawks vs. Knicks, NBA, close `2026-05-02T04:00:00+00:00`
- `2082148`, Timberwolves vs. Nuggets, NBA, close `2026-05-02T04:00:00+00:00`
- `2082171`, 76ers vs. Celtics, NBA, close `2026-05-02T04:00:00+00:00`
- `2116427`, Golden Knights vs. Utah, NHL, close `2026-05-02T02:00:00+00:00`
- varios soccer ya locales sin snapshot para `2026-05-02`

Se descarto importar un candidato global de eSports que aparecia como `nfl`:

- `2093209`, Call of Duty: FaZe Vegas vs Carolina Royal Ravens

Motivo: no es deporte operativo principal para este trial y no debe mezclarse con NFL real.

## Import controlado

Dry-run usado:

```bash
python -m app.commands.import_live_discovered_markets --sport nba --days 7 --limit 100 --min-hours-to-close 24 --max-import 3 --dry-run --json
```

Resultado dry-run:

- Remotos revisados: 595
- Missing local NBA: 3
- Would import: 3
- Eventos creados: 0
- Mercados creados: 0
- Snapshots creados: 0
- Predicciones creadas: 0
- Research runs creados: 0
- Trading ejecutado: false

Apply usado:

```bash
python -m app.commands.import_live_discovered_markets --sport nba --days 7 --limit 100 --min-hours-to-close 24 --max-import 3 --apply --json
```

Mercados importados:

| market_id local | remote_id | mercado | sport | close_time UTC | condition_id | clob_token_ids | URL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 72465 | 2082138 | Hawks vs. Knicks | nba | 2026-05-02T04:00:00+00:00 | si | si | https://polymarket.com/event/nba-atl-nyk-2026-05-02 |
| 72466 | 2082148 | Timberwolves vs. Nuggets | nba | 2026-05-02T04:00:00+00:00 | si | si | https://polymarket.com/event/nba-min-den-2026-05-02 |
| 72467 | 2082171 | 76ers vs. Celtics | nba | 2026-05-02T04:00:00+00:00 | si | si | https://polymarket.com/event/nba-phi-bos-2026-05-02 |

## Snapshots desde pricing remoto

Dry-run usado:

```bash
python -m app.commands.create_snapshots_from_discovery --sport nba --days 7 --limit 100 --min-hours-to-close 24 --max-snapshots 3 --dry-run --json
```

Resultado dry-run:

- Remotos revisados: 595
- Candidatos locales: 3
- Would create: 3
- Predicciones creadas: 0
- Research runs creados: 0
- Trading ejecutado: false

Apply usado:

```bash
python -m app.commands.create_snapshots_from_discovery --sport nba --days 7 --limit 100 --min-hours-to-close 24 --max-snapshots 3 --apply --json
```

Snapshots creados:

| market_id | snapshot_id | mercado | SI | NO | liquidity | volume | time_window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 72465 | 159443 | Hawks vs. Knicks | 0.4950 | 0.5050 | 254824.0807 | 193329.7771 | 1-3 dias |
| 72466 | 159444 | Timberwolves vs. Nuggets | 0.3200 | 0.6800 | 32536.8806 | 84296.9476 | 1-3 dias |
| 72467 | 159445 | 76ers vs. Celtics | 0.3150 | 0.6850 | 69434.9439 | 41603.2467 | 1-3 dias |

Los precios vienen del payload remoto real y el mapping fue `remote_binary_outcome_order`.

## Recheck readiness

Comando:

```bash
python -m app.commands.inspect_analysis_readiness --days 7 --limit 200 --min-hours-to-close 24 --json
```

Resumen:

- Total checked: 48
- Ready: 3
- Needs refresh: 45
- Blocked: 0
- Missing snapshot: 45
- Missing price: 45
- Score pending: 45

Ready 24h-72h:

| market_id | mercado | data_quality | freshness | PolySignal Score | readiness |
| --- | --- | --- | --- | --- | --- |
| 72465 | Hawks vs. Knicks | Completo | fresh | 49.5%, preliminary_composite | 100 |
| 72466 | Timberwolves vs. Nuggets | Completo | fresh | 32.0%, preliminary_composite | 100 |
| 72467 | 76ers vs. Celtics | Completo | fresh | 31.5%, preliminary_composite | 100 |

`recheck_data_quality --days 7 --limit 200 --json` reporto:

- Complete: 6
- Partial: 0
- Insufficient: 194
- Missing snapshot: 194
- Missing price: 194
- Fresh: 6
- Incomplete: 194

Los 3 nuevos NBA aparecen como `Completo` y `fresh`.

## Wallet Intelligence

Endpoint probado para cada candidato:

```bash
GET /markets/{market_id}/wallet-intelligence?min_usd=10000&limit=20
```

Resultados:

| market_id | data_available | large_trades > 10000 | warnings |
| --- | --- | --- | --- |
| 72465 | true | 0 | concentrated_side_activity |
| 72466 | true | 0 | no_large_wallet_activity_at_threshold, concentrated_side_activity |
| 72467 | true | 0 | concentrated_side_activity |

No se mostro identidad personal, no se infirio doxxing y no se hicieron acusaciones.

## UI

Se actualizo la UI para consultar readiness/discovery con `min_hours_to_close=24`:

- Dashboard: `Mercados listos para analisis`
- Data Health: `Listos para analisis` y `Preparacion para primeros analisis`

La UI no ejecuta import, snapshots, trading, research ni predicciones.

## Candidatos finales

Recomendados para prueba manual:

1. `72465`, Hawks vs. Knicks
   - Mayor liquidez y volumen de los tres.
   - Score preliminar calculable.
   - Wallet Intelligence disponible.
2. `72466`, Timberwolves vs. Nuggets
   - Snapshot completo y ventana util.
   - Wallet Intelligence disponible.
3. `72467`, 76ers vs. Celtics
   - Snapshot completo y ventana util.
   - Wallet Intelligence disponible.

No se genero Research Packet en este sprint.

## Proximos pasos

- Usar `72465` como candidato principal para un E2E manual posterior.
- Generar Research Packet solo si se decide iniciar trial con revision humana.
- Mantener Quality Gate en dry-run antes de cualquier ingesta.
- Mejorar clasificacion para evitar que eSports aparezca como NFL.
- Seguir usando `min_hours_to_close=24` para hunting de candidatos E2E.
