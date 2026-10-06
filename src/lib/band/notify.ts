import "server-only";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { loadCandidates } from "@/lib/notifications/data";
import { isBandRecipient } from "@/lib/portal/requests";

/** Worker handler for band.notify: emails the audio team (who run check-outs at the campus). */
export async function fanOutBandNotice(payload: ParsedPayload<"band.notify">) {
  const { organizationId, setupId, submittedAt } = payload;
  const setup = await db.bandSetup.findFirst({
    where: { id: setupId, organizationId },
    select: { organizationId: true, campusId: true },
  });
  if (!setup) return { emails: 0 };
  const recipients = (await loadCandidates(organizationId)).filter((candidate) =>
    isBandRecipient(candidate, setup),
  );
  for (const recipient of recipients) {
    const key = `band-sent:${setupId}:${submittedAt}:${recipient.id}`;
    await enqueue(
      "email.send",
      {
        organizationId,
        idempotencyKey: key,
        recipient: { userId: recipient.id },
        template: "band-sent",
        data: { setupId, submittedAt },
      },
      { key },
    );
  }
  return { emails: recipients.length };
}
