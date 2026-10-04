import { ActionForm } from "@/components/action-form";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui";
import type { FieldDefinition } from "@/generated/prisma/client.ts";
import type { Home } from "@/lib/data/items";
import type { FormState } from "@/lib/forms/state";
import { acceptedUploadTypes } from "@/lib/files";
import { dropdownOptions, inputName } from "@/lib/items/custom-fields";

interface Options {
  homes: Pick<Home, "value" | "label" | "campusLabel">[];
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  conditions: { id: string; label: string; isDefault: boolean }[];
  fields: FieldDefinition[];
}

export interface ItemDefaults {
  name: string;
  home: string;
  category: string;
  subcategory: string;
  condition: string;
  price: string;
  notes: string;
  customFields: Record<string, unknown>;
}

function CustomField({ field, value }: { field: FieldDefinition; value: unknown }) {
  const name = inputName(field.key);
  const required = field.required && field.type !== "CHECKBOX";
  const label = required ? `${field.label} (required)` : field.label;
  const text = value === undefined || value === null ? "" : String(value);
  switch (field.type) {
    case "TEXT":
      return (
        <TextField
          label={label}
          name={name}
          defaultValue={text}
          maxLength={1000}
          required={required}
        />
      );
    case "NUMBER":
      return (
        <TextField
          label={label}
          name={name}
          type="number"
          step="any"
          defaultValue={text}
          required={required}
        />
      );
    case "DATE":
      return (
        <TextField label={label} name={name} type="date" defaultValue={text} required={required} />
      );
    case "DROPDOWN":
      return (
        <SelectField label={label} name={name} defaultValue={text} required={required}>
          <option value="">Not set</option>
          {dropdownOptions(field).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      );
    case "CHECKBOX":
      return <CheckboxField label={label} name={name} defaultChecked={value === true} />;
  }
}

/** Create and edit form for items, including the organization's custom fields. */
export function ItemForm({
  action,
  submitLabel,
  options,
  defaults,
  includePhoto,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  options: Options;
  defaults?: ItemDefaults;
  includePhoto?: boolean;
}) {
  const homesByCampus = Map.groupBy(options.homes, (home) => home.campusLabel);
  const defaultCondition =
    defaults?.condition ?? options.conditions.find((c) => c.isDefault)?.id ?? "";
  const fieldLabels: Record<string, string> = {
    name: "Name",
    home: "Home",
    category: "Category",
    subcategory: "Subcategory",
    condition: "Condition",
    price: "Price",
    notes: "Notes",
    photo: "Photo",
    ...Object.fromEntries(options.fields.map((f) => [inputName(f.key), f.label])),
  };

  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      fieldLabels={fieldLabels}
      resetOnSuccess={false}
    >
      <TextField label="Name" name="name" defaultValue={defaults?.name} maxLength={200} required />
      <SelectField
        label="Home (location and owning department)"
        name="home"
        defaultValue={defaults?.home ?? (options.homes.length === 1 ? options.homes[0].value : "")}
        required
      >
        <option value="" disabled>
          Choose a home
        </option>
        {[...homesByCampus].map(([campus, homes]) => (
          <optgroup key={campus} label={campus}>
            {homes.map((home) => (
              <option key={home.value} value={home.value}>
                {home.label}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Category"
          name="category"
          defaultValue={defaults?.category ?? ""}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {options.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Subcategory"
          name="subcategory"
          defaultValue={defaults?.subcategory ?? ""}
        >
          <option value="">None</option>
          {options.categories
            .filter((category) => category.subcategories.length > 0)
            .map((category) => (
              <optgroup key={category.id} label={category.name}>
                {category.subcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </SelectField>
        <SelectField label="Condition" name="condition" defaultValue={defaultCondition} required>
          {options.conditions.map((condition) => (
            <option key={condition.id} value={condition.id}>
              {condition.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Price"
          name="price"
          inputMode="decimal"
          defaultValue={defaults?.price}
          hint="Replacement value in dollars, for example 1299.00. Optional."
        />
      </div>
      <TextAreaField label="Notes" name="notes" defaultValue={defaults?.notes} maxLength={5000} />
      {options.fields.length > 0 ? (
        <fieldset className="border-border flex flex-col gap-3 border-t pt-3">
          <legend className="font-semibold">More details</legend>
          {options.fields.map((field) => (
            <CustomField key={field.id} field={field} value={defaults?.customFields[field.key]} />
          ))}
        </fieldset>
      ) : null}
      {includePhoto ? (
        <TextField
          label="Photo"
          name="photo"
          type="file"
          accept={acceptedUploadTypes.replace(",application/pdf", "")}
          hint="Optional. JPEG, PNG or WebP, up to 10 MB. You can add more photos and documents later."
        />
      ) : null}
    </ActionForm>
  );
}
