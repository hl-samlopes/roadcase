import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, SelectField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { allowedHomes, getItem, itemFormOptions } from "@/lib/data/items";
import { MAX_BULK_ITEMS } from "@/lib/items/bulk";
import { bulkEditAction } from "../bulk-actions";

export const metadata: Metadata = { title: "Edit selected items" };

/** Reached from the inventory list's "Edit selected" button with the ticked items' ids. */
export default async function BulkEditPage({ searchParams }: PageProps<"/items/bulk-edit">) {
  const actor = await requireUser();
  const raw = (await searchParams).id;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, MAX_BULK_ITEMS);
  const [found, options, homes] = await Promise.all([
    Promise.all(ids.map((id) => getItem(actor, id))),
    itemFormOptions(actor),
    allowedHomes(actor, "item:update"),
  ]);
  const items = found.filter(
    (item): item is NonNullable<typeof item> => !!item && can(actor, "item:update", item),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/items" className="text-accent hover:underline">
          Back to inventory
        </Link>
      </div>
      <PageHeader title="Edit selected items" />
      {items.length === 0 ? (
        <p>
          None of the selected items can be edited by you. Tick items in the inventory list, then
          use Edit selected.
        </p>
      ) : (
        <>
          <Card title={`${items.length} item${items.length === 1 ? "" : "s"}`}>
            <ul className="flex flex-wrap gap-2">
              {items.map((item) => (
                <li key={item.id} className="border-border rounded-theme border px-2">
                  <span className="font-mono">{item.code}</span> {item.name}
                </li>
              ))}
            </ul>
            {ids.length > items.length ? (
              <p className="text-muted mt-2">
                {ids.length - items.length} other selected item
                {ids.length - items.length === 1 ? " isn't" : "s aren't"} listed because you
                can&apos;t edit {ids.length - items.length === 1 ? "it" : "them"}.
              </p>
            ) : null}
          </Card>
          <Card title="Change">
            <p className="text-muted mb-3">
              Fields left on &ldquo;Keep&rdquo; don&apos;t change. A condition that starts a repair
              ticket opens one for each item that doesn&apos;t already have an open ticket.
            </p>
            <ActionForm
              action={bulkEditAction}
              submitLabel={`Save changes to ${items.length} item${items.length === 1 ? "" : "s"}`}
              pendingLabel="Saving…"
              resetOnSuccess={false}
              fieldLabels={{ category: "Category", home: "Home", condition: "Condition" }}
            >
              {items.map((item) => (
                <input key={item.id} type="hidden" name="id" value={item.id} />
              ))}
              <SelectField label="Category" name="category" id="bulk-category" defaultValue="">
                <option value="">Keep each item&apos;s category</option>
                {options.categories.map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    <option value={category.id}>{category.name} (no subcategory)</option>
                    {category.subcategories.map((sub) => (
                      <option key={sub.id} value={`${category.id}:${sub.id}`}>
                        {category.name} / {sub.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectField>
              <SelectField label="Home" name="home" id="bulk-home" defaultValue="">
                <option value="">Keep each item&apos;s home</option>
                {homes.map((home) => (
                  <option key={home.value} value={home.value}>
                    {home.campusLabel}: {home.label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Condition" name="condition" id="bulk-condition" defaultValue="">
                <option value="">Keep each item&apos;s condition</option>
                {options.conditions.map((condition) => (
                  <option key={condition.id} value={condition.id}>
                    {condition.label}
                  </option>
                ))}
              </SelectField>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}
