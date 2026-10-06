"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ThemeMode } from "@/generated/prisma/enums.ts";
import { requireUser } from "@/lib/authz";
import { getBranding } from "@/lib/branding";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";
import {
  emailPreferenceFields,
  ticketNotices,
  type TicketNotice,
} from "@/lib/notifications/recipients";
import { availableAccents, availableFontPairings, isTextScale } from "@/lib/theme/resolve";

const schema = z.object({
  themeMode: z.enum(ThemeMode, "Choose a mode."),
  accent: z.string().max(40),
  fontPairing: z.string().max(60),
  textScale: z.string().max(4),
});

export async function savePreferencesAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const branding = await getBranding(user.organizationId);
  const { themeMode, accent, fontPairing } = parsed.data;
  const textScale = parsed.data.textScale === "" ? null : Number(parsed.data.textScale);

  // Empty means "use the organization default"; anything else must be offered.
  const accentChoice =
    accent === "" ? null : availableAccents(branding).find((preset) => preset.key === accent);
  const pairingChoice =
    fontPairing === ""
      ? null
      : availableFontPairings(branding).find((pairing) => pairing === fontPairing);
  if (
    accentChoice === undefined ||
    pairingChoice === undefined ||
    (textScale !== null && !isTextScale(textScale))
  ) {
    return { error: "That choice isn't available in your organization." };
  }

  const data = {
    themeMode,
    accent: accentChoice?.key ?? null,
    fontPairing: pairingChoice,
    textScale,
  };
  await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  revalidatePath("/", "layout");
  return { success: "Preferences saved." };
}

export async function saveEmailPreferencesAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const data = Object.fromEntries(
    ticketNotices.map((notice) => [
      emailPreferenceFields[notice],
      formData.get(emailPreferenceFields[notice]) === "on",
    ]),
  ) as Record<(typeof emailPreferenceFields)[TicketNotice], boolean> & {
    emailRequestSent?: boolean;
    emailBandSent?: boolean;
  };
  data.emailRequestSent = formData.get("emailRequestSent") === "on";
  data.emailBandSent = formData.get("emailBandSent") === "on";
  await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  revalidatePath("/account/preferences");
  return { success: "Email preferences saved." };
}
