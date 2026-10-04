import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Barcode } from "@/components/barcode";
import { PrintButton } from "@/components/print-button";
import { Card, PageHeader } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { displayName, getBranding } from "@/lib/branding";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Print labels" };

const MAX_LABELS = 200;

/** Printable labels for one or more items (?id=…&id=…). */
export default async function LabelsPage({ searchParams }: PageProps<"/items/labels">) {
  const user = await requireUser();
  const raw = (await searchParams).id;
  const ids = z
    .array(z.uuid())
    .catch([])
    .parse(Array.isArray(raw) ? raw : raw ? [raw] : [])
    .slice(0, MAX_LABELS);

  const [found, branding] = await Promise.all([
    ids.length
      ? db.item.findMany({
          where: { id: { in: ids }, organizationId: user.organizationId },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            organizationId: true,
            campusId: true,
            locationId: true,
            departmentId: true,
          },
        })
      : [],
    getBranding(user.organizationId),
  ]);
  // Items the user can't read are left out, without saying they exist.
  const items = found.filter((item) => can(user, "item:read", item));
  const owner = displayName(branding);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 print:hidden">
        <div>
          <Link href="/items" className="text-accent hover:underline">
            Back to inventory
          </Link>
        </div>
        <PageHeader title="Print labels">
          {items.length > 0 ? (
            <PrintButton label={`Print ${items.length} label${items.length === 1 ? "" : "s"}`} />
          ) : null}
        </PageHeader>
        {items.length === 0 ? (
          <Card>
            <p>
              No items selected. Choose items with the checkboxes in the inventory list, or use
              Print label on an item.
            </p>
          </Card>
        ) : (
          <p className="text-muted">
            Each label is 2.25 × 1.25 inches with the item code as a Code 128 barcode.
          </p>
        )}
      </div>
      <ul className="flex flex-wrap gap-2 print:gap-0">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border flex h-[1.25in] w-[2.25in] break-inside-avoid flex-col justify-between overflow-hidden border bg-white p-[0.08in] text-black print:border-dashed"
          >
            <p className="truncate text-[7pt] leading-tight">{owner}</p>
            <p className="truncate text-[8pt] leading-tight font-semibold">{item.name}</p>
            <Barcode value={item.code} height={40} className="h-[0.5in] w-full" />
            <p className="text-center font-mono text-[9pt] leading-tight">{item.code}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
