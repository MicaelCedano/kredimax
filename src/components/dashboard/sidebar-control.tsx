"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSyncExternalStore } from "react";

const storageKey = "kredimax.sidebar.v1";
const eventName = "kredimax:sidebar";
const getSnapshot = () => document.documentElement.dataset.sidebar === "collapsed";
const getServerSnapshot = () => false;
function subscribe(callback: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    try { document.documentElement.dataset.sidebar = localStorage.getItem(storageKey) === "collapsed" ? "collapsed" : "expanded"; } catch { /* Preserve the current layout. */ }
    callback();
  };
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", sync);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("storage", sync); };
}

export function SidebarControl() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = collapsed ? "Expandir barra lateral" : "Colapsar barra lateral";
  return <button type="button" className="km-sidebar-toggle km-icon-button" title={label} aria-label={label} aria-controls="desktop-navigation" aria-expanded={!collapsed} onClick={() => {
    const next = !getSnapshot() ? "collapsed" : "expanded";
    document.documentElement.dataset.sidebar = next;
    try { localStorage.setItem(storageKey, next); } catch { /* The control works without storage. */ }
    window.dispatchEvent(new Event(eventName));
  }}>{collapsed ? <PanelLeftOpen size={17} aria-hidden/> : <PanelLeftClose size={17} aria-hidden/>}</button>;
}
