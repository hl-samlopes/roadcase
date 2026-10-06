/**
 * Seed data for the first organization. This is data, not branding: the
 * organization's look is set later in Settings > Appearance, and the seeded
 * branding row is empty so the Roadcase defaults apply.
 */

export const organization = {
  name: "Hume",
  slug: "hume",
};

export const campuses = [
  { code: "HLK", name: "Hume Lake" },
  { code: "HNE", name: "Hume New England" },
  { code: "HSC", name: "Hume SoCal" },
];

export const categories: { name: string; subcategories: string[] }[] = [
  {
    name: "Audio",
    subcategories: ["Microphones", "Speakers", "Mixers", "Monitors", "Wireless systems"],
  },
  {
    name: "Lighting",
    subcategories: ["Fixtures", "Consoles", "Dimmers and power", "Effects"],
  },
  {
    name: "Video",
    subcategories: ["Cameras", "Projectors", "Displays", "Switchers"],
  },
  {
    name: "Staging",
    subcategories: ["Risers", "Truss", "Drape", "Rigging"],
  },
  {
    name: "Cabling",
    subcategories: ["Audio cables", "Power cables", "DMX cables", "Video cables", "Network cables"],
  },
];

/** Starting item conditions; organizations edit these in Settings. */
export const itemConditions: {
  label: string;
  isDefault?: boolean;
  startsRepairTicket?: boolean;
  availableForCheckout?: boolean;
}[] = [
  { label: "New", availableForCheckout: true },
  { label: "Good", isDefault: true, availableForCheckout: true },
  { label: "Fair", availableForCheckout: true },
  { label: "Poor" },
  { label: "Needs repair", startsRepairTicket: true },
  { label: "Out of service" },
  { label: "Retired" },
];
