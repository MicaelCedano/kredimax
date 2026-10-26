import { NextRequest, NextResponse } from "next/server";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { paymentExportHeader, paymentExportRows, type PaymentExport } from "@/lib/reports/payment-detail-csv";

function dateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const access = await getTenantAccess("reports.read");
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.reason === "unauthenticated" ? 401 : 403 });

  const format = request.nextUrl.searchParams.get("format");
  if (format && format !== "payments" && format !== "reconciliation") return NextResponse.json({ error: "INVALID_REPORT_FORMAT" }, { status: 400 });

  const from = dateParam(request.nextUrl.searchParams.get("from"));
  const to = dateParam(request.nextUrl.searchParams.get("to"));
  if (!from || !to || to < from || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 3660 * 86_400_000) {
    return NextResponse.json({ error: "INVALID_REPORT_RANGE" }, { status: 400 });
  }

  if (format === "payments") {
    const paymentAccess = await getTenantAccess("payments.read");
    if (!paymentAccess.ok || paymentAccess.membership.tenant_id !== access.membership.tenant_id) {
      return NextResponse.json({ error: paymentAccess.ok ? "TENANT_SELECTION_CHANGED" : paymentAccess.reason }, { status: 403 });
    }
    const { data, error } = await paymentAccess.supabase.rpc("tenant_report_payment_details", {
      p_tenant_id: paymentAccess.membership.tenant_id,
      p_from_date: from,
      p_to_date: to,
    });
    if (error || !Array.isArray(data)) return NextResponse.json({ error: "REPORT_UNAVAILABLE" }, { status: 403 });

    const payments = data as PaymentExport[];
    let paymentIndex = 0;
    let currentRows: string[] = [];
    let rowIndex = 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`\uFEFF${paymentExportHeader()}`));
      },
      pull(controller) {
        while (rowIndex >= currentRows.length && paymentIndex < payments.length) {
          currentRows = paymentExportRows([payments[paymentIndex]]);
          paymentIndex += 1;
          rowIndex = 0;
        }
        if (rowIndex >= currentRows.length) {
          controller.close();
          return;
        }
        const chunk = currentRows.slice(rowIndex, rowIndex + 100).join("");
        rowIndex += 100;
        controller.enqueue(encoder.encode(chunk));
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kredimax-cobros-${from}-${to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (format === "reconciliation") {
    const paymentAccess = await getTenantAccess("payments.read");
    if (!paymentAccess.ok || paymentAccess.membership.tenant_id !== access.membership.tenant_id) {
      return NextResponse.json({ error: paymentAccess.ok ? "TENANT_SELECTION_CHANGED" : paymentAccess.reason }, { status: 403 });
    }
    const { data, error } = await paymentAccess.supabase.rpc("tenant_payment_reconciliation", {
      p_tenant_id: paymentAccess.membership.tenant_id,
      p_from_date: from,
      p_to_date: to,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ error: "REPORT_UNAVAILABLE" }, { status: 403 });
    }
    const reconciliation = data as Record<string, string | number>;
    const rows: [string, string | number][] = [
      ["Desde", from], ["Hasta", to], ["Pagos verificados", reconciliation.paymentCount ?? 0],
      ["Pagos vigentes", reconciliation.activePaymentCount ?? 0], ["Pagos revertidos", reconciliation.reversedPaymentCount ?? 0],
      ["Neto esperado", reconciliation.expectedLedgerNet ?? "0"], ["Neto en libro", reconciliation.actualLedgerNet ?? "0"],
      ["Diferencia neta", reconciliation.ledgerDifference ?? "0"], ["Asientos de cobro distintos", reconciliation.receiptMismatchCount ?? 0],
      ["Distribuciones distintas", reconciliation.allocationMismatchCount ?? 0], ["Reversos distintos", reconciliation.reversalMismatchCount ?? 0],
      ["Alcance", reconciliation.scope ?? ""], ["Interpretación", reconciliation.interpretation ?? ""],
    ];
    const body = ["Métrica,Valor", ...rows.map(([label, value]) => `${csvCell(label)},${csvCell(value)}`)].join("\r\n");
    return new NextResponse(`\uFEFF${body}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="conciliacion-interna-kredimax-${from}-${to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const { data, error } = await access.supabase.rpc("tenant_report_summary", {
    p_tenant_id: access.membership.tenant_id,
    p_from_date: from,
    p_to_date: to,
  });
  if (error || !data) return NextResponse.json({ error: "REPORT_UNAVAILABLE" }, { status: 403 });

  const report = data as Record<string, string | number>;
  const rows: [string, string | number][] = [
    ["Desde", from], ["Hasta", to], ["Clientes actuales", report.customers ?? 0], ["Dispositivos actuales", report.devices ?? 0],
    ["Solicitudes en período", report.applications ?? 0], ["Financiamientos activos", report.activeLoans ?? 0],
    ["Saldo de cuotas del período", report.openReceivable ?? 0], ["Pagos netos en período", report.paymentsReceived ?? 0],
    ["Cuotas vencidas en período", report.overdueInstallments ?? 0], ["Saldo vencido en período", report.overdueBalance ?? 0],
    ["Fecha de corte", report.asOfDate ?? to],
  ];
  const body = ["Métrica,Valor", ...rows.map(([label, value]) => `${csvCell(label)},${csvCell(value)}`)].join("\r\n");
  return new NextResponse(`\uFEFF${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-kredimax-${from}-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
