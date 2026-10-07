"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/auth.service";
import { getApiErrorMessage } from "@/lib/axios";
import { homeForRole } from "@/constants/roles";

import AuthCard from "../_components/AuthCard";
import PasswordField from "../_components/PasswordField";
import PrimaryButton from "../_components/PrimaryButton";
import NoticeBox from "@/components/common/NoticeBox";

const MIN_LENGTH = 8;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, token, isLoading, applyToken, clearMustChangePassword } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Changing the password needs the flagged token, so an anonymous visitor has
  // no reason to be here. Login honours ?next=/change-password for drivers.
  useEffect(() => {
    if (isLoading) return;
    if (!token) router.replace("/login?next=%2Fchange-password");
  }, [isLoading, token, router]);

  async function handleSubmit() {
    setFieldError(null);

    if (newPassword.length < MIN_LENGTH) {
      setFieldError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token: freshToken } = await authService.changePassword({ newPassword });

      // The backend issues a new JWT because the old one still carries
      // mustChangePassword and is refused by the auth middleware.
      applyToken(freshToken);
      clearMustChangePassword();

      toast.success("Password updated.");
      router.replace(user ? homeForRole(user.role) : "/home");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to update password. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="For your security, you must set a new password before continuing. This replaces your license number as your login password."
      icon={<LockKeyhole size={21} strokeWidth={2} aria-hidden />}
    >
      <NoticeBox tone="warn">
        Every other part of the app stays locked until this is done.
      </NoticeBox>

      <PasswordField
        className="mt-4"
        label="New Password"
        required
        autoComplete="new-password"
        placeholder={`At least ${MIN_LENGTH} characters`}
        value={newPassword}
        onChange={setNewPassword}
        disabled={!token}
      />

      <PasswordField
        className="mt-3.5"
        label="Confirm New Password"
        required
        autoComplete="new-password"
        placeholder="Re-enter your new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        disabled={!token}
      />

      {fieldError ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-signal-stop">
          {fieldError}
        </p>
      ) : null}

      <PrimaryButton
        className="mt-5"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        disabled={!token}
      >
        Update Password
      </PrimaryButton>
    </AuthCard>
  );
}