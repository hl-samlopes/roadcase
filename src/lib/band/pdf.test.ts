import { describe, expect, it } from "vitest";
import { defaultLightTokens } from "@/lib/theme/tokens";
import { inputListSubject, renderInputListPdf } from "./pdf";

const channels = [
  { source: "Vocal 1", connection: "MIC" as const, stand: "Tall boom", notes: "Lead" },
  { source: "Bass", connection: "DI" as const, stand: "", notes: "" },
];

describe("renderInputListPdf", () => {
  it("makes a PDF whose subject lists the channels in order", async () => {
    const pdf = await renderInputListPdf({
      organizationName: "Lakeside Camps",
      logo: null,
      colors: defaultLightTokens,
      group: { name: "Lakeside band", campus: "Lakeside (LKS)", dates: "Nov 5 to Nov 7, 2026" },
      needs: ["In-ear monitors"],
      channels,
      version: 3,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("2 channels: 1 Vocal 1; 2 Bass");
  });

  it("names the channel count in the subject", () => {
    expect(inputListSubject([channels[0]])).toBe("1 channel: 1 Vocal 1");
    expect(inputListSubject([])).toBe("0 channels: ");
  });
});
