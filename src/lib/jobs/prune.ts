import "server-only";
import { db } from "@/lib/db";

/** How long the failure log and the sent-email record are kept. */
export const RETENTION_DAYS = 90;

/**
 * Deletes failure-log and sent-email rows older than the retention period.
 * Sent-email keys only need to outlive a job's retries (minutes), so 90 days
 * is plenty; the failure log keeps a season of history for admins.
 */
export async function pruneOldJobRecords(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [failures, emails] = await Promise.all([
    db.jobFailure.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.sentEmail.deleteMany({ where: { sentAt: { lt: cutoff } } }),
  ]);
  return { failures: failures.count, emails: emails.count };
}
