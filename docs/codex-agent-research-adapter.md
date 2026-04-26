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

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.prepare_codex_research --market-id 123
```

Esto crea:

```text
N:\projects\polimarket\logs\research-agent\requests\{run_id}.json
```

Tambien imprime un prompt corto para pedirle a Codex que procese el archivo.

## Paso 2: pedir a Codex que investigue

En Codex/ChatGPT, pide que lea el request JSON, investigue fuentes publicas si corresponde, y devuelva solo JSON valido con el schema indicado. La respuesta debe guardarse en:

```text
N:\projects\polimarket\logs\research-agent\responses\{run_id}.json
```

## Paso 3: ingestar response

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.ingest_codex_research --run-id 123
```

Si el JSON es valido y coincide con el `run_id` y `market_id`, PolySignal crea findings, report y prediction. Si el JSON es invalido, el run se marca como `failed` con `error_message`.

## Archivos creados

- Requests: `logs/research-agent/requests/{run_id}.json`
- Responses: `logs/research-agent/responses/{run_id}.json`

La carpeta `logs/` esta ignorada por git.

## Riesgos

- Codex puede devolver fuentes incompletas o claims debiles.
- El JSON puede fallar validacion si falta evidencia a favor/en contra.
- No hay garantia de que Codex haya usado web search real; PolySignal infiere uso de fuentes a partir de citas.
- Es experimental y requiere revision humana.
