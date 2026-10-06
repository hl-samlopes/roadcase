"use server";

import { isDeepStrictEqual } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { parseDocument, templateFields } from "@/lib/contracts/document";
import { placeholderTemplate } from "@/lib/contracts/placeholder";
import { latestTemplateVersion } from "@/lib/data/contracts";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import type { FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const CHANGED_ELSEWHERE =
  "Someone saved a newer version while you were editing. Copy your changes, reload the page, and try again.";

/** The campus, if the actor may edit its contract template. */
async function editableCampus(actor: CurrentUser, campusId: string) {
  if (!z.uuid().safeParse(campusId).success) return null;
  const campus = await db.campus.findFirst({
    where: { id: campusId, organizationId: actor.organizationId, archivedAt: null },
    select: { id: true, code: true },
  });
  if (!campus) return null;
  return can(actor, "contracts:manage", { organizationId: actor.organizationId, campusId })
    ? campus
    : null;
}

function refresh(campusId: string) {
  revalidatePath("/settings/contracts");
  revalidatePath(`/settings/contracts/${campusId}`, "layout");
}

/** Creates version 1 from the placeholder (marked "not reviewed") for a campus with no template. */
export async function startFromPlaceholderAction(
  campusId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campus = await editableCampus(actor, campusId);
  if (!campus) return NOT_ALLOWED;
  try {
    await db.contractTemplateVersion.create({
      data: {
        organizationId: actor.organizationId,
        campusId: campus.id,
        version: 1,
        content: placeholderTemplate,
        createdById: actor.id,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  refresh(campus.id);
  return { success: "Started from the placeholder template. Replace its wording before use." };
}

/** Saves the edited template as the next version; earlier versions never change. */
export async function saveTemplateAction(
  campusId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campus = await editableCampus(actor, campusId);
  if (!campus) return NOT_ALLOWED;

  const parsed = parseDocument(String(formData.get("content") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const baseVersion = Number(formData.get("baseVersion"));

  const latest = await latestTemplateVersion(actor.organizationId, campus.id);
  if (!latest || latest.version !== baseVersion) return { error: CHANGED_ELSEWHERE };
  if (isDeepStrictEqual(latest.doc, parsed.doc)) return { success: "No changes to save." };

  const version = latest.version + 1;
  try {
    await db.contractTemplateVersion.create({
      data: {
        organizationId: actor.organizationId,
        campusId: campus.id,
        version,
        content: parsed.doc,
        createdById: actor.id,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: CHANGED_ELSEWHERE };
    throw error;
  }
  refresh(campus.id);

  const { unknown } = templateFields(parsed.doc);
  const warning = unknown.length
    ? ` Unknown field${unknown.length === 1 ? "" : "s"} won't be filled in: ${unknown.map((n) => `{{${n}}}`).join(", ")}.`
    : "";
  return { success: `Saved as version ${version}.${warning}` };
}
