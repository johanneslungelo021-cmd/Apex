-- Migration 017: Security Revokes
-- REVOKE PUBLIC from all 17 SECURITY DEFINER functions
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT n.nspname, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I() FROM PUBLIC', r.nspname, r.proname);
    END LOOP;
END $$;
