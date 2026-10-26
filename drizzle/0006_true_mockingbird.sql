ALTER TABLE "financing_settings" ALTER COLUMN "recovery_enabled" SET DEFAULT false;
--> statement-breakpoint
UPDATE public.financing_settings SET recovery_enabled = false;
