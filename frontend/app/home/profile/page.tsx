"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, LogOut, MapPin, Phone, type LucideIcon } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import { getApiErrorMessage } from "@/lib/axios";
import { getMediaUrl } from "@/lib/media";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_REJECTION_MESSAGE,
  rejectImage,
} from "@/lib/uploadLimits";
import { driverService } from "@/services/driver.service";
import type { VerificationStatus } from "@/constants/violations";

type StatusMeta = {
  label: string;
  /** Pill fill + text, translated from the RN screen's hardcoded hexes. */
  chip: string;
  hint: string | null;
};

export default function ProfilePage() {
  const { user, logout, applyProfilePatch } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  // Edit form. State is seeded from the session on "Edit personal details"
  // rather than at mount: AuthContext restores the session after hydration,
  // so initialising here would capture the empty pre-restore values.
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [middleInitialTouched, setMiddleInitialTouched] = useState(false);
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const currentFirstName = user?.firstName ?? "";
  const currentLastName = user?.lastName ?? "";
  const status = user?.verificationStatus ?? "pending";
  const photoUrl = user?.profilePhotoPath ? getMediaUrl(user.profilePhotoPath) : "";

  // "MV" for Maria Villanueva — RN builds it from the two initials.
  const initials = `${currentFirstName.charAt(0)}${currentLastName.charAt(0)}`.toUpperCase();

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
      hint: user?.statusReason || "Your account was flagged. Please contact CTMO.",
    },
    revoked: {
      label: "Revoked",
      chip: "bg-danger-soft text-signal-stop",
      hint: user?.statusReason || "Your account was revoked. Please contact CTMO.",
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

  function startEditing() {
    // Re-seed from the latest saved record every time the form opens.
    setFirstName(user?.firstName ?? "");
    setMiddleInitial(user?.middleInitial ?? "");
    setMiddleInitialTouched(false);
    setLastName(user?.lastName ?? "");
    setAddress(user?.address ?? "");
    setContactNumber(user?.contactNumber ?? "");
    setEditError("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setEditError("");
    setIsEditing(false);
  }

  async function handleSave() {
    setEditError("");
    if (!firstName.trim() || !lastName.trim()) {
      setEditError("First name and last name are required.");
      return;
    }

    setIsSaving(true);
    try {
      // Sessions restored before middleInitial joined AuthUser cannot know the
      // saved value, so omit it unless the driver actually edited the field —
      // otherwise saving an unrelated change would silently clear their M.I.
      const middleInitialPatch =
        user?.middleInitial !== undefined || middleInitialTouched
          ? { middleInitial: middleInitial.trim() || null }
          : {};

      const updated = await driverService.updateMyProfile({
        firstName: firstName.trim(),
        ...middleInitialPatch,
        lastName: lastName.trim(),
        address: address.trim() || null,
        contactNumber: contactNumber.trim() || null,
      });

      // The response is the saved record — patch the session with it rather
      // than echoing the form, so the rows show exactly what the server stored.
      applyProfilePatch({
        firstName: updated.firstName,
        middleInitial: updated.middleInitial ?? null,
        lastName: updated.lastName,
        address: updated.address ?? null,
        contactNumber: updated.contactNumber ?? null,
      });
      setIsEditing(false);
      toast.success("Profile updated. Your personal details have been saved.");
    } catch (error) {
      setEditError(getApiErrorMessage(error, "Unable to save changes. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;

    // The server rejects unsupported types and >8MB files; checking here keeps
    // the failure immediate and reuses the same wording as driver registration.
    const rejection = rejectImage(file);
    if (rejection) {
      toast.error(IMAGE_REJECTION_MESSAGE[rejection]);
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const updated = await driverService.uploadMyPhoto(file);
      applyProfilePatch({ profilePhotoPath: updated.profilePhotoPath ?? null });
      toast.success("Profile photo updated. Your new picture is now showing.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to upload the photo. Please try again."));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  return (
    <>
      <AppBar title="My Profile" backHref="/home" />

      <PageBody>
        <div className="flex flex-col items-center pt-6">
          {photoUrl ? (
            // Backend-served avatar: the same plain <img> pattern as citation
            // evidence (the Next image optimiser has no route to the API host).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Profile picture"
              className="size-[72px] rounded-full object-cover ring-[3px] ring-surface"
            />
          ) : (
            <span className="grid size-[72px] place-items-center rounded-full bg-brand-500 font-display text-[24px] font-bold text-white ring-[3px] ring-surface">
              {initials}
            </span>
          )}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={isUploadingPhoto}
            className="mt-2 text-[13px] font-semibold text-brand-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploadingPhoto
              ? "Uploading…"
              : photoUrl
                ? "Change profile picture"
                : "Add profile picture"}
          </button>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            disabled={isUploadingPhoto}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear immediately so re-picking the same file still fires
              // onChange (e.g. after a client-side rejection).
              event.target.value = "";
              void handlePhoto(file);
            }}
          />

          <p className="font-display mt-2.5 text-center text-[17px] font-bold text-ink">
            {user ? `${currentFirstName} ${currentLastName}` : ""}
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
          <InfoRow Icon={CreditCard} label="License Number" value={user?.licenseNumber || "—"} />
          {user?.address ? <InfoRow Icon={MapPin} label="Address" value={user.address} /> : null}
          {user?.contactNumber ? (
            <InfoRow Icon={Phone} label="Contact Number" value={user.contactNumber} />
          ) : null}

          {!isEditing ? (
            <button
              type="button"
              onClick={startEditing}
              className="mt-2 rounded-[10px] border border-hairline bg-surface py-[11px] text-[13px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
            >
              Edit personal details
            </button>
          ) : (
            <div className="mt-2">
              <div className="flex gap-2.5">
                <FormField
                  className="flex-[2]"
                  label="First Name"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
                <FormField
                  className="flex-1"
                  label="M.I."
                  maxLength={5}
                  value={middleInitial}
                  onChange={(event) => {
                    setMiddleInitial(event.target.value.toUpperCase());
                    setMiddleInitialTouched(true);
                  }}
                />
              </div>

              <FormField
                className="mt-3.5"
                label="Last Name"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />

              <FormField
                className="mt-3.5"
                label="Address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />

              <FormField
                className="mt-3.5"
                label="Contact Number"
                type="tel"
                inputMode="tel"
                value={contactNumber}
                onChange={(event) => setContactNumber(event.target.value)}
              />

              {editError ? (
                <NoticeBox className="mt-3.5" tone="danger">
                  {editError}
                </NoticeBox>
              ) : null}

              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="flex-1 rounded-[10px] border border-hairline bg-surface py-[11px] text-[13px] font-semibold text-ink transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 rounded-[10px] bg-brand-500 py-[11px] text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
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
