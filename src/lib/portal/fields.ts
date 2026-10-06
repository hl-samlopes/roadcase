/** The form field for one kind's quantity: tied to the kind, not its place on the page. */
export function quantityField(kind: { categoryId: string; key: string }): string {
  return `qty:${kind.categoryId}:${kind.key}`;
}
