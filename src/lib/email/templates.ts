import type { EmailContent } from "./layout";
import type { emailTemplates } from "@/lib/jobs/queues";

export type EmailTemplate = (typeof emailTemplates)[number];

/** Subject and body for each email the app sends; `data` comes from the job. */
export function renderTemplate(
  template: EmailTemplate,
  data: Record<string, string>,
  organizationName: string,
): EmailContent {
  switch (template) {
    case "test":
      return {
        subject: `Test email from ${organizationName}`,
        heading: "Email is working",
        paragraphs: [
          `${data.requestedBy || "An admin"} sent this test from Settings > Notifications in ${organizationName}.`,
          "If it reached you, ticket and check-out emails will too. There's nothing else to do.",
        ],
      };
  }
}
