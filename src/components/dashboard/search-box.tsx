"use client";

import { Search } from "lucide-react";

export function SearchBox({ compact = false }: { compact?: boolean }) {
  return <form action="/buscar" role="search" className={compact ? "km-search !w-full" : "km-search max-md:hidden"}>
    <Search size={17} className="shrink-0" aria-hidden/><input name="q" aria-label="Buscar clientes, dispositivos o préstamos" placeholder="Buscar en tu empresa…" maxLength={80}/>
  </form>;
}
