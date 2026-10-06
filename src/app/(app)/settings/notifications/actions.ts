"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { formObject, invalid, type FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";
import { safeErrorMessage } from "@/lib/jobs/errors";
import { slackScopes } from "@/lib/notifications/slack-scopes";
import { encryptSecret, secretsConfigured } from "@/lib/secrets";
import { parseWebhookUrl, webhookHint } from "@/lib/slack";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";

function refresh() {
  revalidatePath("/settings/notifications");
}

/** Queues a branded test email to the signed-in organization admin. */
export async function sendTestEmailAction(): Promise<FormState> {
  const actor = await requireUser();
  if (!can(actor, "settings:manage", { organizationId: actor.organizationId })) {
    return NOT_ALLOWED;
  }
  try {
    await enqueue("email.send", {
      organizationId: actor.organizationId,
      idempotencyKey: `test-email:${crypto.randomUUID()}`,
      recipient: { userId: actor.id },
      template: "test",
      data: { requestedBy: actor.displayName },
    });
  } catch (error) {
    console.error(`[notifications] Couldn't queue a test email: ${safeErrorMessage(error)}`);
    return { error: "Couldn't queue the test email. Try again in a minute." };
  }
  refresh();
  return {
    success: `Test email queued to ${actor.email}. It should arrive within a minute; if it doesn't, check Recent job failures below.`,
  };
}

const webhookSchema = z.object({
  scope: z.string().regex(/^(campus|department):[0-9a-f-]{36}$/, "Choose a campus or department."),
  label: z.string().trim().min(1, "Enter the channel name, such as #hne-production.").max(80),
  url: z.string().trim().min(1, "Paste the webhook URL from Slack.").max(500),
});

/** A webhook the actor may manage (its campus or department is in their scopes). */
async function manageableWebhook(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const webhook = await db.slackWebhook.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true, label: true, campusId: true, departmentId: true },
  });
  if (!webhook) return null;
  const scopes = await slackScopes(actor);
  const allowed =
    scopes.campuses.some((c) => c.id === webhook.campusId) ||
    scopes.departments.some((d) => d.id === webhook.departmentId);
  return allowed ? webhook : null;
}

export async function addSlackWebhookAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const parsed = webhookSchema.safeParse({ scope: "", ...formObject(formData) });
  if (!parsed.success) return invalid(parsed.error);

  const [kind, scopeId] = parsed.data.scope.split(":") as ["campus" | "department", string];
  const scopes = await slackScopes(actor);
  const target =
    kind === "campus"
      ? scopes.campuses.find((c) => c.id === scopeId)
      : scopes.departments.find((d) => d.id === scopeId);
  if (!target) return NOT_ALLOWED;

  const url = parseWebhookUrl(parsed.data.url);
  if (!url.ok) return { error: PLEASE_FIX, fieldErrors: { url: [url.error] } };
  if (!secretsConfigured()) {
    return {
      error:
        "Slack alerts can't be saved yet: the server has no SECRETS_ENCRYPTION_KEY. Ask whoever runs Roadcase to set it.",
    };
  }

  const scopeName = kind === "campus" ? `${target.name} campus` : `${target.name} department`;
  try {
    await db.slackWebhook.create({
      data: {
        organizationId: actor.organizationId,
        campusId: kind === "campus" ? target.id : null,
        departmentId: kind === "department" ? target.id : null,
        label: parsed.data.label,
        encryptedUrl: encryptSecret(url.url),
        urlHint: webhookHint(url.url),
        createdById: actor.id,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: PLEASE_FIX,
        fieldErrors: {
          scope: [`${scopeName} already has a Slack webhook. Remove it first to replace it.`],
        },
      };
    }
    throw error;
  }
  refresh();
  return { success: `Ticket alerts for ${scopeName} will post to ${parsed.data.label}.` };
}

export async function removeSlackWebhookAction(
  webhookId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const webhook = await manageableWebhook(actor, webhookId);
  if (!webhook) return NOT_ALLOWED;
  await db.slackWebhook.delete({ where: { id: webhook.id } });
  refresh();
  return { success: `Removed ${webhook.label}.` };
}

export async function sendSlackTestAction(
  webhookId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const webhook = await manageableWebhook(actor, webhookId);
  if (!webhook) return NOT_ALLOWED;
  try {
    await enqueue("slack.post", {
      kind: "test",
      organizationId: actor.organizationId,
      webhookId: webhook.id,
    });
  } catch (error) {
    console.error(`[notifications] Couldn't queue a Slack test: ${safeErrorMessage(error)}`);
    return { error: "Couldn't queue the test message. Try again in a minute." };
  }
  return { success: `Test message queued for ${webhook.label}. It should appear within a minute.` };
}
