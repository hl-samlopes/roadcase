"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { accessibleCampuses, getCurrentUser, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export async function signOutAction() {
  const user = await getCurrentUser();
  await signOut({ redirectTo: user ? `/sign-in/${user.organization.slug}` : "/sign-in" });
}

/** Saves the campus chosen in the campus switcher ("all" clears it). */
export async function setActiveCampusAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.union([z.literal("all"), z.uuid()]).safeParse(formData.get("campusId"));
  if (!parsed.success) return;

  let activeCampusId: string | null = null;
  if (parsed.data !== "all") {
    const campuses = await accessibleCampuses(user);
    if (!campuses.some((campus) => campus.id === parsed.data)) return;
    activeCampusId = parsed.data;
  }

  await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, activeCampusId },
    update: { activeCampusId },
  });
  revalidatePath("/", "layout");
}
