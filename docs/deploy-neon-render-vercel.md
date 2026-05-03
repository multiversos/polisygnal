# Deploy con Neon, Render y Vercel

PolySignal usa FastAPI + SQLAlchemy + Alembic en el backend y Next.js en el
frontend. La base de datos debe vivir solo en el backend.

## Neon

En Neon, copia dos connection strings del mismo proyecto, rama, database y role:

- Runtime pooled: host con `-pooler`, para el backend durante trafico normal.
- Migraciones direct: host sin `-pooler`, para Alembic.

Ambas URLs deben ser privadas y deben incluir TLS, por ejemplo:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/postgres?sslmode=require&channel_binding=require
DATABASE_MIGRATION_URL=postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/postgres?sslmode=require&channel_binding=require
```

No guardes passwords reales en este repo.

## Render backend

Configura variables privadas en el servicio backend:

```env
POLYSIGNAL_ENV=production
DATABASE_URL=<Neon pooled connection string>
DATABASE_MIGRATION_URL=<Neon direct connection string>
POLYSIGNAL_CORS_ORIGINS=https://<tu-app-vercel>.vercel.app,http://localhost:3000,http://127.0.0.1:3000
```

Health check recomendado:

```text
/health
```

Para validar la conexion sin modificar datos:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

Ese comando solo ejecuta `SELECT 1` y enmascara credenciales.

Para migrar schema:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Alembic usa esta prioridad:

```text
DATABASE_MIGRATION_URL > NEON_DATABASE_DIRECT_URL > DATABASE_URL > NEON_DATABASE_URL > POLYSIGNAL_DATABASE_URL > SUPABASE_DATABASE_URL
```

La app runtime usa esta prioridad:

```text
DATABASE_URL > NEON_DATABASE_URL > POLYSIGNAL_DATABASE_URL > SUPABASE_DATABASE_URL
```

## Vercel frontend

Configura solo la API publica del backend:

```env
NEXT_PUBLIC_API_BASE_URL=https://polysignal.onrender.com
```

No pongas en Vercel:

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `NEON_DATABASE_URL`
- passwords Postgres
- service role keys
- tokens privados

## Seguridad

- Nunca commitear `.env`, `.env.local` ni connection strings reales.
- Nunca imprimir URLs completas con password.
- Usar `python -m app.commands.check_database_config` para inspeccion segura.
- Usar `--connect` solo cuando quieras probar conectividad con `SELECT 1`.
