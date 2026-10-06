import "server-only";
import { PgBoss } from "pg-boss";
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

/** Queues a job for the worker. The payload is validated before it is stored. */
export async function enqueue<Q extends QueueName>(queue: Q, payload: QueuePayload<Q>) {
  const data = queues[queue].payload.parse(payload);
  const boss = await sender();
  const id = await boss.send(queue, data);
  if (!id) throw new Error(`Job was not queued on ${queue}`);
  return id;
}
