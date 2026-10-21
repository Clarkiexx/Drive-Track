"use client";

export type StatusFilterOption<T extends string> = {
  value: T;
  label: string;
};

type StatusFilterSelectProps<T extends string> = {
  /** Sits before the control, e.g. "Status". */
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly StatusFilterOption<T>[];
  className?: string;
};

/**
 * Compact status dropdown for console table headers — the replacement for the
 * old "Show inactive" / "Show archived" checkboxes. It sits in the same header
 * row as the "X active of Y" count and borrows the table's Edit-button look;
 * .dt-input is full-width and 48px tall, which would not fit a header, so this
 * carries its own small control styling.
 */
export default function StatusFilterSelect<T extends string>({
  label = "Status",
  value,
  onChange,
  options,
  className = "",
}: StatusFilterSelectProps<T>) {
  return (
    <label
      className={`flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-console-muted ${className}`}
    >
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="cursor-pointer rounded-lg border border-console-line bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft focus:border-brand-500 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
