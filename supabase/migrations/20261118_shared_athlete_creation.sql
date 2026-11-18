create or replace function public.save_athlete_bundle(
  p_athlete jsonb,
  p_profile jsonb default '{}'::jsonb,
  p_measurements jsonb default '[]'::jsonb,
  p_personal_records jsonb default '[]'::jsonb,
  p_assigned_coach_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_athlete_id uuid;
  v_role text;
  v_assigned_coach_id uuid;
  v_assigned_role text;
  v_item jsonb;
  v_row_id uuid;
  v_metric_key text;
  v_record_type text;
begin
  if v_user_id is null then
    raise exception 'Necesitás iniciar sesión para guardar una ficha deportiva.'
      using errcode = '28000';
  end if;

  if p_athlete is null or jsonb_typeof(p_athlete) <> 'object' then
    raise exception 'Los datos de la ficha no tienen un formato válido.'
      using errcode = '22023';
  end if;

  v_org_id := nullif(p_athlete->>'organization_id', '')::uuid;
  if v_org_id is null then
    raise exception 'Falta la organización de la ficha.'
      using errcode = '22023';
  end if;

  select m.role
    into v_role
  from public.organization_memberships m
  where m.organization_id = v_org_id
    and m.user_id = v_user_id
  limit 1;

  if v_role is null then
    raise exception 'Tu cuenta no pertenece a esta organización.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_athlete->>'full_name'), '') = '' then
    raise exception 'Ingresá el nombre y apellido del atleta.'
      using errcode = '22023';
  end if;

  if p_athlete ? 'level'
     and nullif(p_athlete->>'level', '') is not null
     and p_athlete->>'level' not in ('initial', 'intermediate', 'advanced') then
    raise exception 'El nivel deportivo seleccionado no es válido.'
      using errcode = '22023';
  end if;

  if p_athlete ? 'sex'
     and nullif(p_athlete->>'sex', '') is not null
     and p_athlete->>'sex' not in ('female', 'male', 'other') then
    raise exception 'El valor de sexo no es válido.'
      using errcode = '22023';
  end if;

  if nullif(p_athlete->>'age', '') is not null
     and (p_athlete->>'age')::integer not between 8 and 100 then
    raise exception 'La edad debe estar entre 8 y 100 años.'
      using errcode = '22023';
  end if;

  if nullif(p_athlete->>'body_weight_kg', '') is not null
     and ((p_athlete->>'body_weight_kg')::numeric < 1 or (p_athlete->>'body_weight_kg')::numeric > 300) then
    raise exception 'El peso corporal debe estar entre 1 y 300 kg.'
      using errcode = '22023';
  end if;

  if nullif(p_measurements->'height'->>'metric_value', '') is not null then
    null;
  end if;

  if nullif(p_athlete->>'snatch_kg', '') is not null
     and ((p_athlete->>'snatch_kg')::numeric < 0 or (p_athlete->>'snatch_kg')::numeric > 500) then
    raise exception 'El arranque RM debe estar entre 0 y 500 kg.'
      using errcode = '22023';
  end if;

  if nullif(p_athlete->>'clean_jerk_kg', '') is not null
     and ((p_athlete->>'clean_jerk_kg')::numeric < 0 or (p_athlete->>'clean_jerk_kg')::numeric > 500) then
    raise exception 'El envión RM debe estar entre 0 y 500 kg.'
      using errcode = '22023';
  end if;

  v_athlete_id := coalesce(
    nullif(p_athlete->>'id', '')::uuid,
    gen_random_uuid()
  );

  insert into public.athletes (
    id,
    organization_id,
    owner_coach_id,
    full_name,
    age,
    level,
    sex,
    body_weight_kg,
    snatch_kg,
    clean_jerk_kg,
    notes,
    updated_at
  )
  values (
    v_athlete_id,
    v_org_id,
    v_user_id,
    trim(p_athlete->>'full_name'),
    nullif(p_athlete->>'age', '')::integer,
    nullif(p_athlete->>'level', ''),
    nullif(p_athlete->>'sex', ''),
    nullif(p_athlete->>'body_weight_kg', '')::numeric,
    nullif(p_athlete->>'snatch_kg', '')::numeric,
    nullif(p_athlete->>'clean_jerk_kg', '')::numeric,
    nullif(trim(coalesce(p_athlete->>'notes', '')), ''),
    now()
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      age = excluded.age,
      level = excluded.level,
      sex = excluded.sex,
      body_weight_kg = excluded.body_weight_kg,
      snatch_kg = excluded.snatch_kg,
      clean_jerk_kg = excluded.clean_jerk_kg,
      notes = excluded.notes,
      updated_at = now()
  where public.athletes.organization_id = v_org_id
    and public.athletes.owner_coach_id = v_user_id
  returning id into v_athlete_id;

  if v_athlete_id is null then
    raise exception 'La ficha ya existe y no pertenece a tu cuenta o a esta organización.'
      using errcode = '42501';
  end if;

  insert into public.athlete_profiles (
    athlete_id,
    organization_id,
    date_of_birth,
    sporting_start_date,
    created_by,
    updated_by
  )
  values (
    v_athlete_id,
    v_org_id,
    nullif(p_profile->>'date_of_birth', '')::date,
    nullif(p_profile->>'sporting_start_date', '')::date,
    v_user_id,
    v_user_id
  )
  on conflict (athlete_id) do update
  set date_of_birth = excluded.date_of_birth,
      sporting_start_date = excluded.sporting_start_date,
      updated_by = v_user_id,
      updated_at = now();

  if p_measurements is not null and jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'Las mediciones iniciales no tienen un formato válido.'
      using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_measurements, '[]'::jsonb))
  loop
    v_metric_key := v_item->>'metric_key';
    if v_metric_key not in ('body_weight', 'height') then
      raise exception 'La medición inicial % no está permitida en el alta.', coalesce(v_metric_key, '(vacía)')
        using errcode = '22023';
    end if;

    v_row_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());

    insert into public.athlete_measurements (
      id,
      organization_id,
      athlete_id,
      metric_key,
      metric_value,
      unit,
      measured_at,
      recorded_by,
      validation_status,
      validated_by,
      validated_at,
      notes
    )
    values (
      v_row_id,
      v_org_id,
      v_athlete_id,
      v_metric_key,
      (v_item->>'metric_value')::numeric,
      case when v_metric_key = 'height' then 'cm' else 'kg' end,
      coalesce(nullif(v_item->>'measured_at', '')::timestamptz, now()),
      v_user_id,
      'validated',
      v_user_id,
      now(),
      nullif(trim(coalesce(v_item->>'notes', '')), '')
    )
    on conflict (id) do update
    set metric_key = excluded.metric_key,
        metric_value = excluded.metric_value,
        unit = excluded.unit,
        measured_at = excluded.measured_at,
        validation_status = 'validated',
        validated_by = v_user_id,
        validated_at = now(),
        notes = excluded.notes
    where public.athlete_measurements.athlete_id = v_athlete_id
      and public.athlete_measurements.organization_id = v_org_id;
  end loop;

  if p_personal_records is not null and jsonb_typeof(p_personal_records) <> 'array' then
    raise exception 'Las marcas iniciales no tienen un formato válido.'
      using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_personal_records, '[]'::jsonb))
  loop
    if coalesce(trim(v_item->>'exercise_name_snapshot'), '') = '' then
      raise exception 'Cada marca inicial necesita un nombre de ejercicio.'
        using errcode = '22023';
    end if;

    v_record_type := coalesce(nullif(v_item->>'record_type', ''), 'tested');
    if v_record_type not in ('tested', 'estimated', 'competition') then
      raise exception 'El tipo de marca inicial no es válido.'
        using errcode = '22023';
    end if;

    v_row_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());

    insert into public.athlete_personal_records (
      id,
      organization_id,
      athlete_id,
      exercise_name_snapshot,
      record_value_kg,
      record_date,
      record_type,
      validation_status,
      recorded_by,
      validated_by,
      validated_at,
      notes
    )
    values (
      v_row_id,
      v_org_id,
      v_athlete_id,
      trim(v_item->>'exercise_name_snapshot'),
      (v_item->>'record_value_kg')::numeric,
      coalesce(nullif(v_item->>'record_date', '')::date, current_date),
      v_record_type,
      'validated',
      v_user_id,
      v_user_id,
      now(),
      nullif(trim(coalesce(v_item->>'notes', '')), '')
    )
    on conflict (id) do update
    set exercise_name_snapshot = excluded.exercise_name_snapshot,
        record_value_kg = excluded.record_value_kg,
        record_date = excluded.record_date,
        record_type = excluded.record_type,
        validation_status = 'validated',
        validated_by = v_user_id,
        validated_at = now(),
        notes = excluded.notes
    where public.athlete_personal_records.athlete_id = v_athlete_id
      and public.athlete_personal_records.organization_id = v_org_id;
  end loop;

  v_assigned_coach_id := p_assigned_coach_id;

  if v_assigned_coach_id is null and v_role = 'coach' then
    v_assigned_coach_id := v_user_id;
  end if;

  if v_assigned_coach_id is not null then
    select m.role
      into v_assigned_role
    from public.organization_memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_assigned_coach_id
    limit 1;

    if v_assigned_role is distinct from 'coach' then
      raise exception 'El coach responsable no pertenece a esta organización o no tiene rol de coach.'
        using errcode = '22023';
    end if;

    if v_assigned_coach_id <> v_user_id and v_role <> 'admin' then
      raise exception 'Solo un administrador puede asignar la ficha a otro coach.'
        using errcode = '42501';
    end if;

    insert into public.coach_athletes (
      organization_id,
      athlete_id,
      coach_id,
      assigned_by
    )
    values (
      v_org_id,
      v_athlete_id,
      v_assigned_coach_id,
      v_user_id
    )
    on conflict (athlete_id, coach_id) do nothing;
  end if;

  return v_athlete_id;
end;
$function$;

revoke all on function public.save_athlete_bundle(jsonb, jsonb, jsonb, jsonb, uuid) from public;
revoke all on function public.save_athlete_bundle(jsonb, jsonb, jsonb, jsonb, uuid) from anon;
grant execute on function public.save_athlete_bundle(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;

comment on function public.save_athlete_bundle(jsonb, jsonb, jsonb, jsonb, uuid) is
'Atomic shared athlete onboarding for HF Coach web and Android clients. Uses caller RLS identity, enforces organization and coach assignment, and supports idempotent retries via client-generated UUIDs.';
