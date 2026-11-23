-- Personal AI weekly plans must be persisted as drafts for human review.
-- An athlete can read only their own AI draft; only a coach/admin can publish it.

do $migration$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(p.oid)
    into v_original
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_athlete_ai_weekly_plan'
    and pg_get_function_identity_arguments(p.oid) =
      'p_athlete_id uuid, p_name text, p_objective text, p_training_phase text, p_athlete_level smallint, p_start_date date, p_end_date date, p_notes text, p_weeks jsonb, p_sessions jsonb, p_ai_model text';

  if v_original is null then
    raise exception 'No se encontró la función create_athlete_ai_weekly_plan esperada.';
  end if;

  v_definition := v_original;
  v_definition := replace(
    v_definition,
    'and p.status = ''active''',
    'and p.status in (''draft'', ''active'')'
  );
  v_definition := replace(
    v_definition,
    'p_start_date, p_end_date, ''active'', v_user_id,',
    'p_start_date, p_end_date, ''draft'', v_user_id,'
  );
  v_definition := replace(
    v_definition,
    '''coach_ai_personal'', p_ai_model, v_user_id, v_now, v_now, v_user_id',
    '''coach_ai_personal'', p_ai_model, null, null, null, null'
  );

  if v_definition = v_original
     or position('p_start_date, p_end_date, ''draft'', v_user_id,' in v_definition) = 0
     or position('p.status in (''draft'', ''active'')' in v_definition) = 0
     or position('''coach_ai_personal'', p_ai_model, null, null, null, null' in v_definition) = 0 then
    raise exception 'No se pudo transformar la función personal de IA en una propuesta pendiente de revisión.';
  end if;

  execute v_definition;
end;
$migration$;

-- The athlete can create their own proposal, but never an active/published plan.
drop policy if exists "athletes create own personal AI plans" on public.training_plans;
create policy "athletes create own personal AI plans"
  on public.training_plans
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and generation_source = 'coach_ai_personal'
    and status = 'draft'
    and exists (
      select 1
      from public.athlete_accounts aa
      where aa.athlete_id = training_plans.athlete_id
        and aa.organization_id = training_plans.organization_id
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

-- The athlete can inspect only their own unapproved AI proposals.
drop policy if exists "athletes read own personal AI plan proposals" on public.training_plans;
create policy "athletes read own personal AI plan proposals"
  on public.training_plans
  for select to authenticated
  using (
    generation_source = 'coach_ai_personal'
    and status = 'draft'
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.athlete_accounts aa
      where aa.athlete_id = training_plans.athlete_id
        and aa.organization_id = training_plans.organization_id
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

-- Allow the authenticated athlete RPC to write child rows while the plan is a draft.
drop policy if exists "athletes create own personal AI plan weeks" on public.training_plan_weeks;
create policy "athletes create own personal AI plan weeks"
  on public.training_plan_weeks
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.training_plans p
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where p.id = training_plan_weeks.plan_id
        and p.athlete_id = training_plan_weeks.athlete_id
        and p.organization_id = training_plan_weeks.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes create own personal AI plan sessions" on public.training_plan_sessions;
create policy "athletes create own personal AI plan sessions"
  on public.training_plan_sessions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.training_plans p
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where p.id = training_plan_sessions.plan_id
        and p.athlete_id = training_plan_sessions.athlete_id
        and p.organization_id = training_plan_sessions.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes create own personal AI plan items" on public.training_plan_items;
create policy "athletes create own personal AI plan items"
  on public.training_plan_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.training_plan_sessions s
      join public.training_plans p on p.id = s.plan_id
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where s.id = training_plan_items.plan_session_id
        and s.athlete_id = training_plan_items.athlete_id
        and p.athlete_id = training_plan_items.athlete_id
        and p.organization_id = training_plan_items.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes create own personal AI plan blocks" on public.training_plan_item_blocks;
create policy "athletes create own personal AI plan blocks"
  on public.training_plan_item_blocks
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.training_plan_items i
      join public.training_plan_sessions s on s.id = i.plan_session_id
      join public.training_plans p on p.id = s.plan_id
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where i.id = training_plan_item_blocks.plan_item_id
        and i.athlete_id = training_plan_item_blocks.athlete_id
        and p.athlete_id = training_plan_item_blocks.athlete_id
        and p.organization_id = training_plan_item_blocks.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

-- Draft plan detail is visible only to the athlete who generated it and to coaches/admins
-- already covered by the existing coach-management policies.
drop policy if exists "athletes read own personal AI plan weeks" on public.training_plan_weeks;
create policy "athletes read own personal AI plan weeks"
  on public.training_plan_weeks
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_plans p
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where p.id = training_plan_weeks.plan_id
        and p.athlete_id = training_plan_weeks.athlete_id
        and p.organization_id = training_plan_weeks.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes read own personal AI plan sessions" on public.training_plan_sessions;
create policy "athletes read own personal AI plan sessions"
  on public.training_plan_sessions
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_plans p
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where p.id = training_plan_sessions.plan_id
        and p.athlete_id = training_plan_sessions.athlete_id
        and p.organization_id = training_plan_sessions.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes read own personal AI plan items" on public.training_plan_items;
create policy "athletes read own personal AI plan items"
  on public.training_plan_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_plan_sessions s
      join public.training_plans p on p.id = s.plan_id
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where s.id = training_plan_items.plan_session_id
        and s.athlete_id = training_plan_items.athlete_id
        and p.athlete_id = training_plan_items.athlete_id
        and p.organization_id = training_plan_items.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );

drop policy if exists "athletes read own personal AI plan blocks" on public.training_plan_item_blocks;
create policy "athletes read own personal AI plan blocks"
  on public.training_plan_item_blocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_plan_items i
      join public.training_plan_sessions s on s.id = i.plan_session_id
      join public.training_plans p on p.id = s.plan_id
      join public.athlete_accounts aa
        on aa.athlete_id = p.athlete_id
       and aa.organization_id = p.organization_id
      where i.id = training_plan_item_blocks.plan_item_id
        and i.athlete_id = training_plan_item_blocks.athlete_id
        and p.athlete_id = training_plan_item_blocks.athlete_id
        and p.organization_id = training_plan_item_blocks.organization_id
        and p.generation_source = 'coach_ai_personal'
        and p.status = 'draft'
        and p.created_by = (select auth.uid())
        and aa.user_id = (select auth.uid())
        and aa.account_status = 'active'
    )
  );
