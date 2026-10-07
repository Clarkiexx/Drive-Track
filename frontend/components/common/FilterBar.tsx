import type { ReactNode } from "react";

type FilterBarProps = {
  /** Chip rows, top to bottom. */
  children: ReactNode;
  className?: string;
};

/**
 * White filter strip that sits directly under the AppBar on list screens, the
 * same place MyViolationsScreen pins its two chip rows.
 *
 * Not sticky, on purpose. Pinning it would mean hardcoding the AppBar's height,
 * and that height carries env(safe-area-inset-top) — which is ~47px on a
 * notched phone and 0 on Android. Any fixed number is wrong on half the
 * devices this ships to. Wrap it and the AppBar together if a screen needs both
 * pinned.
 */
export default function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <div className={`border-b border-hairline bg-surface px-4 py-2.5 ${className}`}>
      <div className="space-y-2">{children}</div>
    </div>
  );
}