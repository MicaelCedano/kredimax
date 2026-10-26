"use client";

import { MapPin } from "lucide-react";

type TenantChoice = { id: string; name: string; branchId: string | null; branchName: string | null; role: string };

export function CompanyContext({ tenantChoices, selectedTenant, organization, branch, onTenantChange }: {
  tenantChoices: TenantChoice[];
  selectedTenant: string;
  organization: string;
  branch: string;
  onTenantChange: (tenantId: string) => void;
}) {
  return <div className="hidden h-11 max-w-[290px] min-w-0 items-center gap-2 rounded-2xl border border-line px-3 text-[12px] text-secondary sm:flex"><MapPin size={15} className="shrink-0"/>{tenantChoices.length > 1 ? <><select aria-label="Empresa activa" value={selectedTenant} onChange={(event) => onTenantChange(event.target.value)} className="max-w-36 bg-transparent text-xs outline-none"><option value="">Selecciona empresa</option>{tenantChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select><span aria-label={`Sucursal activa: ${branch}`} title={`Sucursal activa: ${branch}`} className="max-w-36 truncate border-l border-line pl-2 text-[11px] text-muted">{branch}</span></> : <span className="truncate" title={`${organization} · ${branch}`}>{organization} · {branch}</span>}</div>;
}

