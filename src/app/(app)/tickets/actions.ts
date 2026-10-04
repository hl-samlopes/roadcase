"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AssigneeType } from "@/generated/prisma/enums.ts";
import {
  can,
  canCommentOnTicket,
  isTicketClosed,
  requireUser,
  type CurrentUser,
} from "@/lib/authz";
import { getItem } from "@/lib/data/items";
import {
  activeDepartments,
  assignableUsers,
  createTicket,
  getTicket,
  openTicketStatuses,
  type TicketDetail,
} from "@/lib/data/tickets";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";
import { ticketStatusLabels } from "@/lib/labels";
import { deleteObject } from "@/lib/storage";
import { readUpload, storeUpload } from "@/lib/uploads";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";

function refresh(ticket: { id: string; item: { id: string } }) {
  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
  revalidatePath(`/items/${ticket.item.id}`);
  revalidatePath("/service-log");
}

/** A ticket the actor may manage (status, assignment, completion), or null. */
async function manageableTicket(actor: CurrentUser, id: string) {
  const ticket = await getTicket(actor, id);
  return ticket && can(actor, "ticket:manage", ticket) ? ticket : null;
}

type StoredUpload = Awaited<ReturnType<typeof storeUpload>>;

/** Stores an optional upload: attachment fields, null for none, or a form error. */
async function optionalUpload(
  actor: CurrentUser,
  formData: FormData,
): Promise<{ ok: true; stored: StoredUpload | null } | { ok: false; state: FormState }> {
  const upload = await readUpload(formData, "file");
  if (!upload) return { ok: true, stored: null };
  if (!upload.ok)
    return { ok: false, state: { error: PLEASE_FIX, fieldErrors: { file: [upload.error] } } };
  return { ok: true, stored: await storeUpload(actor.organizationId, upload) };
}

async function withCleanup<T>(storageKey: string | undefined, run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (storageKey) await deleteObject(storageKey).catch(() => {});
    throw error;
  }
}

const reportSchema = z.object({
  title: z.string().trim().min(1, "Describe the problem in a few words.").max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null),
});

export async function submitTicketAction(
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await getItem(actor, itemId);
  if (!item || !can(actor, "ticket:submit", item)) return NOT_ALLOWED;

  const parsed = reportSchema.safeParse({ description: "", ...formObject(formData) });
  if (!parsed.success) return invalid(parsed.error);
  const upload = await optionalUpload(actor, formData);
  if (!upload.ok) return upload.state;
  const { stored } = upload;

  const ticket = await withCleanup(stored?.storageKey, () =>
    db.$transaction(async (tx) => {
      const created = await createTicket(tx, {
        item,
        title: parsed.data.title,
        description: parsed.data.description,
        reporterId: actor.id,
      });
      if (stored) {
        const attachment = await tx.attachment.create({
          data: { ...stored, ticketId: created.id, uploadedById: actor.id },
          select: { id: true },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: created.id,
            actorId: actor.id,
            type: "ATTACHMENT_ADDED",
            attachmentId: attachment.id,
          },
        });
      }
      return created;
    }),
  );
  revalidatePath("/tickets");
  revalidatePath(`/items/${item.id}`);
  redirect(`/tickets/${ticket.id}?created=1`);
}

export async function commentAction(
  ticketId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await getTicket(actor, ticketId);
  if (!ticket || !canCommentOnTicket(actor, ticket)) return NOT_ALLOWED;

  const body = z
    .string()
    .trim()
    .max(5000)
    .safeParse(formData.get("body") ?? "");
  if (!body.success) {
    return { error: PLEASE_FIX, fieldErrors: { body: ["Keep comments under 5000 characters."] } };
  }
  const upload = await optionalUpload(actor, formData);
  if (!upload.ok) return upload.state;
  const { stored } = upload;
  if (!body.data && !stored) {
    return { error: PLEASE_FIX, fieldErrors: { body: ["Write a comment or attach a file."] } };
  }

  await withCleanup(stored?.storageKey, () =>
    db.$transaction(async (tx) => {
      const attachment = stored
        ? await tx.attachment.create({
            data: { ...stored, ticketId: ticket.id, uploadedById: actor.id },
            select: { id: true },
          })
        : null;
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: actor.id,
          type: body.data ? "COMMENT" : "ATTACHMENT_ADDED",
          body: body.data || null,
          attachmentId: attachment?.id,
        },
      });
      await tx.serviceTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
    }),
  );
  refresh(ticket);
  return { success: body.data ? "Comment added." : "File added." };
}

export async function setStatusAction(
  ticketId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await manageableTicket(actor, ticketId);
  if (!ticket) return NOT_ALLOWED;
  if (isTicketClosed(ticket.status)) return { error: "This ticket is closed." };

  const status = z
    .enum(openTicketStatuses as [string, ...string[]])
    .safeParse(formData.get("status"));
  if (!status.success) return { error: PLEASE_FIX, fieldErrors: { status: ["Choose a status."] } };
  if (status.data === ticket.status) return {};

  await changeStatus(actor, ticket, status.data as TicketDetail["status"]);
  refresh(ticket);
  return {
    success: `Status changed to ${ticketStatusLabels[status.data as TicketDetail["status"]]}.`,
  };
}

async function changeStatus(
  actor: CurrentUser,
  ticket: TicketDetail,
  status: TicketDetail["status"],
  extra: { body?: string | null; data?: Record<string, string> } = {},
) {
  await db.$transaction([
    db.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? new Date() : null,
      },
    }),
    db.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        type: "STATUS_CHANGED",
        fromStatus: ticket.status,
        toStatus: status,
        body: extra.body ?? null,
      },
    }),
  ]);
}

const assignSchema = z.discriminatedUnion("assigneeType", [
  z.object({
    assigneeType: z.literal(AssigneeType.USER),
    assigneeUserId: z.uuid("Choose a person."),
  }),
  z.object({
    assigneeType: z.literal(AssigneeType.DEPARTMENT),
    assigneeDepartmentId: z.uuid("Choose a department."),
  }),
  z.object({
    assigneeType: z.literal(AssigneeType.VENDOR),
    vendorName: z.string().trim().min(1, "Enter the company name.").max(200),
    vendorContact: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null),
  }),
]);

export async function assignAction(
  ticketId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await manageableTicket(actor, ticketId);
  if (!ticket) return NOT_ALLOWED;
  if (isTicketClosed(ticket.status)) return { error: "This ticket is closed." };

  const raw = formObject(formData);
  const parsed = assignSchema.safeParse({ vendorContact: "", ...raw });
  if (!parsed.success) {
    if (!["USER", "DEPARTMENT", "VENDOR"].includes(raw.assigneeType ?? "")) {
      return { error: PLEASE_FIX, fieldErrors: { assigneeType: ["Choose who will do the work."] } };
    }
    return invalid(parsed.error);
  }
  const choice = parsed.data;

  let assignment: {
    assigneeType: AssigneeType;
    assigneeUserId: string | null;
    assigneeDepartmentId: string | null;
    vendorName: string | null;
    vendorContact: string | null;
  };
  let label: string;
  if (choice.assigneeType === "USER") {
    const person = (await assignableUsers(actor, ticket)).find(
      (u) => u.id === choice.assigneeUserId,
    );
    if (!person) {
      return {
        error: PLEASE_FIX,
        fieldErrors: { assigneeUserId: ["Choose someone who can see this ticket."] },
      };
    }
    assignment = {
      assigneeType: "USER",
      assigneeUserId: person.id,
      assigneeDepartmentId: null,
      vendorName: null,
      vendorContact: null,
    };
    label = person.displayName;
  } else if (choice.assigneeType === "DEPARTMENT") {
    const department = (await activeDepartments(actor.organizationId)).find(
      (d) => d.id === choice.assigneeDepartmentId,
    );
    if (!department) {
      return { error: PLEASE_FIX, fieldErrors: { assigneeDepartmentId: ["Choose a department."] } };
    }
    assignment = {
      assigneeType: "DEPARTMENT",
      assigneeUserId: null,
      assigneeDepartmentId: department.id,
      vendorName: null,
      vendorContact: null,
    };
    label = `${department.name} department`;
  } else {
    assignment = {
      assigneeType: "VENDOR",
      assigneeUserId: null,
      assigneeDepartmentId: null,
      vendorName: choice.vendorName,
      vendorContact: choice.vendorContact,
    };
    label = `${choice.vendorName} (outside company)`;
  }

  const nextStatus = ticket.status === "OPEN" ? "ASSIGNED" : ticket.status;
  await db.$transaction([
    db.serviceTicket.update({
      where: { id: ticket.id },
      data: { ...assignment, status: nextStatus },
    }),
    db.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        type: "ASSIGNED",
        body: `Assigned to ${label}${assignment.vendorContact ? ` (contact: ${assignment.vendorContact})` : ""}.`,
        fromStatus: ticket.status,
        toStatus: nextStatus,
        data: { assignee: label },
      },
    }),
  ]);
  refresh(ticket);
  return { success: `Assigned to ${label}.` };
}

const completeSchema = z.object({
  serviceDate: z.iso.date("Enter the service date."),
  serviceType: z.string().trim().min(1, "Enter the type of service.").max(80),
  cost: z
    .string()
    .trim()
    .transform((value) => value.replace(/[$,]/g, ""))
    .refine(
      (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
      "Enter an amount such as 45.00.",
    )
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null),
  condition: z.string(),
});

/** Completes the ticket and writes the service log in one step. */
export async function completeTicketAction(
  ticketId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await manageableTicket(actor, ticketId);
  if (!ticket || !can(actor, "serviceLog:manage", ticket)) return NOT_ALLOWED;
  if (isTicketClosed(ticket.status)) return { error: "This ticket is already closed." };

  const parsed = completeSchema.safeParse({
    cost: "",
    notes: "",
    condition: "",
    ...formObject(formData),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  // Optionally set the item's condition, but never to one that opens a new ticket.
  let conditionId: string | null = null;
  if (input.condition) {
    const condition = await db.itemCondition.findFirst({
      where: {
        id: input.condition,
        organizationId: actor.organizationId,
        archivedAt: null,
        startsRepairTicket: false,
      },
      select: { id: true },
    });
    if (!condition) {
      return {
        error: PLEASE_FIX,
        fieldErrors: { condition: ["Choose a condition from the list."] },
      };
    }
    conditionId = condition.id;
  }

  const upload = await optionalUpload(actor, formData);
  if (!upload.ok) return upload.state;
  const { stored } = upload;

  await withCleanup(stored?.storageKey, () =>
    db.$transaction(async (tx) => {
      await tx.serviceTicket.update({
        where: { id: ticket.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      const log = await tx.serviceLog.create({
        data: {
          organizationId: ticket.organizationId,
          campusId: ticket.campusId,
          locationId: ticket.locationId,
          departmentId: ticket.departmentId,
          itemId: ticket.item.id,
          ticketId: ticket.id,
          serviceDate: new Date(`${input.serviceDate}T00:00:00Z`),
          serviceType: input.serviceType,
          cost: input.cost,
          notes: input.notes,
          createdById: actor.id,
        },
        select: { id: true },
      });
      if (stored) {
        await tx.attachment.create({
          data: { ...stored, serviceLogId: log.id, uploadedById: actor.id },
        });
      }
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: actor.id,
          type: "STATUS_CHANGED",
          fromStatus: ticket.status,
          toStatus: "COMPLETED",
          body: `Completed: ${input.serviceType}${input.cost ? `, $${input.cost}` : ""}. Service log recorded.`,
        },
      });
      if (conditionId && conditionId !== ticket.item.conditionId) {
        await tx.item.update({
          where: { id: ticket.item.id },
          data: { conditionId, updatedById: actor.id },
        });
      }
    }),
  );
  refresh(ticket);
  return { success: "Ticket completed and service log recorded." };
}

export async function cancelTicketAction(
  ticketId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await manageableTicket(actor, ticketId);
  if (!ticket) return NOT_ALLOWED;
  if (isTicketClosed(ticket.status)) return { error: "This ticket is already closed." };
  const reason = z
    .string()
    .trim()
    .max(2000)
    .catch("")
    .parse(formData.get("reason") ?? "");
  await changeStatus(actor, ticket, "CANCELLED", { body: reason || null });
  refresh(ticket);
  return { success: "Ticket cancelled." };
}

/** Reopens a cancelled ticket. Completed tickets stay closed; their log is history. */
export async function reopenTicketAction(
  ticketId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const ticket = await manageableTicket(actor, ticketId);
  if (!ticket || ticket.status !== "CANCELLED") return NOT_ALLOWED;
  const other = await db.serviceTicket.findFirst({
    where: { itemId: ticket.item.id, status: { in: openTicketStatuses }, id: { not: ticket.id } },
    select: { number: true },
  });
  if (other) return { error: `This item already has an open ticket, #${other.number}.` };
  await changeStatus(actor, ticket, "OPEN");
  refresh(ticket);
  return { success: "Ticket reopened." };
}
