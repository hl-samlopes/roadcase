import { describe, expect, it } from "vitest";
import { describeAttempt, MAX_ERROR_LENGTH, safeErrorMessage } from "./errors";

describe("safeErrorMessage", () => {
  it("removes credentials from connection strings", () => {
    const message = safeErrorMessage(
      new Error("connect failed for postgresql://roadcase:hunter2@db.internal:5432/roadcase"),
    );
    expect(message).not.toContain("hunter2");
    expect(message).toContain("postgresql://***@db.internal:5432/roadcase");
  });

  it("removes bearer tokens and key-like values", () => {
    const message = safeErrorMessage(
      "401 Authorization: Bearer sk_live_abc.def api_key=XYZ123 password: 'p4ss' token=tok_9",
    );
    for (const secret of ["sk_live_abc.def", "XYZ123", "p4ss", "tok_9"]) {
      expect(message).not.toContain(secret);
    }
  });

  it("keeps the error name, joins lines and caps the length", () => {
    expect(safeErrorMessage(new TypeError("bad\n  input"))).toBe("TypeError: bad input");
    expect(safeErrorMessage(new Error("x".repeat(2000)))).toHaveLength(MAX_ERROR_LENGTH);
    expect(safeErrorMessage(undefined)).toBe("Unknown error");
  });
});

describe("describeAttempt", () => {
  it("numbers attempts from 1 and stops retrying at the limit", () => {
    expect(describeAttempt(0, 2)).toEqual({ attempt: 1, willRetry: true });
    expect(describeAttempt(1, 2)).toEqual({ attempt: 2, willRetry: true });
    expect(describeAttempt(2, 2)).toEqual({ attempt: 3, willRetry: false });
    expect(describeAttempt(0, 0)).toEqual({ attempt: 1, willRetry: false });
  });
});
