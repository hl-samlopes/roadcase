import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { createElement as h, type ReactElement, type ReactNode } from "react";
import type { ContractDoc, ContractNode, Mark } from "./document";
import { signerRoleLabels, utcStamp } from "./signing";

/**
 * The signed contract as a PDF, made by the worker with @react-pdf/renderer.
 * Written with createElement instead of JSX because the worker runs this
 * file with Node's own TypeScript support, which doesn't do JSX.
 *
 * Fonts are the PDF standard Helvetica family (the organization's web fonts
 * aren't embedded); colors and logo come from the organization's branding.
 */

// Never break words across lines: names, emails and item codes must stay whole.
Font.registerHyphenationCallback((word) => [word]);

export interface PdfSignature {
  role: "GUEST" | "STAFF";
  printedName: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  textHash: string;
  image: Uint8Array;
}

export interface ContractPdfInput {
  doc: ContractDoc;
  organizationName: string;
  /** PNG or JPEG bytes of the light logo, if the organization has one. */
  logo: { data: Uint8Array; format: "png" | "jpg" } | null;
  colors: { text: string; muted: string; border: string; accent: string; bg: string };
  checkout: { number: number; groupName: string; campus: string };
  templateVersion: number;
  textHash: string;
  preparedAt: Date;
  signedAt: Date;
  consentText: string;
  signatures: PdfSignature[];
}

/**
 * Footer position from the top of a US Letter page (792pt tall). react-pdf
 * loses bottom-anchored "Page X of Y" text when the page sets a lineHeight,
 * but draws it when anchored from the top.
 */
const FOOTER_TOP = 792 - 36;

function styles(colors: ContractPdfInput["colors"]) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 48,
      fontFamily: "Helvetica",
      fontSize: 10.5,
      lineHeight: 1.45,
      color: colors.text,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: colors.accent,
      paddingBottom: 8,
      marginBottom: 16,
    },
    orgName: { fontFamily: "Helvetica-Bold", fontSize: 14 },
    meta: { color: colors.muted, fontSize: 9 },
    p: { marginBottom: 6 },
    h1: { fontFamily: "Helvetica-Bold", fontSize: 16, marginTop: 10, marginBottom: 6 },
    h2: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 8, marginBottom: 5 },
    h3: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginTop: 6, marginBottom: 4 },
    listItem: { flexDirection: "row", marginBottom: 2 },
    bullet: { width: 16 },
    listBody: { flex: 1 },
    table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border, marginBottom: 8 },
    row: { flexDirection: "row" },
    cell: {
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingVertical: 3,
      paddingHorizontal: 5,
    },
    headerCell: { backgroundColor: colors.bg, fontFamily: "Helvetica-Bold" },
    rule: { borderBottomWidth: 1, borderBottomColor: colors.border, marginVertical: 8 },
    sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 16, marginBottom: 8 },
    signatures: { flexDirection: "row", gap: 16 },
    signatureBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 8,
    },
    signatureImage: { height: 70, objectFit: "contain", marginBottom: 4 },
    label: { color: colors.muted, fontSize: 9 },
    auditRow: { flexDirection: "row", marginBottom: 3 },
    auditKey: { width: 130, color: colors.muted },
    auditValue: { flex: 1 },
    footerLeft: {
      position: "absolute",
      top: FOOTER_TOP,
      left: 48,
      right: 140,
      fontSize: 8.5,
      color: colors.muted,
    },
    footerRight: {
      position: "absolute",
      top: FOOTER_TOP,
      left: 48,
      right: 48,
      fontSize: 8.5,
      color: colors.muted,
      textAlign: "right",
    },
  });
}

type Styles = ReturnType<typeof styles>;

function fontFor(marks: Mark[] = []) {
  const bold = marks.some((m) => m.type === "bold");
  const italic = marks.some((m) => m.type === "italic");
  return bold && italic
    ? "Helvetica-BoldOblique"
    : bold
      ? "Helvetica-Bold"
      : italic
        ? "Helvetica-Oblique"
        : undefined;
}

/**
 * Joins neighbouring text runs with the same marks. The editor and the merge
 * step split text into runs (" (" then "{{guest_rep_email}}"), and react-pdf
 * would otherwise put a hyphen where it breaks a line between two runs.
 */
function mergeRuns(nodes: ContractNode[]): ContractNode[] {
  const merged: ContractNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (
      node.type === "text" &&
      last?.type === "text" &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      merged[merged.length - 1] = { ...last, text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/** Inline content (text with marks, line breaks) as nested Text runs. */
function inline(nodes: ContractNode[] = []): ReactNode[] {
  return mergeRuns(nodes).map((node, i) => {
    if (node.type === "hardBreak") return "\n";
    if (node.type !== "text") return null;
    const fontFamily = fontFor(node.marks);
    const underline = node.marks?.some((m) => m.type === "underline");
    return fontFamily || underline
      ? h(
          Text,
          {
            key: i,
            style: {
              ...(fontFamily ? { fontFamily } : {}),
              ...(underline ? { textDecoration: "underline" as const } : {}),
            },
          },
          node.text,
        )
      : node.text;
  });
}

function block(node: ContractNode, s: Styles, key: number): ReactElement | null {
  switch (node.type) {
    case "paragraph":
      return h(Text, { key, style: s.p }, ...inline(node.content));
    case "heading":
      return h(
        Text,
        { key, style: [s.h1, s.h2, s.h3][node.attrs.level - 1] },
        ...inline(node.content),
      );
    case "horizontalRule":
      return h(View, { key, style: s.rule });
    case "bulletList":
    case "orderedList":
      return h(
        View,
        { key },
        ...node.content.map((item, i) =>
          h(
            View,
            { key: i, style: s.listItem, wrap: false },
            h(
              Text,
              { style: s.bullet },
              node.type === "bulletList" ? "•" : `${(node.attrs?.start ?? 1) + i}.`,
            ),
            h(
              View,
              { style: s.listBody },
              ...("content" in item && item.content ? item.content : []).map((child, j) =>
                block(child, s, j),
              ),
            ),
          ),
        ),
      );
    case "table":
      return h(
        View,
        { key, style: s.table },
        ...node.content.map((row, r) =>
          h(
            View,
            { key: r, style: s.row, wrap: false },
            ...("content" in row && row.content ? row.content : []).map((cell, c) => {
              const span =
                cell.type === "tableCell" || cell.type === "tableHeader"
                  ? (cell.attrs?.colspan ?? 1)
                  : 1;
              return h(
                View,
                {
                  key: c,
                  style: [
                    s.cell,
                    { flex: span },
                    ...(cell.type === "tableHeader" ? [s.headerCell] : []),
                  ],
                },
                ...("content" in cell && cell.content ? cell.content : []).map((child, j) =>
                  child.type === "paragraph"
                    ? h(Text, { key: j }, ...inline(child.content))
                    : block(child, s, j),
                ),
              );
            }),
          ),
        ),
      );
    default:
      return null;
  }
}

function auditRow(s: Styles, label: string, value: string, keyPrefix = "") {
  return h(
    View,
    { key: `${keyPrefix}${label}`, style: s.auditRow },
    h(Text, { style: s.auditKey }, label),
    h(Text, { style: s.auditValue }, value),
  );
}

export function contractPdfElement(input: ContractPdfInput) {
  const s = styles(input.colors);
  const title = `Contract for check-out #${input.checkout.number}`;
  // Repeated on every page (react-pdf's documented pattern: fixed, absolutely positioned Text).
  const footer = () => [
    h(
      Text,
      { key: "footer-left", style: s.footerLeft, fixed: true },
      `${input.organizationName} · ${title} · SHA-256 ${input.textHash.slice(0, 16)}…`,
    ),
    h(Text, {
      key: "footer-right",
      style: s.footerRight,
      fixed: true,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} of ${totalPages}`,
    }),
  ];
  const byRole = (role: "GUEST" | "STAFF") => input.signatures.find((sig) => sig.role === role);

  return h(
    Document,
    {
      title,
      author: input.organizationName,
      subject: `SHA-256 ${input.textHash}`,
      keywords: `contract, check-out ${input.checkout.number}, ${input.textHash}`,
      creator: "Roadcase",
      producer: "Roadcase",
    },
    h(
      Page,
      { size: "LETTER", style: s.page },
      h(
        View,
        { style: s.header },
        input.logo
          ? h(Image, {
              src: { data: Buffer.from(input.logo.data), format: input.logo.format },
              style: { height: 28 },
            })
          : h(Text, { style: s.orgName }, input.organizationName),
        h(
          View,
          null,
          h(
            Text,
            { style: s.meta },
            `Check-out #${input.checkout.number} · ${input.checkout.groupName}`,
          ),
          h(Text, { style: s.meta }, input.checkout.campus),
        ),
      ),
      ...input.doc.content.map((node, i) => block(node, s, i)),
      h(Text, { style: s.sectionTitle, minPresenceAhead: 120 }, "Signatures"),
      h(
        View,
        { style: s.signatures, wrap: false },
        ...(["GUEST", "STAFF"] as const).map((role) => {
          const sig = byRole(role);
          return h(
            View,
            { key: role, style: s.signatureBox },
            h(Text, { style: s.label }, signerRoleLabels[role]),
            sig
              ? h(Image, {
                  src: { data: Buffer.from(sig.image), format: "png" },
                  style: s.signatureImage,
                })
              : null,
            h(Text, null, sig?.printedName ?? ""),
            h(Text, { style: s.label }, sig ? `Signed ${utcStamp(sig.signedAt)}` : ""),
          );
        }),
      ),
      ...footer(),
    ),
    h(
      Page,
      { size: "LETTER", style: s.page },
      h(Text, { style: s.h1 }, "Signature audit trail"),
      auditRow(s, "Check-out", `#${input.checkout.number}, ${input.checkout.groupName}`),
      auditRow(s, "Campus", input.checkout.campus),
      auditRow(s, "Template version", String(input.templateVersion)),
      auditRow(s, "Prepared", utcStamp(input.preparedAt)),
      auditRow(s, "Fully signed", utcStamp(input.signedAt)),
      auditRow(s, "Contract text SHA-256", input.textHash),
      auditRow(s, "Consent", input.consentText),
      ...input.signatures.flatMap((sig) => [
        h(Text, { key: `${sig.role}-title`, style: s.h2 }, signerRoleLabels[sig.role]),
        auditRow(s, "Printed name", sig.printedName, sig.role),
        auditRow(s, "Signed", utcStamp(sig.signedAt), sig.role),
        auditRow(s, "IP address", sig.ipAddress ?? "Not recorded", sig.role),
        auditRow(s, "Browser", sig.userAgent ?? "Not recorded", sig.role),
        auditRow(s, "Text SHA-256 shown", sig.textHash, sig.role),
      ]),
      ...footer(),
    ),
  );
}

export function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return renderToBuffer(contractPdfElement(input));
}
