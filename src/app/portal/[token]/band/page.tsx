import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { InputListTable } from "@/components/input-list-table";
import { CheckboxField, TextAreaField, TextField } from "@/components/ui";
import { portalBand } from "@/lib/data/band";
import { loadPortal, PortalShell, portalMetadata } from "../shell";
import { saveBandAction } from "./actions";
import { BandFields } from "./band-fields";

export async function generateMetadata({
  params,
}: PageProps<"/portal/[token]/band">): Promise<Metadata> {
  const { portal, branding } = await loadPortal((await params).token, "band:edit");
  return portalMetadata(`Band · ${portal.group.name}`, branding);
}

/** The group's band, by position, and the input list made from it. */
export default async function PortalBandPage({ params }: PageProps<"/portal/[token]/band">) {
  const { token } = await params;
  const { portal, branding } = await loadPortal(token, "band:edit");
  const { positions, setup, shared, generated } = await portalBand(portal.principal);
  const sent = setup?.status === "SUBMITTED";
  const initial: Record<string, string[]> = {};
  for (const member of setup?.members ?? []) {
    (initial[member.positionId] ??= []).push(member.label ?? "");
  }

  return (
    <PortalShell branding={branding}>
      <div>
        <Link href={`/portal/${token}`} className="text-accent hover:underline">
          Back to your group page
        </Link>
      </div>
      <div>
        <p className="text-muted">{portal.group.name}</p>
        <h1 className="text-2xl">Your band</h1>
      </div>
      <p>
        Tell the audio team who&apos;s playing. Each player becomes channels on your input list
        below. You can change this any time.
      </p>
      {setup ? (
        <p
          role="status"
          className="rounded-theme border-border bg-surface border p-3 font-semibold"
        >
          {sent ? "Sent to the audio team." : "Saved, not sent yet."}
        </p>
      ) : null}

      <ActionForm
        action={saveBandAction.bind(null, token)}
        submitLabel={sent ? "Send changes" : "Send to the audio team"}
        pendingLabel="Saving…"
        intent="send"
        secondary={sent ? undefined : { label: "Save for later", intent: "save" }}
        resetOnSuccess={false}
        className="flex flex-col gap-4"
      >
        <BandFields
          positions={positions.map((position) => ({
            id: position.id,
            name: position.name,
            inputs: position.inputs.map((input) => input.source),
          }))}
          initial={initial}
        />
        <section className="rounded-theme border-border bg-surface flex flex-col gap-3 border p-3">
          <h2 className="text-base">Anything else</h2>
          <CheckboxField
            label="We use in-ear monitors"
            name="inEarMonitors"
            id="band-iem"
            defaultChecked={setup?.inEarMonitors ?? false}
          />
          <CheckboxField
            label="We play to a click track"
            name="clickTrack"
            id="band-click"
            defaultChecked={setup?.clickTrack ?? false}
          />
          <TextField
            label="Channels you expect (optional)"
            name="expectedChannels"
            id="band-expected"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={setup?.expectedChannels ?? ""}
          />
          <TextAreaField
            label="Notes for the audio team (optional)"
            name="notes"
            id="band-notes"
            rows={3}
            maxLength={2000}
            defaultValue={setup?.notes ?? ""}
          />
        </section>
      </ActionForm>

      <section className="rounded-theme border-border bg-surface border p-4">
        <h2 className="mb-2 text-base">Your input list</h2>
        {shared ? (
          <>
            <p className="mb-2">The audio team prepared this list for your visit.</p>
            {shared.changedSince ? (
              <p className="mb-2 font-semibold">
                You changed your band after they prepared it; they&apos;ll update it.
              </p>
            ) : null}
            <InputListTable channels={shared.channels} label="Input list" />
            <p className="mt-3">
              {shared.pdfReady ? (
                <a href={`/portal/${token}/input-list.pdf`} className="text-accent hover:underline">
                  Download the input list (PDF)
                </a>
              ) : (
                "The PDF is being made. Reload in a moment."
              )}
            </p>
          </>
        ) : (
          <>
            <p className="mb-2">
              A preview from your saved band. The audio team will confirm it before your visit.
            </p>
            <InputListTable channels={generated} label="Input list" />
          </>
        )}
      </section>
    </PortalShell>
  );
}
