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
