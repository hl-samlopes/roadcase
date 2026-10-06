"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { buttonClass, controlClass } from "@/components/ui";
import { initialFormState, type FormState } from "@/lib/forms/state";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface FormKind {
  field: string;
  name: string;
  available: number;
  photoUrl: string | null;
  quantity: number;
}

export interface FormSection {
  id: string;
  name: string;
  description: string | null;
  kinds: FormKind[];
}

/**
 * The catalog as one form: a quantity per kind and a note. "Save for later"
 * and "Send request" are two buttons on the same form; without JavaScript
 * the browser sends whichever was pressed.
 */
export function RequestForm({
  action,
  sections,
  note,
  sent,
}: {
  action: Action;
  sections: FormSection[];
  note: string;
  /** Already sent: changes go straight to staff, so there's one button. */
  sent: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const errors = state.fieldErrors ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const native = event.nativeEvent as SubmitEvent;
    const formData = new FormData(event.currentTarget, native.submitter);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`category-${section.id}`}
          className="rounded-theme border-border bg-surface border p-4"
        >
          <h2 id={`category-${section.id}`} className="text-base">
            {section.name}
          </h2>
          {section.description ? (
            <p className="text-muted mt-1 whitespace-pre-line">{section.description}</p>
          ) : null}
          <ul className="mt-3 flex flex-col">
            {section.kinds.map((kind) => {
              const id = `qty-${kind.field}`;
              const error = errors[kind.name]?.join(" ");
              return (
                <li
                  key={kind.field}
                  className="border-border flex flex-wrap items-center gap-3 border-t py-2 first:border-t-0"
                >
                  {kind.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route
                    <img
                      src={kind.photoUrl}
                      alt=""
                      className="rounded-theme border-border h-14 w-14 border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="rounded-theme border-border h-14 w-14 border border-dashed"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="font-semibold">
                      {kind.name}
                    </label>
                    <p className="text-muted" id={`${id}-hint`}>
                      {kind.available === 0
                        ? "None free for your dates"
                        : `${kind.available} free for your dates`}
                    </p>
                    {error ? (
                      <p id={`${id}-error`} className="text-bad font-semibold">
                        {error}
                      </p>
                    ) : null}
                  </div>
                  <input
                    id={id}
                    name={kind.field}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    defaultValue={kind.quantity || ""}
                    placeholder="0"
                    aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                    aria-invalid={error ? true : undefined}
                    className={`${controlClass} w-24`}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="request-note" className="font-semibold">
          Note to staff (optional)
        </label>
        <textarea
          id="request-note"
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={note}
          placeholder="Anything we should know, such as when you'll need it."
          className={controlClass}
        />
        {errors.note ? <p className="text-bad font-semibold">{errors.note.join(" ")}</p> : null}
      </div>

      {state.error ? (
        <div role="alert" className="border-bad text-bad rounded-theme border p-2">
          <p className="font-semibold">Error: {state.error}</p>
          {Object.keys(errors).length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(errors).map(([name, messages]) => (
                <li key={name}>
                  {name === "note" ? "Note" : name}: {messages?.join(" ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.success ? <p role="status">Done: {state.success}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="send"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? "Saving…" : sent ? "Send changes" : "Send request"}
        </button>
        {sent ? null : (
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className={buttonClass("secondary")}
          >
            Save for later
          </button>
        )}
      </div>
    </form>
  );
}
