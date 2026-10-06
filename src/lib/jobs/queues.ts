import { z } from "zod";
import { ticketNotices } from "@/lib/notifications/recipients";

/**
 * Background job queues: names, retry policy and payloads. The app sends to
 * these queues and the worker (`npm run worker`) processes them. Payloads
 * are validated on both sides, and handlers must be safe to run more than
 * once (a retry can follow an attempt that half finished).
 */

const retry = {
  // 5 retries at about 30s, 1m, 2m, 4m and 8m, capped at 15 minutes.
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 900,
  expireInSeconds: 300,
} as const;

export const emailTemplates = ["test", "ticket", "contract"] as const;

/**
 * Who an email goes to. A user id is looked up when the email is sent, so a
 * changed address or a deactivated account is respected; a plain address is
 * for people without an account (guests, from Phase 2 step 4).
 */
const recipient = z.union([
  z.object({ userId: z.uuid() }),
  z.object({ email: z.email(), name: z.string().max(200).optional() }),
]);

export const queues = {
  "email.send": {
    label: "Send email",
    options: retry,
    payload: z.object({
      organizationId: z.uuid(),
      /** Same for every attempt, so a retry can tell the email already went out. */
      idempotencyKey: z.string().min(1).max(200),
      recipient,
      template: z.enum(emailTemplates),
      data: z.record(z.string(), z.string()).default({}),
    }),
  },
  /** Works out who hears about a ticket event, then queues their emails and Slack posts. */
  "ticket.notify": {
    label: "Ticket notification",
    options: retry,
    payload: z.object({
      organizationId: z.uuid(),
      ticketId: z.uuid(),
      eventId: z.uuid(),
      notice: z.enum(ticketNotices),
      actorId: z.uuid().nullable(),
    }),
  },
  "slack.post": {
    label: "Post to Slack",
    options: retry,
    payload: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("test"), organizationId: z.uuid(), webhookId: z.uuid() }),
      z.object({
        kind: z.literal("ticket"),
        organizationId: z.uuid(),
        webhookId: z.uuid(),
        ticketId: z.uuid(),
        eventId: z.uuid(),
        notice: z.enum(ticketNotices),
      }),
    ]),
  },
  /** Makes the signed contract's PDF, stores it, then queues the emails to both parties. */
  "contract.pdf": {
    label: "Signed contract PDF",
    options: retry,
    payload: z.object({ organizationId: z.uuid(), contractId: z.uuid() }),
  },
  /** Fails its first attempts on purpose; only registered when JOBS_TEST_QUEUE=1 (e2e tests). */
  "test.flaky": {
    label: "Test job",
    options: { retryLimit: 2, retryDelay: 1, expireInSeconds: 30 },
    payload: z.object({
      organizationId: z.uuid(),
      failAttempts: z.number().int().min(0).max(5),
    }),
  },
} as const;

export type QueueName = keyof typeof queues;
export type QueuePayload<Q extends QueueName> = z.input<(typeof queues)[Q]["payload"]>;
export type ParsedPayload<Q extends QueueName> = z.output<(typeof queues)[Q]["payload"]>;

export function queueLabel(name: string): string {
  return name in queues ? queues[name as QueueName].label : name;
}
