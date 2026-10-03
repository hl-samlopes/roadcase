import type { Metadata } from "next";
import { Inter, Krub, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import { brandingAssetUrl, displayName } from "@/lib/branding";
import { getThemeContext } from "@/lib/theme/context";
import { themeCss } from "@/lib/theme/resolve";
import "./globals.css";

// The default pairing is preloaded; the alternates load only when chosen.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["700"] });
const krub = Krub({ variable: "--font-krub", subsets: ["latin"], weight: ["400", "600"] });
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["700"],
  preload: false,
});
const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
  preload: false,
});

const fontVariables = [inter, krub, spaceMono, plusJakartaSans].map((f) => f.variable).join(" ");

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getThemeContext();
  const name = displayName(branding);
  const favicon = brandingAssetUrl(branding?.faviconKey);
  return {
    title: { template: `%s · ${name}`, default: name },
    description: "Production equipment inventory, service and check-out.",
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme } = await getThemeContext();
  return (
    <html
      lang="en"
      data-theme={theme.mode === "system" ? undefined : theme.mode}
      className={`${fontVariables} h-full antialiased`}
    >
      <head>
        {/* Rendered on the server so the chosen theme applies before first paint. */}
        <style id="roadcase-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
