import { describe, expect, it } from "vitest";
import {
  channelListSchema,
  defaultBandPositions,
  generateInputList,
  readChannels,
  type PositionForList,
} from "./input-list";

const positions: PositionForList[] = defaultBandPositions.map((p) => ({ ...p, id: p.name }));
const player = (positionId: string, label: string | null = null) => ({ positionId, label });

describe("generateInputList", () => {
  it("gives a band of 2 vocals, guitar, bass, drums and keys 13 channels", () => {
    const channels = generateInputList(positions, [
      player("Vocal", "Lead vocal, wireless if possible"),
      player("Vocal"),
      player("Electric guitar"),
      player("Bass"),
      player("Drums"),
      player("Keys"),
    ]);
    expect(channels).toHaveLength(13);
    expect(channels.map((c) => c.source)).toEqual([
      "Vocal 1",
      "Vocal 2",
      "Electric guitar amp",
      "Bass",
      "Keys left",
      "Keys right",
      "Kick",
      "Snare",
      "Hi-hat",
      "Tom 1",
      "Tom 2",
      "Overhead left",
      "Overhead right",
    ]);
    expect(channels[0]).toMatchObject({
      connection: "MIC",
      stand: "Tall boom",
      notes: "Lead vocal, wireless if possible",
    });
  });

  it("follows the campus's order of positions, not the order players were added", () => {
    const channels = generateInputList(positions, [player("Bass"), player("Vocal")]);
    expect(channels.map((c) => c.source)).toEqual(["Vocal", "Bass"]);
  });

  it("numbers multi-input positions by player", () => {
    const channels = generateInputList(positions, [player("Keys"), player("Keys")]);
    expect(channels.map((c) => c.source)).toEqual([
      "Keys left (Keys 1)",
      "Keys right (Keys 1)",
      "Keys left (Keys 2)",
      "Keys right (Keys 2)",
    ]);
  });

  it("is empty for a band with nobody in it", () => {
    expect(generateInputList(positions, [])).toEqual([]);
  });
});

describe("default band positions", () => {
  it("have unique names and at least one input each", () => {
    const names = defaultBandPositions.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const position of defaultBandPositions) expect(position.inputs.length).toBeGreaterThan(0);
  });
});

describe("stored channel lists", () => {
  it("accept the defaults", () => {
    for (const position of defaultBandPositions) {
      expect(channelListSchema.safeParse(position.inputs).success).toBe(true);
    }
  });

  it("refuse blank sources and unknown connections, and read bad data as empty", () => {
    expect(channelListSchema.safeParse([{ source: " ", connection: "MIC" }]).success).toBe(false);
    expect(channelListSchema.safeParse([{ source: "Vox", connection: "XLR" }]).success).toBe(false);
    expect(readChannels("not a list")).toEqual([]);
    expect(readChannels([{ source: "Vox", connection: "MIC" }])).toEqual([
      { source: "Vox", connection: "MIC", stand: "", notes: "" },
    ]);
  });
});
