import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  Card,
  CheckboxField,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { dropdownOptions, fieldTypeLabels } from "@/lib/items/custom-fields";
import {
  createFieldAction,
  moveFieldAction,
  setFieldArchivedAction,
  updateFieldAction,
} from "./actions";

export const metadata: Metadata = { title: "Inventory fields" };

const inline = "flex flex-col items-start gap-1";
const labels = { label: "Name", type: "Type", required: "Required", options: "Options" };

export default async function FieldsPage() {
  const actor = await requireUser();
  if (!can(actor, "fields:manage", { organizationId: actor.organizationId })) notFound();

  const fields = await db.fieldDefinition.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const active = fields.filter((f) => !f.archivedAt);
  const archived = fields.filter((f) => f.archivedAt);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Inventory fields" />
      <p className="text-muted">
        Extra fields shown on every item, after name, category, location, condition, price and
        notes. Fields appear in this order on item forms and in CSV exports.
      </p>

      {active.length === 0 ? <p className="text-muted">No custom fields yet.</p> : null}
      <ol className="flex flex-col gap-3">
        {active.map((field, index) => (
          <li key={field.id}>
            <Card>
              <p className="mb-3">
                <span className="font-semibold">{field.label}</span>
                <span className="text-muted">
                  {" "}
                  · {fieldTypeLabels[field.type]}
                  {field.required && field.type !== "CHECKBOX" ? " · Required" : ""}
                </span>
              </p>
              <ActionForm
                action={updateFieldAction.bind(null, field.id)}
                submitLabel={`Save ${field.label}`}
                variant="secondary"
                fieldLabels={labels}
              >
                <TextField
                  label="Name"
                  name="label"
                  id={`field-label-${field.id}`}
                  defaultValue={field.label}
                  maxLength={60}
                  required
                />
                {field.type === "CHECKBOX" ? null : (
                  <CheckboxField
                    label="Required"
                    name="required"
                    id={`field-required-${field.id}`}
                    defaultChecked={field.required}
                  />
                )}
                {field.type === "DROPDOWN" ? (
                  <TextAreaField
                    label="Options"
                    name="options"
                    id={`field-options-${field.id}`}
                    defaultValue={dropdownOptions(field).join("\n")}
                    hint="One option per line."
                  />
                ) : null}
              </ActionForm>
              <div className="border-border mt-3 flex flex-wrap gap-2 border-t pt-3">
                {index > 0 ? (
                  <ActionForm
                    action={moveFieldAction.bind(null, field.id, "up")}
                    submitLabel={`Move ${field.label} up`}
                    pendingLabel="Moving…"
                    variant="secondary"
                    className={inline}
                  />
                ) : null}
                {index < active.length - 1 ? (
                  <ActionForm
                    action={moveFieldAction.bind(null, field.id, "down")}
                    submitLabel={`Move ${field.label} down`}
                    pendingLabel="Moving…"
                    variant="secondary"
                    className={inline}
                  />
                ) : null}
                <ActionForm
                  action={setFieldArchivedAction.bind(null, field.id, true)}
                  submitLabel={`Delete ${field.label}`}
                  pendingLabel="Deleting…"
                  variant="danger"
                  className={inline}
                />
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card title="Add a field">
        <ActionForm action={createFieldAction} submitLabel="Add field" fieldLabels={labels}>
          <TextField label="Name" name="label" id="new-field-label" maxLength={60} required />
          <SelectField label="Type" name="type" id="new-field-type" defaultValue="TEXT" required>
            {Object.entries(fieldTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <CheckboxField
            label="Required"
            name="required"
            id="new-field-required"
            hint="Checkbox fields are never required."
          />
          <TextAreaField
            label="Options"
            name="options"
            id="new-field-options"
            hint="For dropdown fields only: one option per line. The type can't be changed later."
          />
        </ActionForm>
      </Card>

      {archived.length > 0 ? (
        <Card title="Deleted fields">
          <p className="text-muted mb-3">
            Values entered for these fields are archived on each item. Restoring a field brings them
            back.
          </p>
          <ul className="flex flex-col gap-2">
            {archived.map((field) => (
              <li key={field.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {field.label} <span className="text-muted">({fieldTypeLabels[field.type]})</span>
                </span>
                <ActionForm
                  action={setFieldArchivedAction.bind(null, field.id, false)}
                  submitLabel={`Restore ${field.label}`}
                  variant="secondary"
                  className={inline}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
