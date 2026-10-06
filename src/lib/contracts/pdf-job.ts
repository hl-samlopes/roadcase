import "server-only";
import { getBranding } from "@/lib/branding";
import { contractOrganizationName } from "@/lib/data/contracts";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { getObjectBytes, putObject } from "@/lib/storage";
import { resolveTheme } from "@/lib/theme/resolve";
import { parseDocument, type ContractDoc } from "./document";
import { renderContractPdf, type ContractPdfInput } from "./pdf";
import { SIGNATURE_CONSENT } from "./signing";

/** The light logo as PNG or JPEG bytes; other formats (SVG, WebP) fall back to the name. */
async function pdfLogo(key: string | null | undefined): Promise<ContractPdfInput["logo"]> {
  const format = key?.match(/\.(png|jpe?g)$/i)?.[1].toLowerCase();
  if (!key || !format) return null;
  try {
    return { data: await getObjectBytes(key), format: format === "png" ? "png" : "jpg" };
  } catch {
    return null;
  }
}

/**
 * Worker handler for contract.pdf: renders and stores the PDF once, then
 * queues the emails to the guest and the staff representative. Safe to rerun:
 * an existing PDF is reused and the emails are keyed.
 */
export async function generateContractPdf(payload: ParsedPayload<"contract.pdf">) {
  const { organizationId, contractId } = payload;
  const contract = await db.contract.findFirst({
    where: { id: contractId, organizationId, voidedAt: null },
    select: {
      id: true,
      document: true,
      textHash: true,
      preparedAt: true,
      signedAt: true,
      pdfKey: true,
      templateVersion: { select: { version: true } },
      checkout: {
        select: {
          number: true,
          groupName: true,
          guestRepName: true,
          guestRepEmail: true,
          staffRepId: true,
          campus: { select: { code: true, name: true } },
        },
      },
      signatures: {
        select: {
          role: true,
          printedName: true,
          signedAt: true,
          ipAddress: true,
          userAgent: true,
          textHash: true,
          imageKey: true,
        },
      },
    },
  });
  if (!contract?.signedAt) return { skipped: "contract isn't signed" };

  if (!contract.pdfKey) {
    const parsed = parseDocument(contract.document);
    if (!parsed.ok) throw new Error("Stored contract is unreadable");
    const branding = await getBranding(organizationId);
    const theme = resolveTheme(branding, null);
    const [organizationName, logo, signatures] = await Promise.all([
      contractOrganizationName(organizationId),
      pdfLogo(branding?.logoLightKey ?? branding?.logoDarkKey),
      Promise.all(
        contract.signatures.map(async (sig) => ({
          ...sig,
          image: await getObjectBytes(sig.imageKey),
        })),
      ),
    ]);
    const { checkout } = contract;
    const pdf = await renderContractPdf({
      doc: parsed.doc as ContractDoc,
      organizationName,
      logo,
      colors: theme.light,
      checkout: {
        number: checkout.number,
        groupName: checkout.groupName,
        campus: `${checkout.campus.name} (${checkout.campus.code})`,
      },
      templateVersion: contract.templateVersion.version,
      textHash: contract.textHash,
      preparedAt: contract.preparedAt,
      signedAt: contract.signedAt,
      consentText: SIGNATURE_CONSENT,
      signatures,
    });
    const key = `contracts/${organizationId}/${contract.id}.pdf`;
    await putObject(key, pdf, "application/pdf");
    await db.contract.update({
      where: { id: contract.id },
      data: { pdfKey: key, pdfGeneratedAt: new Date() },
    });
  }

  const { checkout } = contract;
  const send = (key: string, recipient: { userId: string } | { email: string; name: string }) =>
    enqueue(
      "email.send",
      {
        organizationId,
        idempotencyKey: key,
        recipient,
        template: "contract",
        data: { contractId: contract.id },
      },
      { key },
    );
  await send(`contract:${contract.id}:guest`, {
    email: checkout.guestRepEmail,
    name: checkout.guestRepName,
  });
  if (checkout.staffRepId) {
    await send(`contract:${contract.id}:staff`, { userId: checkout.staffRepId });
  }
  return { skipped: null };
}
