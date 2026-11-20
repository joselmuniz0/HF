create or replace function public.create_training_plan_atomic(
  p_athlete_id uuid,
  p_name text,
  p_objective text,
  p_training_phase text,
  p_start_date date,
  p_end_date date,
  p_status text,
  p_notes text,
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
  v_session jsonb;
  v_item jsonb;
  v_week smallint;
  v_day smallint;
  v_session_order smallint;
  v_session_id uuid;
  v_session_title text;
  v_exercise_name text;
  v_sets smallint;
  v_reps text;
  v_load numeric(10,2);
  v_percent numeric(6,2);
  v_rpe numeric(3,1);
  v_rest integer;
  v_item_index bigint;
begin
  if v_user_id is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;
  if p_athlete_id is null then
    raise exception 'Seleccioná un atleta.';
  end if;
  if p_name is null or length(btrim(p_name)) < 2 then
    raise exception 'El plan debe tener un nombre de al menos 2 caracteres.';
  end if;
  if p_start_date is null then
    raise exception 'La fecha de inicio es obligatoria.';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'La fecha de finalización no puede ser anterior al inicio.';
  end if;
  if p_status not in ('draft', 'active', 'completed', 'archived') then
    raise exception 'El estado del plan no es válido.';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array'
     or jsonb_array_length(p_sessions) = 0 then
    raise exception 'Agregá al menos un día de entrenamiento.';
  end if;

  select a.organization_id
    into v_organization_id
    from public.athletes as a
   where a.id = p_athlete_id;
  if v_organization_id is null
     or not private.can_manage_athlete_in_org(p_athlete_id, v_organization_id) then
    raise exception 'No tenés permisos para planificar a este atleta.';
  end if;

  insert into public.training_plans (
    organization_id, athlete_id, name, objective, training_phase,
    start_date, end_date, status, created_by, notes
  ) values (
    v_organization_id, p_athlete_id, btrim(p_name),
    nullif(btrim(coalesce(p_objective, '')), ''),
    nullif(btrim(coalesce(p_training_phase, '')), ''),
    p_start_date, p_end_date, p_status, v_user_id,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_plan_id;

  for v_session in select value from jsonb_array_elements(p_sessions)
  loop
    if jsonb_typeof(v_session) <> 'object' then
      raise exception 'Cada día de entrenamiento debe ser un objeto válido.';
    end if;
    v_week := coalesce(nullif(v_session->>'week_number', '')::smallint, 1);
    v_day := nullif(v_session->>'day_number', '')::smallint;
    v_session_order := coalesce(nullif(v_session->>'session_order', '')::smallint, 1);
    v_session_title := nullif(btrim(coalesce(v_session->>'session_title', '')), '');
    if v_week < 1 or v_day is null or v_day not between 1 and 7
       or v_session_order < 1 then
      raise exception 'Revisá la semana y el día de cada sesión.';
    end if;
    if v_session_title is null then
      raise exception 'Cada día debe tener un título.';
    end if;
    if jsonb_typeof(v_session->'exercises') <> 'array'
       or jsonb_array_length(v_session->'exercises') = 0 then
      raise exception 'Cada día debe incluir al menos un ejercicio.';
    end if;

    insert into public.training_plan_sessions (
      organization_id, athlete_id, plan_id, week_number, day_number,
      session_order, scheduled_date, session_title, focus, notes
    ) values (
      v_organization_id, p_athlete_id, v_plan_id, v_week, v_day,
      v_session_order,
      nullif(v_session->>'scheduled_date', '')::date,
      v_session_title,
      nullif(btrim(coalesce(v_session->>'focus', '')), ''),
      nullif(btrim(coalesce(v_session->>'notes', '')), '')
    )
    returning id into v_session_id;

    for v_item, v_item_index in
      select value, ordinality
        from jsonb_array_elements(v_session->'exercises') with ordinality as exercise_rows(value, ordinality)
    loop
      if v_item_index > 32767 then
        raise exception 'Un día no puede superar los 32767 ejercicios.';
      end if;
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Cada ejercicio debe ser un objeto válido.';
      end if;
      v_exercise_name := nullif(btrim(coalesce(v_item->>'exercise_name', '')), '');
      v_sets := nullif(v_item->>'sets', '')::smallint;
      v_reps := nullif(btrim(coalesce(v_item->>'reps', '')), '');
      v_load := nullif(v_item->>'target_load_kg', '')::numeric;
      v_percent := nullif(v_item->>'target_percent_rm', '')::numeric;
      v_rpe := nullif(v_item->>'target_rpe', '')::numeric;
      v_rest := nullif(v_item->>'rest_seconds', '')::integer;
      if v_exercise_name is null then
        raise exception 'Hay un ejercicio sin nombre en la sesión.';
      end if;
      if v_sets is null or v_sets < 1 then
        raise exception 'Indicá una cantidad de series válida para cada ejercicio.';
      end if;
      if v_reps is null then
        raise exception 'Indicá las repeticiones de cada ejercicio.';
      end if;
      if v_load is not null and v_load <= 0 then
        raise exception 'La carga en kg debe ser mayor que cero.';
      end if;
      if v_percent is not null and v_percent <= 0 then
        raise exception 'El porcentaje de RM debe ser mayor que cero.';
      end if;
      if v_rpe is not null and (v_rpe < 1 or v_rpe > 10) then
        raise exception 'El RPE debe estar entre 1 y 10.';
      end if;
      if v_rest is not null and v_rest < 0 then
        raise exception 'El descanso no puede ser negativo.';
      end if;

      insert into public.training_plan_items (
        organization_id, athlete_id, plan_session_id, sequence_number,
        exercise_name_snapshot, sets, reps, target_load_kg,
        target_percent_rm, target_rpe, rest_seconds, tempo, prescription, notes
      ) values (
        v_organization_id, p_athlete_id, v_session_id, v_item_index::smallint,
        v_exercise_name, v_sets, v_reps, v_load, v_percent, v_rpe, v_rest,
        nullif(btrim(coalesce(v_item->>'tempo', '')), ''),
        case when jsonb_typeof(v_item->'prescription') = 'object'
             then v_item->'prescription' else '{}'::jsonb end,
        nullif(btrim(coalesce(v_item->>'notes', '')), '')
      );
    end loop;
  end loop;
  return v_plan_id;
end;
$function$;

revoke all on function public.create_training_plan_atomic(uuid,text,text,text,date,date,text,text,jsonb) from public;
revoke execute on function public.create_training_plan_atomic(uuid,text,text,text,date,date,text,text,jsonb) from anon;
grant execute on function public.create_training_plan_atomic(uuid,text,text,text,date,date,text,text,jsonb) to authenticated;
