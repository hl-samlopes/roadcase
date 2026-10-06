import { describe, expect, it } from "vitest";
import { buildCatalog, kindId, kindKey, parseQuantity, type CatalogItemInput } from "./catalog";

const mics = { id: "cat-mics", name: "Microphones", description: "Wired and wireless" };
const lights = { id: "cat-lights", name: "Lighting", description: null };

function item(id: string, name: string, extra: Partial<CatalogItemInput> = {}): CatalogItemInput {
  return { id, name, categoryId: mics.id, photoId: null, held: false, ...extra };
}

describe("kinds", () => {
  it("are the same name in the same category, ignoring case and spacing", () => {
    expect(kindKey("  Shure  SM58 ")).toBe("shure sm58");
    const [section] = buildCatalog(
      [mics],
      [item("1", "Shure SM58"), item("2", "shure sm58"), item("3", "Shure  SM58 ")],
    );
    expect(section.kinds).toHaveLength(1);
    expect(section.kinds[0]).toMatchObject({ total: 3, available: 3 });
  });

  it("stay apart across categories, and follow the categories' order", () => {
    const sections = buildCatalog(
      [lights, mics],
      [item("1", "Clamp"), item("2", "Clamp", { categoryId: lights.id })],
    );
    expect(sections.map((s) => s.category.name)).toEqual(["Lighting", "Microphones"]);
  });

  it("leave out categories with nothing in them", () => {
    expect(buildCatalog([mics, lights], [item("1", "SM58")])).toHaveLength(1);
  });

  it("use the first photo any of their items has", () => {
    const [section] = buildCatalog(
      [mics],
      [item("1", "SM58"), item("2", "SM58", { photoId: "photo-2" })],
    );
    expect(section.kinds[0].photoId).toBe("photo-2");
  });
});

describe("availability for the group's dates", () => {
  it("leaves out items on overlapping check-outs", () => {
    const [section] = buildCatalog(
      [mics],
      [item("1", "Beta 58"), item("2", "Beta 58", { held: true })],
    );
    expect(section.kinds[0]).toMatchObject({ total: 2, available: 1 });
  });

  it("leaves out what other groups were approved for, never below zero", () => {
    const items = [item("1", "SM58"), item("2", "SM58"), item("3", "SM58")];
    const reserved = new Map([[kindId(mics.id, "sm58"), 2]]);
    expect(buildCatalog([mics], items, reserved)[0].kinds[0].available).toBe(1);
    reserved.set(kindId(mics.id, "sm58"), 5);
    expect(buildCatalog([mics], items, reserved)[0].kinds[0].available).toBe(0);
  });
});

describe("parseQuantity", () => {
  it("reads blanks as none and whole numbers as given", () => {
    expect(parseQuantity("")).toBe(0);
    expect(parseQuantity(null)).toBe(0);
    expect(parseQuantity(" 3 ")).toBe(3);
  });

  it("refuses anything else", () => {
    for (const bad of ["-1", "1.5", "two", "1e3", "10000"]) expect(parseQuantity(bad)).toBeNull();
  });
});
