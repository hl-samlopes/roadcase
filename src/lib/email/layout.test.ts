import { describe, expect, it } from "vitest";
import { defaultLightTokens } from "@/lib/theme/tokens";
import { renderBrandedEmail, type EmailBrand } from "./layout";
import { testEmailContent } from "./templates";

const brand: EmailBrand = {
  name: "Northwind <Production>",
  logoUrl: null,
  colors: defaultLightTokens,
  headingFont: "Inter",
  bodyFont: "Krub",
  radiusPx: 6,
};

describe("renderBrandedEmail", () => {
  it("escapes every piece of text in the HTML", () => {
    const { html } = renderBrandedEmail(brand, {
      subject: "Hi <b>",
      heading: "<script>alert(1)</script>",
      paragraphs: ['Tom & "Jerry"'],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(html).toContain("Northwind &lt;Production&gt;");
  });

  it("uses the organization's colors, logo and fonts", () => {
    const { html } = renderBrandedEmail(
      {
        ...brand,
        logoUrl: "https://cdn.example.com/branding/logo.png",
        colors: { ...defaultLightTokens, accent: "#7A1FA2" },
      },
      {
        subject: "s",
        heading: "h",
        paragraphs: [],
        action: { label: "Open", url: "https://app.example.com/t/1" },
      },
    );
    expect(html).toContain('src="https://cdn.example.com/branding/logo.png"');
    expect(html).toContain("background:#7A1FA2");
    expect(html).toContain("'Inter', Arial");
    expect(html).toContain('href="https://app.example.com/t/1"');
  });

  it("drops links that aren't http(s)", () => {
    const { html, text } = renderBrandedEmail(brand, {
      subject: "s",
      heading: "h",
      paragraphs: [],
      action: { label: "Open", url: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(text).not.toContain("javascript:");
  });

  it("always has a plain-text version with the same content", () => {
    const content = testEmailContent({ requestedBy: "Pat" }, brand.name);
    const { text } = renderBrandedEmail(brand, {
      ...content,
      action: { label: "Open Roadcase", url: "https://app.example.com/" },
    });
    expect(text).toContain("Email is working");
    expect(text).toContain("Pat sent this test from Settings > Notifications");
    expect(text).toContain("Open Roadcase: https://app.example.com/");
    expect(text).not.toMatch(/<(p|a|h1|table|td|img)\b/);
  });
});
