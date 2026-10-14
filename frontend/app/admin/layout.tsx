"use client";

import { useEffect, useState, type ReactNode } from "react";

import AdminSidebar from "@/components/common/AdminSidebar";
import AdminTopbar from "@/components/common/AdminTopbar";
import RoleGate from "@/components/common/RoleGate";

/**
 * The admin console shell: rail on the left, top bar across the top, and a
 * content column that never gets narrower than a phone screen.
 *
 * Client-side only because the rail is a drawer below the large breakpoint and
 * needs to close itself when a section is picked. The pages inside stay server
 * components — they arrive here as `children`.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  // Escape closes the drawer, the way a drawer is expected to behave.
  useEffect(() => {
    if (!navOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <RoleGate allow="admin">
    <div className="desk-canvas min-h-dvh">
      <AdminSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Tap-anywhere scrim for the drawer; the rail itself is inert while it
          covers the page. */}
      {navOpen ? (
        <button
          type="button"
          aria-label="Close console sections"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[17.5rem]">
        <AdminTopbar onToggleNav={() => setNavOpen((open) => !open)} />

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
    </RoleGate>
  );
}