import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { EmailContent } from "@/lib/email/layout";
import type { EmailAttachment } from "@/lib/email/provider";
import { getObjectBytes } from "@/lib/storage";
import { utcStamp } from "./signing";

/**
 * The "here's your signed contract" email, with the PDF attached. The PDF is
 * read from storage when the email is sent; if it isn't there yet the job
 * throws, so it retries.
 */
export async function contractEmail(
  organizationId: string,
  contractId: string,
): Promise<{ content: EmailContent; attachments: EmailAttachment[] } | { skip: string }> {
  if (!z.uuid().safeParse(contractId).success) return { skip: "no contract id" };
  const contract = await db.contract.findFirst({
    where: { id: contractId, organizationId, voidedAt: null },
    select: {
      signedAt: true,
      pdfKey: true,
      checkout: {
        select: {
          number: true,
          groupName: true,
          campus: { select: { name: true } },
        },
      },
      signatures: { select: { role: true, printedName: true } },
    },
  });
  if (!contract?.signedAt) return { skip: "contract isn't signed" };
  if (!contract.pdfKey) throw new Error("The contract PDF isn't ready yet");

  const { checkout } = contract;
  const names = contract.signatures.map((sig) => sig.printedName).join(" and ");
  const pdf = await getObjectBytes(contract.pdfKey);
  return {
    content: {
      subject: `Signed contract: check-out #${checkout.number} (${checkout.groupName})`,
      heading: "Your signed contract",
      paragraphs: [
        `Attached is the signed contract for ${checkout.groupName}'s equipment check-out #${checkout.number} from ${checkout.campus.name}.`,
        `${names} signed it on ${utcStamp(contract.signedAt)}. Keep this copy for your records.`,
      ],
      footer: "You're getting this because you signed this contract.",
    },
    attachments: [
      {
        filename: `contract-checkout-${checkout.number}.pdf`,
        contentType: "application/pdf",
        content: pdf,
      },
    ],
  };
}
