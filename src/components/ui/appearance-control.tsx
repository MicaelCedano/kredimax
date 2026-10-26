"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { APPEARANCE_KEY, parseAppearance, resolveAppearance, type Appearance } from "@/lib/appearance";

const eventName = "kredimax:appearance";
let volatilePreference: Appearance | null = null;
function getSnapshot(): Appearance {
  if (volatilePreference) return volatilePreference;
  try { return parseAppearance(localStorage.getItem(APPEARANCE_KEY)); }
  catch { return volatilePreference ?? "system"; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
}
const serverSnapshot = (): Appearance => "system";
function updateAppearance(value: Appearance) {
  try { localStorage.setItem(APPEARANCE_KEY, value); volatilePreference = null; }
  catch { volatilePreference = value; }
  document.documentElement.dataset.theme = resolveAppearance(value, window.matchMedia("(prefers-color-scheme: dark)").matches);
  window.dispatchEvent(new Event(eventName));
}
const options = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const;

export function AppearanceSync() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = resolveAppearance(preference, media.matches); };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return null;
}

export function AppearanceControl({ expanded = false }: { expanded?: boolean }) {
  const preference = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const selected = options.find((option) => option.value === preference)!;
  if (expanded) return <div className="km-theme-control grid grid-cols-3 gap-2 rounded-2xl bg-subtle p-1.5" role="group" aria-label="Apariencia de KrediMax">
    {options.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={preference === value} onClick={() => updateAppearance(value)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium ${preference === value ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-ink"}`}><Icon size={17} aria-hidden/>{label}</button>)}
  </div>;
  return <label className="km-theme-control relative grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-secondary hover:bg-subtle" title={`Apariencia: ${selected.label}`}>
    <selected.Icon size={18} aria-hidden/>
    <select aria-label="Apariencia" value={preference} onChange={(event) => updateAppearance(event.target.value as Appearance)} className="absolute inset-0 w-full cursor-pointer opacity-0">
      {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>;
}
