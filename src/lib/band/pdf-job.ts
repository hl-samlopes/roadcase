import "server-only";
import { getBranding } from "@/lib/branding";
import { contractOrganizationName } from "@/lib/data/contracts";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { getObjectBytes, putObject } from "@/lib/storage";
import { resolveTheme } from "@/lib/theme/resolve";
import { readChannels } from "./input-list";
import { bandNeeds } from "./needs";
import { renderInputListPdf, type InputListPdfInput } from "./pdf";

async function pdfLogo(key: string | null | undefined): Promise<InputListPdfInput["logo"]> {
  const format = key?.match(/\.(png|jpe?g)$/i)?.[1].toLowerCase();
  if (!key || !format) return null;
  try {
    return { data: await getObjectBytes(key), format: format === "png" ? "png" : "jpg" };
  } catch {
    return null;
  }
}

/**
 * Worker handler for inputlist.pdf: renders one version of a shared input
 * list and stores it. A job for an older version (staff saved again since)
 * does nothing; the newer save queued its own.
 */
export async function generateInputListPdf(payload: ParsedPayload<"inputlist.pdf">) {
  const { organizationId, inputListId, version } = payload;
  const list = await db.inputList.findFirst({
    where: { id: inputListId, organizationId },
    select: {
      id: true,
      channels: true,
      version: true,
      pdfVersion: true,
      sharedAt: true,
      guestGroup: {
        select: {
          name: true,
          arrivalDate: true,
          departureDate: true,
          campus: { select: { code: true, name: true } },
          bandSetup: {
            select: { inEarMonitors: true, clickTrack: true, expectedChannels: true, notes: true },
          },
        },
      },
    },
  });
  if (!list?.sharedAt) return { skipped: "list isn't shared" };
  if (list.version !== version) return { skipped: "a newer version was saved" };
  if (list.pdfVersion === version) return { skipped: "already made" };

  const branding = await getBranding(organizationId);
  const group = list.guestGroup;
  const [organizationName, logo] = await Promise.all([
    contractOrganizationName(organizationId),
    pdfLogo(branding?.logoLightKey ?? branding?.logoDarkKey),
  ]);
  const pdf = await renderInputListPdf({
    organizationName,
    logo,
    colors: resolveTheme(branding, null).light,
    group: {
      name: group.name,
      campus: `${group.campus.name} (${group.campus.code})`,
      dates: `${formatDate(group.arrivalDate)} to ${formatDate(group.departureDate)}`,
    },
    needs: group.bandSetup ? bandNeeds(group.bandSetup) : [],
    channels: readChannels(list.channels),
    version,
  });
  const key = `input-lists/${organizationId}/${list.id}-v${version}.pdf`;
  await putObject(key, pdf, "application/pdf");
  // Only if no newer version was saved while rendering.
  await db.inputList.updateMany({
    where: { id: list.id, version },
    data: { pdfKey: key, pdfVersion: version },
  });
  return { skipped: null };
}
