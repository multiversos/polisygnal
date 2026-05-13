import { AnalyzeIcon } from "./AnalyzerVisuals";

const items = [
  {
    body: "Analiza antecedentes, participantes y condiciones.",
    title: "Revisa contexto del evento",
  },
  {
    body: "Monitorea fuentes permitidas y datos clave.",
    title: "Busca señales externas",
  },
  {
    body: "Evalúa smart money, flujos y comportamiento del mercado.",
    title: "Contrasta billeteras y movimiento",
  },
  {
    body: "Enfocada en lo que realmente importa.",
    title: "Te devuelve una lectura simple",
  },
];

export function SamanthaExplainerCard() {
  return (
    <aside className="samantha-explainer-card" aria-label="Que hace Samantha">
      <div className="samantha-explainer-header">
        <span className="samantha-avatar">S</span>
        <div>
          <p className="eyebrow">Samantha</p>
          <h2>Qué hace Samantha</h2>
        </div>
      </div>
      <div className="samantha-explainer-list">
        {items.map((item) => (
          <article key={item.title}>
            <span>
              <AnalyzeIcon name="check" />
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="samantha-explainer-note">
        Samantha trabaja por ti para que revises menos ruido y tomes mejores decisiones.
      </div>
      <p className="samantha-explainer-disclaimer">
        Cuando falten fuentes o evidencia validable, la lectura queda pendiente en vez de inventar señales.
      </p>
    </aside>
  );
}
