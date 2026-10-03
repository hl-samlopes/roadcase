import { describe, expect, it } from "vitest";
import { formatCustomFieldValue, parseCustomFieldInput, type FieldDef } from "./custom-fields";

const field = (partial: Partial<FieldDef> & Pick<FieldDef, "key" | "type">): FieldDef => ({
  label: partial.key,
  required: false,
  options: null,
  ...partial,
});

const serial = field({ key: "serial", type: "TEXT", required: true });
const watts = field({ key: "watts", type: "NUMBER" });
const bought = field({ key: "bought", type: "DATE" });
const power = field({ key: "power", type: "DROPDOWN", options: ["AC", "Battery"] });
const rackable = field({ key: "rackable", type: "CHECKBOX", required: true });
const all = [serial, watts, bought, power, rackable];

describe("parseCustomFieldInput", () => {
  it("parses each type", () => {
    const result = parseCustomFieldInput(
      all,
      {
        cf_serial: " SN-1 ",
        cf_watts: "450.5",
        cf_bought: "2024-02-29",
        cf_power: "AC",
        cf_rackable: "on",
      },
      {},
    );
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({
      serial: "SN-1",
      watts: 450.5,
      bought: "2024-02-29",
      power: "AC",
      rackable: true,
    });
  });

  it("reports invalid values per field", () => {
    const result = parseCustomFieldInput(
      all,
      { cf_serial: "", cf_watts: "lots", cf_bought: "2023-02-29", cf_power: "Solar" },
      {},
    );
    expect(result.errors).toEqual({
      cf_serial: ["Required."],
      cf_watts: ["Enter a number."],
      cf_bought: ["Enter a date as YYYY-MM-DD."],
      cf_power: ["Choose one of the options."],
    });
  });

  it("stores unchecked checkboxes as false, even when marked required", () => {
    const result = parseCustomFieldInput([rackable], {}, {});
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ rackable: false });
  });

  it("keeps values of archived or unknown fields and removes cleared optional ones", () => {
    const result = parseCustomFieldInput(
      [watts],
      { cf_watts: "" },
      { watts: 100, archived_field: "kept" },
    );
    expect(result.values).toEqual({ archived_field: "kept" });
  });

  it("rejects overly long text", () => {
    const result = parseCustomFieldInput([serial], { cf_serial: "x".repeat(1001) }, {});
    expect(result.errors.cf_serial).toBeDefined();
  });
});

describe("formatCustomFieldValue", () => {
  it("formats values for display", () => {
    expect(formatCustomFieldValue(rackable, true)).toBe("Yes");
    expect(formatCustomFieldValue(rackable, undefined)).toBe("No");
    expect(formatCustomFieldValue(watts, 450)).toBe("450");
    expect(formatCustomFieldValue(serial, undefined)).toBe("");
  });
});
