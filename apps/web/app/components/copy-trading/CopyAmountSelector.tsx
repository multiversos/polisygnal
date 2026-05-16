"use client";

import type { CopyAmountMode } from "../../lib/copyTradingTypes";

const PRESETS = [
  { label: "$1", value: 1 },
  { label: "$5", value: 5 },
  { label: "$10", value: 10 },
  { label: "$20", value: 20 },
];

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
            className={`copy-pill-button ${mode === "preset" && amount === preset.value ? "active" : ""}`}
            disabled={disabled}
            key={preset.value}
            onClick={() => onChange({ amount: preset.value, mode: "preset" })}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <button
          className={`copy-pill-button ${mode === "custom" ? "active" : ""}`}
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
