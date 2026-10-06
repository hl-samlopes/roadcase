import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import { connectionLabels, type Channel } from "./input-list";

/**
 * The input list as a PDF for the audio team, made by the worker. Written
 * with createElement (the worker runs this file without JSX). The channel
 * list also goes in the PDF's subject, so a check can compare it with the
 * screen without reading the drawn text.
 */

export interface InputListPdfInput {
  organizationName: string;
  logo: { data: Uint8Array; format: "png" | "jpg" } | null;
  colors: { text: string; muted: string; border: string; accent: string; bg: string };
  group: { name: string; campus: string; dates: string };
  needs: string[];
  channels: Channel[];
  /** Version of the list this PDF shows, printed in the footer. */
  version: number;
}

/** The PDF subject: the channels in order, e.g. "13 channels: 1 Vocal 1; 2 Vocal 2; ...". */
export function inputListSubject(channels: Channel[]): string {
  return `${channels.length} channel${channels.length === 1 ? "" : "s"}: ${channels
    .map((channel, index) => `${index + 1} ${channel.source}`)
    .join("; ")}`;
}

const COLUMNS = [
  { label: "Ch", width: 30 },
  { label: "Source", width: 150 },
  { label: "Input", width: 45 },
  { label: "Stand", width: 80 },
  { label: "Notes", width: 211 },
];

function styles(colors: InputListPdfInput["colors"]) {
  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 48,
      paddingHorizontal: 40,
      fontFamily: "Helvetica",
      fontSize: 10,
      color: colors.text,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: colors.accent,
      paddingBottom: 8,
      marginBottom: 12,
    },
    orgName: { fontFamily: "Helvetica-Bold", fontSize: 14 },
    title: { fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 2 },
    meta: { color: colors.muted, fontSize: 9, marginBottom: 2 },
    needs: { marginTop: 6, marginBottom: 10 },
    row: { flexDirection: "row" },
    cell: {
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingVertical: 3,
      paddingHorizontal: 4,
    },
    headerCell: { backgroundColor: colors.bg, fontFamily: "Helvetica-Bold" },
    table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border },
    footer: {
      position: "absolute",
      top: 792 - 32,
      left: 40,
      right: 40,
      fontSize: 8,
      color: colors.muted,
      textAlign: "right",
    },
  });
}

function inputListElement(input: InputListPdfInput): ReactElement {
  const s = styles(input.colors);
  const cell = (text: string, index: number, header = false) =>
    h(
      Text,
      {
        key: index,
        style: [s.cell, header ? s.headerCell : {}, { width: COLUMNS[index].width }],
      },
      text,
    );
  return h(
    Document,
    {
      title: `Input list: ${input.group.name}`,
      author: input.organizationName,
      subject: inputListSubject(input.channels),
    },
    h(
      Page,
      { size: "LETTER", style: s.page },
      h(
        View,
        { style: s.header },
        input.logo
          ? h(Image, {
              src: { data: Buffer.from(input.logo.data), format: input.logo.format },
              style: { height: 26 },
            })
          : h(Text, { style: s.orgName }, input.organizationName),
        h(Text, { style: s.meta }, `${input.channels.length} channels`),
      ),
      h(Text, { style: s.title }, `Input list: ${input.group.name}`),
      h(Text, { style: s.meta }, `${input.group.campus}, ${input.group.dates}`),
      input.needs.length > 0
        ? h(Text, { style: s.needs }, `Also needs: ${input.needs.join("; ")}`)
        : h(View, { style: s.needs }),
      h(
        View,
        { style: s.table },
        h(
          View,
          { style: s.row, fixed: true },
          COLUMNS.map((column, index) => cell(column.label, index, true)),
        ),
        input.channels.map((channel, index) =>
          h(
            View,
            { key: index, style: s.row, wrap: false },
            cell(String(index + 1), 0),
            cell(channel.source, 1),
            cell(connectionLabels[channel.connection], 2),
            cell(channel.stand, 3),
            cell(channel.notes, 4),
          ),
        ),
      ),
      h(Text, {
        style: s.footer,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Version ${input.version} · Page ${pageNumber} of ${totalPages}`,
      }),
    ),
  );
}

export function renderInputListPdf(input: InputListPdfInput): Promise<Buffer> {
  return renderToBuffer(inputListElement(input) as Parameters<typeof renderToBuffer>[0]);
}
