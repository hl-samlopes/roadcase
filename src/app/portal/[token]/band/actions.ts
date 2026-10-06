"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_CHANNELS, MAX_PLAYERS_PER_POSITION } from "@/lib/band/input-list";
import { bandPositions } from "@/lib/data/band";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";
import { portalForChange } from "@/lib/portal/guard";

const labelSchema = z.string().trim().max(120, "Keep each player's note under 120 characters.");
const notesSchema = z.string().trim().max(2000, "Keep the notes under 2,000 characters.");

/**
 * Saves the group's band, and sends it to the audio team when the "send"
 * button was used. The group can change it any time; staff's adjusted input
 * list is stored apart and never overwritten by this.
 */
export async function saveBandAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { portal, error } = await portalForChange(token, "band:edit");
  if (!portal) return error;
  const { principal } = portal;
  const send = formData.get("intent") === "send";

  const positions = await bandPositions(principal.organizationId, principal.campusId);
  const fieldErrors: Record<string, string[]> = {};
  const members: { positionId: string; label: string | null; order: number }[] = [];
  for (const position of positions) {
    const labels = formData.getAll(`player:${position.id}`).map(String);
    if (labels.length > MAX_PLAYERS_PER_POSITION) {
      fieldErrors[position.name] = [`Up to ${MAX_PLAYERS_PER_POSITION} players.`];
      continue;
    }
    for (const raw of labels) {
      const label = labelSchema.safeParse(raw);
      if (!label.success) {
        fieldErrors[position.name] = [label.error.issues[0].message];
        continue;
      }
      members.push({ positionId: position.id, label: label.data || null, order: members.length });
    }
  }
  const expectedRaw = String(formData.get("expectedChannels") ?? "").trim();
  const expected = expectedRaw === "" ? null : Number(expectedRaw);
  if (
    expected !== null &&
    (!Number.isInteger(expected) || expected < 1 || expected > MAX_CHANNELS)
  ) {
    fieldErrors["Channels you expect"] = [`Enter a whole number from 1 to ${MAX_CHANNELS}.`];
  }
  const notes = notesSchema.safeParse(formData.get("notes") ?? "");
  if (!notes.success) fieldErrors["Anything else"] = [notes.error.issues[0].message];
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix these and try again.", fieldErrors };
  }
  if (send && members.length === 0) {
    return { error: "Add at least one player before sending your band to the audio team." };
  }

  const existing = await db.bandSetup.findUnique({
    where: { guestGroupId: principal.guestGroupId },
    select: { status: true },
  });
  const now = new Date();
  const fields = {
    expectedChannels: expected,
    inEarMonitors: formData.get("inEarMonitors") === "on",
    clickTrack: formData.get("clickTrack") === "on",
    notes: notes.data || null,
    // Once sent, every save goes to the audio team.
    ...(send || existing?.status === "SUBMITTED"
      ? { status: "SUBMITTED" as const, submittedAt: now }
      : { status: "DRAFT" as const }),
  };
  const sent = fields.status === "SUBMITTED";
  await db.$transaction(async (tx) => {
    const setup = await tx.bandSetup.upsert({
      where: { guestGroupId: principal.guestGroupId },
      create: {
        organizationId: principal.organizationId,
        campusId: principal.campusId,
        guestGroupId: principal.guestGroupId,
        ...fields,
      },
      update: fields,
      select: { id: true },
    });
    await tx.bandMember.deleteMany({ where: { setupId: setup.id } });
    if (members.length > 0) {
      await tx.bandMember.createMany({
        data: members.map((member) => ({ ...member, setupId: setup.id })),
      });
    }
    if (sent) {
      await enqueue(
        "band.notify",
        {
          organizationId: principal.organizationId,
          setupId: setup.id,
          submittedAt: now.toISOString(),
        },
        { tx, key: `${setup.id}:${now.getTime()}` },
      );
    }
  });
  revalidatePath("/portal/[token]", "page");
  revalidatePath("/portal/[token]/band", "page");
  const players = `${members.length} player${members.length === 1 ? "" : "s"}`;
  return {
    success: sent
      ? existing?.status === "SUBMITTED"
        ? `Sent your changes (${players}) to the audio team.`
        : `Sent your band (${players}) to the audio team.`
      : `Saved your band (${players}) for later. The audio team won't see it until you send it.`,
  };
}
