import type { ReactNode } from "react";

type PageBodyProps = {
  children: ReactNode;
  /**
   * Clears the fixed tab bar plus the device safe area. Leave this on for
   * anything rendered above <BottomNav>; turn it off for login and other
   * full-height screens with no tab bar.
   */
  withNav?: boolean;
  /** Drops the horizontal gutter, for edge-to-edge content like card lists. */
  bleed?: boolean;
  className?: string;
};

/**
 * Standard page container: the vertical rhythm and the tab-bar clearance every
 * screen needs, in one place. Keeps pages from forgetting `pb-nav` and ending
 * up with the last row hidden behind the tab bar.
 */
export default function PageBody({
  children,
  withNav = true,
  bleed = false,
  className = "",
}: PageBodyProps) {
  return (
    <div
      className={`flex-1 ${bleed ? "" : "px-5"} ${
        withNav ? "pb-nav" : "pb-safe"
      } ${className}`}
    >
      {children}
    </div>
  );
}