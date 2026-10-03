"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { PermissionLevel } from "@/generated/prisma/enums.ts";
import { grantDetailSelect, parseScopeValue, toGrantScope } from "@/lib/admin/scopes";
import {
  canManageGrantScope,
  canManageUser,
  isAnyAdmin,
  requireUser,
  type CurrentUser,
} from "@/lib/authz";
import { hashPassword, passwordSchema } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes and underscores only.")
  .transform((value) => value.toLowerCase());

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(120),
  email: z
    .email("Enter a valid email address.")
    .max(254)
    .transform((value) => value.toLowerCase()),
  role: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null),
});

const grantSchema = z.object({
  level: z.enum(PermissionLevel, "Choose an access level."),
  scope: z.string().min(1, "Choose where the access applies."),
  canSubmitTickets: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
});

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

/** Loads a user the actor may manage, or null. */
async function manageableUser(actor: CurrentUser, userId: string) {
  if (!z.uuid().safeParse(userId).success) return null;
  const target = await db.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: {
      id: true,
      organizationId: true,
      isActive: true,
      grants: { select: grantDetailSelect },
    },
  });
  if (!target) return null;
  const scopes = target.grants.map(toGrantScope);
  return canManageUser(actor, { organizationId: target.organizationId, grants: scopes })
    ? target
    : null;
}

/** True when someone other than `userId` still holds active organization-wide admin. */
async function anotherOrgAdminExists(organizationId: string, userId: string) {
  const count = await db.permissionGrant.count({
    where: {
      organizationId,
      scopeType: "ORGANIZATION",
      level: "ADMIN",
      userId: { not: userId },
      user: { isActive: true },
    },
  });
  return count > 0;
}

function refresh(userId?: string) {
  revalidatePath("/settings/users");
  if (userId) revalidatePath(`/settings/users/${userId}`);
}

export async function createUserAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  if (!isAnyAdmin(actor)) return NOT_ALLOWED;

  const parsed = profileSchema
    .extend({ username: usernameSchema, password: passwordSchema })
    .extend(grantSchema.shape)
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const scope = await parseScopeValue(actor.organizationId, data.scope);
  if (!scope || !canManageGrantScope(actor, scope)) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { scope: ["Choose a scope you administer."] },
    };
  }

  const existing = await db.user.findFirst({
    where: {
      organizationId: actor.organizationId,
      OR: [{ username: data.username }, { email: data.email }],
    },
    select: { username: true },
  });
  if (existing) {
    const field = existing.username === data.username ? "username" : "email";
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { [field]: ["Another account already uses this."] },
    };
  }

  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        organizationId: actor.organizationId,
        username: data.username,
        passwordHash: await hashPassword(data.password),
        displayName: data.displayName,
        email: data.email,
        role: data.role,
        preference: { create: {} },
        grants: {
          create: {
            organizationId: actor.organizationId,
            level: data.level,
            scopeType: scope.scopeType,
            campusId: scope.campusId,
            locationId: scope.locationId,
            departmentId: scope.departmentId,
            canSubmitTickets: data.canSubmitTickets,
            createdById: actor.id,
          },
        },
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (isUniqueViolation(error))
      return { error: "Another account already uses that username or email." };
    throw error;
  }

  refresh();
  redirect(`/settings/users/${userId}?created=1`);
}

export async function updateProfileAction(
  userId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const target = await manageableUser(actor, userId);
  if (!target) return NOT_ALLOWED;

  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await db.user.update({ where: { id: target.id }, data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { email: ["Another account already uses this."] },
      };
    }
    throw error;
  }
  refresh(target.id);
  return { success: "Profile saved." };
}

export async function resetPasswordAction(
  userId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const target = await manageableUser(actor, userId);
  if (!target) return NOT_ALLOWED;

  const parsed = z.object({ password: passwordSchema }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  await db.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  if (target.id === actor.id) redirect("/sign-in");
  return { success: "Password reset. The user has been signed out everywhere." };
}

export async function setActiveAction(
  userId: string,
  active: boolean,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const target = await manageableUser(actor, userId);
  if (!target) return NOT_ALLOWED;
  if (target.id === actor.id) return { error: "You can't deactivate your own account." };

  if (!active) {
    const isOrgAdmin = target.grants.some(
      (grant) => grant.scopeType === "ORGANIZATION" && grant.level === "ADMIN",
    );
    if (isOrgAdmin && !(await anotherOrgAdminExists(actor.organizationId, target.id))) {
      return { error: "This is the last organization admin. Make someone else an admin first." };
    }
  }

  await db.user.update({
    where: { id: target.id },
    data: { isActive: active, sessionVersion: { increment: 1 } },
  });
  refresh(target.id);
  return { success: active ? "Account reactivated." : "Account deactivated and signed out." };
}

export async function addGrantAction(
  userId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const target = await manageableUser(actor, userId);
  if (!target) return NOT_ALLOWED;

  const parsed = grantSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const scope = await parseScopeValue(actor.organizationId, parsed.data.scope);
  if (!scope || !canManageGrantScope(actor, scope)) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { scope: ["Choose a scope you administer."] },
    };
  }

  // One grant per scope: adding again replaces the level.
  const existing = target.grants.find(
    (grant) =>
      grant.scopeType === scope.scopeType &&
      grant.campusId === scope.campusId &&
      grant.locationId === scope.locationId &&
      grant.departmentId === scope.departmentId,
  );
  if (
    existing &&
    existing.scopeType === "ORGANIZATION" &&
    existing.level === "ADMIN" &&
    parsed.data.level !== "ADMIN" &&
    !(await anotherOrgAdminExists(actor.organizationId, target.id))
  ) {
    return { error: "This is the last organization admin. Make someone else an admin first." };
  }

  const fields = { level: parsed.data.level, canSubmitTickets: parsed.data.canSubmitTickets };
  if (existing) {
    await db.permissionGrant.update({ where: { id: existing.id }, data: fields });
  } else {
    await db.permissionGrant.create({
      data: {
        ...fields,
        organizationId: actor.organizationId,
        userId: target.id,
        scopeType: scope.scopeType,
        campusId: scope.campusId,
        locationId: scope.locationId,
        departmentId: scope.departmentId,
        createdById: actor.id,
      },
    });
  }
  refresh(target.id);
  return { success: existing ? "Access updated." : "Access added." };
}

export async function removeGrantAction(
  userId: string,
  grantId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const target = await manageableUser(actor, userId);
  if (!target) return NOT_ALLOWED;

  const grant = target.grants.find((candidate) => candidate.id === grantId);
  if (!grant || !canManageGrantScope(actor, toGrantScope(grant))) return NOT_ALLOWED;

  if (
    grant.scopeType === "ORGANIZATION" &&
    grant.level === "ADMIN" &&
    !(await anotherOrgAdminExists(actor.organizationId, target.id))
  ) {
    return { error: "This is the last organization admin. Make someone else an admin first." };
  }

  await db.permissionGrant.delete({ where: { id: grant.id } });
  refresh(target.id);
  return { success: "Access removed." };
}
