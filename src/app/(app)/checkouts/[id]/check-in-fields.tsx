"use client";

import { useRef, useState } from "react";
import { CameraScanButton } from "@/components/camera-scan";
import { buttonClass } from "@/components/ui";

interface Line {
  id: string;
  code: string;
  name: string;
  /** The item's condition when it went out; the default on return. */
  conditionId: string;
}

interface Condition {
  id: string;
  label: string;
  startsRepairTicket: boolean;
}

const control =
  "rounded-theme border-border bg-surface text-text focus-visible:outline-accent min-h-10 border px-2 py-1.5 focus-visible:outline-2";

/**
 * The rows of the check-in form. Scanning an item's code ticks its row (a
 * scanner types the code and presses Enter, which is caught here instead of
 * submitting). Without JavaScript the rows can still be ticked by hand.
 */
export function CheckInFields({ lines, conditions }: { lines: Line[]; conditions: Condition[] }) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  function toggle(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function scanned(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const line = lines.find((l) => l.code === code);
    if (line) {
      toggle(line.id, true);
      setMessage(`Ticked ${line.code} ${line.name}.`);
    } else {
      setMessage(`${code} isn't out on this check-out.`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="check-in-scan" className="font-semibold">
          Scan an item to tick it
        </label>
        <input
          ref={scanRef}
          id="check-in-scan"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${control} max-w-xs`}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            scanned(event.currentTarget.value);
            event.currentTarget.value = "";
          }}
        />
        <div>
          <CameraScanButton onCode={scanned} />
        </div>
        <p className="text-muted" role="status" aria-live="polite">
          {message || `${ticked.size} of ${lines.length} ticked.`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="rounded-theme border-border bg-surface w-full border-collapse border">
          <thead>
            <tr className="border-border text-muted border-b text-left">
              <th className="p-2">Back</th>
              <th className="p-2">Item</th>
              <th className="p-2">Condition</th>
              <th className="p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-border border-b align-top last:border-0">
                <td className="p-2">
                  <input
                    type="checkbox"
                    name="return"
                    value={line.id}
                    id={`return-${line.id}`}
                    checked={ticked.has(line.id)}
                    onChange={(event) => toggle(line.id, event.target.checked)}
                    className="accent-accent h-5 w-5"
                  />
                </td>
                <td className="p-2">
                  <label htmlFor={`return-${line.id}`}>
                    <span className="sr-only">Check in </span>
                    <span className="font-mono">{line.code}</span> {line.name}
                  </label>
                </td>
                <td className="p-2">
                  <label htmlFor={`condition-${line.id}`} className="sr-only">
                    Condition of {line.code} {line.name}
                  </label>
                  <select
                    id={`condition-${line.id}`}
                    name={`condition-${line.id}`}
                    defaultValue={line.conditionId}
                    className={control}
                  >
                    {conditions.map((condition) => (
                      <option key={condition.id} value={condition.id}>
                        {condition.label}
                        {condition.startsRepairTicket ? " (opens a repair ticket)" : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <label htmlFor={`notes-${line.id}`} className="sr-only">
                    Notes on {line.code} {line.name}
                  </label>
                  <input
                    id={`notes-${line.id}`}
                    name={`notes-${line.id}`}
                    maxLength={2000}
                    autoComplete="off"
                    placeholder="Damage, missing parts…"
                    className={`${control} w-full min-w-48`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() => {
            setTicked(new Set(lines.map((l) => l.id)));
            setMessage(`Ticked all ${lines.length}.`);
            scanRef.current?.focus();
          }}
        >
          Tick all
        </button>
      </div>
    </div>
  );
}
