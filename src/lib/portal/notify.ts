import "server-only";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { loadCandidates } from "@/lib/notifications/data";
import { isRequestApprover } from "./requests";

/**
 * Worker handler for request.notify: emails everyone who can review a
 * request that a group just sent (or changed). Keys make a retried fan-out
 * safe; each email checks the recipient again when it's sent.
 */
export async function fanOutRequestNotice(payload: ParsedPayload<"request.notify">) {
  const { organizationId, requestId, submittedAt } = payload;
  const request = await db.equipmentRequest.findFirst({
    where: { id: requestId, organizationId },
    select: { campusId: true, organizationId: true },
  });
  if (!request) return { emails: 0 };
  const recipients = (await loadCandidates(organizationId)).filter((candidate) =>
    isRequestApprover(candidate, request),
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
