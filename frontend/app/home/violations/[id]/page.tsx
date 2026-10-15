"use client";

import { use, useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
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

export default function ViolationDetailPage({ params }: ViolationDetailPageProps) {
  const { id } = use(params);

  const [citation, setCitation] = useState<CitationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [sessionOpened, setSessionOpened] = useState(false);
  /**
   * The live Xendit checkout for this citation. Reused while unexpired so
   * repeat taps re-open the SAME link instead of spawning duplicate tabs.
   */
  const [activeCheckout, setActiveCheckout] = useState<{ url: string; expiresAt: number } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const record = await citationService.getCitation(id);
      setCitation(record);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load this record."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Deferred rather than run in the effect body: the token only exists in the
    // browser, and this keeps the first render identical on both sides.
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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
   * Opens a checkout URL in a new tab, falling back to same-tab navigation
   * when the browser blocks the popup.
   */
  function openCheckout(url: string) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    // A null handle means the browser blocked the popup. Hand the navigation
    // to this tab instead of leaving the driver with nothing happening.
    if (!opened) {
      window.location.assign(url);
    }
  }

  async function handlePayNow() {
    if (isPaying) return;

    // One Xendit link per citation: while the stored session is still live
    // (backend expiry is 30 minutes), re-open it instead of creating another.
    if (activeCheckout && activeCheckout.expiresAt > Date.now()) {
      openCheckout(activeCheckout.url);
      return;
    }
    if (activeCheckout) setActiveCheckout(null);

    setIsPaying(true);
    setPayError("");

    try {
      const { checkoutUrl, expiresAt } = await paymentService.createCheckout(id);

      // Hosted Xendit checkout, replacing expo-web-browser's
      // openBrowserAsync. Returning from the tab never settles anything on its
      // own — settlement only arrives via the verified server webhook, which is
      // why the reload below can still show "pending".
      const parsedExpiry = expiresAt ? Date.parse(expiresAt) : NaN;
      setActiveCheckout({
        url: checkoutUrl,
        expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 30 * 60 * 1000,
      });
      openCheckout(checkoutUrl);

      setSessionOpened(true);
    } catch (error) {
      setPayError(
        isPaymentsUnconfigured(error)
          ? ONLINE_PAYMENTS_UNCONFIGURED_MESSAGE
          : getApiErrorMessage(error, "Unable to start payment.")
      );
    } finally {
      setIsPaying(false);
      // RN reloaded here too, so a payment that completed in the checkout tab
      // is reflected as soon as the driver comes back.
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
            <Receipt
              citation={citation}
              isPaying={isPaying}
              payError={payError}
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
  canResume: boolean;
  awaitingConfirmation: boolean;
  onPay: () => void;
};

/** The receipt card, laid out in the same order as ViolationDetailScreen. */
function Receipt({ citation, isPaying, payError, canResume, awaitingConfirmation, onPay }: ReceiptProps) {
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