import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { isAnyAdmin, requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  const user = await requireUser();
  if (!isAnyAdmin(user)) notFound();
  return (
    <ComingSoon
      title="Appearance"
      when="Organization colors, fonts, logos and the sign-in page arrive in Phase 1, step 6."
    />
  );
}
