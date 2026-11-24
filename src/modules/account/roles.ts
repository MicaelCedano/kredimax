export const operationalRoles = {
  sales: "Vendedor", branch_manager: "Encargado de sucursal", cashier: "Cajero",
  collections: "Encargado de cobros", auditor: "Auditor", mdm_operator: "Programador MDM",
};
export const accountRoles: Record<string,string> = { tenant_admin: "Administrador", platform_admin: "Administrador de plataforma", ...operationalRoles };
