import { appearance, appearanceCookie, type Appearance } from "../../lib/appearance";

const DARK = "#0a092d";
const LIGHT = "#faf9f5";

export function syncThemeColor() {
  const selected = appearance(document.documentElement.dataset.appearance);
  const system = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const dark = selected === "dark" || (selected === "system" && (meta.media ? meta.media.includes("dark") : system));
    meta.content = dark ? DARK : LIGHT;
  });
}

export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.appearance = value;
  document.cookie = appearanceCookie + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax"
    + (location.protocol === "https:" ? "; Secure" : "");
  syncThemeColor();
}
