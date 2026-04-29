# End-to-End Research Trial v3

Fecha: 2026-04-29 America/Chicago

## Objetivo

Validar el flujo operativo con un mercado que ya tiene precio/snapshot y una evidencia manual real, sin convertirla en prediccion automatica.

Reglas mantenidas:

- no OpenAI API;
- no research automatico;
- no ingesta automatica;
- no prediction automatica;
- no trading;
- no ordenes;
- no datos falsos;
- no fuentes inventadas.

## Mercado seleccionado

Mercado elegido:

- market_id: `31327`
- pregunta: `Will Vissel Kobe win on 2026-04-29?`
- slug: `j1100-vis-cer-2026-04-29-vis`
- evento: `Vissel Kobe vs Cerezo Osaka`
- close_time local: `2026-04-29T00:00:00-05:00`
- deporte detectado tras remediacion: `soccer`
- shape detectado: `match_winner`
- estado local: activo y abierto

Motivo de seleccion:

- es un mercado proximo con snapshot/precio real refrescado de forma controlada;
- tras la remediacion de clasificacion, ya no queda como `sport=other`;
- permite probar evidencia manual con una fuente oficial verificable;
- no requiere ejecutar research automatico ni crear prediccion.

## Datos de precio y calidad

Snapshot disponible:

- snapshot_id: `141430`
- captured_at: `2026-04-28T23:12:21.021728-05:00`
- yes_price: `0.6050`
- no_price: `0.3950`
- liquidity: `42895.8231`
- volume: `40959.0619`

PolySignal Score observado:

- source: `preliminary_composite`
- PolySignal SI: `60.5%`
- Mercado SI: `60.5%`
- edge: `0.0 pts`
- confidence label: `Baja`

Notas:

- el score sigue siendo preliminar porque no hay prediccion guardada;
- la evidencia manual agregada no actualiza automaticamente el score;
- PolySignal no invento probabilidad adicional.

## Evidencia manual agregada

Se agrego una evidencia manual con fuente oficial:

- evidence_id: `1`
- source_name: `J.LEAGUE official match page`
- source_url: `https://www.jleague.co/match/j1-100-year-vision/2026042908/`
- title: `Vissel Kobe vs Cerezo Osaka, Matchweek 13`
- stance: `neutral`
- evidence_type: `fixture`
- review_status: `pending_review`

Claim registrado:

```text
La pagina oficial de J.LEAGUE lista Vissel Kobe vs Cerezo Osaka para el miercoles 29 de abril de 2026, con inicio 14:03 JST en NOEVIR Stadium Kobe.
```

La fuente oficial muestra:

- `Vissel Kobe VS Cerezo Osaka`
- `MEIJI YASUDA J1 100 YEAR VISION LEAGUE`
- `Wednesday, 29 April 2026`
- `Kick-off 14:03 JST`
- `NOEVIR Stadium Kobe`

Esta evidencia valida el fixture/calendario, no una conclusion probabilistica.

## Verificacion UI/API

Endpoints revisados:

```text
GET /markets/31327/manual-evidence
GET /manual-evidence?market_id=31327
GET /markets/31327/analysis
GET /markets/31327/timeline
```

Resultados:

- `/markets/31327/manual-evidence` devuelve la evidencia manual creada;
- `/manual-evidence?market_id=31327` muestra la evidencia con contexto de mercado;
- `/markets/31327/analysis` conserva PolySignal Score `preliminary_composite`;
- `/markets/31327/timeline` muestra eventos operativos existentes, pero todavia no incluye evidencia manual.

Riesgo UX detectado:

- la timeline global del mercado no muestra todavia eventos de evidencia manual. Conviene agregarlo en un sprint posterior.

## Estado operativo final

Se actualizaron estados manuales sin lenguaje de apuesta ni montos:

- Watchlist:
  - status: `investigating`
  - nota: trial v3 con precio/snapshot y evidencia manual oficial pendiente de revision.
- Investigation status:
  - status: `review_required`
  - priority: `15`
  - nota: evidencia manual oficial agregada; revisar antes de cualquier ingesta o conclusion.
- Decision log:
  - decision: `investigate_more`
  - confidence_label: `medium`
  - nota: continuar revision con fuente oficial de fixture y datos de precio reales; no se crea prediccion automatica.

## Lo que se valido

- seleccion de mercado con precio/snapshot real;
- clasificacion de futbol para Vissel Kobe como `soccer`;
- formulario/servicio de evidencia manual;
- dashboard `/evidence` mediante endpoint global `/manual-evidence`;
- market detail `/markets/31327` con evidencia manual;
- decision/status/watchlist como flujo operativo;
- PolySignal Score no cambia por evidencia manual pendiente;
- no se crean prediction reports ni findings automaticos.

## Seguridad

Confirmado:

- no OpenAI API;
- no Kalshi remoto;
- no research automatico;
- no ingesta de response;
- no predictions creadas;
- no research_runs creados en este trial;
- no trading;
- no ordenes;
- no apuestas;
- no montos ni stake;
- no logs, packets, responses ni validation reports deben commitearse.

## Riesgos y proximos pasos

Riesgos pendientes:

- la evidencia manual requiere revision humana y no debe tratarse como verificada por PolySignal;
- la timeline no incluye manual evidence todavia;
- el mercado puede necesitar revalidacion de freshness si se acerca o pasa la hora real del evento;
- muchos mercados siguen sin snapshots/precios.

Proximos pasos recomendados:

1. Incluir manual evidence en `/markets/{id}/timeline`.
2. Permitir filtros de evidencia pendiente por deporte en `/evidence`.
3. Repetir el trial con evidencia deportiva adicional, como alineaciones o reporte oficial previo.
4. Mantener Quality Gate como paso separado antes de cualquier ingesta real.
