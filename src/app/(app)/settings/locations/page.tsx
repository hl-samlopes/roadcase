import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField, TextField } from "@/components/ui";
import { canManageDepartments, manageableCampuses } from "@/lib/admin/places";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  createDepartmentAction,
  createLocationAction,
  saveDepartmentAction,
  setDepartmentArchivedAction,
  setLocationArchivedAction,
  updateLocationAction,
} from "./actions";
import { CardHeaderWithAdd, EditableRow } from "./place-rows";

export const metadata: Metadata = { title: "Locations and departments" };

const inline = "flex flex-col items-start gap-1";
const cell = "flex min-w-0 flex-wrap items-center gap-2 p-2";
const th = "text-muted border-border border-b p-2 font-semibold";
const chip = "border-border rounded-full border px-2 whitespace-nowrap";
const LOCATION_COLUMNS_ALL =
  "minmax(150px,1.6fr) minmax(150px,1.3fr) minmax(150px,1.8fr) 64px 96px 96px";
const LOCATION_COLUMNS_ONE = "minmax(150px,1.6fr) minmax(200px,2.4fr) 64px 96px 96px";
const DEPARTMENT_COLUMNS = "minmax(140px,1.2fr) minmax(200px,3fr) 64px 96px 96px";

function Status({ archived }: { archived: boolean }) {
  return (
    <span
      className={`border-border rounded-theme border px-1.5 ${archived ? "text-muted border-dashed" : ""}`}
    >
      {archived ? "Archived" : "Active"}
    </span>
  );
}

/** Campus filter links; the current one is marked by weight and a bar, not color alone. */
function CampusFilter({
  label,
  options,
  current,
  href,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  current: string;
  href: (value: string) => string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 px-4 pb-3">
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={href(option.value)}
            aria-current={active ? "true" : undefined}
            className={`rounded-theme border-border focus-visible:outline-accent inline-flex min-h-10 items-center gap-2 border px-3 focus-visible:outline-2 ${
              active
                ? "border-accent text-text font-semibold shadow-[inset_0_-3px_0_var(--accent)]"
                : "text-muted bg-surface"
            }`}
          >
            {option.label}
            <span className="border-border rounded-full border px-1.5 text-xs">{option.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type GroupLocation = {
  id: string;
  name: string;
  archivedAt: Date | null;
  campus: { code: string; name: string };
};

/** Location checkboxes grouped by campus (archived ones only when already linked). */
function LocationBoxes({
  locations,
  linked,
  idPrefix,
}: {
  locations: GroupLocation[];
  linked: Set<string>;
  idPrefix: string;
}) {
  const codes = [...new Set(locations.map((l) => l.campus.code))];
  return (
    <div className="flex flex-wrap gap-6">
      {codes.map((code) => {
        const group = locations.filter(
          (l) => l.campus.code === code && (!l.archivedAt || linked.has(l.id)),
        );
        return (
          <div key={code} className="min-w-48">
            <p className="text-muted mb-1">
              {group[0]?.campus.name ?? code} ({code})
            </p>
            {group.map((location) => (
              <label key={location.id} className="flex min-h-8 items-center gap-2">
                <input
                  type="checkbox"
                  name="locationId"
                  value={location.id}
                  id={`${idPrefix}-${location.id}`}
                  defaultChecked={linked.has(location.id)}
                  className="accent-accent h-4 w-4"
                />
                {location.name}
                {location.archivedAt ? <span className="text-muted">(archived)</span> : null}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default async function LocationsPage({ searchParams }: PageProps<"/settings/locations">) {
  const actor = await requireUser();
  const campuses = await manageableCampuses(actor);
  const departmentsAllowed = canManageDepartments(actor);
  if (campuses.length === 0 && !departmentsAllowed) notFound();

  const query = await searchParams;
  const param = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
  const showArchived = param("archived") === "1";
  const locCampus = campuses.some((c) => c.code === param("campus")) ? param("campus") : "all";

  const [locations, departments, allLocations] = await Promise.all([
    db.location.findMany({
      where: { campusId: { in: campuses.map((c) => c.id) } },
      orderBy: [{ campus: { code: "asc" } }, { name: "asc" }],
      include: {
        campus: { select: { code: true, name: true } },
        _count: { select: { items: true } },
        departments: {
          where: { department: { archivedAt: null } },
          select: { department: { select: { name: true } } },
        },
      },
    }),
    departmentsAllowed
      ? db.department.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
          include: {
            _count: { select: { items: true } },
            locations: {
              select: {
                locationId: true,
                location: { select: { name: true, campus: { select: { code: true } } } },
              },
            },
          },
        })
      : [],
    departmentsAllowed
      ? db.location.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: [{ campus: { code: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            archivedAt: true,
            campus: { select: { code: true, name: true } },
          },
        })
      : [],
  ]);

  const deptCampusOptions = [...new Map(allLocations.map((l) => [l.campus.code, l.campus]))];
  const deptCampus = deptCampusOptions.some(([code]) => code === param("deptCampus"))
    ? param("deptCampus")
    : "all";
  const href = (changes: Record<string, string>) => {
    const next = { campus: locCampus, deptCampus, archived: showArchived ? "1" : "", ...changes };
    const search = new URLSearchParams(
      Object.entries(next).filter(([, value]) => value && value !== "all"),
    ).toString();
    return search ? `/settings/locations?${search}` : "/settings/locations";
  };

  // Items need a location linked to a department; walk a new organization through that order.
  const activeLocationIds = new Set(allLocations.filter((l) => !l.archivedAt).map((l) => l.id));
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

  const listedLocations = locations.filter((l) => showArchived || !l.archivedAt);
  const visibleLocations = listedLocations.filter(
    (l) => locCampus === "all" || l.campus.code === locCampus,
  );
  const locColumns = locCampus === "all" ? LOCATION_COLUMNS_ALL : LOCATION_COLUMNS_ONE;
  const archivedCount = locations.filter((l) => l.archivedAt).length;

  const atCampus = (d: (typeof departments)[number], code: string) =>
    d.locations.some((l) => l.location.campus.code === code);
  const visibleDepartments = departments.filter(
    (d) => deptCampus === "all" || atCampus(d, deptCampus),
  );

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Locations and departments" />
      <p className="text-muted">
        Each item has a home location (a camp or venue on a campus) and an owning department. A
        department keeps equipment only at the locations linked to it.
      </p>
      {departmentsAllowed ? null : (
        <p className="text-muted">
          Organization admins add departments and link them to locations. Items can be added at a
          location once a department is linked to it.
        </p>
      )}

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
        </Card>
      ) : null}

      {campuses.length > 0 ? (
        <section
          aria-labelledby="locations-heading"
          className="rounded-theme border-border bg-surface border"
        >
          <CardHeaderWithAdd
            headingId="locations-heading"
            title="Locations"
            addLabel="Add location"
            extra={
              archivedCount > 0 ? (
                <Link
                  href={href({ archived: showArchived ? "" : "1" })}
                  className="text-accent hover:underline"
                >
                  {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
                </Link>
              ) : null
            }
          >
            <ActionForm
              action={createLocationAction}
              submitLabel="Add location"
              fieldLabels={{ campusId: "Campus", name: "Name", code: "Short code" }}
              className="flex flex-wrap items-end gap-3"
            >
              <SelectField
                label="Campus"
                name="campusId"
                id="new-location-campus"
                defaultValue={campuses.find((c) => c.code === locCampus)?.id ?? campuses[0].id}
              >
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name} ({campus.code})
                  </option>
                ))}
              </SelectField>
              <TextField label="Name" name="name" id="new-location-name" maxLength={80} required />
              <TextField
                label="Short code"
                name="code"
                id="new-location-code"
                maxLength={12}
                hint="Optional, for example MR."
              />
            </ActionForm>
          </CardHeaderWithAdd>

          <CampusFilter
            label="Filter locations by campus"
            current={locCampus}
            href={(value) => href({ campus: value })}
            options={[
              { value: "all", label: "All campuses", count: listedLocations.length },
              ...campuses.map((c) => ({
                value: c.code,
                label: `${c.name} (${c.code})`,
                count: listedLocations.filter((l) => l.campus.code === c.code).length,
              })),
            ]}
          />

          <div className="border-border overflow-x-auto border-t">
            <div role="table" aria-label="Locations" className="min-w-[640px]">
              <div role="row" className="grid" style={{ gridTemplateColumns: locColumns }}>
                <div role="columnheader" className={th}>
                  Location
                </div>
                {locCampus === "all" ? (
                  <div role="columnheader" className={th}>
                    Campus
                  </div>
                ) : null}
                <div role="columnheader" className={th}>
                  Departments here
                </div>
                <div role="columnheader" className={th}>
                  Items
                </div>
                <div role="columnheader" className={th}>
                  Status
                </div>
                <div role="columnheader" className={th}>
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              {visibleLocations.map((location) => (
                <EditableRow
                  key={location.id}
                  name={`${location.name}, ${location.campus.code}`}
                  columns={locColumns}
                  cells={
                    <>
                      <div role="cell" className={cell}>
                        <span className="font-semibold">{location.name}</span>
                        {location.code ? (
                          <span className="border-border text-muted rounded border px-1 font-mono text-xs">
                            {location.code}
                          </span>
                        ) : null}
                      </div>
                      {locCampus === "all" ? (
                        <div role="cell" className={cell}>
                          {location.campus.name} ({location.campus.code})
                        </div>
                      ) : null}
                      <div role="cell" className={cell}>
                        {location.departments.length > 0 ? (
                          location.departments.map((link) => (
                            <span key={link.department.name} className={chip}>
                              {link.department.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted">None yet</span>
                        )}
                      </div>
                      <div role="cell" className={cell}>
                        {location._count.items}
                      </div>
                      <div role="cell" className={cell}>
                        <Status archived={!!location.archivedAt} />
                      </div>
                    </>
                  }
                  editor={
                    <>
                      <ActionForm
                        action={updateLocationAction.bind(null, location.id)}
                        submitLabel={`Save ${location.name}`}
                        resetOnSuccess={false}
                        fieldLabels={{ name: "Name", code: "Short code" }}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <TextField
                          label="Name"
                          name="name"
                          id={`location-name-${location.id}`}
                          defaultValue={location.name}
                          maxLength={80}
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
                      <p className="text-muted">
                        {location.departments.length > 0
                          ? "Departments are linked to locations on the department, below."
                          : "Link a department to this location below so items can live here."}
                      </p>
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
                    </>
                  }
                />
              ))}
              {visibleLocations.length === 0 ? (
                <p className="text-muted p-4">
                  {locCampus === "all" ? "No locations yet." : "No locations at this campus yet."}{" "}
                  Use Add location.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {departmentsAllowed ? (
        <section
          id="departments"
          aria-labelledby="departments-heading"
          className="rounded-theme border-border bg-surface scroll-mt-4 border"
        >
          <CardHeaderWithAdd
            headingId="departments-heading"
            title="Departments"
            addLabel="Add department"
          >
            <ActionForm
              action={createDepartmentAction}
              submitLabel="Add department"
              fieldLabels={{ name: "Name" }}
            >
              <TextField
                label="Name"
                name="name"
                id="new-department-name"
                maxLength={80}
                required
              />
              <fieldset>
                <legend className="mb-1 font-semibold">
                  Keeps equipment at (optional; you can link locations later)
                </legend>
                {allLocations.length === 0 ? (
                  <p className="text-muted">Add a location first.</p>
                ) : (
                  <LocationBoxes
                    locations={allLocations}
                    linked={new Set()}
                    idPrefix="new-department"
                  />
                )}
              </fieldset>
            </ActionForm>
          </CardHeaderWithAdd>

          <CampusFilter
            label="Filter departments by campus"
            current={deptCampus}
            href={(value) => href({ deptCampus: value })}
            options={[
              { value: "all", label: "All campuses", count: departments.length },
              ...deptCampusOptions.map(([code, campus]) => ({
                value: code,
                label: `${campus.name} (${code})`,
                count: departments.filter((d) => atCampus(d, code)).length,
              })),
            ]}
          />

          <div className="border-border overflow-x-auto border-t">
            <div role="table" aria-label="Departments" className="min-w-[640px]">
              <div role="row" className="grid" style={{ gridTemplateColumns: DEPARTMENT_COLUMNS }}>
                <div role="columnheader" className={th}>
                  Department
                </div>
                <div role="columnheader" className={th}>
                  Keeps equipment at
                </div>
                <div role="columnheader" className={th}>
                  Items
                </div>
                <div role="columnheader" className={th}>
                  Status
                </div>
                <div role="columnheader" className={th}>
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              {visibleDepartments.map((department) => {
                const linked = new Set(department.locations.map((l) => l.locationId));
                const shown = department.locations.filter(
                  (l) => deptCampus === "all" || l.location.campus.code === deptCampus,
                );
                return (
                  <EditableRow
                    key={department.id}
                    name={department.name}
                    columns={DEPARTMENT_COLUMNS}
                    cells={
                      <>
                        <div role="cell" className={`${cell} font-semibold`}>
                          {department.name}
                        </div>
                        <div role="cell" className={cell}>
                          {shown.length > 0 ? (
                            shown.map((link) => (
                              <span key={link.locationId} className={chip}>
                                {link.location.name} · {link.location.campus.code}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted">No locations linked</span>
                          )}
                        </div>
                        <div role="cell" className={cell}>
                          {department._count.items}
                        </div>
                        <div role="cell" className={cell}>
                          <Status archived={!!department.archivedAt} />
                        </div>
                      </>
                    }
                    editor={
                      <>
                        <ActionForm
                          action={saveDepartmentAction.bind(null, department.id)}
                          submitLabel={`Save ${department.name}`}
                          resetOnSuccess={false}
                          fieldLabels={{ name: "Name" }}
                        >
                          <TextField
                            label="Name"
                            name="name"
                            id={`department-name-${department.id}`}
                            defaultValue={department.name}
                            maxLength={80}
                            required
                          />
                          <fieldset>
                            <legend className="mb-1 font-semibold">
                              Locations where {department.name} keeps equipment
                            </legend>
                            {allLocations.length === 0 ? (
                              <p className="text-muted">Add a location first.</p>
                            ) : (
                              <LocationBoxes
                                locations={allLocations}
                                linked={linked}
                                idPrefix={`dept-${department.id}`}
                              />
                            )}
                          </fieldset>
                        </ActionForm>
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
                      </>
                    }
                  />
                );
              })}
              {visibleDepartments.length === 0 ? (
                <p className="text-muted p-4">
                  {deptCampus === "all"
                    ? "No departments yet. Use Add department."
                    : "No department keeps equipment at this campus yet."}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
