import "server-only";
import { randomUUID } from "node:crypto";
import type { SignerRole } from "@/generated/prisma/enums.ts";
import {
  documentText,
  fillDocument,
  parseDocument,
  type ContractDoc,
} from "@/lib/contracts/document";
import { SIGNATURE_CONSENT, sha256Hex } from "@/lib/contracts/signing";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import { deleteObject, putObject } from "@/lib/storage";
import { checkoutMergeValues, latestTemplateVersion } from "./contracts";

/** The check-out's current (not voided) contract, with its signatures. */
export async function activeContract(organizationId: string, checkoutId: string) {
  const contract = await db.contract.findFirst({
    where: { organizationId, checkoutId, voidedAt: null },
    select: {
      id: true,
      document: true,
      textHash: true,
      preparedAt: true,
      signedAt: true,
      pdfKey: true,
      pdfGeneratedAt: true,
      preparedBy: { select: { displayName: true } },
      templateVersion: { select: { version: true } },
      signatures: {
        orderBy: { signedAt: "asc" },
        select: {
          id: true,
          role: true,
          printedName: true,
          signedAt: true,
          ipAddress: true,
          userAgent: true,
          textHash: true,
          consentText: true,
          collectedBy: { select: { displayName: true } },
        },
      },
    },
  });
  if (!contract) return null;
  const parsed = parseDocument(contract.document);
  if (!parsed.ok) throw new Error("Stored contract is unreadable");
  return { ...contract, doc: parsed.doc as ContractDoc };
}

export type ActiveContract = NonNullable<Awaited<ReturnType<typeof activeContract>>>;

type CheckoutForContract = {
  id: string;
  organizationId: string;
  campusId: string;
  status: string;
  staffRepId: string | null;
  lines: unknown[];
};

/** Why a draft can't be prepared for signing yet, or null when it can. */
export function prepareProblem(checkout: CheckoutForContract, hasTemplate: boolean): string | null {
  if (checkout.status !== "DRAFT") return "Only a draft check-out can be prepared for signing.";
  if (checkout.lines.length === 0) return "Add at least one item first.";
  if (!checkout.staffRepId) return "Choose a staff representative first.";
  if (!hasTemplate) {
    return "This campus has no contract template yet. An admin adds one in Settings > Contract templates.";
  }
  return null;
}

/**
 * Freezes the contract for a draft: fills the campus's latest template from
 * the check-out, stores the document, its text and the text's SHA-256, and
 * moves the check-out to Awaiting signatures (which locks its items).
 */
export async function prepareContract(checkout: CheckoutForContract, preparedById: string) {
  const template = await latestTemplateVersion(checkout.organizationId, checkout.campusId);
  const problem = prepareProblem(checkout, !!template);
  if (problem) return { error: problem };
  const values = await checkoutMergeValues(checkout.organizationId, checkout.campusId, checkout.id);
  if (!values || !template) return { error: "Only a draft check-out can be prepared for signing." };

  const doc = fillDocument(template.doc, values);
  const text = documentText(doc);
  return db.$transaction(async (tx) => {
    const moved = await tx.checkout.updateMany({
      where: { id: checkout.id, status: "DRAFT" },
      data: { status: "AWAITING_SIGNATURES" },
    });
    if (moved.count !== 1) return { error: "Only a draft check-out can be prepared for signing." };
    await tx.contract.create({
      data: {
        organizationId: checkout.organizationId,
        checkoutId: checkout.id,
        templateVersionId: template.id,
        document: doc,
        text,
        textHash: sha256Hex(text),
        preparedById,
      },
    });
    return { error: null };
  });
}

/** Back to draft before both have signed: the contract is voided (kept as history). */
export async function voidUnsignedContract(organizationId: string, checkoutId: string) {
  return db.$transaction(async (tx) => {
    const voided = await tx.contract.updateMany({
      where: { organizationId, checkoutId, voidedAt: null, signedAt: null },
      data: { voidedAt: new Date() },
    });
    const moved = await tx.checkout.updateMany({
      where: { id: checkoutId, status: "AWAITING_SIGNATURES" },
      data: { status: "DRAFT" },
    });
    return voided.count === 1 && moved.count === 1;
  });
}

export interface SignatureInput {
  role: SignerRole;
  printedName: string;
  /** The hash the signer's page showed; must match the stored contract. */
  textHash: string;
  image: Uint8Array;
  ipAddress: string | null;
  userAgent: string | null;
  collectedById: string;
}

/**
 * Records one signature. The image is stored first (privately), then the row
 * inside a transaction that locks the contract, so two signatures arriving at
 * once can't both miss being "the second". The second signature locks the
 * contract, moves the check-out to Out and queues the PDF.
 */
export async function recordSignature(
  organizationId: string,
  contractId: string,
  input: SignatureInput,
): Promise<{ error: string | null; complete: boolean }> {
  const imageKey = `signatures/${organizationId}/${contractId}/${input.role.toLowerCase()}-${randomUUID()}.png`;
  await putObject(imageKey, input.image, "image/png");

  try {
    return await db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        {
          id: string;
          checkoutId: string;
          textHash: string;
          signedAt: Date | null;
          voidedAt: Date | null;
        }[]
      >`select id, "checkoutId", "textHash", "signedAt", "voidedAt" from "Contract"
        where id = ${contractId}::uuid and "organizationId" = ${organizationId}::uuid for update`;
      if (!locked || locked.voidedAt || locked.signedAt) {
        throw new SignatureRefused("This contract can no longer be signed.");
      }
      if (locked.textHash !== input.textHash) {
        throw new SignatureRefused(
          "The contract changed since this page opened. Reload it and read it again before signing.",
        );
      }
      const existing = await tx.contractSignature.findUnique({
        where: { contractId_role: { contractId, role: input.role } },
        select: { id: true },
      });
      if (existing) throw new SignatureRefused("This party has already signed.");

      await tx.contractSignature.create({
        data: {
          contractId,
          role: input.role,
          printedName: input.printedName,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          textHash: input.textHash,
          consentText: SIGNATURE_CONSENT,
          imageKey,
          collectedById: input.collectedById,
        },
      });
      const count = await tx.contractSignature.count({ where: { contractId } });
      if (count < 2) return { error: null, complete: false };

      await tx.contract.update({ where: { id: contractId }, data: { signedAt: new Date() } });
      await tx.checkout.update({ where: { id: locked.checkoutId }, data: { status: "OUT" } });
      await enqueue("contract.pdf", { organizationId, contractId }, { tx, key: contractId });
      return { error: null, complete: true };
    });
  } catch (error) {
    // Nothing references the image if the row wasn't written.
    await deleteObject(imageKey).catch(() => {});
    if (error instanceof SignatureRefused) return { error: error.message, complete: false };
    throw error;
  }
}

class SignatureRefused extends Error {}
