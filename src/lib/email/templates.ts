import type { EmailContent } from "./layout";
import type { emailTemplates } from "@/lib/jobs/queues";

export type EmailTemplate = (typeof emailTemplates)[number];

/** The test email from Settings > Notifications. Ticket emails are in notifications/content.ts. */
export function testEmailContent(
  data: Record<string, string>,
  organizationName: string,
): EmailContent {
  return {
    subject: `Test email from ${organizationName}`,
    heading: "Email is working",
    paragraphs: [
      `${data.requestedBy || "An admin"} sent this test from Settings > Notifications in ${organizationName}.`,
      "If it reached you, ticket and check-out emails will too. There's nothing else to do.",
    ],
  };
}
