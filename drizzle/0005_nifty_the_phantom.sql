ALTER TABLE "financing_settings" ALTER COLUMN "allowed_terms" SET DEFAULT '{3,5,6,8,12,18,24}';
--> statement-breakpoint
ALTER TABLE public.financing_settings DROP CONSTRAINT financing_settings_terms_valid;
--> statement-breakpoint
UPDATE public.financing_settings
SET allowed_terms = ARRAY(
  SELECT DISTINCT term
  FROM unnest(array_append(allowed_terms, 5)) AS terms(term)
  ORDER BY term
)
WHERE NOT (5 = ANY(allowed_terms));
--> statement-breakpoint
ALTER TABLE public.financing_settings
  ADD CONSTRAINT financing_settings_terms_valid
  CHECK(cardinality(allowed_terms) > 0 AND allowed_terms <@ ARRAY[3,5,6,8,12,18,24]);
