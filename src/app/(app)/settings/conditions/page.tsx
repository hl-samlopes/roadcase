import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, CheckboxField, PageHeader, TextField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  createConditionAction,
  moveConditionAction,
  removeConditionAction,
  restoreConditionAction,
  setDefaultConditionAction,
  updateConditionAction,
} from "./actions";

export const metadata: Metadata = { title: "Item conditions" };

const inline = "flex flex-col items-start gap-1";

export default async function ConditionsPage() {
  const actor = await requireUser();
  if (!can(actor, "conditions:manage", { organizationId: actor.organizationId })) notFound();

  const conditions = await db.itemCondition.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ position: "asc" }, { label: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  const active = conditions.filter((c) => !c.archivedAt);
  const archived = conditions.filter((c) => c.archivedAt);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Item conditions" />
      <p className="text-muted">
        The conditions your organization uses for equipment, in the order they appear in lists. New
        items start with the default condition.
      </p>

      <ol className="flex flex-col gap-3">
        {active.map((condition, index) => (
          <li key={condition.id}>
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-base">{condition.label}</h2>
                {condition.isDefault ? (
                  <span className="rounded-theme border-border border px-1.5">Default</span>
                ) : null}
                {condition.startsRepairTicket ? (
                  <span className="rounded-theme border-border border px-1.5">
                    Starts a repair ticket
                  </span>
                ) : null}
                <span className="text-muted">
                  {condition._count.items} item{condition._count.items === 1 ? "" : "s"}
                </span>
              </div>
              <ActionForm
                action={updateConditionAction.bind(null, condition.id)}
                submitLabel={`Save ${condition.label}`}
                fieldLabels={{ label: "Name" }}
                variant="secondary"
              >
                <TextField
                  label="Name"
                  name="label"
                  id={`label-${condition.id}`}
                  defaultValue={condition.label}
                  maxLength={60}
                  required
                />
                <CheckboxField
                  label="Setting an item to this condition starts a repair ticket"
                  name="startsRepairTicket"
                  id={`repair-${condition.id}`}
                  defaultChecked={condition.startsRepairTicket}
                />
              </ActionForm>
              <div className="border-border mt-3 flex flex-wrap gap-2 border-t pt-3">
                {index > 0 ? (
                  <ActionForm
                    action={moveConditionAction.bind(null, condition.id, "up")}
                    submitLabel={`Move ${condition.label} up`}
                    pendingLabel="Moving…"
                    variant="secondary"
                    className={inline}
                  />
                ) : null}
                {index < active.length - 1 ? (
                  <ActionForm
                    action={moveConditionAction.bind(null, condition.id, "down")}
                    submitLabel={`Move ${condition.label} down`}
                    pendingLabel="Moving…"
                    variant="secondary"
                    className={inline}
                  />
                ) : null}
                {condition.isDefault ? null : (
                  <>
                    <ActionForm
                      action={setDefaultConditionAction.bind(null, condition.id)}
                      submitLabel={`Make ${condition.label} the default`}
                      variant="secondary"
                      className={inline}
                    />
                    <ActionForm
                      action={removeConditionAction.bind(null, condition.id)}
                      submitLabel={
                        condition._count.items > 0
                          ? `Archive ${condition.label}`
                          : `Delete ${condition.label}`
                      }
                      pendingLabel="Removing…"
                      variant="danger"
                      className={inline}
                    />
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card title="Add a condition">
        <ActionForm
          action={createConditionAction}
          submitLabel="Add condition"
          fieldLabels={{ label: "Name" }}
        >
          <TextField label="Name" name="label" id="new-condition-label" maxLength={60} required />
          <CheckboxField
            label="Setting an item to this condition starts a repair ticket"
            name="startsRepairTicket"
            id="new-condition-repair"
          />
        </ActionForm>
      </Card>

      {archived.length > 0 ? (
        <Card title="Archived">
          <p className="text-muted mb-3">
            Archived conditions can&apos;t be chosen for items. Items that already have one keep it
            until edited.
          </p>
          <ul className="flex flex-col gap-2">
            {archived.map((condition) => (
              <li key={condition.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {condition.label}{" "}
                  <span className="text-muted">
                    ({condition._count.items} item{condition._count.items === 1 ? "" : "s"})
                  </span>
                </span>
                <ActionForm
                  action={restoreConditionAction.bind(null, condition.id)}
                  submitLabel={`Restore ${condition.label}`}
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
