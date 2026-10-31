import {
  BarChart3, BriefcaseBusiness, Building2, CircleDollarSign, ClipboardList,
  LayoutDashboard, LockKeyhole, ReceiptText, ScrollText, Settings2, Smartphone, UserRound, Users,
} from "lucide-react";

export const navigation = [
  { label: "Inicio", href: "/", icon: LayoutDashboard, permission: null },
  { label: "Solicitudes", href: "/solicitudes", icon: ClipboardList, permission: "financing.read" },
  { label: "Clientes", href: "/clientes", icon: Users, permission: "customers.read" },
  { label: "Financiamientos", href: "/financiamientos", icon: BriefcaseBusiness, permission: "financing.read" },
  { label: "Cobros", href: "/cobros", icon: CircleDollarSign, permission: "payments.read" },
  { label: "Recibos", href: "/recibos", icon: ReceiptText, permission: "payments.read" },
  { label: "Cuadre de cajas", href: "/cajas", icon: ClipboardList, permission: "cash.read" },
  { label: "Dispositivos", href: "/dispositivos", icon: Smartphone, permission: "devices.read" },
  { label: "MDM · desactivado", href: "/mdm", icon: LockKeyhole, permission: "mdm.command" },
  { label: "Reportes", href: "/reportes", icon: BarChart3, permission: "reports.read" },
  { label: "Auditoría", href: "/auditoria", icon: ScrollText, permission: "audit.read" },
  { label: "Sucursales", href: "/sucursales", icon: Building2, permission: "branches.read" },
  { label: "Usuarios", href: "/usuarios", icon: Users, permission: "tenant.manage" },
  { label: "Mi perfil", href: "/perfil", icon: UserRound, permission: null },
  { label: "Configuración", href: "/configuracion", icon: Settings2, permission: "settings.manage" },
] as const;

export const money = (amount: number) => new Intl.NumberFormat("es-DO", {
  style: "currency", currency: "DOP", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount).replace("DOP", "RD$");
