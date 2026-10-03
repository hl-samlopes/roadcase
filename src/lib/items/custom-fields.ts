import type { FieldType } from "@/generated/prisma/enums.ts";

/** The parts of a FieldDefinition needed to read and write values. */
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: unknown;
}

export const fieldTypeLabels: Record<FieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  DROPDOWN: "Dropdown",
  CHECKBOX: "Checkbox",
};

/** Form input name for a custom field. */
export function inputName(key: string): string {
  return `cf_${key}`;
}

export function dropdownOptions(field: Pick<FieldDef, "options">): string[] {
  return Array.isArray(field.options)
    ? field.options.filter((option): option is string => typeof option === "string")
    : [];
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return (
    date.getUTCFullYear() === +match[1] &&
    date.getUTCMonth() === +match[2] - 1 &&
    date.getUTCDate() === +match[3]
  );
}

/**
 * Validates submitted values for the active fields and merges them over the
 * item's existing values, so values of archived fields are kept. Empty
 * optional values are removed. Checkboxes are always stored (unchecked is
 * false), so "required" does not apply to them.
 */
export function parseCustomFieldInput(
  fields: FieldDef[],
  input: Record<string, string | undefined>,
  existing: unknown,
): { values: Record<string, unknown>; errors: Record<string, string[]> } {
  const values: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const errors: Record<string, string[]> = {};
  const fail = (field: FieldDef, message: string) => {
    errors[inputName(field.key)] = [message];
  };

  for (const field of fields) {
    const raw = (input[inputName(field.key)] ?? "").trim();

    if (field.type === "CHECKBOX") {
      values[field.key] = raw === "on";
      continue;
    }
    if (raw === "") {
      delete values[field.key];
      if (field.required) fail(field, "Required.");
      continue;
    }

    switch (field.type) {
      case "TEXT":
        if (raw.length > 1000) fail(field, "Use at most 1000 characters.");
        else values[field.key] = raw;
        break;
      case "NUMBER": {
        const number = Number(raw);
        if (!Number.isFinite(number)) fail(field, "Enter a number.");
        else values[field.key] = number;
        break;
      }
      case "DATE":
        if (!isValidDate(raw)) fail(field, "Enter a date as YYYY-MM-DD.");
        else values[field.key] = raw;
        break;
      case "DROPDOWN":
        if (!dropdownOptions(field).includes(raw)) fail(field, "Choose one of the options.");
        else values[field.key] = raw;
        break;
    }
  }
  return { values, errors };
}

/** Human-readable value for display and CSV export; empty string when unset. */
export function formatCustomFieldValue(field: Pick<FieldDef, "type">, value: unknown): string {
  if (field.type === "CHECKBOX") return value === true ? "Yes" : "No";
  if (value === undefined || value === null) return "";
  return String(value);
}
