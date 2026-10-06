import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ChannelEditor } from "@/components/channel-editor";
import { InputListTable } from "@/components/input-list-table";
import { Card, PageHeader } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { bandNeeds } from "@/lib/band/needs";
import { appTimeZone } from "@/lib/checkouts/overdue";
import { staffBand } from "@/lib/data/band";
import { formatDate } from "@/lib/format";
import { rebuildInputListAction, saveInputListAction, shareInputListAction } from "./actions";

export const metadata: Metadata = { title: "Band and input list" };

function formatTime(date: Date) {
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: appTimeZone(),
  });
}

export default async function GroupBandPage({ params }: PageProps<"/guests/[id]/band">) {
  const user = await requireUser();
  const band = await staffBand(user, (await params).id);
  if (!band) notFound();
  const { group, setup, list, generated } = band;
  const canManage = canManageCheckout(user, group) && !group.archivedAt;
  const channels = list?.channels ?? generated;
  const byPosition = new Map<string, (string | null)[]>();
  for (const member of setup?.members ?? []) {
    const name = member.position.name;
    byPosition.set(name, [...(byPosition.get(name) ?? []), member.label]);
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <Link href={`/guests/${group.id}`} className="text-accent hover:underline">
          Back to {group.name}
        </Link>
      </div>
      <PageHeader title={`Band and input list: ${group.name}`} />
      <p>
        {group.campus.name} ({group.campus.code}), {formatDate(group.arrivalDate)} to{" "}
        {formatDate(group.departureDate)}.
      </p>

      <Card title="The group's band">
        {setup ? (
          <>
            <p className="text-muted mb-2">
              Sent {setup.submittedAt ? formatTime(setup.submittedAt) : ""}.
            </p>
            <ul className="mb-2 list-disc pl-5">
              {[...byPosition.entries()].map(([name, labels]) => (
                <li key={name}>
                  {labels.length} × {name}
                  {labels.some(Boolean) ? `: ${labels.filter(Boolean).join("; ")}` : ""}
                </li>
              ))}
            </ul>
            {bandNeeds(setup).length > 0 ? (
              <p className="whitespace-pre-line">
                <span className="text-muted">Also:</span> {bandNeeds(setup).join("; ")}
              </p>
            ) : null}
            {setup.expectedChannels && setup.expectedChannels !== generated.length ? (
              <p className="mt-2 font-semibold">
                The group expects {setup.expectedChannels} channels; their band makes{" "}
                {generated.length}.
              </p>
            ) : null}
          </>
        ) : band.startedNotSent ? (
          <p>The group has started describing its band but hasn&apos;t sent it yet.</p>
        ) : (
          <p>The group hasn&apos;t sent its band yet.</p>
        )}
      </Card>

      <Card title="Input list">
        <div className="flex flex-col gap-3">
          <p>
            {list
              ? `Your adjusted list (${list.channels.length} channels), last saved ${formatTime(list.editedAt)}${list.editedBy ? ` by ${list.editedBy.displayName}` : ""}. `
              : `Made from the group's band (${generated.length} channels). Save it to adjust it; the group's later changes never overwrite your list. `}
            {list?.sharedAt
              ? `The group sees it (shared ${formatTime(list.sharedAt)}).`
              : "The group doesn't see your changes until you share it."}
          </p>
          {list?.setupChanged ? (
            <p role="status" className="border-warn rounded-theme border p-2 font-semibold">
              The group changed its band after this list was made. Check the band above, then edit
              the list or rebuild it from their new band (that replaces your changes).
            </p>
          ) : null}
          {list?.sharedAt ? (
            <p>
              {list.pdfReady ? (
                <a
                  href={`/guests/${group.id}/input-list.pdf`}
                  className="text-accent hover:underline"
                >
                  Download the input list (PDF)
                </a>
              ) : (
                "The PDF is being made. Reload in a moment."
              )}
            </p>
          ) : null}

          {canManage ? (
            <>
              <ActionForm
                action={saveInputListAction.bind(null, group.id)}
                submitLabel="Save input list"
                resetOnSuccess={false}
              >
                <ChannelEditor
                  key={list?.version ?? "generated"}
                  name="channels"
                  initial={channels}
                  idPrefix="channel"
                />
              </ActionForm>
              <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                <ActionForm
                  action={shareInputListAction.bind(null, group.id)}
                  submitLabel={list?.sharedAt ? "Share again" : "Share with the group"}
                  pendingLabel="Sharing…"
                  variant="secondary"
                  className="flex flex-col items-start gap-1"
                />
                {list && setup ? (
                  <ActionForm
                    action={rebuildInputListAction.bind(null, group.id)}
                    submitLabel="Rebuild from the group's band"
                    pendingLabel="Rebuilding…"
                    variant="danger"
                    className="flex flex-col items-start gap-1"
                  />
                ) : null}
              </div>
            </>
          ) : (
            <InputListTable channels={channels} label="Input list" />
          )}
        </div>
      </Card>
    </div>
  );
}
