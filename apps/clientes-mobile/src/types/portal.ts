export type AppOperationMode = "DEMO" | "CONNECTED";

export type InstallmentStatus = "paid" | "partial" | "pending" | "overdue";

export type PaymentStatus = "confirmed" | "reversed";

export type DeviceImageCategory = "samsung" | "iphone" | "xiaomi" | "generic";

export interface AssignedExecutiveDto {
  name: string;
  roleLabel: string;
  whatsappPhone: string;
  whatsappFormatted: string;
}

export interface CustomerProfileDto {
  id: string;
  fullName: string;
  maskedCedula: string;
  phone: string;
  email: string | null;
  address: string;
  memberSince: string;
  mustChangePassword: boolean;
  companyName: string;
  branchName: string;
  assignedExecutive: AssignedExecutiveDto;
}

export interface NextInstallmentSummaryDto {
  sequence: number;
  dueDate: string;
  amountDue: string;
  amountDueFormatted: string;
  balance: string;
  balanceFormatted: string;
  status: string;
}

export interface CustomerLoanSummaryDto {
  id: string;
  contractId: string;
  contractNumber: string;
  contractSignedAt: string | null;
  status: string;
  statusLabel: string;
  device: {
    id: string;
    brand: string;
    model: string;
    imeiMasked: string;
    imageCategory: DeviceImageCategory;
  };
  salePrice: string;
  salePriceFormatted: string;
  downPayment: string;
  downPaymentFormatted: string;
  principal: string;
  principalFormatted: string;
  totalFinanced: string;
  totalFinancedFormatted: string;
  totalPaid: string;
  totalPaidFormatted: string;
  pendingBalance: string;
  pendingBalanceFormatted: string;
  progressPercent: number;
  installmentCount: number;
  paidInstallmentsCount: number;
  nextInstallment: NextInstallmentSummaryDto | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface InstallmentItemDto {
  id: string;
  loanId: string;
  sequence: number;
  dueDate: string;
  amountDue: string;
  amountDueFormatted: string;
  amountPaid: string;
  amountPaidFormatted: string;
  balance: string;
  balanceFormatted: string;
  status: InstallmentStatus;
}

export interface PaymentHistoryItemDto {
  id: string;
  receiptNumber: string;
  loanId: string;
  contractNumber: string;
  deviceName: string;
  amount: string;
  amountFormatted: string;
  currency: string;
  receivedAt: string;
  paymentMethod: string;
  paymentType: string;
  reference: string;
  status: PaymentStatus;
  receiptAvailable: boolean;
}

export interface AuthorizedReceiptDocumentDto {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  companyName: string;
  companyLegalName: string;
  companyRnc: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  customerName: string;
  customerMaskedCedula: string;
  contractNumber: string;
  deviceDescription: string;
  paymentMethod: string;
  paymentType: string;
  reference: string;
  amountFormatted: string;
  allocations: Array<{
    sequence: number;
    dueDate: string;
    allocatedFormatted: string;
  }>;
  verificationHash: string;
}

export interface CustomerPortalSnapshot {
  mode: AppOperationMode;
  customer: CustomerProfileDto;
  loans: CustomerLoanSummaryDto[];
  installments: InstallmentItemDto[];
  payments: PaymentHistoryItemDto[];
}
