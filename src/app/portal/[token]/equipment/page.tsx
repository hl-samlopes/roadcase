import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { appTimeZone } from "@/lib/checkouts/overdue";
import { portalCatalog, portalRequest } from "@/lib/data/portal";
import { formatDate } from "@/lib/format";
import { kindId } from "@/lib/portal/catalog";
import { quantityField } from "@/lib/portal/fields";
import { guestCanEdit, guestRequestStatusLabels } from "@/lib/portal/requests";
import { loadPortal, PortalShell, portalMetadata } from "../shell";
import { saveRequestAction, withdrawRequestAction } from "./actions";
import { RequestForm } from "./request-form";

export async function generateMetadata({
  params,
}: PageProps<"/portal/[token]/equipment">): Promise<Metadata> {
  const { portal, branding } = await loadPortal((await params).token, "catalog:read");
  return portalMetadata(`Equipment · ${portal.group.name}`, branding);
}

/** The catalog for the group's campus and dates, and the group's request. */
export default async function PortalEquipmentPage({
  params,
}: PageProps<"/portal/[token]/equipment">) {
  const { token } = await params;
  const { portal, branding } = await loadPortal(token, "catalog:read");
  const { principal, group } = portal;
  const [catalog, request] = await Promise.all([
    portalCatalog(principal, group),
    portalRequest(principal),
  ]);
  const editable = guestCanEdit(request?.status ?? null);
  const quantities = new Map(
    (request?.lines ?? []).map((line) => [
      kindId(line.categoryId, line.kindKey),
      line.quantityRequested,
    ]),
  );

  return (
    <PortalShell branding={branding}>
      <div>
        <Link href={`/portal/${token}`} className="text-accent hover:underline">
          Back to your group page
        </Link>
      </div>
      <div>
        <p className="text-muted">{group.name}</p>
        <h1 className="text-2xl">Equipment</h1>
      </div>
      <p>
        For {formatDate(group.arrivalDate)} to {formatDate(group.departureDate)} at{" "}
        {group.campusName}. Choose how many of each you&apos;d like; staff pick the actual pieces
        and confirm what you&apos;ll get.
      </p>
      {request ? (
        <p role="status" className="rounded-theme border-border bg-surface border p-3">
          <span className="font-semibold">
            Your request: {guestRequestStatusLabels[request.status]}
          </span>
          {request.submittedAt && request.status !== "DRAFT"
            ? ` (sent ${request.submittedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: appTimeZone() })})`
            : ""}
          .
        </p>
      ) : null}

      {!editable && request ? (
        <section className="rounded-theme border-border bg-surface border p-4">
          <h2 className="mb-2 text-base">What you asked for</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Item</th>
                <th className="p-2">Asked for</th>
              </tr>
            </thead>
            <tbody>
              {request.lines.map((line) => (
                <tr
                  key={line.kindKey + line.categoryId}
                  className="border-border border-b last:border-0"
                >
                  <td className="p-2">{line.name}</td>
                  <td className="p-2">{line.quantityRequested}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {request.note ? (
            <p className="mt-2 whitespace-pre-line">
              <span className="text-muted">Your note:</span> {request.note}
            </p>
          ) : null}
          <p className="mt-3">
            Staff have started on it, so it can&apos;t be changed here. Contact your staff contact
            for changes.
          </p>
        </section>
      ) : catalog.length === 0 ? (
        <p className="rounded-theme border-border bg-surface border p-4">
          There&apos;s no equipment to request online yet. Contact your staff contact.
        </p>
      ) : (
        <>
          <RequestForm
            action={saveRequestAction.bind(null, token)}
            sent={request?.status === "SUBMITTED"}
            note={request?.note ?? ""}
            sections={catalog.map(({ category, kinds }) => ({
              id: category.id,
              name: category.name,
              description: category.description,
              kinds: kinds.map((kind) => ({
                field: quantityField(kind),
                name: kind.name,
                available: kind.available,
                photoUrl: kind.photoId ? `/portal/${token}/photos/${kind.photoId}` : null,
                quantity: quantities.get(kindId(kind.categoryId, kind.key)) ?? 0,
              })),
            }))}
          />
          {request?.status === "SUBMITTED" ? (
            <ActionForm
              action={withdrawRequestAction.bind(null, token)}
              submitLabel="Withdraw request"
              pendingLabel="Withdrawing…"
              variant="secondary"
            />
          ) : null}
        </>
      )}
    </PortalShell>
  );
}
