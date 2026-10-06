import { z } from "zod";

/**
 * Band positions and input lists, kept pure (no app imports) so the seed,
 * the worker and tests can use them. An input is one channel a player
 * needs; a position lists the inputs for each player in it.
 */

export const connections = ["MIC", "DI", "LINE"] as const;
export type Connection = (typeof connections)[number];

export const connectionLabels: Record<Connection, string> = {
  MIC: "Mic",
  DI: "DI",
  LINE: "Line",
};

export const MAX_CHANNELS = 96;
export const MAX_PLAYERS_PER_POSITION = 12;

export const channelSchema = z.object({
  source: z.string().trim().min(1, "Every channel needs a source.").max(80),
  connection: z.enum(connections),
  stand: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(200).default(""),
});
export type Channel = z.infer<typeof channelSchema>;

export const channelListSchema = z
  .array(channelSchema)
  .max(MAX_CHANNELS, `Keep it to ${MAX_CHANNELS} channels or fewer.`);

/** A stored list (position inputs or staff's channels), or an empty list if it's unreadable. */
export function readChannels(value: unknown): Channel[] {
  const parsed = channelListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const input = (source: string, connection: Connection, stand = "", notes = ""): Channel => ({
  source,
  connection,
  stand,
  notes,
});

/** What each campus starts with; campus admins change them in Settings > Band positions. */
export const defaultBandPositions: { name: string; inputs: Channel[] }[] = [
  { name: "Vocal", inputs: [input("Vocal", "MIC", "Tall boom")] },
  { name: "Acoustic guitar", inputs: [input("Acoustic guitar", "DI")] },
  { name: "Electric guitar", inputs: [input("Electric guitar amp", "MIC", "Short boom")] },
  { name: "Bass", inputs: [input("Bass", "DI")] },
  { name: "Keys", inputs: [input("Keys left", "DI"), input("Keys right", "DI")] },
  {
    name: "Drums",
    inputs: [
      input("Kick", "MIC", "Short boom"),
      input("Snare", "MIC", "Short boom"),
      input("Hi-hat", "MIC", "Short boom"),
      input("Tom 1", "MIC", "Clip"),
      input("Tom 2", "MIC", "Clip"),
      input("Overhead left", "MIC", "Tall boom"),
      input("Overhead right", "MIC", "Tall boom"),
    ],
  },
  { name: "Playback", inputs: [input("Playback left", "DI"), input("Playback right", "DI")] },
];

export interface PositionForList {
  id: string;
  name: string;
  inputs: Channel[];
}

/**
 * The input list for a band: positions in the campus's order, each player in
 * turn, each of the position's inputs. With more than one player in a
 * position, sources are numbered ("Vocal 1", "Vocal 2", or "Kick (Drums 2)"
 * for multi-input positions). A player's label becomes the channel's note.
 */
export function generateInputList(
  positions: PositionForList[],
  members: { positionId: string; label: string | null }[],
): Channel[] {
  const channels: Channel[] = [];
  for (const position of positions) {
    const players = members.filter((member) => member.positionId === position.id);
    players.forEach((player, index) => {
      const number = players.length > 1 ? index + 1 : null;
      for (const spec of position.inputs) {
        const source =
          number === null
            ? spec.source
            : position.inputs.length === 1
              ? `${spec.source} ${number}`
              : `${spec.source} (${position.name} ${number})`;
        const notes = [player.label?.trim(), spec.notes].filter(Boolean).join("; ");
        channels.push({ ...spec, source, notes });
      }
    });
  }
  return channels;
}
