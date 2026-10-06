import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { contractCampuses } from "@/lib/data/contracts";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Contract templates" };

function formatTime(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ContractTemplatesPage() {
  const actor = await requireUser();
  const campuses = await contractCampuses(actor);
  if (campuses.length === 0) notFound();

  const latest = await db.contractTemplateVersion.findMany({
    where: { organizationId: actor.organizationId, campusId: { in: campuses.map((c) => c.id) } },
    orderBy: [{ campusId: "asc" }, { version: "desc" }],
    distinct: ["campusId"],
    select: { campusId: true, version: true, createdAt: true },
  });
  const byCampus = new Map(latest.map((row) => [row.campusId, row]));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Contract templates" />
      <p className="text-muted">
        Each campus has its own contract for guest check-outs. Saving creates a new version;
        contracts already signed keep the version they were signed with.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {campuses.map((campus) => {
          const current = byCampus.get(campus.id);
          return (
            <li key={campus.id}>
              <Card>
                <h2 className="text-base">
                  <Link
                    href={`/settings/contracts/${campus.id}`}
                    className="text-accent hover:underline"
                  >
                    {campus.name} ({campus.code})
                  </Link>
                </h2>
                <p className="text-muted mt-1">
                  {current
                    ? `Version ${current.version}, saved ${formatTime(current.createdAt)}`
                    : "No template yet"}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
