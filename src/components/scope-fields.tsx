import type { ScopeOption } from "@/lib/admin/scopes";
import { levelLabels } from "@/lib/labels";
import { CheckboxField, SelectField } from "./ui";

/** Level, scope and ticket-submission inputs for creating a grant. */
export function GrantFields({ scopeOptions }: { scopeOptions: ScopeOption[] }) {
  const groups = Map.groupBy(scopeOptions, (option) => option.group);
  return (
    <>
      <SelectField label="Access level" name="level" defaultValue="VIEWER" required>
        {Object.entries(levelLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <SelectField label="Applies to" name="scope" defaultValue="" required>
        <option value="" disabled>
          Choose a scope
        </option>
        {[...groups].map(([group, options]) => (
          <optgroup key={group} label={group}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
      <CheckboxField
        label="Can submit service tickets"
        name="canSubmitTickets"
        hint="Lets a viewer submit tickets. Commenters and above always can."
      />
    </>
  );
}

export const grantFieldLabels = {
  level: "Access level",
  scope: "Applies to",
  canSubmitTickets: "Can submit service tickets",
};
