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
          <span className="copy-section-kicker">Read-only wallet automation</span>
          <h1>Copy Trading</h1>
          <p>Sigue wallets publicas en Copiar Wallets y simula copias demo con monto fijo. Bloqueado hasta configurar credenciales.</p>
        </div>
      </div>
      <div className="copy-status-strip" aria-label="Estado del modulo">
        <span className="copy-status-pill subtle">Actualizacion automatica 5s</span>
        <span className="copy-status-pill success">Demo activo</span>
        <span className="copy-status-pill locked">Real no conectado</span>
        <span className="copy-status-pill subtle">
          {status?.real_trading_available ? "Real disponible" : "Preparado para proximo sprint"}
        </span>
      </div>
    </header>
  );
}
