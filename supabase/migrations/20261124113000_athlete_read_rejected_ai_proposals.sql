-- Let the athlete read the final decision and rejection reason for their own AI proposal.
drop policy if exists "athletes read own personal AI plan proposals" on public.training_plans;
create policy "athletes read own personal AI plan proposals"
  on public.training_plans
  for select to authenticated
  using (
    generation_source='coach_ai_personal'
    and status in ('draft','rejected')
    and created_by=(select auth.uid())
    and exists (
      select 1 from public.athlete_accounts aa
      where aa.athlete_id=training_plans.athlete_id
        and aa.organization_id=training_plans.organization_id
        and aa.user_id=(select auth.uid())
        and aa.account_status='active'
    )
  );
