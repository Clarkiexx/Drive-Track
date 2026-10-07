import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import { ADMIN_SECTIONS, adminHref, adminSection } from "@/components/common/adminNav";

type AdminSectionPageProps = {
  params: Promise<{ section: string }>;
};

/**
 * Every console section that has no screens yet lands here.
 *
 * The sidebar and the topbar both read the same registry (adminNav.ts), so a
 * link can never point at a route this page refuses — an admin clicking through
 * the console gets a titled empty state, not a 404. An unknown segment is a
 * genuine mistake and still 404s.
 */
export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { section: slug } = await params;
  const section = adminSection(slug);

  if (!section || section.ready) notFound();

  const others = ADMIN_SECTIONS.filter(
    (entry) => entry.slug !== slug && !entry.ready
  );

  return (
    <div className="space-y-5">
      <div className="rise rounded-2xl border border-dashed border-console-line bg-surface/75 shadow-console">
        <EmptyState title={`${section.label} is not built yet`}>
          {section.blurb} It arrives in a later pass — the rest of the console keeps
          working while it does.
        </EmptyState>
      </div>

      {/* Somewhere to go instead of a dead end. */}
      <nav aria-label="Other sections still to come" className="rise rounded-2xl border border-console-line bg-surface px-5 py-4 shadow-console [animation-delay:80ms]">
        <p className="text-[10.5px] font-bold tracking-[0.18em] text-console-muted uppercase">
          Also on the way
        </p>

        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={adminHref(entry.slug)}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-console-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
              >
                {entry.label}
                <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}