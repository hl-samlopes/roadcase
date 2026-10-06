import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ChannelEditor } from "@/components/channel-editor";
import { Card, PageHeader, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { connectionLabels } from "@/lib/band/input-list";
import { bandPositionCampuses, bandPositions } from "@/lib/data/band";
import {
  createBandPositionAction,
  moveBandPositionAction,
  removeBandPositionAction,
  restoreBandPositionAction,
  saveBandPositionAction,
} from "../actions";

export const metadata: Metadata = { title: "Band positions" };

const inline = "flex flex-col items-start gap-1";

export default async function CampusBandPositionsPage({
  params,
}: PageProps<"/settings/band-positions/[campusId]">) {
  const actor = await requireUser();
  const { campusId } = await params;
  const campus = (await bandPositionCampuses(actor)).find((c) => c.id === campusId);
  if (!campus) notFound();
  const positions = await bandPositions(actor.organizationId, campus.id, { includeArchived: true });
  const active = positions.filter((p) => !p.archivedAt);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <Link href="/settings/band-positions" className="text-accent hover:underline">
          Back to band positions
        </Link>
      </div>
      <PageHeader title={`Band positions: ${campus.name}`} />
      <p className="text-muted">
        Guests choose these in this order. A band&apos;s input list has each player&apos;s inputs,
        position by position. Changes apply to input lists made from now on; lists staff already
        saved keep their channels.
      </p>

      <Card title="Add a position">
        <ActionForm
          action={createBandPositionAction.bind(null, campus.id)}
          submitLabel="Add position"
          fieldLabels={{ name: "New position" }}
          className="flex flex-wrap items-end gap-3"
        >
          <TextField
            label="New position"
            name="name"
            id="new-position-name"
            maxLength={60}
            required
          />
        </ActionForm>
      </Card>

      <ol className="flex flex-col gap-3" aria-label="Positions">
        {positions.map((position) => {
          const index = active.findIndex((p) => p.id === position.id);
          return (
            <li key={position.id}>
              <section
                aria-labelledby={`position-${position.id}`}
                className="rounded-theme border-border bg-surface border p-4"
              >
                <h2 id={`position-${position.id}`} className="text-base">
                  {position.name}
                  {position.archivedAt ? " (archived)" : ""}
                </h2>
                <p className="text-muted mt-1">
                  {position.inputs
                    .map((input) => `${input.source} (${connectionLabels[input.connection]})`)
                    .join(", ")}
                </p>
                <details className="mt-3">
                  <summary className="text-accent cursor-pointer">Edit {position.name}</summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <ActionForm
                      action={saveBandPositionAction.bind(null, position.id)}
                      submitLabel={`Save ${position.name}`}
                      resetOnSuccess={false}
                      fieldLabels={{ name: "Name" }}
                    >
                      <TextField
                        label="Name"
                        name="name"
                        id={`position-name-${position.id}`}
                        defaultValue={position.name}
                        maxLength={60}
                        required
                      />
                      <fieldset>
                        <legend className="mb-1 font-semibold">Inputs for each player</legend>
                        <ChannelEditor
                          name="inputs"
                          initial={position.inputs}
                          idPrefix={`position-${position.id}-input`}
                          noun="input"
                        />
                      </fieldset>
                    </ActionForm>
                    <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                      {!position.archivedAt && index > 0 ? (
                        <ActionForm
                          action={moveBandPositionAction.bind(null, position.id, "up")}
                          submitLabel={`Move ${position.name} up`}
                          pendingLabel="Moving…"
                          variant="secondary"
                          className={inline}
                        />
                      ) : null}
                      {!position.archivedAt && index < active.length - 1 ? (
                        <ActionForm
                          action={moveBandPositionAction.bind(null, position.id, "down")}
                          submitLabel={`Move ${position.name} down`}
                          pendingLabel="Moving…"
                          variant="secondary"
                          className={inline}
                        />
                      ) : null}
                      <ActionForm
                        action={(position.archivedAt
                          ? restoreBandPositionAction
                          : removeBandPositionAction
                        ).bind(null, position.id)}
                        submitLabel={
                          position.archivedAt
                            ? `Restore ${position.name}`
                            : position.used
                              ? `Archive ${position.name}`
                              : `Delete ${position.name}`
                        }
                        variant={position.archivedAt ? "secondary" : "danger"}
                        className={inline}
                      />
                    </div>
                  </div>
                </details>
              </section>
            </li>
          );
        })}
      </ol>
      {positions.length === 0 ? <p>No positions yet. Add one above.</p> : null}
    </div>
  );
}
