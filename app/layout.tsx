import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { appearance, appearanceCookie } from "../lib/appearance";
import { design, designCookie, darkBackground, designAssets } from "../lib/design";
import "./globals.css";
import "./styles/learning.css";
import "./styles/screens.css";
import "./classic-design.css";

export async function generateMetadata(): Promise<Metadata> {
  const preferences = await cookies();
  const assets = designAssets(design(preferences.get(designCookie)?.value));
  return {
    title: "Kalo",
    description: "Deine Karteikarten, Lernrunden und fälligen Wiederholungen.",
    applicationName: "Kalo",
    manifest: assets.manifest,
    appleWebApp: { capable: true, title: "Kalo" },
    icons: { icon: assets.icon, apple: { url: assets.apple, sizes: "180x180" } },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const preferences = await cookies();
  const theme = appearance(preferences.get(appearanceCookie)?.value);
  const darkColor = darkBackground(design(preferences.get(designCookie)?.value));
  return {
    themeColor: theme === "system" ? [
      { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
      { media: "(prefers-color-scheme: dark)", color: darkColor },
    ] : theme === "dark" ? darkColor : "#faf9f5",
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preferences = await cookies();
  const theme = appearance(preferences.get(appearanceCookie)?.value);
  const selectedDesign = design(preferences.get(designCookie)?.value);
  return <html lang="de-CH" data-appearance={theme} data-design={selectedDesign}><body>{children}</body></html>;
}
