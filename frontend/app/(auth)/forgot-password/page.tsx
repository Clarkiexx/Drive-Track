"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

import { authService } from "@/services/auth.service";
import { getApiErrorMessage } from "@/lib/axios";

import AuthCard from "../_components/AuthCard";
import PrimaryButton from "../_components/PrimaryButton";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";

export default function ForgotPasswordPage() {
  const [fullName, setFullName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setFieldError(null);
    setMessage(null);

    if (!fullName.trim() || !licenseNumber.trim()) {
      setFieldError("Please enter both your full name and license number.");
      return;
    }

    setIsSubmitting(true);
    try {
      // The endpoint only resets when the name/license pair matches; a
      // mismatch returns an error that is shown inline and as a toast.
      const result = await authService.forgotPassword({
        fullName: fullName.trim(),
        licenseNumber: licenseNumber.trim(),
      });
      setMessage(result.message);
      toast.success("Password reset.");
    } catch (error) {
      const errorMessage = getApiErrorMessage(
        error,
        "No account matches that full name and license number. Please check both and try again."
      );
      setFieldError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your full name and license number exactly as they appear on your account. Your password is reset back to your license number."
      icon={<KeyRound size={21} strokeWidth={2} aria-hidden />}
    >
      <FormField
        label="Full Name"
        required
        autoComplete="name"
        placeholder="e.g., Juan Dela Cruz"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
      />

      <FormField
        className="mt-3.5"
        label="License Number"
        required
        placeholder="e.g., N01-12-345678"
        value={licenseNumber}
        onChange={(event) => setLicenseNumber(event.target.value.toUpperCase())}
      />

      {fieldError ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-signal-stop">
          {fieldError}
        </p>
      ) : null}

      {message ? (
        <NoticeBox className="mt-4" tone="success">
          {message}
        </NoticeBox>
      ) : null}

      <PrimaryButton
        className="mt-5"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        disabled={Boolean(message)}
      >
        Reset Password
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