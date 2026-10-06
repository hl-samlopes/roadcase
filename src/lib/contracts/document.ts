import { FIELD_PATTERN, fieldsIn, isKnownField, type MergeFieldName } from "./fields";

/**
 * Contract documents in the editor's JSON shape (TipTap/ProseMirror), limited
 * to an allow-list: headings, paragraphs, bold/italic/underline, lists,
 * tables, line breaks and rules. Anything else is refused on save, and
 * renderers only know these types, so stored templates can't carry markup
 * or scripts.
 */

export type Mark = { type: "bold" | "italic" | "underline" };

export type ContractNode =
  | { type: "doc"; content: ContractNode[] }
  | { type: "paragraph"; content?: ContractNode[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3 }; content?: ContractNode[] }
  | { type: "text"; text: string; marks?: Mark[] }
  | { type: "hardBreak" }
  | { type: "horizontalRule" }
  | { type: "bulletList"; content: ContractNode[] }
  | { type: "orderedList"; attrs?: { start: number }; content: ContractNode[] }
  | { type: "listItem"; content: ContractNode[] }
  | { type: "table"; content: ContractNode[] }
  | { type: "tableRow"; content: ContractNode[] }
  | {
      type: "tableHeader" | "tableCell";
      attrs?: { colspan: number; rowspan: number };
      content: ContractNode[];
    };

export type ContractDoc = Extract<ContractNode, { type: "doc" }>;

/** Largest template accepted, as JSON. Plenty for a multi-page contract. */
export const MAX_DOCUMENT_BYTES = 200_000;
const MAX_DEPTH = 12;

const containers = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);
const markTypes = new Set(["bold", "italic", "underline"]);

class InvalidDocument extends Error {}

function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Copies a node keeping only allowed types, attributes and marks; throws on anything else. */
function clean(input: unknown, depth: number): ContractNode {
  if (depth > MAX_DEPTH) throw new InvalidDocument("The template is nested too deeply.");
  if (!input || typeof input !== "object") throw new InvalidDocument("Unreadable template.");
  const node = input as Record<string, unknown>;
  const type = node.type;

  if (type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) {
      throw new InvalidDocument("Unreadable text in the template.");
    }
    const marks = Array.isArray(node.marks)
      ? node.marks
          .map((mark) => (mark as { type?: unknown })?.type)
          .filter((markType): markType is Mark["type"] => markTypes.has(markType as string))
          .map((markType) => ({ type: markType }))
      : [];
    return marks.length
      ? { type: "text", text: node.text, marks }
      : { type: "text", text: node.text };
  }
  if (type === "hardBreak" || type === "horizontalRule") return { type };
  if (typeof type !== "string" || !containers.has(type)) {
    throw new InvalidDocument(
      `The template contains something that isn't allowed (${String(type)}).`,
    );
  }

  const content = Array.isArray(node.content)
    ? node.content.map((child) => clean(child, depth + 1))
    : [];
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  switch (type) {
    case "heading":
      return { type, attrs: { level: int(attrs.level, 1, 3, 2) as 1 | 2 | 3 }, content };
    case "orderedList":
      return { type, attrs: { start: int(attrs.start, 1, 10_000, 1) }, content };
    case "tableHeader":
    case "tableCell":
      return {
        type,
        attrs: { colspan: int(attrs.colspan, 1, 20, 1), rowspan: int(attrs.rowspan, 1, 50, 1) },
        content,
      };
    default:
      return { type, content } as ContractNode;
  }
}

/** Checks a template from the editor; returns the cleaned document or why it was refused. */
export function parseDocument(
  input: unknown,
): { ok: true; doc: ContractDoc } | { ok: false; error: string } {
  try {
    const raw = typeof input === "string" ? JSON.parse(input) : input;
    if (JSON.stringify(raw).length > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: "The template is too long." };
    }
    const doc = clean(raw, 0);
    if (doc.type !== "doc") return { ok: false, error: "Unreadable template." };
    return { ok: true, doc };
  } catch (error) {
    if (error instanceof InvalidDocument) return { ok: false, error: error.message };
    return { ok: false, error: "Unreadable template." };
  }
}

function eachText(node: ContractNode, visit: (text: string) => void) {
  if (node.type === "text") visit(node.text);
  else if ("content" in node && node.content) node.content.forEach((n) => eachText(n, visit));
}

/** Merge fields a template uses, split into known ones and ones that won't be filled in. */
export function templateFields(doc: ContractDoc) {
  const used = new Set<string>();
  eachText(doc, (text) => fieldsIn(text).forEach((name) => used.add(name)));
  const names = [...used];
  return {
    known: names.filter(isKnownField),
    unknown: names.filter((name) => !isKnownField(name)),
  };
}

export interface ContractItem {
  code: string;
  name: string;
  /** Formatted, e.g. "$25.00"; null for no fee. */
  fee: string | null;
}

export type MergeValues = Record<Exclude<MergeFieldName, "item_list">, string> & {
  item_list: ContractItem[];
};

const text = (value: string): ContractNode => ({ type: "text", text: value });
const cell = (type: "tableHeader" | "tableCell", value: string): ContractNode => ({
  type,
  attrs: { colspan: 1, rowspan: 1 },
  content: [{ type: "paragraph", content: value ? [text(value)] : [] }],
});

/** {{item_list}} on its own line: a table of codes, items and fees. */
function itemTable(items: ContractItem[]): ContractNode {
  const rows = items.map((item): ContractNode => ({
    type: "tableRow",
    content: [
      cell("tableCell", item.code),
      cell("tableCell", item.name),
      cell("tableCell", item.fee ?? "No fee"),
    ],
  }));
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          cell("tableHeader", "Code"),
          cell("tableHeader", "Item"),
          cell("tableHeader", "Fee"),
        ],
      },
      ...(rows.length
        ? rows
        : [
            {
              type: "tableRow" as const,
              content: [
                cell("tableCell", "No items"),
                cell("tableCell", ""),
                cell("tableCell", ""),
              ],
            },
          ]),
    ],
  };
}

/** {{item_list}} inside a sentence: a short comma-separated list. */
function inlineItems(items: ContractItem[]): string {
  if (items.length === 0) return "no items";
  return items
    .map((item) => `${item.code} ${item.name}${item.fee ? ` (${item.fee})` : ""}`)
    .join(", ");
}

function fillText(value: string, values: MergeValues): string {
  return value.replace(FIELD_PATTERN, (match, name: string) => {
    if (!isKnownField(name)) return match;
    return name === "item_list" ? inlineItems(values.item_list) : values[name];
  });
}

function isLoneItemList(node: ContractNode): boolean {
  if (node.type !== "paragraph" || !node.content) return false;
  const joined = node.content.map((n) => (n.type === "text" ? n.text : "\u0000")).join("");
  return /^\s*\{\{\s*item_list\s*\}\}\s*$/.test(joined);
}

function fill(node: ContractNode, values: MergeValues): ContractNode {
  if (node.type === "text") return { ...node, text: fillText(node.text, values) };
  if (!("content" in node) || !node.content) return node;
  return {
    ...node,
    content: node.content.map((child) =>
      isLoneItemList(child) ? itemTable(values.item_list) : fill(child, values),
    ),
  } as ContractNode;
}

/** The template with every known field filled in; unknown fields stay as typed. */
export function fillDocument(doc: ContractDoc, values: MergeValues): ContractDoc {
  return fill(doc, values) as ContractDoc;
}

/**
 * Plain text of a document, one block per line and table cells separated by
 * tabs. Step 4 hashes this text, so it must stay stable for a given document.
 */
export function documentText(doc: ContractDoc): string {
  const lines: string[] = [];
  const inline = (nodes: ContractNode[] = []): string =>
    nodes.map((n) => (n.type === "text" ? n.text : n.type === "hardBreak" ? "\n" : "")).join("");
  const walk = (node: ContractNode, prefix = "") => {
    switch (node.type) {
      case "paragraph":
      case "heading":
        lines.push(prefix + inline(node.content));
        break;
      case "horizontalRule":
        lines.push("---");
        break;
      case "bulletList":
        node.content.forEach((item) => walk(item, "- "));
        break;
      case "orderedList":
        node.content.forEach((item, i) => walk(item, `${(node.attrs?.start ?? 1) + i}. `));
        break;
      case "listItem":
        node.content.forEach((child, i) => walk(child, i === 0 ? prefix : "  "));
        break;
      case "table":
        node.content.forEach((row) => walk(row));
        break;
      case "tableRow":
        lines.push(
          node.content
            .map((c) =>
              "content" in c && c.content
                ? c.content.map((p) => ("content" in p ? inline(p.content) : "")).join(" ")
                : "",
            )
            .join("\t"),
        );
        break;
      case "doc":
        node.content.forEach((child) => walk(child));
        break;
      default:
        break;
    }
  };
  walk(doc);
  return lines.join("\n");
}
