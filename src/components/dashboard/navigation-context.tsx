"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type NavigationAccess = { role: string; permissions: string[] } | null;
const NavigationContext = createContext<{
  access: NavigationAccess;
  setAccess: (access: NavigationAccess) => void;
}>({ access: null, setAccess: () => undefined });

// This only controls navigation visibility. Server authorization remains authoritative.
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<NavigationAccess>(null);
  return <NavigationContext value={{ access, setAccess }}>{children}</NavigationContext>;
}

export function useNavigationAccess() {
  const { access, setAccess } = useContext(NavigationContext);
  const can = (permission?: string | null) => !permission || access === null || access.permissions.includes(permission);
  return { can, setAccess };
}

export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useNavigationAccess();
  return can(permission) ? children : null;
}
