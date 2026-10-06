/**
 * Background worker: processes queued jobs (email now; Slack and contract
 * PDFs later) on the app's database. Run with `npm run worker` next to the
 * web app; any number of workers can run at once.
 */
import { sendEmail } from "@/lib/email/send";
import { createBoss, ensureQueues } from "@/lib/jobs/boss";
import { safeErrorMessage } from "@/lib/jobs/errors";
import type { QueueName } from "@/lib/jobs/queues";
import { runJob, type JobHandler } from "@/lib/jobs/run";

const handlers: { [Q in QueueName]?: JobHandler<Q> } = {
  "email.send": (data) => sendEmail(data),
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
    await runJob(queue, job, handler);
    console.log(`[worker] ${queue} job ${job.id} done`);
  });
}
console.log(`[worker] Ready: ${Object.keys(handlers).join(", ")}`);

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
