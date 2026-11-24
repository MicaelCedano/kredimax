import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/auth-context";
import { fetchCustomerPortalSnapshot } from "../services/api-client";

export function usePortalData() {
  const {
    session,
    selectedLoanId,
    setSelectedLoanId,
    executiveOverride,
    setExecutiveOverride,
  } = useAuth();

  const query = useQuery({
    queryKey: ["customer-portal-snapshot", session?.mode, session?.maskedCedula],
    queryFn: () => {
      if (!session) {
        throw new Error("No active session");
      }
      return fetchCustomerPortalSnapshot(session);
    },
    enabled: Boolean(session),
    staleTime: 60 * 1000,
  });

  const snapshot = query.data ?? null;
  const loans = snapshot?.loans ?? [];
  const selectedLoan =
    loans.find((loan) => loan.id === selectedLoanId) ?? loans[0] ?? null;

  const selectedLoanInstallments = (snapshot?.installments ?? []).filter(
    (inst) => !selectedLoan || inst.loanId === selectedLoan.id,
  );

  const selectedLoanPayments = (snapshot?.payments ?? []).filter(
    (pay) => !selectedLoan || pay.loanId === selectedLoan.id,
  );

  const assignedExecutive =
    executiveOverride ??
    snapshot?.customer?.assignedExecutive ?? {
      name: "Carlos Méndez",
      roleLabel: "Ejecutivo de Venta Encargado",
      whatsappPhone: "18095550188",
      whatsappFormatted: "+1 (809) 555-0188",
    };

  return {
    ...query,
    snapshot,
    customer: snapshot?.customer ?? null,
    assignedExecutive,
    setExecutiveOverride,
    loans,
    selectedLoan,
    setSelectedLoanId,
    installments: selectedLoanInstallments,
    allPayments: snapshot?.payments ?? [],
    loanPayments: selectedLoanPayments,
  };
}
