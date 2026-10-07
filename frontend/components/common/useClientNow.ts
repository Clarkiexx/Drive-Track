"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, but only after hydration.
 *
 * Several screens need to reason about "today" — a due date inside three days,
 * an overdue citation — and that answer must never be baked into the server
 * HTML, because the server's clock and the visitor's are different. Rendering
 * with a real timestamp on the server produces markup the client immediately
 * disagrees with.
 *
 * getServerSnapshot returns null, so the first paint agrees on both sides.
 * React swaps in the real time on the first render after hydration.
 *
 * The snapshot is cached because getSnapshot has to return a stable value;
 * calling Date.now() straight from it would change every read and put React in
 * a re-render loop.
 */

let cached: number | null = null;

function subscribe() {
  // The clock is not something this app subscribes to; a page that needs a
  // ticking timer should own its own interval.
  return () => undefined;
}

function getSnapshot() {
  cached ??= Date.now();
  return cached;
}

function getServerSnapshot(): null {
  return null;
}

export default function useClientNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}