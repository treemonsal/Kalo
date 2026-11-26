import { appearance, appearanceCookie, type Appearance } from "../../lib/appearance.ts";
import { design, designCookie, darkBackground, designAssets, type Design } from "../../lib/design.ts";

const LIGHT = "#faf9f5";

let dimmed = 0;

/** Darkens a #rrggbb colour towards another by a share, like a translucent layer on top of it. */
function mix(color: string, over: string, share: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(channel(color, i) * (1 - share) + channel(over, i) * share).toString(16).padStart(2, "0")).join("");
}

/**
 * While a dialog dims the page, the browser bar and the status bar area must dim with it, otherwise a light strip
 * stays at the top. Dialogs call this when they open (true) and close (false).
 */
export function dimThemeColor(on: boolean) {
  dimmed = Math.max(0, dimmed + (on ? 1 : -1));
  syncThemeColor();
}

export function syncThemeColor() {
  const selected = appearance(document.documentElement.dataset.appearance);
  const darkColor = darkBackground(design(document.documentElement.dataset.design));
  const system = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const dark = selected === "dark" || (selected === "system" && (meta.media ? meta.media.includes("dark") : system));
    // Same values as the .sheet-dialog backdrop: black at 50 % in dark mode, ink at 25 % in light mode.
    meta.content = dimmed ? (dark ? mix(darkColor, "#000000", 0.5) : mix(LIGHT, "#141413", 0.25)) : dark ? darkColor : LIGHT;
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
