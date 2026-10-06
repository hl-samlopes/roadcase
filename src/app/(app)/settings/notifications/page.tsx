import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { queueLabel } from "@/lib/jobs/queues";
import { sendTestEmailAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

const FAILURES_SHOWN = 50;

function formatTime(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function NotificationsPage() {
  const actor = await requireUser();
  if (!can(actor, "settings:manage", { organizationId: actor.organizationId })) notFound();

  const failures = await db.jobFailure.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "desc" },
    take: FAILURES_SHOWN,
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Notifications" />

      <Card title="Test email">
        <p className="mb-3">
          Sends an email in your organization&apos;s branding to{" "}
          <span className="font-semibold">{actor.email}</span>, through the same background worker
          that will send ticket and check-out emails.
        </p>
        <ActionForm
          action={sendTestEmailAction}
          submitLabel="Send a test email to me"
          pendingLabel="Queuing…"
          variant="secondary"
        />
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="failures-heading">
        <h2 id="failures-heading" className="text-xl">
          Recent job failures
        </h2>
        <p className="text-muted">
          Background jobs retry on their own, waiting longer each time. A job shows here for each
          failed attempt; &ldquo;Gave up&rdquo; means it stopped retrying and needs a look.
        </p>
        {failures.length === 0 ? (
          <p>No failed jobs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rounded-theme border-border bg-surface w-full border-collapse border">
              <thead>
                <tr className="border-border text-muted border-b text-left">
                  <th className="p-2">When</th>
                  <th className="p-2">Job</th>
                  <th className="p-2">Attempt</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((failure) => (
                  <tr key={failure.id} className="border-border border-b last:border-0">
                    <td className="p-2 whitespace-nowrap">{formatTime(failure.createdAt)}</td>
                    <td className="p-2">{queueLabel(failure.queue)}</td>
                    <td className="p-2">{failure.attempt}</td>
                    <td className={`p-2 ${failure.willRetry ? "" : "text-bad font-semibold"}`}>
                      {failure.willRetry ? "Will retry" : "Gave up"}
                    </td>
                    <td className="p-2 break-words">{failure.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
