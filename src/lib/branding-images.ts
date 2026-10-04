/** Branding images an organization admin can upload, with their limits. */
export const brandingImages = {
  logoLight: {
    field: "logoLightKey",
    label: "Logo for light mode",
    maxBytes: 2 * 1024 * 1024,
    hint: "PNG, JPEG or WebP up to 2 MB. Shown in the sidebar and on the sign-in page.",
  },
  logoDark: {
    field: "logoDarkKey",
    label: "Logo for dark mode",
    maxBytes: 2 * 1024 * 1024,
    hint: "Optional. Used in dark mode; the light logo is used if this is empty.",
  },
  favicon: {
    field: "faviconKey",
    label: "Favicon",
    maxBytes: 512 * 1024,
    hint: "Square PNG up to 512 KB, shown in browser tabs.",
  },
  appBackground: {
    field: "appBackgroundKey",
    label: "App background",
    maxBytes: 5 * 1024 * 1024,
    hint: "Optional. Shown behind pages, dimmed so text stays readable. Up to 5 MB.",
  },
  signInBackground: {
    field: "signInBackgroundKey",
    label: "Sign-in background",
    maxBytes: 5 * 1024 * 1024,
    hint: "Optional. Shown behind the sign-in card. Up to 5 MB.",
  },
} as const;

export type BrandingImageKind = keyof typeof brandingImages;
export const brandingImageKinds = Object.keys(brandingImages) as BrandingImageKind[];
