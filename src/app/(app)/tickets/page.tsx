import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Service tickets" };

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Service tickets"
      when="Repair tickets and the ticket queue arrive in Phase 1, step 5."
    />
  );
}
