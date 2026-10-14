import { Ban, CircleCheckBig, Clock, TriangleAlert, type LucideIcon } from "lucide-react";

import type { SettlementStatus } from "@/constants/violations";

type StatusChipProps = {
  status: SettlementStatus;
  className?: string;
};

/* Same four states and the same fills as StatusPill in MyViolationsScreen. */
const STATUS: Record<
  SettlementStatus,
  { label: string; className: string; Icon: LucideIcon }
> = {
  pending: {
    label: "Unsettled",
    className: "bg-warn-soft text-signal-hold",
    Icon: Clock,
  },
  settled: {
    label: "Settled",
    className: "bg-go-soft text-go-ink",
    Icon: CircleCheckBig,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-chip-neutral text-muted",
    Icon: Ban,
  },
  warning_only: {
    label: "Warning",
    className: "bg-warn-soft text-signal-hold",
    Icon: TriangleAlert,
  },
};

export default function StatusChip({ status, className = "" }: StatusChipProps) {
  const { label, className: tone, Icon } = STATUS[status] ?? STATUS.pending;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold ${tone} ${className}`}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
}