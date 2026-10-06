import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { contractCampuses, latestTemplateVersion, templateHistory } from "@/lib/data/contracts";
import { saveTemplateAction, startFromPlaceholderAction } from "../actions";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Edit contract template" };

function formatTime(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function EditContractTemplatePage({
  params,
}: PageProps<"/settings/contracts/[campusId]">) {
  const actor = await requireUser();
  const { campusId } = await params;
  const campus = (await contractCampuses(actor)).find((c) => c.id === campusId);
  if (!campus) notFound();

  const [latest, history] = await Promise.all([
    latestTemplateVersion(actor.organizationId, campus.id),
    templateHistory(actor.organizationId, campus.id),
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href="/settings/contracts" className="text-accent hover:underline">
          Back to contract templates
        </Link>
      </div>
      <PageHeader title={`Contract template: ${campus.name}`}>
        {latest ? (
          <Link
            href={`/settings/contracts/${campus.id}/preview`}
            className={buttonClass("secondary")}
          >
            Preview
          </Link>
        ) : null}
      </PageHeader>

      {latest ? (
        <>
          <p className="text-muted">
            Editing version {latest.version}. Saving creates version {latest.version + 1}; contracts
            signed with earlier versions don&apos;t change.
          </p>
          <ActionForm
            action={saveTemplateAction.bind(null, campus.id)}
            submitLabel="Save as a new version"
            pendingLabel="Saving…"
            resetOnSuccess={false}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="baseVersion" value={latest.version} />
            {/* Keyed on the version so the editor reloads what was just saved. */}
            <TemplateEditor key={latest.version} initial={latest.doc} />
          </ActionForm>

          <section className="flex flex-col gap-2" aria-labelledby="history-heading">
            <h2 id="history-heading" className="text-xl">
              Versions
            </h2>
            <ol className="flex flex-col gap-1">
              {history.map((row) => (
                <li key={row.version} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Version {row.version}</span>
                  {row.version === latest.version ? <span>(current)</span> : null}
                  <span className="text-muted">
                    {formatTime(row.createdAt)} by {row.createdBy?.displayName ?? "a former user"}
                  </span>
                  <Link
                    href={`/settings/contracts/${campus.id}/preview?version=${row.version}`}
                    className="text-accent hover:underline"
                  >
                    Preview version {row.version}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <Card title="No template yet">
          <p className="mb-3">
            Start from the placeholder contract, then replace its wording with your reviewed
            contract. The placeholder is marked &ldquo;Draft — not reviewed&rdquo; at the top.
          </p>
          <ActionForm
            action={startFromPlaceholderAction.bind(null, campus.id)}
            submitLabel="Start from the placeholder"
            pendingLabel="Creating…"
          />
        </Card>
      )}
    </div>
  );
}
