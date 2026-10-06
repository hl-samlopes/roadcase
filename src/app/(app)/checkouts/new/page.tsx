import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { checkoutCampuses, defaultStaffId, staffOptions } from "@/lib/data/checkouts";
import { getGuestGroup } from "@/lib/data/guest-groups";
import { createCheckoutAction } from "../actions";
import { CheckoutDetailsFields, detailFieldLabels } from "../details-fields";

export const metadata: Metadata = { title: "New check-out" };

export default async function NewCheckoutPage({ searchParams }: PageProps<"/checkouts/new">) {
  const user = await requireUser();
  const campuses = await checkoutCampuses(user, "checkout:manage");
  if (campuses.length === 0) notFound();

  // From a guest group: its campus, and its details filled in.
  const query = await searchParams;
  const group = typeof query.group === "string" ? await getGuestGroup(user, query.group) : null;
  if (query.group && (!group || group.archivedAt)) notFound();
  const groupCampus = group ? campuses.find((c) => c.id === group.campusId) : null;
  if (group && !groupCampus) notFound();

  // Campus: the group's, else the one asked for, else the active campus, else the first allowed.
  const { active } = await getCampusContext(user);
  const campus =
    groupCampus ??
    campuses.find((c) => c.id === query.campus) ??
    campuses.find((c) => c.id === active?.id) ??
    campuses[0];
  const staff = await staffOptions(user.organizationId, campus.id);
  const defaultStaff = await defaultStaffId(user.organizationId, campus.id, staff, user.id);
  const groupValues = group
    ? {
        groupName: group.name,
        guestRepName: group.repName,
        guestRepEmail: group.repEmail,
        guestRepPhone: group.repPhone,
        staffRepId: staff.some((p) => p.id === group.staffContactId)
          ? group.staffContactId
          : defaultStaff,
        dateOut: group.arrivalDate,
        dateDue: group.departureDate,
        notes: null,
      }
    : undefined;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <Link href="/checkouts" className="text-accent hover:underline">
          Back to check-outs
        </Link>
      </div>
      <PageHeader title="New check-out" />
      {group ? (
        <p>
          For guest group{" "}
          <Link href={`/guests/${group.id}`} className="text-accent hover:underline">
            {group.name}
          </Link>
          : its details are filled in below.
        </p>
      ) : null}
      {campuses.length > 1 && !group ? (
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
          {group ? <input type="hidden" name="guestGroupId" value={group.id} /> : null}
          <CheckoutDetailsFields
            staff={staff}
            values={groupValues}
            defaultStaffId={defaultStaff}
            idPrefix="new"
            key={campus.id}
          />
        </ActionForm>
      </Card>
    </div>
  );
}
