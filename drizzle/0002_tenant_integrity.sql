ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "credit_contracts" DROP CONSTRAINT "credit_contracts_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_documents" DROP CONSTRAINT "customer_documents_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "installments" DROP CONSTRAINT "installments_loan_id_loans_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_contract_id_credit_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_device_id_devices_id_fk";
--> statement-breakpoint
ALTER TABLE "mdm_commands" DROP CONSTRAINT "mdm_commands_device_id_devices_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_installment_id_installments_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_loan_id_loans_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "branches_tenant_id_uidx" ON "branches" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_contracts_tenant_id_uidx" ON "credit_contracts" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_id_uidx" ON "customers" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "devices_tenant_id_uidx" ON "devices" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "installments_tenant_id_uidx" ON "installments" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_tenant_id_uidx" ON "ledger_accounts" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_tenant_id_uidx" ON "ledger_entries" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "loans_tenant_id_uidx" ON "loans" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mdm_providers_tenant_id_uidx" ON "mdm_providers" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tenant_id_uidx" ON "payments" USING btree ("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "applications_customer_tenant_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "applications_branch_tenant_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_contracts" ADD CONSTRAINT "contracts_customer_tenant_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_tenant_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_tenant_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_provider_tenant_fk" FOREIGN KEY ("tenant_id","mdm_provider_id") REFERENCES "public"."mdm_providers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_tenant_fk" FOREIGN KEY ("tenant_id","loan_id") REFERENCES "public"."loans"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_tenant_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."ledger_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_tenant_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversal_tenant_fk" FOREIGN KEY ("tenant_id","reverses_entry_id") REFERENCES "public"."ledger_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_tenant_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_contract_tenant_fk" FOREIGN KEY ("tenant_id","contract_id") REFERENCES "public"."credit_contracts"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_device_tenant_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mdm_commands" ADD CONSTRAINT "mdm_commands_device_tenant_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_payment_tenant_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_installment_tenant_fk" FOREIGN KEY ("tenant_id","installment_id") REFERENCES "public"."installments"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_tenant_fk" FOREIGN KEY ("tenant_id","loan_id") REFERENCES "public"."loans"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_branch_tenant_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;
