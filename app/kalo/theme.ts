import { appearance, appearanceCookie, type Appearance } from "../../lib/appearance.ts";
import { design, designCookie, darkBackground, designAssets, type Design } from "../../lib/design.ts";

const LIGHT = "#faf9f5";

export function syncThemeColor() {
  const selected = appearance(document.documentElement.dataset.appearance);
  const darkColor = darkBackground(design(document.documentElement.dataset.design));
  const system = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const dark = selected === "dark" || (selected === "system" && (meta.media ? meta.media.includes("dark") : system));
    meta.content = dark ? darkColor : LIGHT;
  });
}

export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.appearance = value;
  document.cookie = appearanceCookie + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax"
    + (location.protocol === "https:" ? "; Secure" : "");
  syncThemeColor();
}

export function applyDesign(value: Design) {
  document.documentElement.dataset.design = value;
  document.cookie = designCookie + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax"
    + (location.protocol === "https:" ? "; Secure" : "");
  syncThemeColor();
  const assets = designAssets(value);
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(link => { link.href = assets.icon; });
  document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach(link => { link.href = assets.apple; });
  document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]').forEach(link => { link.href = assets.manifest; });
}
