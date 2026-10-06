import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CheckoutStatusBadge, PortalLinkBadge } from "@/components/status-badge";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { appTimeZone } from "@/lib/checkouts/overdue";
import { staffOptions } from "@/lib/data/checkouts";
import { getGuestGroup } from "@/lib/data/guest-groups";
import { formatDate } from "@/lib/format";
import {
  archiveGuestGroupAction,
  copyPortalLinkAction,
  restoreGuestGroupAction,
  revokePortalLinkAction,
  sendPortalLinkAction,
  updateGuestGroupAction,
} from "../actions";
import { GuestGroupFields, groupFieldLabels } from "../details-fields";
import { CopyPortalLink } from "./copy-link";

export const metadata: Metadata = { title: "Guest group" };

function formatTime(date: Date) {
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: appTimeZone(),
  });
}

export default async function GuestGroupPage({ params, searchParams }: PageProps<"/guests/[id]">) {
  const user = await requireUser();
  const group = await getGuestGroup(user, (await params).id);
  if (!group) notFound();
  const query = await searchParams;
  const canManage = canManageCheckout(user, group);
  const editable = canManage && !group.archivedAt;
  const staff = editable ? await staffOptions(group.organizationId, group.campusId) : [];
  const link = group.link;
  const lastDay = new Date(`${group.linkLastDay}T00:00:00Z`);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href="/guests" className="text-accent hover:underline">
          Back to guest groups
        </Link>
      </div>
      <PageHeader title={group.name}>
        <PortalLinkBadge status={group.archivedAt ? "archived" : (link?.status ?? null)} />
      </PageHeader>
      {query.created ? (
        <p role="status">Done: guest group saved. Send the representative a portal link.</p>
      ) : null}
      {group.archivedAt ? (
        <p role="status" className="font-semibold">
          This group is archived. Its portal link doesn&apos;t work.
        </p>
      ) : null}

      <Card>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Campus</dt>
            <dd>
              {group.campus.name} ({group.campus.code})
            </dd>
          </div>
          <div>
            <dt className="text-muted">Dates</dt>
            <dd>
              {formatDate(group.arrivalDate)} to {formatDate(group.departureDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Group representative</dt>
            <dd>
              {group.repName}
              <span className="block">{group.repEmail}</span>
              <span className="block">{group.repPhone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Staff contact</dt>
            <dd>{group.staffContact?.displayName ?? "Nobody (choose one below)"}</dd>
          </div>
          {group.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Notes</dt>
              <dd className="whitespace-pre-line">{group.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card title="Portal link">
        <div className="flex flex-col gap-3">
          {/* Live, since turning the link off removes the form that would announce it. */}
          {link ? (
            <p aria-live="polite">
              {link.status === "active"
                ? `The current link works until ${formatDate(lastDay)} (14 days after the group leaves).`
                : link.status === "expired"
                  ? `The link expired after ${formatDate(lastDay)}.`
                  : "The last link was turned off."}{" "}
              {link.sentTo ? `Emailed to ${link.sentTo}` : "Copied by staff"}{" "}
              {formatTime(link.createdAt)}
              {link.createdBy ? ` by ${link.createdBy.displayName}` : ""}.{" "}
              {link.lastUsedAt ? `Last opened ${formatTime(link.lastUsedAt)}.` : "Not opened yet."}
            </p>
          ) : (
            <p>No portal link yet.</p>
          )}
          {editable ? (
            <>
              <p className="text-muted">
                Making a new link, by email or to copy, turns off the previous one. Links
                aren&apos;t stored, so a copied link is shown only once.
              </p>
              <ActionForm
                action={sendPortalLinkAction.bind(null, group.id)}
                submitLabel={`Email a new link to ${group.repEmail}`}
                pendingLabel="Sending…"
              />
              <CopyPortalLink action={copyPortalLinkAction.bind(null, group.id)} />
              {link?.status === "active" ? (
                <ActionForm
                  action={revokePortalLinkAction.bind(null, group.id)}
                  submitLabel="Turn off the link"
                  pendingLabel="Turning off…"
                  variant="danger"
                />
              ) : null}
            </>
          ) : null}
        </div>
      </Card>

      <Card title="Check-outs">
        {group.checkouts.length > 0 ? (
          <ul className="mb-3 flex flex-col gap-1">
            {group.checkouts.map((checkout) => (
              <li key={checkout.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/checkouts/${checkout.id}`} className="text-accent hover:underline">
                  Check-out #{checkout.number}
                </Link>
                <CheckoutStatusBadge status={checkout.status} />
                <span className="text-muted">
                  {formatDate(checkout.dateOut)} to {formatDate(checkout.dateDue)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3">No check-outs for this group yet.</p>
        )}
        {editable ? (
          <Link href={`/checkouts/new?group=${group.id}`} className={buttonClass("secondary")}>
            New check-out for this group
          </Link>
        ) : null}
      </Card>

      {editable ? (
        <Card title="Edit details">
          <ActionForm
            action={updateGuestGroupAction.bind(null, group.id)}
            submitLabel="Save details"
            fieldLabels={groupFieldLabels}
            resetOnSuccess={false}
          >
            <GuestGroupFields staff={staff} values={group} idPrefix="edit" />
          </ActionForm>
        </Card>
      ) : null}

      {canManage ? (
        <Card title={group.archivedAt ? "Restore" : "Archive"}>
          {group.archivedAt ? (
            <ActionForm
              action={restoreGuestGroupAction.bind(null, group.id)}
              submitLabel="Restore this group"
              variant="secondary"
            />
          ) : (
            <>
              <p className="mb-3">
                Archiving hides the group from the lists and turns its portal link off. Its
                check-outs aren&apos;t affected.
              </p>
              <ActionForm
                action={archiveGuestGroupAction.bind(null, group.id)}
                submitLabel="Archive this group"
                variant="danger"
              />
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
