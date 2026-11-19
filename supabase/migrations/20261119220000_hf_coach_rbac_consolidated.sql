/* Canonical snapshot of HF Coach RBAC. Requires the existing HF Coach base schema. */
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_access_athlete(aid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.can_manage_athlete(aid) or private.is_linked_athlete(aid); $function$


CREATE OR REPLACE FUNCTION private.can_access_athlete_in_org(p_athlete_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.can_manage_athlete_in_org(p_athlete_id,p_organization_id) or private.is_linked_athlete_in_org(p_athlete_id,p_organization_id); $function$


CREATE OR REPLACE FUNCTION private.can_manage_athlete(aid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(
 select 1 from public.athletes a
 where a.id=aid and (
  private.is_org_admin(a.organization_id)
  or (
   private.is_org_coach(a.organization_id,(select auth.uid()))
   and (
    a.owner_coach_id=(select auth.uid())
    or exists(select 1 from public.coach_athletes ca
      where ca.organization_id=a.organization_id and ca.athlete_id=a.id and ca.coach_id=(select auth.uid()))
   )
  )
 )
);
$function$


CREATE OR REPLACE FUNCTION private.can_manage_athlete_in_org(p_athlete_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(select 1 from public.athletes a where a.id=p_athlete_id
 and a.organization_id=p_organization_id and private.can_manage_athlete(a.id));
$function$


CREATE OR REPLACE FUNCTION private.is_linked_athlete(aid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists(select 1 from public.athlete_accounts aa where aa.athlete_id=aid and aa.user_id=(select auth.uid()) and aa.account_status in ('invited','active')); $function$


CREATE OR REPLACE FUNCTION private.is_linked_athlete_in_org(p_athlete_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(
 select 1 from public.athlete_accounts aa
 join public.athletes a on a.id=aa.athlete_id and a.organization_id=aa.organization_id
 where aa.athlete_id=p_athlete_id and aa.organization_id=p_organization_id
 and a.organization_id=p_organization_id and aa.user_id=(select auth.uid())
 and aa.account_status in ('invited','active')
);
$function$


CREATE OR REPLACE FUNCTION private.is_org_admin(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role='admin'); $function$


CREATE OR REPLACE FUNCTION private.is_org_coach(org uuid, coach uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=coach and m.role='coach'); $function$


CREATE OR REPLACE FUNCTION private.is_org_member(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in ('admin','coach')); $function$


CREATE OR REPLACE FUNCTION public.append_athlete_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
  v_org uuid;
  v_athlete uuid;
  v_actor uuid;
  v_actor_type text;
  v_event_type text;
  v_title text;
  v_occurred_at timestamptz;
  v_metadata jsonb;
begin
  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
  end if;

  v_org := NULLIF(v_new->>'organization_id','')::uuid;
  v_athlete := NULLIF(v_new->>'athlete_id','')::uuid;
  v_actor := COALESCE(
    NULLIF(v_new->>'recorded_by','')::uuid,
    NULLIF(v_new->>'created_by','')::uuid,
    NULLIF(v_new->>'coach_id','')::uuid,
    NULLIF(v_new->>'uploaded_by','')::uuid,
    NULLIF(v_new->>'updated_by','')::uuid,
    NULLIF(v_new->>'performed_by','')::uuid,
    auth.uid()
  );

  v_event_type := CASE TG_TABLE_NAME
    WHEN 'athlete_profiles' THEN 'profile_update'
    WHEN 'athlete_measurements' THEN 'physical_measurement'
    WHEN 'athlete_personal_records' THEN 'personal_record'
    WHEN 'training_plans' THEN 'training_plan'
    WHEN 'training_plan_sessions' THEN 'planned_session'
    WHEN 'training_plan_items' THEN 'planned_exercise'
    WHEN 'training_sessions' THEN 'training_session'
    WHEN 'training_session_items' THEN 'performed_exercise'
    WHEN 'evaluations' THEN 'technical_evaluation'
    WHEN 'interventions' THEN 'coach_intervention'
    WHEN 'athlete_competitions' THEN 'competition_result'
    WHEN 'media_assets' THEN 'video_upload'
    ELSE 'other'
  END;

  v_title := CASE TG_TABLE_NAME
    WHEN 'athlete_profiles' THEN 'Perfil deportivo actualizado'
    WHEN 'athlete_measurements' THEN COALESCE(v_new->>'metric_key','Medición') || ' registrada'
    WHEN 'athlete_personal_records' THEN COALESCE(v_new->>'exercise_name_snapshot','Marca') || ' actualizada'
    WHEN 'training_plans' THEN 'Plan: ' || COALESCE(v_new->>'name','actualizado')
    WHEN 'training_plan_sessions' THEN 'Sesión planificada: ' || COALESCE(v_new->>'session_title','actualizada')
    WHEN 'training_plan_items' THEN 'Ejercicio planificado: ' || COALESCE(v_new->>'exercise_name_snapshot','actualizado')
    WHEN 'training_sessions' THEN 'Entrenamiento: ' || COALESCE(v_new->>'session_type','registrado')
    WHEN 'training_session_items' THEN 'Ejercicio realizado: ' || COALESCE(v_new->>'exercise_name_snapshot','registrado')
    WHEN 'evaluations' THEN 'Videoanálisis: ' || COALESCE(v_new->>'lift','evaluación')
    WHEN 'interventions' THEN 'Corrección: ' || COALESCE(v_new->>'problem_identified','intervención')
    WHEN 'athlete_competitions' THEN 'Resultado competitivo actualizado'
    WHEN 'media_assets' THEN 'Video cargado: ' || COALESCE(v_new->>'file_name','archivo')
    ELSE 'Registro actualizado'
  END;

  v_occurred_at := COALESCE(
    NULLIF(v_new->>'measured_at','')::timestamptz,
    NULLIF(v_new->>'record_date','')::date::timestamptz,
    NULLIF(v_new->>'session_date','')::date::timestamptz,
    NULLIF(v_new->>'created_at','')::timestamptz,
    now()
  );

  v_actor_type := CASE
    WHEN v_actor IS NULL THEN 'system'
    WHEN v_actor = auth.uid() AND private.is_linked_athlete(v_athlete) THEN 'athlete'
    WHEN private.is_org_admin(v_org) THEN 'admin'
    ELSE 'coach'
  END;

  v_metadata := v_new - 'object_path';
  INSERT INTO public.athlete_journal_entries (
    organization_id, athlete_id, occurred_at, event_type, title,
    author_id, actor_type, visibility, source_table, source_record_id,
    metadata, previous_snapshot
  ) VALUES (
    v_org, v_athlete, v_occurred_at, v_event_type,
    CASE WHEN TG_OP = 'UPDATE' THEN v_title || ' (modificado)' ELSE v_title END,
    v_actor, v_actor_type, 'shared', TG_TABLE_NAME,
    NULLIF(v_new->>'id','')::uuid, v_metadata, v_old
  );

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.approve_athlete_access_request(p_request_id uuid, p_athlete_id uuid, p_approver_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_request public.athlete_access_requests%rowtype;
  v_athlete public.athletes%rowtype;
  v_approver_role text;
  v_target_coach_role text;
  v_now timestamptz := now();
begin
  if p_request_id is null or p_athlete_id is null or p_approver_id is null then
    raise exception 'Faltan datos para aprobar la vinculación.' using errcode='22023';
  end if;

  select * into v_request
  from public.athlete_access_requests
  where id=p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'La solicitud no existe o ya fue procesada.' using errcode='22023';
  end if;

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id=v_request.organization_id
      and m.user_id=v_request.requested_by
      and m.role in ('admin','coach')
  ) then
    raise exception 'Una cuenta de administrador o coach no puede vincularse como atleta.' using errcode='42501';
  end if;

  select m.role into v_approver_role
  from public.organization_memberships m
  where m.organization_id=v_request.organization_id and m.user_id=p_approver_id;

  if v_approver_role not in ('admin','coach') or v_approver_role is null then
    raise exception 'El usuario que aprueba no pertenece a la organización.' using errcode='42501';
  end if;

  select m.role into v_target_coach_role
  from public.organization_memberships m
  where m.organization_id=v_request.organization_id
    and m.user_id=v_request.requested_coach_id;

  if v_target_coach_role <> 'coach' or v_target_coach_role is null then
    raise exception 'El coach destinatario ya no tiene un rol activo de coach.' using errcode='42501';
  end if;

  if v_approver_role='coach' and p_approver_id <> v_request.requested_coach_id then
    raise exception 'Solo el coach destinatario puede aprobar esta solicitud.' using errcode='42501';
  end if;

  select * into v_athlete
  from public.athletes
  where id=p_athlete_id and organization_id=v_request.organization_id;

  if not found then
    raise exception 'La ficha deportiva no pertenece a la organización de la solicitud.' using errcode='22023';
  end if;

  if v_approver_role='coach'
    and v_athlete.owner_coach_id <> p_approver_id
    and not exists (
      select 1 from public.coach_athletes ca
      where ca.organization_id=v_request.organization_id
        and ca.athlete_id=p_athlete_id
        and ca.coach_id=p_approver_id
    )
  then
    raise exception 'La ficha seleccionada no pertenece a tu grupo de atletas.' using errcode='42501';
  end if;

  if exists (
    select 1 from public.athlete_accounts aa
    where aa.organization_id=v_request.organization_id
      and aa.athlete_id=p_athlete_id
      and aa.user_id<>v_request.requested_by
      and aa.account_status in ('invited','active')
  ) then
    raise exception 'La ficha ya está vinculada a otra cuenta activa.' using errcode='23505';
  end if;

  insert into public.coach_athletes(organization_id,athlete_id,coach_id,assigned_by)
  values(v_request.organization_id,p_athlete_id,v_request.requested_coach_id,p_approver_id)
  on conflict(athlete_id,coach_id) do nothing;

  insert into public.athlete_accounts(
    organization_id,athlete_id,user_id,email,account_status,linked_by,linked_at,activated_at
  )
  values(
    v_request.organization_id,p_athlete_id,v_request.requested_by,
    lower(v_request.requested_email),'active',p_approver_id,v_now,v_now
  )
  on conflict(user_id,athlete_id)
  do update set
    organization_id=excluded.organization_id,
    email=excluded.email,
    account_status='active',
    linked_by=excluded.linked_by,
    linked_at=excluded.linked_at,
    activated_at=excluded.activated_at;

  update public.athlete_access_requests
  set status='approved',reviewed_by=p_approver_id,reviewed_at=v_now
  where id=p_request_id and status='pending';

  if not found then
    raise exception 'La solicitud cambió de estado durante la aprobación.' using errcode='40001';
  end if;

  return jsonb_build_object(
    'ok',true,
    'athlete_id',p_athlete_id,
    'athlete_name',v_athlete.full_name,
    'user_email',v_request.requested_email,
    'coach_id',v_request.requested_coach_id,
    'message','Cuenta vinculada y asignación confirmada.'
  );
end;
$function$


drop policy if exists "users add own activity" on public.activity_events;
create policy "users add own activity" on public.activity_events as permissive for INSERT to authenticated
with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id)));

drop policy if exists "users read own activity admins read org" on public.activity_events;
create policy "users read own activity admins read org" on public.activity_events as permissive for SELECT to authenticated
using ((((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id)) OR private.is_org_admin(organization_id)));

drop policy if exists "users update own activity" on public.activity_events;
create policy "users update own activity" on public.activity_events as permissive for UPDATE to authenticated
using ((((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id)) OR private.is_org_admin(organization_id)))
with check ((((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id)) OR private.is_org_admin(organization_id)));

drop policy if exists "athletes request access with verified account email" on public.athlete_access_requests;
create policy "athletes request access with verified account email" on public.athlete_access_requests as permissive for INSERT to authenticated
with check (((requested_by = ( SELECT auth.uid() AS uid)) AND (lower(requested_email) = lower(COALESCE(( SELECT (auth.jwt() ->> 'email'::text)), ''::text))) AND (NOT private.is_org_member(organization_id)) AND private.is_org_coach(organization_id, requested_coach_id) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)));

drop policy if exists "requester coach and admins read access requests" on public.athlete_access_requests;
create policy "requester coach and admins read access requests" on public.athlete_access_requests as permissive for SELECT to authenticated
using (((requested_by = ( SELECT auth.uid() AS uid)) OR (requested_coach_id = ( SELECT auth.uid() AS uid)) OR private.is_org_admin(organization_id)));

drop policy if exists "athlete and assigned coach read account link" on public.athlete_accounts;
create policy "athlete and assigned coach read account link" on public.athlete_accounts as permissive for SELECT to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_org_admin(organization_id) OR private.can_manage_athlete_in_org(athlete_id, organization_id)));

drop policy if exists "coaches add athlete competition results" on public.athlete_competitions;
create policy "coaches add athlete competition results" on public.athlete_competitions as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "athlete competition history visible to linked parties" on public.athlete_competitions;
create policy "athlete competition history visible to linked parties" on public.athlete_competitions as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update athlete competition results" on public.athlete_competitions;
create policy "coaches update athlete competition results" on public.athlete_competitions as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "athletes and coaches add athlete history notes" on public.athlete_journal_entries;
create policy "athletes and coaches add athlete history notes" on public.athlete_journal_entries as permissive for INSERT to authenticated
with check (((author_id = ( SELECT auth.uid() AS uid)) AND ((private.is_linked_athlete_in_org(athlete_id, organization_id) AND (actor_type = 'athlete'::text) AND (visibility = 'shared'::text)) OR (private.can_manage_athlete_in_org(athlete_id, organization_id) AND (actor_type =
CASE
    WHEN private.is_org_admin(organization_id) THEN 'admin'::text
    ELSE 'coach'::text
END)))));

drop policy if exists "linked parties read shared athlete history" on public.athlete_journal_entries;
create policy "linked parties read shared athlete history" on public.athlete_journal_entries as permissive for SELECT to authenticated
using ((private.can_access_athlete_in_org(athlete_id, organization_id) AND ((visibility = 'shared'::text) OR private.can_manage_athlete_in_org(athlete_id, organization_id))));

drop policy if exists "athletes submit measurements for validation" on public.athlete_measurements;
create policy "athletes submit measurements for validation" on public.athlete_measurements as permissive for INSERT to authenticated
with check ((private.is_linked_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid)) AND (validation_status = 'pending_validation'::text) AND (validated_by IS NULL) AND (validated_at IS NULL)));

drop policy if exists "coaches add validated measurements" on public.athlete_measurements;
create policy "coaches add validated measurements" on public.athlete_measurements as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid)) AND (validation_status = 'validated'::text) AND (validated_by = ( SELECT auth.uid() AS uid)) AND (validated_at IS NOT NULL)));

drop policy if exists "athlete measurements read by linked parties" on public.athlete_measurements;
create policy "athlete measurements read by linked parties" on public.athlete_measurements as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches validate or correct measurements" on public.athlete_measurements;
create policy "coaches validate or correct measurements" on public.athlete_measurements as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "athletes submit personal records for validation" on public.athlete_personal_records;
create policy "athletes submit personal records for validation" on public.athlete_personal_records as permissive for INSERT to authenticated
with check ((private.is_linked_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid)) AND (validation_status = 'pending_validation'::text) AND (validated_by IS NULL) AND (validated_at IS NULL)));

drop policy if exists "coaches add validated personal records" on public.athlete_personal_records;
create policy "coaches add validated personal records" on public.athlete_personal_records as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid)) AND (validation_status = 'validated'::text) AND (validated_by = ( SELECT auth.uid() AS uid)) AND (validated_at IS NOT NULL)));

drop policy if exists "personal records read by linked parties" on public.athlete_personal_records;
create policy "personal records read by linked parties" on public.athlete_personal_records as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches validate or correct personal records" on public.athlete_personal_records;
create policy "coaches validate or correct personal records" on public.athlete_personal_records as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches manage athlete profile" on public.athlete_profiles;
create policy "coaches manage athlete profile" on public.athlete_profiles as permissive for INSERT to authenticated
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "athlete profile visible to linked parties" on public.athlete_profiles;
create policy "athlete profile visible to linked parties" on public.athlete_profiles as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update athlete profile" on public.athlete_profiles;
create policy "coaches update athlete profile" on public.athlete_profiles as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "admins or owners delete athletes" on public.athletes;
create policy "admins or owners delete athletes" on public.athletes as permissive for DELETE to authenticated
using (private.can_manage_athlete(id));

drop policy if exists "admins create athletes for coaches" on public.athletes;
create policy "admins create athletes for coaches" on public.athletes as permissive for INSERT to authenticated
with check ((private.is_org_admin(organization_id) AND ((owner_coach_id = ( SELECT auth.uid() AS uid)) OR private.is_org_coach(organization_id, owner_coach_id))));

drop policy if exists "coaches create own athletes" on public.athletes;
create policy "coaches create own athletes" on public.athletes as permissive for INSERT to authenticated
with check ((private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid)) AND (owner_coach_id = ( SELECT auth.uid() AS uid))));

drop policy if exists "assigned coaches read athletes" on public.athletes;
create policy "assigned coaches read athletes" on public.athletes as permissive for SELECT to authenticated
using (private.can_access_athlete(id));

drop policy if exists "coaches update assigned athletes" on public.athletes;
create policy "coaches update assigned athletes" on public.athletes as permissive for UPDATE to authenticated
using (private.can_manage_athlete(id))
with check (private.can_manage_athlete(id));

drop policy if exists "admins assign coaches" on public.coach_athletes;
create policy "admins assign coaches" on public.coach_athletes as permissive for ALL to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy if exists "coach can register own assignment" on public.coach_athletes;
create policy "coach can register own assignment" on public.coach_athletes as permissive for INSERT to authenticated
with check ((private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid)) AND (coach_id = ( SELECT auth.uid() AS uid)) AND (assigned_by = ( SELECT auth.uid() AS uid)) AND private.can_manage_athlete_in_org(athlete_id, organization_id)));

drop policy if exists "coaches and athletes read own assignments" on public.coach_athletes;
create policy "coaches and athletes read own assignments" on public.coach_athletes as permissive for SELECT to authenticated
using ((private.is_org_admin(organization_id) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid)) AND private.can_manage_athlete_in_org(athlete_id, organization_id)) OR private.is_linked_athlete_in_org(athlete_id, organization_id)));

drop policy if exists "no direct client access to coach invitations" on public.coach_invitations;
create policy "no direct client access to coach invitations" on public.coach_invitations as permissive for ALL to authenticated
using (false)
with check (false);

drop policy if exists "admins manage coach profiles" on public.coach_profiles;
create policy "admins manage coach profiles" on public.coach_profiles as permissive for ALL to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy if exists "coaches manage own coach profile" on public.coach_profiles;
create policy "coaches manage own coach profile" on public.coach_profiles as permissive for INSERT to authenticated
with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid))));

drop policy if exists "org members read coach profiles" on public.coach_profiles;
create policy "org members read coach profiles" on public.coach_profiles as permissive for SELECT to authenticated
using ((private.is_org_admin(organization_id) OR ((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid)))));

drop policy if exists "coaches update own coach profile" on public.coach_profiles;
create policy "coaches update own coach profile" on public.coach_profiles as permissive for UPDATE to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid))))
with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid))));

drop policy if exists "coaches add competition attempts" on public.competition_attempts;
create policy "coaches add competition attempts" on public.competition_attempts as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (recorded_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "competition attempts visible to linked parties" on public.competition_attempts;
create policy "competition attempts visible to linked parties" on public.competition_attempts as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update competition attempts" on public.competition_attempts;
create policy "coaches update competition attempts" on public.competition_attempts as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "admins create competitions" on public.competitions;
create policy "admins create competitions" on public.competitions as permissive for INSERT to authenticated
with check ((private.is_org_admin(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "organization and participating athletes read competitions" on public.competitions;
create policy "organization and participating athletes read competitions" on public.competitions as permissive for SELECT to authenticated
using ((private.is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM athlete_competitions ac
  WHERE ((ac.competition_id = competitions.id) AND (ac.organization_id = competitions.organization_id) AND private.can_access_athlete_in_org(ac.athlete_id, ac.organization_id))))));

drop policy if exists "admins update competitions" on public.competitions;
create policy "admins update competitions" on public.competitions as permissive for UPDATE to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy if exists "coaches record consents" on public.data_consents;
create policy "coaches record consents" on public.data_consents as permissive for INSERT to authenticated
with check (((recorded_by = ( SELECT auth.uid() AS uid)) AND (private.is_org_admin(organization_id) OR ((subject_athlete_id IS NOT NULL) AND private.can_manage_athlete_in_org(subject_athlete_id, organization_id)))));

drop policy if exists "coaches read consents" on public.data_consents;
create policy "coaches read consents" on public.data_consents as permissive for SELECT to authenticated
using ((private.is_org_admin(organization_id) OR ((subject_athlete_id IS NOT NULL) AND private.can_access_athlete_in_org(subject_athlete_id, organization_id))));

drop policy if exists "assigned coaches add evaluations" on public.evaluations;
create policy "assigned coaches add evaluations" on public.evaluations as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "assigned coaches read evaluations" on public.evaluations;
create policy "assigned coaches read evaluations" on public.evaluations as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "assigned coaches update evaluations" on public.evaluations;
create policy "assigned coaches update evaluations" on public.evaluations as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "admins manage organization exercises" on public.exercise_catalog;
create policy "admins manage organization exercises" on public.exercise_catalog as permissive for INSERT to authenticated
with check (((organization_id IS NOT NULL) AND private.is_org_admin(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "authenticated users read applicable exercises" on public.exercise_catalog;
create policy "authenticated users read applicable exercises" on public.exercise_catalog as permissive for SELECT to authenticated
using (((organization_id IS NULL) OR private.is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM athlete_accounts aa
  WHERE ((aa.organization_id = exercise_catalog.organization_id) AND (aa.user_id = ( SELECT auth.uid() AS uid)) AND (aa.account_status = ANY (ARRAY['invited'::text, 'active'::text])))))));

drop policy if exists "admins update organization exercises" on public.exercise_catalog;
create policy "admins update organization exercises" on public.exercise_catalog as permissive for UPDATE to authenticated
using (((organization_id IS NOT NULL) AND private.is_org_admin(organization_id)))
with check (((organization_id IS NOT NULL) AND private.is_org_admin(organization_id)));

drop policy if exists "coaches insert interventions" on public.interventions;
create policy "coaches insert interventions" on public.interventions as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (private.is_org_admin(organization_id) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid))))));

drop policy if exists "assigned coaches read interventions" on public.interventions;
create policy "assigned coaches read interventions" on public.interventions as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update interventions" on public.interventions;
create policy "coaches update interventions" on public.interventions as permissive for UPDATE to authenticated
using ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (private.is_org_admin(organization_id) OR (coach_id = ( SELECT auth.uid() AS uid)))))
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (private.is_org_admin(organization_id) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND private.is_org_coach(organization_id, ( SELECT auth.uid() AS uid))))));

drop policy if exists "assigned coaches add media metadata" on public.media_assets;
create policy "assigned coaches add media metadata" on public.media_assets as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (uploaded_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "athletes upload own media metadata" on public.media_assets;
create policy "athletes upload own media metadata" on public.media_assets as permissive for INSERT to authenticated
with check ((private.is_linked_athlete_in_org(athlete_id, organization_id) AND (uploaded_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "assigned coaches read media metadata" on public.media_assets;
create policy "assigned coaches read media metadata" on public.media_assets as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "admins manage memberships" on public.organization_memberships;
create policy "admins manage memberships" on public.organization_memberships as permissive for ALL to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy if exists "members read memberships" on public.organization_memberships;
create policy "members read memberships" on public.organization_memberships as permissive for SELECT to authenticated
using ((private.is_org_admin(organization_id) OR (user_id = ( SELECT auth.uid() AS uid))));

drop policy if exists "org members read organization" on public.organizations;
create policy "org members read organization" on public.organizations as permissive for SELECT to authenticated
using (private.is_org_member(id));

drop policy if exists "coaches create plan items" on public.training_plan_items;
create policy "coaches create plan items" on public.training_plan_items as permissive for INSERT to authenticated
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "plan items visible to linked parties" on public.training_plan_items;
create policy "plan items visible to linked parties" on public.training_plan_items as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update plan items" on public.training_plan_items;
create policy "coaches update plan items" on public.training_plan_items as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches create plan sessions" on public.training_plan_sessions;
create policy "coaches create plan sessions" on public.training_plan_sessions as permissive for INSERT to authenticated
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "plan sessions visible to linked parties" on public.training_plan_sessions;
create policy "plan sessions visible to linked parties" on public.training_plan_sessions as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update plan sessions" on public.training_plan_sessions;
create policy "coaches update plan sessions" on public.training_plan_sessions as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches create training plans" on public.training_plans;
create policy "coaches create training plans" on public.training_plans as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "training plans visible to linked parties" on public.training_plans;
create policy "training plans visible to linked parties" on public.training_plans as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coaches update training plans" on public.training_plans;
create policy "coaches update training plans" on public.training_plans as permissive for UPDATE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id))
with check (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "athletes record own performed exercises" on public.training_session_items;
create policy "athletes record own performed exercises" on public.training_session_items as permissive for INSERT to authenticated
with check ((private.is_linked_athlete_in_org(athlete_id, organization_id) AND (performed_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "coaches record performed exercises" on public.training_session_items;
create policy "coaches record performed exercises" on public.training_session_items as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (performed_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "performed exercises visible to linked parties" on public.training_session_items;
create policy "performed exercises visible to linked parties" on public.training_session_items as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "coach or author updates performed exercises" on public.training_session_items;
create policy "coach or author updates performed exercises" on public.training_session_items as permissive for UPDATE to authenticated
using ((private.can_manage_athlete_in_org(athlete_id, organization_id) OR (private.is_linked_athlete_in_org(athlete_id, organization_id) AND (performed_by = ( SELECT auth.uid() AS uid)))))
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) OR (private.is_linked_athlete_in_org(athlete_id, organization_id) AND (performed_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists "coaches delete sessions" on public.training_sessions;
create policy "coaches delete sessions" on public.training_sessions as permissive for DELETE to authenticated
using (private.can_manage_athlete_in_org(athlete_id, organization_id));

drop policy if exists "assigned coaches add sessions" on public.training_sessions;
create policy "assigned coaches add sessions" on public.training_sessions as permissive for INSERT to authenticated
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));

drop policy if exists "assigned coaches read sessions" on public.training_sessions;
create policy "assigned coaches read sessions" on public.training_sessions as permissive for SELECT to authenticated
using (private.can_access_athlete_in_org(athlete_id, organization_id));

drop policy if exists "assigned coaches or athlete update own sessions" on public.training_sessions;
create policy "assigned coaches or athlete update own sessions" on public.training_sessions as permissive for UPDATE to authenticated
using ((private.can_manage_athlete_in_org(athlete_id, organization_id) OR (private.is_linked_athlete_in_org(athlete_id, organization_id) AND (created_by = ( SELECT auth.uid() AS uid)))))
with check ((private.can_manage_athlete_in_org(athlete_id, organization_id) OR (private.is_linked_athlete_in_org(athlete_id, organization_id) AND (created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists "org members delete private athlete media" on storage.objects;
create policy "org members delete private athlete media" on storage.objects as permissive for DELETE to authenticated
using (((bucket_id = 'athlete-media'::text) AND private.can_manage_athlete_in_org(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid)));

drop policy if exists "org members upload private athlete media" on storage.objects;
create policy "org members upload private athlete media" on storage.objects as permissive for INSERT to authenticated
with check (((bucket_id = 'athlete-media'::text) AND private.can_access_athlete_in_org(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid)));

drop policy if exists "org members read private athlete media" on storage.objects;
create policy "org members read private athlete media" on storage.objects as permissive for SELECT to authenticated
using (((bucket_id = 'athlete-media'::text) AND private.can_access_athlete_in_org(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[1])::uuid)));

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke all on function public.approve_athlete_access_request(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_athlete_access_request(uuid,uuid,uuid) to service_role;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all privileges on public.coach_invitations from anon, authenticated;
drop function if exists public.is_org_admin(uuid);
drop function if exists public.is_org_member(uuid);
drop function if exists public.is_org_coach(uuid,uuid);
drop function if exists public.is_linked_athlete(uuid);
drop function if exists public.is_linked_athlete_in_org(uuid,uuid);
drop function if exists public.can_manage_athlete(uuid);
drop function if exists public.can_manage_athlete_in_org(uuid,uuid);
drop function if exists public.can_access_athlete(uuid);
drop function if exists public.can_access_athlete_in_org(uuid,uuid);
