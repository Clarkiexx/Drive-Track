import {
  Bell,
  CreditCard,
  LayoutDashboard,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The admin console's section list — the one place that knows what the console
 * contains.
 *
 * The sidebar renders it, the topbar takes its page title from it, and every
 * section without screens yet resolves through app/admin/[section]/page.tsx
 * using the same entries. A link therefore cannot point at a route the console
 * has never heard of.
 *
 * Mirrors admin-dashboard/src/components/Sidebar.jsx (the separate Vite
 * office UI this console replaces), with `blurb` added for the empty state.
 */

export const ADMIN_ROOT = "/admin";

export type AdminSection = {
  /** Path segment under /admin; also the sidebar href's tail. */
  slug: string;
  label: string;
  Icon: LucideIcon;
  /** One plain sentence describing what the finished section will do. */
  blurb: string;
  /** False until the section has real screens — the sidebar marks it Planned. */
  ready: boolean;
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    slug: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    blurb: "Totals, trends and the newest citations in one screen.",
    ready: true,
  },
  {
    slug: "drivers",
    label: "Drivers",
    Icon: Users,
    blurb: "Search the register, review verification status and suspend accounts.",
    ready: true,
  },
  {
    slug: "enforcers",
    label: "Enforcers",
    Icon: ShieldCheck,
    blurb: "Manage field officers and the areas they cover.",
    ready: true,
  },
  {
    slug: "violation-types",
    label: "Violation Types",
    Icon: Tags,
    blurb: "Maintain the offence catalogue and the fines attached to it.",
    ready: true,
  },
  {
    slug: "violations",
    label: "Violations",
    Icon: ScrollText,
    blurb: "Monitor every citation and warning, verify it and resolve protests.",
    ready: true,
  },
  {
    slug: "settlements",
    label: "Settlements",
    Icon: CreditCard,
    blurb: "Record payments and reconcile what drivers still owe.",
    ready: true,
  },
  {
    slug: "notifications",
    label: "Notifications",
    Icon: Bell,
    blurb: "Broadcast advisories to drivers and enforcers.",
    ready: true,
  },
  {
    slug: "audit-log",
    label: "Audit Log",
    Icon: NotebookPen,
    blurb: "Review the privileged actions taken in this console.",
    ready: true,
  },
];

export function adminHref(slug: string): string {
  return `${ADMIN_ROOT}/${slug}`;
}

export function adminSection(slug: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => section.slug === slug);
}

/**
 * Which section a pathname belongs to. Reads the segment straight after
 * /admin, so the sidebar and the topbar can never disagree with the route.
 */
export function adminSectionForPath(pathname: string | null | undefined): AdminSection | undefined {
  if (!pathname) return undefined;
  const slug = pathname.split("/")[2] ?? "";
  return slug ? adminSection(slug) : undefined;
}