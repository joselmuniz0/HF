-- Restrict all HF Coach organization and athlete-data policies to authenticated sessions.
-- This preserves each existing USING/WITH CHECK expression while excluding anonymous access.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

-- Helper functions are used by authenticated RLS policies and the service role,
-- but must not be directly callable by anonymous API clients.
REVOKE EXECUTE ON FUNCTION public.can_access_athlete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_athlete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
