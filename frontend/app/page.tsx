"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { homeForRole } from "@/constants/roles";

/**
 * Entry point for DriveTrack. Decides where someone belongs and sends them
 * there; it never renders a screen of its own.
 */
export default function RootRedirect() {
  const router = useRouter();
  const { token, isLoading, user, mustChangePassword } = useAuth();

  const hasSession = Boolean(token);

  useEffect(() => {
    // Wait for the stored session to be read back before deciding, otherwise a
    // signed-in driver gets bounced to the login screen on a hard refresh.
    if (isLoading) return;

    if (!hasSession) {
      router.replace("/login");
      return;
    }

    // A driver who still owes a password change has to clear that first: the
    // backend refuses every other call while the flag is set, so sending them
    // to their home would just be a screen full of failed requests.
    if (mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    // homeForRole already handles an unknown role by falling back to /home,
    // which matches what the proxy and the login flow do.
    router.replace(homeForRole(user?.role));
  }, [isLoading, hasSession, mustChangePassword, user, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16">
      <div className="flex flex-col items-center">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lift">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-8 text-white">
            <path
              d="M9.6 4.6h4.8l3.1 14.8H6.5L9.6 4.6Z"
              fill="currentColor"
              fillOpacity="0.95"
            />
            <path
              d="M11.62 7.4h.76l.26 2.1h-1.28l.26-2.1Zm.5 4.3h1.02l.32 2.6h-1.66l.32-2.6Zm.52 4.9h1.3l.2 1.6h-1.7l.2-1.6Z"
              fill="#D97706"
            />
          </svg>
        </div>

        <p className="font-display mt-6 text-2xl font-semibold tracking-tight text-ink">
          DriveTrack
        </p>
        <p className="mt-1.5 text-center text-sm text-muted">
          {isLoading ? "Checking your session" : "Taking you to your dashboard"}
        </p>
      </div>

      <div className="mt-7 h-[3px] w-40 overflow-hidden rounded-full bg-surface-sunken">
        <div className="breathe h-full w-full origin-left rounded-full bg-brand-500" />
      </div>
    </div>
  );
}