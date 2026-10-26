export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_KEY = "kredimax.appearance.v1";

export function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveAppearance(preference: Appearance, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}

// Runs before paint; the preference contains no user or financial data.
export const appearanceScript = `(function(){var p='system';try{p=localStorage.getItem('${APPEARANCE_KEY}')||'system'}catch(e){}var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`;
