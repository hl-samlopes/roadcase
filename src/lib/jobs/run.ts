import "server-only";
import type { JobWithMetadata } from "pg-boss";
import { db } from "@/lib/db";
import { describeAttempt, safeErrorMessage } from "./errors";
import { queues, type ParsedPayload, type QueueName } from "./queues";

export type JobHandler<Q extends QueueName> = (
  data: ParsedPayload<Q>,
  job: JobWithMetadata<unknown>,
) => Promise<unknown>;

function organizationIdOf(data: unknown): string | null {
  const id = (data as { organizationId?: unknown } | null)?.organizationId;
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * Runs one job: validates the payload, calls the handler, and on failure
 * records the attempt for admins before rethrowing so pg-boss retries it.
 */
export async function runJob<Q extends QueueName>(
  queue: Q,
  job: JobWithMetadata<unknown>,
  handler: JobHandler<Q>,
) {
  try {
    const data = queues[queue].payload.parse(job.data) as ParsedPayload<Q>;
    return await handler(data, job);
  } catch (error) {
    const message = safeErrorMessage(error);
    const { attempt, willRetry } = describeAttempt(job.retryCount, job.retryLimit);
    console.error(
      `[worker] ${queue} job ${job.id} failed (attempt ${attempt}, ${willRetry ? "will retry" : "giving up"}): ${message}`,
    );
    await db.jobFailure
      .create({
        data: {
          organizationId: organizationIdOf(job.data),
          queue,
          jobId: job.id,
          attempt,
          willRetry,
          error: message,
        },
      })
      .catch((recordError: unknown) =>
        console.error(`[worker] Couldn't record the failure: ${safeErrorMessage(recordError)}`),
      );
    throw error;
  }
}
