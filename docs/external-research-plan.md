# External Market Research Plan

Fecha de corte: 2026-05-11.

Esta fase prepara la arquitectura de investigacion externa para mercados de
futbol. No activa busqueda externa, no llama APIs nuevas, no scrapea y no genera
estimaciones PolySignal.

## Estado actual

- `/analyze` y `/markets/[id]` muestran investigacion externa como pendiente si
  no hay hallazgos reales.
- `/analyze` ya muestra la capa `Investigacion externa` dentro del contrato
  Deep Analyzer, pero el estado sigue siendo pendiente/bloqueado hasta que haya
  backend job, allowlist, rate limit, cache y quality gate.
- `ResearchFinding` modela futuras evidencias con fuente, confiabilidad,
  direccion y visibilidad.
- `researchReadiness.ts` calcula cobertura de investigacion sin crear
  probabilidades.
- Si no hay fuentes reales, el arreglo de findings permanece vacio.

## Fuentes posibles

1. API deportiva
   - fixtures;
   - standings;
   - forma reciente;
   - lesiones/suspensiones;
   - alineaciones.

2. Fuentes oficiales
   - clubes;
   - ligas;
   - federaciones;
   - reportes de partido.

3. Proveedores de odds
   - odds externas comparativas;
   - cambios de linea;
   - liquidez externa cuando sea legalmente apropiado.

4. Noticias deportivas
   - reportes recientes;
   - disponibilidad de jugadores;
   - contexto de calendario.

5. Reddit/social
   - solo senal debil;
   - confiabilidad baja por defecto;
   - nunca fuente principal.

## Reglas de seguridad

- Backend server-side, no fetch directo desde frontend para investigacion real.
- Allowlist estricta de hosts.
- Rate limit por IP/usuario/job.
- Timeout corto.
- Cache para evitar abuso y costos.
- No scraping agresivo.
- No guardar HTML crudo.
- No devolver payloads crudos al navegador.
- No imprimir secretos ni URLs con tokens.
- Redactar logs de errores.

## Reglas de producto

- Mostrar fuentes y confiabilidad.
- Separar evidencia, probabilidad de mercado y estimacion PolySignal.
- No inventar noticias, lesiones, forma reciente ni odds.
- No prometer ganancias.
- No crear `predictedSide` sin estimacion PolySignal real.
- Si las fuentes no son suficientes, mostrar estado pendiente.

## Requisitos antes de activar

- Rate limiting real.
- Secrets configurados en entorno seguro.
- Logging seguro.
- Cache de resultados.
- Politica de fuentes permitidas.
- Revisión legal/compliance para odds externas.
- Tests con mocks, no con datos inventados visibles.
- Validacion manual de que no se muestra contenido crudo o no confiable.

## Flujo futuro

1. Usuario pega enlace de Polymarket.
2. PolySignal identifica mercado y contexto del partido.
3. Un Deep Analyzer backend job consulta fuentes allowlisted con limites.
4. Backend normaliza hallazgos en `ResearchFinding`.
5. UI muestra evidencias y faltantes.
6. Solo cuando haya datos suficientes, un motor futuro puede calcular una
   estimacion propia.
7. Historial guarda estimacion, fuentes usadas y version del estimador.

## Relacion con Deep Analyzer

La capa `ExternalResearchAgent` sera una de varias capas del motor profundo. No
puede decidir sola y no puede decir que busco en internet si el job no corrio.
Reddit/social queda como senal debil por defecto. Odds externas y Kalshi se
modelan como capas separadas para evitar mezclar evidencia periodistica,
mercados externos y comparacion de exchanges.

## Samantha Research Manual

Samantha queda preparada como agente externo manual para investigacion profunda.
PolySignal no la ejecuta automaticamente.

Flujo v0:

1. `/analyze` genera un `SamanthaResearchBrief` desde datos reales de
   Polymarket y Wallet Intelligence resumida.
2. El usuario copia o descarga el brief y lo entrega a Samantha fuera de
   PolySignal.
3. Samantha devuelve un `SamanthaResearchReport` version `1.0`.
4. El usuario pega el reporte en `/analyze`.
5. PolySignal valida, sanitiza y muestra evidencia aceptada.

Reglas:

- Reddit/social es senal debil.
- Kalshi solo cuenta si `equivalent=true`.
- Odds solo cuentan si el reporte declara comparabilidad.
- Suggested estimates solo se aceptan si pasan la compuerta estricta de
  evidencia.
- El reporte no se guarda automaticamente y no toca DB.
