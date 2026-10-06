import "server-only";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { loadCandidates } from "@/lib/notifications/data";
import { campusNoticeRecipients } from "@/lib/portal/requests";

/** Worker handler for band.notify: emails the campus's default contact, or the whole audio team without one. */
export async function fanOutBandNotice(payload: ParsedPayload<"band.notify">) {
  const { organizationId, setupId, submittedAt } = payload;
  const setup = await db.bandSetup.findFirst({
    where: { id: setupId, organizationId },
    select: {
      organizationId: true,
      campusId: true,
      guestGroup: { select: { campus: { select: { defaultContactId: true } } } },
    },
  });
  if (!setup) return { emails: 0 };
  const recipients = campusNoticeRecipients(
    await loadCandidates(organizationId),
    { ...setup, defaultContactId: setup.guestGroup.campus.defaultContactId },
    "band",
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
