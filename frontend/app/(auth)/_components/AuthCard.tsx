import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  /** One line under the title, e.g. "Sign in to view your violations". */
  subtitle?: string;
  /** Small icon shown above the title. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * The white card the signed-out screens sit in. Pulls 32px up into the brand
 * band so it overlaps, the same move StatusCard makes on the home screens.
 */
export default function AuthCard({
  title,
  subtitle,
  icon,
  children,
  className = "",
}: AuthCardProps) {
  return (
    <section
      className={`rise relative z-50 -mt-8 rounded-2xl bg-surface p-6 shadow-lift ${className}`}
    >
      {icon ? (
        <span className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-600">
          {icon}
        </span>
      ) : null}

      <h1 className="font-display text-[20px] leading-tight font-bold tracking-tight text-ink">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{subtitle}</p>
      ) : null}

      <div className="mt-5">{children}</div>
    </section>
  );
}