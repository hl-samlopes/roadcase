import "server-only";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { loadCandidates } from "@/lib/notifications/data";
import { campusNoticeRecipients } from "./requests";

/**
 * Worker handler for request.notify: emails the campus's default contact
 * (or, without one, everyone who can review it) that a group just sent or
 * changed a request. Keys make a retried fan-out
 * safe; each email checks the recipient again when it's sent.
 */
export async function fanOutRequestNotice(payload: ParsedPayload<"request.notify">) {
  const { organizationId, requestId, submittedAt } = payload;
  const request = await db.equipmentRequest.findFirst({
    where: { id: requestId, organizationId },
    select: {
      campusId: true,
      organizationId: true,
      guestGroup: { select: { campus: { select: { defaultContactId: true } } } },
    },
  });
  if (!request) return { emails: 0 };
  const recipients = campusNoticeRecipients(
    await loadCandidates(organizationId),
    { ...request, defaultContactId: request.guestGroup.campus.defaultContactId },
    "request",
  );
  for (const recipient of recipients) {
    const key = `request-sent:${requestId}:${submittedAt}:${recipient.id}`;
    await enqueue(
      "email.send",
      {
        organizationId,
        idempotencyKey: key,
        recipient: { userId: recipient.id },
        template: "request-sent",
        data: { requestId, submittedAt },
      },
      { key },
    );
  }
  return { emails: recipients.length };
}
