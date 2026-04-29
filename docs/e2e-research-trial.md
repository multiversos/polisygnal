# End-to-End Research Trial MVP

Fecha: 2026-04-28 America/Chicago

## Mercado seleccionado

- Mercado principal: `52979`
- Pregunta: New York Yankees vs. Boston Red Sox
- Deporte: MLB
- Forma: `match_winner`
- Close time local en PolySignal: `2026-04-29T17:45:00-05:00`
- Polymarket market id: `1998954`
- Slug: `mlb-nyy-bos-2026-04-22`

Mercados de respaldo revisados:

- `52984` Philadelphia Phillies vs. Chicago Cubs
- `52992` Los Angeles Dodgers vs. San Francisco Giants

## Motivo de seleccion

El mercado `52979` fue elegido porque cumple la estructura operativa del trial:

- mercado activo y abierto en la DB local;
- tipo `match_winner`;
- deporte clasificado como `mlb`;
- titulo claro con dos participantes;
- aparece en `/research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=50`.

No fue elegido por calidad de datos completa. Fue elegido para probar el flujo seguro de Research Packet + Quality Gate cuando faltan datos.

## Calidad de datos inicial

Resultado de data quality para `52979`:

- quality label: `Insuficiente`
- quality score: `25`
- snapshot: no
- yes price: no
- no price: no
- liquidity: no
- volume: no
- external signal: no
- prediction: no
- research previo: no
- PolySignal Score: pendiente

Campos faltantes:

- `snapshot`
- `yes_price`
- `no_price`
- `liquidity`
- `volume`
- `polysignal_score`

Warnings relevantes:

- `missing_snapshot`
- `missing_price`
- `missing_liquidity`
- `missing_volume`
- `polysignal_score_pending`

## Estado inicial del mercado

Antes del trial:

- research runs: ninguno
- findings: ninguno
- prediction report: ninguno
- latest prediction: ninguno
- PolySignal Score: `insufficient_data`
- external signals vinculadas: ninguna
- watchlist: no
- investigation status: no
- decisions: ninguna
- outcome: no encontrado
- timeline: vacia

## Research Packet

Se genero un Research Packet mediante el endpoint seguro:

```text
POST /markets/52979/research-packet
```

Resultado:

- research_run_id: `25`
- estado del run: `pending_agent`
- modo del run: `codex_agent`
- request JSON: `logs/research-agent/requests/25.json`
- packet Markdown: `logs/research-agent/packets/25.md`
- response esperada: `logs/research-agent/responses/25.json`
- dry-run command: `python -m app.commands.ingest_codex_research --run-id 25 --dry-run`

Confirmaciones:

- no se uso OpenAI API;
- no se ejecuto research automatico;
- no se ingesto response automaticamente;
- no se creo prediction;
- no hubo trading ni ordenes.

## Investigacion real vs mock estructural

No se realizo ingesta `real_web`.

Durante la revision publica se detecto un riesgo de calendario/outcome conocido: MLB muestra una pagina oficial para Yankees vs Red Sox del 22 de abril de 2026 con resultado Yankees 4, Red Sox 1:

- https://www.mlb.com/video/game/824774

La DB local conserva `close_time` del 29 de abril de 2026, pero las reglas del mercado hacen referencia al juego del 22 de abril. Esa inconsistencia impide usar este mercado como prueba honesta de prediccion previa al evento.

Por eso se creo una response JSON `mock_structural` solo para validar schema y Quality Gate:

- `research_mode`: `mock_structural`
- `source_review_required`: `true`
- `recommended_probability_adjustment`: `0.0000`
- `recommendation`: `avoid`

La response mock no se debe presentar como research real.

## Quality Gate dry-run

Comando ejecutado:

```powershell
python -m app.commands.ingest_codex_research --run-id 25 --dry-run
```

Resultado:

- status: `validation_review_required`
- dry_run: `true`
- research_run_id: `25`
- research_status: `pending_agent`
- validation severity: `warning`
- recommended_action: `review_required`
- errors: ninguno
- warnings:
  - `no_citations`
  - `mock_structural_response`
  - `source_review_requested`
- findings_created: `0`
- report_id: `null`
- prediction_id: `null`

Conclusion: no se ejecuto ingesta normal.

## Ingesta

No se ejecuto:

```powershell
python -m app.commands.ingest_codex_research --run-id 25
```

Motivos:

- la respuesta fue `mock_structural`;
- Quality Gate recomendo `review_required`;
- faltan precios, snapshots, liquidez y volumen;
- existe riesgo de outcome ya conocido por la pagina oficial de MLB;
- no hay base para crear una prediction real.

## Estado operativo final

Se organizaron estados manuales, sin lenguaje de apuesta ni montos:

- Watchlist:
  - status: `investigating`
  - nota: seguimiento operativo del trial, no recomendacion de apuesta.
- Investigation status:
  - status: `review_required`
  - priority: `70`
  - nota: dry-run ejecutado, no ingesta por mock/datos insuficientes.
- Decision log:
  - decision: `waiting_for_data`
  - confidence_label: `low`
  - nota: esperar datos reales antes de analisis.

Timeline posterior:

- research_run `25` en estado `pending_agent`;
- watchlist actualizada;
- investigation status `review_required`;
- decision humana `waiting_for_data`.

## Comandos usados

Consultas principales:

```text
GET /research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=50
GET /research/upcoming-sports/data-quality?days=7&limit=50
GET /markets/52979/analysis
GET /markets/52979/price-history
GET /markets/52979/timeline
GET /markets/52979/external-signals
GET /markets/52979/watchlist
GET /markets/52979/investigation-status
GET /markets/52979/decisions
GET /research/runs/25
GET /research/runs/25/quality-gate
```

Acciones locales:

```text
POST /markets/52979/research-packet
POST /watchlist
POST /markets/52979/investigation-status
POST /markets/52979/decisions
```

Dry-run:

```powershell
python -m app.commands.ingest_codex_research --run-id 25 --dry-run
```

## Seguridad

Confirmado durante el trial:

- no OpenAI API;
- no Kalshi remoto;
- no trading;
- no ordenes;
- no apuestas;
- no montos ni stake;
- no predictions creadas;
- no research findings creados;
- no prediction report creado;
- no ingesta normal;
- no secretos ni `.env` tocados;
- no logs, packets, responses ni validation reports deben commitearse.

## Riesgos y proximos pasos

Riesgos detectados:

- La DB local puede contener mercados con `close_time` futuro aunque el evento deportivo ya haya ocurrido.
- Faltan snapshots/precios en los proximos partidos, por lo que PolySignal Score queda pendiente.
- El endpoint de Quality Gate UI no mostro el validation report generado por dry-run, aunque el archivo existe bajo logs; la UI queda como instrucciones pendientes.

Proximos pasos recomendados:

1. Agregar un control de data-quality que marque mercados con posible outcome conocido o fecha de reglas inconsistente.
2. Mejorar la frescura de snapshots/precios con sync controlado, no masivo.
3. Exponer validation reports de dry-run de forma segura en `/research/runs/{run_id}/quality-gate`.
4. Repetir el trial con un mercado que tenga snapshot/precios y evento realmente futuro.

## Como repetir el trial

Usar la página `/trials/e2e` como checklist visual y repetir el flujo de forma manual:

1. Elegir un mercado desde `/`, `/sports` o:

   ```text
   GET /research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=20
   ```

2. Revisar calidad y frescura:

   ```text
   GET /research/upcoming-sports/data-quality?days=7&limit=50
   GET /data-health/snapshot-gaps?days=7&limit=50
   python -m app.commands.inspect_snapshot_gaps --days 7 --limit 50
   ```

3. Generar el Research Packet solo desde una acción explícita:

   ```text
   POST /markets/{market_id}/research-packet
   ```

4. Ejecutar primero Quality Gate en dry-run:

   ```powershell
   python -m app.commands.ingest_codex_research --run-id {RUN_ID} --dry-run
   ```

5. No ingestar si la respuesta es `mock_structural`, si el Quality Gate devuelve `review_required`/`reject`, o si faltan fuentes verificables.

6. Si el dry-run pasa con `real_web` verificable, revisar manualmente el reporte antes de cualquier ingesta normal.

7. Actualizar watchlist, investigation status y decision log con lenguaje operativo. No registrar montos, stake, ordenes ni recomendaciones de apuesta.

8. Registrar outcome manual solo cuando exista resultado real verificado.

No hacer en este flujo:

- no usar OpenAI API;
- no ejecutar research automático;
- no inventar fuentes, precios ni evidencia;
- no crear predicciones automáticas;
- no ejecutar trading ni órdenes;
- no commitear logs, packets, responses ni validation reports.
