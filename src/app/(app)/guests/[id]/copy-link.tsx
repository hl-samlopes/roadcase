"use client";

import { useActionState, useState } from "react";
import { buttonClass, controlClass } from "@/components/ui";
import type { CopyLinkState } from "../actions";

/**
 * "Make a new link to copy": the link comes back from the server once and is
 * shown here, never stored. Leaving the page loses it (a new one can be made).
 */
export function CopyPortalLink({
  action,
}: {
  action: (state: CopyLinkState, formData: FormData) => Promise<CopyLinkState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error ? (
        <p role="alert" className="border-bad text-bad rounded-theme border p-2 font-semibold">
          Error: {state.error}
        </p>
      ) : null}
      {state.link ? (
        <div className="flex flex-col gap-1">
          <p role="status">Done: {state.success}</p>
          <label htmlFor="portal-link" className="font-semibold">
            Portal link
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="portal-link"
              readOnly
              value={state.link}
              onFocus={(event) => event.currentTarget.select()}
              className={`${controlClass} min-w-0 flex-1 font-mono`}
            />
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(state.link!);
                } catch {
                  setCopied("");
                }
              }}
            >
              Copy
            </button>
          </div>
          <p className="text-muted" aria-live="polite">
            {copied === state.link
              ? "Copied."
              : "Select the link and copy it if the button doesn't work."}
          </p>
        </div>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Making link…" : "Make a new link to copy"}
        </button>
      </div>
    </form>
  );
}
