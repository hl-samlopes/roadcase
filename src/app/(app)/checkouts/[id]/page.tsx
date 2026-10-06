import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CheckoutStatusBadge } from "@/components/status-badge";
import { Card, PageHeader, TextField } from "@/components/ui";
import { can, canManageCheckout, checkoutScope, requireUser } from "@/lib/authz";
import { appTimeZone, dateInZone, daysOverdue } from "@/lib/checkouts/overdue";
import { activeContract } from "@/lib/data/contract-records";
import { checkoutHistory } from "@/lib/data/checkout-history";
import { latestTemplateVersion } from "@/lib/data/contracts";
import {
  feeTotalCents,
  getCheckout,
  searchItemsForCheckout,
  staffOptions,
} from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { ticketStatusLabels } from "@/lib/labels";
import {
  addItemByIdAction,
  addItemsAction,
  cancelCheckoutAction,
  removeLineAction,
  saveFeesAction,
  updateCheckoutAction,
} from "../actions";
import { CheckoutDetailsFields, detailFieldLabels } from "../details-fields";
import { checkInAction } from "../return-actions";
import { CheckInFields } from "./check-in-fields";
import { ContractPanel } from "./contract-panel";

export const metadata: Metadata = { title: "Check-out" };

const inline = "flex flex-col items-start gap-1";

function formatTime(date: Date, timeZone: string) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone });
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/checkouts/[id]">) {
  const user = await requireUser();
  const checkout = await getCheckout(user, (await params).id);
  if (!checkout) notFound();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";

  const canManage = canManageCheckout(user, checkout);
  const editable = checkout.status === "DRAFT" && canManage;
  const cancellable =
    canManage && (checkout.status === "DRAFT" || checkout.status === "AWAITING_SIGNATURES");
  const isOut = checkout.status === "OUT" || checkout.status === "PARTIALLY_RETURNED";
  const checkingIn = canManage && isOut;
  const [staff, results, contract, template, conditions, history, returnTickets] =
    await Promise.all([
      editable ? staffOptions(checkout.organizationId, checkout.campusId) : [],
      editable && q ? searchItemsForCheckout(user, checkout, q) : [],
      activeContract(checkout.organizationId, checkout.id),
      editable ? latestTemplateVersion(checkout.organizationId, checkout.campusId) : null,
      checkingIn
        ? db.itemCondition.findMany({
            where: { organizationId: checkout.organizationId, archivedAt: null },
            orderBy: [{ position: "asc" }, { label: "asc" }],
            select: { id: true, label: true, startsRepairTicket: true },
          })
        : [],
      checkoutHistory(checkout.organizationId, checkout.id),
      db.serviceTicket.findMany({
        where: { checkoutId: checkout.id },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          organizationId: true,
          campusId: true,
          locationId: true,
          departmentId: true,
          item: { select: { code: true } },
        },
      }),
    ]);
  const visibleTickets = returnTickets.filter((ticket) => can(user, "ticket:read", ticket));
  const timeZone = appTimeZone();
  const overdueDays = daysOverdue(checkout, dateInZone(new Date(), timeZone));
  const outstanding = checkout.lines.filter((line) => !line.returnedAt);
  const showReturns = isOut || checkout.status === "RETURNED";
  const totalCents = feeTotalCents(checkout.lines);
  const lineCount = checkout.lines.length;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href="/checkouts" className="text-accent hover:underline">
          Back to check-outs
        </Link>
      </div>
      <PageHeader title={`Check-out #${checkout.number}: ${checkout.groupName}`}>
        <CheckoutStatusBadge status={checkout.status} />
      </PageHeader>
      {overdueDays > 0 ? (
        <p role="status" className="border-bad rounded-theme border p-2 font-semibold">
          Overdue: due back {formatDate(checkout.dateDue)}, {overdueDays} day
          {overdueDays === 1 ? "" : "s"} ago. {outstanding.length} item
          {outstanding.length === 1 ? " is" : "s are"} still out.
        </p>
      ) : null}
      {checkout.status === "CANCELLED" ? (
        <p role="status" className="font-semibold">
          This check-out was cancelled. Its items are free for other check-outs.
        </p>
      ) : null}
      {query.created ? (
        <p role="status">
          Done: draft check-out #{checkout.number} created. Add items by scanning or searching.
        </p>
      ) : null}

      <Card>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Campus</dt>
            <dd>
              {checkout.campus.name} ({checkout.campus.code})
            </dd>
          </div>
          <div>
            <dt className="text-muted">Dates</dt>
            <dd>
              {formatDate(checkout.dateOut)} to {formatDate(checkout.dateDue)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Guest representative</dt>
            <dd>
              {checkout.guestRepName}
              <span className="block">{checkout.guestRepEmail}</span>
              <span className="block">{checkout.guestRepPhone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Staff representative</dt>
            <dd>{checkout.staffRep?.displayName ?? "Nobody (choose one below)"}</dd>
          </div>
          {checkout.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Notes</dt>
              <dd className="whitespace-pre-line">{checkout.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {checkingIn && outstanding.length > 0 ? (
        <Card title="Check items in">
          <p className="mb-3">
            Tick what came back, set each item&apos;s condition and add any notes. A condition that
            opens a repair ticket opens one for that item with your notes.
          </p>
          <ActionForm
            action={checkInAction.bind(null, checkout.id)}
            submitLabel="Check in ticked items"
            pendingLabel="Checking in…"
            className="flex flex-col gap-3"
          >
            <CheckInFields
              key={outstanding.map((line) => line.id).join()}
              lines={outstanding.map((line) => ({
                id: line.id,
                code: line.item.code,
                name: line.item.name,
                conditionId: line.item.conditionId,
              }))}
              conditions={conditions}
            />
          </ActionForm>
        </Card>
      ) : null}

      <ContractPanel
        checkout={checkout}
        contract={contract}
        hasTemplate={!!template}
        canManage={canManage}
        canAudit={can(user, "checkout:audit", checkoutScope(checkout))}
      />

      {editable ? (
        <Card title="Add items">
          <ActionForm
            action={addItemsAction.bind(null, checkout.id)}
            submitLabel="Add"
            pendingLabel="Adding…"
            fieldLabels={{ codes: "Item codes" }}
            className="flex flex-col gap-3"
          >
            {/* Barcode scanners type the code and press Enter, which submits. */}
            <TextField
              label="Scan or type item codes"
              name="codes"
              id="checkout-codes"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              placeholder={`${checkout.campus.code}-000123`}
              hint="Scan items one after another, or paste several codes separated by spaces."
            />
          </ActionForm>

          <form
            method="get"
            className="border-border mt-4 flex flex-wrap items-end gap-2 border-t pt-4"
          >
            <TextField
              label="Or search this campus's equipment"
              name="q"
              id="checkout-search"
              type="search"
              defaultValue={q}
            />
            <button type="submit" className="text-accent self-end py-2 hover:underline">
              Search
            </button>
          </form>
          {q ? (
            results.length === 0 ? (
              <p className="text-muted mt-2">
                Nothing at {checkout.campus.code} matches “{q}”.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2" aria-label="Search results">
                {results.map((result) => (
                  <li
                    key={result.id}
                    className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                  >
                    <span>
                      <span className="font-mono">{result.code}</span> {result.name}{" "}
                      <span className="text-muted">({result.condition})</span>
                      {result.refusal ? (
                        <span className="text-muted block">Can&apos;t add: {result.refusal}</span>
                      ) : null}
                    </span>
                    {result.onThisCheckout ? (
                      <span className="font-semibold">On this check-out</span>
                    ) : result.refusal ? null : (
                      <ActionForm
                        action={addItemByIdAction.bind(null, checkout.id, result.id)}
                        submitLabel={`Add ${result.code}`}
                        pendingLabel="Adding…"
                        variant="secondary"
                        className={inline}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-xl">
          Items ({lineCount})
        </h2>
        {lineCount === 0 ? (
          <p className="text-muted">No items yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="rounded-theme border-border bg-surface w-full border-collapse border">
                <thead>
                  <tr className="border-border text-muted border-b text-left">
                    <th className="p-2">Code</th>
                    <th className="p-2">Item</th>
                    <th className="p-2">Condition</th>
                    <th className="p-2">Fee (optional)</th>
                    {showReturns ? <th className="p-2">Back</th> : null}
                    {editable ? (
                      <th className="p-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {checkout.lines.map((line) => (
                    <tr key={line.id} className="border-border border-b last:border-0">
                      <td className="p-2 font-mono whitespace-nowrap">{line.item.code}</td>
                      <td className="p-2">
                        <Link
                          href={`/items/${line.item.id}`}
                          className="text-accent hover:underline"
                        >
                          {line.item.name}
                        </Link>
                      </td>
                      <td className="p-2">{line.item.condition.label}</td>
                      <td className="p-2">
                        {editable ? (
                          <>
                            <label htmlFor={`fee-${line.id}`} className="sr-only">
                              Fee for {line.item.code} {line.item.name}
                            </label>
                            <input
                              id={`fee-${line.id}`}
                              name={`fee-${line.id}`}
                              form="fees-form"
                              inputMode="decimal"
                              defaultValue={line.fee?.toString() ?? ""}
                              placeholder="None"
                              className="rounded-theme border-border bg-surface text-text focus-visible:outline-accent min-h-10 w-28 border px-2 py-1.5 focus-visible:outline-2"
                            />
                          </>
                        ) : line.fee === null ? (
                          <span className="text-muted">None</span>
                        ) : (
                          formatMoney(line.fee)
                        )}
                      </td>
                      {showReturns ? (
                        <td className="p-2">
                          {line.returnedAt ? (
                            <>
                              {formatTime(line.returnedAt, timeZone)}
                              <span className="block">
                                {line.returnCondition?.label ?? "Condition not recorded"}
                                {line.returnNotes ? `: ${line.returnNotes}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="font-semibold">Not back yet</span>
                          )}
                        </td>
                      ) : null}
                      {editable ? (
                        <td className="p-2">
                          <ActionForm
                            action={removeLineAction.bind(null, checkout.id, line.id)}
                            submitLabel={`Remove ${line.item.code}`}
                            pendingLabel="Removing…"
                            variant="secondary"
                            className={inline}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <span className="font-semibold">Total fees:</span>{" "}
              {totalCents === 0 ? "None" : formatMoney((totalCents / 100).toFixed(2))}
            </p>
            {editable ? (
              <ActionForm
                id="fees-form"
                action={saveFeesAction.bind(null, checkout.id)}
                submitLabel="Save fees"
                variant="secondary"
                resetOnSuccess={false}
                className={inline}
              />
            ) : null}
          </>
        )}
      </section>

      {editable ? (
        <>
          <Card title="Edit details">
            <ActionForm
              action={updateCheckoutAction.bind(null, checkout.id)}
              submitLabel="Save details"
              fieldLabels={detailFieldLabels}
              resetOnSuccess={false}
            >
              <CheckoutDetailsFields staff={staff} values={checkout} idPrefix="edit" />
            </ActionForm>
          </Card>
        </>
      ) : null}
      {visibleTickets.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="return-tickets-heading">
          <h2 id="return-tickets-heading" className="text-xl">
            Repair tickets from this check-out
          </h2>
          <ul className="flex flex-col gap-1">
            {visibleTickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="text-accent hover:underline">
                  #{ticket.number} {ticket.title}
                </Link>{" "}
                <span className="text-muted">
                  ({ticket.item.code}, {ticketStatusLabels[ticket.status]})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-xl">
          History
        </h2>
        <ol className="flex flex-col gap-2">
          {history.map((entry, index) => (
            <li key={index}>
              <span className="text-muted">{formatTime(entry.at, timeZone)}</span> {entry.text}
              {entry.details.length > 0 ? (
                <ul className="list-disc pl-5">
                  {entry.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {cancellable ? (
        <Card title="Cancel this check-out">
          <p className="mb-3">
            Cancelling releases its items for other check-outs. A cancelled check-out can&apos;t be
            reopened.
          </p>
          <ActionForm
            action={cancelCheckoutAction.bind(null, checkout.id)}
            submitLabel={`Cancel check-out #${checkout.number}`}
            pendingLabel="Cancelling…"
            variant="danger"
            className={inline}
          />
        </Card>
      ) : null}
    </div>
  );
}
