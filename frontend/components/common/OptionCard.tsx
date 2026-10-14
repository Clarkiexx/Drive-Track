"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

type OptionCardProps = {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  /** Leading icon, e.g. the article number for a violation type. */
  Icon?: LucideIcon;
  /** Right-hand summary, e.g. the default penalty. */
  trailing?: React.ReactNode;
  /**
   * "soft" fills the row with the pale brand tint when selected — used by the
   * violation checklist. "solid" fills it solid green — used by Yes/No toggles.
   */
  tone?: "soft" | "solid";
  className?: string;
};

/**
 * One selectable row. Backs three of the wizard's controls: the violation
 * checklist, the record-type choice, and the driver-under-protest toggle.
 */
export default function OptionCard({
  selected,
  onSelect,
  children,
  Icon,
  trailing,
  tone = "soft",
  className = "",
}: OptionCardProps) {
  const id = useId();

  const selectedClass =
    tone === "solid"
      ? "border-brand-500 bg-brand-500 text-white"
      : "border-brand-500 bg-brand-soft";

  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-[10px] border p-3.5 text-left transition-colors duration-150 ${
        selected ? selectedClass : "border-hairline bg-surface hover:border-brand-300"
      } ${className}`}
    >
      {Icon ? (
        <Icon
          size={18}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 ${selected && tone === "solid" ? "text-white" : "text-muted"}`}
        />
      ) : null}

      <span
        className={`min-w-0 flex-1 text-[13px] leading-snug ${
          selected
            ? tone === "solid"
              ? "font-semibold"
              : "font-semibold text-brand-800"
            : "text-ink"
        }`}
      >
        {children}
      </span>

      {trailing ? (
        <span
          className={`tabular shrink-0 text-[12px] font-semibold ${
            selected && tone === "solid" ? "text-white/85" : "text-muted"
          }`}
        >
          {trailing}
        </span>
      ) : null}

      {tone === "soft" ? (
        <span
          aria-hidden
          className={`grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-150 ${
            selected ? "border-brand-500 bg-brand-500 text-white" : "border-hairline bg-canvas"
          }`}
        >
          {selected ? <Check size={13} strokeWidth={3.2} aria-hidden /> : null}
        </span>
      ) : null}
    </button>
  );
}

type SegmentedOptionsProps<T extends string | number | boolean> = {
  options: { value: T; label: string; Icon?: LucideIcon }[];
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
};

/**
 * Evenly divided row of exclusive choices. Backs the citation/warning record
 * type and the yes/no protest answer.
 */
export function SegmentedOptions<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  className = "",
}: SegmentedOptionsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-2.5 ${className}`}
    >
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-3 py-3 text-[13px] transition-colors duration-150 ${
              active
                ? "border-brand-500 bg-brand-500 font-bold text-white"
                : "border-hairline bg-surface font-semibold text-muted hover:border-brand-300"
            }`}
          >
            {option.Icon ? <option.Icon size={16} strokeWidth={2.2} aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}