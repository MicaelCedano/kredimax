import type { DashboardData } from "@/components/dashboard/dashboard";

export const DEFAULT_DASHBOARD_DATA: DashboardData = {
  company: "KrediMax",
  branch: "Vista de demostración",
  counts: { customers: 6, devices: 6, applications: 4, activeLoans: 1284, overdue: 87 },
  money: { activeBalance: 36_480_000, received: 11_770_000, overdue: 920_500, collectionRate: 92 },
  upcoming: [
    { customer: "María González", device: "iPhone 15 128GB", dueDate: "2026-10-25", amount: 4200, status: "pending" },
    { customer: "Carlos Méndez", device: "Samsung Galaxy S24", dueDate: "2026-10-25", amount: 3850, status: "pending" },
    { customer: "Ana Rodríguez", device: "Xiaomi Redmi Note 13", dueDate: "2026-10-26", amount: 2900, status: "pending" },
    { customer: "Luis Peralta", device: "iPhone 14 256GB", dueDate: "2026-10-27", amount: 5200, status: "pending" },
  ],
  recent: [
    { title: "Pago registrado", detail: "María González", date: "2026-10-20T14:24:00-04:00", amount: 4200 },
    { title: "Nueva solicitud", detail: "Carlos Méndez · iPhone 15", date: "2026-10-20T13:18:00-04:00", amount: null },
    { title: "Dispositivo inscrito", detail: "Ana Rodríguez · Galaxy S24", date: "2026-10-19T16:32:00-04:00", amount: null },
  ],
  chart: [
    { month: "nov", amount: 27 }, { month: "dic", amount: 30 }, { month: "ene", amount: 34 },
    { month: "feb", amount: 40 }, { month: "mar", amount: 42 }, { month: "abr", amount: 43 },
    { month: "may", amount: 48 }, { month: "jun", amount: 50 }, { month: "jul", amount: 45 },
    { month: "ago", amount: 52 }, { month: "sep", amount: 58 }, { month: "oct", amount: 61 },
  ],
};
