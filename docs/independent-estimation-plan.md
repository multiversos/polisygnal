# Independent Estimation Plan

Fecha de corte: `2026-05-15`.

## Objetivo

PolySignal necesita distinguir entre:

- referencia de mercado;
- senales auxiliares;
- evidencia realmente independiente.

La referencia de precio de Polymarket nunca debe presentarse como estimate
propio. Wallet Intelligence, perfiles destacados o actividad publica pueden
ayudar a priorizar revision, pero no alcanzan solos para una estimacion propia
responsable.

## Que cuenta como evidencia independiente

- odds externas comparables y verificadas;
- comparacion Kalshi equivalente y verificable;
- evidencia externa validada por Samantha con fuentes reales;
- calibracion historica estructurada real cuando exista.

## Que no cuenta por si solo

- precio o probabilidad implicita de Polymarket;
- solo Wallet Intelligence;
- solo perfiles destacados;
- solo una wallet con actividad grande;
- contexto parcial del evento sin fuentes externas;
- resumen Samantha que solo reempaqueta market/wallet data.

## Capa visible en `/analyze`

`AnalyzerReport` ahora expone `Evidencia independiente` para mostrar:

- que fuentes se revisaron;
- cuales dieron datos reales;
- cuales siguen como auxiliares;
- cuales no estan conectadas;
- que falta para habilitar una estimacion propia.

Estados publicos esperados:

- `Disponible`
- `Parcial`
- `Fuente no conectada`
- `No disponible`
- `Timeout`
- `Insuficiente`
- `Bloqueada`

## Gates

Para que PolySignal muestre `suggestedDecision.available=true`, se necesita:

1. referencia real del mercado;
2. reporte Samantha validado;
3. al menos una fuente independiente real adicional.

Wallet Intelligence y perfiles siguen visibles, pero quedan como soporte
auxiliar y no destraban Gate C por si solos.

## Proximos providers posibles

- odds comparables;
- noticias y contexto externo;
- injuries / disponibilidad deportiva;
- estadisticas deportivas estructuradas;
- calibracion historica persistente.

Hasta que esos providers existan y devuelvan datos reales, la UI debe mostrar
faltantes honestos en vez de completar huecos con texto inventado.

## Trial activo de odds externas

Durante la trial temporal de 24 horas se puede habilitar `OddsBlaze` como
proveedor externo read-only para NBA:

- provider: `OddsBlaze`;
- endpoint base: `https://odds.oddsblaze.com/`;
- auth mode: query param `key`, solo server-side;
- sportsbook inicial: `draftkings`;
- market inicial: `moneyline`;
- `price=probability`, `main=true`, `live=false`.

La comparacion solo cuenta como evidencia independiente si:

1. el provider responde;
2. hay match medio/alto contra el mercado NBA de Polymarket;
3. los outcomes externos son reales y comparables.

Si no, debe quedar como `Parcial`, `Sin match claro`, `Timeout` o `Proveedor no
configurado`. El precio de Polymarket sigue siendo solo referencia y no se
convierte en estimate propio.
