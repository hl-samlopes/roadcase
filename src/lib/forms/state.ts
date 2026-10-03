import { z } from "zod";

/** Result a form's server action returns to its ActionForm. */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  success?: string;
}

export const initialFormState: FormState = {};

export function invalid(error: z.ZodError): FormState {
  return {
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as FormState["fieldErrors"],
  };
}

/** Reads FormData into a plain object for zod; checkboxes arrive as "on". */
export function formObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
