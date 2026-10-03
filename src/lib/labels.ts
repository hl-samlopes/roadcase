import type { PermissionLevel, ScopeType } from "@/generated/prisma/enums.ts";

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
