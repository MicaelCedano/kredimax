-- The prior version omitted the IMEI check digit; this implementation matches the shared TS rule.
CREATE OR REPLACE FUNCTION app_private.imei_is_valid(p_imei text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE i integer; total integer:=0; digit integer; doubled integer;
BEGIN
  IF p_imei !~ '^[0-9]{15}$' THEN RETURN false; END IF;
  FOR i IN REVERSE 15..1 LOOP
    digit:=substring(p_imei from i for 1)::integer;
    IF (15-i)%2=1 THEN doubled:=digit*2; digit:=CASE WHEN doubled>9 THEN doubled-9 ELSE doubled END; END IF;
    total:=total+digit;
  END LOOP;
  RETURN total%10=0;
END $$;
