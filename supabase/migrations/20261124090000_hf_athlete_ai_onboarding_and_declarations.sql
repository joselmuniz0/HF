-- Athlete-controlled AI onboarding and versioned sworn declarations.
-- Health details are stored separately from general athlete profile data.

create table if not exists public.athlete_ai_onboarding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  declared_age integer not null check (declared_age between 18 and 100),
  height_cm numeric(6,2) not null check (height_cm between 50 and 250),
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 300),
  training_years numeric(5,2) not null check (training_years between 0 and 80),
  training_days_per_week smallint not null check (training_days_per_week between 1 and 7),
  training_objective text not null check (length(btrim(training_objective)) between 3 and 1500),
  declared_level text not null check (declared_level in ('initial','intermediate','advanced','undetermined')),
  level_status text not null check (level_status in ('athlete_declared','pending_video_assessment','video_assessed_pending_coach','coach_validated')),
  snatch_kg numeric(7,2) check (snatch_kg is null or snatch_kg between 1 and 500),
  snatch_not_tested boolean not null default false,
  clean_jerk_kg numeric(7,2) check (clean_jerk_kg is null or clean_jerk_kg between 1 and 500),
  clean_jerk_not_tested boolean not null default false,
  back_squat_kg numeric(7,2) check (back_squat_kg is null or back_squat_kg between 1 and 700),
  back_squat_not_tested boolean not null default false,
  front_squat_kg numeric(7,2) check (front_squat_kg is null or front_squat_kg between 1 and 600),
  front_squat_not_tested boolean not null default false,
  profile_status text not null check (profile_status in ('ready_for_ai_planning','needs_video_assessment','requires_human_review')),
  personal_data_status text not null default 'athlete_declared' check (personal_data_status in ('athlete_declared','coach_validated')),
  sport_data_status text not null default 'athlete_declared' check (sport_data_status in ('athlete_declared','pending_validation','coach_validated')),
  declaration_version text not null,
  declaration_acceptance_id uuid,
  declared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, athlete_id),
  unique (organization_id, user_id),
  check ((snatch_kg is not null) <> snatch_not_tested),
  check ((clean_jerk_kg is not null) <> clean_jerk_not_tested),
  check ((back_squat_kg is not null) <> back_squat_not_tested),
  check ((front_squat_kg is not null) <> front_squat_not_tested)
);

create index if not exists idx_athlete_ai_onboarding_user
  on public.athlete_ai_onboarding(user_id, profile_status);

create table if not exists public.athlete_health_declarations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  declaration_status text not null default 'athlete_declared'
    check (declaration_status in ('athlete_declared','coach_reviewed','superseded')),
  health_status text not null
    check (health_status in ('no_known_conditions','conditions_reported','prefer_not_to_disclose')),
  chronic_conditions text,
  bone_joint_injuries text,
  muscular_injuries text,
  surgeries text,
  medication_and_treatments text,
  medical_restrictions text,
  other_relevant_history text,
  consent_for_ai_processing boolean not null default false,
  consent_version text not null,
  consented_at timestamptz,
  declared_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  check (
    (consent_for_ai_processing = true and consented_at is not null)
    or (consent_for_ai_processing = false and consented_at is null)
  )
);

create index if not exists idx_athlete_health_declarations_latest
  on public.athlete_health_declarations(athlete_id, declared_at desc);

create table if not exists public.athlete_ai_declaration_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  declaration_version text not null,
  declaration_text text not null,
  declaration_sha256 text not null check (length(declaration_sha256)=64),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_athlete_ai_declaration_acceptances_user
  on public.athlete_ai_declaration_acceptances(user_id, accepted_at desc);

alter table public.athlete_ai_onboarding enable row level security;
alter table public.athlete_health_declarations enable row level security;
alter table public.athlete_ai_declaration_acceptances enable row level security;

revoke all on public.athlete_ai_onboarding from anon, authenticated;
revoke all on public.athlete_health_declarations from anon, authenticated;
revoke all on public.athlete_ai_declaration_acceptances from anon, authenticated;

grant select on public.athlete_ai_onboarding to authenticated;
grant select on public.athlete_health_declarations to authenticated;
grant select on public.athlete_ai_declaration_acceptances to authenticated;

drop policy if exists "athletes and assigned coaches read AI onboarding" on public.athlete_ai_onboarding;
create policy "athletes and assigned coaches read AI onboarding"
  on public.athlete_ai_onboarding
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_manage_athlete_in_org(athlete_id, organization_id)
  );

drop policy if exists "athletes and assigned coaches read health declaration" on public.athlete_health_declarations;
create policy "athletes and assigned coaches read health declaration"
  on public.athlete_health_declarations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_manage_athlete_in_org(athlete_id, organization_id)
  );

drop policy if exists "athletes read own declaration acceptance" on public.athlete_ai_declaration_acceptances;
create policy "athletes read own declaration acceptance"
  on public.athlete_ai_declaration_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.athlete_ai_onboarding is
  'Datos personales y deportivos autodeclarados para HF Coach IA. Estado y valores de declaración separados de validación humana.';
comment on table public.athlete_health_declarations is
  'Información sensible de salud separada de la ficha general. Historial append-only; lectura limitada al titular y coach humano con acceso a la ficha.';
comment on table public.athlete_ai_declaration_acceptances is
  'Registro append-only de aceptación de la declaración jurada versionada por el atleta.';
