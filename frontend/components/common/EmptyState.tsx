import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  /** Optional follow-up line or an inline action. */
  children?: ReactNode;
  /** A single call to action under the copy. */
  action?: { label: string; href: string };
  className?: string;
};

/**
 * Placeholder for a list with nothing in it — a filtered-to-nothing violations
 * list, or a driver search with no hits.
 */
export default function EmptyState({
  title,
  children,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span className="grid size-12 place-items-center rounded-full bg-surface-sunken text-muted">
        <Inbox size={22} strokeWidth={1.9} aria-hidden />
      </span>

      <p className="mt-3.5 text-[14px] font-semibold text-ink">{title}</p>

      {children ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{children}</p>
      ) : null}

      {action ? (
        <Link
          href={action.href}
          className="mt-4 text-[14px] font-semibold text-brand-500 underline-offset-2 hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}