import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CheckoutStatusBadge } from "@/components/status-badge";
import { Card, PageHeader, TextField } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import {
  feeTotalCents,
  getCheckout,
  searchItemsForCheckout,
  staffOptions,
} from "@/lib/data/checkouts";
import { formatDate, formatMoney } from "@/lib/format";
import {
  addItemByIdAction,
  addItemsAction,
  cancelCheckoutAction,
  removeLineAction,
  saveFeesAction,
  updateCheckoutAction,
} from "../actions";
import { CheckoutDetailsFields, detailFieldLabels } from "../details-fields";

export const metadata: Metadata = { title: "Check-out" };

const inline = "flex flex-col items-start gap-1";

export default async function CheckoutPage({ params, searchParams }: PageProps<"/checkouts/[id]">) {
  const user = await requireUser();
  const checkout = await getCheckout(user, (await params).id);
  if (!checkout) notFound();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";

  const editable = checkout.status === "DRAFT" && canManageCheckout(user, checkout);
  const [staff, results] = await Promise.all([
    editable ? staffOptions(checkout.organizationId, checkout.campusId) : [],
    editable && q ? searchItemsForCheckout(user, checkout, q) : [],
  ]);
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
          <Card title="Cancel this check-out">
            <p className="mb-3">
              Cancelling releases its items for other check-outs. A cancelled check-out can&apos;t
              be reopened.
            </p>
            <ActionForm
              action={cancelCheckoutAction.bind(null, checkout.id)}
              submitLabel={`Cancel check-out #${checkout.number}`}
              pendingLabel="Cancelling…"
              variant="danger"
              className={inline}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
