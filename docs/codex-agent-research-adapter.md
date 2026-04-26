# Codex Agent Research Adapter

Este modo experimental permite que PolySignal prepare una investigacion para que Codex/ChatGPT actue como agente externo y devuelva un JSON estructurado. PolySignal no lee tokens internos de Codex, no toca `auth.json` y no intenta reutilizar sesiones privadas.

## Que es

`codex_agent` es un flujo por archivos:

1. PolySignal genera un request JSON con los datos del mercado.
2. El usuario le pide a Codex, ya autenticado oficialmente, que investigue y produzca un response JSON.
3. PolySignal valida ese response.
4. PolySignal crea `research_findings`, `prediction_report` y una `prediction` con `prediction_family='research_v1_codex_agent'`.

Este modo no ejecuta apuestas automaticas y no reemplaza `scoring_v1`, `research_v1_local` ni `research_v1_llm`.

## Por que no usa tokens internos

Codex CLI puede estar autenticado con la membresia de ChatGPT del usuario, pero esas credenciales pertenecen al cliente Codex. PolySignal no debe leerlas, copiarlas ni usarlas como autenticacion backend. El puente seguro es operacional: Codex lee un request sin secretos y escribe un response sin secretos.

## Paso 1: generar request

Opcionalmente, revisa candidatos antes de preparar un run:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.list_research_candidates --sport nba --limit 5
```

El selector muestra `candidate_score`, razones y warnings. Sirve para elegir mercados a
investigar; no es una recomendacion de apuesta.

Puedes usar un mercado explicito:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.prepare_codex_research --market-id 123
```

O dejar que PolySignal seleccione un candidato:

```powershell
.\.venv\Scripts\python.exe -m app.commands.prepare_codex_research --auto-select --sport nba --limit 1
```

Esto crea:

```text
N:\projects\polimarket\logs\research-agent\requests\{run_id}.json
N:\projects\polimarket\logs\research-agent\packets\{run_id}.md
```

Tambien imprime:

- `request_path`
- `packet_path`
- `response_path_expected`
- `ingest_command`
- un prompt corto para pedirle a Codex que procese el archivo

Si necesitas solo el request JSON, usa `--no-packet`.

## Paso 2: usar el research packet

Abre el packet markdown y pasalo a Codex/ChatGPT como instrucciones operativas. El packet
incluye:

- la ruta exacta del request JSON
- la ruta esperada para la response JSON
- el comando exacto de ingesta
- reglas de seguridad
- resumen del schema esperado
- checklist de revision humana

Codex/ChatGPT debe leer el request JSON completo, investigar fuentes publicas si tiene
acceso web, y devolver solo JSON valido. Si no tiene acceso web, debe devolver un mock
estructural marcado claramente como mock y no inventar fuentes.

La respuesta debe guardarse en:

```text
N:\projects\polimarket\logs\research-agent\responses\{run_id}.json
```

Antes de ingestar, revisa manualmente que:

- existan `evidence_for_yes` y `evidence_against_yes`
- el campo `research_mode` sea `real_web`, `mock_structural` o `manual`
- `source_review_required` este en `true` si las fuentes necesitan revision humana
- los `citation_url` sean reales cuando el response diga que uso fuentes reales
- no haya fuentes inventadas
- `recommended_probability_adjustment` este entre `-0.12` y `0.12`
- `recommendation` no se interprete como orden de apuesta

## Quality Gate

Antes de crear `research_findings`, `prediction_report` y `prediction`, PolySignal corre
un Quality Gate sobre el response JSON.

El reporte de validacion incluye:

- `is_valid`
- `severity`: `pass`, `warning` o `failed`
- `errors`
- `warnings`
- `source_quality_score`
- `evidence_balance_score`
- `confidence_adjusted`
- `recommended_action`: `ingest`, `review_required` o `reject`

Significado operativo:

- `ingest`
  el JSON puede ingestar normalmente.
- `review_required`
  el JSON tiene schema valido, pero necesita revision humana antes de crear prediccion.
  Por defecto no se ingesta.
- `reject`
  el JSON no debe ingestar. El run queda marcado como `failed`.

Casos comunes:

- Sin citas reales en un response `real_web`: `review_required` o `reject`.
- `mock_structural`: requiere revision explicita; no se trata como investigacion real.
- `manual`: requiere revision humana.
- `source_review_required=true`: fuerza `review_required` como minimo.
- `confidence_score` alto con fuentes debiles: PolySignal puede bajar `confidence_adjusted`.

Validar sin ingestar:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.ingest_codex_research --run-id 123 --dry-run
```

Ingestar un response `review_required` solo cuando ya fue revisado:

```powershell
.\.venv\Scripts\python.exe -m app.commands.ingest_codex_research --run-id 123 --allow-review-required
```

Si un JSON fue rechazado, corrigelo revisando:

- que `run_id` y `market_id` coincidan con el request
- que el JSON sea valido
- que tenga al menos una evidencia
- que tenga evidencia a favor y en contra cuando sea posible
- que cada evidencia tenga `reasoning` o `evidence_summary`
- que los `citation_url` reales tengan formato `http` o `https`
- que `recommended_probability_adjustment` este dentro de `-0.12` y `0.12`
- que no haya fuentes, URLs o claims inventados

Este Quality Gate protege la calidad de predicciones. No convierte el resultado en una
recomendacion de apuesta ni reemplaza la revision humana.

## Paso 3: ingestar response

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.ingest_codex_research --run-id 123
```

Si el JSON es valido, coincide con el `run_id` y `market_id`, y el Quality Gate recomienda
`ingest`, PolySignal crea findings, report y prediction. Si el JSON es invalido o el
Quality Gate recomienda `reject`, el run se marca como `failed` con `error_message`.

## Archivos creados

- Requests: `logs/research-agent/requests/{run_id}.json`
- Packets: `logs/research-agent/packets/{run_id}.md`
- Responses: `logs/research-agent/responses/{run_id}.json`

La carpeta `logs/` esta ignorada por git.

## Riesgos

- Codex puede devolver fuentes incompletas o claims debiles.
- El JSON puede fallar validacion si falta evidencia a favor/en contra.
- No hay garantia de que Codex haya usado web search real; PolySignal infiere uso de fuentes a partir de citas.
- Es experimental y requiere revision humana.
- El selector de candidatos y la recomendacion del response no son instrucciones de trading.
- Nunca incluyas secretos, `.env`, tokens o credenciales en request, packet o response.
