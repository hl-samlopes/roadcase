import { describe, expect, it } from "vitest";
import { pngBytes } from "@/test-support/png";
import { defaultLightTokens } from "@/lib/theme/tokens";
import { documentText, fillDocument, type MergeValues } from "./document";
import { renderContractPdf } from "./pdf";
import { placeholderTemplate } from "./placeholder";
import { SIGNATURE_CONSENT, sha256Hex, utcStamp } from "./signing";

const values: MergeValues = {
  organization: "Signal Camps",
  campus: "Signal North (SGN)",
  checkout_number: "7",
  group: "Band camp",
  guest_rep: "Riley Band",
  guest_rep_email: "riley@example.com",
  guest_rep_phone: "(555) 222-3333",
  staff_rep: "Sam Staff",
  dates: "Mar 1, 2030 to Mar 5, 2030",
  date_out: "Mar 1, 2030",
  date_back: "Mar 5, 2030",
  fees_total: "$30.00",
  item_list: [{ code: "SGN-000004", name: "Preview speaker", fee: "$30.00" }],
};

describe("renderContractPdf", () => {
  it("makes a PDF whose metadata carries the contract text hash", async () => {
    const doc = fillDocument(placeholderTemplate, values);
    const textHash = sha256Hex(documentText(doc));
    const signedAt = new Date("2030-03-01T15:04:05Z");
    const signature = {
      printedName: "Riley Band",
      signedAt,
      ipAddress: "203.0.113.7",
      userAgent: "Test browser",
      textHash,
      image: pngBytes(),
    };
    const pdf = await renderContractPdf({
      doc,
      organizationName: "Signal Camps",
      logo: null,
      colors: defaultLightTokens,
      checkout: { number: 7, groupName: "Band camp", campus: "Signal North (SGN)" },
      templateVersion: 2,
      textHash,
      preparedAt: signedAt,
      signedAt,
      consentText: SIGNATURE_CONSENT,
      signatures: [
        { ...signature, role: "GUEST" },
        { ...signature, role: "STAFF", printedName: "Sam Staff" },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    expect(raw).toContain(textHash);
    // Two pages: the contract with signatures, then the audit trail.
    expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(utcStamp(signedAt)).toBe("2030-03-01 15:04:05 UTC");
  });
});
