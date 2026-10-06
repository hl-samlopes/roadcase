import "server-only";
import { createHash } from "node:crypto";
import { fromPrisma, PgBoss, type PrismaTransactionLike } from "pg-boss";
import { safeErrorMessage } from "./errors";
import { queues, type QueueName, type QueuePayload } from "./queues";

/** pg-boss keeps its tables in their own schema, apart from Prisma's. */
const SCHEMA = "pgboss";

/**
 * A pg-boss instance on the app's database. The worker supervises (runs
 * maintenance); the web app only sends, so it skips that work.
 */
export function createBoss({ supervise }: { supervise: boolean }) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss({
    connectionString,
    schema: SCHEMA,
    supervise,
    schedule: false,
    max: supervise ? 10 : 3,
    application_name: supervise ? "roadcase-worker" : "roadcase-web",
  });
  boss.on("error", (error) => console.error(`[jobs] ${safeErrorMessage(error)}`));
  return boss;
}

/** Creates any missing queues and keeps existing ones on the current retry policy. */
export async function ensureQueues(boss: PgBoss) {
  for (const [name, queue] of Object.entries(queues)) {
    if (await boss.getQueue(name)) await boss.updateQueue(name, queue.options);
    else await boss.createQueue(name, queue.options);
  }
}

// One started sender per server process, reused across hot reloads in development.
const globalForJobs = globalThis as unknown as { roadcaseBoss?: Promise<PgBoss> };

async function startSender() {
  const boss = createBoss({ supervise: false });
  await boss.start();
  await ensureQueues(boss);
  return boss;
}

function sender(): Promise<PgBoss> {
  globalForJobs.roadcaseBoss ??= startSender().catch((error: unknown) => {
    globalForJobs.roadcaseBoss = undefined;
    throw error;
  });
  return globalForJobs.roadcaseBoss;
}

/** A UUID that is always the same for the same queue and key. */
export function jobIdFor(queue: string, key: string): string {
  const hex = createHash("sha256").update(`${queue}\0${key}`).digest("hex");
  // Shaped as an RFC 9562 version 8 (custom) UUID.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Queues a job for the worker. The payload is validated before it is stored.
 *
 * - `tx`: queue it inside a Prisma interactive transaction, so the job exists
 *   only if the transaction commits.
 * - `key`: a job with the same queue and key is queued only once, so a retried
 *   fan-out job doesn't queue duplicates. Returns null when it already exists.
 */
export async function enqueue<Q extends QueueName>(
  queue: Q,
  payload: QueuePayload<Q>,
  options: { tx?: PrismaTransactionLike; key?: string } = {},
): Promise<string | null> {
  const data = queues[queue].payload.parse(payload);
  const boss = await sender();
  const id = await boss.send(queue, data, {
    ...(options.key ? { id: jobIdFor(queue, options.key) } : {}),
    ...(options.tx ? { db: fromPrisma(options.tx) } : {}),
  });
  if (!id && !options.key) throw new Error(`Job was not queued on ${queue}`);
  return id;
}
