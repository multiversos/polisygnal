# Playbook de resolución de problemas de datos

Este playbook ayuda a decidir qué hacer cuando PolySignal muestra datos incompletos, score pendiente o validaciones que requieren revisión. Es una guía operativa: no ejecuta research, no crea predicciones y no recomienda apuestas.

## PolySignal Score pendiente

Problema: el mercado muestra `PolySignal SÍ: pendiente` o `insufficient_data`.

Causa probable:

- falta snapshot;
- falta precio SÍ/NO;
- no hay prediction guardada;
- no hay señal externa vinculada;
- la calidad de datos es insuficiente.

Cómo diagnosticar:

```text
GET /markets/{market_id}/analysis
GET /research/upcoming-sports/data-quality?days=7&limit=50
GET /data-health/snapshot-gaps?days=7&limit=50
```

Qué NO hacer:

- no inventar una probabilidad;
- no usar candidate_score como probabilidad;
- no crear prediction manual sin evidencia real;
- no ingestar response mock como research real.

Acción recomendada:

- si faltan precios o snapshots, esperar o revisar con `inspect_snapshot_gaps`;
- si el mercado parece stale, moverlo a `review_required`;
- si hay evidencia real verificable, generar Research Packet y pasar Quality Gate.

## Sin snapshot

Problema: el mercado aparece con `missing_snapshot` o `Sin snapshot`.

Causa probable:

- el mercado fue sincronizado sin captura de precios;
- no se ejecutó un refresh seguro de snapshots;
- el mercado no tiene tokens/precios disponibles localmente.

Cómo diagnosticar:

```powershell
python -m app.commands.inspect_snapshot_gaps --days 7 --limit 50
```

Qué NO hacer:

- no crear snapshots falsos;
- no hacer sync masivo;
- no rellenar precios manualmente.

Acción recomendada:

- marcar `waiting_for_data` o `review_required`;
- priorizar mercados con snapshot real para trials;
- preparar un sprint separado para refresh controlado si hace falta.

## Sin precio SÍ/NO

Problema: hay snapshot, pero falta `yes_price` o `no_price`.

Causa probable:

- snapshot incompleto;
- mercado con baja liquidez o datos parciales;
- captura antigua o estructura de tokens incompleta.

Cómo diagnosticar:

```text
GET /markets/{market_id}/price-history
GET /markets/{market_id}/analysis
```

Qué NO hacer:

- no derivar NO como `1 - SÍ` si el snapshot real no lo confirma, salvo que el servicio ya lo haga explícitamente como visualización;
- no crear score confiado con un solo dato débil.

Acción recomendada:

- dejar score como preliminar o pendiente;
- mostrar warning de datos incompletos;
- seleccionar otro mercado para análisis si el trial necesita precios.

## Mercado stale

Problema: el mercado tiene `freshness_status=stale` o razones como `close_time_past`, `snapshot_too_old` o `market_closed`.

Causa probable:

- el evento ya pasó;
- el snapshot es viejo;
- la DB local conserva close_time desalineado con las reglas reales;
- el mercado está cerrado o inactivo.

Cómo diagnosticar:

```text
GET /markets/{market_id}/analysis
GET /markets/{market_id}/timeline
GET /data-health/snapshot-gaps?days=7&limit=50
```

Qué NO hacer:

- no tratarlo como candidato principal;
- no usarlo para una predicción previa al evento;
- no inventar outcome.

Acción recomendada:

- mover investigation status a `review_required` o `dismissed`;
- registrar decision log `waiting_for_data` o `dismissed`;
- si existe outcome real verificado, registrarlo manualmente para backtesting.

## Quality Gate review_required

Problema: el dry-run devuelve `recommended_action=review_required`.

Causa probable:

- response `mock_structural`;
- fuentes insuficientes;
- falta balance de evidencia;
- ajuste de probabilidad demasiado agresivo;
- `source_review_required=true`.

Cómo diagnosticar:

```text
GET /research/runs/{run_id}/quality-gate
```

Qué NO hacer:

- no ejecutar ingesta normal automáticamente;
- no crear prediction;
- no convertir mock en evidencia real.

Acción recomendada:

- revisar warnings y errores;
- corregir response solo si hay fuentes reales verificables;
- descartar o dejar pendiente si las fuentes no alcanzan.

## Señal Kalshi sin vínculo

Problema: hay señal externa sin mercado Polymarket vinculado.

Causa probable:

- título distinto;
- evento/deporte ambiguo;
- confianza de match baja;
- mercado no existe localmente.

Cómo diagnosticar:

```text
GET /external-signals/unmatched
GET /external-signals/{signal_id}/match-candidates
```

Qué NO hacer:

- no vincular señales con baja confianza;
- no llamar Kalshi remoto desde UI;
- no usar la señal como probabilidad si no está vinculada.

Acción recomendada:

- revisar en Match Review UI;
- vincular solo si la confianza y el motivo son claros;
- dejar sin vínculo si hay ambigüedad.

## sport=other

Problema: un mercado deportivo aparece como `sport=other`.

Causa probable:

- clasificación insuficiente;
- título sin liga/equipo claro;
- deporte no soportado todavía.

Cómo diagnosticar:

```text
GET /research/upcoming-sports?days=7&include_futures=false&focus=match_winner&limit=50
GET /research/upcoming-sports/data-quality?days=7&limit=50
```

Qué NO hacer:

- no forzar clasificación por una palabra débil;
- no ocultar el mercado si parece útil, pero sí mostrar warning.

Acción recomendada:

- mejorar patrones conservadores de clasificación;
- dejar `other` si no hay señal suficiente;
- usar notas o tags manuales si el mercado sigue siendo relevante.

## Futuros pausados

Problema: el mercado es campeonato, conferencia, premio de temporada o future largo.

Causa probable:

- el mercado está soportado, pero fuera del foco temporal actual.

Cómo diagnosticar:

```text
GET /markets/{market_id}/analysis
GET /research/upcoming-sports?include_futures=true
```

Qué NO hacer:

- no borrar datos ni soporte de futures;
- no mezclar futures con el flujo principal de próximos 7 días.

Acción recomendada:

- mostrar badge `Mercado a futuro`;
- mantenerlo para análisis posterior;
- usar `paused` o `dismissed` solo como estado operativo, no como eliminación de datos.

## Cuándo generar Research Packet

Generar Research Packet cuando:

- el mercado tiene evento realmente futuro;
- el título y participantes son claros;
- no es un prop ambiguo;
- existe una pregunta concreta que vale investigar;
- el usuario decide hacerlo explícitamente.

No generar packet cuando:

- el evento parece ya resuelto;
- faltan todos los datos básicos y no hay fuentes útiles;
- solo se quiere “llenar” un score pendiente;
- el objetivo sería producir una recomendación de apuesta.

## Cuándo no ingestar

No ingestar si:

- la response es `mock_structural`;
- Quality Gate devuelve `review_required` o `reject`;
- no hay citas verificables;
- hay riesgo de evento ya resuelto;
- la evidencia es débil o desbalanceada;
- la respuesta intenta crear una predicción sin base.
