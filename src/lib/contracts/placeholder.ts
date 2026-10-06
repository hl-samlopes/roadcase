import type { ContractDoc, ContractNode } from "./document";

/**
 * The starting template for a campus. Its wording has NOT been reviewed by
 * counsel (Phase 2 plan, "Decisions needed"); it says so at the top, and the
 * campus replaces it with reviewed wording before go-live.
 */

const t = (text: string, bold = false): ContractNode =>
  bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text };
const p = (...content: ContractNode[]): ContractNode => ({ type: "paragraph", content });
const h = (level: 1 | 2 | 3, text: string): ContractNode => ({
  type: "heading",
  attrs: { level },
  content: [t(text)],
});
const li = (...content: ContractNode[]): ContractNode => ({
  type: "listItem",
  content: [p(...content)],
});

export const placeholderTemplate: ContractDoc = {
  type: "doc",
  content: [
    p(
      t("DRAFT — NOT REVIEWED. Replace this wording with your reviewed contract before use.", true),
    ),
    h(1, "Equipment loan agreement"),
    p(
      t("This agreement is between "),
      t("{{organization}}"),
      t(" and "),
      t("{{group}}"),
      t(", represented by "),
      t("{{guest_rep}}"),
      t(" ("),
      t("{{guest_rep_email}}"),
      t(", "),
      t("{{guest_rep_phone}}"),
      t(")."),
    ),
    h(2, "Loan period"),
    p(
      t("The equipment below goes out and must come back on these dates: "),
      t("{{dates}}"),
      t("."),
    ),
    h(2, "Equipment"),
    p(t("{{item_list}}")),
    p(t("Total fees: "), t("{{fees_total}}")),
    h(2, "Responsibilities"),
    {
      type: "bulletList",
      content: [
        li(t("The group keeps the equipment secure and uses it only for its stated purpose.")),
        li(t("The group reports any damage or loss to the staff representative right away.")),
        li(
          t("The group pays for repair or replacement of equipment damaged or lost while on loan."),
        ),
      ],
    },
    p(t("Staff representative: "), t("{{staff_rep}}"), t(", "), t("{{campus}}"), t(".")),
  ],
};
