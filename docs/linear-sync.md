# Linear Sync

## Que hace esta integracion

La integracion sincroniza el backlog canonico definido en `docs/linear-project-board.json` hacia Linear usando la API GraphQL oficial.

Diseno:

- el repo define el backlog base y el contexto largo
- Linear refleja estado de ejecucion
- el sync usa un marcador HTML canonico para no duplicar issues
- los estados se resuelven por `workflow state type`, no por nombre duro

## Opcion recomendada para uso personal

Usa OAuth local con PKCE.

Eso te permite:

- aprobar en el navegador
- guardar el token solo en tu maquina
- refrescarlo automaticamente
- evitar pegar una API key personal en cada sesion

## Credenciales necesarias

Variables de entorno:

- `LINEAR_API_KEY` opcional
- `LINEAR_OAUTH_CLIENT_ID`
- `LINEAR_OAUTH_CLIENT_SECRET` opcional
- `LINEAR_TEAM_ID`
- `LINEAR_PROJECT_ID` opcional
- `POLYSIGNAL_LINEAR_SYNC_SOURCE_PATH` opcional

## Setup

1. Crea un OAuth2 Application en Linear.
2. Configura como redirect URL: `http://127.0.0.1:8765/callback`
3. Copia el `client_id`.
4. Copia el UUID del team desde Linear.
5. Si quieres adjuntar todo a un project concreto, copia tambien el UUID del project.
6. Carga las variables en `.env` o en tu shell.

Ejemplo:

```powershell
$env:LINEAR_OAUTH_CLIENT_ID="tu_client_id"
$env:LINEAR_TEAM_ID="uuid-del-team"
$env:LINEAR_PROJECT_ID="uuid-del-project"
```

## Uso

Login OAuth local:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.login_linear
```

Wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_linear_login.ps1
```

Dry run:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.sync_linear
```

Aplicar:

```powershell
cd apps/api
.\.venv\Scripts\python -m app.commands.sync_linear --apply
```

Wrapper operativo desde la raiz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_linear_sync.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run_linear_sync.ps1 -Apply
```

## Regla de operacion

- autentica una vez con `login_linear`
- corre primero en dry run
- valida que los issues planeados coincidan con lo esperado
- aplica cambios solo cuando team y project esten correctos
- no edites manualmente el marcador HTML del description en Linear
- las credenciales locales se guardan en `.linear/oauth-credentials.json`

## Fuentes oficiales

- GraphQL API: [Linear Developers - Getting started](https://linear.app/developers/graphql)
- Filtering: [Linear Developers - Filtering](https://linear.app/developers/filtering)
- Workflows: [Linear Docs - Issue status](https://linear.app/docs/configuring-workflows)
