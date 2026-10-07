"use client";

import { Check } from "lucide-react";

type WizardProgressProps = {
  /** 1-based. */
  step: number;
  total: number;
  /**
   * Optional short labels for the dot row. Pass them when the steps are
   * meaningful on their own (Driver, Vehicle, Violations, Documentation).
   */
  labels?: string[];
  className?: string;
};

export default function WizardProgress({
  step,
  total,
  labels,
  className = "",
}: WizardProgressProps) {
  const percent = Math.round((step / total) * 100);
  const safeStep = Math.min(Math.max(step, 1), total);

  return (
    <div className={`px-5 ${className}`}>
      <div className="mt-3.5 flex items-baseline justify-between">
        <p className="text-[12px] text-muted">
          Step {safeStep} of {total}
        </p>
        <p className="tabular text-[12px] font-bold text-brand-500">{percent}%</p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={safeStep}
        aria-label={`Step ${safeStep} of ${total}`}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${percent}%` }}
        />
      </div>

      {labels?.length === total ? (
        <ol className="mt-3.5 flex items-start justify-between gap-1">
          {labels.map((label, index) => {
            const position = index + 1;
            const done = position < safeStep;
            const current = position === safeStep;

            return (
              <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold transition-colors duration-300 ${
                    done
                      ? "bg-brand-500 text-white"
                      : current
                        ? "bg-surface text-brand-600 ring-2 ring-brand-500"
                        : "bg-surface-sunken text-muted"
                  }`}
                >
                  {done ? <Check size={11} strokeWidth={3.2} aria-hidden /> : position}
                </span>
                <span
                  className={`text-center text-[10.5px] leading-tight ${
                    current ? "font-bold text-brand-700" : "font-medium text-muted"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}