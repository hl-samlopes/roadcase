import { SelectField, TextAreaField, TextField } from "@/components/ui";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export const groupFieldLabels = {
  campusId: "Campus",
  name: "Group name",
  repName: "Representative's name",
  repEmail: "Representative's email",
  repPhone: "Representative's phone",
  staffContactId: "Staff contact",
  arrivalDate: "Arrives",
  departureDate: "Leaves",
  notes: "Notes",
};

/** The fields shared by the new and edit guest group forms. */
export function GuestGroupFields({
  staff,
  values,
  defaultStaffId = null,
  idPrefix,
}: {
  staff: { id: string; displayName: string }[];
  defaultStaffId?: string | null;
  values?: {
    name: string;
    repName: string;
    repEmail: string;
    repPhone: string;
    staffContactId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    notes: string | null;
  };
  idPrefix: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <TextField
        label="Group name"
        name="name"
        id={id("name")}
        defaultValue={values?.name}
        maxLength={200}
        required
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Group representative</legend>
        <TextField
          label="Name"
          name="repName"
          id={id("rep-name")}
          defaultValue={values?.repName}
          maxLength={200}
          autoComplete="off"
          required
        />
        <TextField
          label="Email"
          name="repEmail"
          id={id("rep-email")}
          type="email"
          defaultValue={values?.repEmail}
          autoComplete="off"
          required
        />
        <TextField
          label="Phone"
          name="repPhone"
          id={id("rep-phone")}
          type="tel"
          defaultValue={values?.repPhone}
          autoComplete="off"
          required
        />
      </fieldset>
      <SelectField
        label="Staff contact"
        name="staffContactId"
        id={id("staff")}
        defaultValue={values ? (values.staffContactId ?? "") : (defaultStaffId ?? "")}
        required
      >
        <option value="" disabled>
          Choose a person
        </option>
        {staff.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-wrap gap-3">
        <TextField
          label="Arrives"
          name="arrivalDate"
          id={id("arrival")}
          type="date"
          defaultValue={values ? isoDay(values.arrivalDate) : undefined}
          required
        />
        <TextField
          label="Leaves"
          name="departureDate"
          id={id("departure")}
          type="date"
          defaultValue={values ? isoDay(values.departureDate) : undefined}
          required
        />
      </div>
      <TextAreaField
        label="Notes"
        name="notes"
        id={id("notes")}
        defaultValue={values?.notes ?? ""}
        maxLength={5000}
      />
    </>
  );
}
