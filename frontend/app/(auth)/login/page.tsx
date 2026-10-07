"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Truck } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/axios";
import { homeForRole, type Role } from "@/constants/roles";

import AuthCard from "../_components/AuthCard";
import PasswordField from "../_components/PasswordField";
import PrimaryButton from "../_components/PrimaryButton";
import { resolveNextTarget } from "../_lib/next-target";
import { SegmentedOptions } from "@/components/common/OptionCard";
import FormField from "@/components/common/FormField";

/** Which credential shape the backend expects for each portal. */
const PORTALS: { value: Role; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "enforcer", label: "Enforcer" },
  { value: "admin", label: "Admin" },
];

const SUBTITLE: Record<Role, string> = {
  driver: "Sign in to view and settle your violations.",
  enforcer: "Sign in to issue citations and search driver records.",
  admin: "Sign in to manage drivers, citations and settlements.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [role, setRole] = useState<Role>("driver");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isDriver = role === "driver";

  async function handleSubmit() {
    setFieldError(null);

    const identity = isDriver ? fullName.trim() : username.trim();
    if (!identity || !password.trim()) {
      setFieldError(
        isDriver
          ? "Please enter both your full name and license number or password."
          : "Please enter your username and password.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await login(
        role,
        isDriver
          ? { fullName: fullName.trim(), password: password.trim() }
          : { username: username.trim(), password: password.trim() },
      );

      // login() has already navigated. If the driver still owes a password
      // change, stop here and honour neither `next` nor the role home: the
      // backend 403s every route except change-password for that token, so any
      // other destination would land on a screen whose API calls all fail.
      // This page navigates too, so it has to agree with AuthContext.login().
      if (session.user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      // If the proxy remembered a page inside this role's own space, honour
      // that instead.
      const next = resolveNextTarget(searchParams.get("next"), role);
      router.replace(next ?? homeForRole(role));
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
      subtitle={SUBTITLE[role]}
      icon={
        isDriver ? (
          <Truck size={21} strokeWidth={2} aria-hidden />
        ) : (
          <ShieldCheck size={21} strokeWidth={2} aria-hidden />
        )
      }
    >
      <SegmentedOptions
        label="Account type"
        value={role}
        onChange={(next) => {
          setRole(next);
          setFieldError(null);
        }}
        options={PORTALS}
      />

      <div className="mt-4">
        {isDriver ? (
          <FormField
            label="Full Name"
            required
            autoComplete="name"
            placeholder="e.g., Juan Dela Cruz"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        ) : (
          <FormField
            label="Username"
            required
            autoComplete="username"
            placeholder="Enter your username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        )}
      </div>

      <PasswordField
        className="mt-3.5"
        label={isDriver ? "License Number / Password" : "Password"}
        required
        placeholder={isDriver ? "e.g., N01-12-345678" : "Enter your password"}
        value={password}
        onChange={setPassword}
      />

      {fieldError ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-signal-stop">
          {fieldError}
        </p>
      ) : null}

      <PrimaryButton className="mt-5" onClick={handleSubmit} isLoading={isSubmitting}>
        Log In
      </PrimaryButton>

      {isDriver ? (
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
      ) : (
        <p className="mt-4 text-center text-[12px] leading-relaxed text-muted">
          Don&apos;t have an account? Contact your CTMO administrator.
        </p>
      )}
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