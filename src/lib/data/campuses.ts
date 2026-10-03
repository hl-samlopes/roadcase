import "server-only";
import { cache } from "react";
import { accessibleCampuses, type CurrentUser } from "@/lib/authz";
import { getPreference } from "@/lib/preferences";

/**
 * Campuses offered in the switcher and the one currently selected, or null
 * for all campuses. A saved campus the user can no longer access is ignored.
 */
export const getCampusContext = cache(async (user: CurrentUser) => {
  const [campuses, preference] = await Promise.all([
    accessibleCampuses(user),
    getPreference(user.id),
  ]);
  const active = campuses.find((campus) => campus.id === preference?.activeCampusId) ?? null;
  return { campuses, active };
});
