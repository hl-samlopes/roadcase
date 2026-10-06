import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField, TextField } from "@/components/ui";
import { can, isAnyAdmin, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { queueLabel } from "@/lib/jobs/queues";
import { manageableWebhooks, slackScopes } from "@/lib/notifications/slack-scopes";
import {
  addSlackWebhookAction,
  removeSlackWebhookAction,
  sendSlackTestAction,
  sendTestEmailAction,
} from "./actions";

export const metadata: Metadata = { title: "Notifications" };

const FAILURES_SHOWN = 50;

function formatTime(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Organization admins see everything here; campus and department admins see
 * only the Slack webhooks for their own campus or department.
 */
export default async function NotificationsPage() {
  const actor = await requireUser();
  if (!isAnyAdmin(actor)) notFound();
  const organizationAdmin = can(actor, "settings:manage", { organizationId: actor.organizationId });

  const scopes = await slackScopes(actor);
  const [webhooks, failures] = await Promise.all([
    manageableWebhooks(actor, scopes),
    organizationAdmin
      ? db.jobFailure.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: { createdAt: "desc" },
          take: FAILURES_SHOWN,
        })
      : [],
  ]);
  const canAddWebhook = scopes.campuses.length > 0 || scopes.departments.length > 0;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Notifications" />
      <p className="text-muted">
        People get ticket emails for tickets they can see, and choose which ones in Preferences.
        Slack alerts post when a ticket opens, is assigned or is completed; comments stay in email.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="slack-heading">
        <h2 id="slack-heading" className="text-xl">
          Slack
        </h2>
        {webhooks.length === 0 ? (
          <p>No Slack channels get ticket alerts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rounded-theme border-border bg-surface w-full border-collapse border">
              <thead>
                <tr className="border-border text-muted border-b text-left">
                  <th className="p-2">Channel</th>
                  <th className="p-2">Alerts for</th>
                  <th className="p-2">Webhook</th>
                  <th className="p-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id} className="border-border border-b align-top last:border-0">
                    <td className="p-2 font-semibold">{webhook.label}</td>
                    <td className="p-2">
                      {webhook.campus
                        ? `${webhook.campus.name} campus (${webhook.campus.code})`
                        : `${webhook.department?.name} department`}
                    </td>
                    <td className="p-2">
                      <span className="font-mono">{webhook.urlHint}</span>
                      <span className="text-muted block">
                        Added {formatTime(webhook.createdAt)}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <ActionForm
                          action={sendSlackTestAction.bind(null, webhook.id)}
                          submitLabel={`Send test message to ${webhook.label}`}
                          pendingLabel="Queuing…"
                          variant="secondary"
                          className="flex flex-col items-start gap-1"
                        />
                        <ActionForm
                          action={removeSlackWebhookAction.bind(null, webhook.id)}
                          submitLabel={`Remove ${webhook.label}`}
                          pendingLabel="Removing…"
                          variant="danger"
                          className="flex flex-col items-start gap-1"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canAddWebhook ? (
          <Card title="Add a Slack channel">
            <p className="text-muted mb-3">
              In Slack, create an incoming webhook for the channel (Apps &gt; Incoming Webhooks) and
              paste its URL here. It&apos;s stored encrypted and never shown again in full. Each
              campus and each department can have one channel.
            </p>
            <ActionForm
              action={addSlackWebhookAction}
              submitLabel="Add Slack channel"
              fieldLabels={{ scope: "Alerts for", label: "Channel name", url: "Webhook URL" }}
              className="flex flex-col gap-3"
            >
              <SelectField label="Alerts for" name="scope" id="slack-scope" defaultValue="">
                <option value="" disabled>
                  Choose a campus or department
                </option>
                {scopes.campuses.length > 0 ? (
                  <optgroup label="Campuses">
                    {scopes.campuses.map((c) => (
                      <option key={c.id} value={`campus:${c.id}`}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {scopes.departments.length > 0 ? (
                  <optgroup label="Departments">
                    {scopes.departments.map((d) => (
                      <option key={d.id} value={`department:${d.id}`}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectField>
              <TextField
                label="Channel name"
                name="label"
                id="slack-label"
                placeholder="#hne-production"
                maxLength={80}
                required
              />
              <TextField
                label="Webhook URL"
                name="url"
                id="slack-url"
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://hooks.slack.com/services/…"
                required
              />
            </ActionForm>
          </Card>
        ) : (
          <p className="text-muted">Slack channels are set by campus and department admins.</p>
        )}
      </section>

      {organizationAdmin ? (
        <>
          <Card title="Test email">
            <p className="mb-3">
              Sends an email in your organization&apos;s branding to{" "}
              <span className="font-semibold">{actor.email}</span>, through the same background
              worker that sends ticket and check-out emails.
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
              Background jobs retry on their own, waiting longer each time. A job shows here for
              each failed attempt; &ldquo;Gave up&rdquo; means it stopped retrying and needs a look.
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
        </>
      ) : null}
    </div>
  );
}
