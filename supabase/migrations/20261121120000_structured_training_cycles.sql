
alter table public.training_plans
  add column if not exists athlete_level smallint,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null;

alter table public.training_plan_sessions
  add column if not exists session_reference text;

alter table public.training_plan_items
  add column if not exists exercise_kind text not null default 'single',
  add column if not exists group_type text,
  add column if not exists group_label text,
  add column if not exists original_notation text;

create table if not exists public.training_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  athlete_id uuid not null,
  plan_id uuid not null,
  week_number smallint not null check (week_number > 0),
  period text not null default 'preparatorio'
    check (period in ('preparatorio','competitivo','transicion')),
  athlete_level smallint check (athlete_level between 1 and 10),
  oly_repetitions integer check (oly_repetitions is null or oly_repetitions >= 0),
  strength_repetitions integer check (strength_repetitions is null or strength_repetitions >= 0),
  total_repetitions integer check (total_repetitions is null or total_repetitions >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plan_weeks_plan_athlete_fk
    foreign key (plan_id, athlete_id) references public.training_plans(id, athlete_id) on delete cascade,
  constraint training_plan_weeks_athlete_org_fk
    foreign key (athlete_id, organization_id) references public.athletes(id, organization_id) on delete restrict,
  constraint training_plan_weeks_unique unique (plan_id, week_number)
);

create table if not exists public.training_plan_item_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  athlete_id uuid not null,
  plan_item_id uuid not null references public.training_plan_items(id) on delete cascade,
  sequence_number smallint not null check (sequence_number > 0),
  sets smallint check (sets is null or sets > 0),
  reps text not null,
  intensity_type text not null default 'none'
    check (intensity_type in ('percent','kg','rpe','none')),
  intensity_value numeric(7,2),
  reference_exercise text,
  reference_load_kg numeric(10,2) check (reference_load_kg is null or reference_load_kg > 0),
  target_load_kg numeric(10,2) check (target_load_kg is null or target_load_kg > 0),
  target_rpe numeric(3,1) check (target_rpe is null or (target_rpe between 1 and 10)),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  tempo text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plan_item_blocks_athlete_org_fk
    foreign key (athlete_id, organization_id) references public.athletes(id, organization_id) on delete restrict,
  constraint training_plan_item_blocks_sequence_unique unique (plan_item_id, sequence_number)
);

create index if not exists training_plan_weeks_plan_idx
  on public.training_plan_weeks(plan_id, week_number);
create index if not exists training_plan_item_blocks_item_idx
  on public.training_plan_item_blocks(plan_item_id, sequence_number);

create table if not exists public.training_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) >= 2),
  description text,
  template_data jsonb not null check (jsonb_typeof(template_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_plan_templates_org_idx
  on public.training_plan_templates(organization_id, created_at desc);

alter table public.training_plan_weeks enable row level security;
alter table public.training_plan_item_blocks enable row level security;
alter table public.training_plan_templates enable row level security;

drop policy if exists "plan weeks visible to linked parties" on public.training_plan_weeks;
create policy "plan weeks visible to linked parties"
  on public.training_plan_weeks for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or exists (
      select 1 from public.training_plans p
      where p.id = training_plan_weeks.plan_id
        and p.athlete_id = training_plan_weeks.athlete_id
        and p.organization_id = training_plan_weeks.organization_id
        and p.status = 'active'
        and private.can_access_athlete_in_org(p.athlete_id, p.organization_id)
    )
  );
drop policy if exists "coaches manage plan weeks" on public.training_plan_weeks;
create policy "coaches manage plan weeks"
  on public.training_plan_weeks for all to authenticated
  using (private.can_manage_athlete_in_org(athlete_id, organization_id))
  with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "plan blocks visible to linked parties" on public.training_plan_item_blocks;
create policy "plan blocks visible to linked parties"
  on public.training_plan_item_blocks for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or exists (
      select 1
      from public.training_plan_items i
      join public.training_plan_sessions s on s.id = i.plan_session_id
      join public.training_plans p on p.id = s.plan_id
      where i.id = training_plan_item_blocks.plan_item_id
        and i.athlete_id = training_plan_item_blocks.athlete_id
        and p.status = 'active'
        and private.can_access_athlete_in_org(p.athlete_id, p.organization_id)
    )
  );
drop policy if exists "coaches manage plan blocks" on public.training_plan_item_blocks;
create policy "coaches manage plan blocks"
  on public.training_plan_item_blocks for all to authenticated
  using (private.can_manage_athlete_in_org(athlete_id, organization_id))
  with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "organization coaches read plan templates" on public.training_plan_templates;
create policy "organization coaches read plan templates"
  on public.training_plan_templates for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = training_plan_templates.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin','coach')
    )
  );
drop policy if exists "organization coaches create plan templates" on public.training_plan_templates;
create policy "organization coaches create plan templates"
  on public.training_plan_templates for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = training_plan_templates.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin','coach')
    )
  );
drop policy if exists "organization coaches update plan templates" on public.training_plan_templates;
create policy "organization coaches update plan templates"
  on public.training_plan_templates for update to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = training_plan_templates.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin','coach')
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = training_plan_templates.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin','coach')
    )
  );
drop policy if exists "organization coaches delete plan templates" on public.training_plan_templates;
create policy "organization coaches delete plan templates"
  on public.training_plan_templates for delete to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = training_plan_templates.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin','coach')
    )
  );

drop policy if exists "training plans visible to linked parties" on public.training_plans;
create policy "training plans visible to linked parties"
  on public.training_plans for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or (status = 'active' and private.can_access_athlete_in_org(athlete_id, organization_id))
  );

drop policy if exists "plan sessions visible to linked parties" on public.training_plan_sessions;
create policy "plan sessions visible to linked parties"
  on public.training_plan_sessions for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or exists (
      select 1 from public.training_plans p
      where p.id = training_plan_sessions.plan_id
        and p.athlete_id = training_plan_sessions.athlete_id
        and p.status = 'active'
        and private.can_access_athlete_in_org(p.athlete_id, p.organization_id)
    )
  );

drop policy if exists "plan items visible to linked parties" on public.training_plan_items;
create policy "plan items visible to linked parties"
  on public.training_plan_items for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or exists (
      select 1
      from public.training_plan_sessions s
      join public.training_plans p on p.id = s.plan_id
      where s.id = training_plan_items.plan_session_id
        and s.athlete_id = training_plan_items.athlete_id
        and p.status = 'active'
        and private.can_access_athlete_in_org(p.athlete_id, p.organization_id)
    )
  );

create or replace function public.create_training_cycle_atomic(
  p_athlete_id uuid,
  p_name text,
  p_objective text,
  p_training_phase text,
  p_athlete_level smallint,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_weeks jsonb,
  p_sessions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_plan_id uuid;
  v_week jsonb;
  v_session jsonb;
  v_exercise jsonb;
  v_block jsonb;
  v_week_number smallint;
  v_day_number smallint;
  v_session_order smallint;
  v_session_id uuid;
  v_item_id uuid;
  v_item_index bigint;
  v_block_index bigint;
  v_sets smallint;
  v_reps text;
  v_intensity_type text;
  v_intensity_value numeric(7,2);
  v_reference_load numeric(10,2);
  v_target_load numeric(10,2);
  v_target_rpe numeric(3,1);
  v_rest integer;
  v_total_sets integer;
  v_first_block jsonb;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_athlete_id is null then raise exception 'Seleccioná un atleta.'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then raise exception 'El ciclo necesita un nombre de al menos 2 caracteres.'; end if;
  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception 'Revisá las fechas del ciclo.';
  end if;
  if p_athlete_level is not null and p_athlete_level not between 1 and 10 then
    raise exception 'El nivel del atleta debe estar entre 1 y 10.';
  end if;
  if jsonb_typeof(p_weeks) <> 'array' or jsonb_array_length(p_weeks) = 0 then
    raise exception 'El ciclo debe contener al menos un microciclo.';
  end if;
  if jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'El ciclo debe contener al menos una sesión.';
  end if;

  select a.organization_id into v_organization_id
  from public.athletes a where a.id = p_athlete_id;

  if v_organization_id is null or not private.can_manage_athlete_in_org(p_athlete_id, v_organization_id) then
    raise exception 'No tenés permisos para planificar a este atleta.';
  end if;

  insert into public.training_plans (
    organization_id, athlete_id, name, objective, training_phase,
    start_date, end_date, status, created_by, notes, athlete_level
  ) values (
    v_organization_id, p_athlete_id, btrim(p_name),
    nullif(btrim(coalesce(p_objective,'')), ''),
    nullif(btrim(coalesce(p_training_phase,'')), ''),
    p_start_date, p_end_date, 'draft', v_user_id,
    nullif(btrim(coalesce(p_notes,'')), ''), p_athlete_level
  ) returning id into v_plan_id;

  for v_week in select value from jsonb_array_elements(p_weeks) loop
    v_week_number := nullif(v_week->>'week_number','')::smallint;
    if v_week_number is null or v_week_number < 1 then raise exception 'Número de microciclo inválido.'; end if;
    insert into public.training_plan_weeks (
      organization_id, athlete_id, plan_id, week_number, period, athlete_level,
      oly_repetitions, strength_repetitions, total_repetitions, notes
    ) values (
      v_organization_id, p_athlete_id, v_plan_id, v_week_number,
      coalesce(nullif(v_week->>'period',''),'preparatorio'),
      nullif(v_week->>'athlete_level','')::smallint,
      nullif(v_week->>'oly_repetitions','')::integer,
      nullif(v_week->>'strength_repetitions','')::integer,
      nullif(v_week->>'total_repetitions','')::integer,
      nullif(btrim(coalesce(v_week->>'notes','')), '')
    );
  end loop;

  for v_session in select value from jsonb_array_elements(p_sessions) loop
    v_week_number := nullif(v_session->>'week_number','')::smallint;
    v_day_number := nullif(v_session->>'day_number','')::smallint;
    v_session_order := coalesce(nullif(v_session->>'session_order','')::smallint,1);
    if not exists(select 1 from public.training_plan_weeks w where w.plan_id=v_plan_id and w.week_number=v_week_number) then
      raise exception 'La sesión refiere a una semana que no existe en el ciclo.';
    end if;
    if v_day_number is null or v_day_number not between 1 and 7 or v_session_order < 1 then
      raise exception 'Revisá el día y el orden de cada sesión.';
    end if;
    if nullif(btrim(coalesce(v_session->>'session_title','')), '') is null then
      raise exception 'Cada sesión necesita un título.';
    end if;
    if jsonb_typeof(v_session->'exercises') <> 'array' or jsonb_array_length(v_session->'exercises') = 0 then
      raise exception 'Cada sesión debe contener al menos un ejercicio.';
    end if;

    insert into public.training_plan_sessions (
      organization_id, athlete_id, plan_id, week_number, day_number,
      session_order, scheduled_date, session_title, focus, notes, session_reference
    ) values (
      v_organization_id, p_athlete_id, v_plan_id, v_week_number, v_day_number,
      v_session_order, nullif(v_session->>'scheduled_date','')::date,
      btrim(v_session->>'session_title'),
      nullif(btrim(coalesce(v_session->>'focus','')), ''),
      nullif(btrim(coalesce(v_session->>'notes','')), ''),
      nullif(btrim(coalesce(v_session->>'session_reference','')), '')
    ) returning id into v_session_id;

    for v_exercise, v_item_index in
      select value, ordinality from jsonb_array_elements(v_session->'exercises') with ordinality as e(value,ordinality)
    loop
      if nullif(btrim(coalesce(v_exercise->>'exercise_name','')), '') is null then
        raise exception 'Hay un ejercicio sin nombre.';
      end if;
      if jsonb_typeof(v_exercise->'blocks') <> 'array' or jsonb_array_length(v_exercise->'blocks') = 0 then
        raise exception 'Cada ejercicio necesita al menos un bloque de prescripción.';
      end if;

      v_first_block := v_exercise->'blocks'->0;
      v_total_sets := 0;
      for v_block in select value from jsonb_array_elements(v_exercise->'blocks') loop
        v_sets := nullif(v_block->>'sets','')::smallint;
        if v_sets is not null and v_sets < 1 then raise exception 'Las series deben ser mayores que cero.'; end if;
        v_total_sets := v_total_sets + coalesce(v_sets,0);
      end loop;
      insert into public.training_plan_items (
        organization_id, athlete_id, plan_session_id, sequence_number,
        exercise_name_snapshot, sets, reps, target_load_kg,
        target_percent_rm, target_rpe, rest_seconds, tempo, prescription, notes,
        exercise_kind, group_type, group_label, original_notation
      ) values (
        v_organization_id, p_athlete_id, v_session_id, v_item_index::smallint,
        btrim(v_exercise->>'exercise_name'),
        nullif(v_total_sets,0)::smallint,
        'Ver bloques',
        null,
        case when (v_first_block->>'intensity_type')='percent' and nullif(v_first_block->>'intensity_value','')::numeric > 0
             then nullif(v_first_block->>'intensity_value','')::numeric else null end,
        nullif(v_first_block->>'target_rpe','')::numeric,
        nullif(v_first_block->>'rest_seconds','')::integer,
        nullif(btrim(coalesce(v_first_block->>'tempo','')), ''),
        jsonb_build_object('format','structured_blocks'),
        nullif(btrim(coalesce(v_exercise->>'notes','')), ''),
        coalesce(nullif(v_exercise->>'exercise_kind',''),'single'),
        nullif(btrim(coalesce(v_exercise->>'group_type','')), ''),
        nullif(btrim(coalesce(v_exercise->>'group_label','')), ''),
        nullif(btrim(coalesce(v_exercise->>'original_notation','')), '')
      ) returning id into v_item_id;

      for v_block, v_block_index in
        select value, ordinality from jsonb_array_elements(v_exercise->'blocks') with ordinality as b(value,ordinality)
      loop
        v_sets := nullif(v_block->>'sets','')::smallint;
        v_reps := nullif(btrim(coalesce(v_block->>'reps','')), '');
        v_intensity_type := coalesce(nullif(v_block->>'intensity_type',''),'none');
        v_intensity_value := nullif(v_block->>'intensity_value','')::numeric;
        v_reference_load := nullif(v_block->>'reference_load_kg','')::numeric;
        v_target_load := nullif(v_block->>'target_load_kg','')::numeric;
        v_target_rpe := nullif(v_block->>'target_rpe','')::numeric;
        v_rest := nullif(v_block->>'rest_seconds','')::integer;
        if v_reps is null then raise exception 'Cada bloque debe indicar sus repeticiones o duración.'; end if;
        if v_intensity_type not in ('percent','kg','rpe','none') then raise exception 'Tipo de intensidad desconocido.'; end if;
        if v_intensity_type='percent' and (v_intensity_value is null or v_intensity_value < -200 or v_intensity_value > 300) then
          raise exception 'El porcentaje debe estar entre -200 y 300.';
        end if;
        if v_intensity_type='kg' and (v_intensity_value is null or v_intensity_value < 0) then
          raise exception 'La carga absoluta debe ser válida.';
        end if;
        if v_target_load is null and v_intensity_type='percent' and v_intensity_value >= 0 and v_reference_load is not null then
          v_target_load := round((v_reference_load * v_intensity_value / 100) * 2) / 2;
          if v_target_load <= 0 then v_target_load := null; end if;
        elsif v_target_load is null and v_intensity_type='kg' then
          v_target_load := v_intensity_value;
          if v_target_load <= 0 then v_target_load := null; end if;
        end if;

        insert into public.training_plan_item_blocks (
          organization_id, athlete_id, plan_item_id, sequence_number,
          sets, reps, intensity_type, intensity_value, reference_exercise,
          reference_load_kg, target_load_kg, target_rpe, rest_seconds, tempo, notes
        ) values (
          v_organization_id, p_athlete_id, v_item_id, v_block_index::smallint,
          v_sets, v_reps, v_intensity_type, v_intensity_value,
          nullif(btrim(coalesce(v_block->>'reference_exercise','')), ''),
          v_reference_load, v_target_load, v_target_rpe, v_rest,
          nullif(btrim(coalesce(v_block->>'tempo','')), ''),
          nullif(btrim(coalesce(v_block->>'notes','')), '')
        );
      end loop;
    end loop;
  end loop;

  return v_plan_id;
end;
$function$;

revoke all on function public.create_training_cycle_atomic(uuid,text,text,text,smallint,date,date,text,jsonb,jsonb) from public;
revoke execute on function public.create_training_cycle_atomic(uuid,text,text,text,smallint,date,date,text,jsonb,jsonb) from anon;
grant execute on function public.create_training_cycle_atomic(uuid,text,text,text,smallint,date,date,text,jsonb,jsonb) to authenticated;

create or replace function public.publish_training_plan(p_plan_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_athlete_id uuid;
  v_organization_id uuid;
  v_published_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  select athlete_id, organization_id into v_athlete_id, v_organization_id
  from public.training_plans where id = p_plan_id for update;
  if v_athlete_id is null or not private.can_manage_athlete_in_org(v_athlete_id, v_organization_id) then
    raise exception 'No tenés permisos para publicar esta planificación.';
  end if;
  if not exists(select 1 from public.training_plan_sessions s where s.plan_id=p_plan_id)
     or not exists(
       select 1 from public.training_plan_items i
       join public.training_plan_sessions s on s.id=i.plan_session_id
       where s.plan_id=p_plan_id
     ) then
    raise exception 'La planificación necesita al menos una sesión y un ejercicio antes de publicarse.';
  end if;
  update public.training_plans
     set status='active', published_at=v_published_at, published_by=v_user_id,
         approved_by=v_user_id, approved_at=v_published_at, updated_at=v_published_at
   where id=p_plan_id;
  return v_published_at;
end;
$function$;

revoke all on function public.publish_training_plan(uuid) from public;
revoke execute on function public.publish_training_plan(uuid) from anon;
grant execute on function public.publish_training_plan(uuid) to authenticated;
