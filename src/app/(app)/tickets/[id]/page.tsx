import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, PageHeader, SelectField, TextAreaField, TextField } from "@/components/ui";
import { can, canCommentOnTicket, isTicketClosed, requireUser } from "@/lib/authz";
import { attachmentUrl } from "@/lib/data/attachments";
import {
  activeDepartments,
  assignableUsers,
  assigneeLabel,
  getTicket,
  openTicketStatuses,
  type TicketDetail,
} from "@/lib/data/tickets";
import { db } from "@/lib/db";
import { acceptedUploadTypes } from "@/lib/files";
import { serviceTypeSuggestions, ticketStatusLabels } from "@/lib/labels";
import {
  assignAction,
  cancelTicketAction,
  commentAction,
  completeTicketAction,
  reopenTicketAction,
  setStatusAction,
} from "../actions";

export const metadata: Metadata = { title: "Ticket" };

function when(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function describeEvent(event: TicketDetail["events"][number]) {
  const who = event.actor?.displayName ?? "Someone";
  switch (event.type) {
    case "CREATED":
      return `${who} opened the ticket`;
    case "STATUS_CHANGED":
      return `${who} changed the status from ${event.fromStatus ? ticketStatusLabels[event.fromStatus] : "none"} to ${event.toStatus ? ticketStatusLabels[event.toStatus] : "none"}`;
    case "ASSIGNED":
      return `${who} updated the assignment`;
    case "COMMENT":
      return `${who} commented`;
    case "ATTACHMENT_ADDED":
      return `${who} added a file`;
  }
}

export default async function TicketPage({ params, searchParams }: PageProps<"/tickets/[id]">) {
  const user = await requireUser();
  const ticket = await getTicket(user, (await params).id);
  if (!ticket) notFound();
  const { created } = await searchParams;

  const closed = isTicketClosed(ticket.status);
  const manage = can(user, "ticket:manage", ticket);
  const comment = canCommentOnTicket(user, ticket);
  const [people, departments, conditions, log] = await Promise.all([
    manage && !closed ? assignableUsers(user, ticket) : [],
    manage && !closed ? activeDepartments(user.organizationId) : [],
    manage && !closed
      ? db.itemCondition.findMany({
          where: {
            organizationId: user.organizationId,
            archivedAt: null,
            startsRepairTicket: false,
          },
          orderBy: [{ position: "asc" }, { label: "asc" }],
          select: { id: true, label: true, isDefault: true },
        })
      : [],
    ticket.serviceLog
      ? db.serviceLog.findUnique({
          where: { id: ticket.serviceLog.id },
          select: {
            serviceDate: true,
            serviceType: true,
            cost: true,
            notes: true,
            attachments: { select: { id: true, fileName: true } },
          },
        })
      : null,
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const defaultCondition = conditions.find((c) => c.isDefault)?.id ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/tickets" className="text-accent hover:underline">
          Back to tickets
        </Link>
      </div>
      <PageHeader title={`#${ticket.number} ${ticket.title}`}>
        <StatusBadge status={ticket.status} />
      </PageHeader>
      {created === "1" ? (
        <p role="status" className="rounded-theme border-border bg-surface border p-2">
          Done: ticket #{ticket.number} submitted.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="flex flex-col gap-4">
          <Card title="Details">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted">Item</dt>
              <dd>
                <Link href={`/items/${ticket.item.id}`} className="text-accent hover:underline">
                  <span className="font-mono">{ticket.item.code}</span> {ticket.item.name}
                </Link>{" "}
                <span className="text-muted">(condition: {ticket.item.condition.label})</span>
              </dd>
              <dt className="text-muted">Where</dt>
              <dd>
                {ticket.location.name}, {ticket.campus.name} ({ticket.campus.code}) ·{" "}
                {ticket.department.name}
              </dd>
              <dt className="text-muted">Reported by</dt>
              <dd>
                {ticket.reporter?.displayName ?? "A former user"} on {when(ticket.createdAt)}
              </dd>
              <dt className="text-muted">Assigned to</dt>
              <dd>
                {assigneeLabel(ticket) ?? "Nobody yet"}
                {ticket.assigneeType === "VENDOR" && ticket.vendorContact ? (
                  <span className="text-muted"> · Contact: {ticket.vendorContact}</span>
                ) : null}
              </dd>
              {ticket.description ? (
                <>
                  <dt className="text-muted">Description</dt>
                  <dd className="whitespace-pre-line">{ticket.description}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          {log ? (
            <Card title="Service log">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted">Date</dt>
                <dd>
                  {log.serviceDate.toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                  })}
                </dd>
                <dt className="text-muted">Type</dt>
                <dd>{log.serviceType}</dd>
                <dt className="text-muted">Cost</dt>
                <dd>{log.cost ? `$${log.cost.toFixed(2)}` : "None recorded"}</dd>
                <dt className="text-muted">Notes</dt>
                <dd className="whitespace-pre-line">{log.notes ?? "None"}</dd>
                {log.attachments.length > 0 ? (
                  <>
                    <dt className="text-muted">Files</dt>
                    <dd className="flex flex-col">
                      {log.attachments.map((file) => (
                        <a
                          key={file.id}
                          href={attachmentUrl(file.id)}
                          className="text-accent hover:underline"
                        >
                          {file.fileName}
                        </a>
                      ))}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <Card title="Timeline">
            <ol className="flex flex-col gap-3">
              {ticket.events.map((event) => (
                <li key={event.id} className="border-border border-l-4 pl-3">
                  <p>
                    <span className="font-semibold">{describeEvent(event)}</span>{" "}
                    <span className="text-muted">· {when(event.createdAt)}</span>
                  </p>
                  {event.body ? <p className="whitespace-pre-line">{event.body}</p> : null}
                  {event.attachment ? (
                    <p>
                      <a
                        href={attachmentUrl(event.attachment.id)}
                        className="text-accent hover:underline"
                      >
                        {event.attachment.fileName}
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {comment ? (
              <div className="border-border mt-4 border-t pt-3">
                <ActionForm
                  action={commentAction.bind(null, ticket.id)}
                  submitLabel="Add comment"
                  fieldLabels={{ body: "Comment", file: "File" }}
                >
                  <TextAreaField label="Comment" name="body" maxLength={5000} />
                  <TextField
                    label="Attach a photo or document"
                    name="file"
                    id="comment-file"
                    type="file"
                    accept={acceptedUploadTypes}
                    hint="Optional."
                  />
                </ActionForm>
              </div>
            ) : null}
          </Card>
        </div>

        {manage ? (
          <div className="flex flex-col gap-4">
            {closed ? (
              ticket.status === "CANCELLED" ? (
                <Card title="Reopen">
                  <ActionForm
                    action={reopenTicketAction.bind(null, ticket.id)}
                    submitLabel="Reopen ticket"
                    variant="secondary"
                  />
                </Card>
              ) : null
            ) : (
              <>
                <Card title="Status">
                  <ActionForm
                    action={setStatusAction.bind(null, ticket.id)}
                    submitLabel="Update status"
                    variant="secondary"
                    fieldLabels={{ status: "Status" }}
                  >
                    <SelectField label="Status" name="status" defaultValue={ticket.status}>
                      {openTicketStatuses.map((status) => (
                        <option key={status} value={status}>
                          {ticketStatusLabels[status]}
                        </option>
                      ))}
                    </SelectField>
                  </ActionForm>
                </Card>

                <Card title="Assign">
                  <ActionForm
                    action={assignAction.bind(null, ticket.id)}
                    submitLabel="Save assignment"
                    variant="secondary"
                    fieldLabels={{
                      assigneeType: "Who will do the work",
                      assigneeUserId: "Person",
                      assigneeDepartmentId: "Department",
                      vendorName: "Company",
                      vendorContact: "Contact",
                    }}
                  >
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 font-semibold">Who will do the work</legend>
                      {(
                        [
                          ["USER", "A person on staff"],
                          ["DEPARTMENT", "Another department"],
                          ["VENDOR", "An outside company"],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="assigneeType"
                            value={value}
                            defaultChecked={ticket.assigneeType === value}
                            className="accent-accent"
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <SelectField
                      label="Person"
                      name="assigneeUserId"
                      defaultValue={ticket.assigneeUserId ?? ""}
                    >
                      <option value="">Choose a person</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Department"
                      name="assigneeDepartmentId"
                      defaultValue={ticket.assigneeDepartmentId ?? ""}
                    >
                      <option value="">Choose a department</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label="Company"
                      name="vendorName"
                      defaultValue={ticket.vendorName ?? ""}
                      maxLength={200}
                    />
                    <TextField
                      label="Contact"
                      name="vendorContact"
                      defaultValue={ticket.vendorContact ?? ""}
                      maxLength={500}
                      hint="Name, phone or email for the outside company."
                    />
                  </ActionForm>
                </Card>

                <Card title="Complete">
                  <p className="text-muted mb-3">
                    Completing the ticket records a service log on the item.
                  </p>
                  <ActionForm
                    action={completeTicketAction.bind(null, ticket.id)}
                    submitLabel="Complete ticket"
                    pendingLabel="Completing…"
                    resetOnSuccess={false}
                    fieldLabels={{
                      serviceDate: "Service date",
                      serviceType: "Service type",
                      cost: "Cost",
                      notes: "Service notes",
                      condition: "Item condition afterwards",
                      file: "Receipt or report",
                    }}
                  >
                    <TextField
                      label="Service date"
                      name="serviceDate"
                      type="date"
                      defaultValue={today}
                      required
                    />
                    <TextField
                      label="Service type"
                      name="serviceType"
                      list="service-types"
                      maxLength={80}
                      defaultValue="Repair"
                      required
                    />
                    <datalist id="service-types">
                      {serviceTypeSuggestions.map((type) => (
                        <option key={type} value={type} />
                      ))}
                    </datalist>
                    <TextField
                      label="Cost"
                      name="cost"
                      inputMode="decimal"
                      hint="In dollars. Optional."
                    />
                    <TextAreaField label="Service notes" name="notes" maxLength={5000} />
                    <SelectField
                      label="Item condition afterwards"
                      name="condition"
                      defaultValue={defaultCondition}
                    >
                      <option value="">Leave unchanged ({ticket.item.condition.label})</option>
                      {conditions.map((condition) => (
                        <option key={condition.id} value={condition.id}>
                          {condition.label}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label="Receipt or report"
                      name="file"
                      id="complete-file"
                      type="file"
                      accept={acceptedUploadTypes}
                      hint="Optional. Attached to the service log."
                    />
                  </ActionForm>
                </Card>

                <Card title="Cancel">
                  <ActionForm
                    action={cancelTicketAction.bind(null, ticket.id)}
                    submitLabel="Cancel ticket"
                    pendingLabel="Cancelling…"
                    variant="danger"
                    fieldLabels={{ reason: "Reason" }}
                  >
                    <TextField
                      label="Reason"
                      name="reason"
                      maxLength={2000}
                      hint="Optional, for example: duplicate."
                    />
                  </ActionForm>
                </Card>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
