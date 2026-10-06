import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { checkoutCampuses, staffOptions } from "@/lib/data/checkouts";
import { createGuestGroupAction } from "../actions";
import { GuestGroupFields, groupFieldLabels } from "../details-fields";

export const metadata: Metadata = { title: "New guest group" };

export default async function NewGuestGroupPage({ searchParams }: PageProps<"/guests/new">) {
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
        <Link href="/guests" className="text-accent hover:underline">
          Back to guest groups
        </Link>
      </div>
      <PageHeader title="New guest group" />
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
          Visiting <span className="font-semibold">{campus.name}</span>. Save the group, then send
          its representative a portal link.
        </p>
        <ActionForm
          action={createGuestGroupAction}
          submitLabel="Save guest group"
          fieldLabels={groupFieldLabels}
          resetOnSuccess={false}
        >
          <input type="hidden" name="campusId" value={campus.id} />
          <GuestGroupFields
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
