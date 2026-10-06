import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, TextField } from "@/components/ui";
import { canManageDepartments, manageableCampuses } from "@/lib/admin/places";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  createDepartmentAction,
  createLocationAction,
  setDepartmentArchivedAction,
  setDepartmentLocationsAction,
  setLocationArchivedAction,
  updateDepartmentAction,
  updateLocationAction,
} from "./actions";

export const metadata: Metadata = { title: "Locations and departments" };

const inline = "flex flex-col items-start gap-1";

export default async function LocationsPage() {
  const actor = await requireUser();
  const campuses = await manageableCampuses(actor);
  const departmentsAllowed = canManageDepartments(actor);
  if (campuses.length === 0 && !departmentsAllowed) notFound();

  const [locations, departments, allLocations] = await Promise.all([
    db.location.findMany({
      where: { campusId: { in: campuses.map((c) => c.id) } },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    }),
    departmentsAllowed
      ? db.department.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
          include: { locations: { select: { locationId: true } } },
        })
      : [],
    departmentsAllowed
      ? db.location.findMany({
          where: { organizationId: actor.organizationId, archivedAt: null },
          orderBy: [{ campus: { code: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, campus: { select: { code: true } } },
        })
      : [],
  ]);

  // Items need a location linked to a department, so walk a new organization through that order.
  const activeLocationIds = new Set(allLocations.map((l) => l.id));
  const activeDepartments = departments.filter((d) => !d.archivedAt);
  const setupSteps = [
    { label: "Add a location on a campus", done: activeLocationIds.size > 0 },
    { label: "Add a department", done: activeDepartments.length > 0 },
    {
      label: "Link the department to the locations where it keeps equipment",
      done: activeDepartments.some((d) =>
        d.locations.some((l) => activeLocationIds.has(l.locationId)),
      ),
    },
  ];
  const showSetup = departmentsAllowed && !setupSteps.every((step) => step.done);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Locations and departments" />
      <p className="text-muted">
        Each item has a home location (a camp or venue on a campus) and an owning department. A
        department can keep equipment only at the locations linked to it below.
      </p>

      {showSetup ? (
        <Card title="Before items can be added">
          <ol className="flex flex-col gap-1">
            {setupSteps.map((step, index) => (
              <li key={step.label}>
                {index + 1}. {step.label}{" "}
                <span className={step.done ? "font-semibold" : "text-muted"}>
                  ({step.done ? "done" : "to do"})
                </span>
              </li>
            ))}
          </ol>
          <p className="text-muted mt-2">
            Departments and their links are under{" "}
            <a href="#departments" className="text-accent hover:underline">
              Departments
            </a>
            , after the campuses.
          </p>
        </Card>
      ) : null}

      {campuses.map((campus) => {
        const campusLocations = locations.filter((l) => l.campusId === campus.id);
        return (
          <section key={campus.id} className="flex flex-col gap-3">
            <h2 className="text-xl">
              {campus.name} ({campus.code})
            </h2>
            {campusLocations.length === 0 ? (
              <p className="text-muted">No locations yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {campusLocations.map((location) => (
                  <li key={location.id}>
                    <Card>
                      <p className="mb-2">
                        <span className="font-semibold">{location.name}</span>
                        {location.archivedAt ? (
                          <span className="text-muted"> · Archived</span>
                        ) : null}
                        <span className="text-muted">
                          {" "}
                          · {location._count.items} item{location._count.items === 1 ? "" : "s"}
                        </span>
                      </p>
                      <ActionForm
                        action={updateLocationAction.bind(null, location.id)}
                        submitLabel={`Save ${location.name}`}
                        variant="secondary"
                        fieldLabels={{ name: "Name", code: "Short code" }}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <TextField
                          label="Name"
                          name="name"
                          id={`location-name-${location.id}`}
                          defaultValue={location.name}
                          required
                        />
                        <TextField
                          label="Short code"
                          name="code"
                          id={`location-code-${location.id}`}
                          defaultValue={location.code ?? ""}
                          maxLength={12}
                        />
                      </ActionForm>
                      <div className="mt-2">
                        <ActionForm
                          action={setLocationArchivedAction.bind(
                            null,
                            location.id,
                            !location.archivedAt,
                          )}
                          submitLabel={
                            location.archivedAt
                              ? `Restore ${location.name}`
                              : `Archive ${location.name}`
                          }
                          variant={location.archivedAt ? "secondary" : "danger"}
                          className={inline}
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <Card title={`Add a location at ${campus.code}`}>
              <ActionForm
                action={createLocationAction.bind(null, campus.id)}
                submitLabel={`Add location at ${campus.code}`}
                fieldLabels={{ name: "Name", code: "Short code" }}
                className="flex flex-wrap items-end gap-3"
              >
                <TextField label="Name" name="name" id={`new-location-${campus.id}`} required />
                <TextField
                  label="Short code"
                  name="code"
                  id={`new-location-code-${campus.id}`}
                  maxLength={12}
                  hint="Optional, for example MR."
                />
              </ActionForm>
            </Card>
          </section>
        );
      })}

      {departmentsAllowed ? (
        <section id="departments" className="flex scroll-mt-4 flex-col gap-3">
          <h2 className="text-xl">Departments</h2>
          {departments.length === 0 ? <p className="text-muted">No departments yet.</p> : null}
          <ul className="flex flex-col gap-3">
            {departments.map((department) => {
              const linked = new Set(department.locations.map((l) => l.locationId));
              return (
                <li key={department.id}>
                  <Card>
                    <p className="mb-2 font-semibold">
                      {department.name}
                      {department.archivedAt ? (
                        <span className="text-muted"> · Archived</span>
                      ) : null}
                    </p>
                    <ActionForm
                      action={updateDepartmentAction.bind(null, department.id)}
                      submitLabel={`Save ${department.name}`}
                      variant="secondary"
                      fieldLabels={{ name: "Name" }}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <TextField
                        label="Name"
                        name="name"
                        id={`department-name-${department.id}`}
                        defaultValue={department.name}
                        required
                      />
                    </ActionForm>
                    <div className="border-border mt-3 border-t pt-3">
                      <ActionForm
                        action={setDepartmentLocationsAction.bind(null, department.id)}
                        submitLabel={`Save ${department.name} locations`}
                        variant="secondary"
                      >
                        <fieldset>
                          <legend className="mb-1 font-semibold">
                            Locations where {department.name} keeps equipment
                          </legend>
                          {allLocations.length === 0 ? (
                            <p className="text-muted">Add a location first.</p>
                          ) : (
                            <div className="grid gap-1 sm:grid-cols-2">
                              {allLocations.map((location) => (
                                <label key={location.id} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    name="locationId"
                                    value={location.id}
                                    defaultChecked={linked.has(location.id)}
                                    className="accent-accent"
                                  />
                                  {location.name} ({location.campus.code})
                                </label>
                              ))}
                            </div>
                          )}
                        </fieldset>
                      </ActionForm>
                    </div>
                    <div className="mt-2">
                      <ActionForm
                        action={setDepartmentArchivedAction.bind(
                          null,
                          department.id,
                          !department.archivedAt,
                        )}
                        submitLabel={
                          department.archivedAt
                            ? `Restore ${department.name}`
                            : `Archive ${department.name}`
                        }
                        variant={department.archivedAt ? "secondary" : "danger"}
                        className={inline}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Card title="Add a department">
            <ActionForm
              action={createDepartmentAction}
              submitLabel="Add department"
              fieldLabels={{ name: "Name" }}
              className="flex flex-wrap items-end gap-3"
            >
              <TextField label="Name" name="name" id="new-department-name" required />
            </ActionForm>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
