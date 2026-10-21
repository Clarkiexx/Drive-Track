"use client";

export type ChipOption = {
  value: string;
  label: string;
};

type ChipRowProps = {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group, e.g. "Filter by type". */
  label: string;
  /**
   * "soft" is the filled chip used by the violations list filters.
   * "outline" is the bordered chip used by the wizard's category filters.
   */
  variant?: "soft" | "outline";
  /**
   * Keeps the chips on one swipeable line instead of letting them wrap to a
   * second row — for strips that could outgrow the phone width (the Learning
   * Center's category filters). The scrollbar stays hidden; the partly
   * visible chip at the edge is the affordance.
   */
  scrollable?: boolean;
  className?: string;
};

export default function ChipRow({
  options,
  value,
  onChange,
  label,
  variant = "soft",
  scrollable = false,
  className = "",
}: ChipRowProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={
        scrollable
          ? `flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`
          : `flex flex-wrap gap-2 ${className}`
      }
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={
              variant === "soft"
                ? `rounded-[18px] px-3.5 py-[7px] text-[12px] font-semibold transition-colors duration-150 ${
                    active
                      ? "bg-brand-500 text-white"
                      : "bg-canvas text-ink hover:bg-surface-sunken"
                  }`
                : `rounded-full border px-3.5 py-[7px] text-[12px] font-semibold transition-colors duration-150 ${
                    active
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-hairline bg-surface text-ink hover:border-brand-300"
                  }`
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}