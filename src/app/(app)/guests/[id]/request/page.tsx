import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CheckoutStatusBadge, RequestStatusBadge } from "@/components/status-badge";
import { buttonClass, Card, controlClass, PageHeader, TextAreaField } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { appTimeZone } from "@/lib/checkouts/overdue";
import { getRequestForReview } from "@/lib/data/requests";
import { formatDate } from "@/lib/format";
import { requestStatusLabels } from "@/lib/portal/request-labels";
import { waitingStatuses } from "@/lib/portal/requests";
import { reopenReviewAction, saveReviewAction } from "./actions";

export const metadata: Metadata = { title: "Equipment request" };

function formatTime(date: Date) {
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: appTimeZone(),
  });
}

export default async function RequestReviewPage({
  params,
  searchParams,
}: PageProps<"/guests/[id]/request">) {
  const user = await requireUser();
  const review = await getRequestForReview(user, (await params).id);
  if (!review) notFound();
  const justSent = (await searchParams).sent === "1";
  const { group, request } = review;
  const canManage = canManageCheckout(user, group) && !group.archivedAt;
  const waiting = request ? waitingStatuses.includes(request.status) : false;
  const decided =
    request?.status === "APPROVED" ||
    request?.status === "PARTLY_APPROVED" ||
    request?.status === "DECLINED";
  const activeCheckout =
    request?.checkout && request.checkout.status !== "CANCELLED" ? request.checkout : null;
  const approvedCount =
    request?.lines.reduce((sum, line) => sum + (line.quantityApproved ?? 0), 0) ?? 0;

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <Link href={`/guests/${group.id}`} className="text-accent hover:underline">
          Back to {group.name}
        </Link>
      </div>
      <PageHeader title={`Equipment request: ${group.name}`}>
        {request ? <RequestStatusBadge status={request.status} /> : null}
      </PageHeader>
      <p>
        {group.campus.name} ({group.campus.code}), {formatDate(group.arrivalDate)} to{" "}
        {formatDate(group.departureDate)}. Representative: {group.repName}, {group.repEmail}.
      </p>

      {justSent && request ? (
        <p role="status">
          Done: {requestStatusLabels[request.status]}. We emailed {group.repEmail} the decision.
        </p>
      ) : null}
      {!request ? (
        <p>The group hasn&apos;t sent a request.</p>
      ) : (
        <>
          <p className="text-muted">
            Sent {request.submittedAt ? formatTime(request.submittedAt) : ""}
            {request.decidedAt
              ? `. Decided ${formatTime(request.decidedAt)}${request.decidedBy ? ` by ${request.decidedBy.displayName}` : ""}`
              : ""}
            .
          </p>
          {request.status === "WITHDRAWN" ? (
            <p role="status" className="font-semibold">
              The group withdrew this request. They can change it and send it again.
            </p>
          ) : null}
          {request.note ? (
            <p className="whitespace-pre-line">
              <span className="text-muted">Group&apos;s note:</span> {request.note}
            </p>
          ) : null}

          {waiting && canManage ? (
            <Card title="Review">
              <p className="mb-3">
                Enter how many of each to approve; 0 declines that line. &quot;Free&quot; counts
                what isn&apos;t on an overlapping check-out or approved for another group. Saving or
                sending stops the group changing its request.
              </p>
              <ActionForm
                action={saveReviewAction.bind(null, group.id)}
                submitLabel="Send decision to the group"
                pendingLabel="Saving…"
                intent="send"
                secondary={{ label: "Save without sending", intent: "save" }}
                resetOnSuccess={false}
              >
                <input
                  type="hidden"
                  name="submittedAt"
                  value={request.submittedAt?.toISOString() ?? ""}
                />
                <div className="overflow-x-auto">
                  <table aria-label="Requested items" className="w-full border-collapse">
                    <thead>
                      <tr className="border-border text-muted border-b text-left">
                        <th className="p-2">Item</th>
                        <th className="p-2">Asked for</th>
                        <th className="p-2">Free</th>
                        <th className="p-2">Approve</th>
                        <th className="p-2">Note to the group</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.lines.map((line) => (
                        <tr
                          key={line.id}
                          className="border-border border-b align-top last:border-0"
                        >
                          <td className="p-2">
                            <span className="font-semibold">{line.name}</span>
                            <span className="text-muted block">{line.category.name}</span>
                          </td>
                          <td className="p-2">{line.quantityRequested}</td>
                          <td className="p-2">{line.free}</td>
                          <td className="p-2">
                            <label htmlFor={`approved-${line.id}`} className="sr-only">
                              Approve how many {line.name}
                            </label>
                            <input
                              id={`approved-${line.id}`}
                              name={`approved-${line.id}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              defaultValue={line.quantityApproved ?? ""}
                              className={`${controlClass} w-20`}
                            />
                          </td>
                          <td className="p-2">
                            <label htmlFor={`note-${line.id}`} className="sr-only">
                              Note to the group about {line.name}
                            </label>
                            <input
                              id={`note-${line.id}`}
                              name={`note-${line.id}`}
                              maxLength={500}
                              defaultValue={line.staffNote ?? ""}
                              autoComplete="off"
                              className={`${controlClass} w-full min-w-48`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TextAreaField
                  label="Message to the group (optional)"
                  name="staffMessage"
                  id="staff-message"
                  rows={3}
                  maxLength={2000}
                  defaultValue={request.staffMessage ?? ""}
                />
              </ActionForm>
            </Card>
          ) : (
            <Card title="Items">
              <div className="overflow-x-auto">
                <table aria-label="Requested items" className="w-full border-collapse">
                  <thead>
                    <tr className="border-border text-muted border-b text-left">
                      <th className="p-2">Item</th>
                      <th className="p-2">Asked for</th>
                      <th className="p-2">Approved</th>
                      <th className="p-2">Note to the group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.lines.map((line) => (
                      <tr key={line.id} className="border-border border-b last:border-0">
                        <td className="p-2">
                          {line.name} <span className="text-muted">({line.category.name})</span>
                        </td>
                        <td className="p-2">{line.quantityRequested}</td>
                        <td className="p-2">{line.quantityApproved ?? "Not decided"}</td>
                        <td className="p-2">{line.staffNote ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {request.staffMessage ? (
                <p className="mt-3 whitespace-pre-line">
                  <span className="text-muted">Message to the group:</span> {request.staffMessage}
                </p>
              ) : null}
            </Card>
          )}

          {decided ? (
            <Card title="Check-out">
              {activeCheckout ? (
                <p className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/checkouts/${activeCheckout.id}`}
                    className="text-accent hover:underline"
                  >
                    Check-out #{activeCheckout.number}
                  </Link>
                  <CheckoutStatusBadge status={activeCheckout.status} />
                  was made from this request.
                </p>
              ) : canManage ? (
                <div className="flex flex-col gap-3">
                  {approvedCount > 0 ? (
                    <div>
                      <Link
                        href={`/guests/${group.id}/request/checkout`}
                        className={buttonClass("primary")}
                      >
                        Create check-out draft
                      </Link>
                    </div>
                  ) : (
                    <p>Nothing was approved, so there&apos;s nothing to check out.</p>
                  )}
                  <ActionForm
                    action={reopenReviewAction.bind(null, group.id)}
                    submitLabel="Reopen review"
                    pendingLabel="Reopening…"
                    variant="secondary"
                  />
                </div>
              ) : (
                <p>No check-out yet.</p>
              )}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
