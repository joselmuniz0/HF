-- Human review workflow for personal HF Coach AI plans.
-- Coaches/admins can approve and publish, or reject with a reason.

alter table public.training_plans
  drop constraint if exists training_plans_status_check;

alter table public.training_plans
  add constraint training_plans_status_check
  check (status in ('draft','active','completed','archived','rejected'));

alter table public.training_plans
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

create index if not exists idx_training_plans_pending_ai_review
  on public.training_plans(organization_id,created_at desc)
  where generation_source='coach_ai_personal' and status='draft';

create or replace function public.review_athlete_ai_plan(
  p_plan_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.training_plans%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_user_id is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode='28000';
  end if;
  if p_plan_id is null or p_decision not in ('approve','reject') then
    raise exception 'La decisión de revisión no es válida.' using errcode='22023';
  end if;

  select * into v_plan
  from public.training_plans
  where id=p_plan_id
  for update;

  if not found then
    raise exception 'No se encontró la planificación.' using errcode='P0002';
  end if;
  if v_plan.generation_source <> 'coach_ai_personal' then
    raise exception 'Este procedimiento está reservado para propuestas personales de HF Coach IA.' using errcode='42501';
  end if;
  if v_plan.status <> 'draft' then
    raise exception 'La propuesta ya fue revisada o dejó de estar pendiente.' using errcode='55000';
  end if;
  if not private.can_manage_athlete_in_org(v_plan.athlete_id,v_plan.organization_id) then
    raise exception 'Solo el coach asignado o la administración pueden revisar esta propuesta.' using errcode='42501';
  end if;

  if p_decision='approve' then
    if not exists(select 1 from public.training_plan_sessions s where s.plan_id=p_plan_id)
       or not exists(
         select 1 from public.training_plan_items i
         join public.training_plan_sessions s on s.id=i.plan_session_id
         where s.plan_id=p_plan_id
       ) then
      raise exception 'La propuesta necesita al menos una sesión y un ejercicio antes de aprobarse.' using errcode='22023';
    end if;

    update public.training_plans
       set status='active',
           approved_by=v_user_id,
           approved_at=v_now,
           published_at=v_now,
           published_by=v_user_id,
           reviewed_by=v_user_id,
           reviewed_at=v_now,
           rejection_reason=null,
           updated_at=v_now
     where id=p_plan_id;

    insert into public.athlete_notifications(
      organization_id,athlete_id,notification_type,title,body,related_plan_id,created_by
    ) values (
      v_plan.organization_id,v_plan.athlete_id,'training_plan_published',
      'Planificación aprobada y publicada',
      'Tu coach revisó y aprobó la propuesta de HF Coach IA "'||v_plan.name||'". Ya está disponible en Mi planificación.',
      p_plan_id,v_user_id
    );

    return jsonb_build_object(
      'ok',true,'decision','approved','plan_id',p_plan_id,
      'reviewed_by',v_user_id,'reviewed_at',v_now,'status','active'
    );
  end if;

  if v_reason is null or length(v_reason)<5 or length(v_reason)>1500 then
    raise exception 'Para rechazar una propuesta, indicá un motivo de al menos 5 caracteres.' using errcode='22023';
  end if;

  update public.training_plans
     set status='rejected',
         approved_by=null,
         approved_at=null,
         published_at=null,
         published_by=null,
         reviewed_by=v_user_id,
         reviewed_at=v_now,
         rejection_reason=v_reason,
         updated_at=v_now
   where id=p_plan_id;

  insert into public.athlete_notifications(
    organization_id,athlete_id,notification_type,title,body,related_plan_id,created_by
  ) values (
    v_plan.organization_id,v_plan.athlete_id,'training_plan_rejected',
    'Propuesta de planificación no aprobada',
    'Tu coach revisó la propuesta de HF Coach IA "'||v_plan.name||'" y solicitó cambios. Motivo: '||v_reason,
    p_plan_id,v_user_id
  );

  return jsonb_build_object(
    'ok',true,'decision','rejected','plan_id',p_plan_id,
    'reviewed_by',v_user_id,'reviewed_at',v_now,'status','rejected',
    'reason',v_reason
  );
end;
$function$;

revoke all on function public.review_athlete_ai_plan(uuid,text,text) from public,anon;
grant execute on function public.review_athlete_ai_plan(uuid,text,text) to authenticated;

comment on function public.review_athlete_ai_plan(uuid,text,text) is
  'Allows the assigned coach or organization admin to approve/publish or reject a personal HF Coach AI draft. Writes reviewer and decision audit columns and notifies the athlete.';
