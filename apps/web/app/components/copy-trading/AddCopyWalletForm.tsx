"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ApiRequestError } from "../../lib/api";
import { createCopyWallet } from "../../lib/copyTrading";
import type { CopyAmountMode, CopyWallet, CopyWalletCreateInput } from "../../lib/copyTradingTypes";
import { CopyAmountSelector } from "./CopyAmountSelector";

type AddCopyWalletFormProps = {
  onCreated: () => Promise<void> | void;
  wallets: CopyWallet[];
};

const EMPTY_WALLET_MESSAGE = "Ingresa una wallet o perfil publico de Polymarket.";
const WALLET_FORMAT_MESSAGE = "La wallet debe tener formato 0x y 40 caracteres hexadecimales.";
const WALLET_HEX_MESSAGE = "La wallet contiene caracteres no validos.";
const PROFILE_NOT_RECOGNIZED_MESSAGE =
  "No pudimos reconocer ese perfil. Pega una wallet 0x publica o un perfil valido.";
const SAVE_WALLET_ERROR_MESSAGE = "No pudimos guardar esta wallet. Intenta nuevamente.";
const COPY_WINDOW_OPTIONS = [
  { label: "10 segundos", value: 10 },
  { label: "30 segundos", value: 30 },
  { label: "1 minuto", value: 60 },
  { label: "2 minutos", value: 120 },
  { label: "5 minutos", value: 300 },
];

type WalletInputValidation =
  | { normalizedWallet: string | null; ok: true; value: string }
  | { ok: false; message: string };

export function AddCopyWalletForm({ onCreated, wallets }: AddCopyWalletFormProps) {
  const [walletInput, setWalletInput] = useState("");
  const [label, setLabel] = useState("");
  const [amountMode, setAmountMode] = useState<CopyAmountMode>("preset");
  const [amount, setAmount] = useState(5);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(10);
  const [copyBuys, setCopyBuys] = useState(true);
  const [copySells, setCopySells] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountError = amount > 0 && Number.isFinite(amount) ? null : "El monto debe ser mayor que cero.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const walletValidation = validateWalletTargetInput(walletInput);
    if (walletValidation.ok === false) {
      setFormError(walletValidation.message);
      return;
    }
    if (
      walletValidation.normalizedWallet &&
      wallets.some((wallet) => wallet.proxy_wallet.toLowerCase() === walletValidation.normalizedWallet)
    ) {
      setFormError("Esta wallet ya esta en seguimiento.");
      return;
    }
    if (amountError) {
      setFormError(amountError);
      return;
    }
    const payload: CopyWalletCreateInput = {
      wallet_input: walletValidation.value,
      label: label.trim() || undefined,
      mode: "demo",
      copy_amount_mode: amountMode,
      copy_amount_usd: amount,
      copy_buys: copyBuys,
      copy_sells: copySells,
      max_delay_seconds: maxDelaySeconds,
    };
    setSaving(true);
    try {
      await createCopyWallet(payload);
      setWalletInput("");
      setLabel("");
      setAmountMode("preset");
      setAmount(5);
      setMaxDelaySeconds(10);
      setCopyBuys(true);
      setCopySells(true);
      await onCreated();
    } catch (error) {
      setFormError(getCreateWalletErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="copy-panel copy-add-form" onSubmit={handleSubmit}>
      <div className="copy-panel-heading">
        <span>Wallet que quieres copiar</span>
        <strong>Perfil o wallet pública</strong>
      </div>
      <p className="copy-field-helper">Esta es la wallet objetivo que PolySignal observará en modo demo.</p>
      <label className="copy-field">
        <span>Perfil o wallet pública</span>
        <input
          disabled={saving}
          onChange={(event) => {
            setWalletInput(event.target.value);
            setFormError(null);
          }}
          placeholder="Pega perfil o wallet pública de Polymarket"
          value={walletInput}
        />
      </label>
      <label className="copy-field">
        <span>Alias opcional</span>
        <input
          disabled={saving}
          onChange={(event) => {
            setLabel(event.target.value);
            setFormError(null);
          }}
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
          setFormError(null);
        }}
      />
      <label className="copy-field">
        <span>Ventana de copia en vivo</span>
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
      </div>
      {formError ? <p className="copy-form-error">{formError}</p> : null}
      <button className="copy-primary-button" disabled={saving || Boolean(amountError)} type="submit">
        {saving ? "Agregando..." : "Agregar wallet"}
      </button>
    </form>
  );
}

function validateWalletTargetInput(input: string): WalletInputValidation {
  const value = input.trim();
  if (!value) {
    return { ok: false, message: EMPTY_WALLET_MESSAGE };
  }

  if (value.toLowerCase().startsWith("0x")) {
    if (value.length !== 42) {
      return { ok: false, message: WALLET_FORMAT_MESSAGE };
    }
    if (!/^0x[0-9a-fA-F]+$/.test(value)) {
      return { ok: false, message: WALLET_HEX_MESSAGE };
    }
    return { normalizedWallet: value.toLowerCase(), ok: true, value: value.toLowerCase() };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const isPolymarket = host === "polymarket.com" || host === "www.polymarket.com";
      const embeddedWallet = value.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/);
      if (isPolymarket && embeddedWallet) {
        return { normalizedWallet: embeddedWallet[0].toLowerCase(), ok: true, value };
      }
    } catch {
      // Fall through to the friendly profile error.
    }
    return { ok: false, message: PROFILE_NOT_RECOGNIZED_MESSAGE };
  }

  return { ok: false, message: PROFILE_NOT_RECOGNIZED_MESSAGE };
}

function getCreateWalletErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) {
      return "Esta wallet ya esta en seguimiento.";
    }
    if (error.status === 400 && error.message && !error.message.includes("responded")) {
      return error.message;
    }
  }
  return SAVE_WALLET_ERROR_MESSAGE;
}
