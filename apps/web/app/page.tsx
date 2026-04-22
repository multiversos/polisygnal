const checkpoints = [
  {
    title: "API disponible",
    text: "FastAPI expone /health y /markets como base para el flujo de sincronización.",
    state: "listo",
  },
  {
    title: "Modelo inicial",
    text: "La base incluye eventos, mercados y snapshots para empezar a capturar histórico.",
    state: "listo",
  },
  {
    title: "Siguiente iteración",
    text: "La próxima fase conectará la API de Polymarket y poblará mercados activos reales.",
    state: "pendiente",
  },
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">PolySignal / MVP</p>
        <h1>Mercados binarios, explicados con criterio.</h1>
        <p>
          Esta base prepara el terreno para un analista de Polymarket que
          descubra mercados, guarde snapshots, incorpore evidencia externa y
          calcule una probabilidad propia antes de hablar de ejecución.
        </p>

        <div className="hero-grid">
          <article className="card">
            <strong>Vertical inicial</strong>
            <span>Sports, por estructura de datos más clara y resolución más objetiva.</span>
          </article>
          <article className="card">
            <strong>Meta del MVP</strong>
            <span>Encontrar edge explicable comparando mercado, evidencia y confianza del modelo.</span>
          </article>
          <article className="card">
            <strong>Principio rector</strong>
            <span>Primero analista confiable y explicable; el trading no forma parte de esta fase.</span>
          </article>
        </div>
      </section>

      <h2 className="section-title">Estado de la base</h2>
      <section className="status-list">
        {checkpoints.map((item) => (
          <article className="status-item" key={item.title}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
            <span className="pill">{item.state}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

