/**
 * Whether an item can go on a check-out, and if not, why, in words staff can
 * act on. Pure: callers load the item and any check-out already holding it.
 * Permission (manage the check-out, see the item, same campus) comes first
 * and is decided by the authz layer.
 */

export interface AvailabilityItem {
  code: string;
  name: string;
  condition: { label: string; availableForCheckout: boolean };
  /** The active check-out line holding the item, if any. */
  heldBy: { checkoutId: string; number: number; groupName: string } | null;
}

export type Refusal =
  | { reason: "not-found" }
  | { reason: "other-campus"; campusCode: string }
  | { reason: "condition"; condition: string }
  | { reason: "already-added" }
  | { reason: "on-checkout"; number: number; groupName: string };

export function availability(item: AvailabilityItem, checkoutId: string): Refusal | null {
  if (item.heldBy) {
    return item.heldBy.checkoutId === checkoutId
      ? { reason: "already-added" }
      : { reason: "on-checkout", number: item.heldBy.number, groupName: item.heldBy.groupName };
  }
  if (!item.condition.availableForCheckout) {
    return { reason: "condition", condition: item.condition.label };
  }
  return null;
}

export function refusalMessage(refusal: Refusal): string {
  switch (refusal.reason) {
    case "not-found":
      return "No item you can see has this code.";
    case "other-campus":
      return `It belongs to ${refusal.campusCode}; a check-out takes items from its own campus only.`;
    case "condition":
      return `Its condition, ${refusal.condition}, isn't available for check-out.`;
    case "already-added":
      return "It's already on this check-out.";
    case "on-checkout":
      return `It's on check-out #${refusal.number} (${refusal.groupName}).`;
  }
}

/** Codes from a scan or a pasted list: split on spaces, commas or new lines, uppercased, deduplicated. */
export function parseCodes(input: string, max = 100): string[] {
  const codes = input
    .split(/[\s,;]+/)
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0 && code.length <= 40);
  return [...new Set(codes)].slice(0, max);
}
