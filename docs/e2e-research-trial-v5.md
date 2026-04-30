# End-to-End Research Trial v5

Fecha: 2026-04-29

## Objetivo

Validar un flujo E2E con un mercado importado desde Live Discovery que ya tenga:

- mercado local;
- identificadores publicos de Polymarket;
- snapshot/precio local creado desde payload remoto;
- PolySignal Score calculable;
- Wallet Intelligence consultable por `condition_id`;
- Research Packet generado por accion explicita;
- Quality Gate en dry-run.

No se ejecuto investigacion automatica, no se ingirio respuesta real y no se creo prediccion.

## Mercado elegido

- `market_id`: 72464
- Mercado: Fenerbahce vs. Zalgiris Kaunas
- Deporte/shape: `nba` / `match_winner`
- Origen: importado desde Live Discovery
- Remote market id: `2067895`
- Event id local: `10878`
- Slug: `euroleague-fenerbah-kaunas-2026-04-30`
- URL Polymarket: `https://polymarket.com/event/euroleague-fenerbah-kaunas-2026-04-30`
- Close time local: `2026-04-30T11:00:00-05:00`
- Estado local: activo, no cerrado

Identificadores publicos persistidos:

- `condition_id`: `0x0bccc85102eb91980790647a1ab6e992f3fb99d03a7d077c3acc376e6b794d91`
- `question_id`: `0x693d79fdac11b39896d9c0f00c682fdb75cd39903493806212f6087055931b4c`
- Outcome YES/Fenerbahce token: `61244177643800419058662373983534977231118059295790754978233272214070942498786`
- Outcome NO/Zalgiris Kaunas token: `72794385418639814969139529452891468267455622026661568549286720964211218188515`

## Datos de mercado

Snapshot local mas reciente:

- Snapshot id: `150982`
- Capturado: `2026-04-29T23:01:52.845689-05:00`
- Precio SI: `0.7000`
- Precio NO: `0.3000`
- Liquidez: `33118.0442`
- Volumen: `2738.8386`

Calidad de datos:

- Quality label: `Completo`
- Quality score: `100`
- Freshness: `fresh`
- Recommended action: `ok`

PolySignal Score:

- Source: `preliminary_composite`
- Score: `70.0%`
- Confidence label: `Baja`
- Warnings: `preliminary_score`, `few_price_history_points`, `low_confidence`

Interpretacion operativa:

- El mercado esta listo como prueba tecnica de datos locales y scoring preliminar.
- El score no incorpora evidencia externa verificada.
- La baja confianza se mantiene porque hay poca historia de precio y no hay analisis real ingerido.

## Wallet Intelligence

Endpoint probado:

```bash
GET /markets/72464/wallet-intelligence?min_usd=10000&limit=20
```

Resultado:

- `data_available`: true
- Operaciones grandes sobre el umbral: 0
- Wallets notables sobre el umbral: 0
- Warning: `no_large_wallet_activity_at_threshold`
- Concentracion disponible por lado, sin identificar personas ni inferir identidad real.

La seccion de billeteras funciono con `condition_id` persistido, pero no encontro actividad grande bajo el umbral configurado.

## Research Packet

Comando usado:

```bash
python -m app.commands.prepare_codex_research --market-id 72464
```

Resultado:

- `research_run_id`: 27
- Estado del run: `pending_agent`
- Modo: `codex_agent`
- Packet/request/response esperada generados bajo `logs/research-agent/`

Los archivos generados no se commitean.

## Quality Gate

Se creo una response local `mock_structural` para validar el flujo de Quality Gate sin afirmar evidencia real.

Comando dry-run:

```bash
python -m app.commands.ingest_codex_research --run-id 27 --dry-run
```

Resultado:

- Status: `validation_review_required`
- Recommended action: `review_required`
- Severity: `warning`
- Findings creados: 0
- Report creado: no
- Prediction creada: no

Warnings principales:

- `no_citations`
- `mock_structural_response`
- `source_review_requested`

Decision:

- No se ejecuto ingesta normal.
- El run queda pendiente/requiere revision.
- El trial valida plumbing y visibilidad, no analisis real.

## Estado operativo final

Actualizaciones manuales realizadas:

- Watchlist: `investigating`
- Investigation status: `review_required`
- Decision log: `waiting_for_data`, confianza `low`

La timeline del mercado muestra:

- decision
- investigation_status
- watchlist
- research_run
- price_snapshot

## Validaciones funcionales

Consultas verificadas:

- `GET /markets/72464/analysis`
- `GET /markets/72464/timeline`
- `GET /research/runs/27`
- `GET /research/runs/27/quality-gate`
- `GET /markets/72464/wallet-intelligence?min_usd=10000&limit=20`

Resultado esperado:

- El mercado muestra snapshot/precios.
- PolySignal Score se calcula como preliminar.
- Quality Gate muestra el validation report.
- Wallet Intelligence usa `condition_id` y devuelve empty state seguro para actividad grande.
- No hay findings/report/prediction creados.

## Seguridad

Confirmado durante el trial:

- No OpenAI API.
- No research automatico.
- No ingesta normal.
- No predictions automaticas.
- No ordenes.
- No credenciales.
- No datos inventados.
- No packets/responses/validation reports commiteados.

## Riesgos y proximos pasos

- Se necesita evidencia `real_web` verificable antes de cualquier ingesta real.
- El score actual es preliminar y de baja confianza.
- Wallet Intelligence puede no devolver senales grandes si el umbral es alto o si el mercado tiene poca actividad publica reciente.
- Para el siguiente trial real, usar fuentes deportivas publicas verificables y mantener dry-run de Quality Gate antes de cualquier ingesta.
