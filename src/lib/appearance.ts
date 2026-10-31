export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_KEY = "kredimax.appearance.v1";
export const DEFAULT_APPEARANCE: Appearance = "light";

export function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_APPEARANCE;
}

export function resolveAppearance(preference: Appearance, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}

// Runs before paint; the preference contains no user or financial data.
export const appearanceScript = `(function(){var p='${DEFAULT_APPEARANCE}';try{var s=localStorage.getItem('${APPEARANCE_KEY}');if(s==='light'||s==='dark'||s==='system')p=s}catch(e){}var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`;
