import { AnalyzeIcon, GaugeChart, MiniLineChart } from "./AnalyzerVisuals";
import { SamanthaExplainerCard } from "./SamanthaExplainerCard";

export type AnalysisPreviewProps = {
  marketProbability?: number | null;
  marketProbabilityCopy: string;
  polySignalCopy: string;
  polySignalReady?: boolean;
  riskCopy: string;
  riskTone?: "neutral" | "warning";
  samanthaCopy: string;
};

export function AnalysisPreview({
  marketProbability,
  marketProbabilityCopy,
  polySignalCopy,
  polySignalReady = false,
  riskCopy,
  riskTone = "neutral",
  samanthaCopy,
}: AnalysisPreviewProps) {
  return (
    <section className="analysis-preview-section" aria-label="Vista previa del analisis">
      <div className="analysis-preview-heading">
        <div>
          <p className="eyebrow">Vista previa</p>
          <h2>Vista previa del análisis</h2>
          <p>Así es como recibirás tu análisis en segundos.</p>
        </div>
      </div>
      <div className="analysis-preview-layout">
        <div className="analysis-preview-grid">
          <article className="analysis-preview-card gauge-card">
            <span>Probabilidad de mercado</span>
            <GaugeChart value={marketProbability} />
            <p>{marketProbabilityCopy}</p>
          </article>
          <article className="analysis-preview-card">
            <span>Señal PolySignal</span>
            <MiniLineChart active={polySignalReady} />
            <strong>{polySignalReady ? "Señal validada" : "Pendiente"}</strong>
            <p>{polySignalCopy}</p>
          </article>
          <article className={`analysis-preview-card risk-card ${riskTone}`}>
            <span>Riesgo detectado</span>
            <div className="preview-risk-icon">
              <AnalyzeIcon name="shield" />
            </div>
            <strong>{riskTone === "warning" ? "Revisar" : "En espera"}</strong>
            <p>{riskCopy}</p>
          </article>
          <article className="analysis-preview-card samantha-summary-card">
            <span>Resumen Samantha</span>
            <div className="samantha-summary-row">
              <strong>S</strong>
              <p>{samanthaCopy}</p>
            </div>
          </article>
        </div>
        <SamanthaExplainerCard />
      </div>
    </section>
  );
}
