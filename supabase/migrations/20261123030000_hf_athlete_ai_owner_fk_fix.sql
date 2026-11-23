-- Correct the AI-only owner reference to satisfy the existing FK to auth.users.
create or replace function public.link_athlete_to_hf_ai(
  p_user_id uuid,
  p_full_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_email text;
  v_email_confirmed timestamptz;
  v_full_name text;
  v_org_id uuid;
  v_athlete_id uuid;
  v_now timestamptz := now();
  v_ai_owner uuid;
  v_existing_org uuid;
  v_existing_status text;
  v_existing_assignment uuid;
begin
  if p_user_id is null then
    raise exception 'No se identificó una cuenta de atleta.' using errcode='22023';
  end if;

  select lower(u.email), u.email_confirmed_at,
         coalesce(nullif(btrim(p_full_name), ''),
                  nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
                  split_part(u.email, '@', 1))
    into v_email, v_email_confirmed, v_full_name
  from auth.users u
  where u.id = p_user_id;

  if not found or v_email is null or v_email_confirmed is null then
    raise exception 'La cuenta debe existir y tener el correo confirmado.' using errcode='42501';
  end if;
  if length(v_full_name) < 2 or length(v_full_name) > 120 then
    raise exception 'Ingresá un nombre y apellido válidos.' using errcode='22023';
  end if;

  -- The legacy owner_coach_id FK points to auth.users. For AI-only linkage,
  -- use the athlete's verified Auth identity. This does not grant coach rights:
  -- can_manage_athlete also requires an admin/coach organization membership.
  v_ai_owner := p_user_id;

  if exists (
    select 1 from public.organization_memberships m
    where m.user_id = p_user_id
  ) then
    raise exception 'Esta cuenta ya pertenece al equipo de coaches o administración; no puede registrarse como atleta.' using errcode='42501';
  end if;

  select o.id into v_org_id
  from public.organizations o
  where o.name = 'HF Coach'
  order by o.created_at asc
  limit 1;

  if v_org_id is null then
    raise exception 'No se encontró la organización HF Coach.' using errcode='P0002';
  end if;
  if (select count(*) from public.organizations o where o.name = 'HF Coach') <> 1 then
    raise exception 'Hay más de una organización HF Coach; la vinculación automática requiere seleccionar una organización.' using errcode='22023';
  end if;

  select aa.athlete_id, aa.organization_id, aa.account_status
    into v_athlete_id, v_existing_org, v_existing_status
  from public.athlete_accounts aa
  where aa.user_id = p_user_id
    and aa.account_status in ('invited','active')
  order by aa.created_at desc
  limit 1;

  if found then
    if v_existing_org <> v_org_id then
      raise exception 'La cuenta ya está vinculada a otra organización.' using errcode='23505';
    end if;
    if v_existing_status <> 'active' then
      raise exception 'La cuenta tiene una invitación pendiente. Primero debe completarse esa activación.' using errcode='23505';
    end if;

    insert into public.athlete_ai_coach_assignments (
      organization_id, athlete_id, user_id, coach_key, coach_label,
      status, human_review_required, assigned_at
    ) values (
      v_org_id, v_athlete_id, p_user_id, 'hf_coach_ai', 'HF Coach IA',
      'active', true, v_now
    )
    on conflict (organization_id, user_id) do update
      set status = 'active',
          assigned_at = coalesce(public.athlete_ai_coach_assignments.assigned_at, excluded.assigned_at)
    returning id into v_existing_assignment;

    return jsonb_build_object(
      'ok', true, 'existing', true, 'athlete_id', v_athlete_id,
      'organization_id', v_org_id, 'assignment_id', v_existing_assignment,
      'coach_key', 'hf_coach_ai', 'coach_label', 'HF Coach IA',
      'human_review_required', true
    );
  end if;

  if exists (
    select 1 from public.athlete_access_requests r
    where r.requested_by = p_user_id and r.status = 'pending'
  ) then
    raise exception 'Hay una solicitud pendiente con un coach humano. Resolvela antes de activar el vínculo directo con Coach IA.' using errcode='23505';
  end if;

  insert into public.athletes (
    organization_id, owner_coach_id, full_name, level, notes, updated_at
  ) values (
    v_org_id, v_ai_owner, v_full_name, null,
    'Perfil inicial vinculado a HF Coach IA. Completar peso corporal, marcas y antecedentes deportivos en el portal; los datos declarados deberán validarse.',
    v_now
  ) returning id into v_athlete_id;

  insert into public.athlete_profiles (
    athlete_id, organization_id, profile_notes, created_by, updated_by, updated_at
  ) values (
    v_athlete_id, v_org_id,
    'Alta directa en HF Coach IA. Perfil deportivo pendiente de completar y validar.',
    p_user_id, p_user_id, v_now
  );

  insert into public.athlete_accounts (
    organization_id, athlete_id, user_id, email, account_status,
    linked_by, linked_at, activated_at
  ) values (
    v_org_id, v_athlete_id, p_user_id, v_email, 'active',
    p_user_id, v_now, v_now
  );

  insert into public.athlete_ai_coach_assignments (
    organization_id, athlete_id, user_id, coach_key, coach_label,
    status, human_review_required, assigned_at
  ) values (
    v_org_id, v_athlete_id, p_user_id, 'hf_coach_ai', 'HF Coach IA',
    'active', true, v_now
  ) returning id into v_existing_assignment;

  return jsonb_build_object(
    'ok', true, 'existing', false, 'athlete_id', v_athlete_id,
    'organization_id', v_org_id, 'assignment_id', v_existing_assignment,
    'coach_key', 'hf_coach_ai', 'coach_label', 'HF Coach IA',
    'human_review_required', true
  );
end;
$function$;

comment on column public.athletes.owner_coach_id is
  'Identidad heredada del responsable. En perfiles vinculados directamente a HF Coach IA referencia el usuario autenticado del propio atleta para cumplir la FK a auth.users. La vinculación con el servicio IA se guarda en athlete_ai_coach_assignments; este campo por sí solo no otorga permisos de coach.';
