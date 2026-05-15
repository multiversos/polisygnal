"use client";

import { useEffect, useState } from "react";
import { formatWalletAddress } from "../../lib/copyTrading";

type EthereumProvider = {
  on?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const CHAIN_LABELS: Record<string, string> = {
  "0x1": "Ethereum",
  "0x89": "Polygon",
  "0x13882": "Polygon testnet",
};

function firstAccount(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const account = value.find((item) => typeof item === "string");
  return typeof account === "string" ? account : null;
}

function chainLabel(chainId: string | null): string {
  if (!chainId) {
    return "Red pendiente";
  }
  return CHAIN_LABELS[chainId] ?? `Red no compatible (${chainId})`;
}

export function ExecutionWalletCard() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [message, setMessage] = useState("Necesaria para activar copias reales en un próximo sprint.");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) {
      return undefined;
    }

    const handleAccountsChanged = (accounts: unknown) => {
      const account = firstAccount(accounts);
      setAddress(account);
      setMessage(account ? "Wallet conectada. Ejecución real pendiente." : "Conexión cancelada.");
    };
    const handleChainChanged = (nextChainId: unknown) => {
      setChainId(typeof nextChainId === "string" ? nextChainId : null);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  async function handleConnect() {
    const provider = window.ethereum;
    if (!provider) {
      setMessage("No se encontró un proveedor de wallet compatible. Abre PolySignal en un navegador con wallet instalada.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const account = firstAccount(accounts);
      if (!account) {
        setAddress(null);
        setMessage("Conexión cancelada.");
        return;
      }
      setAddress(account);
      const nextChainId = await provider.request({ method: "eth_chainId" });
      setChainId(typeof nextChainId === "string" ? nextChainId : null);
      setMessage("Wallet conectada. Ejecución real pendiente de próximo sprint.");
    } catch {
      setAddress(null);
      setMessage("Conexión cancelada.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className="copy-panel copy-execution-wallet">
      <div className="copy-panel-heading">
        <span>Mi wallet de ejecución</span>
        <strong>{address ? "Wallet conectada" : "No conectada"}</strong>
      </div>
      <p>Conecta la wallet que usarás para copiar operaciones cuando el modo real esté disponible.</p>
      <div className="copy-wallet-status-strip" aria-label="Estado de wallet de ejecución">
        <span>{address ? "Conectada" : "No conectada"}</span>
        <span>Real bloqueado</span>
        <span>Ejecución pendiente</span>
      </div>
      <div className="copy-execution-details">
        <span>Estado: {address ? "Conectada" : "No conectada"}</span>
        <span>Wallet conectada: {address ? formatWalletAddress(address) : "pendiente"}</span>
        <span>Red: {chainLabel(chainId)}</span>
        <span>Balance USDC: pendiente</span>
        <span>Permiso de trading: pendiente</span>
        <span>Modo real: bloqueado</span>
      </div>
      <p>{message}</p>
      <button className="copy-primary-button" disabled={connecting} onClick={handleConnect} type="button">
        {connecting ? "Conectando..." : "Conectar wallet"}
      </button>
      <div className="copy-lock-list">
        <span>Sin firma de órdenes</span>
        <span>Sin envío de órdenes reales</span>
      </div>
    </section>
  );
}
