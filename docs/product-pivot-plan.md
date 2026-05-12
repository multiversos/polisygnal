# PolySignal product pivot

Fecha: 2026-05-12

## Nueva vision

PolySignal se centra en dos flujos principales:

1. Analizador de enlaces: el usuario pega un enlace de Polymarket, PolySignal resuelve el mercado desde Polymarket/Gamma/CLOB en modo read-only, confirma el mercado y prepara una lectura responsable.
2. Historial de rendimiento: las lecturas guardadas se siguen hasta que el mercado termine y solo entonces se comparan contra el resultado final verificable.

La app deja de presentarse como cartelera deportiva o explorador de mercados guardados internamente.

## Rutas principales

- `/analyze`: entrada principal para crear analisis nuevos desde enlaces.
- `/history`: lista local de analisis guardados, pendientes, resueltos, no medibles y reanalisis.
- `/performance`: metricas agregadas de rendimiento calculadas desde el historial local.
- `/alerts`: seguimiento de analisis guardados, no alertas genericas de mercados.
- `/methodology`: reglas de medicion y seguridad del producto.

## Rutas de apoyo

- `/markets/[id]`: detalle legacy/de apoyo cuando existe un mercado interno, pero no es la fuente principal para crear nuevos analisis.
- `/internal/data-status`: diagnostico interno, oculto de navegacion publica.

## Rutas legacy u ocultas

- `/sports`
- `/sports/soccer`
- `/sports/[sport]`
- `/watchlist`
- `/briefing`

Estas rutas no se borran para evitar romper QA o enlaces existentes. Quedan fuera de la navegacion publica principal y deben mostrar contexto legacy cuando aplique.

## Regla de medicion

La precision de PolySignal es:

```text
aciertos / (aciertos + fallos)
```

Solo cuentan mercados donde:

1. PolySignal emitio una prediccion clara YES/NO.
2. El mercado termino.
3. Polymarket/Gamma/CLOB confirmo un resultado final confiable.

No cuentan como fallos:

- pendientes,
- cancelados,
- desconocidos,
- sin decision fuerte,
- sin estimacion PolySignal real,
- registros con solo probabilidad del mercado.

## Ciclo de vida

1. `link_submitted`: el usuario pega un enlace.
2. `analysis_saved`: se guarda la lectura en Historial.
3. `result_checked`: PolySignal intenta verificar resultado final.
4. `market_resolved`: una fuente compatible confirma el cierre.
5. `accuracy_counted`: solo se suma si hubo prediccion clara y resultado verificable.
6. `analysis_reanalyzed`: el usuario vuelve a analizar el enlace.

## Herramientas del analisis

- Datos del mercado de Polymarket.
- Probabilidad del mercado separada de estimacion PolySignal.
- Wallet Intelligence read-only cuando hay id compatible.
- Historial de precio futuro.
- Investigacion externa futura.
- Odds externas futuras.
- Comparacion con Kalshi futura.
- Verificacion final con Polymarket/Gamma/CLOB.

## Guardrails

- No usar mercados internos como fuente principal del analizador.
- No inventar estimaciones, wallets, resultados, odds ni comparaciones externas.
- No usar precio de mercado como estimacion PolySignal.
- No contar pendientes/cancelados/desconocidos como fallos.
- No promover copy-trading ni intentar identificar personas reales.
- No borrar datos ni ejecutar migraciones destructivas.

## QA post-pivot

Checks esperados:

- El sidebar publico no contiene deportes, briefing ni Mi lista.
- Home explica el loop analyzer-first en menos de 10 segundos.
- `/analyze` conserva Polymarket-first y no vuelve a fallback interno.
- `/history` muestra tracking local, filtros, reanalisis y actualizacion de
  resultados.
- `/performance` no muestra precision falsa cuando no hay resultados medibles.
- `/alerts` lee analisis guardados, no watchlist deportiva.
- `/methodology` explica umbral 55%, conteo de precision, Wallet Intelligence
  auxiliar y no copy-trading.
- Rutas legacy muestran CTA a `/analyze` y no se presentan como producto
  principal.
