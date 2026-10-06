import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ContractView } from "@/components/contract-view";
import { Card, CheckboxField, PageHeader, TextField } from "@/components/ui";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { SIGNATURE_CONSENT, signerRoleLabels, utcStamp } from "@/lib/contracts/signing";
import { activeContract } from "@/lib/data/contract-records";
import { getCheckout } from "@/lib/data/checkouts";
import { signContractAction } from "../../contract-actions";
import { SignaturePad } from "./signature-pad";

export const metadata: Metadata = { title: "Sign contract" };

/**
 * The signing screen, made for a tablet or phone handed between the guest
 * and the staff member: the whole contract first, then each party's name,
 * consent and signature. The date is recorded on the server when they sign.
 */
export default async function SignContractPage({ params }: PageProps<"/checkouts/[id]/sign">) {
  const user = await requireUser();
  const checkout = await getCheckout(user, (await params).id);
  if (!checkout || !canManageCheckout(user, checkout)) notFound();
  const contract = await activeContract(checkout.organizationId, checkout.id);
  if (!contract) notFound();

  const back = (
    <Link href={`/checkouts/${checkout.id}`} className="text-accent hover:underline">
      Back to check-out #{checkout.number}
    </Link>
  );

  if (contract.signedAt) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <div>{back}</div>
        <PageHeader title={`Check-out #${checkout.number} is signed`} />
        <p role="status" className="font-semibold">
          Both parties have signed. The check-out is out, and the signed PDF is being emailed to{" "}
          {checkout.guestRepEmail} and{" "}
          {checkout.staffRep?.displayName ?? "the staff representative"}.
        </p>
      </div>
    );
  }

  const defaults = {
    GUEST: checkout.guestRepName,
    STAFF: checkout.staffRep?.displayName ?? "",
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>{back}</div>
      <PageHeader title={`Sign the contract: check-out #${checkout.number}`} />
      <p>
        Read the whole contract, then each person signs below. Hand the device to the guest
        representative for their part.
      </p>

      <Card>
        <ContractView doc={contract.doc} label="Contract to sign" />
      </Card>

      {(["GUEST", "STAFF"] as const).map((role) => {
        const signed = contract.signatures.find((s) => s.role === role);
        const label = signerRoleLabels[role];
        const nameId = `printed-name-${role.toLowerCase()}`;
        if (signed) {
          return (
            <Card key={role} title={label}>
              <p role="status">
                <span className="font-semibold">Signed</span> by {signed.printedName},{" "}
                {utcStamp(signed.signedAt)}.
              </p>
            </Card>
          );
        }
        if (role === "STAFF" && checkout.staffRepId !== user.id) {
          return (
            <Card key={role} title={label}>
              <p>
                {checkout.staffRep?.displayName ?? "The staff representative"} signs here, signed in
                to Roadcase as themselves.
              </p>
            </Card>
          );
        }
        return (
          <Card key={role} title={label}>
            <ActionForm
              action={signContractAction.bind(null, checkout.id)}
              submitLabel={`Sign as ${label.toLowerCase()}`}
              pendingLabel="Signing…"
              resetOnSuccess={false}
              fieldLabels={{
                printedName: "Printed name",
                consent: "Agreement",
                signature: "Signature",
              }}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="textHash" value={contract.textHash} />
              <TextField
                label="Printed name"
                name="printedName"
                id={nameId}
                defaultValue={defaults[role]}
                autoComplete="off"
                maxLength={200}
                required
              />
              <CheckboxField
                label={SIGNATURE_CONSENT}
                name="consent"
                id={`consent-${role.toLowerCase()}`}
                required
              />
              <SignaturePad id={`signature-${role.toLowerCase()}`} printedNameInputId={nameId} />
            </ActionForm>
          </Card>
        );
      })}
    </div>
  );
}
