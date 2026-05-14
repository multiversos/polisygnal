# Analysis Agent Bridge

Fecha de corte: `2026-05-13`.

PolySignal ya no acopla `/analyze` a Samantha como unico proveedor. El flujo
publico es:

`/analyze -> Analysis Agent Bridge -> Samantha / Jarvis / custom`

El usuario pega un enlace de Polymarket. PolySignal resuelve el mercado, carga
datos read-only de Polymarket/Gamma, ejecuta Wallet Intelligence y llama al
agente analizador activo. Si el agente no esta conectado, la UI muestra fuente
automatica no disponible y mantiene una lectura parcial segura.

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
  "marketId": null,
  "marketSlug": "market-slug",
  "eventSlug": "event-slug",
  "title": "Market title",
  "question": "Market question",
  "category": "sports",
  "marketProbability": 0.54,
  "prices": { "outcomes": [] },
  "volume": 2000,
  "liquidity": 1000,
  "walletIntelligence": null,
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
- Respuestas con full wallet addresses, secretos, instrucciones de apuesta o
  copy-trading fallan seguro.
- El precio de mercado no se convierte en estimacion PolySignal.
- Si `suggestedDecision.available=false`, no se crea prediccion.

## Estados publicos

- `unavailable`: fuente automatica no disponible.
- `partial`: lectura parcial automatica.
- `insufficient_data`: sin senales suficientes.
- `failed_safe`: error seguro sin detalles tecnicos.

La UI publica sigue sin carga manual, JSON, schema, brief ni reportes manuales.
