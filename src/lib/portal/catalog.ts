/**
 * The guest portal catalog, kept pure so it can be tested without a
 * database. Guests request kinds of items, not particular items: a kind is
 * the items in one category with the same name (ignoring case and extra
 * spaces). Staff pick the actual items when they approve.
 */

export const MAX_QUANTITY = 999;

/** The kind an item belongs to within its category. */
export function kindKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Map key for a kind across categories. */
export function kindId(categoryId: string, key: string): string {
  return `${categoryId}\u0000${key}`;
}

export interface CatalogCategoryInput {
  id: string;
  name: string;
  description: string | null;
}

/** An item that could go to guests: in a portal category and a check-out condition. */
export interface CatalogItemInput {
  id: string;
  name: string;
  categoryId: string;
  photoId: string | null;
  /** On a check-out whose dates overlap the group's visit. */
  held: boolean;
}

export interface CatalogKind {
  categoryId: string;
  key: string;
  name: string;
  /** Items of this kind in a condition that can go out. */
  total: number;
  /** What's free for the group's dates. */
  available: number;
  photoId: string | null;
}

export interface CatalogSection {
  category: CatalogCategoryInput;
  kinds: CatalogKind[];
}

/**
 * Groups items into kinds by category, in the categories' order. A kind's
 * availability is its items minus those held by overlapping check-outs and
 * the quantities other groups were approved for overlapping dates
 * (`reserved`, keyed by `kindId`). Categories without items are left out.
 */
export function buildCatalog(
  categories: CatalogCategoryInput[],
  items: CatalogItemInput[],
  reserved: Map<string, number> = new Map(),
): CatalogSection[] {
  const kinds = new Map<string, CatalogKind & { free: number }>();
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = kindKey(item.name);
    if (!key) continue;
    const id = kindId(item.categoryId, key);
    const kind = kinds.get(id) ?? {
      categoryId: item.categoryId,
      key,
      name: item.name.trim().replace(/\s+/g, " "),
      total: 0,
      available: 0,
      free: 0,
      photoId: null,
    };
    kind.total += 1;
    if (!item.held) kind.free += 1;
    kind.photoId ??= item.photoId;
    kinds.set(id, kind);
  }
  return categories.flatMap((category) => {
    const list = [...kinds.entries()]
      .filter(([, kind]) => kind.categoryId === category.id)
      .map(([id, { free, ...kind }]) => ({
        ...kind,
        available: Math.max(0, free - (reserved.get(id) ?? 0)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return list.length > 0 ? [{ category, kinds: list }] : [];
  });
}

/** A quantity field: blank is 0; anything else must be a whole number in range. */
export function parseQuantity(raw: FormDataEntryValue | null): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return 0;
  if (!/^\d{1,4}$/.test(text)) return null;
  const value = Number(text);
  return value <= MAX_QUANTITY ? value : null;
}
