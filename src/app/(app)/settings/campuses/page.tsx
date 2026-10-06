import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { manageableCampuses } from "@/lib/admin/places";
import { staffOptions } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { setCampusContactAction } from "./actions";

export const metadata: Metadata = { title: "Campuses" };

export default async function CampusesPage() {
  const actor = await requireUser();
  const campuses = await manageableCampuses(actor);
  if (campuses.length === 0) notFound();
  const [contacts, staffByCampus] = await Promise.all([
    db.campus.findMany({
      where: { id: { in: campuses.map((c) => c.id) } },
      select: { id: true, defaultContactId: true },
    }),
    Promise.all(campuses.map((c) => staffOptions(actor.organizationId, c.id))),
  ]);
  const contactOf = new Map(contacts.map((c) => [c.id, c.defaultContactId]));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Campuses" />
      <p className="text-muted">
        A campus&apos;s default contact starts as the staff contact on its new guest groups and
        check-outs, and gets the emails when a group sends an equipment request or band setup.
        Without one, or if they turn those emails off in Preferences, the emails go to everyone who
        runs check-outs at the campus.
      </p>
      {campuses.map((campus, index) => {
        const staff = staffByCampus[index];
        const current = contactOf.get(campus.id) ?? null;
        const stillEligible = !!current && staff.some((p) => p.id === current);
        return (
          <Card key={campus.id} title={`${campus.name} (${campus.code})`}>
            {current && !stillEligible ? (
              <p className="mb-2 font-semibold">
                The default contact no longer runs check-outs here, so emails go to everyone who
                does. Choose someone else.
              </p>
            ) : null}
            <ActionForm
              action={setCampusContactAction.bind(null, campus.id)}
              submitLabel={`Save ${campus.code} contact`}
              resetOnSuccess={false}
              fieldLabels={{ defaultContactId: "Default contact" }}
              className="flex flex-wrap items-end gap-3"
            >
              <SelectField
                label="Default contact"
                name="defaultContactId"
                id={`contact-${campus.id}`}
                defaultValue={stillEligible ? current! : ""}
              >
                <option value="">No default contact</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </SelectField>
            </ActionForm>
          </Card>
        );
      })}
    </div>
  );
}
