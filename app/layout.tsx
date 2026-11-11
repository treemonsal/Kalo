import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { appearance, appearanceCookie } from "../lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kalo",
  description: "Deine Karteikarten, Lernrunden und fälligen Wiederholungen.",
  applicationName: "Kalo",
  manifest: "/kalo.webmanifest",
  appleWebApp: { capable: true, title: "Kalo" },
  icons: { icon: "/kalo-mark.svg", apple: { url: "/kalo-180.png", sizes: "180x180" } },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = appearance((await cookies()).get(appearanceCookie)?.value);
  return {
    themeColor: theme === "system" ? [
      { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
      { media: "(prefers-color-scheme: dark)", color: "#0a092d" },
    ] : theme === "dark" ? "#0a092d" : "#faf9f5",
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = appearance((await cookies()).get(appearanceCookie)?.value);
  return <html lang="de-CH" data-appearance={theme}><body>{children}</body></html>;
}
