/**
 * Merge fields a contract template can use, written as {{name}} in the text.
 * Shared by the editor (to insert and flag fields) and the renderer.
 */
export const mergeFields = [
  { name: "organization", label: "Organization name" },
  { name: "campus", label: "Campus" },
  { name: "checkout_number", label: "Check-out number" },
  { name: "group", label: "Guest group" },
  { name: "guest_rep", label: "Guest representative's name" },
  { name: "guest_rep_email", label: "Guest representative's email" },
  { name: "guest_rep_phone", label: "Guest representative's phone" },
  { name: "staff_rep", label: "Staff representative" },
  { name: "dates", label: "Dates out and back" },
  { name: "date_out", label: "Date out" },
  { name: "date_back", label: "Date back" },
  { name: "item_list", label: "Item list (a table when on its own line)" },
  { name: "fees_total", label: "Total fees" },
] as const;

export type MergeFieldName = (typeof mergeFields)[number]["name"];

const known = new Set<string>(mergeFields.map((field) => field.name));

/** Matches {{ name }} with optional spaces; the name is captured. */
export const FIELD_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export function isKnownField(name: string): name is MergeFieldName {
  return known.has(name);
}

/** Field names used in a piece of text, in order of appearance. */
export function fieldsIn(text: string): string[] {
  return [...text.matchAll(FIELD_PATTERN)].map((match) => match[1]);
}
