"use client";

import { useState } from "react";
import { buttonClass, controlClass } from "@/components/ui";

export interface FieldPosition {
  id: string;
  name: string;
  /** Short list of what each player needs, e.g. "Kick, Snare, Hi-hat". */
  inputs: string[];
}

/**
 * Players by position: add or remove a player, and give each an optional
 * name or note. Each player is one `player:<positionId>` field, so a blank
 * note still counts as a player.
 */
export function BandFields({
  positions,
  initial,
}: {
  positions: FieldPosition[];
  initial: Record<string, string[]>;
}) {
  const [players, setPlayers] = useState<Record<string, string[]>>(initial);
  const channels = positions.reduce(
    (sum, position) => sum + (players[position.id]?.length ?? 0) * position.inputs.length,
    0,
  );

  function update(positionId: string, change: (list: string[]) => string[]) {
    setPlayers((current) => ({ ...current, [positionId]: change(current[positionId] ?? []) }));
  }

  return (
    <div className="flex flex-col gap-3">
      {positions.map((position) => {
        const list = players[position.id] ?? [];
        return (
          <fieldset key={position.id} className="rounded-theme border-border bg-surface border p-3">
            <legend className="px-1 font-semibold">
              {position.name}: {list.length}
            </legend>
            <p className="text-muted mb-2">Each needs: {position.inputs.join(", ")}</p>
            {list.length > 0 ? (
              <ul className="mb-2 flex flex-col gap-2">
                {list.map((label, index) => {
                  const id = `player-${position.id}-${index}`;
                  return (
                    <li key={index} className="flex flex-wrap items-end gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <label htmlFor={id}>
                          {position.name} {index + 1}: name or note (optional)
                        </label>
                        <input
                          id={id}
                          name={`player:${position.id}`}
                          value={label}
                          maxLength={120}
                          autoComplete="off"
                          placeholder="Name, or a note for the audio team"
                          onChange={(event) =>
                            update(position.id, (current) =>
                              current.map((value, i) => (i === index ? event.target.value : value)),
                            )
                          }
                          className={controlClass}
                        />
                      </div>
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        onClick={() =>
                          update(position.id, (current) => current.filter((_, i) => i !== index))
                        }
                      >
                        Remove {position.name} {index + 1}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <button
              type="button"
              className={buttonClass("secondary")}
              disabled={list.length >= 12}
              onClick={() => update(position.id, (current) => [...current, ""])}
            >
              Add {position.name.toLowerCase()}
            </button>
          </fieldset>
        );
      })}
      <p role="status" aria-live="polite" className="font-semibold">
        That&apos;s {channels} channel{channels === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
