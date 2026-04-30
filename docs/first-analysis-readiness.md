# First Analysis Readiness MVP

Fecha local de sesion: 2026-04-29

Este documento resume el primer flujo de preparacion para analisis completo en
PolySignal. El objetivo fue separar mercados proximos que ya tienen datos
suficientes de los que necesitan refresh controlado o deben quedar bloqueados
por ahora.

## Por que aparecen avisos

Muchos proximos partidos muestran:

- Sin snapshot
- Faltan precios
- Score pendiente

Eso ocurre cuando la base local conoce el mercado y su `close_time`, pero no
tiene un snapshot local con `yes_price`, `no_price`, liquidez y volumen. Sin
ese snapshot, PolySignal no inventa probabilidades y el score queda como
`insufficient_data` o pendiente.

Los datos viven principalmente en:

- `markets`: metadata local del mercado.
- `market_snapshots`: precios, liquidez y volumen capturados.
- `external_market_signals`: senales externas vinculadas si existen.
- `predictions`: predicciones guardadas manualmente por flujos validados.

## Diagnostico inicial

Diagnostico read-only sobre los proximos 7 dias:

- Total revisado por selector: 200 mercados.
- Con snapshot: 0.
- Sin snapshot: 200.
- Con precio SI/NO: 0.
- Sin precio SI/NO: 200.
- Con PolySignal Score calculado: 0.
- Con PolySignal Score pendiente: 200.

Distribucion observada por deporte en la muestra de 200:

- `soccer`: 80
- `mlb`: 39
- `cricket`: 11
- `nba`: 4
- `other`: 66

Clasificacion de readiness en la muestra de 200:

- Ready: 0
- Needs refresh: 117
- Blocked: 83

La categoria `blocked` incluye mercados con deporte incierto, mercados stale o
submercados que no son el ganador principal, por ejemplo marcadores exactos.

## Que necesita un mercado para estar listo

Un mercado queda `ready` cuando cumple:

- Snapshot disponible.
- Precio SI y NO disponibles.
- Deporte claro.
- Shape `match_winner` principal.
- `close_time` valido y no stale.
- Calidad de datos `Completo` o `Parcial`.
- PolySignal Score calculado desde datos reales disponibles.

Si falta snapshot o precio, pero el mercado es claro, queda como
`needs_refresh`.

Si el deporte es incierto, el mercado es stale, no es match winner principal o
tiene shape ambiguo, queda como `blocked`.

## Endpoint y CLI creados

Endpoint read-only:

```bash
GET /research/analysis-readiness?sport=&days=7&limit=50
```

CLI read-only:

```bash
python -m app.commands.inspect_analysis_readiness --days 7 --limit 50 --json
```

Ambos devuelven:

- Summary de ready / needs_refresh / blocked.
- Missing snapshots.
- Missing prices.
- Score pendiente.
- Score de readiness por mercado.
- Accion sugerida.
- Comandos dry-run sugeridos para refresh controlado.

## Refresh controlado probado

Se probaron dry-run limitados en tres mercados:

```bash
python -m app.commands.refresh_market_snapshots --market-id 52992 --dry-run --json
python -m app.commands.refresh_market_snapshots --market-id 53380 --dry-run --json
python -m app.commands.refresh_market_snapshots --market-id 57082 --dry-run --json
```

Resultado:

- No se crearon snapshots.
- No se crearon predictions.
- No se crearon research_runs.
- No hubo trading.
- Los tres quedaron como `would_refresh`.

Se aplico refresh real controlado a un solo mercado:

```bash
python -m app.commands.refresh_market_snapshots --market-id 52992 --apply --json
```

Resultado:

- Mercado: `52992`, Los Angeles Dodgers vs. San Francisco Giants.
- Snapshots creados: 0.
- Motivo: `no_pricing_or_liquidity`.
- Predictions creadas: 0.
- Research runs creados: 0.
- Trading ejecutado: false.

Recheck:

```bash
python -m app.commands.recheck_data_quality --market-id 52992 --days 7 --limit 50 --json
```

El mercado siguio `Insuficiente` por falta de snapshot, precio, liquidez,
volumen y score.

## Mercados seleccionados para prueba

### Ready

No se encontro ningun mercado `ready` en la muestra revisada. La causa comun
fue ausencia de snapshot y precio SI/NO.

### Partial util

`31327` - Will Vissel Kobe win on 2026-04-29?

- Deporte inferido: soccer.
- Shape: match_winner.
- Snapshot: si.
- SI: 60.5%.
- NO: 39.5%.
- Data quality: Completo.
- PolySignal Score: preliminary_composite, 60.5%.
- Estado de frescura: stale / review_market.
- Accion: util para validar UI y explicaciones, pero no debe usarse como
  mercado proximo listo porque la frescura requiere revision.

### Needs refresh

`52992` - Los Angeles Dodgers vs. San Francisco Giants

- Deporte inferido: mlb.
- Shape: match_winner.
- Snapshot: no.
- SI/NO: no disponible.
- Data quality: Insuficiente.
- PolySignal Score: insufficient_data.
- Refresh apply controlado: probado en un solo mercado.
- Resultado: `no_pricing_or_liquidity`.
- Accion: esperar datos o revisar metadata/mercado remoto; no inventar precio.

### Blocked

`52990` - Chicago White Sox vs. Arizona Diamondbacks

- Deporte inferido: other.
- Shape: match_winner.
- Snapshot: no.
- SI/NO: no disponible.
- Data quality: Insuficiente.
- Motivo principal: deporte incierto y faltan datos.
- Accion: mejorar clasificacion o descartar por ahora hasta tener metadata clara.

## UI agregada

En `/data-health` se agrego la seccion:

- Preparacion para primeros analisis

Muestra:

- Mercados listos.
- Mercados que necesitan refresh.
- Mercados bloqueados.
- Faltantes comunes.
- Accion sugerida.
- Comandos dry-run copiables.

En el dashboard principal se agrego una seccion compacta:

- Mercados listos para analisis

Si no hay mercados listos, muestra una explicacion y apunta a Data Health.

## Que NO se hizo

- No se uso OpenAI API.
- No se uso Kalshi remoto.
- No se ejecuto research automatico.
- No se ingesto response.
- No se crearon predictions automaticas.
- No se ejecuto trading.
- No se crearon ordenes.
- No se inventaron precios.
- No se inventaron snapshots.
- No se inventaron mercados.
- No se hizo sync masivo.

## Proximos pasos

1. Mejorar clasificacion de mercados `other` claros, especialmente MLB y clubes.
2. Usar `/data-health` para escoger candidatos con mejor prioridad de refresh.
3. Probar refresh controlado mercado por mercado.
4. Repetir recheck hasta que aparezcan mercados `ready`.
5. Generar Research Packet solo para mercados ready o partial utiles.
6. Ingestar evidencia solo si es real, verificable y pasa Quality Gate.
