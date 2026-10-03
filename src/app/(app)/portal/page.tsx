import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Guest portal" };

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Guest portal"
      when="Guest equipment requests and the band builder arrive in Phase 3."
    />
  );
}
