import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { checkoutCampuses, staffOptions } from "@/lib/data/checkouts";
import { createCheckoutAction } from "../actions";
import { CheckoutDetailsFields, detailFieldLabels } from "../details-fields";

export const metadata: Metadata = { title: "New check-out" };

export default async function NewCheckoutPage({ searchParams }: PageProps<"/checkouts/new">) {
  const user = await requireUser();
  const campuses = await checkoutCampuses(user, "checkout:manage");
  if (campuses.length === 0) notFound();

  // Campus: the one asked for, else the active campus, else the first allowed.
  const { active } = await getCampusContext(user);
  const requested = (await searchParams).campus;
  const campus =
    campuses.find((c) => c.id === requested) ??
    campuses.find((c) => c.id === active?.id) ??
    campuses[0];
  const staff = await staffOptions(user.organizationId, campus.id);
  const defaultStaff = staff.some((p) => p.id === user.id) ? user.id : null;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <Link href="/checkouts" className="text-accent hover:underline">
          Back to check-outs
        </Link>
      </div>
      <PageHeader title="New check-out" />
      {campuses.length > 1 ? (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <SelectField label="Campus" name="campus" id="campus-pick" defaultValue={campus.id}>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </SelectField>
          <button type="submit" className="text-accent self-end py-2 hover:underline">
            Change campus
          </button>
        </form>
      ) : null}
      <Card>
        <p className="mb-3">
          Equipment from <span className="font-semibold">{campus.name}</span>. Save the details,
          then add items by scanning or searching.
        </p>
        <ActionForm
          action={createCheckoutAction}
          submitLabel="Create draft check-out"
          fieldLabels={detailFieldLabels}
          resetOnSuccess={false}
        >
          <input type="hidden" name="campusId" value={campus.id} />
          <CheckoutDetailsFields
            staff={staff}
            defaultStaffId={defaultStaff}
            idPrefix="new"
            key={campus.id}
          />
        </ActionForm>
      </Card>
    </div>
  );
}
