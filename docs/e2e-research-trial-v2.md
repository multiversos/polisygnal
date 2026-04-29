# End-to-End Research Trial v2

Fecha: 2026-04-28 America/Chicago

## Objetivo

Repetir el trial E2E con datos de mercado refrescados de forma controlada, manteniendo el flujo seguro:

- no OpenAI API;
- no research automatico;
- no ingesta real sin fuentes verificadas;
- no trading;
- no ordenes;
- no predicciones automaticas;
- no datos falsos.

## Seleccion de mercado

Mercado elegido:

- market_id: `31327`
- pregunta: `Will Vissel Kobe win on 2026-04-29?`
- evento: `Vissel Kobe vs. Cerezo Osaka`
- Polymarket market id: `1819611`
- slug: `j1100-vis-cer-2026-04-29-vis`
- close_time local: `2026-04-29T00:00:00-05:00`
- shape detectado: `match_winner`
- deporte detectado: `other`
- estado: activo y abierto

Motivo de seleccion:

- es el unico candidato proximo revisado con snapshot local reciente;
- tiene precio SI/NO disponible;
- tiene liquidez y volumen;
- aparece en `/research/upcoming-sports?days=7&include_futures=false&focus=match_winner`;
- permite probar el flujo con PolySignal Score preliminar.

Limitacion principal:

- la clasificacion deportiva sigue incierta (`sport=other`);
- no se verificaron fuentes reales externas para este trial;
- por seguridad, cualquier respuesta se mantiene como `mock_structural`.

## Refresh previo y datos disponibles

Snapshot refrescado de forma controlada:

- comando usado previamente: `python -m app.commands.refresh_market_snapshots --market-id 31327 --apply --json`
- snapshot_id: `141430`
- captured_at: `2026-04-28T23:12:21.021728-05:00`
- yes_price: `0.6050`
- no_price: `0.3950`
- midpoint: `0.6050`
- last_trade_price: `0.6000`
- spread: `0.0100`
- liquidity: `42895.8231`
- volume: `40959.0619`

Data quality posterior:

- quality label: `Parcial`
- quality score: `90`
- snapshot: si
- yes price: si
- no price: si
- liquidity: si
- volume: si
- PolySignal Score: si, preliminar
- missing_fields: `sport`
- warnings: `sport_uncertain`
- freshness: `fresh`
- recommended_action: `ok`

PolySignal Score observado:

- source: `preliminary_composite`
- PolySignal SI: `60.5%`
- Mercado SI: `60.5%`
- edge: `0.0 pts`
- confidence label: `Baja`
- warnings:
  - `preliminary_score`
  - `few_price_history_points`
  - `low_confidence`

## Candidatos de respaldo

Se intento refresh controlado para candidatos con deporte mas claro, pero no se obtuvo pricing:

- `52984` Philadelphia Phillies vs. Chicago Cubs
  - dry-run snapshot: OK
  - apply snapshot: omitido por `no_pricing_or_liquidity`
  - metadata dry-run: `remote_missing`
- `57098` Nagasaki Velca vs. Shimane Susanoo Magic
  - dry-run snapshot: OK
  - apply snapshot: omitido por `no_pricing_or_liquidity`
  - metadata dry-run: `remote_missing`

Conclusion: para el trial v2 se eligio `31327` porque era el unico con precios reales en la ventana revisada.

## Estado inicial del mercado

Antes de generar el packet del trial v2:

- research_runs: ninguno para este mercado;
- findings: ninguno;
- prediction report: ninguno;
- latest prediction: ninguno;
- external signals vinculadas: ninguna;
- data quality: parcial;
- freshness: fresh;
- PolySignal Score: preliminar con baja confianza;
- watchlist: no;
- investigation status: no;
- decision logs: ninguna.

## Research Packet

Se genero un Research Packet mediante accion explicita:

```text
POST /markets/31327/research-packet
```

Resultado:

- research_run_id: `26`
- estado del run: `pending_agent`
- modo: `codex_agent`
- request JSON: `logs/research-agent/requests/26.json`
- packet Markdown: `logs/research-agent/packets/26.md`
- response esperada: `logs/research-agent/responses/26.json`
- dry-run command: `python -m app.commands.ingest_codex_research --run-id 26 --dry-run`

Confirmaciones:

- no se uso OpenAI API;
- no se ejecuto research automatico;
- no se ingesto response automaticamente;
- no se creo prediction;
- no hubo trading ni ordenes.

## Response usada

Se creo una response local `mock_structural` solo para probar Quality Gate:

- research_mode: `mock_structural`
- source_review_required: `true`
- recommended_probability_adjustment: `0.0000`
- confidence_score: `0.1000`
- recommendation: `avoid`

Motivo:

- el mercado tiene precios y snapshot, pero no tiene evidencia externa verificada;
- la clasificacion deportiva sigue incierta;
- no se debe convertir un mock en research real.

## Quality Gate dry-run

Comando ejecutado:

```powershell
python -m app.commands.ingest_codex_research --run-id 26 --dry-run
```

Resultado:

- status: `validation_review_required`
- dry_run: `true`
- research_run_id: `26`
- research_status: `pending_agent`
- validation severity: `warning`
- recommended_action: `review_required`
- errors: ninguno
- warnings:
  - `no_citations`
  - `mock_structural_response`
  - `source_review_requested`
- source_quality_score: `0.0000`
- evidence_balance_score: `1.0000`
- confidence_adjusted: `0.1000`
- findings_created: `0`
- report_id: `null`
- prediction_id: `null`

Conclusion: no se ejecuto ingesta normal.

## Ingesta

No se ejecuto:

```powershell
python -m app.commands.ingest_codex_research --run-id 26
```

Motivos:

- la response es `mock_structural`;
- Quality Gate recomendo `review_required`;
- no hay fuentes `real_web` verificadas;
- el objetivo del trial era validar el flujo con datos de precio, no crear una prediccion real.

## Estado operativo final

Se actualizaron estados manuales sin lenguaje de apuesta ni montos:

- Watchlist:
  - status: `investigating`
  - nota: seguimiento operativo con snapshot/precio real; no recomendacion de apuesta.
- Investigation status:
  - status: `review_required`
  - priority: `65`
  - nota: dry-run ejecutado, no ingesta por mock_structural.
- Decision log:
  - decision: `waiting_for_data`
  - confidence_label: `low`
  - nota: esperar sport classification y evidencia real antes de cualquier ingesta.

Timeline posterior:

- price_snapshot `141430`;
- research_run `26`;
- watchlist actualizada;
- investigation status `review_required`;
- decision humana `waiting_for_data`.

## Comandos y endpoints usados

Diagnostico:

```text
GET /research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=5
GET /markets/31327/analysis
GET /markets/31327/timeline
GET /research/runs/26
GET /research/runs/26/quality-gate
```

Refresh/recheck:

```powershell
python -m app.commands.recheck_data_quality --days 7 --limit 20 --json
python -m app.commands.refresh_market_snapshots --market-id 52984 --dry-run --json
python -m app.commands.refresh_market_snapshots --market-id 52984 --apply --json
python -m app.commands.refresh_market_snapshots --market-id 57098 --dry-run --json
python -m app.commands.refresh_market_snapshots --market-id 57098 --apply --json
```

Packet y Quality Gate:

```text
POST /markets/31327/research-packet
python -m app.commands.ingest_codex_research --run-id 26 --dry-run
```

Organizacion operativa:

```text
POST /watchlist
POST /markets/31327/investigation-status
POST /markets/31327/decisions
```

## Seguridad

Confirmado:

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

Riesgos pendientes:

- `31327` tiene datos de precio, pero `sport=other` sigue pendiente de clasificacion;
- muchos mercados con deporte claro siguen sin snapshot/precio;
- algunos mercados remotos ya no aparecen en Gamma `/markets`, por lo que el refresh controlado los omite;
- no hay evidencia `real_web` verificada para crear findings o prediction report.

Proximos pasos recomendados:

1. Mejorar clasificacion de futbol/J League para mercados tipo `Vissel Kobe vs Cerezo Osaka`.
2. Investigar por que mercados MLB/NBA locales recientes devuelven `remote_missing` o sin pricing.
3. Agregar una vista de refresh outcomes para distinguir `updated`, `skipped` y `remote_missing`.
4. Repetir el trial con un mercado que tenga `sport` claro y fuentes reales verificadas.
