"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { initialFormState, type FormState } from "@/lib/forms/state";
import { buttonClass } from "./ui";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * A form bound to a server action, with a pending state and an announced
 * result. Field errors are listed by field label so they never rely on color.
 *
 * Submitting through onSubmit keeps what the user typed when the server
 * reports errors (React would otherwise reset the form); the form is cleared
 * only after a success, unless `resetOnSuccess` is false. Without JavaScript
 * the plain form action still works.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  fieldLabels = {},
  variant = "primary",
  className = "flex flex-col gap-3",
  resetOnSuccess = true,
  id,
  children,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  fieldLabels?: Record<string, string>;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  resetOnSuccess?: boolean;
  /** Lets inputs elsewhere on the page join this form with `form={id}`. */
  id?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = Object.entries(state.fieldErrors ?? {}).filter(
    (entry): entry is [string, string[]] => !!entry[1]?.length,
  );

  useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} id={id} action={formAction} onSubmit={onSubmit} className={className}>
      {children}
      {state.error ? (
        <div role="alert" className="border-bad text-bad rounded-theme border p-2">
          <p className="font-semibold">Error: {state.error}</p>
          {fieldErrors.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {fieldErrors.map(([field, messages]) => (
                <li key={field}>
                  {fieldLabels[field] ?? field}: {messages.join(" ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.success ? (
        <p role="status" className="text-text">
          Done: {state.success}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClass(variant)}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
