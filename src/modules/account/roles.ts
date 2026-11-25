export const tenantRoles = {
  tenant_admin: "Administrador",
  sales: "Vendedor", branch_manager: "Encargado de sucursal", cashier: "Cajero",
  collections: "Encargado de cobros", auditor: "Auditor", mdm_operator: "Programador MDM",
};
export const accountRoles: Record<string,string> = { platform_admin: "Administrador de plataforma", ...tenantRoles };
