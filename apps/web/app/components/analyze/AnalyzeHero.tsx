import { AnalyzeIcon, HeroSignalIllustration } from "./AnalyzerVisuals";

type AnalyzeHeroProps = {
  input: string;
  loading: boolean;
  onClear: () => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
};

export function AnalyzeHero({
  input,
  loading,
  onClear,
  onInputChange,
  onSubmit,
}: AnalyzeHeroProps) {
  return (
    <section className="analyze-hero">
      <div className="analyze-hero-copy">
        <span className="analyze-hero-badge">ANALIZAR ENLACE</span>
        <h1>Analizar enlace</h1>
        <p>
          PolySignal detecta el mercado y Samantha prepara una lectura clara.
        </p>
        <div className="analyze-hero-form" role="search">
          <label className="analyze-link-field">
            <span aria-hidden="true">
              <AnalyzeIcon name="link" />
            </span>
            <input
              aria-label="Enlace de Polymarket"
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Pega aquí el enlace del evento o mercado"
              value={input}
            />
          </label>
          <button
            className="analyze-primary-button"
            disabled={loading}
            onClick={onSubmit}
            type="button"
          >
            {loading ? "Analizando" : "Analizar →"}
          </button>
          <a className="analyze-secondary-button" href="/history">
            Ver historial
          </a>
          {input ? (
            <button className="analyze-ghost-button" onClick={onClear} type="button">
              Limpiar
            </button>
          ) : null}
        </div>
      </div>
      <HeroSignalIllustration />
    </section>
  );
}
