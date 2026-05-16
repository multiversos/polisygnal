import type { CopyTradingStatus } from "../../lib/copyTradingTypes";

export function CopyTradingHeader({ status }: { status: CopyTradingStatus | null }) {
  return (
    <header className="copy-trading-header">
      <div>
        <span className="copy-section-kicker">Read-only wallet automation</span>
        <h1>Copiar Wallets</h1>
        <p>Sigue wallets publicas y simula copias con monto fijo. Bloqueado hasta configurar credenciales.</p>
      </div>
      <div className="copy-status-strip" aria-label="Estado del modulo">
        <span className="copy-status-pill success">Demo activo</span>
        <span className="copy-status-pill locked">Real no conectado</span>
        <span className="copy-status-pill subtle">
          {status?.real_trading_available ? "Real disponible" : "Preparado para proximo sprint"}
        </span>
      </div>
    </header>
  );
}
