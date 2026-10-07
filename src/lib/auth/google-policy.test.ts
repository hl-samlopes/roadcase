import { describe, expect, it } from "vitest";
import {
  allowedDomainsSchema,
  allowedGoogleIdentity,
  passwordSignInAllowed,
} from "./google-policy";

const claims = { sub: "1234", email: "Pat@Hume.org", email_verified: true, hd: "hume.org" };

describe("allowedGoogleIdentity", () => {
  it("accepts a verified account in an allowed domain, with the email lowercased", () => {
    expect(allowedGoogleIdentity(claims, ["hume.org"])).toEqual({
      subject: "1234",
      email: "pat@hume.org",
    });
  });

  it("refuses another domain, or no domains at all", () => {
    expect(allowedGoogleIdentity(claims, ["example.org"])).toBeNull();
    expect(allowedGoogleIdentity(claims, [])).toBeNull();
  });

  it("refuses an unverified email", () => {
    expect(allowedGoogleIdentity({ ...claims, email_verified: false }, ["hume.org"])).toBeNull();
    expect(allowedGoogleIdentity({ ...claims, email_verified: "true" }, ["hume.org"])).toBeNull();
  });

  it("refuses personal accounts, which have no Workspace domain", () => {
    expect(allowedGoogleIdentity({ ...claims, hd: undefined }, ["hume.org"])).toBeNull();
  });

  it("refuses an email outside the Workspace domain it came with", () => {
    expect(
      allowedGoogleIdentity({ ...claims, email: "pat@elsewhere.com" }, ["hume.org"]),
    ).toBeNull();
    expect(allowedGoogleIdentity({ ...claims, email: "pat@nothume.org" }, ["hume.org"])).toBeNull();
  });

  it("accepts a secondary domain of the Workspace when it's listed too", () => {
    const secondary = { ...claims, email: "pat@humelake.org" };
    expect(allowedGoogleIdentity(secondary, ["hume.org", "humelake.org"])?.email).toBe(
      "pat@humelake.org",
    );
    expect(allowedGoogleIdentity(secondary, ["humelake.org"])).toBeNull();
  });

  it("refuses claims without a subject", () => {
    expect(allowedGoogleIdentity({ ...claims, sub: "" }, ["hume.org"])).toBeNull();
    expect(allowedGoogleIdentity({ ...claims, sub: 1234 }, ["hume.org"])).toBeNull();
  });
});

describe("passwordSignInAllowed", () => {
  it("lets everyone use passwords while they're on", () => {
    const organization = { passwordSignIn: true, adminPasswordSignIn: false };
    expect(passwordSignInAllowed(organization, false)).toBe(true);
    expect(passwordSignInAllowed(organization, true)).toBe(true);
  });

  it("keeps organization admins' passwords when passwords are off, unless that's off too", () => {
    expect(passwordSignInAllowed({ passwordSignIn: false, adminPasswordSignIn: true }, false)).toBe(
      false,
    );
    expect(passwordSignInAllowed({ passwordSignIn: false, adminPasswordSignIn: true }, true)).toBe(
      true,
    );
    expect(passwordSignInAllowed({ passwordSignIn: false, adminPasswordSignIn: false }, true)).toBe(
      false,
    );
  });
});

describe("allowedDomainsSchema", () => {
  it("splits lines and commas, lowercases, drops a leading @ and duplicates", () => {
    expect(allowedDomainsSchema.parse("Hume.org\n@hume.org, camp.hume.org\n\n")).toEqual([
      "hume.org",
      "camp.hume.org",
    ]);
  });

  it("accepts an empty list, which turns Google sign-in off", () => {
    expect(allowedDomainsSchema.parse("  ")).toEqual([]);
  });

  it("refuses things that aren't domains", () => {
    expect(allowedDomainsSchema.safeParse("pat@hume.org").success).toBe(false);
    expect(allowedDomainsSchema.safeParse("localhost").success).toBe(false);
    expect(allowedDomainsSchema.safeParse("https://hume.org").success).toBe(false);
  });
});
