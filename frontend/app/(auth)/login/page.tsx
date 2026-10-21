"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/axios";
import { homeForRole } from "@/constants/roles";

import AuthCard from "../_components/AuthCard";
import PasswordField from "../_components/PasswordField";
import PrimaryButton from "../_components/PrimaryButton";
import { resolveNextTarget } from "../_lib/next-target";
// The desk lives in the layout so the frame can dress /login as the admin
// console on a desktop; a child cannot hand state up, so this is the channel.
import { useAuthDesk } from "../layout";
import FormField from "@/components/common/FormField";

/**
 * The single sign-in form for every role. The user types their full name
 * (drivers) or username (enforcers and admins) plus their password; the
 * backend detects which account the credentials belong to (POST /auth/login)
 * and this page sends them to whichever dashboard that role owns.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { setDesk } = useAuthDesk();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const next = searchParams.get("next");

  // Arriving from the admin area (?next=/admin/…) dresses the desk as the
  // console the visitor was headed for; everything else keeps the plain frame.
  // Deferred a tick like AuthContext.restoreSession — committing state
  // straight from an effect body is what react-hooks/set-state-in-effect flags.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDesk(next?.startsWith("/admin") ? "console" : "plain");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [next, setDesk]);

  async function handleSubmit() {
    setFieldError(null);

    if (!identifier.trim() || !password.trim()) {
      setFieldError("Please enter your full name or username and your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      // The role is detected server-side from the credentials themselves.
      const session = await login({ identifier: identifier.trim(), password: password.trim() });

      // login() has already navigated. If the driver still owes a password
      // change, stop here and honour neither `next` nor the role home: the
      // backend 403s every route except change-password for that token, so any
      // other destination would land on a screen whose API calls all fail.
      // This page navigates too, so it has to agree with AuthContext.login().
      if (session.user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      // If the proxy remembered a page inside the DETECTED role's own space,
      // honour that instead.
      const target = resolveNextTarget(searchParams.get("next"), session.user.role);
      router.replace(target ?? homeForRole(session.user.role));
    } catch (error) {
      // The backend's own wording is the most useful thing we can show.
      toast.error(getApiErrorMessage(error, "Unable to log in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue to DriveTrack."
      icon={<ShieldCheck size={21} strokeWidth={2} aria-hidden />}
    >
      <FormField
        label="Full Name or Username"
        required
        autoComplete="username"
        placeholder="e.g., Juan Dela Cruz or your staff username"
        hint="Drivers enter their full name; enforcers and admins their username."
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
      />

      <PasswordField
        className="mt-3.5"
        label="Password"
        required
        placeholder="Enter your password"
        value={password}
        onChange={setPassword}
      />
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Drivers signing in for the first time use their license number as the password.
      </p>

      {fieldError ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-signal-stop">
          {fieldError}
        </p>
      ) : null}

      <PrimaryButton className="mt-5" onClick={handleSubmit} isLoading={isSubmitting}>
        Log In
      </PrimaryButton>

      <div className="mt-4 flex items-center justify-between gap-4">
        <Link
          href="/register"
          className="text-[14px] font-semibold text-brand-500 underline-offset-2 hover:underline"
        >
          Create an account
        </Link>
        <Link
          href="/forgot-password"
          className="text-[14px] font-semibold text-brand-500 underline-offset-2 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">
        Enforcer and admin accounts are provisioned by your CTMO administrator.
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-hidden />}>
      <LoginForm />
    </Suspense>
  );
}
