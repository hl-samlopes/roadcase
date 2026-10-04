import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { allowedHomes, itemFormOptions } from "@/lib/data/items";
import { createItemAction } from "../actions";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "New item" };

export default async function NewItemPage() {
  const user = await requireUser();
  const [homes, options] = await Promise.all([
    allowedHomes(user, "item:create"),
    itemFormOptions(user),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/items" className="text-accent hover:underline">
          Back to inventory
        </Link>
      </div>
      <PageHeader title="New item" />
      {homes.length === 0 ? (
        <Card>
          <p>
            You can&apos;t add items yet. Items need a location and an owning department linked to
            it, and editor access there. An admin can set these up in Settings.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-muted mb-3">
            The item gets its code (for example HNE-000123) and barcode when you save.
          </p>
          <ItemForm
            action={createItemAction}
            submitLabel="Create item"
            options={{ ...options, homes }}
            includePhoto
          />
        </Card>
      )}
    </div>
  );
}
