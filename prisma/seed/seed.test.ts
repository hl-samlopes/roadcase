import { describe, expect, it } from "vitest";
import { campuses, categories, itemConditions, organization } from "./data.ts";
import { parseSeedEnv } from "./env.ts";

const validEnv = {
  SEED_ADMIN_USERNAME: "Admin",
  SEED_ADMIN_PASSWORD: "a-long-enough-password",
  SEED_ADMIN_EMAIL: "Admin@Example.com",
};

describe("seed data", () => {
  it("has the three starting campuses with uppercase codes", () => {
    expect(campuses.map((c) => c.code)).toEqual(["HLK", "HNE", "HSC"]);
    for (const campus of campuses) expect(campus.code).toMatch(/^[A-Z]{2,6}$/);
  });

  it("has the five default categories, each with unique subcategories", () => {
    expect(categories.map((c) => c.name)).toEqual([
      "Audio",
      "Lighting",
      "Video",
      "Staging",
      "Cabling",
    ]);
    for (const category of categories) {
      expect(category.subcategories.length).toBeGreaterThan(0);
      expect(new Set(category.subcategories).size).toBe(category.subcategories.length);
    }
  });

  it("has unique item conditions with one default and one that starts repair tickets", () => {
    const labels = itemConditions.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(itemConditions.filter((c) => c.isDefault)).toHaveLength(1);
    expect(itemConditions.filter((c) => c.startsRepairTicket).map((c) => c.label)).toEqual([
      "Needs repair",
    ]);
  });

  it("uses a lowercase url-safe organization slug", () => {
    expect(organization.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("parseSeedEnv", () => {
  it("lowercases username and email and defaults the display name", () => {
    expect(parseSeedEnv(validEnv)).toEqual({
      SEED_ADMIN_USERNAME: "admin",
      SEED_ADMIN_PASSWORD: "a-long-enough-password",
      SEED_ADMIN_EMAIL: "admin@example.com",
      SEED_ADMIN_DISPLAY_NAME: "Administrator",
    });
  });

  it("rejects a short password without echoing it", () => {
    const password = "short";
    let message = "";
    try {
      parseSeedEnv({ ...validEnv, SEED_ADMIN_PASSWORD: password });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("SEED_ADMIN_PASSWORD");
    expect(message).not.toContain(password);
  });

  it("requires the admin settings", () => {
    expect(() => parseSeedEnv({})).toThrow(/SEED_ADMIN_USERNAME/);
  });
});
