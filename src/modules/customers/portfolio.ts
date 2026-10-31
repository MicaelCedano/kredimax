import { z } from "zod";

export type PortfolioSeller = { id: string; name: string };

export function portfolioFilter(value: string | undefined, defaultValue = "") {
  if (value === undefined) return defaultValue;
  return value === "unassigned" || z.string().uuid().safeParse(value).success ? value : "";
}

export function responsibleLabel(id: string | null, name: string | null) {
  return id ? name || "Usuario registrado" : "Sin responsable · registro anterior";
}
