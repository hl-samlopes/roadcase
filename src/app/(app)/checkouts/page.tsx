import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Check-outs" };

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Check-outs"
      when="Guest check-outs and signed contracts arrive in Phase 2."
    />
  );
}
