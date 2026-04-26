# Dashboard Visual MVP

El Dashboard Visual MVP es la primera pantalla operativa de PolySignal para revisar el estado local del sistema y explorar mercados candidatos para investigacion. Es una vista read-only: no ejecuta research, no ingesta responses, no crea predicciones y no ejecuta apuestas automaticas.

## Que muestra

- Estado del backend mediante `GET /health`.
- Disponibilidad del overview de mercados mediante `GET /markets/overview`.
- Top research candidates mediante `GET /research/candidates`.
- Participantes inferidos con avatar visual: logo/imagen si existe en datos locales, o iniciales como fallback.
- Filtros visuales por `sport`, `market_shape` y `limit`.
- Enlaces rapidos a API docs, backend panel, health, markets overview y candidates JSON.
- Glosario de conceptos operativos: YES price, NO price, candidate_score, confidence_score, edge, liquidity, volume, market_shape, research packet y Quality Gate.

## Como levantarlo localmente

Backend:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd N:\projects\polimarket
npm.cmd --workspace apps/web run dev -- --hostname 127.0.0.1 --port 3000
```

URL principal:

```text
http://127.0.0.1:3000
```

## Configuracion

El frontend lee la API desde:

```text
NEXT_PUBLIC_API_BASE_URL
```

Para desarrollo local, el fallback es:

```text
http://127.0.0.1:8000
```

No se debe commitear un archivo `.env` real. Los valores de ejemplo viven en `.env.example` y `apps/web/.env.example`.

## Endpoint de candidatos

```text
GET /research/candidates
```

Parametros:

- `limit`: cantidad maxima de candidatos.
- `vertical`: por defecto `sports`.
- `sport`: `nba`, `nfl`, `soccer`, `horse_racing`, `mlb`, `tennis`, `mma` u otro valor soportado por la clasificacion.
- `market_shape`: `match_winner`, `championship`, `futures`, `player_prop`, `team_prop`, `race_winner`, `yes_no_generic` u otro valor soportado.

El endpoint reutiliza el Research Candidate Selector. No modifica la base de datos y no crea `research_run`, `prediction_report` ni `prediction`.

Cuando la base local expone imagenes de Polymarket, el endpoint puede devolver:

- `market_image_url`
- `event_image_url`
- `icon_url`
- `participants`

`participants` incluye nombre, rol, abreviatura y campos nullable para `logo_url` o `image_url`. Si esos datos no existen en la base local, el dashboard usa iniciales o una imagen de mercado/evento como fallback visual.

## Como interpretar candidate_score

`candidate_score` indica que tan buen candidato es un mercado para investigar. Premia senales operativas como:

- mercado activo y abierto;
- snapshot reciente con precios validos;
- YES price dentro de una banda util para investigacion;
- liquidez y volumen conocidos;
- clasificacion clara por deporte y forma de mercado;
- template especifico disponible.

Importante: `candidate_score` no es una probabilidad de ganar y no es recomendacion de apuesta.

## Read-only

El dashboard es deliberadamente pasivo. Sirve para observar, filtrar y abrir endpoints utiles. Cualquier flujo que prepare research packets, ingeste responses o cree predicciones debe ejecutarse por comandos separados y con controles humanos.

## Que falta por construir

- Paginas de detalle por mercado.
- Graficos historicos de snapshots y predicciones.
- Vista de research runs, findings y Quality Gate reports.
- Filtros persistentes y busqueda por texto.
- Templates visuales especificos para deportes fuera de NBA.
- Verificacion independiente de URLs citadas en research real.
