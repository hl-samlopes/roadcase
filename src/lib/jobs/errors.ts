/** Longest error message kept in the failure log. */
export const MAX_ERROR_LENGTH = 500;

/**
 * A short, single-line error message that is safe to store and show to
 * admins: credentials in URLs, bearer tokens and API keys are removed.
 */
export function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}`
      : typeof error === "string"
        ? error
        : "Unknown error";
  const cleaned = raw
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//***@")
    .replace(/\b(bearer)\s+[\w.~+/-]+=*/gi, "$1 ***")
    .replace(/\b(api[_-]?key|token|secret|password)(["']?\s*[=:]\s*["']?)[^\s"'&,;]+/gi, "$1$2***")
    .replace(/\s+/g, " ")
    .trim();
  const message = cleaned || "Unknown error";
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
}

/** What to record for a failed attempt, from pg-boss's retry counters. */
export function describeAttempt(retryCount: number, retryLimit: number) {
  return { attempt: retryCount + 1, willRetry: retryCount < retryLimit };
}
