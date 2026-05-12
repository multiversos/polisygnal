# Runbook: Samantha Research Manual

Este runbook describe el flujo seguro actual para usar Samantha como agente
externo de investigacion sin automatizar procesos desde PolySignal.

## Flujo

1. Abrir `/analyze`.
2. Pegar un enlace de Polymarket.
3. Confirmar el mercado.
4. En `Investigacion con Samantha`, usar `Copiar brief para Samantha` o
   `Descargar brief`.
5. Entregar ese brief a Samantha fuera de PolySignal.
6. Samantha devuelve un reporte estructurado version `1.0`.
7. Pegar el reporte en `/analyze`.
8. Usar `Cargar reporte`.
9. Revisar si PolySignal lo marca como evidencia cargada o reporte invalido.

## Samantha no debe hacer

- tocar Neon;
- abrir o modificar `.env`;
- ejecutar comandos con `--apply`;
- ejecutar trading, scoring real o migraciones;
- inventar fuentes, odds, Kalshi matches, wallets, ROI, win rate o resultados;
- identificar personas reales detras de wallets;
- recomendar copy-trading.

## Si el reporte es invalido

Revisar:

- version `1.0`;
- `marketUrl` publica segura;
- cada evidencia con `title`, `sourceName`, `summary` y `checkedAt`;
- Reddit/social no marcado como `high`;
- Kalshi con `equivalent=true` si se usa como senal;
- probabilidades entre `0` y `100`;
- sin direcciones completas ni secretos.

## Estado actual

Todo es manual/local. PolySignal no ejecuta Samantha, no llama internet, no
scrapea, no escribe DB y no guarda el reporte automaticamente.
