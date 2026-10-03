import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Service log" };

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Service log"
      when="Service history across all equipment arrives in Phase 1, step 5."
    />
  );
}
