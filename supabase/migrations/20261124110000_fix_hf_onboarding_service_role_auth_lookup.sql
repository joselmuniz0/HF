create or replace function public.submit_athlete_ai_onboarding_atomic(
  p_user_id uuid,
  p_payload jsonb,
  p_declaration_text text,
  p_declaration_hash text,
  p_declaration_version text,
  p_health_consent_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_athlete_id uuid;
  v_age integer;
  v_height numeric;
  v_weight numeric;
  v_training_years numeric;
  v_training_days smallint;
  v_objective text;
  v_level text;
  v_health_status text;
  v_consent boolean;
  v_health jsonb;
  v_profile_status text;
  v_level_status text;
  v_snatch numeric;
  v_clean_jerk numeric;
  v_back_squat numeric;
  v_front_squat numeric;
  v_snatch_not_tested boolean;
  v_clean_jerk_not_tested boolean;
  v_back_squat_not_tested boolean;
  v_front_squat_not_tested boolean;
  v_acceptance_id uuid;
  v_health_id uuid;
  v_now timestamptz := now();
  v_measurement record;
  v_record record;
begin
  if p_user_id is null or p_payload is null then
    raise exception 'Faltan los datos de la cuenta o del formulario.' using errcode='22023';
  end if;
  if p_declaration_version is null or p_declaration_text is null or length(p_declaration_text) < 100
     or p_declaration_hash is null or length(p_declaration_hash) <> 64 then
    raise exception 'La declaración jurada no está completa.' using errcode='22023';
  end if;

  -- El correo se valida en la Edge Function autenticada antes de llamar este RPC de service_role.
  if exists(select 1 from public.organization_memberships m where m.user_id=p_user_id) then
    raise exception 'La autogestión de atleta no está habilitada para cuentas de staff.' using errcode='42501';
  end if;

  select aa.organization_id,aa.athlete_id
    into v_org_id,v_athlete_id
  from public.athlete_accounts aa
  join public.athlete_ai_coach_assignments ai
    on ai.organization_id=aa.organization_id and ai.athlete_id=aa.athlete_id and ai.user_id=aa.user_id
  where aa.user_id=p_user_id and aa.account_status='active' and ai.status='active'
  order by aa.created_at desc
  limit 1;
  if v_athlete_id is null then
    raise exception 'La cuenta no tiene una vinculación activa con HF Coach IA.' using errcode='42501';
  end if;

  v_age := (p_payload->>'age')::integer;
  v_height := (p_payload->>'height_cm')::numeric;
  v_weight := (p_payload->>'weight_kg')::numeric;
  v_training_years := (p_payload->>'training_years')::numeric;
  v_training_days := (p_payload->>'training_days_per_week')::smallint;
  v_objective := nullif(btrim(p_payload->>'training_objective'),'');
  v_level := p_payload->>'declared_level';
  v_health_status := p_payload->>'health_status';
  v_consent := coalesce((p_payload->>'consent_for_ai_processing')::boolean,false);
  v_health := coalesce(p_payload->'health_details','{}'::jsonb);

  v_snatch := nullif(p_payload->>'snatch_kg','')::numeric;
  v_clean_jerk := nullif(p_payload->>'clean_jerk_kg','')::numeric;
  v_back_squat := nullif(p_payload->>'back_squat_kg','')::numeric;
  v_front_squat := nullif(p_payload->>'front_squat_kg','')::numeric;
  v_snatch_not_tested := coalesce((p_payload->>'snatch_not_tested')::boolean,false);
  v_clean_jerk_not_tested := coalesce((p_payload->>'clean_jerk_not_tested')::boolean,false);
  v_back_squat_not_tested := coalesce((p_payload->>'back_squat_not_tested')::boolean,false);
  v_front_squat_not_tested := coalesce((p_payload->>'front_squat_not_tested')::boolean,false);

  if v_age is null or v_age < 18 or v_age > 100 then
    raise exception 'La autogestión de HF Coach IA está habilitada en esta etapa para atletas mayores de 18 años.' using errcode='22023';
  end if;
  if v_height is null or v_height < 50 or v_height > 250 or v_weight is null or v_weight < 20 or v_weight > 300 then
    raise exception 'Revisá altura y peso corporal.' using errcode='22023';
  end if;
  if v_training_years is null or v_training_years < 0 or v_training_years > 80 then
    raise exception 'Ingresá una antigüedad deportiva válida.' using errcode='22023';
  end if;
  if v_training_days is null or v_training_days < 1 or v_training_days > 7 or v_objective is null or length(v_objective)>1500 then
    raise exception 'Completá frecuencia y objetivo de entrenamiento.' using errcode='22023';
  end if;
  if v_level is null or v_level not in ('initial','intermediate','advanced','undetermined') then
    raise exception 'Seleccioná Inicial, Medio, Avanzado o evaluación por video.' using errcode='22023';
  end if;
  if ((v_snatch is null) <> v_snatch_not_tested)
     or ((v_clean_jerk is null) <> v_clean_jerk_not_tested)
     or ((v_back_squat is null) <> v_back_squat_not_tested)
     or ((v_front_squat is null) <> v_front_squat_not_tested) then
    raise exception 'Para cada levantamiento ingresá una marca o indicá que no tenés RM vigente.' using errcode='22023';
  end if;
  if v_health_status is null or v_health_status not in ('no_known_conditions','conditions_reported','prefer_not_to_disclose') then
    raise exception 'Seleccioná una opción para la declaración de salud.' using errcode='22023';
  end if;
  if v_health_status='prefer_not_to_disclose' and v_consent then
    raise exception 'No se pueden autorizar datos de salud que elegiste no informar.' using errcode='22023';
  end if;
  if v_health_status in ('no_known_conditions','conditions_reported') and not v_consent then
    raise exception 'Para guardar la declaración de salud debés otorgar o rechazar expresamente la autorización de tratamiento. Si preferís no compartir datos, seleccioná esa opción.' using errcode='22023';
  end if;
  if v_health_status='conditions_reported'
     and not exists (
       select 1 from jsonb_each_text(v_health) e where length(btrim(coalesce(e.value,'')))>0
     ) then
    raise exception 'Indicá al menos un antecedente o lesión, o seleccioná que no tenés antecedentes conocidos.' using errcode='22023';
  end if;
  if v_health_status='prefer_not_to_disclose' and v_health <> '{}'::jsonb then
    raise exception 'No se deben enviar datos de salud cuando elegís no informarlos.' using errcode='22023';
  end if;

  if v_health_status='conditions_reported' or v_health_status='prefer_not_to_disclose' or not v_consent then
    v_profile_status := 'requires_human_review';
  elsif v_level='undetermined' then
    v_profile_status := 'needs_video_assessment';
  else
    v_profile_status := 'ready_for_ai_planning';
  end if;
  v_level_status := case when v_level='undetermined' then 'pending_video_assessment' else 'athlete_declared' end;

  insert into public.athlete_ai_declaration_acceptances(
    organization_id,athlete_id,user_id,declaration_version,declaration_text,declaration_sha256,accepted_at
  ) values (
    v_org_id,v_athlete_id,p_user_id,p_declaration_version,p_declaration_text,p_declaration_hash,v_now
  ) returning id into v_acceptance_id;

  insert into public.athlete_health_declarations(
    organization_id,athlete_id,user_id,declaration_status,health_status,
    chronic_conditions,bone_joint_injuries,muscular_injuries,surgeries,
    medication_and_treatments,medical_restrictions,other_relevant_history,
    consent_for_ai_processing,consent_version,consented_at,declared_at
  ) values (
    v_org_id,v_athlete_id,p_user_id,'athlete_declared',v_health_status,
    nullif(btrim(v_health->>'chronic_conditions'),''),
    nullif(btrim(v_health->>'bone_joint_injuries'),''),
    nullif(btrim(v_health->>'muscular_injuries'),''),
    nullif(btrim(v_health->>'surgeries'),''),
    nullif(btrim(v_health->>'medication_and_treatments'),''),
    nullif(btrim(v_health->>'medical_restrictions'),''),
    nullif(btrim(v_health->>'other_relevant_history'),''),
    v_consent,
    p_health_consent_version,
    case when v_consent then v_now else null end,
    v_now
  ) returning id into v_health_id;

  insert into public.athlete_ai_onboarding(
    organization_id,athlete_id,user_id,declared_age,height_cm,weight_kg,
    training_years,training_days_per_week,training_objective,declared_level,
    level_status,snatch_kg,snatch_not_tested,clean_jerk_kg,clean_jerk_not_tested,
    back_squat_kg,back_squat_not_tested,front_squat_kg,front_squat_not_tested,
    profile_status,personal_data_status,sport_data_status,declaration_version,
    declaration_acceptance_id,declared_at,updated_at
  ) values (
    v_org_id,v_athlete_id,p_user_id,v_age,v_height,v_weight,
    v_training_years,v_training_days,v_objective,v_level,
    v_level_status,v_snatch,v_snatch_not_tested,v_clean_jerk,v_clean_jerk_not_tested,
    v_back_squat,v_back_squat_not_tested,v_front_squat,v_front_squat_not_tested,
    v_profile_status,'athlete_declared','athlete_declared',p_declaration_version,
    v_acceptance_id,v_now,v_now
  )
  on conflict (organization_id,athlete_id) do update set
    user_id=excluded.user_id,
    declared_age=excluded.declared_age,
    height_cm=excluded.height_cm,
    weight_kg=excluded.weight_kg,
    training_years=excluded.training_years,
    training_days_per_week=excluded.training_days_per_week,
    training_objective=excluded.training_objective,
    declared_level=excluded.declared_level,
    level_status=excluded.level_status,
    snatch_kg=excluded.snatch_kg,
    snatch_not_tested=excluded.snatch_not_tested,
    clean_jerk_kg=excluded.clean_jerk_kg,
    clean_jerk_not_tested=excluded.clean_jerk_not_tested,
    back_squat_kg=excluded.back_squat_kg,
    back_squat_not_tested=excluded.back_squat_not_tested,
    front_squat_kg=excluded.front_squat_kg,
    front_squat_not_tested=excluded.front_squat_not_tested,
    profile_status=excluded.profile_status,
    personal_data_status='athlete_declared',
    sport_data_status='athlete_declared',
    declaration_version=excluded.declaration_version,
    declaration_acceptance_id=excluded.declaration_acceptance_id,
    declared_at=excluded.declared_at,
    updated_at=v_now;

  update public.athletes
  set age=v_age, body_weight_kg=v_weight, updated_at=v_now
  where id=v_athlete_id and organization_id=v_org_id;

  -- Append body-weight and height observations. They remain athlete-declared until a coach validates them.
  select m.id,m.metric_value into v_measurement
  from public.athlete_measurements m
  where m.athlete_id=v_athlete_id and m.metric_key='body_weight'
  order by m.measured_at desc,m.created_at desc limit 1;
  if not found or v_measurement.metric_value is distinct from v_weight then
    insert into public.athlete_measurements(
      organization_id,athlete_id,metric_key,metric_value,unit,measured_at,
      recorded_by,validation_status,notes,supersedes_id
    ) values (
      v_org_id,v_athlete_id,'body_weight',v_weight,'kg',v_now,
      p_user_id,'pending_validation','Autodeclaración del atleta.',v_measurement.id
    );
  end if;

  select m.id,m.metric_value into v_measurement
  from public.athlete_measurements m
  where m.athlete_id=v_athlete_id and m.metric_key='height'
  order by m.measured_at desc,m.created_at desc limit 1;
  if not found or v_measurement.metric_value is distinct from v_height then
    insert into public.athlete_measurements(
      organization_id,athlete_id,metric_key,metric_value,unit,measured_at,
      recorded_by,validation_status,notes,supersedes_id
    ) values (
      v_org_id,v_athlete_id,'height',v_height,'cm',v_now,
      p_user_id,'pending_validation','Autodeclaración del atleta.',v_measurement.id
    );
  end if;

  -- Create an RM event only when the declared value changes. Never mark an athlete-entered RM as validated.
  if v_snatch is not null then
    select r.id,r.record_value_kg into v_record from public.athlete_personal_records r
    where r.athlete_id=v_athlete_id and lower(r.exercise_name_snapshot) in ('snatch','arranque')
    order by r.record_date desc,r.created_at desc limit 1;
    if not found or v_record.record_value_kg is distinct from v_snatch then
      insert into public.athlete_personal_records(
        organization_id,athlete_id,exercise_name_snapshot,record_value_kg,record_date,
        record_type,recorded_by,validation_status,notes,supersedes_id
      ) values (
        v_org_id,v_athlete_id,'Snatch',v_snatch,current_date,
        'tested',p_user_id,'pending_validation','Marca declarada por el atleta; pendiente de validación.',v_record.id
      );
    end if;
  end if;
  if v_clean_jerk is not null then
    select r.id,r.record_value_kg into v_record from public.athlete_personal_records r
    where r.athlete_id=v_athlete_id and lower(r.exercise_name_snapshot) in ('clean & jerk','clean and jerk','envión')
    order by r.record_date desc,r.created_at desc limit 1;
    if not found or v_record.record_value_kg is distinct from v_clean_jerk then
      insert into public.athlete_personal_records(
        organization_id,athlete_id,exercise_name_snapshot,record_value_kg,record_date,
        record_type,recorded_by,validation_status,notes,supersedes_id
      ) values (
        v_org_id,v_athlete_id,'Clean & Jerk',v_clean_jerk,current_date,
        'tested',p_user_id,'pending_validation','Marca declarada por el atleta; pendiente de validación.',v_record.id
      );
    end if;
  end if;
  if v_back_squat is not null then
    select r.id,r.record_value_kg into v_record from public.athlete_personal_records r
    where r.athlete_id=v_athlete_id and lower(r.exercise_name_snapshot) in ('back squat','sentadilla trasera')
    order by r.record_date desc,r.created_at desc limit 1;
    if not found or v_record.record_value_kg is distinct from v_back_squat then
      insert into public.athlete_personal_records(
        organization_id,athlete_id,exercise_name_snapshot,record_value_kg,record_date,
        record_type,recorded_by,validation_status,notes,supersedes_id
      ) values (
        v_org_id,v_athlete_id,'Back Squat',v_back_squat,current_date,
        'tested',p_user_id,'pending_validation','Marca declarada por el atleta; pendiente de validación.',v_record.id
      );
    end if;
  end if;
  if v_front_squat is not null then
    select r.id,r.record_value_kg into v_record from public.athlete_personal_records r
    where r.athlete_id=v_athlete_id and lower(r.exercise_name_snapshot) in ('front squat','sentadilla frontal')
    order by r.record_date desc,r.created_at desc limit 1;
    if not found or v_record.record_value_kg is distinct from v_front_squat then
      insert into public.athlete_personal_records(
        organization_id,athlete_id,exercise_name_snapshot,record_value_kg,record_date,
        record_type,recorded_by,validation_status,notes,supersedes_id
      ) values (
        v_org_id,v_athlete_id,'Front Squat',v_front_squat,current_date,
        'tested',p_user_id,'pending_validation','Marca declarada por el atleta; pendiente de validación.',v_record.id
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'athlete_id',v_athlete_id,'health_declaration_id',v_health_id,
    'declaration_acceptance_id',v_acceptance_id,
    'profile_status',v_profile_status,'level_status',v_level_status,
    'health_status',v_health_status,'consent_for_ai_processing',v_consent,
    'message',case
      when v_profile_status='ready_for_ai_planning' then 'Evaluación inicial recibida. Los datos están declarados por el atleta; marcas y mediciones siguen pendientes de validación.'
      when v_profile_status='needs_video_assessment' then 'Evaluación inicial recibida. Falta la evaluación técnica por video para definir el nivel.'
      else 'Evaluación inicial recibida. Se requiere revisión humana antes de habilitar la planificación personal con IA.'
    end
  );
end;
$function$;

revoke all on function public.submit_athlete_ai_onboarding_atomic(uuid,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_athlete_ai_onboarding_atomic(uuid,jsonb,text,text,text,text) to service_role;
