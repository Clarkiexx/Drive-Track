"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCw } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import CitationMap from "@/components/common/CitationMap";
import {
  EvidenceStrip,
  FineBox,
  InfoRow,
  ViolationsBox,
} from "@/components/common/CitationReceipt";
import { formatDateTimeManila } from "@/components/common/dates";
import axios from "axios";
import { getApiErrorMessage } from "@/lib/axios";
import { getMediaUrl } from "@/lib/media";
import { citationService, type CitationRecord } from "@/services/citation.service";
import { paymentService } from "@/services/payment.service";

type ViolationDetailPageProps = {
  /** Next 16: dynamic params arrive as a promise, unwrapped with React.use(). */
  params: Promise<{ id: string }>;
};

/** Name of the single Xendit checkout tab (shared across reloads). */
const CHECKOUT_WINDOW_NAME = "drivetrack-xendit-checkout";

/** localStorage prefix for the live checkout session, keyed by citation id. */
const CHECKOUT_STORAGE_PREFIX = "drivetrack:checkout:";

type StoredCheckout = { url: string; expiresAt: number };

/**
 * Reads the live checkout session for a citation, surviving reloads and
 * revisits. Returns null when absent, malformed, or expired (expired entries
 * are removed so they can never be re-opened).
 */
function readStoredCheckout(citationId: string | number): StoredCheckout | null {
  try {
    const raw = window.localStorage.getItem(`${CHECKOUT_STORAGE_PREFIX}${citationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: unknown; expiresAt?: unknown };
    if (typeof parsed.url !== "string" || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(`${CHECKOUT_STORAGE_PREFIX}${citationId}`);
      return null;
    }
    return { url: parsed.url, expiresAt: parsed.expiresAt };
  } catch {
    // Storage unavailable (private mode) or corrupt entry — in-memory state
    // is enough for the single-visit case.
    return null;
  }
}

/** Persists the live checkout session (best-effort; failures are ignored). */
function writeStoredCheckout(citationId: string | number, checkout: StoredCheckout) {
  try {
    window.localStorage.setItem(`${CHECKOUT_STORAGE_PREFIX}${citationId}`, JSON.stringify(checkout));
  } catch {
    // Ignore — the in-memory copy still dedupes within this visit.
  }
}

/** Drops a finished/stale checkout so it can never be re-opened. */
function removeStoredCheckout(citationId: string | number) {
  try {
    window.localStorage.removeItem(`${CHECKOUT_STORAGE_PREFIX}${citationId}`);
  } catch {
    // Storage unavailable (private mode) — in-memory state is enough.
  }
}

/** True when the backend says another request is already creating the session. */
function isSessionBeingCreated(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return false;
  const message = (error.response.data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.toLowerCase().includes("already being created");
}

export default function ViolationDetailPage({ params }: ViolationDetailPageProps) {
  const { id } = use(params);

  const [citation, setCitation] = useState<CitationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [payNotice, setPayNotice] = useState("");
  const [sessionOpened, setSessionOpened] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState<"success" | "cancelled" | null>(null);
  /**
   * The live Xendit checkout for this citation. Reused while unexpired so
   * repeat taps re-open the SAME link instead of spawning duplicate tabs.
   */
  const [activeCheckout, setActiveCheckout] = useState<{ url: string; expiresAt: number } | null>(null);
  /**
   * Handle of the opened checkout tab (same page lifetime only). When it is
   * still open we focus it instead of opening another tab.
   */
  const checkoutTabRef = useRef<Window | null>(null);
  /** Synchronous guard: React state updates are async, so double taps could
   *  otherwise start two checkout requests before `isPaying` renders. */
  const payingRef = useRef(false);
  /** One authoritative status check when Xendit sends the driver back. */
  const returnReconcileRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const record = await citationService.getCitation(id);
      setCitation(record);
      if (record.settlementStatus !== "pending") {
        // Settled/cancelled: the stored link is done — drop it so a stale
        // URL can never be re-opened.
        removeStoredCheckout(id);
        checkoutTabRef.current = null;
        setActiveCheckout(null);
        setSessionOpened(false);
        setPayNotice("");
      } else {
        // The server is the source of truth for an unfinished session. This
        // survives a cleared localStorage, a different device, or a slow
        // network that lost the original response. localStorage remains a
        // fallback only when the server cannot be reached.
        let serverReachable = false;
        let serverCheckout: StoredCheckout | null = null;
        try {
          const active = await paymentService.getActiveCheckout(id);
          serverReachable = true;
          if (active.active && active.checkoutUrl && active.expiresAt) {
            const parsed = Date.parse(active.expiresAt);
            if (Number.isFinite(parsed) && parsed > Date.now()) {
              serverCheckout = { url: active.checkoutUrl, expiresAt: parsed };
            }
          }
        } catch {
          // Slow/offline — fall back to the locally stored link below.
        }

        const stored = readStoredCheckout(id);
        const next = serverReachable ? serverCheckout : stored;
        setActiveCheckout(next);
        if (next) writeStoredCheckout(id, next);
        else removeStoredCheckout(id);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load this record."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Deferred rather than run in the effect body: the token only exists in the
    // browser, and this keeps the first render identical on both sides.
    const timer = window.setTimeout(() => {
      const status = new URLSearchParams(window.location.search).get("payment");
      if (status === "success" || status === "cancelled") setPaymentReturn(status);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    // Returning from Xendit with ?payment=success means the webhook may still
    // be in flight. Render the receipt first, then ask the status endpoint once
    // so a completed payment flips to Settled without a manual refresh. This
    // is deliberately non-blocking: a slow Xendit must not hide the receipt.
    if (
      paymentReturn !== "success" ||
      !citation ||
      citation.settlementStatus !== "pending" ||
      isLoading ||
      returnReconcileRef.current
    ) {
      return;
    }
    returnReconcileRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const status = await paymentService.getStatus(id);
        if (!cancelled && status.settled) await load();
      } catch {
        // The webhook or the refresh button remains authoritative.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentReturn, citation, id, isLoading, load]);

  useEffect(() => {
    // The driver coming back from hosted checkout regains tab focus here.
    // Re-verify against Xendit (covers webhook outage/delay) and reload, so a
    // completed payment flips to Settled without waiting for the webhook.
    if (!sessionOpened && !activeCheckout) return;
    const reconcile = () => {
      void (async () => {
        try {
          await paymentService.getStatus(id);
        } catch {
          // Transport failure — the reload below still refreshes from our DB.
        }
        await load();
      })();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionOpened, activeCheckout, id, load]);

  /** Exact driver-facing notice when online checkout is unconfigured. */
  const ONLINE_PAYMENTS_UNCONFIGURED_MESSAGE =
    "Online payments are currently unconfigured. Please pay at the CTMO office.";

  /**
   * The backend answers 503 "Online payments are not configured…" when Xendit
   * is off. That throw happens before any tab opens, so nothing redirects —
   * this only swaps in the approved wording. All other pay errors pass
   * through unchanged (validation, throttle, settled states).
   */
  function isPaymentsUnconfigured(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 503) return true;
      const message = (error.response?.data as { message?: unknown } | undefined)
        ?.message;
      if (typeof message === "string" && message.toLowerCase().includes("not configured")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Opens a checkout URL with exactly one tab. An already-open tab from this
   * page lifetime is focused without reloading (in-progress input is kept);
   * otherwise the shared named tab is reused — the browser navigates the
   * existing tab instead of opening another, even across reloads. Only when
   * the browser blocks the popup entirely do we navigate this tab instead.
   */
  function openCheckout(url: string, reuse: boolean) {
    const existing = checkoutTabRef.current;
    if (reuse && existing && !existing.closed) {
      existing.focus();
      return;
    }
    // Named target: reuses the checkout tab from an earlier tap (possibly
    // from before a reload) instead of spawning a duplicate.
    const named = window.open(url, CHECKOUT_WINDOW_NAME);
    if (named) {
      checkoutTabRef.current = named;
      try {
        named.focus();
      } catch {
        // Focus is best-effort (background tabs); the single tab holds.
      }
      return;
    }
    if (!reuse) {
      // Fresh session but the popup was blocked: hand the navigation to this
      // tab instead of leaving the driver with nothing happening. Never do
      // this on reuse — the checkout tab already exists.
      window.location.assign(url);
    }
  }

  async function handlePayNow() {
    if (payingRef.current || isPaying) return;

    // The cached link is only a fallback for a server/network failure. Every
    // normal tap asks the backend first: it is the authority on whether the
    // citation is still payable and whether an unfinished session exists.
    const storedFallback =
      activeCheckout && activeCheckout.expiresAt > Date.now() ? activeCheckout : null;
    if (activeCheckout && !storedFallback) {
      setActiveCheckout(null);
      removeStoredCheckout(id);
    }

    payingRef.current = true;
    setIsPaying(true);
    setPayError("");
    setPayNotice("");

    const startCheckout = async () => {
      try {
        return await paymentService.createCheckout(id);
      } catch (error) {
        if (!isSessionBeingCreated(error)) throw error;
        // Another tab/device won the creation race. Wait for it to persist
        // its session, then retrieve that same session instead of creating
        // a second one. One retry only.
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        return paymentService.createCheckout(id);
      }
    };

    try {
      const { checkoutUrl, expiresAt, resumed } = await startCheckout();

      // Hosted Xendit checkout, replacing expo-web-browser's
      // openBrowserAsync. Returning from the tab never settles anything on its
      // own — settlement only arrives via the verified server webhook, which is
      // why the reload below can still show "pending".
      const parsedExpiry = expiresAt ? Date.parse(expiresAt) : NaN;
      const checkout = {
        url: checkoutUrl,
        expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 30 * 60 * 1000,
      };
      setActiveCheckout(checkout);
      writeStoredCheckout(id, checkout);
      if (resumed) {
        setPayNotice("Resumed your unfinished payment — no new payment was created.");
      }
      const reuseExistingTab = Boolean(
        resumed && checkoutTabRef.current && !checkoutTabRef.current.closed
      );
      openCheckout(checkoutUrl, reuseExistingTab);

      setSessionOpened(true);
    } catch (error) {
      // If the backend is unreachable or temporarily failing, the already
      // issued Xendit link is still the best available option. Never fall
      // back on a 4xx (settled/cancelled/unauthorized): those mean the link
      // must not be used.
      const serverUnavailable =
        !axios.isAxiosError(error) ||
        !error.response ||
        error.response.status >= 500;
      if (storedFallback && serverUnavailable) {
        setSessionOpened(true);
        setPayNotice("Could not reach the server. Opening your saved payment session.");
        openCheckout(
          storedFallback.url,
          Boolean(checkoutTabRef.current && !checkoutTabRef.current.closed)
        );
        return;
      }
      setPayError(
        isPaymentsUnconfigured(error)
          ? ONLINE_PAYMENTS_UNCONFIGURED_MESSAGE
          : getApiErrorMessage(error, "Unable to start payment.")
      );
    } finally {
      payingRef.current = false;
      setIsPaying(false);
      // Reload so a session created by a concurrent request (or a payment
      // completed in the checkout tab) is reflected immediately.
      void load();
    }
  }

  return (
    <>
      <AppBar
        title="Citation Receipt"
        backHref="/home/violations"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh citation status"
            className="grid size-9 place-items-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-60"
          >
            <RotateCw
              size={18}
              strokeWidth={2.2}
              aria-hidden
              className={isLoading ? "animate-spin" : undefined}
            />
          </button>
        }
      />

      <PageBody>
        {isLoading && !citation ? (
          <SkeletonReceipt />
        ) : errorMessage && !citation ? (
          <div className="mt-4 space-y-3">
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage}
            </NoticeBox>
            <button
              type="button"
              onClick={() => void load()}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-surface py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
            >
              <RotateCw size={16} strokeWidth={2.2} aria-hidden />
              Retry
            </button>
          </div>
        ) : citation ? (
          <>
            {/* A failed reload leaves the last good receipt on screen rather than
                blanking a record the driver was already reading. */}
            {errorMessage ? (
              <NoticeBox tone="danger" className="mt-4 text-[13px]">
                {errorMessage}
              </NoticeBox>
            ) : null}
            {paymentReturn ? (
              <div className="mt-4 space-y-3">
                <NoticeBox
                  tone={
                    citation.settlementStatus === "settled"
                      ? "success"
                      : paymentReturn === "success"
                        ? "info"
                        : "warn"
                  }
                  className="text-[13px]"
                >
                  {citation.settlementStatus === "settled"
                    ? "Payment confirmed. This citation is settled."
                    : paymentReturn === "success"
                      ? "Payment submitted. We're confirming it with Xendit; the status below updates automatically."
                      : "Payment cancelled. No payment was taken; this citation is still pending."}
                </NoticeBox>
                <Link
                  href="/home/violations"
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-surface py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
                >
                  <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
                  Back to My Violations
                </Link>
              </div>
            ) : null}
            <Receipt
              citation={citation}
              isPaying={isPaying}
              payError={payError}
              payNotice={payNotice}
              canResume={Boolean(activeCheckout)}
              awaitingConfirmation={
                sessionOpened && citation.settlementStatus === "pending" && !isPaying && !payError
              }
              onPay={handlePayNow}
            />
          </>
        ) : null}
      </PageBody>
    </>
  );
}

type ReceiptProps = {
  citation: CitationRecord;
  isPaying: boolean;
  payError: string;
  payNotice: string;
  canResume: boolean;
  awaitingConfirmation: boolean;
  onPay: () => void;
};

/** The receipt card, laid out in the same order as ViolationDetailScreen. */
function Receipt({
  citation,
  isPaying,
  payError,
  payNotice,
  canResume,
  awaitingConfirmation,
  onPay,
}: ReceiptProps) {
  const violationDescriptions = (citation.violations ?? [])
    .map((entry) => entry.violationType?.description)
    .filter((description): description is string => Boolean(description));

  const settlementLabel =
    citation.settlementStatus === "settled"
      ? "✅ Settled"
      : citation.settlementStatus === "cancelled"
        ? "Cancelled"
        : "⚠️ Unsettled";

  // Prisma returns the relation under its LOWERCASE key; the old Sequelize
  // capitalised `Enforcer` no longer exists, and reading it would render
  // "Officer undefined undefined" on a record the backend did return.
  const enforcer = citation.enforcer;
  const issuedBy = enforcer
    ? `Officer ${[enforcer.firstName, enforcer.lastName].filter(Boolean).join(" ")}`
    : "";

  const evidence = (citation.evidence ?? []).map((entry) => ({
    url: getMediaUrl(entry.imagePath),
  }));

  return (
    <article className="rise mt-5 rounded-[14px] border border-hairline bg-surface p-5 shadow-card">
      <h2 className="font-display tabular text-[20px] leading-tight font-bold text-ink">
        {citation.citationNumber}
      </h2>

      <ViolationsBox
        violations={violationDescriptions}
        otherViolation={citation.otherViolation ?? undefined}
      />

      {/* Warning records carry no fine, so RN skipped the whole panel. */}
      {citation.recordType === "warning" ? null : (
        <FineBox
          fineAmount={citation.fineAmount ?? 0}
          status={citation.settlementStatus}
          settlementLabel={settlementLabel}
          paymentMethod={citation.paymentMethod}
          paymentReference={citation.paymentReference}
          pendingNote={
            awaitingConfirmation
              ? "Payment submitted — awaiting confirmation. Bank transfers may take a while."
              : undefined
          }
          action={
            citation.settlementStatus === "pending" ? (
              <div className="space-y-2">
                {canResume && !payNotice ? (
                  <p className="text-[11px] leading-snug text-center text-muted">
                    Your previous payment session is still open and will be reused.
                  </p>
                ) : null}
                {payNotice ? (
                  <NoticeBox tone="info" className="text-left">
                    {payNotice}
                  </NoticeBox>
                ) : null}
                <button
                  type="button"
                  onClick={onPay}
                  disabled={isPaying}
                  className="w-full rounded-[10px] bg-brand-500 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                >
                  {isPaying ? "Starting payment…" : canResume ? "↗ Resume payment" : "💳 Pay Now"}
                </button>
                {payError ? (
                  <p className="text-[12px] leading-snug text-center text-signal-stop">{payError}</p>
                ) : null}
              </div>
            ) : undefined
          }
        />
      )}

      <InfoRow label="Date & Time" value={formatDateTimeManila(citation.occurredAt)} />
      <InfoRow label="Location" value={citation.placeOfViolation} />
      <CitationMap
        latitude={citation.latitude}
        longitude={citation.longitude}
        place={citation.placeOfViolation}
        height={220}
        className="mt-2.5"
      />
      {citation.plateNumber ? (
        <InfoRow label="Plate Number" value={citation.plateNumber} />
      ) : null}
      {citation.vehicleUnitType ? (
        <InfoRow label="Vehicle Unit" value={citation.vehicleUnitType} />
      ) : null}
      {citation.registeredOwner ? (
        <InfoRow label="Registered Owner" value={citation.registeredOwner} />
      ) : null}
      {issuedBy ? <InfoRow label="Issued By" value={issuedBy} /> : null}

      {/* EvidenceStrip renders its own "Photo Evidence" label. */}
      {evidence.length > 0 ? <EvidenceStrip photos={evidence} /> : null}
    </article>
  );
}

/** Placeholder card matching the receipt's silhouette. */
function SkeletonReceipt() {
  return (
    <div aria-hidden className="mt-5 rounded-[14px] border border-hairline bg-surface p-5 shadow-card">
      <div className="breathe h-5 w-40 rounded-full bg-surface-sunken" />
      <div className="breathe mt-5 h-28 w-full rounded-[10px] bg-surface-sunken" />
      <div className="breathe mt-3.5 h-32 w-full rounded-[10px] bg-surface-sunken [animation-delay:120ms]" />
      <div className="mt-5 space-y-4">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="space-y-1.5">
            <div className="breathe h-2.5 w-16 rounded-full bg-surface-sunken" />
            <div
              className="breathe h-3.5 w-40 rounded-full bg-surface-sunken"
              style={{ animationDelay: `${row * 90 + 60}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}