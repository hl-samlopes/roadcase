/**
 * Background worker: processes queued jobs (email, ticket notifications,
 * Slack and signed contract PDFs) on the app's database. Run with `npm run worker` next to the
 * web app; any number of workers can run at once.
 */
import { generateContractPdf } from "@/lib/contracts/pdf-job";
import { sendEmail } from "@/lib/email/send";
import { createBoss, ensureQueues } from "@/lib/jobs/boss";
import { safeErrorMessage } from "@/lib/jobs/errors";
import { pruneOldJobRecords } from "@/lib/jobs/prune";
import type { QueueName } from "@/lib/jobs/queues";
import { runJob, type JobHandler } from "@/lib/jobs/run";
import { fanOutTicketNotice, postSlackJob } from "@/lib/notifications/jobs";

const handlers: { [Q in QueueName]?: JobHandler<Q> } = {
  "email.send": (data) => sendEmail(data),
  "ticket.notify": (data) => fanOutTicketNotice(data),
  "slack.post": (data) => postSlackJob(data),
  "contract.pdf": (data) => generateContractPdf(data),
};

// e2e tests check retries and the failure log with a job that fails on purpose.
if (process.env.JOBS_TEST_QUEUE === "1") {
  handlers["test.flaky"] = async (data, job) => {
    if (job.retryCount < data.failAttempts) {
      throw new Error(`Test job failed attempt ${job.retryCount + 1} on purpose`);
    }
  };
}

const boss = createBoss({ supervise: true });
await boss.start();
await ensureQueues(boss);

for (const [queue, handler] of Object.entries(handlers) as [QueueName, JobHandler<QueueName>][]) {
  await boss.work(queue, { includeMetadata: true }, async ([job]) => {
    const result = (await runJob(queue, job, handler)) as { skipped?: string | null } | undefined;
    // Skips (for example a recipient who lost access) are normal, not failures.
    const note = result?.skipped ? `skipped: ${result.skipped}` : "done";
    console.log(`[worker] ${queue} job ${job.id} ${note}`);
  });
}
console.log(`[worker] Ready: ${Object.keys(handlers).join(", ")}`);

// Old failure-log and sent-email rows: at start, then daily.
async function prune() {
  try {
    const removed = await pruneOldJobRecords();
    if (removed.failures || removed.emails) {
      console.log(`[worker] Pruned ${removed.failures} failures and ${removed.emails} sent emails`);
    }
  } catch (error) {
    console.error(`[worker] Prune failed: ${safeErrorMessage(error)}`);
  }
}
void prune();
const pruneTimer = setInterval(() => void prune(), 24 * 60 * 60 * 1000);
pruneTimer.unref();

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: finishing active jobs`);
  try {
    await boss.stop({ graceful: true, timeout: 20_000 });
  } catch (error) {
    console.error(`[worker] Stop failed: ${safeErrorMessage(error)}`);
  }
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
