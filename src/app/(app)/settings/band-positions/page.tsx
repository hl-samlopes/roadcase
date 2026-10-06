import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { bandPositionCampuses } from "@/lib/data/band";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Band positions" };

export default async function BandPositionCampusesPage() {
  const actor = await requireUser();
  const campuses = await bandPositionCampuses(actor);
  if (campuses.length === 0) notFound();
  const counts = await db.bandPosition.groupBy({
    by: ["campusId"],
    where: { campusId: { in: campuses.map((c) => c.id) }, archivedAt: null },
    _count: true,
  });
  const byCampus = new Map(counts.map((row) => [row.campusId, row._count]));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Band positions" />
      <p className="text-muted">
        The positions guest groups choose from when they describe their band, and the inputs each
        player in a position needs. Each campus has its own.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {campuses.map((campus) => (
          <li key={campus.id}>
            <Card>
              <h2 className="text-base">
                <Link
                  href={`/settings/band-positions/${campus.id}`}
                  className="text-accent hover:underline"
                >
                  {campus.name} ({campus.code})
                </Link>
              </h2>
              <p className="text-muted mt-1">
                {byCampus.get(campus.id) ?? 0} position{byCampus.get(campus.id) === 1 ? "" : "s"}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
