export const designCookie = "kalo-design";
export type Design = "current" | "classic";

export function design(value?: string): Design {
  return value === "classic" ? "classic" : "current";
}

export function darkBackground(value: Design) {
  return value === "classic" ? "#0a092d" : "#161513";
}

export function designAssets(value: Design) {
  return value === "current"
    ? { mark: "/kalo-brown-128.png", icon: "/kalo-brown-48.png", apple: "/kalo-brown-180.png", manifest: "/kalo-brown.webmanifest" }
    : { mark: "/kalo-mark.svg", icon: "/kalo-mark.svg", apple: "/kalo-180.png", manifest: "/kalo.webmanifest" };
}
