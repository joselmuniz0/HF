
create table if not exists public.athlete_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  athlete_id uuid not null,
  notification_type text not null,
  title text not null,
  body text,
  related_plan_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint athlete_notifications_athlete_org_fk
    foreign key (athlete_id, organization_id) references public.athletes(id, organization_id) on delete restrict,
  constraint athlete_notifications_plan_athlete_fk
    foreign key (related_plan_id, athlete_id) references public.training_plans(id, athlete_id) on delete cascade
);

create index if not exists athlete_notifications_inbox_idx
  on public.athlete_notifications(athlete_id, created_at desc);

alter table public.athlete_notifications enable row level security;

drop policy if exists "linked parties read athlete notifications" on public.athlete_notifications;
create policy "linked parties read athlete notifications"
  on public.athlete_notifications for select to authenticated
  using (
    private.can_manage_athlete_in_org(athlete_id, organization_id)
    or private.can_access_athlete_in_org(athlete_id, organization_id)
  );

drop policy if exists "coaches create athlete notifications" on public.athlete_notifications;
create policy "coaches create athlete notifications"
  on public.athlete_notifications for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.can_manage_athlete_in_org(athlete_id, organization_id)
  );

drop policy if exists "athlete marks own notification as read" on public.athlete_notifications;
create policy "athlete marks own notification as read"
  on public.athlete_notifications for update to authenticated
  using (
    exists (
      select 1 from public.athlete_accounts aa
      where aa.athlete_id = athlete_notifications.athlete_id
        and aa.user_id = auth.uid()
        and aa.account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.athlete_accounts aa
      where aa.athlete_id = athlete_notifications.athlete_id
        and aa.user_id = auth.uid()
        and aa.account_status = 'active'
    )
  );

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
  v_plan_name text;
  v_published_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  select athlete_id, organization_id, name
    into v_athlete_id, v_organization_id, v_plan_name
  from public.training_plans
  where id = p_plan_id
  for update;
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

  insert into public.athlete_notifications (
    organization_id, athlete_id, notification_type, title, body,
    related_plan_id, created_by
  ) values (
    v_organization_id, v_athlete_id, 'training_plan_published',
    'Nueva planificación disponible',
    'Tu coach publicó "' || v_plan_name || '". Ya podés consultarla en Mi planificación.',
    p_plan_id, v_user_id
  );

  return v_published_at;
end;
$function$;

revoke all on function public.publish_training_plan(uuid) from public;
revoke execute on function public.publish_training_plan(uuid) from anon;
grant execute on function public.publish_training_plan(uuid) to authenticated;
