import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractView } from "@/components/contract-view";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { fillDocument, templateFields } from "@/lib/contracts/document";
import {
  checkoutMergeValues,
  contractCampuses,
  latestTemplateVersion,
  previewableCheckouts,
  sampleMergeValues,
  templateHistory,
  templateVersion,
} from "@/lib/data/contracts";

export const metadata: Metadata = { title: "Preview contract" };

export default async function PreviewContractPage({
  params,
  searchParams,
}: PageProps<"/settings/contracts/[campusId]/preview">) {
  const actor = await requireUser();
  const { campusId } = await params;
  const campus = (await contractCampuses(actor)).find((c) => c.id === campusId);
  if (!campus) notFound();

  const query = await searchParams;
  const requestedVersion = Number(query.version);
  const checkoutId = typeof query.checkout === "string" ? query.checkout : "";

  const template = Number.isInteger(requestedVersion)
    ? await templateVersion(actor.organizationId, campus.id, requestedVersion)
    : await latestTemplateVersion(actor.organizationId, campus.id);
  if (!template) notFound();

  const [history, checkouts] = await Promise.all([
    templateHistory(actor.organizationId, campus.id),
    previewableCheckouts(actor.organizationId, campus.id),
  ]);
  const fromCheckout = checkoutId
    ? await checkoutMergeValues(actor.organizationId, campus.id, checkoutId)
    : null;
  const values = fromCheckout ?? (await sampleMergeValues(actor.organizationId, campus));
  const filled = fillDocument(template.doc, values);
  const { unknown } = templateFields(template.doc);
  const source = fromCheckout ? checkouts.find((c) => c.id === checkoutId) : null;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href={`/settings/contracts/${campus.id}`} className="text-accent hover:underline">
          Back to the template
        </Link>
      </div>
      <PageHeader title={`Preview: ${campus.name} contract`} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Version"
          name="version"
          id="preview-version"
          defaultValue={String(template.version)}
        >
          {history.map((row) => (
            <option key={row.version} value={row.version}>
              Version {row.version}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Fill from"
          name="checkout"
          id="preview-checkout"
          defaultValue={fromCheckout ? checkoutId : ""}
        >
          <option value="">Sample data</option>
          {checkouts.map((checkout) => (
            <option key={checkout.id} value={checkout.id}>
              Check-out #{checkout.number}: {checkout.groupName}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="text-accent self-end py-2 hover:underline">
          Show preview
        </button>
      </form>

      <p role="status">
        Version {template.version}, filled from{" "}
        {source ? `check-out #${source.number} (${source.groupName})` : "sample data"}.
        {unknown.length > 0
          ? ` Unknown fields left as typed: ${unknown.map((n) => `{{${n}}}`).join(", ")}.`
          : ""}
      </p>

      <Card>
        <ContractView doc={filled} label="Contract preview" />
      </Card>
    </div>
  );
}
