import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { itemsForNewCheckout } from "@/lib/data/checkouts";
import { getRequestForReview } from "@/lib/data/requests";
import { formatDate } from "@/lib/format";
import { kindKey } from "@/lib/portal/catalog";
import { createCheckoutFromRequestAction } from "../actions";

export const metadata: Metadata = { title: "Create check-out from request" };

/**
 * Staff choose the actual items for each approved line. The first free ones
 * are ticked to start with; items on another check-out or in a condition
 * that can't go out are listed but can't be chosen.
 */
export default async function RequestCheckoutPage({
  params,
}: PageProps<"/guests/[id]/request/checkout">) {
  const user = await requireUser();
  const review = await getRequestForReview(user, (await params).id);
  const request = review?.request;
  if (!review || !request || !canManageCheckout(user, review.group) || review.group.archivedAt) {
    notFound();
  }
  const { group } = review;
  if (request.status !== "APPROVED" && request.status !== "PARTLY_APPROVED") notFound();
  if (request.checkout && request.checkout.status !== "CANCELLED") notFound();

  const lines = request.lines.filter((line) => (line.quantityApproved ?? 0) > 0);
  const items = await itemsForNewCheckout(
    user,
    group,
    lines.map((line) => line.categoryId),
  );

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href={`/guests/${group.id}/request`} className="text-accent hover:underline">
          Back to the request
        </Link>
      </div>
      <PageHeader title={`Check-out for ${group.name}`} />
      <p>
        A draft check-out for {formatDate(group.arrivalDate)} to {formatDate(group.departureDate)}{" "}
        with the group&apos;s details. Choose which items go on it, up to what was approved; you can
        add more to the draft afterwards.
      </p>
      <ActionForm
        action={createCheckoutFromRequestAction.bind(null, group.id)}
        submitLabel="Create draft check-out"
        pendingLabel="Creating…"
        resetOnSuccess={false}
        className="flex flex-col gap-4"
      >
        {lines.map((line) => {
          const kind = items.filter(
            (item) => item.categoryId === line.categoryId && kindKey(item.name) === line.kindKey,
          );
          const approved = line.quantityApproved ?? 0;
          const preselected = new Set(
            kind
              .filter((item) => !item.refusal)
              .slice(0, approved)
              .map((item) => item.id),
          );
          return (
            <Card key={line.id} title={`${line.name}: ${approved} approved`}>
              {kind.length === 0 ? (
                <p>There are no {line.name} items at this campus you can see.</p>
              ) : (
                <fieldset>
                  <legend className="sr-only">Choose {line.name} items</legend>
                  <ul className="flex flex-col gap-1">
                    {kind.map((item) => (
                      <li key={item.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          name="item"
                          value={item.id}
                          id={`item-${item.id}`}
                          defaultChecked={preselected.has(item.id)}
                          disabled={!!item.refusal}
                          className="accent-accent mt-1 h-5 w-5"
                        />
                        <label htmlFor={`item-${item.id}`}>
                          <span className="font-mono">{item.code}</span> {item.name}{" "}
                          <span className="text-muted">({item.condition})</span>
                          {item.refusal ? (
                            <span className="text-muted block">Can&apos;t use: {item.refusal}</span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                  {preselected.size < approved ? (
                    <p className="text-bad mt-2 font-semibold">
                      Only {preselected.size} can go on a check-out now.
                    </p>
                  ) : null}
                </fieldset>
              )}
            </Card>
          );
        })}
      </ActionForm>
    </div>
  );
}
