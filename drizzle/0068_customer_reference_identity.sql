-- Optional personal-reference identity; no historical customer or contract is rewritten.
ALTER TABLE public.customers ADD COLUMN reference_identity_number varchar(13);
--> statement-breakpoint
ALTER TABLE public.customers ADD CONSTRAINT customers_reference_identity_number_check
  CHECK (reference_identity_number IS NULL OR reference_identity_number ~ '^[0-9]{3}-[0-9]{7}-[0-9]$');
