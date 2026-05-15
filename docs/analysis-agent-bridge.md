# Analysis Agent Bridge

Fecha de corte: `2026-05-14`.

PolySignal ya no acopla `/analyze` a Samantha como unico proveedor. El flujo
publico es:

`/analyze -> Analysis Agent Bridge -> Samantha / Jarvis / custom`

El usuario pega un enlace de Polymarket. PolySignal resuelve el mercado, carga
datos read-only de Polymarket/Gamma, ejecuta Wallet Intelligence y llama al
agente analizador activo. Si el agente no esta conectado, la UI muestra fuente
automatica no disponible y mantiene una lectura parcial segura.

## Estado production

Samantha es el proveedor activo en produccion:

```text
ANALYSIS_AGENT_PROVIDER=samantha
ANALYSIS_AGENT_ENABLED=true
ANALYSIS_AGENT_URL=https://samantha-polysignal-bridge.onrender.com/polysignal/analyze-market
ANALYSIS_AGENT_DISPLAY_NAME=Samantha
ANALYSIS_AGENT_ALLOW_LOCALHOST=false
```

`ANALYSIS_AGENT_TOKEN` existe solo como secreto server-side en Vercel y no debe
imprimirse, commitearse ni exponerse en respuestas. Samantha Bridge corre en
Render como `https://samantha-polysignal-bridge.onrender.com`; su health publico
seguro es `GET /health`.

Diagnostico interno:

- `GET /api/analysis-agent/config`: estado publico sanitizado de la config.
- `GET /api/analysis-agent/diagnostics`: estado interno read-only con provider,
  dominio, enabled, ultimo health check y estado esperado. No devuelve token,
  headers, payload crudo ni secretos.
- `/internal/data-status`: muestra esos datos en una tarjeta interna oculta de
  la navegacion publica.

Si Render esta dormido, `smoke:production` permite retry razonable. Si el
servicio no responde despues del retry, PolySignal debe mostrar lectura parcial
o fuente automatica no disponible, nunca `JSON`, schema, stack trace ni carga
manual publica.

## Archivos

- `apps/web/app/lib/analysisAgentTypes.ts`
- `apps/web/app/lib/analysisAgentRegistry.ts`
- `apps/web/app/lib/analysisAgentBridge.ts`
- `apps/web/app/lib/analysisAgentRoute.ts`
- `apps/web/app/api/analysis-agent/config/route.ts`
- `apps/web/app/api/analysis-agent/send-research/route.ts`
- `apps/web/app/api/analysis-agent/research-status/route.ts`
- `apps/web/app/api/samantha/send-research/route.ts` como alias legacy
- `apps/web/app/api/samantha/research-status/route.ts` como alias legacy

## Variables genericas

Las variables genericas tienen prioridad:

```text
ANALYSIS_AGENT_PROVIDER=samantha
ANALYSIS_AGENT_ENABLED=true
ANALYSIS_AGENT_URL=https://<agent-host>/polysignal/analyze-market
ANALYSIS_AGENT_TOKEN=<secret>
ANALYSIS_AGENT_DISPLAY_NAME=Samantha
ANALYSIS_AGENT_ALLOW_LOCALHOST=false
```

Variables opcionales:

```text
ANALYSIS_AGENT_ALLOWED_PORTS=8787
ANALYSIS_AGENT_TIMEOUT_MS=25000
ANALYSIS_AGENT_MAX_REQUEST_BYTES=90000
ANALYSIS_AGENT_MAX_RESPONSE_BYTES=120000
```

## Compatibilidad Samantha

Si no existen variables `ANALYSIS_AGENT_*`, PolySignal usa el fallback legacy:

```text
SAMANTHA_BRIDGE_ENABLED=true
SAMANTHA_BRIDGE_URL=https://<samantha-bridge-host>/polysignal/analyze-market
SAMANTHA_BRIDGE_TOKEN=<secret>
SAMANTHA_BRIDGE_ALLOW_LOCALHOST=false
```

Estas variables quedan como compatibilidad temporal. No se deben borrar hasta
que produccion migre al bloque generico.

## Cambiar Samantha por Jarvis

Desplegar Jarvis con el mismo contrato y configurar en Vercel:

```text
ANALYSIS_AGENT_PROVIDER=jarvis
ANALYSIS_AGENT_ENABLED=true
ANALYSIS_AGENT_URL=https://jarvis-host/polysignal/analyze-market
ANALYSIS_AGENT_TOKEN=<secret>
ANALYSIS_AGENT_DISPLAY_NAME=Jarvis
```

Luego redeploy de PolySignal. No hay que tocar `/analyze`.

## Contrato

Request:

```json
{
  "polymarketUrl": "https://polymarket.com/...",
  "marketId": "0xconditionId-or-null",
  "marketSlug": "market-slug",
  "eventSlug": "event-slug",
  "title": "Market title",
  "question": "Market question",
  "category": "sports",
  "marketProbability": 0.54,
  "prices": {
    "outcomes": [
      { "label": "Pistons", "price": 0.39, "side": "UNKNOWN", "tokenId": "public-token-id" },
      { "label": "Cavaliers", "price": 0.62, "side": "UNKNOWN", "tokenId": "public-token-id" }
    ]
  },
  "volume": 2000,
  "liquidity": 1000,
  "walletIntelligence": {
    "available": true,
    "observedCapitalUsd": 42000,
    "yesCapitalUsd": 0,
    "noCapitalUsd": 0,
    "neutralCapitalUsd": 42000,
    "largeTradesCount": 5,
    "largePositionsCount": 10,
    "notableWalletCount": 53,
    "observedActivities": [
      {
        "type": "position",
        "shortAddress": "0xe7a2...ae70",
        "outcome": "Cavaliers",
        "amountUsd": 35829.07,
        "price": 0.61,
        "source": "polymarket_data_api"
      }
    ]
  },
  "source": "polysignal"
}
```

Response:

```json
{
  "status": "partial",
  "agentId": "samantha",
  "agentName": "Samantha",
  "summary": "Lectura parcial con datos reales disponibles.",
  "keySignals": [],
  "risks": [],
  "limitations": [],
  "suggestedDecision": {
    "available": false,
    "side": null,
    "probability": null,
    "confidence": null,
    "reason": "No hay senales suficientes."
  },
  "sourcesUsed": ["polymarket"],
  "checkedAt": "2026-05-13T00:00:00.000Z"
}
```

Estados aceptados:

- `completed`
- `partial`
- `insufficient_data`
- `failed_safe`
- `unavailable`

## Seguridad

- No se acepta destino enviado por el cliente.
- No se usan variables `NEXT_PUBLIC` para token o URL sensible.
- Produccion requiere HTTPS; localhost solo se permite con allow flag en dev.
- Se bloquean endpoints con credenciales, fragmentos, IPs privadas y puertos no
  allowlisted.
- El token se envia server-side y nunca vuelve al cliente.
- Respuestas del agente con full wallet addresses, secretos, instrucciones de
  apuesta o copy-trading fallan seguro. El drawer local `Ver billeteras` es
  una excepcion separada: puede mostrar direcciones publicas completas si
  vienen de la fuente allowlisted, pero esos detalles no se envian como payload
  crudo al agente ni se guardan como lista completa.
- El precio de mercado no se convierte en estimacion PolySignal.
- Si `suggestedDecision.available=false`, no se crea prediccion.

## Estados publicos

- `report_received`: el agente devolvio un reporte estructurado y PolySignal lo
  valido antes de mostrarlo.
- `unavailable`: fuente automatica no disponible.
- `partial`: lectura parcial automatica.
- `insufficient_data`: sin senales suficientes.
- `failed_safe`: error seguro sin detalles tecnicos.

`insufficient_data` significa que Samantha no encontro senales reales
suficientes para decision o estimate propio. No es error del sistema ni debe
contar como prediccion. `report_received` puede contener un reporte `partial`;
eso solo confirma que el contrato paso validacion.

## Presentacion en `/analyze`

`AnalyzerReport` separa lectura automatica y estimacion PolySignal:

- `partial` se muestra como `Lectura parcial automatica`.
- `insufficient_data` o reporte `failed` se muestra como `Sin senales suficientes`.
- `completed` solo se muestra cuando el agente lo devuelve realmente.
- `suggestedDecision.available=false` o una sugerencia que no pasa compuertas
  conserva el texto `No hay estimacion propia de PolySignal para este mercado`.
- `Evidencia usada` resume las fuentes verificables que alimentaron la lectura:
  mercado, billeteras, agente y limitaciones. Los botones `Ver datos` y `Ver
  billeteras` reutilizan los drawers existentes y nunca se abren
  automaticamente.
- Las senales del reporte se muestran como tarjetas con label, direccion,
  confianza, fuente y badge `Dato real` solo cuando el agente marco la senal
  como real. Las senales de Polymarket enlazan a `Ver datos`; las de Wallet
  Intelligence enlazan a `Ver billeteras`.
- Riesgos, limitaciones, fuentes usadas y `Que revisar primero` se muestran en
  secciones separadas para evitar que el precio de mercado parezca una
  prediccion.
- El resumen de mercado y el resumen de billeteras pueden abrir los drawers
  `Ver datos` y `Ver billeteras`; esos drawers no se abren automaticamente.

La UI publica sigue sin carga manual, JSON, schema, brief ni reportes manuales.

## Progreso visual

`AnalyzeLoadingPanel` mantiene dos estados: el estado real de cada consulta y
el estado visual que se revela al usuario. Las consultas de link, mercado,
datos, Wallet Intelligence y agente pueden terminar rapido internamente, pero
la UI no marca todos los pasos como listos en el mismo render. Cada paso se
presenta primero como `running` y se revela en orden cuando:

1. Existe resultado real para ese paso.
2. El paso anterior ya fue mostrado como terminado.
3. Paso el minimo visual corto de `700ms`.

Este minimo no es un porcentaje ni una espera larga para simular trabajo; solo
evita que las primeras etapas parpadeen como completadas. Si un paso tarda de
verdad, queda en curso. Si hay timeout o fallo seguro, se muestra sin esperar.

Los botones `Ver datos` y `Ver billeteras` se habilitan solo cuando su etapa ya
fue revelada. Los drawers siguen cerrados por defecto y se abren solamente por
accion del usuario. Si Samantha tarda, el panel debe explicar que mercado,
datos y billeteras ya fueron consultados y que se esta esperando al agente.
