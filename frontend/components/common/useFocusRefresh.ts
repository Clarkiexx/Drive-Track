"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The App Router's stand-in for React Navigation's `useFocusEffect`.
 *
 * WHY this exists: every screen ported from the Expo apps refreshed its data
 * when the driver/officer came back to it — settling a citation in a hosted
 * checkout tab, reading notifications, finishing a payment. `useFocusEffect`
 * has no equivalent here: the App Router keeps a screen mounted while you
 * navigate away from it, so there is no focus event to hook.
 *
 * Two browser signals cover the cases that matter:
 *   - `focus` on window — covers returning from another tab, which is exactly
 *     the hosted-checkout case: Xendit opens in a new tab, and closing it
 *     refocuses this one.
 *   - `visibilitychange` — covers switching apps on a phone and coming back.
 *
 * `skipRefreshing` lets a screen hold the current data while a refresh is in
 * flight (e.g. a list the user is mid-read), instead of flashing a skeleton.
 *
 * The initial load is deferred by one tick rather than run inside the effect
 * body, because it commits state synchronously and the first client render has
 * to match what the server produced (`react-hooks/set-state-in-effect`).
 */
export default function useFocusRefresh<T>(
  load: () => Promise<T> | T,
  options: { skipRefreshing?: boolean } = {}
): void {
  const { skipRefreshing = false } = options;

  // Kept in an Effect rather than assigned during render, so a re-created
  // `load` closure doesn't re-subscribe the listeners on every render of the
  // caller. The ref write lives in its own effect, which React runs after the
  // commit — never while rendering.
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const run = useCallback(() => {
    void loadRef.current();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(run, 0);
    return () => window.clearTimeout(timer);
  }, [run]);

  useEffect(() => {
    if (skipRefreshing) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run, skipRefreshing]);
}