import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Small building blocks styled only with theme tokens. Step 3 replaces the
 * look; keep components free of hard-coded colors and fonts.
 */

export function buttonClass(variant: "primary" | "secondary" | "danger" = "primary") {
  const base =
    "rounded-theme px-3 py-1.5 font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  switch (variant) {
    case "primary":
      return `${base} bg-accent text-surface`;
    case "secondary":
      return `${base} border border-border bg-surface text-text`;
    case "danger":
      return `${base} border border-bad bg-surface text-bad`;
  }
}

const controlClass =
  "rounded-theme border border-border bg-surface px-2 py-1.5 text-text focus-visible:outline-2 focus-visible:outline-accent";

export function TextField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  const id = props.id ?? `field-${props.name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input id={id} className={controlClass} {...props} />
      {hint ? <p className="text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: string }) {
  const id = props.id ?? `field-${props.name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <textarea id={id} rows={4} className={controlClass} {...props} />
      {hint ? <p className="text-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; children: ReactNode }) {
  const id = props.id ?? `field-${props.name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <select id={id} className={controlClass} {...props}>
        {children}
      </select>
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  const id = props.id ?? `field-${props.name}`;
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="accent-accent mt-0.5" {...props} />
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {hint ? <p className="text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-theme border-border bg-surface border p-4">
      {title ? <h2 className="mb-3 text-base">{title}</h2> : null}
      {children}
    </section>
  );
}
