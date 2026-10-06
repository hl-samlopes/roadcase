import type {
  AssigneeType,
  PermissionLevel,
  ScopeType,
  TicketStatus,
} from "@/generated/prisma/enums.ts";

export const levelLabels: Record<PermissionLevel, string> = {
  VIEWER: "Viewer",
  COMMENTER: "Commenter",
  EDITOR: "Editor",
  ADMIN: "Admin",
};

export const scopeTypeLabels: Record<ScopeType, string> = {
  ORGANIZATION: "Organization-wide",
  CAMPUS: "Campus",
  LOCATION: "Location",
  DEPARTMENT: "Department",
};

export const ticketStatusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_ON_PARTS_OR_VENDOR: "Waiting on parts or vendor",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const assigneeTypeLabels: Record<AssigneeType, string> = {
  USER: "A person on staff",
  DEPARTMENT: "Another department",
  VENDOR: "An outside company",
};

/** Suggested service types; any text is allowed. */
export const serviceTypeSuggestions = [
  "Repair",
  "Maintenance",
  "Inspection",
  "Cleaning",
  "Replacement part",
  "Calibration",
];

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
