"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Camera, IdCard, UserPlus, X } from "lucide-react";

import { authService } from "@/services/auth.service";
import { getApiErrorMessage } from "@/lib/axios";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_REJECTION_MESSAGE,
  rejectImage,
} from "@/lib/uploadLimits";

import AuthCard from "../_components/AuthCard";
import PrimaryButton from "../_components/PrimaryButton";
import NoticeBox from "@/components/common/NoticeBox";
import FormField from "@/components/common/FormField";

type FieldErrors = Partial<Record<"firstName" | "lastName" | "licenseNumber", string>>;

export default function RegisterPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ driverId: number; username: string } | null>(null);

  function pickPhoto(file: File | undefined) {
    if (!file) return;

    // multer rejects unsupported types and >8MB files at upload time, and since
    // registration is one multipart request a rejected photo fails the whole
    // sign-up — the driver loses the account they were creating. HEIC is the
    // iPhone camera default, so this is the common case, not an edge one.
    const rejection = rejectImage(file);
    if (rejection) {
      toast.error(IMAGE_REJECTION_MESSAGE[rejection]);
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    const next: FieldErrors = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    if (!licenseNumber.trim()) {
      next.licenseNumber = "License number is required — it doubles as your temporary password.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setIsSubmitting(true);
    try {
      const session = await authService.registerDriver(
        {
          firstName: firstName.trim(),
          middleInitial: middleInitial.trim() || undefined,
          lastName: lastName.trim(),
          licenseNumber: licenseNumber.trim(),
          contactNumber: contactNumber.trim() || undefined,
          address: address.trim() || undefined,
        },
        photo,
      );

      setCreated(session);
      toast.success("Account created. It is pending review.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to register. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    return (
      <AuthCard title="Account created" icon={<BadgeCheck size={21} strokeWidth={2} aria-hidden />}>
        <NoticeBox tone="success">
          Your account is pending review. You can log in now, but full access unlocks once a CTMO
          administrator verifies your driver&apos;s license.
        </NoticeBox>

        <div className="mt-4 rounded-[10px] bg-surface-sunken p-4">
          <p className="text-[12px] text-muted">Your login username</p>
          <p className="tabular font-display mt-0.5 text-[17px] font-bold break-all text-ink">
            {created.username}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-muted">
            Your temporary password is your license number. You will be asked to set a new one after
            signing in.
          </p>
        </div>

        <PrimaryButton className="mt-5" onClick={() => router.push("/login")}>
          Go to Login
        </PrimaryButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Sign up as a registered driver. Your license number becomes your temporary password."
      icon={<UserPlus size={21} strokeWidth={2} aria-hidden />}
    >
      <div className="flex gap-2.5">
        <FormField
          className="flex-[2]"
          label="First Name"
          required
          autoComplete="given-name"
          placeholder="Juan"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={errors.firstName}
        />
        <FormField
          className="flex-1"
          label="M.I."
          placeholder="A"
          maxLength={5}
          value={middleInitial}
          onChange={(event) => setMiddleInitial(event.target.value.toUpperCase())}
        />
      </div>

      <FormField
        className="mt-3.5"
        label="Last Name"
        required
        autoComplete="family-name"
        placeholder="Dela Cruz"
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        error={errors.lastName}
      />

      <FormField
        className="mt-3.5"
        label="License Number"
        required
        placeholder="N01-23-456789"
        value={licenseNumber}
        onChange={(event) => setLicenseNumber(event.target.value.toUpperCase())}
        error={errors.licenseNumber}
      />

      <FormField
        className="mt-3.5"
        label="Contact Number"
        type="tel"
        inputMode="tel"
        placeholder="+63 912 345 6789"
        value={contactNumber}
        onChange={(event) => setContactNumber(event.target.value)}
      />

      <FormField
        className="mt-3.5"
        label="Address"
        placeholder="Purok Kokomama, Pilipog, Cordova, Cebu 6017"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />

      <div className="mt-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <IdCard size={15} strokeWidth={2.2} aria-hidden className="text-muted" />
          Driver&apos;s License Photo
        </p>
        <p className="mb-2 text-[11px] leading-snug text-muted">
          Optional, but it speeds up verification — an administrator reviews this photo before
          unlocking your account.
        </p>

        {photoPreview ? (
          <div>
            <div className="relative">
              {/* Object URL from a local file; the image optimiser cannot take it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Selected driver license photo"
                className="h-44 w-full rounded-[10px] border border-hairline object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setPhoto(null);
                  setPhotoPreview(null);
                }}
                aria-label="Remove license photo"
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-signal-stop text-white ring-2 ring-surface"
              >
                <X size={14} strokeWidth={3} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-2 text-[13px] font-semibold text-brand-500 underline-offset-2 hover:underline"
            >
              Choose a different photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-brand-500 bg-brand-soft/40 px-4 py-6 text-brand-600 transition-colors hover:bg-brand-soft"
          >
            <Camera size={22} strokeWidth={1.9} aria-hidden />
            <span className="text-[13px] font-semibold">Attach license photo</span>
          </button>
        )}

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          onChange={(event) => pickPhoto(event.target.files?.[0])}
        />
      </div>

      <NoticeBox className="mt-4" tone="info">
        Already have citations on record? Your details may already exist. Contact CTMO to have your
        existing record linked instead of creating a second one.
      </NoticeBox>

      <PrimaryButton className="mt-5" onClick={handleSubmit} isLoading={isSubmitting}>
        Sign Up
      </PrimaryButton>

      <Link
        href="/login"
        className="mt-4 block text-center text-[14px] font-semibold text-brand-500 underline-offset-2 hover:underline"
      >
        Back to Login
      </Link>
    </AuthCard>
  );
}