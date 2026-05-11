# External Market Research Plan

Fecha de corte: 2026-05-11.

Esta fase prepara la arquitectura de investigacion externa para mercados de
futbol. No activa busqueda externa, no llama APIs nuevas, no scrapea y no genera
estimaciones PolySignal.

## Estado actual

- `/analyze` y `/markets/[id]` muestran investigacion externa como pendiente si
  no hay hallazgos reales.
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
3. Backend consulta fuentes allowlisted con limites.
4. Backend normaliza hallazgos en `ResearchFinding`.
5. UI muestra evidencias y faltantes.
6. Solo cuando haya datos suficientes, un motor futuro puede calcular una
   estimacion propia.
7. Historial guarda estimacion, fuentes usadas y version del estimador.
