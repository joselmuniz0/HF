-- Link a verified athlete account directly to the HF Coach AI service.
-- The legacy owner_coach_id field uses a reserved virtual identity for AI-only ownership.
create table if not exists public.athlete_ai_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coach_key text not null default 'hf_coach_ai' check (coach_key = 'hf_coach_ai'),
  coach_label text not null default 'HF Coach IA',
  status text not null default 'active' check (status in ('active','paused')),
  human_review_required boolean not null default true,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, athlete_id),
  unique (organization_id, user_id)
);

create index if not exists idx_athlete_ai_coach_assignments_user
  on public.athlete_ai_coach_assignments(user_id, status);

alter table public.athlete_ai_coach_assignments enable row level security;
revoke all on public.athlete_ai_coach_assignments from anon;
grant select on public.athlete_ai_coach_assignments to authenticated;

drop policy if exists "athletes read own AI coach assignment" on public.athlete_ai_coach_assignments;
create policy "athletes read own AI coach assignment"
  on public.athlete_ai_coach_assignments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_org_admin(organization_id)
  );

comment on table public.athlete_ai_coach_assignments is
  'Vinculación explícita de una cuenta de atleta con el servicio HF Coach IA. No representa un coach humano. Las planificaciones generadas requieren revisión humana.';
comment on column public.athletes.owner_coach_id is
  'Identidad heredada del coach responsable. Para perfiles vinculados solo a HF Coach IA se usa el UUID virtual reservado 00000000-0000-4000-8000-000000000001; el vínculo real de IA vive en athlete_ai_coach_assignments.';

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
  v_ai_owner uuid := '00000000-0000-4000-8000-000000000001'::uuid;
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

revoke all on function public.link_athlete_to_hf_ai(uuid,text) from public, anon, authenticated;
grant execute on function public.link_athlete_to_hf_ai(uuid,text) to service_role;
