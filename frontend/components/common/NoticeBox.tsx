import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

type NoticeBoxProps = {
  tone?: "warn" | "danger" | "info" | "success";
  children: ReactNode;
  className?: string;
};

const TONE = {
  warn: {
    shell: "bg-warn-soft text-warn-ink",
    Icon: TriangleAlert,
  },
  danger: {
    shell: "bg-danger-soft text-signal-stop",
    Icon: CircleAlert,
  },
  info: {
    shell: "bg-info-soft text-signal-info",
    Icon: Info,
  },
  success: {
    shell: "bg-brand-soft text-brand-700",
    Icon: Info,
  },
} as const;

/**
 * Inline message block. Covers the warning-only note in the wizard, the
 * privacy note on driver search, and the payment-pending notice on the receipt.
 */
export default function NoticeBox({
  tone = "warn",
  children,
  className = "",
}: NoticeBoxProps) {
  const { shell, Icon } = TONE[tone];

  return (
    <p className={`flex gap-2 rounded-[10px] p-3 text-[12px] leading-relaxed ${shell} ${className}`}>
      <Icon size={15} strokeWidth={2.4} aria-hidden className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}