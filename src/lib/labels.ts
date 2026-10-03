import type { ItemCondition, PermissionLevel, ScopeType } from "@/generated/prisma/enums.ts";

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

export const conditionLabels: Record<ItemCondition, string> = {
  NEW: "New",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  NEEDS_REPAIR: "Needs repair",
  OUT_OF_SERVICE: "Out of service",
  RETIRED: "Retired",
};
