import { redirect } from "next/navigation";

import { adminHref } from "@/components/common/adminNav";

/**
 * /admin has no screen of its own — send it to the console's landing page so a
 * typed or bookmarked /admin still lands on something real.
 */
export default function AdminIndexPage() {
  redirect(adminHref("dashboard"));
}