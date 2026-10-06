"use client";

import { useId, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

/** A table row whose Edit button opens its editor in place, below the row. */
export function EditableRow({
  name,
  columns,
  cells,
  editor,
}: {
  /** Says which row the Edit button is for, for screen readers. */
  name: string;
  /** CSS grid columns, shared with the table's header row. */
  columns: string;
  cells: ReactNode;
  editor: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-border border-b last:border-0">
      <div role="row" className="grid items-center" style={{ gridTemplateColumns: columns }}>
        {cells}
        <div role="cell" className="flex justify-end p-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className="text-accent rounded-theme hover:bg-bg focus-visible:outline-accent min-h-10 px-3 font-semibold focus-visible:outline-2"
          >
            {open ? "Close" : "Edit"}
            <span className="sr-only"> {name}</span>
          </button>
        </div>
      </div>
      {open ? (
        <div id={panelId} className="bg-bg flex flex-col gap-3 p-3">
          {editor}
        </div>
      ) : null}
    </div>
  );
}

/** A card header with its title and an Add button that opens the add form below it. */
export function CardHeaderWithAdd({
  headingId,
  title,
  addLabel,
  extra,
  children,
}: {
  headingId: string;
  title: string;
  addLabel: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
        <h2 id={headingId} className="text-xl">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {extra}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className={buttonClass(open ? "secondary" : "primary")}
          >
            {open ? "Close" : addLabel}
          </button>
        </div>
      </div>
      {open ? (
        <div id={panelId} className="border-accent rounded-theme mx-4 mb-3 border p-3">
          {children}
        </div>
      ) : null}
    </>
  );
}
