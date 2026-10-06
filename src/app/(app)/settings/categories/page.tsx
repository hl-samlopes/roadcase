import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CardHeaderWithAdd, EditableRow } from "@/components/editable-rows";
import { CheckboxField, PageHeader, TextAreaField, TextField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  createCategoryAction,
  createSubcategoryAction,
  moveCategoryAction,
  removeCategoryAction,
  removeSubcategoryAction,
  renameCategoryAction,
  renameSubcategoryAction,
  restoreCategoryAction,
  restoreSubcategoryAction,
  savePortalCategoryAction,
} from "./actions";

export const metadata: Metadata = { title: "Categories" };

const inline = "flex flex-col items-start gap-1";
const cell = "flex min-w-0 flex-wrap items-center gap-2 p-2";
const th = "text-muted border-border border-b p-2 font-semibold";
const chip = "border-border rounded-full border px-2 whitespace-nowrap";
const COLUMNS = "minmax(140px,1.2fr) minmax(200px,3fr) 64px 110px 96px 96px";

export default async function CategoriesPage() {
  const actor = await requireUser();
  if (!can(actor, "categories:manage", { organizationId: actor.organizationId })) notFound();

  const categories = await db.category.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [
      { archivedAt: { sort: "asc", nulls: "first" } },
      { position: "asc" },
      { name: "asc" },
    ],
    include: {
      _count: { select: { items: true } },
      subcategories: {
        orderBy: [
          { archivedAt: { sort: "asc", nulls: "first" } },
          { position: "asc" },
          { name: "asc" },
        ],
        include: { _count: { select: { items: true } } },
      },
    },
  });
  const active = categories.filter((c) => !c.archivedAt);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Categories" />
      <p className="text-muted">
        Every item has a category, and optionally a subcategory. They appear in this order in lists
        and filters. One that items use is archived instead of deleted: those items keep it, but it
        can&apos;t be chosen for others.
      </p>

      <section
        aria-labelledby="categories-heading"
        className="rounded-theme border-border bg-surface border"
      >
        <CardHeaderWithAdd
          headingId="categories-heading"
          title="Categories"
          addLabel="Add category"
        >
          <ActionForm
            action={createCategoryAction}
            submitLabel="Add category"
            fieldLabels={{ name: "Name" }}
            className="flex flex-wrap items-end gap-3"
          >
            <TextField label="Name" name="name" id="new-category-name" maxLength={80} required />
          </ActionForm>
        </CardHeaderWithAdd>

        <div className="border-border border-t">
          <div role="table" aria-label="Categories" className="md:min-w-[640px]">
            <div role="row" className="hidden md:grid" style={{ gridTemplateColumns: COLUMNS }}>
              <div role="columnheader" className={th}>
                Category
              </div>
              <div role="columnheader" className={th}>
                Subcategories
              </div>
              <div role="columnheader" className={th}>
                Items
              </div>
              <div role="columnheader" className={th}>
                Guest portal
              </div>
              <div role="columnheader" className={th}>
                Status
              </div>
              <div role="columnheader" className={th}>
                <span className="sr-only">Actions</span>
              </div>
            </div>
            {categories.map((category) => {
              const index = active.findIndex((c) => c.id === category.id);
              return (
                <EditableRow
                  key={category.id}
                  name={category.name}
                  columns={COLUMNS}
                  cells={
                    <>
                      <div
                        role="cell"
                        className={`${cell} font-semibold max-md:order-first max-md:min-w-0 max-md:flex-1`}
                      >
                        {category.name}
                      </div>
                      <div role="cell" className={cell}>
                        {category.subcategories.length > 0 ? (
                          category.subcategories.map((sub) => (
                            <span
                              key={sub.id}
                              className={`${chip} ${sub.archivedAt ? "text-muted border-dashed" : ""}`}
                            >
                              {sub.name}
                              {sub.archivedAt ? " (archived)" : ""}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </div>
                      <div role="cell" className={cell}>
                        <span className="text-muted md:hidden">Items:</span>
                        {category._count.items}
                      </div>
                      <div role="cell" className={cell}>
                        <span className="text-muted md:hidden">Guest portal:</span>
                        {category.showInPortal && !category.archivedAt ? "Shown" : "Hidden"}
                      </div>
                      <div role="cell" className={cell}>
                        <span
                          className={`border-border rounded-theme border px-1.5 ${category.archivedAt ? "text-muted border-dashed" : ""}`}
                        >
                          {category.archivedAt ? "Archived" : "Active"}
                        </span>
                      </div>
                    </>
                  }
                  editor={
                    <>
                      <ActionForm
                        action={renameCategoryAction.bind(null, category.id)}
                        submitLabel={`Save ${category.name}`}
                        resetOnSuccess={false}
                        fieldLabels={{ name: "Name" }}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <TextField
                          label="Name"
                          name="name"
                          id={`category-name-${category.id}`}
                          defaultValue={category.name}
                          maxLength={80}
                          required
                        />
                      </ActionForm>

                      <ActionForm
                        action={savePortalCategoryAction.bind(null, category.id)}
                        submitLabel={`Save guest portal settings for ${category.name}`}
                        variant="secondary"
                        resetOnSuccess={false}
                        fieldLabels={{ portalDescription: "Description for guests" }}
                        className="flex flex-col gap-2"
                      >
                        <CheckboxField
                          label="Show in guest portal"
                          name="showInPortal"
                          id={`category-portal-${category.id}`}
                          defaultChecked={category.showInPortal}
                          hint="Guest groups can request this category's items that are in a condition that can be checked out, at their campus."
                        />
                        <TextAreaField
                          label="Description for guests"
                          name="portalDescription"
                          id={`category-portal-description-${category.id}`}
                          defaultValue={category.portalDescription ?? ""}
                          maxLength={1000}
                          rows={2}
                          hint="Optional. Shown above the category in the portal."
                        />
                      </ActionForm>

                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 font-semibold">
                          Subcategories of {category.name}
                        </legend>
                        {category.subcategories.map((sub) => (
                          <div key={sub.id} className="flex flex-wrap items-end gap-2">
                            <ActionForm
                              action={renameSubcategoryAction.bind(null, sub.id)}
                              submitLabel={`Save ${sub.name}`}
                              variant="secondary"
                              resetOnSuccess={false}
                              fieldLabels={{ name: "Name" }}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <TextField
                                label={`${sub.name}${sub.archivedAt ? " (archived)" : ""}, ${sub._count.items} item${sub._count.items === 1 ? "" : "s"}`}
                                name="name"
                                id={`subcategory-name-${sub.id}`}
                                defaultValue={sub.name}
                                maxLength={80}
                                required
                              />
                            </ActionForm>
                            <ActionForm
                              action={(sub.archivedAt
                                ? restoreSubcategoryAction
                                : removeSubcategoryAction
                              ).bind(null, sub.id)}
                              submitLabel={
                                sub.archivedAt
                                  ? `Restore ${sub.name}`
                                  : sub._count.items > 0
                                    ? `Archive ${sub.name}`
                                    : `Delete ${sub.name}`
                              }
                              variant={sub.archivedAt ? "secondary" : "danger"}
                              className={inline}
                            />
                          </div>
                        ))}
                        <ActionForm
                          action={createSubcategoryAction.bind(null, category.id)}
                          submitLabel={`Add to ${category.name}`}
                          variant="secondary"
                          fieldLabels={{ name: "New subcategory" }}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <TextField
                            label="New subcategory"
                            name="name"
                            id={`new-subcategory-${category.id}`}
                            maxLength={80}
                            required
                          />
                        </ActionForm>
                      </fieldset>

                      <div className="border-border flex flex-wrap gap-2 border-t pt-3">
                        {category.archivedAt ? null : (
                          <>
                            {index > 0 ? (
                              <ActionForm
                                action={moveCategoryAction.bind(null, category.id, "up")}
                                submitLabel={`Move ${category.name} up`}
                                pendingLabel="Moving…"
                                variant="secondary"
                                className={inline}
                              />
                            ) : null}
                            {index < active.length - 1 ? (
                              <ActionForm
                                action={moveCategoryAction.bind(null, category.id, "down")}
                                submitLabel={`Move ${category.name} down`}
                                pendingLabel="Moving…"
                                variant="secondary"
                                className={inline}
                              />
                            ) : null}
                          </>
                        )}
                        <ActionForm
                          action={(category.archivedAt
                            ? restoreCategoryAction
                            : removeCategoryAction
                          ).bind(null, category.id)}
                          submitLabel={
                            category.archivedAt
                              ? `Restore ${category.name}`
                              : category._count.items > 0
                                ? `Archive ${category.name}`
                                : `Delete ${category.name}`
                          }
                          variant={category.archivedAt ? "secondary" : "danger"}
                          className={inline}
                        />
                      </div>
                    </>
                  }
                />
              );
            })}
            {categories.length === 0 ? (
              <p className="text-muted p-4">No categories yet. Use Add category.</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
