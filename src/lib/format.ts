const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value: { toString(): string } | null | undefined): string {
  return value === null || value === undefined ? "" : money.format(Number(value.toString()));
}

/** A calendar date stored as midnight UTC, shown without shifting the day. */
export function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
