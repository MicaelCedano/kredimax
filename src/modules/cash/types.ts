export type CashClosing = {
  id: string; cash: string; transfer: string; other: string;
  expectedCash: string; expectedTransfer: string; expectedOther: string;
  difference: string; notes: string | null; closedAt: string; closedBy: string;
};
export type CashRow = {
  sellerId: string; sellerName: string; branchId: string | null; branchName: string | null;
  type: "down_payment" | "installment"; cash: string; transfer: string; other: string;
  movements: number; closing: CashClosing | null;
};
