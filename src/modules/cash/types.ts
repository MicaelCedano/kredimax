export type CashClosing = {
  id: string; cash: string; transfer: string; other: string;
  expectedCash: string; expectedTransfer: string; expectedOther: string;
  difference: string; notes: string | null; closedAt: string; closedBy: string; closedByName?: string | null;
};
export type CashRow = {
  sellerId: string; sellerName: string; branchId: string | null; branchName: string | null;
  type: "down_payment" | "installment"; cash: string; transfer: string; other: string;
  movements: number; closing: CashClosing | null; session?: CashDrawerSession | null;
};

export type CashDrawerSession = {
  opened_at: string | null;
  opened_by_name: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  delivered_by_name: string | null;
  received_at: string | null;
  received_by_name: string | null;
  received_cash: string | null;
  received_transfer: string | null;
  received_other: string | null;
  receipt_notes: string | null;
};
