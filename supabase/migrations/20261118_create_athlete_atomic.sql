create or replace function public.create_athlete_atomic(
  p_organization_id uuid,
  p_full_name text,
  p_athlete_id uuid default null,
  p_age integer default null,
  p_level text default 'initial',
  p_sex text default null,
  p_date_of_birth date default null,
  p_sporting_start_date date default null,
  p_height_cm numeric default null,
  p_body_weight_kg numeric default null,
  p_snatch_kg numeric default null,
  p_clean_jerk_kg numeric default null,
  p_notes text default null,
  p_assigned_coach_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_owner_coach_id uuid;
  v_athlete_id uuid := coalesce(p_athlete_id, gen_random_uuid());
  v_age integer := p_age;
  v_existing_org uuid;
  v_existing_owner uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Iniciá sesión para crear una ficha deportiva.' using errcode = '28000';
  end if;
  if p_organization_id is null then
    raise exception 'No se indicó la organización.' using errcode = '22023';
  end if;
  if nullif(btrim(p_full_name), '') is null or length(btrim(p_full_name)) < 2 or length(btrim(p_full_name)) > 120 then
    raise exception 'Ingresá nombre y apellido (entre 2 y 120 caracteres).' using errcode = '22023';
  end if;
  if p_level is not null and p_level not in ('initial', 'intermediate', 'advanced') then
    raise exception 'El nivel deportivo no es válido.' using errcode = '22023';
  end if;
  if p_sex is not null and p_sex not in ('female', 'male', 'other') then
    raise exception 'La opción de sexo no es válida.' using errcode = '22023';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.' using errcode = '22023';
  end if;
  if p_sporting_start_date is not null and p_sporting_start_date > current_date then
    raise exception 'La fecha de inicio deportivo no puede ser futura.' using errcode = '22023';
  end if;
  if v_age is null and p_date_of_birth is not null then
    v_age := extract(year from age(current_date, p_date_of_birth))::integer;
  end if;
  if v_age is not null and (v_age < 8 or v_age > 100) then
    raise exception 'La edad debe estar entre 8 y 100 años.' using errcode = '22023';
  end if;
  if p_height_cm is not null and (p_height_cm < 50 or p_height_cm > 250) then
    raise exception 'La altura debe estar entre 50 y 250 cm.' using errcode = '22023';
  end if;
  if p_body_weight_kg is not null and (p_body_weight_kg < 20 or p_body_weight_kg > 300) then
    raise exception 'El peso corporal debe estar entre 20 y 300 kg.' using errcode = '22023';
  end if;
  if p_snatch_kg is not null and (p_snatch_kg <= 0 or p_snatch_kg > 500) then
    raise exception 'El RM de arranque debe estar entre 0,5 y 500 kg.' using errcode = '22023';
  end if;
  if p_clean_jerk_kg is not null and (p_clean_jerk_kg <= 0 or p_clean_jerk_kg > 500) then
    raise exception 'El RM de envión debe estar entre 0,5 y 500 kg.' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.organization_memberships m
  where m.organization_id = p_organization_id and m.user_id = v_user_id
  limit 1;

  if v_role is null then
    raise exception 'Tu cuenta no pertenece a esta organización.' using errcode = '42501';
  end if;

  if v_role = 'coach' then
    if p_assigned_coach_id is not null and p_assigned_coach_id <> v_user_id then
      raise exception 'Un coach solo puede asignar la ficha a su propia cuenta.' using errcode = '42501';
    end if;
    v_owner_coach_id := v_user_id;
  elsif v_role = 'admin' then
    if p_assigned_coach_id is null then
      v_owner_coach_id := v_user_id;
    else
      if not exists (
        select 1 from public.organization_memberships m
        where m.organization_id = p_organization_id
          and m.user_id = p_assigned_coach_id and m.role = 'coach'
      ) then
        raise exception 'El coach seleccionado no pertenece a esta organización.' using errcode = '42501';
      end if;
      v_owner_coach_id := p_assigned_coach_id;
    end if;
  else
    raise exception 'Tu rol no permite crear fichas deportivas.' using errcode = '42501';
  end if;

  select a.organization_id, a.owner_coach_id
    into v_existing_org, v_existing_owner
  from public.athletes a where a.id = v_athlete_id;

  if found then
    if v_existing_org = p_organization_id and v_existing_owner = v_owner_coach_id then
      return v_athlete_id;
    end if;
    raise exception 'El identificador de atleta ya está siendo utilizado.' using errcode = '23505';
  end if;

  insert into public.athletes (
    id, organization_id, owner_coach_id, full_name, age, level, sex,
    body_weight_kg, snatch_kg, clean_jerk_kg, notes, updated_at
  ) values (
    v_athlete_id, p_organization_id, v_owner_coach_id, btrim(p_full_name), v_age,
    coalesce(p_level, 'initial'), p_sex, p_body_weight_kg, p_snatch_kg,
    p_clean_jerk_kg, nullif(btrim(coalesce(p_notes, '')), ''), v_now
  );

  insert into public.athlete_profiles (
    athlete_id, organization_id, date_of_birth, sporting_start_date, created_by, updated_by, updated_at
  ) values (
    v_athlete_id, p_organization_id, p_date_of_birth, p_sporting_start_date, v_user_id, v_user_id, v_now
  );

  if p_body_weight_kg is not null then
    insert into public.athlete_measurements (
      organization_id, athlete_id, metric_key, metric_value, unit,
      recorded_by, validation_status, validated_by, validated_at, measured_at
    ) values (
      p_organization_id, v_athlete_id, 'body_weight', p_body_weight_kg, 'kg',
      v_user_id, 'validated', v_user_id, v_now, v_now
    );
  end if;
  if p_height_cm is not null then
    insert into public.athlete_measurements (
      organization_id, athlete_id, metric_key, metric_value, unit,
      recorded_by, validation_status, validated_by, validated_at, measured_at
    ) values (
      p_organization_id, v_athlete_id, 'height', p_height_cm, 'cm',
      v_user_id, 'validated', v_user_id, v_now, v_now
    );
  end if;
  if p_snatch_kg is not null then
    insert into public.athlete_personal_records (
      organization_id, athlete_id, exercise_name_snapshot, record_value_kg,
      record_date, record_type, recorded_by, validation_status, validated_by, validated_at
    ) values (
      p_organization_id, v_athlete_id, 'Snatch', p_snatch_kg,
      current_date, 'tested', v_user_id, 'validated', v_user_id, v_now
    );
  end if;
  if p_clean_jerk_kg is not null then
    insert into public.athlete_personal_records (
      organization_id, athlete_id, exercise_name_snapshot, record_value_kg,
      record_date, record_type, recorded_by, validation_status, validated_by, validated_at
    ) values (
      p_organization_id, v_athlete_id, 'Clean & Jerk', p_clean_jerk_kg,
      current_date, 'tested', v_user_id, 'validated', v_user_id, v_now
    );
  end if;

  if v_role = 'coach' or v_owner_coach_id <> v_user_id then
    insert into public.coach_athletes (organization_id, athlete_id, coach_id, assigned_by)
    values (p_organization_id, v_athlete_id, v_owner_coach_id, v_user_id)
    on conflict (athlete_id, coach_id) do nothing;
  end if;

  return v_athlete_id;
end;
$$;

revoke all on function public.create_athlete_atomic(
  uuid, text, uuid, integer, text, text, date, date, numeric, numeric, numeric, numeric, text, uuid
) from public, anon;
grant execute on function public.create_athlete_atomic(
  uuid, text, uuid, integer, text, text, date, date, numeric, numeric, numeric, numeric, text, uuid
) to authenticated;

comment on function public.create_athlete_atomic(
  uuid, text, uuid, integer, text, text, date, date, numeric, numeric, numeric, numeric, text, uuid
) is 'Creates an athlete, profile, initial measurements, personal records and coach assignment atomically for an authenticated organization member.';
