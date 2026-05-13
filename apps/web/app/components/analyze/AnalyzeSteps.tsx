import { AnalyzeIcon } from "./AnalyzerVisuals";

const steps = [
  {
    copy: "Pega el enlace del evento o mercado que quieres analizar.",
    icon: "link" as const,
    title: "Pegar enlace",
    tone: "cyan",
  },
  {
    copy: "PolySignal detecta el mercado y confirma que es válido para analizar.",
    icon: "check" as const,
    title: "Confirmar mercado",
    tone: "blue",
  },
  {
    copy: "Samantha procesa todo y te entrega una lectura simple y accionable.",
    icon: "sparkles" as const,
    title: "Recibir lectura clara",
    tone: "violet",
  },
];

export function AnalyzeSteps() {
  return (
    <section className="analyze-step-flow" aria-label="Flujo de analisis">
      {steps.map((step, index) => (
        <article className={`analyze-step-card ${step.tone}`} key={step.title}>
          <div className="analyze-step-number">{index + 1}</div>
          <div className="analyze-step-icon">
            <AnalyzeIcon name={step.icon} />
          </div>
          <div>
            <h2>{step.title}</h2>
            <p>{step.copy}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
