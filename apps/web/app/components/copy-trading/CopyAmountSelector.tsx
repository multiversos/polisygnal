"use client";

import type { CopyAmountMode } from "../../lib/copyTradingTypes";

const PRESETS = [1, 5, 10, 20];

type CopyAmountSelectorProps = {
  amount: number;
  disabled?: boolean;
  error?: string | null;
  mode: CopyAmountMode;
  onChange: (next: { amount: number; mode: CopyAmountMode }) => void;
};

export function CopyAmountSelector({
  amount,
  disabled = false,
  error,
  mode,
  onChange,
}: CopyAmountSelectorProps) {
  return (
    <div className="copy-amount-selector">
      <div className="copy-amount-presets" aria-label="Monto por trade">
        {PRESETS.map((preset) => (
          <button
            className={mode === "preset" && amount === preset ? "active" : ""}
            disabled={disabled}
            key={preset}
            onClick={() => onChange({ amount: preset, mode: "preset" })}
            type="button"
          >
            ${preset}
          </button>
        ))}
        <button
          className={mode === "custom" ? "active" : ""}
          disabled={disabled}
          onClick={() => onChange({ amount: amount > 0 ? amount : 25, mode: "custom" })}
          type="button"
        >
          Personalizado
        </button>
      </div>
      {mode === "custom" ? (
        <label className="copy-custom-amount">
          <span>Monto personalizado USD</span>
          <input
            disabled={disabled}
            min="0.01"
            onChange={(event) =>
              onChange({
                amount: Number(event.target.value),
                mode: "custom",
              })
            }
            placeholder="25.00"
            step="0.01"
            type="number"
            value={Number.isFinite(amount) ? amount : ""}
          />
        </label>
      ) : null}
      {error ? <p className="copy-form-error">{error}</p> : null}
    </div>
  );
}
