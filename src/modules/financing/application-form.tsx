"use client";

import Link from "next/link";
import { PanelHeading } from "@/components/ui/panel-heading";
import { MoneyInput } from "@/components/forms/money-input";
import { Fragment, useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardList, Gauge, ShieldAlert, Smartphone, UserRound } from "lucide-react";
import { calculateFinancingQuote, downPaymentOptions, hasAdvisoryRecovery, resolveDownPaymentPercent, type FinancingSettings } from "@/modules/financing/calculator";
import {
  createCreditApplication,
  lookupCustomerByIdentityNumber,
  searchCustomersForApplication,
  type CustomerCreditSummaryForApplication,
} from "@/modules/financing/actions";
import {
  compareRequestedDeviceWithCapacity,
  EMPTY_PAYMENT_HISTORY,
  evaluateCustomerCredit,
  resolveCreditPolicy,
} from "@/modules/credit-evaluation/engine";
import { formatDop } from "@/lib/format-money";
import { imeiValidationMessage } from "@/lib/validation/imei";
import { applicationFields } from "@/modules/financing/application-errors";
import { hasVariableInstallments, InstallmentSummary } from "@/modules/financing/installment-summary";
import { DownPaymentSelector } from "@/modules/financing/down-payment-selector";
import { FinancingPeriodSelector } from "@/modules/financing/period-selector";
import { RecoverySummary } from "@/modules/financing/recovery-summary";
import { firstPaymentDate } from "@/modules/financing/schedule-dates";
import { formatIdentityInput, formatInputElement, formatMoneyInput, formatPhoneInput, normalizeMoneyInput, REFERENCE_RELATIONSHIPS, uppercaseCustomerName } from "@/modules/financing/input-format";

type CustomerOption = {
  id: string;
  branch_id: string | null;
  full_name: string;
  identity_number: string | null;
  phone: string | null;
  address: string | null;
  employer?: string | null;
  monthly_income?: string | number | null;
  reference_name?: string | null;
  reference_phone?: string | null;
  reference_relationship?: string | null;
  reference_identity_number?: string | null;
  credit_evaluation?: CustomerCreditSummaryForApplication;
};
type BranchOption = { id: string; name: string };
const DEVICE_BRANDS = ["Samsung", "Apple", "Xiaomi", "Motorola", "Honor", "Tecno", "Infinix", "Itel", "ZTE", "BLU", "OPPO", "realme", "Vivo", "Nokia", "TCL", "Huawei", "OnePlus", "Alcatel"];

function currency(amount: string | number) {
  return formatDop(amount);
}

function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return <label data-error={Boolean(error)} className="block text-sm font-semibold text-secondary">{label}{children}{error ? <span className="mt-2 block text-xs font-medium leading-5 text-danger">{error}</span> : hint && <span className="mt-2 block text-xs font-normal leading-5 text-muted">{hint}</span>}</label>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"><ClipboardList size={16}/>{pending ? "Guardando y enviando..." : "Guardar y enviar a evaluación"}</button>;
}

const applicationErrorMessages: Record<string, string> = {
  forbidden: "No tienes permiso para crear esta solicitud en la sucursal seleccionada.",
  "tenant-suspended": "La empresa está suspendida y no puede recibir solicitudes.",
  unavailable: "No se pudo consultar la información necesaria. Tus datos siguen en el formulario; vuelve a intentar.",
  "invalid-form": "Hay datos con formato inválido. Revisa los campos indicados abajo.",
  "invalid-customer": "Revisa el nombre y los datos del cliente.",
  "customer-not-found": "El cliente seleccionado ya no está disponible. Búscalo de nuevo.",
  "branch-required": "Selecciona una sucursal válida.",
  "customer-branch-mismatch": "La sucursal debe coincidir con la asignada al cliente.",
  "term-not-allowed": "El plazo seleccionado ya no está habilitado en la configuración.",
  "reference-consent-required": "Confirma la autorización para registrar la referencia personal.",
  "invalid-reference": "Completa nombre y teléfono de la referencia, o deja ambos vacíos.",
  "invalid-income": "Revisa el ingreso mensual; debe ser un importe válido no negativo.",
  "quote-date-invalid": "La fecha de la primera cuota no es válida.",
  "quote-settings-invalid": "Los ajustes financieros actuales no permiten calcular esta solicitud.",
  "quote-price-invalid": "Revisa el precio del dispositivo.",
  "quote-term-invalid": "El plazo no es válido para esta cotización.",
  "quote-invalid": "No se pudo calcular la cotización. Revisa los datos e inténtalo otra vez.",
  "recovery-review-required": "La cotización requiere revisión antes de poder enviarse.",
  "device-identifier-conflict": "Ese IMEI ya está registrado. Verifica el equipo antes de continuar.",
  "duplicate-customer": "Ya existe un cliente con ese documento; selecciónalo para evitar duplicarlo.",
  duplicate: "Ya existe una solicitud para este envío. Actualiza la lista antes de volver a intentarlo.",
  "save-error": "No se pudo guardar la solicitud. Tus datos siguen en el formulario; puedes volver a intentar.",
};

export function CreditApplicationForm({ branches, defaultBranchId, settings, submissionKey, today }: {
  branches: BranchOption[];
  defaultBranchId: string;
  settings: FinancingSettings;
  submissionKey: string;
  today: string;
}) {
  const [actionState, formAction] = useActionState(createCreditApplication, null);
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValues = useRef<Record<string, string> | null>(null);
  const [step, setStep] = useState(0);
  const previousStep = useRef(0);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = formRef.current?.querySelector<HTMLElement>(`[data-application-step="${step}"] h2`);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [step]);
  const [reviewCustomerName, setReviewCustomerName] = useState("");
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [customerSearchState, setCustomerSearchState] = useState<"idle" | "searching" | "ready" | "error">("idle");
  const [customerSearchOffset, setCustomerSearchOffset] = useState(0);
  const [customerSearchHasMore, setCustomerSearchHasMore] = useState(false);
  const [customerIdentityNumber, setCustomerIdentityNumber] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const branchName = branches.find((branch) => branch.id === (selectedCustomer?.branch_id ?? branchId))?.name ?? "Selecciona una sucursal";
  const [customerLookup, setCustomerLookup] = useState<"idle" | "searching" | "found" | "not-found" | "ambiguous" | "unavailable">("idle");
  const [customerId, setCustomerId] = useState("");
  const [employerInput, setEmployerInput] = useState("");
  const [monthlyIncomeInput, setMonthlyIncomeInput] = useState("");
  const [referenceRelationship, setReferenceRelationship] = useState("");
  const [brand, setBrand] = useState("");
  const [brandChoice, setBrandChoice] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [imeiTouched, setImeiTouched] = useState(false);
  const imeiError = imeiTouched ? imeiValidationMessage(imei) : undefined;
  const [salePrice, setSalePrice] = useState("");
  const [downPaymentPercent, setDownPaymentPercent] = useState(() => {
    const permitted = downPaymentOptions(settings.downPaymentPercent);
    return resolveDownPaymentPercent(permitted.find((percent) => Number(percent) === 30) ?? "", settings.downPaymentPercent);
  });
  const defaultTermMonths = settings.allowedTerms.includes(12) ? 12 : settings.allowedTerms[0] ?? 12;
  const [termMonths, setTermMonths] = useState(defaultTermMonths);
  const [frequency, setFrequency] = useState<"monthly" | "fortnightly">(defaultTermMonths === 5 ? "fortnightly" : "monthly");
  const firstInstallmentDate = firstPaymentDate(today, frequency);
  const quoteResult = useMemo(() => {
    if (!salePrice || !firstInstallmentDate) return { quote: null, error: "" };
    try {
      return { quote: calculateFinancingQuote({
        salePrice: normalizeMoneyInput(salePrice), deviceCost: normalizeMoneyInput(salePrice),
        downPaymentPercent,
        annualRatePercent: settings.annualRatePercent,
        legalExpenses: settings.legalExpenses,
        termMonths, frequency, firstInstallmentDate,
        today,
        recoveryTargetPercent: settings.recoveryTargetPercent,
        recoveryEnabled: settings.recoveryEnabled,
      }), error: "" };
    } catch (error) {
      return { quote: null, error: error instanceof Error ? error.message : "No se pudo calcular la cotización." };
    }
  }, [salePrice, downPaymentPercent, settings, termMonths, frequency, firstInstallmentDate, today]);
  const quote = quoteResult.quote;
  const serverFieldErrors = actionState?.fieldErrors ?? {};

  // Active internal credit evaluation for selected existing customer or live new customer input
  const activeCreditSummary = useMemo((): CustomerCreditSummaryForApplication | null => {
    if (customerMode === "existing" && selectedCustomer?.credit_evaluation && !monthlyIncomeInput.trim()) {
      return selectedCustomer.credit_evaluation;
    }
    const policy = resolveCreditPolicy(null, settings);
    const liveEval = evaluateCustomerCredit(
      {
        identityNumber: customerMode === "existing" ? selectedCustomer?.identity_number : customerIdentityNumber,
        employer: employerInput || selectedCustomer?.employer || null,
        declaredMonthlyIncome: normalizeMoneyInput(monthlyIncomeInput) || selectedCustomer?.monthly_income || null,
      },
      EMPTY_PAYMENT_HISTORY,
      policy,
    );
    if (customerMode === "existing" && selectedCustomer?.credit_evaluation && selectedCustomer.credit_evaluation.status === "complete") {
      return selectedCustomer.credit_evaluation;
    }
    return {
      status: liveEval.status,
      totalScore: liveEval.totalScore,
      riskLevel: liveEval.riskLevel,
      riskLabel: liveEval.riskLabel,
      verificationState: liveEval.verificationState,
      monthlyPaymentCapacity: liveEval.monthlyPaymentCapacity,
      recommendedMaxPrincipal: liveEval.recommendedMaxPrincipal,
      recommendedMaxSalePrice: liveEval.recommendedMaxSalePrice,
      recommendedDownPayment: liveEval.recommendedDownPayment,
      recommendedTermMonths: liveEval.recommendedTermMonths,
      evaluatedAt: null,
    };
  }, [customerMode, selectedCustomer, customerIdentityNumber, employerInput, monthlyIncomeInput, settings]);

  const capacityComparison = useMemo(() => {
    if (!activeCreditSummary || !quote) return null;
    return compareRequestedDeviceWithCapacity({
      evaluation: activeCreditSummary,
      requestedSalePrice: quote.salePrice,
      fixedInstallment: quote.fixedInstallment,
      frequency: quote.frequency,
    });
  }, [activeCreditSummary, quote]);

  function applyCustomerAdditionalFields(customer: CustomerOption | null) {
    setReferenceRelationship(customer?.reference_relationship ?? "");
    setEmployerInput(customer?.employer ?? "");
    setMonthlyIncomeInput(
      customer?.monthly_income !== null && customer?.monthly_income !== undefined
        ? formatMoneyInput(String(customer.monthly_income), true)
        : "",
    );
    const form = formRef.current;
    if (!form) return;
    const setInput = (name: string, val: string) => {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement) el.value = val;
    };
    setInput("employer", customer?.employer ?? "");
    setInput("monthlyIncome", customer?.monthly_income !== null && customer?.monthly_income !== undefined ? formatMoneyInput(String(customer.monthly_income), true) : "");
    setInput("referenceName", customer?.reference_name ?? "");
    setInput("referenceIdentityNumber", customer?.reference_identity_number ?? "");
    setInput("referencePhone", formatPhoneInput(customer?.reference_phone ?? ""));
    const consentEl = form.elements.namedItem("referenceConsent");
    if (consentEl instanceof HTMLInputElement && consentEl.type === "checkbox") {
      consentEl.checked = Boolean(customer?.reference_name && customer?.reference_phone);
    }
  }

  function selectExistingCustomer(customer: CustomerOption) {
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    if (customer.branch_id) setBranchId(customer.branch_id);
    applyCustomerAdditionalFields(customer);
  }

  function focusField(name: string) {
    const targetStep = applicationFields[name]?.step;
    if (targetStep === undefined) return;
    setStep(targetStep);
    requestAnimationFrame(() => {
      const fieldName = name === "branchId" ? "branchSelector" : name === "customerId" ? "customerSearch" : name;
      const control = formRef.current?.elements.namedItem(fieldName);
      const field = control instanceof RadioNodeList ? Array.from(control).find((item) => item instanceof HTMLInputElement && item.checked) : control;
      if (field instanceof HTMLElement) { field.focus(); field.scrollIntoView({ block: "center", behavior: "instant" }); }
    });
  }

  useEffect(() => {
    if (!actionState || !submittedValues.current || !formRef.current) return;
    for (const [name, value] of Object.entries(submittedValues.current)) {
      const field = formRef.current.elements.namedItem(name);
      if (field instanceof RadioNodeList) {
        for (const item of Array.from(field)) {
          if (item instanceof HTMLInputElement && (item.type === "checkbox" || item.type === "radio")) item.checked = value === item.value;
        }
      } else if (field instanceof HTMLInputElement && field.type === "checkbox") {
        field.checked = value === "on";
      } else if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.value = value;
      }
    }
    const summary = formRef.current.querySelector<HTMLElement>("[data-application-errors]");
    summary?.focus();
    summary?.scrollIntoView({ block: "center" });
  }, [actionState]);

  useEffect(() => {
    const identity = customerIdentityNumber.trim();
    if (customerMode !== "new" || identity.length < 6) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await lookupCustomerByIdentityNumber(identity);
        if (!active) return;
        if (result.status === "found") {
          setSelectedCustomer(result.customer);
          setCustomerId(result.customer.id);
          if (result.customer.branch_id) setBranchId(result.customer.branch_id);
          setCustomerMode("existing");
          setCustomerLookup("found");
          applyCustomerAdditionalFields(result.customer);
        } else {
          setCustomerLookup(result.status);
        }
      } catch {
        if (active) setCustomerLookup("unavailable");
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerIdentityNumber, customerMode]);

  useEffect(() => {
    const term = customerQuery.trim();
    if (customerMode !== "existing" || term.length < 2) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      if (active) setCustomerSearchState("searching");
      try {
        const result = await searchCustomersForApplication(term, 0);
        if (!active) return;
        if (result.status !== "ok") { setCustomerMatches([]); setCustomerSearchHasMore(false); setCustomerSearchState("error"); return; }
        setCustomerMatches(result.customers); setCustomerSearchOffset(result.customers.length);
        setCustomerSearchHasMore(result.hasMore); setCustomerSearchState("ready");
      } catch {
        if (active) { setCustomerMatches([]); setCustomerSearchHasMore(false); setCustomerSearchState("error"); }
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [customerMode, customerQuery]);

  async function loadMoreCustomers() {
    if (!customerSearchHasMore || customerSearchState === "searching") return;
    setCustomerSearchState("searching");
    try {
      const result = await searchCustomersForApplication(customerQuery, customerSearchOffset);
      if (result.status !== "ok") { setCustomerSearchState("error"); return; }
      setCustomerMatches((current) => [...current, ...result.customers]);
      setCustomerSearchOffset((current) => current + result.customers.length);
      setCustomerSearchHasMore(result.hasMore); setCustomerSearchState("ready");
    } catch { setCustomerSearchState("error"); }
  }

  function startNewCustomer() {
    setCustomerMode("new");
    setCustomerId("");
    setSelectedCustomer(null);
    setCustomerIdentityNumber("");
    setCustomerQuery(""); setCustomerMatches([]); setCustomerSearchHasMore(false);
    setCustomerLookup("idle");
    setBranchId(defaultBranchId);
    applyCustomerAdditionalFields(null);
  }

  function nextStep() {
    if (step === 1) {
      setImeiTouched(true);
      const field = formRef.current?.elements.namedItem("imei");
      if (field instanceof HTMLInputElement) field.setCustomValidity(imeiValidationMessage(imei) ?? "");
    }
    const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-application-step="${step}"] input, [data-application-step="${step}"] select, [data-application-step="${step}"] textarea`);
    for (const field of fields ?? []) {
      if (!field.reportValidity()) return;
    }
    if (formRef.current) {
      const values = new FormData(formRef.current);
      setReviewCustomerName(selectedCustomer?.full_name ?? String(values.get("customerFullName") ?? ""));
    }
    setStep((current) => Math.min(3, current + 1));
    formRef.current?.scrollIntoView({ block: "start" });
  }

  function preserveSubmission(event: FormEvent<HTMLFormElement>) {
    if (step < 3) { event.preventDefault(); nextStep(); return; }
    if (imeiValidationMessage(imei)) {
      event.preventDefault(); setImeiTouched(true); focusField("imei"); return;
    }
    const data = new FormData(event.currentTarget);
    submittedValues.current = Object.fromEntries(Array.from(data.entries(), ([name, field]) => [name, typeof field === "string" ? field : ""]));
  }

  return <form ref={formRef} action={formAction} onSubmit={preserveSubmission} onKeyDown={(event) => {
    if (event.key === "Enter" && step < 3 && event.target instanceof HTMLInputElement) { event.preventDefault(); nextStep(); }
  }} onInvalidCapture={(event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    if (field instanceof HTMLInputElement && field.name === "imei") setImeiTouched(true);
    const panel = field.closest<HTMLElement>("[data-application-step]");
    if (panel?.hidden) setStep(Number(panel.dataset.applicationStep));
    requestAnimationFrame(() => {
      field.focus({ preventScroll: true });
      (field.closest("label") ?? field).scrollIntoView({ block: "center", behavior: "instant" });
    });
  }} className="application-flow grid scroll-mt-24 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(290px,320px)]">
    <input type="hidden" name="submissionKey" value={submissionKey}/>
    <input type="hidden" name="customerMode" value={customerMode}/>
    <input type="hidden" name="customerId" value={customerId}/>
    <input type="hidden" name="branchId" value={selectedCustomer?.branch_id ?? branchId}/>
    {actionState?.state && <section data-application-errors tabIndex={-1} role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger lg:col-span-2"><p className="font-semibold">No se guardó la solicitud.</p><p className="mt-1">{applicationErrorMessages[actionState.state] ?? "No se pudo guardar. Los datos se conservaron; vuelve a intentar."}</p>{Object.keys(serverFieldErrors).length > 0 && <ul className="mt-3 space-y-2">{Object.entries(serverFieldErrors).map(([name,message])=><li key={name}><button type="button" onClick={()=>focusField(name)} className="text-left text-sm underline decoration-rose-300 underline-offset-4 hover:decoration-rose-700"><b>{applicationFields[name]?.label ?? name}:</b> {message} → Corregir</button></li>)}</ul>}</section>}
    <nav aria-label="Progreso de solicitud" className="lg:col-span-2"><div className="mb-3 flex items-center justify-between text-xs text-muted"><span aria-live="polite">Paso {step + 1} de 4</span><span>{["Datos del cliente", "Dispositivo", "Condiciones financieras", "Revisión y envío"][step]}</span></div><div role="progressbar" aria-label="Avance de la solicitud" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step + 1} className="mb-3 h-1 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${(step + 1) * 25}%` }}/></div>
      <ol className="grid grid-cols-4 gap-2 rounded-xl border border-line bg-surface p-2 sm:gap-3 sm:p-3">{["Cliente", "Equipo", "Condiciones", "Revisión"].map((label, index) => <li key={label}><button type="button" disabled={index > step} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)} className={`flex min-h-12 w-full flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-xs ${step === index ? "bg-accent-soft text-accent" : index < step ? "text-secondary hover:bg-subtle" : "text-muted"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${step === index ? "bg-blue-700 text-white" : index < step ? "bg-positive-soft text-positive" : "bg-soft text-muted"}`}>{index < step ? <Check size={13}/> : index + 1}</span>{label}</button></li>)}</ol>
    </nav>
    <div className="space-y-5">
      <section data-application-step="0" hidden={step !== 0} className="km-panel p-5 sm:p-6">
        <PanelHeading title="Datos del cliente" description="Registra un cliente nuevo o selecciona un expediente existente aquí mismo." icon={UserRound} inset="form"/>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Tipo de cliente">
          <button type="button" aria-pressed={customerMode === "existing"} onClick={() => { setCustomerMode("existing"); setCustomerLookup("idle"); setCustomerSearchState("idle"); setCustomerMatches([]); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${customerMode === "existing" ? "border-blue-700 bg-accent-soft text-accent" : "border-line text-secondary hover:bg-subtle"}`}>Cliente existente</button>
          <button type="button" aria-pressed={customerMode === "new"} onClick={startNewCustomer} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${customerMode === "new" ? "border-blue-700 bg-accent-soft text-accent" : "border-line text-secondary hover:bg-subtle"}`}>Registrar cliente nuevo</button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {customerMode === "existing" ? <Fragment key="existing-customer">
            <Field label="Buscar cliente por nombre, cédula o teléfono *"><input name="customerSearch" required={!customerId} minLength={customerId ? undefined : 2} value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomerMatches([]); setCustomerSearchState("idle"); setCustomerSearchOffset(0); setCustomerSearchHasMore(false); }} autoComplete="off" maxLength={80} placeholder="Escribe al menos dos caracteres" className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal" /></Field>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line sm:col-span-2" aria-live="polite">
              {customerSearchState === "idle" && <p className="p-3 text-xs text-muted">Busca por nombre, documento o teléfono y selecciona el expediente correcto.</p>}
              {customerSearchState === "searching" && <p className="p-3 text-xs text-muted">Buscando clientes…</p>}
              {customerSearchState === "error" && <p role="alert" className="p-3 text-xs text-danger">No se pudo consultar la base de clientes. Vuelve a intentar la búsqueda.</p>}
              {customerSearchState === "ready" && !customerMatches.length && <p className="p-3 text-xs text-muted">No encontramos coincidencias. Puedes registrar un cliente nuevo.</p>}
              {customerMatches.map((customer) => <button key={customer.id} type="button" aria-pressed={customerId === customer.id} onClick={() => selectExistingCustomer(customer)} className={`block w-full border-b border-line p-3 text-left text-xs last:border-0 hover:bg-accent-soft ${customerId === customer.id ? "bg-accent-soft" : "bg-surface"}`}><div className="flex items-center justify-between gap-2"><b>{uppercaseCustomerName(customer.full_name)}</b>{customer.credit_evaluation?.status === "complete" && customer.credit_evaluation.totalScore !== null && <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-bold text-secondary">Score {customer.credit_evaluation.totalScore}/100 · Máx. {currency(customer.credit_evaluation.recommendedMaxSalePrice)}</span>}</div><span className="mt-1 block text-muted">{customer.identity_number ?? "Sin documento"} · {customer.phone ?? "Sin teléfono"}{customer.employer ? ` · ${customer.employer}` : ""}</span></button>)}
              {customerSearchHasMore && <button type="button" disabled={customerSearchState === "searching"} onClick={loadMoreCustomers} className="w-full p-3 text-xs font-semibold text-accent disabled:text-muted">Cargar más resultados</button>}
            </div>
            {selectedCustomer && selectedCustomer.id === customerId && <div role="status" className="rounded-lg border border-positive-line bg-positive-soft p-3 text-xs leading-5 text-positive sm:col-span-2"><b>Cliente encontrado y seleccionado.</b> Se usará su expediente existente: {uppercaseCustomerName(selectedCustomer.full_name)}{selectedCustomer.identity_number ? ` · ${selectedCustomer.identity_number}` : ""}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}{selectedCustomer.employer ? ` · ${selectedCustomer.employer}` : ""}</div>}
          </Fragment> : <Fragment key="new-customer">
            <Field label="Nombre completo *"><input required name="customerFullName" minLength={2} autoComplete="name" maxLength={200} onChange={(event) => formatInputElement(event.currentTarget, uppercaseCustomerName, true)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="NOMBRE Y APELLIDOS"/></Field>
            <Field label="Cédula o documento"><input name="customerIdentityNumber" autoComplete="off" maxLength={40} value={customerIdentityNumber} onChange={(event) => setCustomerIdentityNumber(formatInputElement(event.currentTarget, formatIdentityInput))} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="000-0000000-0"/></Field>
            {(customerLookup !== "idle" || (customerMode === "new" && customerIdentityNumber.trim().length >= 6)) && <p aria-live="polite" className="text-xs leading-5 text-secondary sm:col-span-2">{customerLookup === "idle" ? "Buscando cliente por cédula…" : customerLookup === "not-found" ? "No existe un cliente con esta cédula; se registrará uno nuevo." : customerLookup === "ambiguous" ? "Hay más de un expediente con esta cédula. Selecciona el cliente existente para evitar duplicarlo." : customerLookup === "unavailable" ? "No se pudo consultar la cédula ahora. Puedes continuar y el sistema verificará duplicados al guardar." : "Cliente encontrado y seleccionado."}</p>}
            <Field label="Teléfono del cliente"><input name="customerPhone" type="tel" autoComplete="tel" maxLength={40} onChange={(event) => formatInputElement(event.currentTarget, formatPhoneInput)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="809-000-0000"/></Field>
            <Field label="Dirección"><input name="customerAddress" autoComplete="street-address" maxLength={500} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Opcional"/></Field>
          </Fragment>}
          <Field label="Sucursal de origen *"><select required name="branchSelector" value={selectedCustomer?.branch_id ?? branchId} onChange={(event) => setBranchId(event.target.value)} disabled={customerMode === "existing" && Boolean(selectedCustomer?.branch_id)} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal disabled:bg-subtle"><option value="" disabled>Selecciona una sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
        </div>
        <div className="mb-3 mt-7 border-t border-line pt-5"><h3 className="text-sm font-bold">Información adicional</h3><p className="mt-1 text-xs font-normal text-muted">Empleo y referencia personal, si están disponibles.</p></div><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empleo / empresa"><input name="employer" maxLength={160} value={employerInput} onChange={(e) => setEmployerInput(e.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Opcional"/></Field>
          <Field label="Ingreso mensual (RD$)"><MoneyInput name="monthlyIncome" inputMode="decimal" maxLength={18} placeholder="0.00" value={monthlyIncomeInput} onChange={(event) => setMonthlyIncomeInput(formatInputElement(event.currentTarget, formatMoneyInput))} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Parentesco de referencia"><select name="referenceRelationship" value={referenceRelationship} onChange={(event) => setReferenceRelationship(event.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal"><option value="">Selecciona un parentesco</option>{REFERENCE_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></Field>
          <Field label="Nombre de referencia"><input name="referenceName" maxLength={160} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Nombre y apellidos de la persona"/></Field>
          <Field label="Cédula de referencia" error={serverFieldErrors.referenceIdentityNumber}><input name="referenceIdentityNumber" inputMode="numeric" maxLength={13} pattern="[0-9]{3}-[0-9]{7}-[0-9]" aria-invalid={Boolean(serverFieldErrors.referenceIdentityNumber)} onChange={(event) => formatInputElement(event.currentTarget, formatIdentityInput)} className="km-input mt-1.5 w-full" placeholder="000-0000000-0 · opcional"/></Field>
          <Field label="Teléfono de referencia"><input type="tel" name="referencePhone" maxLength={40} onChange={(event) => formatInputElement(event.currentTarget, formatPhoneInput)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="809-000-0000"/></Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-secondary"><input type="checkbox" name="referenceConsent" className="mt-0.5 accent-blue-700"/><span>Confirmo que tengo autorización para registrar los datos de contacto de esta referencia. Se guarda solo si completo nombre y teléfono.</span></label>

        {/* Loaded Customer Credit Evaluation Summary inside Step 0 */}
        {activeCreditSummary && (customerMode === "existing" ? Boolean(selectedCustomer) : Boolean(monthlyIncomeInput.trim())) && (
          <div className="mt-5 rounded-xl border border-accent-line bg-accent-soft/60 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                <Gauge size={15} className="text-accent" aria-hidden />
                Evaluación crediticia interna vigente
              </span>
              <span className="rounded-full bg-surface px-2.5 py-0.5 font-bold text-accent shadow-xs">
                {activeCreditSummary.status === "complete" && activeCreditSummary.totalScore !== null
                  ? `Score ${activeCreditSummary.totalScore}/100 · ${activeCreditSummary.riskLabel}`
                  : "Evaluación incompleta"}
              </span>
            </div>
            {activeCreditSummary.status === "complete" ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-accent-line pt-3 sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Capacidad mensual</dt>
                  <dd className="km-amount mt-0.5 font-bold text-ink">{currency(activeCreditSummary.monthlyPaymentCapacity)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Capital financiable máx.</dt>
                  <dd className="km-amount mt-0.5 font-bold text-accent">{currency(activeCreditSummary.recommendedMaxPrincipal)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Precio máx. sugerido</dt>
                  <dd className="km-amount mt-0.5 font-bold text-positive">{currency(activeCreditSummary.recommendedMaxSalePrice)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Inicial sugerida</dt>
                  <dd className="km-amount mt-0.5 font-bold text-ink">{currency(activeCreditSummary.recommendedDownPayment)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-secondary">
                Registra el ingreso mensual del cliente para conocer su límite de financiamiento recomendado.
              </p>
            )}
          </div>
        )}
      </section>

      <section data-application-step="1" hidden={step !== 1} className="km-panel p-5 sm:p-6">
        <PanelHeading title="Datos del equipo" description="Identifica el equipo que se entregará al cliente." icon={Smartphone} inset="form"/>
        <p className="mb-3 rounded-lg bg-subtle px-3 py-2 text-[11px] leading-5 text-secondary">No hace falta registrar el costo de compra. El precio de venta será la referencia para medir la recuperación.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Marca *"><select required name="brandSelector" value={brandChoice} onChange={(event) => { setBrandChoice(event.target.value); setBrand(event.target.value === "other" ? "" : event.target.value); }} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal"><option value="">Selecciona una marca</option>{DEVICE_BRANDS.map((item) => <option key={item} value={item}>{item}</option>)}<option value="other">Otra marca</option></select><input type="hidden" name="brand" value={brand}/></Field>
          {brandChoice === "other" && <Field label="Nombre de la marca *"><input required name="customBrand" value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={80} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></Field>}
          <Field label="Modelo *"><input required name="model" value={model} onChange={(event) => setModel(event.target.value)} maxLength={120} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="IMEI *" error={imeiError ?? serverFieldErrors.imei} hint="Escribe los 15 dígitos del IMEI real del equipo."><input required name="imei" aria-invalid={Boolean(imeiError ?? serverFieldErrors.imei)} value={imei} onBlur={() => setImeiTouched(true)} onChange={(event) => { setImei(event.target.value); event.target.setCustomValidity(imeiValidationMessage(event.target.value) ?? ""); }} inputMode="numeric" pattern="[0-9]{15}" minLength={15} maxLength={15} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 font-mono text-sm font-normal"/></Field>
          <Field label="Condición *"><select name="condition" required defaultValue="new" className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal"><option value="new">Nuevo</option><option value="used">Usado</option></select></Field>
          <Field label="Precio de venta (RD$) *" hint="Los separadores de miles se agregan automáticamente; puedes incluir hasta dos decimales."><MoneyInput required name="salePrice" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={18} placeholder="0.00" value={salePrice} onChange={(event) => setSalePrice(formatInputElement(event.currentTarget, formatMoneyInput))} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Inventario de origen"><input readOnly value={branchName} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal text-secondary"/></Field>
        </div>
        {capacityComparison && (
          <div className={`mt-5 rounded-xl border p-4 text-xs ${capacityComparison.exceedsSalePriceLimit || capacityComparison.exceedsMonthlyCapacity ? "border-warning-line bg-warning-soft text-warning" : "border-positive-line bg-positive-soft text-positive"}`}>
            <p className="flex items-center gap-1.5 font-bold">
              {capacityComparison.exceedsSalePriceLimit || capacityComparison.exceedsMonthlyCapacity ? <ShieldAlert size={15} className="shrink-0 text-warning"/> : <CheckCircle2 size={15} className="shrink-0 text-positive"/>}
              Comparativa con capacidad crediticia del cliente
            </p>
            <p className="mt-1 leading-5">{capacityComparison.recommendationText}</p>
            {capacityComparison.alerts.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px]">
                {capacityComparison.alerts.map((alert) => <li key={alert}>• {alert}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      <section data-application-step="2" hidden={step !== 2} className="km-panel p-5 sm:p-6">
        <PanelHeading title="Condiciones financieras" description="Los valores predeterminados los controla administración." icon={CalendarDays} inset="form"/>
        <div className="grid gap-5 sm:grid-cols-2">
          <DownPaymentSelector value={downPaymentPercent} allowedOptions={downPaymentOptions(settings.downPaymentPercent)} onChange={setDownPaymentPercent} error={serverFieldErrors.downPaymentPercent}/>
          <FinancingPeriodSelector allowedTerms={settings.allowedTerms} termMonths={termMonths} frequency={frequency} onTermChange={setTermMonths} onFrequencyChange={setFrequency} termError={serverFieldErrors.termMonths} frequencyError={serverFieldErrors.frequency} quote={quote} today={today} recoveryTargetPercent={settings.recoveryTargetPercent}/>
          <Field label="Tasa simple anual configurada"><input readOnly value={`${settings.annualRatePercent}%`} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Interés aplicado al plazo" hint={`${Number(settings.annualRatePercent)}% anual × ${termMonths}/12 meses. Se calcula una sola vez sobre el capital financiado.`}><input readOnly value={`${new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(Number(settings.annualRatePercent) * termMonths / 12)}% en ${termMonths} meses`} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Gastos legales configurados"><input readOnly value={currency(settings.legalExpenses)} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Primera cuota estimada" hint={`Si se aprueba hoy: ${frequency === "fortnightly" ? "15" : "30"} días después. Las fechas definitivas se calculan al aprobar la solicitud.`}><input readOnly type="date" name="firstInstallmentDate" value={firstInstallmentDate} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal"/></Field>
          <Field label="Fecha de última cuota" hint="Se actualiza según la primera cuota, el plazo y la frecuencia elegidos."><input readOnly type="date" value={quote?.finalDueDate ?? ""} className="km-input mt-1.5 w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm font-normal"/></Field>
        </div>
        <section aria-label="Resumen de cuotas en tiempo real" aria-live="polite" aria-atomic="true" className="mt-6 border-t border-line pt-5">
          {quote ? <><dl className="mb-4 grid gap-3 rounded-2xl bg-subtle p-4 text-xs sm:grid-cols-3"><div><dt className="text-muted">Monto inicial ({Number(quote.downPaymentPercent)}%)</dt><dd className="km-amount mt-1 text-base font-semibold text-ink">{currency(quote.downPayment)}</dd></div><div><dt className="text-muted">Saldo financiado</dt><dd className="km-amount mt-1 text-base font-semibold text-ink">{currency(quote.principal)}</dd></div><div><dt className="text-muted">{hasVariableInstallments(quote.schedule) ? "Primera cuota" : "Cuota fija"} · {quote.frequency === "fortnightly" ? "quincenal" : "mensual"}</dt><dd className="km-amount mt-1 text-base font-semibold text-accent">{currency(quote.fixedInstallment)}</dd></div></dl>{!hasVariableInstallments(quote.schedule) && <p className="rounded-xl border border-accent-line bg-accent-soft p-4 text-sm text-accent">{quote.installmentCount} cuotas de <b>{currency(quote.fixedInstallment)}</b>.</p>}</> : <p className="text-sm text-muted">Completa el precio del equipo para ver las cuotas actualizadas aquí.</p>}
        </section>
      </section>
      {step === 3 && <section data-application-step="3" className="km-panel km-step-panel p-5 sm:p-6" aria-labelledby="application-review-title">
        <PanelHeading id="application-review-title" title="Revisa tu solicitud" description="Confirma el cliente, el equipo y las condiciones antes de enviarla a evaluación." icon={ClipboardList} inset="form"/>
        <dl className="mt-6 divide-y divide-line text-sm">{[["Cliente", uppercaseCustomerName(selectedCustomer?.full_name ?? reviewCustomerName)], ["Sucursal", branchName], ["Equipo", `${brand} ${model}`], ["IMEI", imei], ["Precio de venta", quote ? currency(quote.salePrice) : "—"], ["Inicial elegido", quote ? `${Number(quote.downPaymentPercent)}% · ${currency(quote.downPayment)}` : `${Number(downPaymentPercent)}%`], ["Límite recomendado al cliente", activeCreditSummary?.status === "complete" ? currency(activeCreditSummary.recommendedMaxSalePrice) : "Evaluación incompleta"], ["Plazo y frecuencia", `${termMonths} meses · ${frequency === "fortnightly" ? "Quincenal" : "Mensual"}`], ["Primera cuota", firstInstallmentDate], ["Última cuota", quote?.finalDueDate ?? "—"]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">{label}</dt><dd className="break-words text-right font-semibold text-ink">{value}</dd></div>)}</dl>
        {capacityComparison && (capacityComparison.exceedsSalePriceLimit || capacityComparison.exceedsMonthlyCapacity) && (
          <div role="status" className="mt-4 rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-5 text-warning">
            <b>Aviso de límite orientativo:</b> Esta solicitud supera la capacidad o el precio máximo sugerido para el cliente ({currency(capacityComparison.recommendedMaxSalePrice)}). Puedes enviarla igualmente para revisión manual por el personal autorizado.
          </div>
        )}
        <p className="mt-5 rounded-lg bg-accent-soft p-3 text-xs leading-5 text-accent">La solicitud quedará pendiente de evaluación. Su aprobación y la activación del financiamiento se realizan después.</p>
      </section>}
      <div className="flex items-center justify-between gap-3">
        {step > 0 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-subtle"><ArrowLeft size={15}/>Anterior</button> : <span className="text-xs leading-5 text-muted">Paso {step + 1} de 4</span>}
        {step < 3 && <button type="button" onClick={nextStep} className="km-primary">Continuar<ArrowRight size={16}/></button>}
      </div>
    </div>

    <aside aria-label="Resumen financiero de la solicitud" tabIndex={0} className="space-y-4 lg:sticky lg:top-[96px] lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:rounded-2xl">
      <section className="km-panel km-quote overflow-hidden">
        <div className="km-wallet px-5 py-6 text-white"><p className="text-xs font-medium text-white/80">Cotización preliminar · DOP</p><p className="mt-2 text-2xl font-bold">{quote ? currency(quote.fixedInstallment) : "RD$ —"}</p><p className="mt-1 text-xs text-white/75">{hasVariableInstallments(quote?.schedule) ? "Cuota inicial" : "Cuota fija"} {frequency === "fortnightly" ? "quincenal" : "mensual"} propuesta</p></div>
        {quote ? <div className="space-y-3 p-5 text-xs">
          <div aria-live="polite" className="flex justify-between gap-3"><span className="text-muted">Inicial ({Number(quote.downPaymentPercent)}%)</span><b>{currency(quote.downPayment)}</b></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Capital financiado</span><b>{currency(quote.principal)}</b></div>
          <div className="flex justify-between gap-3"><span className="text-muted">{quote.installmentCount} cuotas · {quote.frequency === "fortnightly" ? "quincenal" : "mensual"}</span><b>{hasVariableInstallments(quote.schedule) ? "Por tramos" : currency(quote.fixedInstallment)}</b></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Primera cuota</span><b>{quote.firstInstallmentDate.split("-").reverse().join("/")}</b></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Última cuota</span><b>{quote.finalDueDate.split("-").reverse().join("/")}</b></div>
          {quote.installmentRounding === "up_50" && <div className="flex justify-between gap-3"><span className="text-muted">Ajuste por redondeo de cuotas</span><b>{currency(quote.proposedAdjustment)}</b></div>}
          {step !== 2 && <InstallmentSummary schedule={quote.schedule} frequency={quote.frequency} paymentDistribution={quote.paymentDistribution}/>}
          <div className="flex justify-between gap-3"><span className="text-muted">Interés del plazo ({new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(Number(settings.annualRatePercent) * termMonths / 12)}%)</span><b>{currency(quote.baseInterest)}</b></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Gastos legales</span><b>{currency(quote.legalExpenses)}</b></div>
          <div className="flex justify-between gap-3 border-t border-line pt-3"><span className="font-semibold text-secondary">Total estimado al cliente</span><b className="text-sm text-ink">{currency(quote.totalCustomerPays)}</b></div>
          {capacityComparison && (
            <div className={`rounded-lg border p-3 ${capacityComparison.exceedsSalePriceLimit || capacityComparison.exceedsMonthlyCapacity ? "border-warning-line bg-warning-soft text-warning" : "border-positive-line bg-positive-soft text-positive"}`}>
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span>Capacidad del cliente</span>
                <span>{activeCreditSummary?.totalScore !== null && activeCreditSummary?.totalScore !== undefined ? `${activeCreditSummary.totalScore}/100` : "Sin calificar"}</span>
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-[11px]">
                <span>Precio máx. sugerido:</span>
                <b>{currency(capacityComparison.recommendedMaxSalePrice)}</b>
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[11px]">
                <span>Carga mensual propuesta:</span>
                <b>{currency(capacityComparison.monthlyEquivalentInstallment)} / {currency(capacityComparison.monthlyPaymentCapacity)}</b>
              </div>
              {capacityComparison.capacityUtilizationPercent < 999 && (
                <p className="mt-1 text-[11px]">Uso de capacidad mensual: <b>{capacityComparison.capacityUtilizationPercent}%</b></p>
              )}
            </div>
          )}
          <RecoverySummary quote={quote}/>
          {quote.adjustmentRequiresApproval && <div className="rounded-lg border border-warning-line bg-warning-soft p-3 text-[11px] leading-5 text-warning"><b>Ajuste propuesto: {currency(quote.proposedAdjustment)}.</b> No forma parte del interés ni de los gastos legales. Requiere categoría comercial, soporte contractual y aprobación documentada antes de emitir el contrato.</div>}
          {!hasAdvisoryRecovery(quote.paymentDistribution) && !quote.recoveryMet && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-[11px] leading-5 text-danger">La cotización histórica no alcanza la meta de recuperación pactada.</p>}
          <details className="border-t border-line pt-3"><summary className="cursor-pointer py-1 font-semibold text-accent">Ver cronograma · {quote.installmentCount} cuotas</summary><div className="mt-3 max-h-72 overflow-auto rounded-lg border border-line"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-subtle text-muted"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Vence</th><th className="px-2 py-2 text-right">Cuota</th></tr></thead><tbody>{quote.schedule.map((row) => <tr key={row.sequence} className="border-t border-line"><td className="px-2 py-2">{row.sequence}</td><td className="px-2 py-2">{new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${row.dueDate}T00:00:00.000Z`))}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{currency(row.amount)}</td></tr>)}</tbody></table></div></details>
        </div> : <p className="p-5 text-xs leading-5 text-muted">{quoteResult.error || "Escribe el precio del equipo para calcular la cuota y el monto total."}</p>}
      </section>
      {step === 3 && <div className="rounded-xl border border-line bg-surface p-4"><p className="mb-3 text-xs leading-5 text-muted">Al guardar, se conserva la cotización y su cronograma para la evaluación.</p><SaveButton/><Link href="/solicitudes" className="mt-3 inline-flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold text-secondary"><ArrowLeft size={14}/>Volver a solicitudes</Link></div>}
    </aside>
  </form>;
}



