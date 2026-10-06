import "server-only";
import { can, type Actor } from "@/lib/authz";
import { getBranding } from "@/lib/branding";
import { parseDocument, type ContractDoc, type MergeValues } from "@/lib/contracts/document";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { activeCheckoutStatuses, feeTotalCents } from "./checkouts";

/** Campuses whose contract template the actor may edit (campus or organization admins). */
export async function contractCampuses(actor: Actor) {
  const campuses = await db.campus.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return campuses.filter((campus) =>
    can(actor, "contracts:manage", { organizationId: actor.organizationId, campusId: campus.id }),
  );
}

const versionSelect = {
  id: true,
  version: true,
  content: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
} as const;

/** A stored version with its document checked again (it was checked on save, too). */
function withDoc<T extends { content: unknown }>(row: T | null) {
  if (!row) return null;
  const parsed = parseDocument(row.content);
  if (!parsed.ok) throw new Error(`Stored contract template is unreadable: ${parsed.error}`);
  return { ...row, doc: parsed.doc as ContractDoc };
}

export async function latestTemplateVersion(organizationId: string, campusId: string) {
  return withDoc(
    await db.contractTemplateVersion.findFirst({
      where: { organizationId, campusId },
      orderBy: { version: "desc" },
      select: versionSelect,
    }),
  );
}

export async function templateVersion(organizationId: string, campusId: string, version: number) {
  return withDoc(
    await db.contractTemplateVersion.findFirst({
      where: { organizationId, campusId, version },
      select: versionSelect,
    }),
  );
}

export function templateHistory(organizationId: string, campusId: string) {
  return db.contractTemplateVersion.findMany({
    where: { organizationId, campusId },
    orderBy: { version: "desc" },
    select: {
      version: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
  });
}

/** The name contracts use for the organization: its display name if set, else its name. */
export async function contractOrganizationName(organizationId: string) {
  const [branding, organization] = await Promise.all([
    getBranding(organizationId),
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
  ]);
  return branding?.displayName?.trim() || organization.name;
}

/** Check-outs at the campus that a preview can be filled from (not returned or cancelled). */
export function previewableCheckouts(organizationId: string, campusId: string) {
  return db.checkout.findMany({
    where: { organizationId, campusId, status: { in: activeCheckoutStatuses } },
    orderBy: { number: "desc" },
    take: 50,
    select: { id: true, number: true, groupName: true },
  });
}

/** Merge values from a real check-out at this campus, or null if there's no such check-out. */
export async function checkoutMergeValues(
  organizationId: string,
  campusId: string,
  checkoutId: string,
): Promise<MergeValues | null> {
  const checkout = await db.checkout.findFirst({
    where: { id: checkoutId, organizationId, campusId },
    select: {
      number: true,
      groupName: true,
      guestRepName: true,
      guestRepEmail: true,
      guestRepPhone: true,
      dateOut: true,
      dateDue: true,
      campus: { select: { code: true, name: true } },
      staffRep: { select: { displayName: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: { fee: true, item: { select: { code: true, name: true } } },
      },
    },
  });
  if (!checkout) return null;
  const totalCents = feeTotalCents(checkout.lines);
  return {
    organization: await contractOrganizationName(organizationId),
    campus: `${checkout.campus.name} (${checkout.campus.code})`,
    checkout_number: String(checkout.number),
    group: checkout.groupName,
    guest_rep: checkout.guestRepName,
    guest_rep_email: checkout.guestRepEmail,
    guest_rep_phone: checkout.guestRepPhone,
    staff_rep: checkout.staffRep?.displayName ?? "(no staff representative)",
    dates: `${formatDate(checkout.dateOut)} to ${formatDate(checkout.dateDue)}`,
    date_out: formatDate(checkout.dateOut),
    date_back: formatDate(checkout.dateDue),
    fees_total: totalCents === 0 ? "No fees" : formatMoney((totalCents / 100).toFixed(2)),
    item_list: checkout.lines.map((line) => ({
      code: line.item.code,
      name: line.item.name,
      fee: line.fee === null ? null : formatMoney(line.fee),
    })),
  };
}

/** Made-up values for previewing before any check-out exists. */
export async function sampleMergeValues(
  organizationId: string,
  campus: { code: string; name: string },
): Promise<MergeValues> {
  return {
    organization: await contractOrganizationName(organizationId),
    campus: `${campus.name} (${campus.code})`,
    checkout_number: "123",
    group: "Sample Youth Group",
    guest_rep: "Jordan Example",
    guest_rep_email: "jordan@example.com",
    guest_rep_phone: "(555) 010-0000",
    staff_rep: "Sample Staff Member",
    dates: "Jul 10, 2027 to Jul 14, 2027",
    date_out: "Jul 10, 2027",
    date_back: "Jul 14, 2027",
    fees_total: "$40.00",
    item_list: [
      { code: `${campus.code}-000101`, name: "Wireless microphone kit", fee: "$25.00" },
      { code: `${campus.code}-000102`, name: "Powered speaker", fee: "$15.00" },
      { code: `${campus.code}-000103`, name: "Mic stand", fee: null },
    ],
  };
}
