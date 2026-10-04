import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { TicketStatus } from "@/generated/prisma/enums.ts";
import { can, scopeWhere, type Actor } from "@/lib/authz";
import { db } from "@/lib/db";

export const PAGE_SIZE = 50;

export const openTicketStatuses: TicketStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_PARTS_OR_VENDOR",
];

type Tx = Prisma.TransactionClient;

/** Item fields a new ticket copies its scope from. */
export interface TicketItem {
  id: string;
  organizationId: string;
  campusId: string;
  locationId: string;
  departmentId: string;
}

/**
 * Opens a ticket for an item with the organization's next number and a
 * "created" timeline entry. Run inside a transaction with related writes.
 */
export async function createTicket(
  tx: Tx,
  input: { item: TicketItem; title: string; description: string | null; reporterId: string },
) {
  const organization = await tx.organization.update({
    where: { id: input.item.organizationId },
    data: { ticketSequence: { increment: 1 } },
    select: { ticketSequence: true },
  });
  return tx.serviceTicket.create({
    data: {
      organizationId: input.item.organizationId,
      campusId: input.item.campusId,
      locationId: input.item.locationId,
      departmentId: input.item.departmentId,
      itemId: input.item.id,
      number: organization.ticketSequence,
      title: input.title,
      description: input.description,
      reporterId: input.reporterId,
      events: { create: { type: "CREATED", actorId: input.reporterId, toStatus: "OPEN" } },
    },
    select: { id: true, number: true },
  });
}

/** The item's open ticket, if any (used so repeated flags don't pile up tickets). */
export function findOpenTicket(tx: Tx | typeof db, itemId: string) {
  return tx.serviceTicket.findFirst({
    where: { itemId, status: { in: openTicketStatuses } },
    select: { id: true, number: true },
  });
}

const optionalUuid = z.uuid().optional().catch(undefined);

export const ticketListParamsSchema = z.object({
  status: z
    .enum(["open", "closed", "all", ...Object.values(TicketStatus)])
    .optional()
    .catch(undefined),
  department: optionalUuid,
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type TicketListParams = z.infer<typeof ticketListParamsSchema>;

function single(raw: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}

export function parseTicketListParams(raw: Record<string, string | string[] | undefined>) {
  return ticketListParamsSchema.parse(single(raw));
}

function statusFilter(status: TicketListParams["status"]): Prisma.ServiceTicketWhereInput {
  switch (status ?? "open") {
    case "open":
      return { status: { in: openTicketStatuses } };
    case "closed":
      return { status: { in: ["COMPLETED", "CANCELLED"] } };
    case "all":
      return {};
    default:
      return { status: status as TicketStatus };
  }
}

/** The ticket queue: tickets the actor may read, by campus and filters. */
export async function listTickets(actor: Actor, params: TicketListParams, campusId: string | null) {
  const scope = scopeWhere(actor, "ticket:read");
  if (!scope) return { tickets: [], total: 0, page: 1, pageCount: 1 };
  const filters: Prisma.ServiceTicketWhereInput[] = [scope, statusFilter(params.status)];
  if (campusId) filters.push({ campusId });
  if (params.department) filters.push({ departmentId: params.department });
  if (params.q) {
    filters.push({
      OR: [
        { title: { contains: params.q, mode: "insensitive" } },
        { item: { code: { contains: params.q, mode: "insensitive" } } },
        { item: { name: { contains: params.q, mode: "insensitive" } } },
        ...(/^#?\d+$/.test(params.q) ? [{ number: Number(params.q.replace("#", "")) }] : []),
      ],
    });
  }
  const where = { AND: filters };
  const total = await db.serviceTicket.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page ?? 1, pageCount);
  const tickets = await db.serviceTicket.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { number: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      updatedAt: true,
      assigneeType: true,
      vendorName: true,
      assigneeUser: { select: { displayName: true } },
      assigneeDepartment: { select: { name: true } },
      item: { select: { code: true, name: true } },
      campus: { select: { code: true } },
      department: { select: { name: true } },
    },
  });
  return { tickets, total, page, pageCount };
}

const ticketDetailSelect = {
  id: true,
  organizationId: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  number: true,
  title: true,
  description: true,
  status: true,
  reporterId: true,
  assigneeType: true,
  assigneeUserId: true,
  assigneeDepartmentId: true,
  vendorName: true,
  vendorContact: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  item: {
    select: {
      id: true,
      code: true,
      name: true,
      conditionId: true,
      condition: { select: { label: true } },
    },
  },
  campus: { select: { code: true, name: true } },
  location: { select: { name: true } },
  department: { select: { name: true } },
  reporter: { select: { displayName: true } },
  assigneeUser: { select: { displayName: true } },
  assigneeDepartment: { select: { name: true } },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      fromStatus: true,
      toStatus: true,
      body: true,
      data: true,
      createdAt: true,
      actor: { select: { displayName: true } },
      attachment: { select: { id: true, fileName: true, kind: true } },
    },
  },
  serviceLog: { select: { id: true } },
} as const satisfies Prisma.ServiceTicketSelect;

/** One ticket the actor may read, or null (also when it doesn't exist). */
export async function getTicket(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const ticket = await db.serviceTicket.findUnique({ where: { id }, select: ticketDetailSelect });
  if (!ticket || !can(actor, "ticket:read", ticket)) return null;
  return ticket;
}

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

/** Who can be assigned: active people who can see the ticket. */
export async function assignableUsers(actor: Actor, ticket: TicketItem) {
  const users = await db.user.findMany({
    where: { organizationId: actor.organizationId, isActive: true },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      isActive: true,
      grants: {
        select: {
          level: true,
          scopeType: true,
          campusId: true,
          locationId: true,
          departmentId: true,
          canSubmitTickets: true,
        },
      },
    },
  });
  return users
    .filter((user) => can(user, "ticket:read", ticket))
    .map((user) => ({ id: user.id, displayName: user.displayName }));
}

export function activeDepartments(organizationId: string) {
  return db.department.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** A short description of who a ticket is assigned to, or null if nobody yet. */
export function assigneeLabel(ticket: {
  assigneeType: string | null;
  vendorName: string | null;
  assigneeUser: { displayName: string } | null;
  assigneeDepartment: { name: string } | null;
}): string | null {
  switch (ticket.assigneeType) {
    case "USER":
      return ticket.assigneeUser?.displayName ?? "A former user";
    case "DEPARTMENT":
      return ticket.assigneeDepartment
        ? `${ticket.assigneeDepartment.name} department`
        : "A department";
    case "VENDOR":
      return ticket.vendorName ? `${ticket.vendorName} (outside company)` : "An outside company";
    default:
      return null;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = z.string().regex(DATE).optional().catch(undefined);

export const logListParamsSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  type: z.string().trim().max(80).optional().catch(undefined),
  location: optionalUuid,
  department: optionalUuid,
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type LogListParams = z.infer<typeof logListParamsSchema>;

export function parseLogListParams(raw: Record<string, string | string[] | undefined>) {
  return logListParamsSchema.parse(single(raw));
}

/** Service logs the actor may read, with the cost total for the whole filtered set. */
export async function listServiceLogs(
  actor: Actor,
  params: LogListParams,
  campusId: string | null,
) {
  const scope = scopeWhere(actor, "serviceLog:read");
  if (!scope) return { logs: [], total: 0, totalCost: null, page: 1, pageCount: 1 };
  const filters: Prisma.ServiceLogWhereInput[] = [scope];
  if (campusId) filters.push({ campusId });
  if (params.location) filters.push({ locationId: params.location });
  if (params.department) filters.push({ departmentId: params.department });
  if (params.type) filters.push({ serviceType: { contains: params.type, mode: "insensitive" } });
  if (params.from) filters.push({ serviceDate: { gte: new Date(`${params.from}T00:00:00Z`) } });
  if (params.to) filters.push({ serviceDate: { lte: new Date(`${params.to}T00:00:00Z`) } });
  const where = { AND: filters };

  const [total, sum] = await Promise.all([
    db.serviceLog.count({ where }),
    db.serviceLog.aggregate({ where, _sum: { cost: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page ?? 1, pageCount);
  const logs = await db.serviceLog.findMany({
    where,
    orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      serviceDate: true,
      serviceType: true,
      cost: true,
      notes: true,
      item: { select: { id: true, code: true, name: true } },
      ticket: { select: { id: true, number: true } },
      campus: { select: { code: true } },
      location: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  return { logs, total, totalCost: sum._sum.cost, page, pageCount };
}
