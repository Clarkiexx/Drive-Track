"use client";

import { useId } from "react";

type FormFieldProps = {
  label: string;
  /** Shows the red asterisk the wizard uses for mandatory fields. */
  required?: boolean;
  /** Grey helper line under the control. */
  hint?: string;
  /** Red inline message; also marks the control invalid. */
  error?: string | null;
  /** `input` by default. */
  as?: "input" | "textarea";
  disabled?: boolean;
  /** Renders the muted fill used for values the officer cannot edit. */
  readOnly?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"input">, "className" | "disabled"> &
  Omit<React.ComponentProps<"textarea">, "className" | "disabled">;

/**
 * Label + control pair matching the wizard's inputs: a 13px semibold label,
 * a red asterisk for required fields, a 10px-radius white control, and either a
 * grey helper line or a red error underneath.
 */
export default function FormField({
  label,
  required = false,
  hint,
  error,
  as = "input",
  disabled = false,
  readOnly = false,
  className = "",
  ...props
}: FormFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const shared = {
    id,
    disabled,
    "aria-readonly": readOnly || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: "dt-input",
    ...props,
  };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-ink"
      >
        {label}
        {required ? <span className="text-signal-stop"> *</span> : null}
      </label>

      {as === "textarea" ? <textarea rows={3} {...shared} /> : <input {...shared} />}

      {error ? (
        <p id={`${id}-error`} className="mt-2 text-[12px] font-semibold text-signal-stop">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-2 text-[11px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}