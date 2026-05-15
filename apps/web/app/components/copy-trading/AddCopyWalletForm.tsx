"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createCopyWallet } from "../../lib/copyTrading";
import type { CopyAmountMode, CopyWalletCreateInput } from "../../lib/copyTradingTypes";
import { CopyAmountSelector } from "./CopyAmountSelector";

type AddCopyWalletFormProps = {
  onCreated: () => void;
};

export function AddCopyWalletForm({ onCreated }: AddCopyWalletFormProps) {
  const [walletInput, setWalletInput] = useState("");
  const [label, setLabel] = useState("");
  const [amountMode, setAmountMode] = useState<CopyAmountMode>("preset");
  const [amount, setAmount] = useState(5);
  const [copyBuys, setCopyBuys] = useState(true);
  const [copySells, setCopySells] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountError = amount > 0 && Number.isFinite(amount) ? null : "El monto debe ser mayor que cero.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!walletInput.trim()) {
      setFormError("Ingresa una wallet o perfil publico de Polymarket.");
      return;
    }
    if (amountError) {
      setFormError(amountError);
      return;
    }
    const payload: CopyWalletCreateInput = {
      wallet_input: walletInput,
      label: label.trim() || undefined,
      mode: "demo",
      copy_amount_mode: amountMode,
      copy_amount_usd: amount,
      copy_buys: copyBuys,
      copy_sells: copySells,
    };
    setSaving(true);
    try {
      await createCopyWallet(payload);
      setWalletInput("");
      setLabel("");
      setAmountMode("preset");
      setAmount(5);
      setCopyBuys(true);
      setCopySells(true);
      onCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No pudimos agregar la wallet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="copy-panel copy-add-form" onSubmit={handleSubmit}>
      <div className="copy-panel-heading">
        <span>Agregar perfil</span>
        <strong>Wallet o perfil publico</strong>
      </div>
      <label className="copy-field">
        <span>Input wallet/perfil</span>
        <input
          disabled={saving}
          onChange={(event) => setWalletInput(event.target.value)}
          placeholder="0x... o https://polymarket.com/profile/0x..."
          value={walletInput}
        />
      </label>
      <label className="copy-field">
        <span>Alias opcional</span>
        <input
          disabled={saving}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ej. Wallet futbol conservadora"
          value={label}
        />
      </label>
      <CopyAmountSelector
        amount={amount}
        disabled={saving}
        error={amountError}
        mode={amountMode}
        onChange={(next) => {
          setAmount(next.amount);
          setAmountMode(next.mode);
        }}
      />
      <div className="copy-toggle-row">
        <label>
          <input
            checked={copyBuys}
            disabled={saving}
            onChange={(event) => setCopyBuys(event.target.checked)}
            type="checkbox"
          />
          Copiar compras
        </label>
        <label>
          <input
            checked={copySells}
            disabled={saving}
            onChange={(event) => setCopySells(event.target.checked)}
            type="checkbox"
          />
          Copiar ventas
        </label>
      </div>
      {formError ? <p className="copy-form-error">{formError}</p> : null}
      <button className="copy-primary-button" disabled={saving || Boolean(amountError)} type="submit">
        {saving ? "Agregando..." : "Agregar wallet"}
      </button>
    </form>
  );
}
