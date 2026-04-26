# Decision Log

## 2026-04-25 - Adoptar Linear + docs + artifacts como sistema operativo del proyecto

### Decision

Usar `Linear` como sistema de verdad para ejecucion diaria, `docs/` para contexto y decisiones, y `logs/` mas endpoints HTTP como verdad operativa del runtime.

### Contexto

El repo ya avanzaba mas rapido que `docs/roadmap.md` y `docs/tasks.md`. Eso crea una brecha peligrosa: el software real progresa, pero la lectura ejecutiva se queda atras.

### Por que

- evita trabajo oculto
- reduce desalineacion entre roadmap y realidad
- deja un rastro versionado de decisiones y estado
- permite operar como equipo, no como memoria individual

### Consecuencias

- todo trabajo nuevo debe nacer o reflejarse en Linear
- las decisiones relevantes se registran en este archivo
- `docs/project-status.md` pasa a ser el snapshot ejecutivo del proyecto
- el backlog inicial puede sincronizarse desde `docs/linear-project-board.json`

## Template

Usa este formato para nuevas decisiones:

### YYYY-MM-DD - Titulo corto

#### Decision

Que decidimos.

#### Contexto

Que problema o cambio lo gatillo.

#### Por que

Que tradeoff elegimos.

#### Consecuencias

Que cambia desde hoy.
