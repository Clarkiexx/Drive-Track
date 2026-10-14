"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type PrimaryButtonProps = {
  children: ReactNode;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

/** Filled brand action used for the submit button on every signed-out screen. */
export default function PrimaryButton({
  children,
  onClick,
  isLoading = false,
  disabled = false,
  type = "button",
  className = "",
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 py-3.5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {isLoading ? (
        <>
          <LoaderCircle size={17} strokeWidth={2.4} className="animate-spin" aria-hidden />
          <span className="sr-only">Working</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}