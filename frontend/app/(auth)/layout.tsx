"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import BrandMark from "@/components/common/BrandMark";
import type { Role } from "@/constants/roles";

type AuthPortalValue = {
  role: Role;
  setRole: (role: Role) => void;
};

const AuthPortalContext = createContext<AuthPortalValue | null>(null);

/**
 * The account type the sign-in card is currently showing.
 *
 * It lives here rather than in LoginForm because the *frame* is the thing that
 * has to answer "office console or phone product?", and a child cannot hand
 * state up to its layout. Only /login writes to it — register, forgot-password
 * and change-password are driver flows and never read it, so they keep the
 * plain frame.
 */
export function useAuthPortal(): AuthPortalValue {
  const portal = useContext(AuthPortalContext);

  // Every screen in this route group renders inside the provider below, so a
  // miss means the hook was used somewhere it cannot work. Better that than a
  // silent default quietly dressing the wrong screen.
  if (!portal) throw new Error("useAuthPortal must be read inside the (auth) layout.");

  return portal;
}

/**
 * The rail an administrator signs in through: the same dark panel, sweep rings,
 * grain, brand lockup and painted centre line AdminSidebar carries, so the
 * office they are about to enter is already on screen behind the form.
 *
 * Painted as an absolutely positioned layer rather than laid out, because the
 * card is centred in the same box either way — flipping the portal must change
 * the room the card sits in, never the card's position inside it.
 */
function ConsoleRail({ visible }: { visible: boolean }) {
  return (
    <div
      className={`absolute inset-y-0 left-0 hidden w-80 overflow-hidden bg-console-rail text-white shadow-console-rail pt-safe transition-[opacity,visibility] duration-300 ease-out lg:block xl:w-96 ${
        visible ? "opacity-100" : "invisible opacity-0"
      }`}
    >
      {/* Depth, built from the same four cheap layers as the real rail. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full border border-white/8"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-4 size-40 rounded-full border border-white/8"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_-15%,rgb(255_255_255/0.12),transparent_58%)]"
      />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.05]" />

      {/* The road glyph, oversized and barely there, so a full-height dark
          panel is a mark rather than a void. The fade lives on the wrapper
          rather than on a text colour because BrandMark paints its centre-line
          dashes in a fixed amber that a colour utility cannot touch. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]">
        <BrandMark className="absolute top-1/2 left-1/2 size-64 -translate-x-1/2 -translate-y-1/2 text-white" />
      </div>

      {/* Brand block, verbatim from AdminSidebar: one lockup, one drawing. */}
      <div className="relative flex items-center gap-3 px-5 pt-6 pb-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 ring-inset">
          <BrandMark className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[18px] leading-none font-semibold tracking-tight text-white">
            DriveTrack
          </p>
          <p className="mt-1 text-[11px] leading-none font-medium text-brand-100/70">
            CTMO Admin Console
          </p>
        </div>
      </div>

      {/* The painted centre line, same seam as the phone brand band. */}
      <div aria-hidden className="road-line h-[2px] w-full shrink-0 opacity-60" />
    </div>
  );
}

/**
 * Shared frame for the signed-out screens.
 *
 * Two compositions from one DOM. Below lg it is exactly what it has always
 * been: the tall brand hero with sweep rings and a road seam, the card pulled up
 * 32px to overlap it, in a 390px column. At lg it becomes a desk composition —
 * and which desk depends on the portal picked on the card, because an
 * administrator signing in through a phone column is the mismatch this fixes.
 *
 * The desktop layer is `position: fixed` on purpose: AppShell wraps every
 * non-admin route in a `max-w-md` column at every width, so this is the only
 * way the sign-in screen can fill a laptop. No ancestor between here and the
 * root is transformed, so it resolves against the viewport.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role>("driver");

  // Only /login has a portal switcher. Gating on the path means walking on to
  // /register — or any sibling — drops back to the plain frame instead of
  // inheriting the console, since this layout's state survives navigation
  // inside the route group.
  const isConsole = pathname === "/login" && role === "admin";

  return (
    <AuthPortalContext.Provider value={{ role, setRole }}>
      <div className="relative flex min-h-dvh flex-col bg-canvas">
        {/* The inner box is the positioned frame for every desk layer, so they
            are painted over the full height even when the card is tall enough
            to scroll (the register form).

            The desk layers are absolutely positioned inside it and the page
            scrolls normally — no position:fixed escape hatch. AppShell drops
            the phone frame for these routes at lg and above (see isAuthPath),
            which is what lets this box actually be full width there. */}
        <div className="relative flex min-h-dvh flex-col">
          {/* Desk canvas, driver and enforcer: the phone product's own canvas
              with one soft light source under the masthead, so the wide field
              has a direction instead of reading as dead grey. */}
          <div
            className={`absolute inset-0 hidden bg-canvas bg-[radial-gradient(75%_45%_at_50%_-8%,rgb(46_125_50/0.08),transparent_62%)] transition-[opacity,visibility] duration-300 ease-out lg:block ${
              isConsole ? "invisible opacity-0" : "opacity-100"
            }`}
          />

          {/* Desk canvas, admin: the console's own sheet — green cast, graph
              rules, office light. Signing in lands on the surface it promises. */}
          <div
            className={`desk-canvas absolute inset-0 hidden transition-[opacity,visibility] duration-300 ease-out lg:block ${
              isConsole ? "opacity-100" : "invisible opacity-0"
            }`}
          />

          {/* Same mark at room scale under the driver/enforcer card, faded on
              an inner box so the fade cannot collide with the visibility
              toggle, and so the amber centre line fades with the carriageway. */}
          <div
            className={`pointer-events-none absolute inset-0 hidden transition-[opacity,visibility] duration-300 ease-out lg:block ${
              isConsole ? "invisible opacity-0" : "opacity-100"
            }`}
          >
            <div aria-hidden className="absolute inset-0 opacity-[0.08]">
              <BrandMark className="absolute top-1/2 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 text-brand-500" />
            </div>
          </div>

          <ConsoleRail visible={isConsole} />

          {/* The brand band: a tall centred hero on a phone, and a slim
              horizontal masthead on a desk — same marks, same gradient, laid
              out along the axis the viewport has to spare. */}
          <div
            className={`brand-band relative isolate overflow-hidden pt-safe lg:absolute lg:inset-x-0 lg:top-0 lg:z-0 ${
              isConsole ? "lg:hidden" : ""
            }`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full border border-white/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 -right-8 size-44 rounded-full border border-white/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_-15%,rgb(255_255_255/0.22),transparent_58%)]"
            />
            <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.045]" />

            <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pt-10 pb-12 lg:max-w-5xl lg:flex-row lg:justify-center lg:gap-4 lg:px-10 lg:pt-7 lg:pb-8 xl:px-14">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/12 text-white ring-2 ring-white/90 lg:size-10">
                <BrandMark className="size-7 lg:size-5" />
              </span>
              <p className="font-display mt-3 text-[26px] leading-none font-semibold tracking-tight text-white lg:mt-0 lg:text-[20px]">
                DriveTrack
              </p>
              <p className="mt-2 text-[13px] text-brand-100/80 lg:mt-0 lg:text-[12.5px]">
                City Traffic Management Office
              </p>
            </div>

            <div aria-hidden className="road-line relative h-[2px] w-full opacity-70" />
          </div>

          {/* The card each screen renders pulls itself up into this gap. On a
              desk the same column centres instead, and steps aside by half the
              rail so the card sits in the middle of the canvas rather than of
              the window. */}
          <div
            className={`relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 transition-[translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:max-w-[26rem] lg:justify-center lg:px-6 lg:pt-8 lg:pb-12 ${
              // Half the rail, so the card sits in the middle of the canvas
              // rather than of the window. Both states carry an explicit
              // translate: `none` cannot be interpolated, so without the zero
              // the first flip would snap instead of sliding.
              isConsole ? "lg:translate-x-40 xl:translate-x-48" : "lg:translate-x-0"
            }`}
          >
            {/* `lg:pt-8` cancels the card's own -mt-8 overlap, which is a move
                that only means something under a band: it keeps the wrapper
                exactly the height of the card, so centring the wrapper centres
                the card on both layouts. (The column's own `lg:pt-8` buys the
                long register form some clearance instead — a form taller than
                the window starts below the fold instead of at the pixel 0.) */}
            <div className="relative w-full lg:pt-8">
              {isConsole ? (
                <div className="absolute inset-x-0 bottom-full mb-6 hidden items-center justify-center gap-3 lg:flex">
                  <p className="text-[10.5px] leading-none font-bold tracking-[0.18em] text-brand-600 uppercase">
                    Admin console
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-soft px-2.5 py-1 text-[11.5px] leading-none font-bold text-brand-700">
                    <BadgeCheck size={13} strokeWidth={2.6} aria-hidden />
                    Administrator
                  </span>
                </div>
              ) : null}

              {children}
            </div>
          </div>
        </div>
      </div>
    </AuthPortalContext.Provider>
  );
}
