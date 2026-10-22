"use client";

export function SeedField({
  value,
  onChange,
  name = "simulation-seed",
  ariaLabel = "Simulation seed",
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  name?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="control-field flex h-10 items-center gap-2 rounded-[9px] border bg-card/75 px-3 text-xs text-muted-foreground">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Seed</span>
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        autoComplete="off"
        inputMode="numeric"
        min={1}
        name={name}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 bg-transparent font-mono tabular-nums text-foreground outline-none"
      />
    </label>
  );
}
