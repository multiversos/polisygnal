export default function MethodologyPage() {
  return (
    <main className="dashboard-shell methodology-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Metodologia</p>
          <h1>Como mide PolySignal</h1>
          <p className="subtitle">
            PolySignal separa precio de mercado, estimacion propia y resultado final
            para que el rendimiento sea verificable con el tiempo.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/analyze">
            Analizar enlace
          </a>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
        </div>
      </header>

      <section className="home-analyzer-steps" aria-label="Ciclo de vida del analisis">
        <article>
          <span>1</span>
          <strong>Analizar</strong>
          <p>El enlace se resuelve desde Polymarket y se confirma el mercado exacto.</p>
        </article>
        <article>
          <span>2</span>
          <strong>Guardar</strong>
          <p>La lectura queda en el historial local con decision y capas revisadas.</p>
        </article>
        <article>
          <span>3</span>
          <strong>Seguir</strong>
          <p>Los pendientes se revisan cuando abres PolySignal y actualizas resultados.</p>
        </article>
        <article>
          <span>4</span>
          <strong>Resolver</strong>
          <p>Solo el resultado final de Polymarket o una fuente compatible cuenta.</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Regla de precision</p>
            <h2>Que cuenta y que no cuenta</h2>
            <p>
              La precision se calcula como aciertos dividido por aciertos mas fallos.
            </p>
          </div>
        </div>
        <div className="history-card-metrics">
          <span>Cuenta: prediccion clara YES/NO</span>
          <span>Cuenta: mercado terminado</span>
          <span>Cuenta: resultado confiable</span>
          <span>No cuenta: pendiente</span>
          <span>No cuenta: cancelado</span>
          <span>No cuenta: sin decision fuerte</span>
          <span>No cuenta: solo precio de mercado</span>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Separacion de senales</p>
            <h2>Precio de mercado no es prediccion PolySignal</h2>
            <p>
              La probabilidad visible viene de Polymarket. La estimacion
              PolySignal solo aparece cuando hay evidencia independiente
              suficiente; el umbral para decision clara es 55%.
            </p>
          </div>
        </div>
        <div className="history-card-metrics">
          <span>Fuente primaria: Polymarket read-only</span>
          <span>Precio del mercado: referencia</span>
          <span>Estimacion PolySignal: solo con evidencia suficiente</span>
          <span>Decision clara: YES/NO sobre 55%</span>
          <span>Wallet Intelligence: senal auxiliar</span>
          <span>Resultado final: Polymarket/Gamma cuando sea verificable</span>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Analisis profundo</p>
            <h2>No hay modo rapido</h2>
            <p>
              Cada enlace inicia un job profundo local. PolySignal lee Polymarket,
              revisa las capas disponibles, prepara el brief de Samantha y puede
              quedar esperando investigacion externa antes de generar decision.
            </p>
          </div>
        </div>
        <div className="history-card-metrics">
          <span>Job local: Polymarket leido</span>
          <span>Wallet Intelligence: revisada si hay id compatible</span>
          <span>Samantha: reporte manual validable</span>
          <span>Odds/Kalshi: pendientes de integracion segura</span>
          <span>No cuenta: pendiente de investigacion</span>
          <span>No cuenta: evidencia insuficiente</span>
        </div>
      </section>

      <section className="safety-strip">
        <strong>Lectura responsable:</strong>
        <span>
          Wallet Intelligence es una senal auxiliar, no una recomendacion para copiar
          traders. PolySignal no identifica personas reales ni promete ganancias.
        </span>
      </section>
    </main>
  );
}
