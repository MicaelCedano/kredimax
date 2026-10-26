import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { redirect } from "next/navigation";
import { Bell, CalendarClock, Check, CircleAlert } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { addIsoCalendarDays, BUSINESS_TIME_ZONE, dateOnlyValue, isoDateInTimeZone } from "@/lib/business-date";
import { decimalToCents, formatDopCents } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markNotificationRead } from "@/modules/notifications/actions";

const dateTime = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "medium", timeZone: BUSINESS_TIME_ZONE,
});

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ estado?: string; page?: string }> }) {
  const [{ estado, page: pageParam }, supabase] = await Promise.all([searchParams, createSupabaseServerClient()]);
  const [{ data: claims }, access] = await Promise.all([supabase.auth.getClaims(), getTenantAccess("payments.read")]);
  const userId = claims?.claims?.sub;
  if (!userId || (!access.ok && access.reason === "unauthenticated")) redirect("/login");

  const noticePage = Math.max(1, Math.min(100_000, Number.parseInt(pageParam ?? "1", 10) || 1));
  const noticePageSize = 50;
  const { data: notices, error: notificationError, count: noticeCount } = await supabase.from("notifications")
    .select("id,title,body,category,read_at,created_at", { count: "exact" })
    .eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((noticePage - 1) * noticePageSize, noticePage * noticePageSize - 1);
  const noticePages = Math.max(1, Math.ceil((noticeCount ?? 0) / noticePageSize));

  let dueAlerts: { loanId: string; customer: string; sequence: number; dueDate: string; balance: bigint }[] = [];
  let dueError = false;
  if (access.ok) {
    const fromDate = isoDateInTimeZone(new Date());
    const throughDate = addIsoCalendarDays(fromDate, 7);
    const installmentRows = [];
    const pageSize = 200;
    for (let offset = 0; ; offset += pageSize) {
      const page = await access.supabase.from("installments")
        .select("id,loan_id,sequence,due_date,amount_due,amount_paid,status")
        .eq("tenant_id", access.membership.tenant_id)
        .in("status", ["pending", "partial", "overdue"])
        .gte("due_date", fromDate).lte("due_date", throughDate)
        .order("due_date", { ascending: true }).order("loan_id", { ascending: true }).order("sequence", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (page.error) {
        dueError = true;
        break;
      }
      installmentRows.push(...(page.data ?? []));
      if ((page.data ?? []).length < pageSize) break;
    }

    if (!dueError && installmentRows.length) {
      try {
        const loanIds = [...new Set(installmentRows.map((row) => row.loan_id))];
        const { data: loans, error: loansError } = await access.supabase.from("loans")
          .select("id,customer_id,status").eq("tenant_id", access.membership.tenant_id)
          .eq("status", "active").in("id", loanIds);
        if (loansError) throw loansError;
        const loanMap = new Map((loans ?? []).map((loan) => [loan.id, loan]));
        const customerIds = [...new Set((loans ?? []).map((loan) => loan.customer_id))];
        const { data: customers, error: customersError } = customerIds.length
          ? await access.supabase.from("customers").select("id,full_name").eq("tenant_id", access.membership.tenant_id).in("id", customerIds)
          : { data: [], error: null };
        if (customersError) throw customersError;
        const customerNames = new Map((customers ?? []).map((customer) => [customer.id, customer.full_name]));
        dueAlerts = installmentRows.flatMap((row) => {
          const loan = loanMap.get(row.loan_id);
          if (!loan) return [];
          const balance = decimalToCents(row.amount_due) - decimalToCents(row.amount_paid);
          if (balance <= 0n) return [];
          return [{
            loanId: loan.id,
            customer: customerNames.get(loan.customer_id) ?? "Cliente",
            sequence: row.sequence,
            dueDate: row.due_date,
            balance,
          }];
        });
      } catch {
        dueError = true;
      }
    }
  }

  const noSelectedTenant = access.reason === "tenant-selection-required";
  const noMembership = !access.ok && access.reason === "no-membership";
  const tenantSuspended = !access.ok && access.reason === "tenant-suspended";
  const noDuePermission = !access.ok && access.reason === "forbidden";
  const noDueService = !access.ok && access.reason === "unavailable";
  const today = isoDateInTimeZone(new Date());

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[.14em] text-accent">Cuenta · Avisos</p><h1 className="mt-1 flex items-center gap-2 text-[26px] font-bold text-ink"><Bell size={22}/>Notificaciones</h1><p className="mt-1 text-sm text-muted">Avisos de tu cuenta y cuotas próximas a vencer.</p></div>
    {estado === "read" && <p role="status" className="mb-4 rounded-lg border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive">Notificación marcada como leída.</p>}
    {(estado === "error" || estado === "invalid") && <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">No se pudo actualizar la notificación.</p>}

    <section aria-labelledby="due-alerts-heading" className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 id="due-alerts-heading" className="flex items-center gap-2 text-base font-bold text-ink"><CalendarClock size={18} className="text-warning"/>Vencimientos próximos</h2><p className="mt-1 text-xs text-muted">Cuotas con saldo que vencen hoy o durante los próximos siete días.</p></div>{access.ok && !dueError && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">{dueAlerts.length} {dueAlerts.length === 1 ? "cuota" : "cuotas"}</span>}</div>
      {noSelectedTenant ? <p role="status" className="rounded-xl border border-accent-line bg-accent-soft p-4 text-sm text-accent">Selecciona una empresa para consultar sus vencimientos.</p>
        : noMembership ? <p role="status" className="rounded-xl border border-line bg-surface p-4 text-sm text-secondary">No hay una membresía activa para consultar vencimientos.</p>
          : tenantSuspended ? <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">La empresa está suspendida; no se consultan sus vencimientos.</p>
        : noDuePermission ? <p role="status" className="rounded-xl border border-line bg-surface p-4 text-sm text-secondary">Tu rol no tiene permiso para consultar vencimientos.</p>
          : noDueService || dueError ? <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning"><CircleAlert size={17} className="mt-0.5 shrink-0"/>No se pudieron consultar los vencimientos de tu sucursal. Inténtalo de nuevo más tarde.</p>
            : dueAlerts.length ? <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">{dueAlerts.map((alert) => <li key={`${alert.loanId}-${alert.sequence}`} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{alert.customer} · cuota {alert.sequence}</p><p className="mt-1 text-xs text-muted">{alert.dueDate === today ? "Vence hoy" : `Vence el ${dateTime.format(dateOnlyValue(alert.dueDate))}`}</p></div><div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end"><span className="text-sm font-bold tabular-nums text-warning">{formatDopCents(alert.balance)}</span><Link href={`/financiamientos/${alert.loanId}`} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft">Ver estado</Link></div></li>)}</ul>
              : <div className="rounded-xl border border-line bg-surface p-5 text-sm text-secondary">No hay cuotas con saldo que venzan dentro de los próximos siete días.</div>}
    </section>

    <section aria-labelledby="account-notices-heading">
      <div className="mb-3"><h2 id="account-notices-heading" className="text-base font-bold text-ink">Avisos de tu cuenta</h2><p className="mt-1 text-xs text-muted">{(noticeCount ?? 0).toLocaleString("es-DO")} avisos dirigidos a tu usuario.</p></div>
      {notificationError ? <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-5 text-sm text-warning">No se pudieron cargar los avisos de tu cuenta.</p> : notices?.length ? <><section className="km-panel divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">{notices.map((item) => <article key={item.id} className={`flex items-start gap-4 p-5 ${item.read_at ? "" : "bg-accent-soft/50"}`}><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.read_at ? "bg-soft text-muted" : "bg-accent-soft text-accent"}`}><Bell size={16}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-ink">{item.title}</h3>{!item.read_at && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">Nueva</span>}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-secondary">{item.body}</p><p className="mt-2 text-xs text-muted">{item.category} · {dateTime.format(new Date(item.created_at))}</p></div>{!item.read_at && <form action={markNotificationRead}><input type="hidden" name="notificationId" value={item.id}/><SubmitButton aria-label={`Marcar ${item.title} como leída`} title="Marcar como leída" className="rounded-lg border border-line bg-surface p-2 text-secondary hover:bg-subtle"><Check size={16}/></SubmitButton></form>}</article>)}</section><nav aria-label="Paginación de avisos" className="mt-2 flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-xs"><Link aria-disabled={noticePage <= 1} className={noticePage <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/notificaciones?page=${Math.max(1, noticePage - 1)}`}>Anterior</Link><span>Página {noticePage} de {noticePages}</span><Link aria-disabled={noticePage >= noticePages} className={noticePage >= noticePages ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/notificaciones?page=${Math.min(noticePages, noticePage + 1)}`}>Siguiente</Link></nav></> : <section className="km-panel rounded-xl border border-line bg-surface px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent"><Bell size={20}/></span><h3 className="mt-3 text-sm font-bold text-ink">No tienes avisos guardados</h3><p className="mt-1 text-xs text-muted">Los avisos dirigidos a tu cuenta aparecerán aquí.</p></section>}
    </section>
    <p className="mt-4 text-xs text-muted">Los vencimientos se consultan en vivo, limitados por empresa, sucursal y permiso. Esta vista no envía notificaciones push ni correo.</p>
  </main></div>;
}
