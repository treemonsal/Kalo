export const appearanceCookie = "kalo-appearance";
export type Appearance = "system" | "light" | "dark";

export function appearance(value?: string): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}
