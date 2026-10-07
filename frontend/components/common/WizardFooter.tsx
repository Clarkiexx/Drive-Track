"use client";

import type { ReactNode } from "react";
import { ChevronLeft, LoaderCircle } from "lucide-react";

type WizardFooterProps = {
  onBack: () => void;
  /** Advances a step. Omit on the last step, where the primary action submits. */
  onNext?: () => void;
  /** Runs on the last step. Required when onNext is omitted. */
  onSubmit?: () => void;
  nextLabel?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  disabled?: boolean;
  /** Inline message above the buttons, e.g. a validation failure. */
  error?: string | null;
  /**
   * What sits below the footer. "safe" clears the home indicator only;
   * "nav" also clears the fixed tab bar, which is what wizard routes need.
   */
  bottomInset?: "none" | "safe" | "nav";
  children?: ReactNode;
};

/**
 * Sticky Back / Next pair from IssueCitationScreen. On the final step the
 * primary button becomes the submit action and shows a spinner instead of a
 * label while it runs.
 */
export default function WizardFooter({
  onBack,
  onNext,
  onSubmit,
  nextLabel = "Next",
  submitLabel = "Submit Citation",
  isSubmitting = false,
  disabled = false,
  error,
  bottomInset = "nav",
  children,
}: WizardFooterProps) {
  const isLastStep = !onNext;
  const inset =
    bottomInset === "nav"
      ? "pb-nav-safe"
      : bottomInset === "safe"
        ? "pb-safe"
        : "pb-3";

  return (
    <div className="sticky bottom-0 z-30 mt-7 border-t border-hairline bg-canvas/92 backdrop-blur-md">
      <div className="px-5 pt-3">
        {error ? (
          <p role="alert" className="mb-2.5 text-[13px] font-semibold text-signal-stop">
            {error}
          </p>
        ) : null}

        {children}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex flex-1 items-center justify-center gap-1 rounded-[10px] border border-hairline bg-surface py-3.5 text-[14px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken"
          >
            <ChevronLeft size={17} strokeWidth={2.4} aria-hidden />
            Back
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || isSubmitting || !onSubmit}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-[10px] bg-brand-500 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={17} strokeWidth={2.4} className="animate-spin" aria-hidden />
                  Submitting
                </>
              ) : (
                submitLabel
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              disabled={disabled}
              className="flex flex-[1.4] items-center justify-center gap-1 rounded-[10px] bg-brand-500 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>

      {/* Keeps the last button clear of the home indicator / tab bar. */}
      <div aria-hidden className={inset} />
    </div>
  );
}