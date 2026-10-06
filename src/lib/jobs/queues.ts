import { z } from "zod";

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

export const emailTemplates = ["test"] as const;

export const queues = {
  "email.send": {
    label: "Send email",
    options: retry,
    payload: z.object({
      organizationId: z.uuid(),
      /** Same for every attempt, so a retry can tell the email already went out. */
      idempotencyKey: z.string().min(1).max(200),
      to: z.object({ email: z.email(), name: z.string().max(200).optional() }),
      template: z.enum(emailTemplates),
      data: z.record(z.string(), z.string()).default({}),
    }),
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
