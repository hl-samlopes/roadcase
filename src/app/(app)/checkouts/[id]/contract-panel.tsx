import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Card } from "@/components/ui";
import { signerRoleLabels, utcStamp } from "@/lib/contracts/signing";
import { prepareProblem, type ActiveContract } from "@/lib/data/contract-records";
import type { CheckoutDetail } from "@/lib/data/checkouts";
import { prepareContractAction, returnToDraftAction } from "../contract-actions";

const inline = "flex flex-col items-start gap-1";

/**
 * The contract part of a check-out: prepare it, collect signatures, then
 * download the PDF. Admins also see the audit trail and the signature images.
 */
export function ContractPanel({
  checkout,
  contract,
  hasTemplate,
  canManage,
  canAudit,
}: {
  checkout: CheckoutDetail;
  contract: ActiveContract | null;
  hasTemplate: boolean;
  canManage: boolean;
  canAudit: boolean;
}) {
  if (checkout.status === "CANCELLED") return null;

  if (checkout.status === "DRAFT") {
    if (!canManage) return null;
    const problem = prepareProblem(checkout, hasTemplate);
    return (
      <Card title="Contract">
        <p className="mb-3">
          When the items and details are right, prepare the contract. That fills in the campus
          template and locks the check-out until both parties sign (or you return it to draft).
        </p>
        {problem ? <p className="text-muted mb-3">{problem}</p> : null}
        {problem ? null : (
          <ActionForm
            action={prepareContractAction.bind(null, checkout.id)}
            submitLabel="Prepare contract for signing"
            pendingLabel="Preparing…"
            className={inline}
          />
        )}
      </Card>
    );
  }

  if (!contract) return null;
  const signedBy = (role: "GUEST" | "STAFF") => contract.signatures.find((s) => s.role === role);

  return (
    <Card title="Contract">
      <ul className="mb-3 flex flex-col gap-1">
        {(["GUEST", "STAFF"] as const).map((role) => {
          const signature = signedBy(role);
          return (
            <li key={role}>
              <span className="font-semibold">{signerRoleLabels[role]}:</span>{" "}
              {signature
                ? `Signed by ${signature.printedName}, ${utcStamp(signature.signedAt)}`
                : "Not signed yet"}
            </li>
          );
        })}
      </ul>

      {checkout.status === "AWAITING_SIGNATURES" && canManage ? (
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/checkouts/${checkout.id}/sign`} className={buttonClass("primary")}>
            Open the signing screen
          </Link>
          <ActionForm
            action={returnToDraftAction.bind(null, checkout.id)}
            submitLabel="Return to draft"
            pendingLabel="Returning…"
            variant="secondary"
            className={inline}
          />
        </div>
      ) : null}

      {contract.signedAt ? (
        <p>
          Signed by both parties on {utcStamp(contract.signedAt)}.{" "}
          {contract.pdfKey ? (
            <a
              href={`/checkouts/${checkout.id}/contract.pdf`}
              className="text-accent hover:underline"
            >
              Download the signed contract (PDF)
            </a>
          ) : (
            <span className="text-muted">The PDF is being made; reload in a minute.</span>
          )}
        </p>
      ) : null}

      {canAudit ? (
        <details className="border-border mt-3 border-t pt-3">
          <summary className="cursor-pointer font-semibold">Audit trail</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted">Template version</dt>
            <dd>{contract.templateVersion.version}</dd>
            <dt className="text-muted">Prepared</dt>
            <dd>
              {utcStamp(contract.preparedAt)} by{" "}
              {contract.preparedBy?.displayName ?? "a former user"}
            </dd>
            <dt className="text-muted">Contract text SHA-256</dt>
            <dd className="font-mono break-all">{contract.textHash}</dd>
          </dl>
          {contract.signatures.map((signature) => (
            <section key={signature.id} className="mt-3">
              <h3 className="text-base">{signerRoleLabels[signature.role]}</h3>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_1fr]">
                <dt className="text-muted">Printed name</dt>
                <dd>{signature.printedName}</dd>
                <dt className="text-muted">Signed</dt>
                <dd>{utcStamp(signature.signedAt)}</dd>
                <dt className="text-muted">IP address</dt>
                <dd>{signature.ipAddress ?? "Not recorded"}</dd>
                <dt className="text-muted">Browser</dt>
                <dd className="break-all">{signature.userAgent ?? "Not recorded"}</dd>
                <dt className="text-muted">Text SHA-256 shown</dt>
                <dd className="font-mono break-all">{signature.textHash}</dd>
                <dt className="text-muted">Collected by</dt>
                <dd>{signature.collectedBy?.displayName ?? "a former user"}</dd>
                <dt className="text-muted">Agreed to</dt>
                <dd>{signature.consentText}</dd>
              </dl>
              {/* Signature images are served only to admins, never cached. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/checkouts/${checkout.id}/signatures/${signature.id}`}
                alt={`Signature of ${signature.printedName}`}
                className="border-border rounded-theme mt-2 max-h-28 border bg-[#FFFFFF]"
              />
            </section>
          ))}
        </details>
      ) : null}
    </Card>
  );
}
