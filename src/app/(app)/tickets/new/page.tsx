import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Card, PageHeader, TextAreaField, TextField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { findItemByCode, getItem } from "@/lib/data/items";
import { findOpenTicket } from "@/lib/data/tickets";
import { db } from "@/lib/db";
import { acceptedUploadTypes } from "@/lib/files";
import { submitTicketAction } from "../actions";

export const metadata: Metadata = { title: "Report a problem" };

export default async function NewTicketPage({ searchParams }: PageProps<"/tickets/new">) {
  const user = await requireUser();
  const { item: itemParam, code: codeParam } = await searchParams;
  const code = typeof codeParam === "string" ? codeParam.trim() : "";

  if (code) {
    const found = await findItemByCode(user, code);
    if (found) redirect(`/tickets/new?item=${found.id}`);
  }
  const item = typeof itemParam === "string" ? await getItem(user, itemParam) : null;
  const allowed = item ? can(user, "ticket:submit", item) : false;
  const openTicket = item && allowed ? await findOpenTicket(db, item.id) : null;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <Link
          href={item ? `/items/${item.id}` : "/tickets"}
          className="text-accent hover:underline"
        >
          {item ? `Back to ${item.code}` : "Back to tickets"}
        </Link>
      </div>
      <PageHeader title="Report a problem" />

      {item && allowed ? (
        <Card>
          <p className="mb-3">
            For <span className="font-mono">{item.code}</span> {item.name} ({item.location.name},{" "}
            {item.campus.code})
          </p>
          {openTicket ? (
            <p className="rounded-theme border-border mb-3 border p-2">
              This item already has an open ticket,{" "}
              <Link href={`/tickets/${openTicket.id}`} className="text-accent hover:underline">
                #{openTicket.number}
              </Link>
              . You can add a comment there instead.
            </p>
          ) : null}
          <ActionForm
            action={submitTicketAction.bind(null, item.id)}
            submitLabel="Submit ticket"
            pendingLabel="Submitting…"
            resetOnSuccess={false}
            fieldLabels={{ title: "Problem", description: "Details", file: "Photo or document" }}
          >
            <TextField
              label="Problem"
              name="title"
              maxLength={200}
              hint="A few words, for example: Left channel crackles."
              required
            />
            <TextAreaField
              label="Details"
              name="description"
              maxLength={5000}
              hint="Optional. What happened, when, and anything already tried."
            />
            <TextField
              label="Photo or document"
              name="file"
              type="file"
              accept={acceptedUploadTypes}
              hint="Optional. JPEG, PNG or WebP up to 10 MB, or a PDF up to 20 MB."
            />
          </ActionForm>
        </Card>
      ) : (
        <Card>
          {item && !allowed ? (
            <p role="alert" className="mb-3">
              You can see this item but can&apos;t submit tickets for it.
            </p>
          ) : null}
          {code ? (
            <p role="alert" className="mb-3">
              No item you can report has the code{" "}
              <span className="font-mono">{code.toUpperCase()}</span>.
            </p>
          ) : null}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <TextField
              label="Scan or enter the item's code"
              name="code"
              id="ticket-item-code"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="HNE-000123"
            />
            <button type="submit" className={buttonClass("secondary")}>
              Continue
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
