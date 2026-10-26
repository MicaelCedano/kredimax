import {
  BarChart3, BriefcaseBusiness, Building2, CircleDollarSign, ClipboardList,
  LayoutDashboard, LockKeyhole, ReceiptText, ScrollText, Settings2, Smartphone, UserRound, Users,
} from "lucide-react";

export const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Solicitudes", href: "/solicitudes", icon: ClipboardList },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Financiamientos", href: "/financiamientos", icon: BriefcaseBusiness },
  { label: "Cobros", href: "/cobros", icon: CircleDollarSign },
  { label: "Vouchers", href: "/recibos", icon: ReceiptText },
  { label: "Dispositivos", href: "/dispositivos", icon: Smartphone },
  { label: "MDM · desactivado", href: "/mdm", icon: LockKeyhole },
  { label: "Reportes", href: "/reportes", icon: BarChart3 },
  { label: "Auditoría", href: "/auditoria", icon: ScrollText },
  { label: "Sucursales", href: "/sucursales", icon: Building2 },
  { label: "Usuarios", href: "/usuarios", icon: Users },
  { label: "Mi perfil", href: "/perfil", icon: UserRound },
  { label: "Configuración", href: "/configuracion", icon: Settings2 },
] as const;

export const money = (amount: number) => new Intl.NumberFormat("es-DO", {
  style: "currency", currency: "DOP", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount).replace("DOP", "RD$");
