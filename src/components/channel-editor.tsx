"use client";

import { useState } from "react";
import { connectionLabels, connections, type Channel } from "@/lib/band/input-list";
import { buttonClass, controlClass } from "./ui";

/**
 * Edits a list of channels (an input list, or a band position's inputs):
 * change any field, add, remove or move rows. The list is sent as JSON in
 * one hidden field, `name`, and checked again on the server.
 */
export function ChannelEditor({
  name,
  initial,
  idPrefix,
  noun = "channel",
}: {
  name: string;
  initial: Channel[];
  idPrefix: string;
  /** What a row is called in labels: "channel" or "input". */
  noun?: string;
}) {
  const [rows, setRows] = useState<Channel[]>(initial);
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  function set(index: number, change: Partial<Channel>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }
  function move(index: number, by: -1 | 1) {
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length === 0 ? <p className="text-muted">No {noun}s.</p> : null}
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const id = (field: string) => `${idPrefix}-${index}-${field}`;
          const number = index + 1;
          return (
            <li
              key={index}
              className="border-border flex flex-wrap items-end gap-2 border-b pb-2 last:border-0"
            >
              <span className="text-muted w-8 self-center font-semibold" aria-hidden="true">
                {number}
              </span>
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <label htmlFor={id("source")} className="sr-only">
                  {Noun} {number} source
                </label>
                <input
                  id={id("source")}
                  value={row.source}
                  maxLength={80}
                  required
                  placeholder="Source"
                  onChange={(event) => set(index, { source: event.target.value })}
                  className={controlClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={id("connection")} className="sr-only">
                  {Noun} {number} input
                </label>
                <select
                  id={id("connection")}
                  value={row.connection}
                  onChange={(event) =>
                    set(index, { connection: event.target.value as Channel["connection"] })
                  }
                  className={controlClass}
                >
                  {connections.map((connection) => (
                    <option key={connection} value={connection}>
                      {connectionLabels[connection]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-32 flex-col gap-1">
                <label htmlFor={id("stand")} className="sr-only">
                  {Noun} {number} stand
                </label>
                <input
                  id={id("stand")}
                  value={row.stand}
                  maxLength={40}
                  placeholder="Stand"
                  onChange={(event) => set(index, { stand: event.target.value })}
                  className={controlClass}
                />
              </div>
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <label htmlFor={id("notes")} className="sr-only">
                  {Noun} {number} notes
                </label>
                <input
                  id={id("notes")}
                  value={row.notes}
                  maxLength={200}
                  placeholder="Notes"
                  onChange={(event) => set(index, { notes: event.target.value })}
                  className={controlClass}
                />
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={buttonClass("secondary")}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${noun} ${number} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  className={buttonClass("secondary")}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${noun} ${number} down`}
                >
                  Down
                </button>
                <button
                  type="button"
                  className={buttonClass("secondary")}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${noun} ${number}`}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() =>
            setRows((current) => [
              ...current,
              { source: "", connection: "MIC", stand: "", notes: "" },
            ])
          }
        >
          Add {noun}
        </button>
      </div>
    </div>
  );
}
