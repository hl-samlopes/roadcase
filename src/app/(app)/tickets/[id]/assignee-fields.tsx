"use client";

import { useState, useSyncExternalStore } from "react";
import { SelectField, TextField } from "@/components/ui";

type AssigneeType = "USER" | "DEPARTMENT" | "VENDOR";

const choices: [AssigneeType, string][] = [
  ["USER", "A person on staff"],
  ["DEPARTMENT", "Another department"],
  ["VENDOR", "An outside company"],
];

/**
 * The assign form's fields: only the ones for the chosen kind of assignee.
 * Until scripts load (or without them) every field shows, so the form works
 * either way; the server reads only the fields for the chosen kind.
 */
export function AssigneeFields({
  current,
  people,
  departments,
}: {
  current: {
    type: AssigneeType | null;
    userId: string | null;
    departmentId: string | null;
    vendorName: string | null;
    vendorContact: string | null;
  };
  people: { id: string; displayName: string }[];
  departments: { id: string; name: string }[];
}) {
  const [type, setType] = useState<AssigneeType | null>(current.type);
  // False while rendered on the server (and before hydration), true in the browser.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const shows = (kind: AssigneeType) => !ready || type === kind;

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Who will do the work</legend>
        {choices.map(([value, label]) => (
          <label key={value} className="flex min-h-8 items-center gap-2">
            <input
              type="radio"
              name="assigneeType"
              value={value}
              defaultChecked={current.type === value}
              onChange={() => setType(value)}
              className="accent-accent"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {shows("USER") ? (
        <SelectField label="Person" name="assigneeUserId" defaultValue={current.userId ?? ""}>
          <option value="">Choose a person</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </SelectField>
      ) : null}
      {shows("DEPARTMENT") ? (
        <SelectField
          label="Department"
          name="assigneeDepartmentId"
          defaultValue={current.departmentId ?? ""}
        >
          <option value="">Choose a department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      {shows("VENDOR") ? (
        <>
          <TextField
            label="Company"
            name="vendorName"
            defaultValue={current.vendorName ?? ""}
            maxLength={200}
          />
          <TextField
            label="Contact"
            name="vendorContact"
            defaultValue={current.vendorContact ?? ""}
            maxLength={500}
            hint="Name, phone or email for the outside company."
          />
        </>
      ) : null}
    </>
  );
}
