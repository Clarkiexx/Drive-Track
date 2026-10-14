import { Ban, CircleCheckBig, CircleSlash, Clock, Flag } from "lucide-react";

import type { VerificationStatus } from "@/constants/violations";

const COPY: Record<VerificationStatus, { text: string; Icon: typeof Flag }> = {
  pending: { text: "Account pending verification", Icon: Clock },
  flagged: { text: "Account flagged — contact CTMO", Icon: Flag },
  revoked: { text: "Account revoked — contact CTMO", Icon: Ban },
  suspended: { text: "Account suspended — contact CTMO", Icon: CircleSlash },
  verified: { text: "Verified account", Icon: CircleCheckBig },
};

type VerificationBannerProps = {
  status?: VerificationStatus | string | null;
  className?: string;
};

/**
 * The account-state line under the driver's name. Anything other than a
 * verified account gets the amber banner from HomeScreen; a verified account
 * gets the quiet green confirmation instead.
 */
export default function VerificationBanner({
  status,
  className = "",
}: VerificationBannerProps) {
  if (!status) return null;

  const key = (String(status).toLowerCase() as VerificationStatus) in COPY
    ? (String(status).toLowerCase() as VerificationStatus)
    : "pending";

  if (key === "verified") {
    return (
      <p
        className={`inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-100 ${className}`}
      >
        <CircleCheckBig size={13} strokeWidth={2.6} aria-hidden />
        {COPY.verified.text}
      </p>
    );
  }

  const { text, Icon } = COPY[key];

  return (
    <p
      className={`inline-flex items-center gap-1.5 self-start rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12px] font-bold text-warn-ink ${className}`}
    >
      <Icon size={13} strokeWidth={2.6} aria-hidden className="shrink-0" />
      {text}
    </p>
  );
}