"use client";

import { CreditCard, LogOut, MapPin, Phone, type LucideIcon } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import PageBody from "@/components/common/PageBody";
import type { VerificationStatus } from "@/constants/violations";
import type { AuthUser } from "@/services/auth.service";

/**
 * The four fields ProfileScreen reads off the stored driver that AuthUser does
 * not carry yet: the licence number, the two optional contact rows and the
 * reason CTMO gave when it flagged or revoked an account. They are read
 * defensively so the rows simply disappear (rather than printing blanks) if the
 * shape ever lacks them, and so widening AuthUser lights the screen up without
 * touching this file.
 */
type ProfileDetails = {
  licenseNumber?: string | null;
  address?: string | null;
  contactNumber?: string | null;
  statusReason?: string | null;
};

type StatusMeta = {
  label: string;
  /** Pill fill + text, translated from the RN screen's hardcoded hexes. */
  chip: string;
  hint: string | null;
};

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const details = (user as (AuthUser & ProfileDetails) | null) ?? null;
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const status = user?.verificationStatus ?? "pending";

  // "MV" for Maria Villanueva — RN builds it from the two initials.
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  /**
   * RN's statusMeta map, verbatim in copy. Fills come from the token set:
   * pending and verified map exactly (#FEF3C7 / #DCFCE7), while flagged, revoked
   * and suspended get the nearest warm/red tokens available (RN's #FFEDD5 and
   * #FEE2E2 have no counterpart in globals.css).
   */
  const STATUS_META: Record<VerificationStatus, StatusMeta> = {
    pending: {
      label: "Pending Review",
      chip: "bg-warn-soft text-warn-ink",
      hint: "Your license photo is under review. Full access unlocks after verification.",
    },
    verified: { label: "✓ Verified", chip: "bg-go-soft text-brand-700", hint: null },
    flagged: {
      label: "Flagged for Review",
      chip: "bg-ember-soft text-signal-hold",
      hint: details?.statusReason || "Your account was flagged. Please contact CTMO.",
    },
    revoked: {
      label: "Revoked",
      chip: "bg-danger-soft text-signal-stop",
      hint: details?.statusReason || "Your account was revoked. Please contact CTMO.",
    },
    suspended: {
      label: "Suspended",
      chip: "bg-danger-soft text-signal-stop",
      hint: "Your account is suspended. Please contact CTMO.",
    },
  };

  // An unrecognised status falls back to neutral rather than crashing — the same
  // guard RN's `|| { label: status, bg: '#F3F4F6' … }` tail provides.
  const meta = STATUS_META[status] ?? {
    label: String(status),
    chip: "bg-chip-neutral text-muted",
    hint: null,
  };

  return (
    <>
      <AppBar title="My Profile" backHref="/home" />

      <PageBody>
        <div className="flex flex-col items-center pt-6">
          <span className="grid size-[72px] place-items-center rounded-full bg-brand-500 font-display text-[24px] font-bold text-white ring-[3px] ring-surface">
            {initials}
          </span>

          <p className="font-display mt-2.5 text-center text-[17px] font-bold text-ink">
            {user ? `${firstName} ${lastName}` : ""}
          </p>

          <span className={`mt-2 rounded-full px-3 py-[5px] text-[12px] font-bold ${meta.chip}`}>
            {meta.label}
          </span>

          {meta.hint ? (
            <p className="mt-2 px-8 text-center text-[12px] leading-relaxed text-muted">
              {meta.hint}
            </p>
          ) : null}
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-[14px] bg-surface p-[18px]">
          <InfoRow Icon={CreditCard} label="License Number" value={details?.licenseNumber || "—"} />
          {details?.address ? (
            <InfoRow Icon={MapPin} label="Address" value={details.address} />
          ) : null}
          {details?.contactNumber ? (
            <InfoRow Icon={Phone} label="Contact Number" value={details.contactNumber} />
          ) : null}
        </section>

        <button
          type="button"
          onClick={logout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-signal-stop py-[13px] text-[14px] font-semibold text-white transition-colors hover:bg-signal-stop/90"
        >
          <LogOut size={16} strokeWidth={2.2} aria-hidden />
          Logout
        </button>
      </PageBody>

      <BottomNav />
    </>
  );
}

type InfoRowProps = {
  Icon: LucideIcon;
  label: string;
  value: string;
};

/** RN's InfoRow: the emoji becomes a lucide icon over a label/value stack. The
 *  12px row gap lives on the parent so a hidden row closes up cleanly. */
function InfoRow({ Icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted">
        <Icon size={17} strokeWidth={2} aria-hidden />
      </span>

      <div className="min-w-0">
        <p className="text-[11px] leading-none text-muted">{label}</p>
        <p className="mt-1 text-[14px] font-semibold break-words text-ink">{value}</p>
      </div>
    </div>
  );
}