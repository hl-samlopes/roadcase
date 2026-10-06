import { describe, expect, it } from "vitest";
import { jobIdFor } from "./boss";

describe("jobIdFor", () => {
  it("is a stable, valid UUID per queue and key", () => {
    const id = jobIdFor("email.send", "ticket:1:2");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(jobIdFor("email.send", "ticket:1:2")).toBe(id);
    expect(jobIdFor("slack.post", "ticket:1:2")).not.toBe(id);
    expect(jobIdFor("email.send", "ticket:1:3")).not.toBe(id);
  });
});
