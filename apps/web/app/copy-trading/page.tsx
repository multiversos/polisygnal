import type { Metadata } from "next";
import { CopyTradingDashboard } from "../components/copy-trading/CopyTradingDashboard";

export const metadata: Metadata = {
  title: "Copiar Wallets | PolySignal",
  description: "Modo demo para simular copias de wallets publicas de Polymarket.",
};

export default function CopyTradingPage() {
  return <CopyTradingDashboard />;
}
