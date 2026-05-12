# Runbook: Samantha Research Manual

Este runbook describe el flujo seguro actual para usar Samantha como agente
externo de investigacion sin automatizar procesos desde PolySignal.

## Flujo

1. Abrir `/analyze`.
2. Pegar un enlace de Polymarket.
3. Confirmar el mercado.
4. Confirmar `Estado del analisis profundo`.
5. El job debe mostrar Polymarket leido, mercado analizado, Wallet
   Intelligence revisada o bloqueada honestamente, y `Esperando reporte de
   Samantha`.
6. En `Investigacion con Samantha`, usar `Copiar brief para Samantha` o
   `Descargar brief`.
7. Entregar ese brief a Samantha fuera de PolySignal.
8. Samantha devuelve un reporte estructurado version `1.0`.
9. Pegar el reporte en `/analyze`.
10. Usar `Cargar reporte`.
11. Revisar si PolySignal lo marca como evidencia cargada o reporte invalido.
12. Si se guarda en Historial antes del reporte, debe quedar como pendiente de
    investigacion y con accion `Continuar analisis`.

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

El `DeepAnalysisJob` vive en localStorage y no reemplaza el futuro backend job.
No se marca como completado mientras este esperando Samantha o evidencia
suficiente.
