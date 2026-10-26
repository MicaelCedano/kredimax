-- Keep the three-argument call supported by defaults on the five-argument function.
-- The explicit three-argument wrappers conflict with that signature's defaults.
DROP FUNCTION IF EXISTS public.record_loan_payment(uuid,numeric,uuid);
DROP FUNCTION IF EXISTS app_private.record_loan_payment(uuid,numeric,uuid);
