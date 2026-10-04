/**
 * CSV for spreadsheet apps. Cells that a spreadsheet could run as a formula
 * (starting with =, +, -, @, tab or carriage return) get a leading apostrophe.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: unknown[][]): string {
  // A byte-order mark makes Excel read the file as UTF-8.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
