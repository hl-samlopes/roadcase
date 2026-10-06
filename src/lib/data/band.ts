import "server-only";
import { z } from "zod";
import { can, checkoutScope, type Actor } from "@/lib/authz/policy";
import type { PortalPrincipal } from "@/lib/authz/portal-policy";
import { generateInputList, readChannels, type Channel } from "@/lib/band/input-list";
import { db } from "@/lib/db";

/** A campus's band positions in order, with their inputs read and checked. */
export async function bandPositions(
  organizationId: string,
  campusId: string,
  options: { includeArchived?: boolean } = {},
) {
  const rows = await db.bandPosition.findMany({
    where: { organizationId, campusId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [
      { archivedAt: { sort: "asc", nulls: "first" } },
      { position: "asc" },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      position: true,
      inputs: true,
      archivedAt: true,
      _count: { select: { members: true } },
    },
  });
  return rows.map(({ inputs, _count, ...row }) => ({
    ...row,
    inputs: readChannels(inputs),
    used: _count.members > 0,
  }));
}

/** Campuses (not archived) where the actor edits band positions. */
export async function bandPositionCampuses(actor: Actor) {
  const campuses = await db.campus.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return campuses.filter((campus) =>
    can(actor, "bandPositions:manage", {
      organizationId: actor.organizationId,
      campusId: campus.id,
    }),
  );
}

const setupSelect = {
  id: true,
  status: true,
  expectedChannels: true,
  inEarMonitors: true,
  clickTrack: true,
  notes: true,
  submittedAt: true,
  updatedAt: true,
  members: {
    orderBy: { order: "asc" },
    select: { positionId: true, label: true, position: { select: { name: true } } },
  },
} as const;

/**
 * The input list built from a band setup: every position its players are
 * in, archived ones included, so an archived position never drops players.
 */
async function generatedList(
  organizationId: string,
  campusId: string,
  members: { positionId: string; label: string | null }[],
): Promise<Channel[]> {
  if (members.length === 0) return [];
  const positions = await bandPositions(organizationId, campusId, { includeArchived: true });
  return generateInputList(positions, members);
}

/** The group's own band setup and the input list it sees, for the portal. */
export async function portalBand(principal: PortalPrincipal) {
  const [positions, setup, list] = await Promise.all([
    bandPositions(principal.organizationId, principal.campusId),
    db.bandSetup.findFirst({
      where: { guestGroupId: principal.guestGroupId, organizationId: principal.organizationId },
      select: setupSelect,
    }),
    db.inputList.findFirst({
      where: {
        guestGroupId: principal.guestGroupId,
        organizationId: principal.organizationId,
        sharedAt: { not: null },
      },
      select: {
        channels: true,
        sharedAt: true,
        version: true,
        pdfVersion: true,
        basedOnSubmittedAt: true,
      },
    }),
  ]);
  const generated = await generatedList(
    principal.organizationId,
    principal.campusId,
    setup?.members ?? [],
  );
  return {
    positions,
    setup,
    /** Staff's shared list, if any; otherwise the preview from the setup. */
    shared: list
      ? {
          channels: readChannels(list.channels),
          pdfReady: list.pdfVersion === list.version,
          // The group sent changes after staff built this list.
          changedSince:
            !!setup?.submittedAt &&
            (!list.basedOnSubmittedAt || setup.submittedAt > list.basedOnSubmittedAt),
        }
      : null,
    generated,
  };
}

/** A group's band setup and input list for staff, or null if they can't see the group. */
export async function staffBand(actor: Actor, groupId: string) {
  if (!z.uuid().safeParse(groupId).success) return null;
  const group = await db.guestGroup.findFirst({
    where: { id: groupId, organizationId: actor.organizationId },
    select: {
      id: true,
      organizationId: true,
      campusId: true,
      name: true,
      arrivalDate: true,
      departureDate: true,
      archivedAt: true,
      campus: { select: { code: true, name: true } },
      bandSetup: { select: setupSelect },
      inputList: {
        select: {
          id: true,
          channels: true,
          basedOnSubmittedAt: true,
          editedAt: true,
          editedBy: { select: { displayName: true } },
          sharedAt: true,
          version: true,
          pdfVersion: true,
        },
      },
    },
  });
  if (!group || !can(actor, "checkout:read", checkoutScope(group))) return null;
  const { bandSetup: setup, inputList, ...rest } = group;
  // A draft is the group's own until it's sent, as with equipment requests.
  const sent = setup && setup.status === "SUBMITTED" ? setup : null;
  const generated = await generatedList(group.organizationId, group.campusId, sent?.members ?? []);
  return {
    group: rest,
    setup: sent,
    startedNotSent: !!setup && !sent,
    generated,
    list: inputList
      ? {
          ...inputList,
          channels: readChannels(inputList.channels),
          pdfReady: inputList.pdfVersion === inputList.version,
          // The group sent a newer setup than the one staff's list was built from.
          setupChanged:
            !!sent?.submittedAt &&
            (!inputList.basedOnSubmittedAt || sent.submittedAt > inputList.basedOnSubmittedAt),
        }
      : null,
  };
}

export type StaffBand = NonNullable<Awaited<ReturnType<typeof staffBand>>>;
