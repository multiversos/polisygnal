"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { updateCopyWallet } from "../../lib/copyTrading";
import type { CopyAmountMode, CopyWallet } from "../../lib/copyTradingTypes";
import { CopyAmountSelector } from "./CopyAmountSelector";

const COPY_WINDOW_OPTIONS = [
  { label: "10 segundos", value: 10 },
  { label: "30 segundos", value: 30 },
  { label: "1 minuto", value: 60 },
  { label: "2 minutos", value: 120 },
  { label: "5 minutos", value: 300 },
];

type EditCopyWalletFormProps = {
  onCancel: () => void;
  onSaved: (message: string) => Promise<void> | void;
  wallet: CopyWallet;
};

export function EditCopyWalletForm({ onCancel, onSaved, wallet }: EditCopyWalletFormProps) {
  const [label, setLabel] = useState(wallet.label || "");
  const [amountMode, setAmountMode] = useState<CopyAmountMode>(wallet.copy_amount_mode);
  const [amount, setAmount] = useState(Number(wallet.copy_amount_usd));
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(wallet.max_delay_seconds ?? 10);
  const [copyBuys, setCopyBuys] = useState(wallet.copy_buys);
  const [copySells, setCopySells] = useState(wallet.copy_sells);
  const [enabled, setEnabled] = useState(wallet.enabled);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const amountError = useMemo(
    () => (amount > 0 && Number.isFinite(amount) ? null : "El monto debe ser mayor que cero."),
    [amount],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (amountError) {
      setFormError(amountError);
      return;
    }
    setSaving(true);
    try {
      await updateCopyWallet(wallet.id, {
        copy_amount_mode: amountMode,
        copy_amount_usd: amount,
        copy_buys: copyBuys,
        copy_sells: copySells,
        enabled,
        label: label.trim() || null,
        max_delay_seconds: maxDelaySeconds,
      });
      await onSaved("Configuracion actualizada.");
    } catch {
      setFormError("No pudimos actualizar esta wallet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="copy-inline-editor" onSubmit={handleSubmit}>
      <div className="copy-inline-editor-header">
        <div className="copy-panel-heading">
          <span>Editar wallet</span>
          <strong>{wallet.label || "Sin alias"}</strong>
        </div>
        <span className="copy-badge locked">Modo real bloqueado</span>
      </div>
      <label className="copy-field">
        <span>Alias</span>
        <input
          disabled={saving}
          onChange={(event) => {
            setLabel(event.target.value);
            setFormError(null);
          }}
          placeholder="Alias de la wallet"
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
          setFormError(null);
        }}
      />
      <label className="copy-field">
        <span>Ventana de copia</span>
        <select
          className="copy-select"
          disabled={saving}
          onChange={(event) => {
            setMaxDelaySeconds(Number(event.target.value));
            setFormError(null);
          }}
          value={maxDelaySeconds}
        >
          {COPY_WINDOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="copy-toggle-row">
        <label className="copy-toggle-pill">
          <input
            aria-label="Copiar compras"
            checked={copyBuys}
            className="copy-toggle-input"
            disabled={saving}
            onChange={(event) => {
              setCopyBuys(event.target.checked);
              setFormError(null);
            }}
            type="checkbox"
          />
          <span className="copy-toggle-switch" aria-hidden="true" />
          Copiar compras
        </label>
        <label className="copy-toggle-pill">
          <input
            aria-label="Copiar ventas"
            checked={copySells}
            className="copy-toggle-input"
            disabled={saving}
            onChange={(event) => {
              setCopySells(event.target.checked);
              setFormError(null);
            }}
            type="checkbox"
          />
          <span className="copy-toggle-switch" aria-hidden="true" />
          Copiar ventas
        </label>
        <label className="copy-toggle-pill">
          <input
            aria-label="Wallet activa"
            checked={enabled}
            className="copy-toggle-input"
            disabled={saving}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setFormError(null);
            }}
            type="checkbox"
          />
          <span className="copy-toggle-switch" aria-hidden="true" />
          {enabled ? "Activa" : "Pausada"}
        </label>
      </div>
      <div className="copy-inline-editor-meta">
        <small>Modo: Demo</small>
        <small>La nueva ventana de copia se aplica en el siguiente escaneo del watcher demo.</small>
      </div>
      {formError ? <p className="copy-form-error">{formError}</p> : null}
      <div className="copy-action-row">
        <button className="copy-primary-button" disabled={saving || Boolean(amountError)} type="submit">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="copy-secondary-button" disabled={saving} onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
