export const appearanceCookie = "kalo-appearance";
export type Appearance = "system" | "light" | "dark";

export function appearance(value?: string): Appearance {
  // Dark is Kalo's main mode; light and system are choices.
  return value === "light" || value === "system" ? value : "dark";
}
