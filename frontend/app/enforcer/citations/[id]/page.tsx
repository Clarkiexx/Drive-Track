"use client";

import { Suspense, use, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import CitationMap from "@/components/common/CitationMap";
import {
  EvidenceStrip,
  FineBox,
  InfoRow,
  ViolationsBox,
} from "@/components/common/CitationReceipt";
import { formatDateTimeManila, formatPeso } from "@/components/common/dates";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import useFocusRefresh from "@/components/common/useFocusRefresh";
import { getApiErrorMessage } from "@/lib/axios";
import { getMediaUrl } from "@/lib/media";
import { citationService, type CitationRecord } from "@/services/citation.service";

/**
 * Citation receipt (officer's copy) — the web port of
 * enforcer-app/src/screens/CitationSuccessScreen.js.
 *
 * WHY THIS ROUTE EXISTS. In the Expo app that screen did double duty: it was
 * the confirmation shown the instant a citation was filed AND the detail view
 * for anything already on file. On the web it had no home. The receipt that does
 * exist, /home/violations/[id], sits under `RoleGate allow="driver"`, so an
 * officer opening it was bounced straight back to /enforcer — and
 * /enforcer/previous had to render its rows as dead RecordCards because there
 * was genuinely nowhere to go. This route is under /enforcer, so RoleGate
 * allows it and the officer's own list can link here.
 *
 * TWO MODES, from `?justFiled=1`:
 *   - absent  — the detail view. AppBar "Citation Receipt", back to
 *               /enforcer/previous, which is where the officer came from.
 *   - "1"     — the confirmation, exactly as RN showed it a beat after
 *               submitting: the badge and the "CITATION ISSUED" / "WARNING
 *               ISSUED" headline, and a back arrow to /enforcer instead —
 *               never back into the wizard, which has already been filed and
 *               whose history entry the wizard's own router.replace() removed.
 * The `?justFiled=1` form is deliberately value-checked rather than merely
 * present: a bare `?justFiled` should not turn a receipt into a confirmation.
 *
 * The wizard still redirects to /enforcer/previous; app/enforcer/issue/page.tsx
 * is owned by another lane, so the one-line change that would send the officer
 * here instead is documented in the report rather than made here.
 *
 * PRISMA CONTRACT NOTE — the one real bug this port fixes. RN read
 * `citation.Driver` and `citation.Enforcer`. Those were the capitalised keys the
 * old Sequelize models exposed; the backend has been on Prisma since, and
 * `citationInclude` (backend/src/controllers/citationController.js) joins the
 * relations under their LOWERCASE names. Reading the capitalised keys resolves
 * to undefined, which is why the RN screen rendered "Officer undefined
 * undefined" on a record the backend had returned in full. Everything below
 * reads `citation.driver` / `citation.enforcer`, and a relation that really is
 * absent drops its rows rather than printing "undefined".
 */

type EnforcerCitationPageProps = {
  /** Next 16: dynamic params arrive as a promise, unwrapped with React.use(). */
  params: Promise<{ id: string }>;
};

export default function EnforcerCitationPage({ params }: EnforcerCitationPageProps) {
  return (
    <>
      {/* useSearchParams() bails the prerender out to the client, and the
          production build fails without a boundary above it. Same shape as
          app/enforcer/issue/page.tsx — and the AppBar moves inside the boundary
          with the rest of the screen because its title and back target both
          depend on ?justFiled. */}
      <Suspense fallback={<ReceiptSkeleton />}>
        <CitationScreen params={params} />
      </Suspense>

      <BottomNav />
    </>
  );
}

function CitationScreen({ params }: EnforcerCitationPageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();

  const justFiled = searchParams.get("justFiled") === "1";

  const [citation, setCitation] = useState<CitationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      setCitation(await citationService.getCitation(id));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load this citation."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  /**
   * A receipt is read, not watched, but the officer can leave it open while an
   * adjutant settles something elsewhere — and it costs one request. Same
   * stand-in for useFocusEffect the enforcer list uses.
   */
  useFocusRefresh(load);

  /**
   * RN called react-native's Share.share on the composed receipt text. The web
   * equivalent is the Web Share API, but it is absent on most desktop browsers
   * and refused outside a secure context — so the clipboard is the fallback
   * rather than a dead button.
   *
   * RN's catch was empty ("sharing cancelled or failed silently — not critical
   * to the flow") and that is preserved: a dismissed share sheet rejects with
   * AbortError, which returns silently rather than reporting a failure, and
   * deliberately does NOT fall through to the clipboard — cancelling the sheet
   * must not leave the officer's clipboard quietly overwritten.
   */
  async function handleShare() {
    if (!citation) return;

    const message = shareMessage(citation);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // Cancelled, or the sheet could not be opened. RN swallowed this too.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Receipt copied to clipboard.");
    } catch {
      // Clipboard permission refused, or navigator.clipboard is missing on an
      // insecure origin — there is no third fallback to offer.
      toast.error("Could not copy the receipt. Select and copy it manually.");
    }
  }

  return (
    <>
      <AppBar
        title={justFiled ? "Citation Issued" : "Citation Receipt"}
        backHref={justFiled ? "/enforcer" : "/enforcer/previous"}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh citation receipt"
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
          <ReceiptSkeletonCard />
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
            {/* A failed reload leaves the receipt already on screen rather than
                blanking a record the officer was mid-read on. */}
            {errorMessage ? (
              <NoticeBox tone="danger" className="mt-4 text-[13px]">
                {errorMessage}
              </NoticeBox>
            ) : null}

            <ReceiptCard citation={citation} justFiled={justFiled} />

            {/* RN's actionsRow — two equal halves, Share outlined on the left
                and the Dashboard fill on the right. */}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-hairline bg-surface py-3.5 text-[14px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken"
              >
                {/* The glyph is RN's own 🔗; hidden from assistive tech so the
                    button announces as "Share". */}
                <span aria-hidden>🔗</span> Share
              </button>

              {/* RN: navigation.reset({ index: 0, routes: [{ name: 'Home' }] }). */}
              <Link
                href="/enforcer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand-500 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-700"
              >
                <span aria-hidden>🏠</span> Dashboard
              </Link>
            </div>
          </>
        ) : null}
      </PageBody>
    </>
  );
}

type ReceiptCardProps = {
  citation: CitationRecord;
  /** Adds RN's post-submit badge and headline above the citation number. */
  justFiled: boolean;
};

/**
 * The receipt card, in CitationSuccessScreen's own order: the issued headline
 * (confirmation mode only), the record number, the driver's identity — which
 * the driver-side receipt has no reason to show, because that officer already
 * knows who they are — the violations, the fine, the incident details, who
 * signed it, and the photo evidence.
 */
function ReceiptCard({ citation, justFiled }: ReceiptCardProps) {
  const isWarning = citation.recordType === "warning";

  const violationDescriptions = (citation.violations ?? [])
    .map((entry) => entry.violationType?.description)
    .filter((description): description is string => Boolean(description));

  // LOWERCASE Prisma relations — see the contract note at the top of the file.
  const driver = citation.driver;
  const enforcer = citation.enforcer;

  const driverName = driver
    ? [driver.firstName, driver.lastName].filter(Boolean).join(" ")
    : "";
  const issuedBy = enforcer
    ? `Officer ${[enforcer.firstName, enforcer.lastName].filter(Boolean).join(" ")}`
    : "";
  // RN already defaulted the badge to an em dash; the station had no such guard
  // and printed "undefined". Same treatment here so no path shows a literal
  // "undefined" on a government record.
  const badgeLine = enforcer
    ? `Badge #${enforcer.badgeNumber || "—"} • ${enforcer.station || "—"}`
    : "";

  const evidence = (citation.evidence ?? [])
    .map((entry) => getMediaUrl(entry.imagePath))
    .filter((url) => url.length > 0)
    .map((url) => ({ url }));

  return (
    <article className="rise mt-5 rounded-[14px] border border-hairline bg-surface p-5 shadow-card">
      {justFiled ? (
        <div className="mb-4 flex flex-col items-center text-center">
          <span aria-hidden className="text-[26px] leading-none">
            {isWarning ? "🔶" : "⚠️"}
          </span>
          <h2
            className={`font-display mt-1.5 text-[18px] font-bold tracking-[0.08em] ${
              isWarning ? "text-signal-hold" : "text-signal-stop"
            }`}
          >
            {isWarning ? "WARNING ISSUED" : "CITATION ISSUED"}
          </h2>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        {isWarning ? "Warning Number" : "Citation Number"}
      </p>
      <h2 className="font-display tabular mt-0.5 text-[22px] leading-tight font-bold text-ink">
        {citation.citationNumber}
      </h2>

      <div aria-hidden className="my-4 h-px w-full bg-hairline" />

      {/* RN's two 👤 rows. Both drop out when the driver relation is missing —
          an absent relation must not print "undefined undefined". */}
      {driverName ? <InfoRow label="Driver Name" value={driverName} /> : null}
      {driver?.licenseNumber ? (
        <InfoRow label="License Number" value={driver.licenseNumber} />
      ) : null}

      <ViolationsBox
        violations={violationDescriptions}
        otherViolation={citation.otherViolation ?? undefined}
      />

      {/* Warnings carry no fine, so RN skipped the whole panel — not just its
          amount. */}
      {isWarning ? null : (
        <FineBox
          fineAmount={citation.fineAmount ?? 0}
          status={citation.settlementStatus}
          settlementLabel={settlementLabel(citation.settlementStatus)}
        />
      )}

      {/* RN used 📅 and 📍 emoji here; InfoRow carries the same two as icons.
          The 👤 and 🚗 rows have no equivalent in InfoRow's icon set, so they
          stay plain, matching the driver-side receipt. */}
      <InfoRow label="Date & Time" value={formatDateTimeManila(citation.occurredAt)} icon="calendar" />
      <InfoRow label="Location" value={citation.placeOfViolation} icon="map" />
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

      <div aria-hidden className="my-4 h-px w-full bg-hairline" />

      <p className="text-[11px] text-muted">Issued By</p>
      {issuedBy ? (
        <>
          <p className="mt-0.5 text-[15px] font-bold text-ink">{issuedBy}</p>
          <p className="mt-0.5 text-[12px] text-muted">{badgeLine}</p>
        </>
      ) : (
        <p className="mt-0.5 text-[14px] font-semibold text-ink">—</p>
      )}

      {/* EvidenceStrip renders its own "Photo Evidence" label. */}
      {evidence.length > 0 ? <EvidenceStrip photos={evidence} /> : null}
    </article>
  );
}

/**
 * The wording FineBox puts under the amount. RN's success screen had no status
 * line at all, but FineBox is the shared panel and renders one unconditionally,
 * so this mirrors the driver receipt's wording rather than inventing a fourth
 * spelling of the same three states.
 */
function settlementLabel(status: CitationRecord["settlementStatus"]): string {
  if (status === "settled") return "✅ Settled";
  if (status === "cancelled") return "Cancelled";
  return "⚠️ Unsettled";
}

/**
 * The exact text RN handed to Share.share:
 *
 *   DriveTrack Citation DRV-2025-0001
 *   Driver: Juan Dela Cruz
 *   Violations: No parking, Expired registration
 *   Fine: ₱1,000
 *
 * `otherViolation` is missing on purpose — RN built the line from the
 * violation-type rows only, and that omission is preserved rather than quietly
 * fixed. formatPeso stands in for RN's Number(x).toLocaleString(): identical
 * output under en-US, but pinned so the server and the client agree.
 */
function shareMessage(citation: CitationRecord): string {
  const isWarning = citation.recordType === "warning";
  const driver = citation.driver;

  const violationLines = (citation.violations ?? [])
    .map((entry) => entry.violationType?.description)
    .filter((description): description is string => Boolean(description));

  return [
    `DriveTrack ${isWarning ? "Warning" : "Citation"} ${citation.citationNumber}`,
    `Driver: ${[driver?.firstName, driver?.lastName].filter(Boolean).join(" ")}`,
    `Violations: ${violationLines.join(", ")}`,
    ...(isWarning ? [] : [`Fine: ${formatPeso(citation.fineAmount ?? 0)}`]),
  ].join("\n");
}

/** Suspense fallback while useSearchParams resolves; mirrors the card below. */
function ReceiptSkeleton() {
  return (
    <>
      <AppBar title="Citation Receipt" backHref="/enforcer/previous" />
      <PageBody>
        <ReceiptSkeletonCard />
      </PageBody>
    </>
  );
}

/** Placeholder card matching the receipt's silhouette. */
function ReceiptSkeletonCard() {
  return (
    <div aria-hidden className="mt-5 rounded-[14px] border border-hairline bg-surface p-5 shadow-card">
      <div className="breathe h-3 w-24 rounded-full bg-surface-sunken" />
      <div className="breathe mt-2 h-5 w-40 rounded-full bg-surface-sunken" />
      <div className="breathe mt-5 h-28 w-full rounded-[10px] bg-surface-sunken [animation-delay:120ms]" />
      <div className="breathe mt-3.5 h-32 w-full rounded-[10px] bg-surface-sunken" />
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