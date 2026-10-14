"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Password input with the show/hide control the Expo screens put inside the
 * field's right edge. Built on the shared .dt-input class so it matches every
 * other input in the app.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  error,
  required = false,
  disabled = false,
  className = "",
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
        {required ? <span className="text-signal-stop"> *</span> : null}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="dt-input pr-12"
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[10px] text-muted transition-colors hover:text-brand-600 disabled:opacity-40"
        >
          {visible ? (
            <EyeOff size={18} strokeWidth={2} aria-hidden />
          ) : (
            <Eye size={18} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[12px] font-semibold text-signal-stop">{error}</p>
      ) : null}
    </div>
  );
}