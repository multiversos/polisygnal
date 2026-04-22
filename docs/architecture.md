# Arquitectura Inicial

## Objetivo

Construir una base mínima para un analista de mercados de Polymarket que sea explicable, modular y fácil de extender.

## Componentes

- `apps/api`: expone endpoints HTTP, orquesta servicios y conecta con PostgreSQL.
- `apps/web`: interfaz inicial del producto.
- `apps/worker`: jobs futuros para syncs, snapshots y pipelines de evidencia.
- `packages/*`: módulos reservados para dominio compartido e integraciones futuras.

## Backend

La API se organiza en capas simples:

- `api/`: rutas HTTP
- `core/`: configuración
- `db/`: base declarativa y sesión
- `models/`: entidades SQLAlchemy
- `repositories/`: acceso a datos de primer nivel
- `schemas/`: contratos de entrada y salida

## Base de datos inicial

Tablas incluidas en este corte:

- `events`
- `markets`
- `market_snapshots`

## Decisiones

- FastAPI y SQLAlchemy 2 para una base moderna y tipada.
- Alembic para mantener evolución explícita del esquema.
- Next.js App Router para arrancar el frontend con la menor fricción.
- Estructura de monorepo simple sin sobreingeniería en esta fase.

