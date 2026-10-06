import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Barcode } from "@/components/barcode";
import { StatusBadge } from "@/components/status-badge";
import { LocalDateField } from "@/components/local-date-field";
import { buttonClass, Card, PageHeader, TextAreaField, TextField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { attachmentUrl } from "@/lib/data/attachments";
import { activeFields, getItem, itemHistoryCounts } from "@/lib/data/items";
import { acceptedUploadTypes } from "@/lib/files";
import { formatBytes, formatDate, formatMoney } from "@/lib/format";
import { formatCustomFieldValue } from "@/lib/items/custom-fields";
import { serviceTypeSuggestions } from "@/lib/labels";
import {
  deleteAttachmentAction,
  deleteItemAction,
  logServiceAction,
  setPrimaryPhotoAction,
  uploadAttachmentAction,
} from "../actions";

export const metadata: Metadata = { title: "Item" };

const inline = "flex flex-col items-start gap-1";

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const user = await requireUser();
  const item = await getItem(user, (await params).id);
  if (!item) notFound();
  const { created, saved, ticket: openedTicket } = await searchParams;
  const editable = can(user, "item:update", item);
  const canReport = can(user, "ticket:submit", item);
  const canLogService = can(user, "serviceLog:manage", item);
  const canDelete = can(user, "item:delete", item);
  const history = canDelete ? await itemHistoryCounts(item.id) : null;
  // Closed tickets keep the home they had, so check each one.
  const tickets = item.serviceTickets.filter((ticket) => can(user, "ticket:read", ticket));
  const fields = await activeFields(user.organizationId);
  const custom = (item.customFields ?? {}) as Record<string, unknown>;

  const photos = item.attachments.filter((a) => a.kind === "PHOTO");
  const documents = item.attachments.filter((a) => a.kind === "DOCUMENT");
  const rows: [string, string][] = [
    [
      "Category",
      item.subcategory ? `${item.category.name} / ${item.subcategory.name}` : item.category.name,
    ],
    ["Campus", `${item.campus.name} (${item.campus.code})`],
    ["Location", item.location.name],
    ["Department", item.department.name],
    ["Condition", `${item.condition.label}${item.condition.archivedAt ? " (archived)" : ""}`],
    ["Price", formatMoney(item.price) || "Not set"],
    ...fields.map((field): [string, string] => [
      field.label,
      formatCustomFieldValue(field, custom[field.key]) || "Not set",
    ]),
    ["Notes", item.notes ?? "None"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/items" className="text-accent hover:underline">
          Back to inventory
        </Link>
      </div>
      <PageHeader title={item.name}>
        <div className="flex flex-wrap gap-2">
          {canReport ? (
            <Link href={`/tickets/new?item=${item.id}`} className={buttonClass("secondary")}>
              Report a problem
            </Link>
          ) : null}
          <Link href={`/items/labels?id=${item.id}`} className={buttonClass("secondary")}>
            Print label
          </Link>
          {editable ? (
            <Link href={`/items/${item.id}/edit`} className={buttonClass("primary")}>
              Edit item
            </Link>
          ) : null}
        </div>
      </PageHeader>
      {created === "1" || saved === "1" ? (
        <p role="status" className="rounded-theme border-border bg-surface border p-2">
          Done: {created === "1" ? `created ${item.code}.` : "changes saved."}
          {typeof openedTicket === "string" && /^\d+$/.test(openedTicket)
            ? ` Repair ticket #${openedTicket} was opened.`
            : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="flex flex-col gap-4">
          {/* No placeholder card without a photo; it only pushed details down on phones. */}
          {item.primaryPhotoId ? (
            <Card>
              <a href={attachmentUrl(item.primaryPhotoId)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the permission-checked attachment route */}
                <img
                  src={attachmentUrl(item.primaryPhotoId)}
                  alt={`Photo of ${item.name}`}
                  className="rounded-theme max-h-72 w-full object-contain"
                />
              </a>
            </Card>
          ) : null}
          <Card title="Code">
            <Barcode value={item.code} className="h-16 w-full" />
            <p className="mt-1 text-center font-mono text-base">{item.code}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Details">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Photos and documents">
            {item.attachments.length === 0 ? <p className="text-muted mb-3">None yet.</p> : null}
            {photos.length > 0 ? (
              <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <li key={photo.id} className="flex flex-col gap-1">
                    <a href={attachmentUrl(photo.id)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachmentUrl(photo.id)}
                        alt={photo.fileName}
                        className="rounded-theme border-border aspect-square w-full border object-cover"
                      />
                    </a>
                    <span className="truncate" title={photo.fileName}>
                      {photo.fileName}
                      {photo.id === item.primaryPhotoId ? " (main photo)" : ""}
                    </span>
                    {editable ? (
                      <div className="flex flex-wrap gap-1">
                        {photo.id === item.primaryPhotoId ? null : (
                          <ActionForm
                            action={setPrimaryPhotoAction.bind(null, item.id, photo.id)}
                            submitLabel="Make main photo"
                            variant="secondary"
                            className={inline}
                          />
                        )}
                        <ActionForm
                          action={deleteAttachmentAction.bind(null, item.id, photo.id)}
                          submitLabel={`Delete ${photo.fileName}`}
                          pendingLabel="Deleting…"
                          variant="danger"
                          className={inline}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {documents.length > 0 ? (
              <ul className="mb-3 flex flex-col gap-2">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <a href={attachmentUrl(document.id)} className="text-accent hover:underline">
                      {document.fileName}
                    </a>
                    <span className="text-muted">PDF · {formatBytes(document.sizeBytes)}</span>
                    {editable ? (
                      <ActionForm
                        action={deleteAttachmentAction.bind(null, item.id, document.id)}
                        submitLabel={`Delete ${document.fileName}`}
                        pendingLabel="Deleting…"
                        variant="danger"
                        className={inline}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {editable ? (
              <div className="border-border border-t pt-3">
                <ActionForm
                  action={uploadAttachmentAction.bind(null, item.id)}
                  submitLabel="Upload"
                  pendingLabel="Uploading…"
                  fieldLabels={{ file: "File" }}
                  className="flex flex-wrap items-end gap-2"
                >
                  <TextField
                    label="Add a photo or document"
                    name="file"
                    type="file"
                    accept={acceptedUploadTypes}
                    hint="Photos: JPEG, PNG or WebP up to 10 MB. Documents: PDF up to 20 MB."
                    required
                  />
                </ActionForm>
              </div>
            ) : null}
          </Card>

          <Card title="Tickets">
            {tickets.length === 0 ? (
              <p className="text-muted">No tickets.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/tickets/${ticket.id}`} className="text-accent hover:underline">
                      #{ticket.number} {ticket.title}
                    </Link>
                    <StatusBadge status={ticket.status} />
                    <span className="text-muted">{formatDate(ticket.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Service history">
            {canLogService ? (
              <details className="border-border rounded-theme mb-3 border p-3">
                <summary className="text-accent cursor-pointer font-semibold">
                  Log service without a ticket
                </summary>
                <ActionForm
                  action={logServiceAction.bind(null, item.id)}
                  submitLabel="Log service"
                  pendingLabel="Saving…"
                  fieldLabels={{
                    serviceDate: "Service date",
                    serviceType: "Service type",
                    cost: "Cost",
                    notes: "Notes",
                    file: "Receipt or report",
                  }}
                  className="mt-3 flex flex-col gap-3"
                >
                  <LocalDateField
                    label="Service date"
                    name="serviceDate"
                    id="log-service-date"
                    required
                  />
                  <TextField
                    label="Service type"
                    name="serviceType"
                    id="log-service-type"
                    list="log-service-types"
                    maxLength={80}
                    defaultValue="Inspection"
                    required
                  />
                  <datalist id="log-service-types">
                    {serviceTypeSuggestions.map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>
                  <TextField
                    label="Cost"
                    name="cost"
                    id="log-service-cost"
                    inputMode="decimal"
                    hint="In dollars. Optional."
                  />
                  <TextAreaField
                    label="Notes"
                    name="notes"
                    id="log-service-notes"
                    maxLength={5000}
                  />
                  <TextField
                    label="Receipt or report"
                    name="file"
                    id="log-service-file"
                    type="file"
                    accept={acceptedUploadTypes}
                    hint="Optional."
                  />
                </ActionForm>
              </details>
            ) : null}
            {item.serviceLogs.length === 0 ? (
              <p className="text-muted">No service recorded yet.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-border text-muted border-b text-left">
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Cost</th>
                      <th className="p-2">Notes</th>
                      <th className="p-2">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.serviceLogs.map((log) => (
                      <tr key={log.id} className="border-border border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{formatDate(log.serviceDate)}</td>
                        <td className="p-2">{log.serviceType}</td>
                        <td className="p-2">{formatMoney(log.cost)}</td>
                        <td className="p-2">{log.notes}</td>
                        <td className="p-2">
                          {log.ticket ? (
                            <Link
                              href={`/tickets/${log.ticket.id}`}
                              className="text-accent hover:underline"
                            >
                              #{log.ticket.number}
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {history ? (
            <Card title="Delete item">
              {history.any ? (
                <p className="text-muted">
                  This item has history (
                  {[
                    history.checkouts ? "check-outs" : null,
                    history.tickets ? "tickets" : null,
                    history.serviceLogs ? "service logs" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  ), so it can&apos;t be deleted. To take it out of use, edit it and change its
                  condition, for example to the one your organization uses for retired equipment.
                </p>
              ) : (
                <details>
                  <summary className="text-bad cursor-pointer font-semibold">
                    Delete this item…
                  </summary>
                  <p className="my-3">
                    {item.code} has no check-outs, tickets or service logs, so it can be deleted
                    with its photos and documents. This can&apos;t be undone, and the code
                    won&apos;t be reused.
                  </p>
                  <ActionForm
                    action={deleteItemAction.bind(null, item.id)}
                    submitLabel={`Delete ${item.code} permanently`}
                    pendingLabel="Deleting…"
                    variant="danger"
                    className={inline}
                  />
                </details>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
