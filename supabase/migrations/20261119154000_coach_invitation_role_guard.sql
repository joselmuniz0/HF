create or replace function public.accept_coach_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text,
  p_display_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_invitation public.coach_invitations%rowtype;
  v_existing_role text;
  v_member_user_id uuid;
begin
  if p_user_id is null or p_email is null or p_display_name is null then
    raise exception 'Faltan datos para confirmar la invitación.' using errcode = '22023';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' or lower(btrim(p_email)) <> p_email then
    raise exception 'La invitación no es válida.' using errcode = '22023';
  end if;

  select m.role into v_existing_role
  from public.organization_memberships m
  join public.coach_invitations i on i.organization_id = m.organization_id
  where i.token_hash = p_token_hash and m.user_id = p_user_id
  limit 1;

  if v_existing_role = 'admin' then
    raise exception 'Una cuenta administradora no puede aceptar una invitación de coach.' using errcode = '42501';
  end if;

  update public.coach_invitations
  set accepted_at = now(),
      accepted_by = p_user_id
  where token_hash = p_token_hash
    and email = lower(btrim(p_email))
    and role = 'coach'
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  returning * into v_invitation;

  if not found then
    raise exception 'La invitación no existe, venció, fue revocada o ya fue utilizada.' using errcode = '22023';
  end if;

  insert into public.organization_memberships as existing_membership (
    organization_id, user_id, role
  )
  values (v_invitation.organization_id, p_user_id, 'coach')
  on conflict (organization_id, user_id)
  do update set role = 'coach'
  where existing_membership.role <> 'admin'
  returning user_id into v_member_user_id;

  if v_member_user_id is null then
    raise exception 'Una cuenta administradora no puede convertirse en coach.' using errcode = '42501';
  end if;

  insert into public.coach_profiles (
    organization_id, user_id, display_name, email, updated_at
  )
  values (
    v_invitation.organization_id, p_user_id, v_invitation.display_name,
    v_invitation.email, now()
  )
  on conflict (organization_id, user_id)
  do update set
    display_name = excluded.display_name,
    email = excluded.email,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_invitation.organization_id,
    'user_id', p_user_id,
    'email', v_invitation.email,
    'role', 'coach'
  );
end;
$$;

revoke all on function public.accept_coach_invitation(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.accept_coach_invitation(text, uuid, text, text) to service_role;
