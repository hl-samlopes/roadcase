"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client.ts";
import {
  BodyFont,
  FontPairing,
  HeadingFont,
  SignInLogoPlacement,
} from "@/generated/prisma/enums.ts";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { brandingImageKinds, brandingImages, type BrandingImageKind } from "@/lib/branding-images";
import { db } from "@/lib/db";
import { checkUpload } from "@/lib/files";
import { invalid, type FormState } from "@/lib/forms/state";
import { accentPresets } from "@/lib/theme/presets";
import { isTextScale } from "@/lib/theme/resolve";
import {
  defaultDarkTokens,
  defaultLightTokens,
  themeTokenNames,
  type ThemeTokens,
} from "@/lib/theme/tokens";
import { deleteObject, putObject } from "@/lib/storage";

const NOT_ALLOWED: FormState = { error: "Only organization admins can change the appearance." };

/** Appearance is organization-wide, so only organization admins change it. */
async function authorize(): Promise<CurrentUser | null> {
  const actor = await requireUser();
  return can(actor, "settings:manage", { organizationId: actor.organizationId }) ? actor : null;
}

function refresh() {
  // Every page reads the theme, so revalidate the whole app.
  revalidatePath("/", "layout");
}

const hex = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === "" || /^#[0-9A-F]{6}$/.test(value), "Use a color like #1B5FD1.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null);

const percent = z.coerce.number().int().min(0).max(100);

const appearanceSchema = z.object({
  ...Object.fromEntries(
    themeTokenNames.flatMap((name) => [
      [`light_${name}`, hex],
      [`dark_${name}`, hex],
    ]),
  ),
  headingFont: z.union([z.literal(""), z.enum(HeadingFont)]),
  bodyFont: z.union([z.literal(""), z.enum(BodyFont)]),
  radiusPx: z.coerce.number().int().min(0, "Use 0 to 32.").max(32, "Use 0 to 32."),
  textScale: z.coerce.number().refine(isTextScale, "Choose a text size."),
  displayName: optionalText(80),
  signInHeadline: optionalText(120),
  signInMessage: optionalText(1000),
  signInLogoPlacement: z.enum(SignInLogoPlacement),
  appBackgroundDim: percent,
  signInBackgroundDim: percent,
}) as z.ZodType<Record<string, string | number | null>>;

/** Overrides that differ from the Roadcase defaults; null when there are none. */
function overrides(input: Record<string, unknown>, mode: "light" | "dark", defaults: ThemeTokens) {
  const result: Partial<ThemeTokens> = {};
  for (const name of themeTokenNames) {
    const value = input[`${mode}_${name}`];
    if (typeof value === "string" && value && value !== defaults[name]) result[name] = value;
  }
  return Object.keys(result).length ? (result as Prisma.InputJsonValue) : null;
}

export async function saveAppearanceAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor) return NOT_ALLOWED;

  const raw = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const parsed = appearanceSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error as z.ZodError);
  const input = parsed.data;

  const allowedAccents = formData
    .getAll("allowedAccents")
    .filter((key): key is string => accentPresets.some((preset) => preset.key === key));
  const allowedFontPairings = formData
    .getAll("allowedFontPairings")
    .filter((value): value is FontPairing =>
      Object.values(FontPairing).includes(value as FontPairing),
    );
  if (allowedFontPairings.length === 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { allowedFontPairings: ["Allow at least one font pairing."] },
    };
  }

  const data = {
    // Prisma needs DbNull to clear a JSON column.
    lightTokens: overrides(input, "light", defaultLightTokens) ?? Prisma.DbNull,
    darkTokens: overrides(input, "dark", defaultDarkTokens) ?? Prisma.DbNull,
    headingFont: (input.headingFont || null) as HeadingFont | null,
    bodyFont: (input.bodyFont || null) as BodyFont | null,
    radiusPx: input.radiusPx === 6 ? null : (input.radiusPx as number),
    textScale: input.textScale === 100 ? null : (input.textScale as number),
    displayName: input.displayName as string | null,
    signInHeadline: input.signInHeadline as string | null,
    signInMessage: input.signInMessage as string | null,
    signInLogoPlacement: input.signInLogoPlacement as SignInLogoPlacement,
    appBackgroundDim: input.appBackgroundDim as number,
    signInBackgroundDim: input.signInBackgroundDim as number,
    allowUserAccent: formData.get("allowUserAccent") === "on",
    // Every accent allowed is stored as "no restriction".
    allowedAccents: allowedAccents.length === accentPresets.length ? [] : allowedAccents,
    allowedFontPairings,
    updatedById: actor.id,
  };
  await db.organizationBranding.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, ...data },
    update: data,
  });
  refresh();
  return { success: "Appearance saved. Everyone sees it on their next page load." };
}

const imageKindSchema = z.enum(brandingImageKinds as [BrandingImageKind, ...BrandingImageKind[]]);

export async function uploadBrandingImageAction(
  kind: BrandingImageKind,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor || !imageKindSchema.safeParse(kind).success) return NOT_ALLOWED;
  const spec = brandingImages[kind];

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { file: ["Choose an image."] },
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload(bytes, { photoOnly: true, maxBytes: spec.maxBytes });
  if (!check.ok) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { file: [check.error.replace("Photos must be", "Images must be")] },
    };
  }

  // The branding/ prefix is publicly readable, because these show before sign-in.
  const key = `branding/${actor.organizationId}/${kind}-${randomUUID()}.${check.file.extension}`;
  await putObject(key, bytes, check.file.contentType);
  const previous = await db.organizationBranding.findUnique({
    where: { organizationId: actor.organizationId },
    select: { [spec.field]: true },
  });
  await db.organizationBranding.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, [spec.field]: key, updatedById: actor.id },
    update: { [spec.field]: key, updatedById: actor.id },
  });
  const old = previous?.[spec.field as keyof typeof previous];
  if (typeof old === "string") await deleteObject(old).catch(() => {});
  refresh();
  return { success: `${spec.label} updated.` };
}

export async function removeBrandingImageAction(
  kind: BrandingImageKind,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor || !imageKindSchema.safeParse(kind).success) return NOT_ALLOWED;
  const spec = brandingImages[kind];
  const branding = await db.organizationBranding.findUnique({
    where: { organizationId: actor.organizationId },
  });
  const key = branding?.[spec.field];
  if (!branding || !key) return {};
  await db.organizationBranding.update({
    where: { organizationId: actor.organizationId },
    data: { [spec.field]: null, updatedById: actor.id },
  });
  await deleteObject(key).catch(() => {});
  refresh();
  return { success: `${spec.label} removed.` };
}

/** Clears every branding setting and image, restoring the Roadcase (Concept A) defaults. */
export async function resetBrandingAction(
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor) return NOT_ALLOWED;
  const branding = await db.organizationBranding.findUnique({
    where: { organizationId: actor.organizationId },
  });
  await db.organizationBranding.deleteMany({ where: { organizationId: actor.organizationId } });
  await db.organizationBranding.create({
    data: { organizationId: actor.organizationId, updatedById: actor.id },
  });
  if (branding) {
    for (const kind of brandingImageKinds) {
      const key = branding[brandingImages[kind].field];
      if (key) await deleteObject(key).catch(() => {});
    }
  }
  refresh();
  return { success: "Appearance reset to the Roadcase defaults." };
}
