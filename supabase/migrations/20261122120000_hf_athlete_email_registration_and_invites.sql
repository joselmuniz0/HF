-- Make athlete registration persist a linked sporting profile and enforce one athlete account per organization.
alter table public.athlete_access_requests
  add column if not exists athlete_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.athlete_access_requests'::regclass
      and conname='athlete_access_requests_athlete_id_fkey'
  ) then
    alter table public.athlete_access_requests
      add constraint athlete_access_requests_athlete_id_fkey
      foreign key (athlete_id) references public.athletes(id) on delete set null;
  end if;
end;
$$;

create index if not exists idx_athlete_access_requests_athlete
  on public.athlete_access_requests(athlete_id);

create unique index if not exists idx_athlete_accounts_one_active_user_per_org
  on public.athlete_accounts(organization_id,user_id)
  where account_status in ('invited','active');

create or replace function public.register_athlete_access_request_atomic(
  p_user_id uuid,
  p_email text,
  p_organization_id uuid,
  p_full_name text,
  p_requested_coach_id uuid,
  p_date_of_birth date,
  p_sporting_start_date date,
  p_level text,
  p_sex text,
  p_body_weight_kg numeric,
  p_snatch_kg numeric,
  p_clean_jerk_kg numeric,
  p_back_squat_kg numeric,
  p_front_squat_kg numeric,
  p_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_full_name text := btrim(coalesce(p_full_name,''));
  v_age integer;
  v_athlete_id uuid;
  v_request_id uuid;
  v_now timestamptz := now();
  v_user_email text;
  v_email_confirmed timestamptz;
  v_existing record;
  v_value record;
begin
  if p_user_id is null or p_organization_id is null or p_requested_coach_id is null then
    raise exception 'Faltan datos de cuenta, organización o coach.' using errcode='22023';
  end if;
  if v_email = '' or length(v_email)>320 or length(v_full_name)<2 or length(v_full_name)>120 then
    raise exception 'El correo y el nombre del atleta son obligatorios.' using errcode='22023';
  end if;
  if p_level not in ('initial','intermediate','advanced') then
    raise exception 'El nivel deportivo no es válido.' using errcode='22023';
  end if;
  if p_sex is not null and p_sex not in ('female','male','other') then
    raise exception 'El sexo indicado no es válido.' using errcode='22023';
  end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.' using errcode='22023';
  end if;
  if p_sporting_start_date is not null and p_sporting_start_date>current_date then
    raise exception 'La fecha de inicio deportivo no puede ser futura.' using errcode='22023';
  end if;
  if p_body_weight_kg is not null and p_body_weight_kg not between 20 and 300 then
    raise exception 'El peso corporal debe estar entre 20 y 300 kg.' using errcode='22023';
  end if;
  if p_snatch_kg is not null and (p_snatch_kg<=0 or p_snatch_kg>500) then
    raise exception 'La marca de arranque no es válida.' using errcode='22023';
  end if;
  if p_clean_jerk_kg is not null and (p_clean_jerk_kg<=0 or p_clean_jerk_kg>500) then
    raise exception 'La marca de envión no es válida.' using errcode='22023';
  end if;
  if p_back_squat_kg is not null and (p_back_squat_kg<=0 or p_back_squat_kg>700) then
    raise exception 'La marca de back squat no es válida.' using errcode='22023';
  end if;
  if p_front_squat_kg is not null and (p_front_squat_kg<=0 or p_front_squat_kg>700) then
    raise exception 'La marca de front squat no es válida.' using errcode='22023';
  end if;

  select lower(u.email),u.email_confirmed_at
    into v_user_email,v_email_confirmed
  from auth.users u
  where u.id=p_user_id;

  if not found or v_user_email<>v_email or v_email_confirmed is null then
    raise exception 'La cuenta no existe, el correo no coincide o no está verificado.' using errcode='42501';
  end if;

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=p_user_id
  ) then
    raise exception 'Una cuenta de coach o administrador no puede registrarse como atleta.' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_requested_coach_id and m.role='coach'
  ) then
    raise exception 'El correo indicado no corresponde a un coach habilitado.' using errcode='42501';
  end if;

  select r.id,r.athlete_id,r.status
    into v_existing
  from public.athlete_access_requests r
  where r.organization_id=p_organization_id
    and r.requested_by=p_user_id
    and r.status='pending'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'existing',true,
      'request_id',v_existing.id,
      'athlete_id',v_existing.athlete_id,
      'status',v_existing.status
    );
  end if;

  if exists (
    select 1 from public.athlete_accounts aa
    where aa.user_id=p_user_id and aa.account_status in ('invited','active')
  ) then
    raise exception 'Tu cuenta ya está vinculada a una ficha de atleta.' using errcode='23505';
  end if;

  v_age := case when p_date_of_birth is null then null
    else extract(year from age(current_date,p_date_of_birth))::integer end;
  if v_age is not null and (v_age<8 or v_age>100) then
    raise exception 'La edad calculada debe estar entre 8 y 100 años.' using errcode='22023';
  end if;

  insert into public.athletes (
    organization_id,owner_coach_id,full_name,age,level,sex,
    body_weight_kg,snatch_kg,clean_jerk_kg,notes,updated_at
  ) values (
    p_organization_id,p_requested_coach_id,v_full_name,v_age,p_level,p_sex,
    p_body_weight_kg,p_snatch_kg,p_clean_jerk_kg,
    nullif(btrim(coalesce(p_message,'')),''),v_now
  ) returning id into v_athlete_id;

  insert into public.athlete_profiles (
    athlete_id,organization_id,date_of_birth,sporting_start_date,
    profile_notes,created_by,updated_by,updated_at
  ) values (
    v_athlete_id,p_organization_id,p_date_of_birth,p_sporting_start_date,
    nullif(btrim(coalesce(p_message,'')),''),p_user_id,p_user_id,v_now
  );

  if p_body_weight_kg is not null then
    insert into public.athlete_measurements (
      organization_id,athlete_id,metric_key,metric_value,unit,
      measured_at,recorded_by,validation_status
    ) values (
      p_organization_id,v_athlete_id,'body_weight',p_body_weight_kg,'kg',
      v_now,p_user_id,'pending_validation'
    );
  end if;

  for v_value in
    select * from (values
      ('Snatch'::text,p_snatch_kg),
      ('Clean & Jerk'::text,p_clean_jerk_kg),
      ('Back Squat'::text,p_back_squat_kg),
      ('Front Squat'::text,p_front_squat_kg)
    ) as r(exercise_name,record_kg)
    where record_kg is not null
  loop
    insert into public.athlete_personal_records (
      organization_id,athlete_id,exercise_name_snapshot,record_value_kg,
      record_date,record_type,recorded_by,validation_status
    ) values (
      p_organization_id,v_athlete_id,v_value.exercise_name,v_value.record_kg,
      current_date,'tested',p_user_id,'pending_validation'
    );
  end loop;

  insert into public.athlete_access_requests (
    organization_id,requested_by,requested_email,requested_full_name,
    requested_coach_id,message,status,athlete_id
  ) values (
    p_organization_id,p_user_id,v_email,v_full_name,p_requested_coach_id,
    nullif(btrim(coalesce(p_message,'')),''),'pending',v_athlete_id
  ) returning id into v_request_id;

  return jsonb_build_object(
    'ok',true,'existing',false,'request_id',v_request_id,
    'athlete_id',v_athlete_id,'status','pending'
  );
end;
$function$;

revoke all on function public.register_athlete_access_request_atomic(uuid,text,uuid,text,uuid,date,date,text,text,numeric,numeric,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.register_athlete_access_request_atomic(uuid,text,uuid,text,uuid,date,date,text,text,numeric,numeric,numeric,numeric,numeric,text) to service_role;

create or replace function public.create_invited_athlete_atomic(
  p_actor_id uuid,
  p_user_id uuid,
  p_email text,
  p_organization_id uuid,
  p_owner_coach_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_sporting_start_date date,
  p_level text,
  p_sex text,
  p_height_cm numeric,
  p_body_weight_kg numeric,
  p_snatch_kg numeric,
  p_clean_jerk_kg numeric,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_full_name text := btrim(coalesce(p_full_name,''));
  v_actor_role text;
  v_age integer;
  v_athlete_id uuid;
  v_now timestamptz := now();
  v_user_email text;
  v_measurement record;
  v_record record;
begin
  if p_actor_id is null or p_user_id is null or p_organization_id is null or p_owner_coach_id is null then
    raise exception 'Faltan datos de cuenta, organización o coach responsable.' using errcode='22023';
  end if;
  if v_email='' or length(v_email)>320 or length(v_full_name)<2 or length(v_full_name)>120 then
    raise exception 'El correo y el nombre del atleta son obligatorios.' using errcode='22023';
  end if;
  if p_level not in ('initial','intermediate','advanced') then
    raise exception 'El nivel deportivo no es válido.' using errcode='22023';
  end if;
  if p_sex is not null and p_sex not in ('female','male','other') then
    raise exception 'El sexo indicado no es válido.' using errcode='22023';
  end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.' using errcode='22023';
  end if;
  if p_sporting_start_date is not null and p_sporting_start_date>current_date then
    raise exception 'La fecha de inicio deportivo no puede ser futura.' using errcode='22023';
  end if;
  if p_height_cm is not null and p_height_cm not between 50 and 250 then
    raise exception 'La altura debe estar entre 50 y 250 cm.' using errcode='22023';
  end if;
  if p_body_weight_kg is not null and p_body_weight_kg not between 20 and 300 then
    raise exception 'El peso corporal debe estar entre 20 y 300 kg.' using errcode='22023';
  end if;

  select m.role into v_actor_role
  from public.organization_memberships m
  where m.organization_id=p_organization_id and m.user_id=p_actor_id;

  if v_actor_role not in ('admin','coach') or v_actor_role is null then
    raise exception 'Solo un coach o administrador puede crear e invitar atletas.' using errcode='42501';
  end if;
  if v_actor_role='coach' and p_owner_coach_id<>p_actor_id then
    raise exception 'Un coach solo puede asignar atletas a su propia cuenta.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_owner_coach_id and m.role='coach'
  ) then
    raise exception 'Seleccioná un coach activo de esta organización.' using errcode='42501';
  end if;

  select lower(u.email) into v_user_email
  from auth.users u where u.id=p_user_id;
  if not found or v_user_email<>v_email then
    raise exception 'El usuario de Auth no coincide con el correo indicado.' using errcode='42501';
  end if;

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=p_user_id
  ) then
    raise exception 'Ese correo ya corresponde a un usuario del equipo HF Coach.' using errcode='23505';
  end if;

  if exists (
    select 1 from public.athlete_accounts aa
    where aa.organization_id=p_organization_id
      and aa.user_id=p_user_id and aa.account_status in ('invited','active')
  ) then
    raise exception 'Ese correo ya está vinculado a una ficha deportiva en HF Coach.' using errcode='23505';
  end if;

  v_age := case when p_date_of_birth is null then null
    else extract(year from age(current_date,p_date_of_birth))::integer end;
  if v_age is not null and (v_age<8 or v_age>100) then
    raise exception 'La edad calculada debe estar entre 8 y 100 años.' using errcode='22023';
  end if;

  insert into public.athletes (
    organization_id,owner_coach_id,full_name,age,level,sex,
    body_weight_kg,snatch_kg,clean_jerk_kg,notes,updated_at
  ) values (
    p_organization_id,p_owner_coach_id,v_full_name,v_age,p_level,p_sex,
    p_body_weight_kg,p_snatch_kg,p_clean_jerk_kg,
    nullif(btrim(coalesce(p_notes,'')),''),v_now
  ) returning id into v_athlete_id;

  insert into public.athlete_profiles (
    athlete_id,organization_id,date_of_birth,sporting_start_date,
    created_by,updated_by,updated_at
  ) values (
    v_athlete_id,p_organization_id,p_date_of_birth,p_sporting_start_date,
    p_actor_id,p_actor_id,v_now
  );

  insert into public.athlete_accounts (
    organization_id,athlete_id,user_id,email,account_status,
    linked_by,linked_at,activated_at
  ) values (
    p_organization_id,v_athlete_id,p_user_id,v_email,'active',
    p_actor_id,v_now,v_now
  );

  insert into public.coach_athletes (
    organization_id,athlete_id,coach_id,assigned_by
  ) values (
    p_organization_id,v_athlete_id,p_owner_coach_id,p_actor_id
  ) on conflict (athlete_id,coach_id) do nothing;

  for v_measurement in
    select * from (values
      ('height'::text,p_height_cm,'cm'::text),
      ('body_weight'::text,p_body_weight_kg,'kg'::text)
    ) as m(metric_key,metric_value,unit)
    where metric_value is not null
  loop
    insert into public.athlete_measurements (
      organization_id,athlete_id,metric_key,metric_value,unit,
      measured_at,recorded_by,validation_status,validated_by,validated_at
    ) values (
      p_organization_id,v_athlete_id,v_measurement.metric_key,
      v_measurement.metric_value,v_measurement.unit,v_now,
      p_actor_id,'validated',p_actor_id,v_now
    );
  end loop;

  for v_record in
    select * from (values
      ('Snatch'::text,p_snatch_kg),
      ('Clean & Jerk'::text,p_clean_jerk_kg)
    ) as r(exercise_name,record_kg)
    where record_kg is not null
  loop
    insert into public.athlete_personal_records (
      organization_id,athlete_id,exercise_name_snapshot,record_value_kg,
      record_date,record_type,recorded_by,validation_status,validated_by,validated_at
    ) values (
      p_organization_id,v_athlete_id,v_record.exercise_name,v_record.record_kg,
      current_date,'tested',p_actor_id,'validated',p_actor_id,v_now
    );
  end loop;

  return jsonb_build_object(
    'ok',true,'existing',false,'athlete_id',v_athlete_id,
    'user_id',p_user_id,'owner_coach_id',p_owner_coach_id,
    'email',v_email,'account_status','active'
  );
end;
$function$;

revoke all on function public.create_invited_athlete_atomic(uuid,uuid,text,uuid,uuid,text,date,date,text,text,numeric,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.create_invited_athlete_atomic(uuid,uuid,text,uuid,uuid,text,date,date,text,text,numeric,numeric,numeric,numeric,text) to service_role;
