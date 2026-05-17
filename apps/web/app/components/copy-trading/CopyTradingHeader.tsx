import type { CopyTradingStatus } from "../../lib/copyTradingTypes";

export function CopyTradingHeader({ status }: { status: CopyTradingStatus | null }) {
  return (
    <header className="copy-trading-header">
      <div className="copy-trading-header-copy">
        <div className="copy-trading-brand">
          <span className="copy-trading-brand-mark">PolySignal</span>
          <span className="copy-trading-brand-slash">/</span>
          <span className="copy-trading-brand-section">Copy Trading</span>
        </div>
        <div>
          <span className="copy-section-kicker">Worker demo gestionado en Render</span>
          <h1>Copy Trading</h1>
          <p>
            Sigue wallets publicas y revisa el estado del worker demo persistente. Esta pagina solo muestra estado,
            PnL e historial; no inicia copias desde el navegador.
          </p>
        </div>
      </div>
      <div className="copy-status-strip" aria-label="Estado del modulo">
        <span className="copy-status-pill subtle">Vista read-only</span>
        <span className="copy-status-pill success">Worker demo en Render</span>
        <span className="copy-status-pill locked">Real no conectado</span>
        <span className="copy-status-pill subtle">
          {status?.worker_status === "running" ? "Heartbeat activo" : "Estado persistido visible"}
        </span>
      </div>
    </header>
  );
}
