import { describe, expect, it } from "vitest";
import {
  documentText,
  fillDocument,
  MAX_DOCUMENT_BYTES,
  parseDocument,
  templateFields,
  type ContractDoc,
  type MergeValues,
} from "./document";
import { placeholderTemplate } from "./placeholder";

const values: MergeValues = {
  organization: "Hume New England",
  campus: "Hume New England (HNE)",
  checkout_number: "12",
  group: "Youth group",
  guest_rep: "Alex Rivera",
  guest_rep_email: "alex@example.com",
  guest_rep_phone: "(555) 123-4567",
  staff_rep: "Sam Lopes",
  dates: "Oct 10, 2026 to Oct 12, 2026",
  date_out: "Oct 10, 2026",
  date_back: "Oct 12, 2026",
  fees_total: "$25.00",
  item_list: [
    { code: "HNE-000001", name: "Wedge", fee: "$25.00" },
    { code: "HNE-000002", name: "Mic stand", fee: null },
  ],
};

const doc = (...content: unknown[]) => ({ type: "doc", content });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("parseDocument", () => {
  it("keeps allowed nodes and drops attributes and marks it doesn't know", () => {
    const result = parseDocument(
      JSON.stringify(
        doc(
          {
            type: "heading",
            attrs: { level: 9, onclick: "x" },
            content: [{ type: "text", text: "Hi" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bold",
                marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:x" } }],
              },
            ],
          },
        ),
      ),
    );
    expect(result).toEqual({
      ok: true,
      doc: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] },
          {
            type: "paragraph",
            content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
          },
        ],
      },
    });
  });

  it("refuses node types outside the allow-list", () => {
    for (const bad of [
      doc({ type: "image", attrs: { src: "http://evil.example/x.png" } }),
      doc({ type: "codeBlock", content: [] }),
      doc({ type: "paragraph", content: [{ type: "html", text: "<script>" }] }),
      { type: "paragraph", content: [] },
    ]) {
      expect(parseDocument(bad).ok).toBe(false);
    }
    expect(parseDocument("not json").ok).toBe(false);
    expect(parseDocument(doc(para("x".repeat(MAX_DOCUMENT_BYTES)))).ok).toBe(false);
  });

  it("accepts the placeholder template unchanged", () => {
    expect(parseDocument(placeholderTemplate)).toEqual({ ok: true, doc: placeholderTemplate });
  });
});

describe("templateFields", () => {
  it("separates fields that will be filled in from unknown ones", () => {
    const parsed = parseDocument(doc(para("Hello {{group}}, {{ guest_rep }} and {{grup}}")));
    expect(parsed.ok && templateFields(parsed.doc)).toEqual({
      known: ["group", "guest_rep"],
      unknown: ["grup"],
    });
  });
});

describe("fillDocument and documentText", () => {
  it("fills fields, turns a lone {{item_list}} into a table, and keeps unknown fields", () => {
    const template = doc(
      para("Agreement with {{group}} ({{guest_rep}}), {{dates}}. {{nope}}"),
      para("{{item_list}}"),
      para("Inline: {{item_list}}. Total {{fees_total}}"),
    ) as ContractDoc;
    const filled = fillDocument(template, values);
    expect(filled.content[1].type).toBe("table");
    expect(documentText(filled)).toBe(
      [
        "Agreement with Youth group (Alex Rivera), Oct 10, 2026 to Oct 12, 2026. {{nope}}",
        "Code\tItem\tFee",
        "HNE-000001\tWedge\t$25.00",
        "HNE-000002\tMic stand\tNo fee",
        "Inline: HNE-000001 Wedge ($25.00), HNE-000002 Mic stand. Total $25.00",
      ].join("\n"),
    );
  });

  it("fills every field the placeholder uses", () => {
    const text = documentText(fillDocument(placeholderTemplate, values));
    expect(text).not.toMatch(/\{\{/);
    expect(text).toContain("DRAFT — NOT REVIEWED");
    expect(text).toContain("- The group keeps the equipment secure");
  });
});
