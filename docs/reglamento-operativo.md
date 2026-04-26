# Reglamento Operativo

## Objetivo

Operar PolySignal como un startup serio: sin trabajo oculto, sin estado ambiguo y sin depender de memoria individual para saber que se hizo, que falta y donde estamos.

## Principios no negociables

1. `Linear` es la fuente de verdad de ejecucion diaria.
2. `docs/` es la fuente de verdad de contexto, decisiones y narrativa larga.
3. `logs/` y los endpoints HTTP son la fuente de verdad operativa del runtime.
4. Si algo importante no esta en Linear o documentado en `docs/`, no existe a nivel de gestion.
5. Cada cambio relevante debe dejar trazabilidad tecnica y trazabilidad ejecutiva.

## Sistema de verdad

- `Linear`
  - backlog, prioridades, ownership, estado diario y cadencia de trabajo
- `docs/project-status.md`
  - snapshot ejecutivo del proyecto, donde estamos y principales riesgos
- `docs/roadmap.md`
  - direccion por fases y grandes apuestas
- `docs/tasks.md`
  - cola ejecutable de las proximas semanas
- `docs/decision-log.md`
  - decisiones que cambian arquitectura, producto o forma de operar
- `logs/market_pipeline`, `logs/reports`, `logs/briefings`, `logs/diffs`, `logs/dashboard`
  - evidencia operativa real del sistema

## Reglas de trabajo

1. Todo trabajo nuevo nace como issue en Linear.
2. Cada issue debe tener un outcome claro, no solo una actividad.
3. Ningun issue entra a `in_progress` sin contexto minimo:
   - problema
   - outcome esperado
   - riesgos
   - source of truth o links utiles
4. Todo issue activo debe recibir update si pasan mas de 48 horas sin movimiento visible.
5. Toda decision que cambie alcance, arquitectura, fuentes de datos o formula de scoring debe ir a `docs/decision-log.md`.
6. Toda capacidad terminada debe reflejarse en README, roadmap, tasks o status si cambia la realidad del proyecto.
7. No se mezclan tareas tecnicas, bugs, research y apuestas de producto bajo un mismo issue ambiguo.

## Workflow recomendado en Linear

- `backlog`
  - idea valida pero no comprometida
- `todo`
  - comprometida para ejecucion cercana
- `in_progress`
  - hay trabajo real en curso y un owner claro
- `done`
  - entregado, verificado y documentado
- `canceled`
  - se descarto de forma explicita

Si tu workflow de Linear tiene nombres distintos, manten la equivalencia por `type`.

## Definition of Ready

Un issue esta listo para arrancar cuando:

- el problema esta claro
- el outcome es verificable
- el owner esta definido
- las dependencias visibles estan listadas
- existe criterio minimo para saber si termino bien

## Definition of Done

Un issue se puede cerrar solo cuando:

- el cambio principal ya funciona
- las pruebas relevantes ya corrieron o el riesgo quedo explicitado
- la documentacion afectada quedo actualizada
- el estado operativo quedo verificable
- no quedan preguntas criticas escondidas en chats o memoria individual

## Cadencia

### Diario

Cada issue en `in_progress` debe tener un update corto con este formato:

- `Hecho:` que avanzo desde el ultimo update
- `En curso:` que se esta empujando hoy
- `Siguiente:` siguiente paso concreto
- `Riesgo:` bloqueo, decision o dependencia

### Semanal

Todos los lunes:

- revisar `docs/tasks.md`
- confirmar foco de la semana
- limpiar issues muertos o ambiguos

Todos los viernes:

- actualizar `docs/project-status.md` si hubo cambio material
- registrar decisiones relevantes
- revisar si el roadmap cambio

## Politica de documentacion

Documentamos solo lo que reduce incertidumbre, acelera decisiones o evita repetir errores.

Se documenta siempre:

- cambios de arquitectura
- cambios de scope
- cambios de formula o reglas del scoring
- nuevas fuentes de datos
- incidentes relevantes
- rituales y reglas operativas del equipo

No se documenta:

- ruido de ejecucion sin consecuencia
- notas duplicadas entre archivos
- descripciones vagas tipo "seguir viendo"

## Antipatrones prohibidos

- mover issues a `done` sin actualizar contexto
- tener trabajo activo fuera de Linear
- dejar roadmap y status desalineados del sistema real
- esconder riesgos para que el tablero se vea bonito
- abrir demasiados frentes sin un owner claro

## Regla ejecutiva final

La pregunta "donde estamos?" debe responderse en menos de 5 minutos usando:

1. `docs/project-status.md`
2. Linear
3. `logs/market_pipeline/latest-summary.json`
