import { LocalDateField } from "@/components/local-date-field";
import { SelectField, TextAreaField, TextField } from "@/components/ui";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export const detailFieldLabels = {
  campusId: "Campus",
  groupName: "Guest group",
  guestRepName: "Guest representative",
  guestRepEmail: "Representative's email",
  guestRepPhone: "Representative's phone",
  staffRepId: "Staff representative",
  dateOut: "Date out",
  dateDue: "Date back",
  notes: "Notes",
};

/** The guest, staff and date fields shared by the new and edit forms. */
export function CheckoutDetailsFields({
  staff,
  values,
  defaultStaffId = null,
  idPrefix,
}: {
  staff: { id: string; displayName: string }[];
  /** For a new check-out: usually the person creating it. */
  defaultStaffId?: string | null;
  values?: {
    groupName: string;
    guestRepName: string;
    guestRepEmail: string;
    guestRepPhone: string;
    staffRepId: string | null;
    dateOut: Date;
    dateDue: Date;
    notes: string | null;
  };
  idPrefix: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <TextField
        label="Guest group"
        name="groupName"
        id={id("group")}
        defaultValue={values?.groupName}
        maxLength={200}
        required
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Guest representative</legend>
        <TextField
          label="Name"
          name="guestRepName"
          id={id("rep-name")}
          defaultValue={values?.guestRepName}
          maxLength={200}
          autoComplete="off"
          required
        />
        <TextField
          label="Email"
          name="guestRepEmail"
          id={id("rep-email")}
          type="email"
          defaultValue={values?.guestRepEmail}
          autoComplete="off"
          required
        />
        <TextField
          label="Phone"
          name="guestRepPhone"
          id={id("rep-phone")}
          type="tel"
          defaultValue={values?.guestRepPhone}
          autoComplete="off"
          required
        />
      </fieldset>
      <SelectField
        label="Staff representative"
        name="staffRepId"
        id={id("staff")}
        defaultValue={values ? (values.staffRepId ?? "") : (defaultStaffId ?? "")}
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
        {values ? (
          <TextField
            label="Date out"
            name="dateOut"
            id={id("date-out")}
            type="date"
            defaultValue={isoDay(values.dateOut)}
            required
          />
        ) : (
          <LocalDateField label="Date out" name="dateOut" id={id("date-out")} required />
        )}
        <TextField
          label="Date back"
          name="dateDue"
          id={id("date-due")}
          type="date"
          defaultValue={values ? isoDay(values.dateDue) : undefined}
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
