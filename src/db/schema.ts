import { sql } from "drizzle-orm";
import {
  boolean, customType, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable,
  primaryKey, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["platform_admin", "tenant_admin", "branch_manager", "sales", "cashier", "collections", "auditor", "mdm_operator"]);
export const financingStatus = pgEnum("financing_status", ["draft", "pending", "approved", "active", "paid_off", "rejected", "cancelled"]);
export const installmentStatus = pgEnum("installment_status", ["pending", "partial", "paid", "overdue", "waived"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(), name: varchar("name", { length: 160 }).notNull(),
  legalName: varchar("legal_name", { length: 200 }), status: varchar("status", { length: 24 }).notNull().default("active"),
  currency: varchar("currency", { length: 3 }).notNull().default("DOP"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Santo_Domingo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(), key: memberRole("key").notNull().unique(), name: varchar("name", { length: 80 }).notNull(),
});
export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(), key: varchar("key", { length: 100 }).notNull().unique(), description: text("description").notNull(),
});
export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export const branches = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 120 }).notNull(), code: varchar("code", { length: 32 }).notNull(),
  active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("branches_tenant_code_uidx").on(t.tenantId, t.code), uniqueIndex("branches_tenant_id_uidx").on(t.tenantId, t.id)]);

export const tenantMemberships = pgTable("tenant_memberships", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull(), role: memberRole("role").notNull(), branchId: uuid("branch_id"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenant_memberships_tenant_user_uidx").on(t.tenantId, t.userId), index("tenant_memberships_user_idx").on(t.userId),
  foreignKey({ name: "tenant_memberships_branch_tenant_fk", columns: [t.tenantId, t.branchId], foreignColumns: [branches.tenantId, branches.id] }),
]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), branchId: uuid("branch_id"),
  createdBy: uuid("created_by"), createdByName: text("created_by_name"),
  fullName: varchar("full_name", { length: 200 }).notNull(), identityNumber: text("identity_number"), phone: text("phone"), address: text("address"),
  employer: text("employer"), monthlyIncome: numeric("monthly_income", { precision: 14, scale: 2 }), referenceName: text("reference_name"), referencePhone: text("reference_phone"),
  referenceRelationship: varchar("reference_relationship", { length: 20 }),
  referenceIdentityNumber: varchar("reference_identity_number", { length: 13 }),
  occupation: text("occupation"), employmentType: varchar("employment_type", { length: 40 }), employmentTenureMonths: integer("employment_tenure_months"),
  verifiedMonthlyIncome: numeric("verified_monthly_income", { precision: 14, scale: 2 }), otherVerifiableIncome: numeric("other_verifiable_income", { precision: 14, scale: 2 }),
  essentialMonthlyExpenses: numeric("essential_monthly_expenses", { precision: 14, scale: 2 }), existingMonthlyDebts: numeric("existing_monthly_debts", { precision: 14, scale: 2 }),
  verifiedMonthlyDebts: numeric("verified_monthly_debts", { precision: 14, scale: 2 }), dependentsCount: integer("dependents_count"),
  housingType: varchar("housing_type", { length: 40 }), monthlyRentExpense: numeric("monthly_rent_expense", { precision: 14, scale: 2 }),
  workReferenceName: text("work_reference_name"), workReferencePhone: text("work_reference_phone"),
  socialMedia: text("social_media"), homeLocation: text("home_location"),
  incomeVerificationStatus: varchar("income_verification_status", { length: 24 }).notNull().default("declared"),
  identityVerificationStatus: varchar("identity_verification_status", { length: 24 }).notNull().default("declared"),
  employmentVerificationStatus: varchar("employment_verification_status", { length: 24 }).notNull().default("declared"),
  financialDataConsent: boolean("financial_data_consent").notNull().default(false),
  financialDataConsentAt: timestamp("financial_data_consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customers_tenant_created_idx").on(t.tenantId, t.createdAt), uniqueIndex("customers_tenant_id_uidx").on(t.tenantId, t.id),
  index("customers_tenant_seller_idx").on(t.tenantId, t.createdBy, t.createdAt),
  foreignKey({ name: "customers_branch_tenant_fk", columns: [t.tenantId, t.branchId], foreignColumns: [branches.tenantId, branches.id] }),
]);
const photoBytes = customType<{ data: string }>({ dataType: () => "bytea" });
export const customerPhotos = pgTable("customer_photos", {
  customerId: uuid("customer_id").primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  imageData: photoBytes("image_data").notNull(), contentType: text("content_type").notNull().default("image/webp"),
  updatedBy: uuid("updated_by").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "customer_photos_customer_tenant_fk", columns: [t.tenantId,t.customerId], foreignColumns: [customers.tenantId,customers.id] }),
  index("customer_photos_tenant_idx").on(t.tenantId),
]);

export const customerDocuments = pgTable("customer_documents", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), customerId: uuid("customer_id").notNull(),
  storagePath: text("storage_path").notNull(), documentType: varchar("document_type", { length: 60 }).notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }), retentionUntil: date("retention_until"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customer_documents_tenant_idx").on(t.tenantId),
  foreignKey({ name: "customer_documents_customer_tenant_fk", columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id] }),
]);

export const mdmProviders = pgTable("mdm_providers", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  providerKey: varchar("provider_key", { length: 64 }).notNull(), displayName: varchar("display_name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false), capabilities: jsonb("capabilities").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mdm_providers_tenant_key_uidx").on(t.tenantId, t.providerKey), uniqueIndex("mdm_providers_tenant_id_uidx").on(t.tenantId, t.id)]);
export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id"),
  imei: text("imei").notNull(), brand: varchar("brand", { length: 80 }).notNull(), model: varchar("model", { length: 120 }).notNull(),
  serialNumber: text("serial_number"), mdmProviderId: uuid("mdm_provider_id"), externalId: text("external_id"),
  enrollmentStatus: varchar("enrollment_status", { length: 24 }).notNull().default("not_enrolled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("devices_tenant_imei_uidx").on(t.tenantId, t.imei), index("devices_tenant_idx").on(t.tenantId), uniqueIndex("devices_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "devices_provider_tenant_fk", columns: [t.tenantId, t.mdmProviderId], foreignColumns: [mdmProviders.tenantId, mdmProviders.id] }),
]);

export const creditApplications = pgTable("credit_applications", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  customerId: uuid("customer_id").notNull(), deviceId: uuid("device_id"), branchId: uuid("branch_id"),
  requestedAmount: numeric("requested_amount", { precision: 14, scale: 2 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  quoteSnapshot: jsonb("quote_snapshot").notNull().default({}), submissionKey: uuid("submission_key").notNull().defaultRandom(),
  reviewNotes: text("review_notes"), additionalChargeCategory: varchar("additional_charge_category", { length: 100 }),
  additionalChargeBasis: text("additional_charge_basis"), additionalChargeApprovedBy: uuid("additional_charge_approved_by"),
  additionalChargeApprovedAt: timestamp("additional_charge_approved_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(), createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("credit_applications_tenant_creator_status_idx").on(t.tenantId, t.createdBy, t.status, t.createdAt),
  index("credit_applications_tenant_status_idx").on(t.tenantId, t.status),
  uniqueIndex("credit_applications_tenant_id_uidx").on(t.tenantId, t.id),
  uniqueIndex("credit_applications_submission_uidx").on(t.tenantId, t.createdBy, t.submissionKey),
  foreignKey({ name: "applications_customer_tenant_fk", columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id] }),
  foreignKey({ name: "applications_device_tenant_fk", columns: [t.tenantId, t.deviceId], foreignColumns: [devices.tenantId, devices.id] }),
  foreignKey({ name: "applications_branch_tenant_fk", columns: [t.tenantId, t.branchId], foreignColumns: [branches.tenantId, branches.id] }),
]);
export const creditApplicationEvents = pgTable("credit_application_events", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull(), applicationId: uuid("application_id").notNull(),
  branchId: uuid("branch_id"),
  actorId: uuid("actor_id").notNull(), eventType: varchar("event_type", { length: 48 }).notNull(),
  fromStatus: varchar("from_status", { length: 24 }), toStatus: varchar("to_status", { length: 24 }),
  notes: text("notes"), metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("credit_application_events_tenant_application_idx").on(t.tenantId, t.applicationId, t.createdAt),
  foreignKey({ name: "application_events_application_tenant_fk", columns: [t.tenantId, t.applicationId], foreignColumns: [creditApplications.tenantId, creditApplications.id] }),
]);
export const financingSettings = pgTable("financing_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  downPaymentPercent: numeric("down_payment_percent", { precision: 5, scale: 2 }).notNull().default("30.00"),
  annualRatePercent: numeric("annual_rate_percent", { precision: 6, scale: 3 }).notNull().default("48.000"),
  legalExpenses: numeric("legal_expenses", { precision: 14, scale: 2 }).notNull().default("1000.00"),
  allowedTerms: integer("allowed_terms").array().notNull().default([3, 5, 6, 8, 12]),
  recoveryTargetPercent: numeric("recovery_target_percent", { precision: 5, scale: 2 }).notNull().default("100.00"),
  recoveryEnabled: boolean("recovery_enabled").notNull().default(false),
  creditPolicy: jsonb("credit_policy").notNull().default({}),
  updatedBy: uuid("updated_by"), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerCreditEvaluations = pgTable("customer_credit_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id"), customerId: uuid("customer_id").notNull(),
  algorithmVersion: varchar("algorithm_version", { length: 32 }).notNull().default("kredimax-internal-v1"),
  status: varchar("status", { length: 24 }).notNull().default("incomplete"),
  totalScore: integer("total_score"), riskLevel: varchar("risk_level", { length: 32 }).notNull().default("unrated"),
  verificationState: varchar("verification_state", { length: 24 }).notNull().default("declared"),
  monthlyPaymentCapacity: numeric("monthly_payment_capacity", { precision: 14, scale: 2 }).notNull().default("0.00"),
  recommendedMaxPrincipal: numeric("recommended_max_principal", { precision: 14, scale: 2 }).notNull().default("0.00"),
  recommendedMaxSalePrice: numeric("recommended_max_sale_price", { precision: 14, scale: 2 }).notNull().default("0.00"),
  recommendedDownPayment: numeric("recommended_down_payment", { precision: 14, scale: 2 }).notNull().default("0.00"),
  recommendedTermMonths: integer("recommended_term_months").notNull().default(12),
  triggerEvent: varchar("trigger_event", { length: 48 }).notNull().default("manual_recalculation"),
  factors: jsonb("factors").notNull().default({}),
  evaluatedBy: uuid("evaluated_by"), validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customer_credit_evaluations_customer_created_idx").on(t.tenantId, t.customerId, t.createdAt),
  foreignKey({ name: "customer_credit_evaluations_customer_tenant_fk", columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id] }),
  foreignKey({ name: "customer_credit_evaluations_branch_tenant_fk", columns: [t.tenantId, t.branchId], foreignColumns: [branches.tenantId, branches.id] }),
]);
export const creditContracts = pgTable("credit_contracts", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), branchId: uuid("branch_id"), customerId: uuid("customer_id").notNull(),
  contractNumber: varchar("contract_number", { length: 64 }).notNull(), terms: jsonb("terms").notNull(), signedAt: timestamp("signed_at", { withTimezone: true }), signedBy: uuid("signed_by"),
  documentPath: text("document_path"), contractEvidenceAttested: boolean("contract_evidence_attested").notNull().default(false),
  contractEvidenceAttestedBy: uuid("contract_evidence_attested_by"), contractEvidenceAttestedAt: timestamp("contract_evidence_attested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("credit_contracts_tenant_number_uidx").on(t.tenantId, t.contractNumber), uniqueIndex("credit_contracts_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "contracts_customer_tenant_fk", columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id] }),
]);
export const loans = pgTable("loans", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), branchId: uuid("branch_id"),
  customerId: uuid("customer_id").notNull(), contractId: uuid("contract_id").notNull(), deviceId: uuid("device_id").notNull(),
  status: financingStatus("status").notNull().default("draft"), salePrice: numeric("sale_price", { precision: 14, scale: 2 }).notNull(),
  downPayment: numeric("down_payment", { precision: 14, scale: 2 }).notNull(), principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 8, scale: 5 }).notNull().default("0"), installmentCount: integer("installment_count").notNull(),
  calculationStrategy: varchar("calculation_strategy", { length: 32 }).notNull(), deliveredAt: date("delivered_at"), deliveredBy: uuid("delivered_by"),
  activatedAt: timestamp("activated_at", { withTimezone: true }), activatedBy: uuid("activated_by"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("loans_tenant_status_idx").on(t.tenantId, t.status), uniqueIndex("loans_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "loans_customer_tenant_fk", columns: [t.tenantId, t.customerId], foreignColumns: [customers.tenantId, customers.id] }),
  foreignKey({ name: "loans_contract_tenant_fk", columns: [t.tenantId, t.contractId], foreignColumns: [creditContracts.tenantId, creditContracts.id] }),
  foreignKey({ name: "loans_device_tenant_fk", columns: [t.tenantId, t.deviceId], foreignColumns: [devices.tenantId, devices.id] }),
]);
export const installments = pgTable("installments", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), loanId: uuid("loan_id").notNull(),
  sequence: integer("sequence").notNull(), dueDate: date("due_date").notNull(), amountDue: numeric("amount_due", { precision: 14, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"), status: installmentStatus("status").notNull().default("pending"),
}, (t) => [
  uniqueIndex("installments_loan_sequence_uidx").on(t.loanId, t.sequence), index("installments_tenant_due_idx").on(t.tenantId, t.dueDate), uniqueIndex("installments_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "installments_loan_tenant_fk", columns: [t.tenantId, t.loanId], foreignColumns: [loans.tenantId, loans.id] }),
]);
export const payments = pgTable("payments", {
  receiptNumber: varchar("receipt_number", { length: 64 }),
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), loanId: uuid("loan_id").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("DOP"), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  receivedBy: uuid("received_by").notNull(), paymentMethod: varchar("payment_method", { length: 32 }).notNull().default("unspecified"), reference: text("reference"),
  paymentType: varchar("payment_type", { length: 24 }).notNull().default("installment"), reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payments_tenant_receipt_uidx").on(t.tenantId, t.receiptNumber),
  uniqueIndex("payments_tenant_idempotency_uidx").on(t.tenantId, t.idempotencyKey), index("payments_tenant_received_idx").on(t.tenantId, t.receivedAt), uniqueIndex("payments_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "payments_loan_tenant_fk", columns: [t.tenantId, t.loanId], foreignColumns: [loans.tenantId, loans.id] }),
]);
export const cashClosings = pgTable("cash_closings", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  branchId: uuid("branch_id").notNull(), sellerId: uuid("seller_id").notNull(), businessDate: date("business_date").notNull(),
  paymentType: varchar("payment_type", { length: 24 }).notNull(),
  expectedCash: numeric("expected_cash", { precision: 14, scale: 2 }).notNull(),
  expectedTransfer: numeric("expected_transfer", { precision: 14, scale: 2 }).notNull(),
  expectedOther: numeric("expected_other", { precision: 14, scale: 2 }).notNull(),
  declaredCash: numeric("declared_cash", { precision: 14, scale: 2 }).notNull(),
  declaredTransfer: numeric("declared_transfer", { precision: 14, scale: 2 }).notNull(),
  declaredOther: numeric("declared_other", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"), closedBy: uuid("closed_by").notNull(), closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cash_closings_drawer_uidx").on(t.tenantId, t.branchId, t.sellerId, t.businessDate, t.paymentType),
  foreignKey({ columns: [t.tenantId, t.branchId], foreignColumns: [branches.tenantId, branches.id] }),
  foreignKey({ columns: [t.tenantId, t.sellerId], foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }),
]);
export const paymentEvidence = pgTable("payment_evidence", {
  paymentId: uuid("payment_id").primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  imageData: photoBytes("image_data").notNull(), contentType: text("content_type").notNull().default("image/webp"),
  imageSha256: text("image_sha256").generatedAlwaysAs(sql`encode(sha256(image_data),'hex')`),
  evidenceKind: text("evidence_kind").notNull(), signedReceiptAttested: boolean("signed_receipt_attested").notNull().default(false),
  createdBy: uuid("created_by").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("payment_evidence_tenant_idx").on(t.tenantId), foreignKey({ columns: [t.tenantId, t.paymentId], foreignColumns: [payments.tenantId, payments.id] })]);
export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  paymentId: uuid("payment_id").notNull(), installmentId: uuid("installment_id").notNull(), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
}, (t) => [
  uniqueIndex("payment_allocations_payment_installment_uidx").on(t.paymentId, t.installmentId), index("payment_allocations_tenant_idx").on(t.tenantId),
  foreignKey({ name: "allocations_payment_tenant_fk", columns: [t.tenantId, t.paymentId], foreignColumns: [payments.tenantId, payments.id] }),
  foreignKey({ name: "allocations_installment_tenant_fk", columns: [t.tenantId, t.installmentId], foreignColumns: [installments.tenantId, installments.id] }),
]);

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: varchar("code", { length: 32 }).notNull(), name: varchar("name", { length: 120 }).notNull(), currency: varchar("currency", { length: 3 }).notNull().default("DOP"),
}, (t) => [uniqueIndex("ledger_accounts_tenant_code_uidx").on(t.tenantId, t.code), uniqueIndex("ledger_accounts_tenant_id_uidx").on(t.tenantId, t.id)]);
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), branchId: uuid("branch_id"), accountId: uuid("account_id").notNull(),
  paymentId: uuid("payment_id"), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), entryType: varchar("entry_type", { length: 24 }).notNull(),
  reversesEntryId: uuid("reverses_entry_id"), description: text("description").notNull(), createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ledger_entries_tenant_created_idx").on(t.tenantId, t.createdAt),
  uniqueIndex("ledger_entries_tenant_id_uidx").on(t.tenantId, t.id),
  foreignKey({ name: "ledger_entries_account_tenant_fk", columns: [t.tenantId, t.accountId], foreignColumns: [ledgerAccounts.tenantId, ledgerAccounts.id] }),
  foreignKey({ name: "ledger_entries_payment_tenant_fk", columns: [t.tenantId, t.paymentId], foreignColumns: [payments.tenantId, payments.id] }),
  foreignKey({ name: "ledger_entries_reversal_tenant_fk", columns: [t.tenantId, t.reversesEntryId], foreignColumns: [t.tenantId, t.id] }),
]);

export const mdmCommands = pgTable("mdm_commands", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), deviceId: uuid("device_id").notNull(),
  commandType: varchar("command_type", { length: 32 }).notNull(), status: varchar("status", { length: 24 }).notNull().default("queued"),
  requestedBy: uuid("requested_by").notNull(), confirmationAt: timestamp("confirmation_at", { withTimezone: true }),
  providerResponse: jsonb("provider_response"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mdm_commands_tenant_device_idx").on(t.tenantId, t.deviceId),
  foreignKey({ name: "mdm_commands_device_tenant_fk", columns: [t.tenantId, t.deviceId], foreignColumns: [devices.tenantId, devices.id] }),
]);
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").references(() => tenants.id), branchId: uuid("branch_id"), actorId: uuid("actor_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(), entityType: varchar("entity_type", { length: 80 }).notNull(), entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt)]);
export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id), settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), userId: uuid("user_id").notNull(),
  category: varchar("category", { length: 60 }).notNull(), title: varchar("title", { length: 200 }).notNull(), body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)]);
