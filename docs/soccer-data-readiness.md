# Soccer Data Readiness

Fecha de corte: 2026-05-11.

Este documento define la primera capa de contexto deportivo para futbol en
PolySignal. La fase actual es solo lectura y no genera porcentajes de resultado.

## Datos disponibles hoy

Los mercados de futbol cargados ya exponen datos estructurados suficientes para
preparar investigacion futura:

- `event_title`: nombre del partido cuando Polymarket lo entrega.
- `question`: pregunta del mercado, por ejemplo si un equipo ganara.
- `event_slug` y `market_slug`: utiles para matching, no para inventar liga.
- `sport_type`: permite confirmar que el mercado es `soccer`.
- `close_time` / `end_date`: fecha visible del mercado, usada como proxy de
  calendario cuando existe.
- `market_type` / `evidence_shape`: forma general del mercado.
- `active` / `closed`: estado operativo del mercado.
- precio YES/NO, volumen, liquidez y frescura de datos.

## Inferencias seguras

PolySignal puede inferir de forma conservadora:

- partido desde `event_title` cuando existe;
- equipos desde titulos con formato `Equipo A vs Equipo B`;
- fecha/hora desde `close_time` o `end_date`;
- que el mercado pertenece a futbol si `sport_type=soccer`;
- si el contexto esta listo para una futura busqueda externa cuando hay dos
  equipos y fecha.

Estas inferencias son contexto, no prediccion.

## Lo que no se infiere

No se infiere ni se inventa:

- local/visitante si el dato no viene estructurado;
- liga o competicion desde abreviaturas del slug;
- forma reciente;
- lesiones o suspensiones;
- alineaciones;
- odds externas;
- ratings/ELO/xG;
- ventaja deportiva;
- porcentaje YES/NO propio.

Los slugs como `epl-bri-wol-2026-05-09` pueden sugerir informacion, pero en esta
fase no se usan para crear liga, pais ni equipos si no hay titulo claro.

## Readiness no predictivo

La app muestra `Preparacion de datos` de 0 a 100. Este score mide disponibilidad
de datos, no probabilidad de que gane un equipo.

Factores actuales:

- probabilidad del mercado visible;
- actividad del mercado;
- datos recientes;
- equipos identificados;
- fecha del partido;
- senales independientes ya cargadas;
- historial/calibracion futura.

Rangos:

- 0-25: datos insuficientes;
- 26-50: datos parciales;
- 51-75: preparacion media;
- 76-100: datos suficientes para estimacion futura.

Aunque el score sea alto, PolySignal no muestra una estimacion propia si no hay
senales independientes suficientes.

## Riesgos de inferencia

- Un titulo puede contener mercados derivados y no solo partido principal.
- Algunos mercados `Will X win` mencionan un solo equipo.
- Los slugs usan abreviaturas que pueden ser ambiguas.
- La fecha de cierre del mercado puede no ser exactamente el kickoff.
- Un mercado puede seguir activo aunque el evento deportivo ya haya pasado.

Por eso el helper marca roles como `unknown` salvo evidencia estructurada.

## Fuentes externas futuras

Para calcular una estimacion real de futbol se necesitara integrar fuentes
confiables, con limites y cache:

- API deportiva para fixtures, standings, forma reciente, lesiones,
  suspensiones y alineaciones;
- fuentes oficiales de clubes, ligas y competiciones;
- odds externas como referencia comparativa, con revision legal/compliance;
- noticias deportivas recientes;
- Reddit/social solo como senal debil, nunca fuente principal;
- historial resuelto para calibracion por deporte y nivel de confianza.

Reglas para esa fase:

- no scraping agresivo;
- timestamp por fuente;
- rate limit;
- no guardar HTML crudo;
- mostrar fuentes y confiabilidad;
- no estimar si las fuentes no son confiables o suficientes.
