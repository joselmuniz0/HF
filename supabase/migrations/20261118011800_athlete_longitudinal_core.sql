-- HF Coach: núcleo longitudinal del atleta y acceso por roles.
-- Aplicada en Supabase como versión 20261118011800.
-- Mantiene el historial deportivo y separa planificación de ejecución real.

ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_id_organization_unique UNIQUE (id, organization_id);

CREATE TABLE public.athlete_profiles (
  athlete_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  date_of_birth date, sporting_start_date date, federation text, nationality text,
  dominant_side text CHECK (dominant_side IN ('right','left','ambidextrous')),
  profile_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE public.athlete_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  email text NOT NULL,
  account_status text NOT NULL DEFAULT 'invited'
    CHECK (account_status IN ('invited','active','suspended')),
  linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (user_id, athlete_id)
);
CREATE INDEX idx_athlete_accounts_user ON public.athlete_accounts(user_id, account_status);
CREATE INDEX idx_athlete_accounts_athlete ON public.athlete_accounts(athlete_id, organization_id);

CREATE TABLE public.athlete_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_email text NOT NULL, requested_full_name text NOT NULL,
  requested_coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz, review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND reviewed_at IS NULL) OR status <> 'pending')
);
CREATE UNIQUE INDEX idx_one_pending_athlete_request_per_org
  ON public.athlete_access_requests(organization_id, requested_by) WHERE status = 'pending';
CREATE INDEX idx_athlete_access_requests_coach
  ON public.athlete_access_requests(requested_coach_id, status, created_at DESC);

CREATE TABLE public.exercise_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code text, name text NOT NULL, category text NOT NULL,
  movement_pattern text, equipment text, description text,
  is_system boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_exercise_catalog_system_name
  ON public.exercise_catalog(lower(name)) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX idx_exercise_catalog_org_name
  ON public.exercise_catalog(organization_id, lower(name)) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_exercise_catalog_category ON public.exercise_catalog(category, is_active);

CREATE TABLE public.athlete_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL,
  metric_key text NOT NULL CHECK (metric_key IN
    ('body_weight','height','body_fat_percentage','waist_circumference','arm_circumference','thigh_circumference','other')),
  metric_value numeric(10,3) NOT NULL CHECK (metric_value > 0), unit text NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  validation_status text NOT NULL DEFAULT 'pending_validation'
    CHECK (validation_status IN ('pending_validation','validated','rejected')),
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  supersedes_id uuid REFERENCES public.athlete_measurements(id) ON DELETE RESTRICT,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  CHECK ((validation_status = 'validated' AND validated_by IS NOT NULL AND validated_at IS NOT NULL)
      OR validation_status <> 'validated')
);
CREATE INDEX idx_athlete_measurements_history
  ON public.athlete_measurements(athlete_id, metric_key, measured_at DESC);

CREATE TABLE public.athlete_personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL,
  exercise_id uuid REFERENCES public.exercise_catalog(id) ON DELETE RESTRICT,
  exercise_name_snapshot text NOT NULL,
  record_value_kg numeric(10,2) NOT NULL CHECK (record_value_kg > 0),
  record_date date NOT NULL DEFAULT current_date,
  record_type text NOT NULL DEFAULT 'tested' CHECK (record_type IN ('tested','estimated','competition')),
  validation_status text NOT NULL DEFAULT 'pending_validation'
    CHECK (validation_status IN ('pending_validation','validated','rejected')),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  supersedes_id uuid REFERENCES public.athlete_personal_records(id) ON DELETE RESTRICT,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  CHECK ((validation_status = 'validated' AND validated_by IS NOT NULL AND validated_at IS NOT NULL)
      OR validation_status <> 'validated')
);
CREATE INDEX idx_athlete_personal_records_history
  ON public.athlete_personal_records(athlete_id, exercise_id, record_date DESC);

CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL,
  name text NOT NULL, objective text, training_phase text,
  start_date date NOT NULL, end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number > 0),
  supersedes_plan_id uuid REFERENCES public.training_plans(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, approved_at timestamptz,
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, athlete_id)
);
CREATE INDEX idx_training_plans_athlete_dates
  ON public.training_plans(athlete_id, start_date DESC, status);

CREATE TABLE public.training_plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, plan_id uuid NOT NULL,
  week_number smallint NOT NULL DEFAULT 1 CHECK (week_number > 0),
  day_number smallint NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  session_order smallint NOT NULL DEFAULT 1 CHECK (session_order > 0),
  scheduled_date date, session_title text NOT NULL, focus text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, athlete_id)
    REFERENCES public.training_plans(id, athlete_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, athlete_id),
  UNIQUE (plan_id, week_number, day_number, session_order)
);

CREATE TABLE public.training_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, plan_session_id uuid NOT NULL,
  sequence_number smallint NOT NULL CHECK (sequence_number > 0),
  exercise_id uuid REFERENCES public.exercise_catalog(id) ON DELETE RESTRICT,
  exercise_name_snapshot text NOT NULL,
  sets smallint CHECK (sets IS NULL OR sets > 0), reps text,
  target_load_kg numeric(10,2) CHECK (target_load_kg IS NULL OR target_load_kg > 0),
  target_percent_rm numeric(6,2) CHECK (target_percent_rm IS NULL OR target_percent_rm > 0),
  target_rpe numeric(3,1) CHECK (target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  tempo text, prescription jsonb NOT NULL DEFAULT '{}'::jsonb, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_session_id, athlete_id)
    REFERENCES public.training_plan_sessions(id, athlete_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (plan_session_id, sequence_number)
);
CREATE INDEX idx_training_plan_items_session
  ON public.training_plan_items(plan_session_id, sequence_number);

ALTER TABLE public.training_sessions
  ADD COLUMN plan_session_id uuid,
  ADD COLUMN completion_status text NOT NULL DEFAULT 'completed'
    CHECK (completion_status IN ('planned','completed','partial','skipped'));
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_id_athlete_unique UNIQUE (id, athlete_id);
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_plan_session_athlete_fk
  FOREIGN KEY (plan_session_id, athlete_id)
  REFERENCES public.training_plan_sessions(id, athlete_id) ON DELETE RESTRICT;

CREATE TABLE public.training_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, training_session_id uuid NOT NULL,
  planned_item_id uuid REFERENCES public.training_plan_items(id) ON DELETE RESTRICT,
  exercise_id uuid REFERENCES public.exercise_catalog(id) ON DELETE RESTRICT,
  exercise_name_snapshot text NOT NULL,
  sequence_number smallint NOT NULL CHECK (sequence_number > 0),
  sets_completed smallint CHECK (sets_completed IS NULL OR sets_completed >= 0),
  reps_completed text,
  load_kg numeric(10,2) CHECK (load_kg IS NULL OR load_kg >= 0),
  rpe numeric(3,1) CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (training_session_id, athlete_id)
    REFERENCES public.training_sessions(id, athlete_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (training_session_id, sequence_number)
);
CREATE INDEX idx_training_session_items_session
  ON public.training_session_items(training_session_id, sequence_number);

CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL, competition_date date NOT NULL, city text, country text,
  federation text, competition_level text, notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE INDEX idx_competitions_org_date
  ON public.competitions(organization_id, competition_date DESC);

CREATE TABLE public.athlete_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, competition_id uuid NOT NULL,
  body_weight_kg numeric(7,2) CHECK (body_weight_kg IS NULL OR body_weight_kg > 0),
  weight_category text, age_category text,
  best_snatch_kg numeric(7,2) CHECK (best_snatch_kg IS NULL OR best_snatch_kg > 0),
  best_clean_jerk_kg numeric(7,2) CHECK (best_clean_jerk_kg IS NULL OR best_clean_jerk_kg > 0),
  total_kg numeric(8,2) GENERATED ALWAYS AS
    (CASE WHEN best_snatch_kg IS NOT NULL AND best_clean_jerk_kg IS NOT NULL
     THEN best_snatch_kg + best_clean_jerk_kg ELSE NULL END) STORED,
  placement integer CHECK (placement IS NULL OR placement > 0),
  result_status text NOT NULL DEFAULT 'recorded'
    CHECK (result_status IN ('registered','recorded','verified','withdrawn')),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  validation_status text NOT NULL DEFAULT 'pending_validation'
    CHECK (validation_status IN ('pending_validation','validated','rejected')),
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz, result_notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (competition_id, organization_id)
    REFERENCES public.competitions(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, athlete_id),
  CHECK ((validation_status = 'validated' AND validated_by IS NOT NULL AND validated_at IS NOT NULL)
      OR validation_status <> 'validated'),
  UNIQUE (athlete_id, competition_id)
);
CREATE INDEX idx_athlete_competitions_history ON public.athlete_competitions(athlete_id, competition_id);

CREATE TABLE public.competition_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, athlete_competition_id uuid NOT NULL,
  lift text NOT NULL CHECK (lift IN ('snatch','clean_jerk')),
  attempt_number smallint NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  attempted_kg numeric(7,2) CHECK (attempted_kg IS NULL OR attempted_kg > 0),
  attempt_status text NOT NULL CHECK (attempt_status IN ('good','no_lift','pass')),
  notes text, recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_competition_id, athlete_id)
    REFERENCES public.athlete_competitions(id, athlete_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (athlete_competition_id, lift, attempt_number)
);

CREATE TABLE public.athlete_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  athlete_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL, title text NOT NULL, description text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('athlete','coach','admin','system')),
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','coach_only')),
  source_table text, source_record_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, previous_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, organization_id)
    REFERENCES public.athletes(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX idx_athlete_journal_timeline
  ON public.athlete_journal_entries(athlete_id, occurred_at DESC, created_at DESC);
CREATE INDEX idx_athlete_journal_source
  ON public.athlete_journal_entries(source_table, source_record_id);

-- Helpers de autorización: el atleta solo puede acceder a su propio registro vinculado.
CREATE OR REPLACE FUNCTION public.is_linked_athlete(aid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.athlete_accounts aa
    WHERE aa.athlete_id = aid AND aa.user_id = auth.uid()
      AND aa.account_status IN ('invited','active'));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_athlete(aid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = aid AND (
    public.is_org_admin(a.organization_id) OR a.owner_coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = a.id AND ca.coach_id = auth.uid())));
$$;

CREATE OR REPLACE FUNCTION public.is_org_coach(org uuid, coach uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = org AND m.user_id = coach AND m.role IN ('coach','admin'));
$$;

CREATE OR REPLACE FUNCTION public.can_access_athlete(aid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.can_manage_athlete(aid) OR public.is_linked_athlete(aid); $$;

REVOKE EXECUTE ON FUNCTION public.is_linked_athlete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_athlete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_coach(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_linked_athlete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_athlete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_coach(uuid, uuid) TO authenticated, service_role;

-- Limitar los cambios de planificación y evaluaciones al coach/administrador.
DROP POLICY IF EXISTS "coaches update assigned athletes" ON public.athletes;
CREATE POLICY "coaches update assigned athletes" ON public.athletes FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(id)) WITH CHECK (public.can_manage_athlete(id));
DROP POLICY IF EXISTS "admins or owners delete athletes" ON public.athletes;
CREATE POLICY "admins or owners delete athletes" ON public.athletes FOR DELETE TO authenticated
  USING (public.can_manage_athlete(id));

DROP POLICY IF EXISTS "assigned coaches update sessions" ON public.training_sessions;
CREATE POLICY "assigned coaches or athlete update own sessions" ON public.training_sessions FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id) OR
    (public.is_linked_athlete(athlete_id) AND created_by = auth.uid()))
  WITH CHECK (public.can_manage_athlete(athlete_id) OR
    (public.is_linked_athlete(athlete_id) AND created_by = auth.uid()));
DROP POLICY IF EXISTS "assigned coaches delete sessions" ON public.training_sessions;
CREATE POLICY "coaches delete sessions" ON public.training_sessions FOR DELETE TO authenticated
  USING (public.can_manage_athlete(athlete_id));

DROP POLICY IF EXISTS "assigned coaches update evaluations" ON public.evaluations;
CREATE POLICY "assigned coaches update evaluations" ON public.evaluations FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

DROP POLICY IF EXISTS "assigned coaches manage interventions" ON public.interventions;
CREATE POLICY "coaches insert interventions" ON public.interventions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND coach_id = auth.uid() AND is_org_member(organization_id));
CREATE POLICY "coaches update interventions" ON public.interventions FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id) AND coach_id = auth.uid())
  WITH CHECK (public.can_manage_athlete(athlete_id) AND coach_id = auth.uid() AND is_org_member(organization_id));

DROP POLICY IF EXISTS "coaches read athlete assignments" ON public.coach_athletes;
CREATE POLICY "coaches and athletes read own assignments" ON public.coach_athletes FOR SELECT TO authenticated
  USING ((is_org_member(organization_id) AND public.can_access_athlete(athlete_id))
    OR public.is_linked_athlete(athlete_id));

CREATE POLICY "athletes upload own media metadata" ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.is_linked_athlete(athlete_id) AND uploaded_by = auth.uid());

-- Ficha deportiva y cuenta.
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete profile visible to linked parties" ON public.athlete_profiles FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches manage athlete profile" ON public.athlete_profiles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id));
CREATE POLICY "coaches update athlete profile" ON public.athlete_profiles FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.athlete_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete and assigned coach read account link" ON public.athlete_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin(organization_id) OR public.can_manage_athlete(athlete_id));

ALTER TABLE public.athlete_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requester coach and admins read access requests" ON public.athlete_access_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR requested_coach_id = auth.uid() OR is_org_admin(organization_id));
CREATE POLICY "athletes request access with verified account email" ON public.athlete_access_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid()
    AND lower(requested_email) = lower(coalesce(auth.jwt() ->> 'email',''))
    AND public.is_org_coach(organization_id, requested_coach_id)
    AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);

-- Medidas y RM: el atleta declara; el coach valida.
ALTER TABLE public.athlete_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete measurements read by linked parties" ON public.athlete_measurements FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches add validated measurements" ON public.athlete_measurements FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND recorded_by = auth.uid()
    AND validation_status = 'validated' AND validated_by = auth.uid() AND validated_at IS NOT NULL);
CREATE POLICY "athletes submit measurements for validation" ON public.athlete_measurements FOR INSERT TO authenticated
  WITH CHECK (public.is_linked_athlete(athlete_id) AND recorded_by = auth.uid()
    AND validation_status = 'pending_validation' AND validated_by IS NULL AND validated_at IS NULL);
CREATE POLICY "coaches validate or correct measurements" ON public.athlete_measurements FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.athlete_personal_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal records read by linked parties" ON public.athlete_personal_records FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches add validated personal records" ON public.athlete_personal_records FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND recorded_by = auth.uid()
    AND validation_status = 'validated' AND validated_by = auth.uid() AND validated_at IS NOT NULL);
CREATE POLICY "athletes submit personal records for validation" ON public.athlete_personal_records FOR INSERT TO authenticated
  WITH CHECK (public.is_linked_athlete(athlete_id) AND recorded_by = auth.uid()
    AND validation_status = 'pending_validation' AND validated_by IS NULL AND validated_at IS NULL);
CREATE POLICY "coaches validate or correct personal records" ON public.athlete_personal_records FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

-- Catálogo de ejercicios común y por organización.
ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users read applicable exercises" ON public.exercise_catalog FOR SELECT TO authenticated
  USING (organization_id IS NULL OR is_org_member(organization_id) OR EXISTS (
    SELECT 1 FROM public.athlete_accounts aa WHERE aa.organization_id = exercise_catalog.organization_id
      AND aa.user_id = auth.uid() AND aa.account_status IN ('invited','active')));
CREATE POLICY "coaches manage organization exercises" ON public.exercise_catalog FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "coaches update organization exercises" ON public.exercise_catalog FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND is_org_member(organization_id));

-- Planificación: el coach crea/edita; el atleta solo consulta.
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training plans visible to linked parties" ON public.training_plans FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches create training plans" ON public.training_plans FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND created_by = auth.uid());
CREATE POLICY "coaches update training plans" ON public.training_plans FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.training_plan_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan sessions visible to linked parties" ON public.training_plan_sessions FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches create plan sessions" ON public.training_plan_sessions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id));
CREATE POLICY "coaches update plan sessions" ON public.training_plan_sessions FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.training_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan items visible to linked parties" ON public.training_plan_items FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches create plan items" ON public.training_plan_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id));
CREATE POLICY "coaches update plan items" ON public.training_plan_items FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.training_session_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "performed exercises visible to linked parties" ON public.training_session_items FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches record performed exercises" ON public.training_session_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND performed_by = auth.uid());
CREATE POLICY "athletes record own performed exercises" ON public.training_session_items FOR INSERT TO authenticated
  WITH CHECK (public.is_linked_athlete(athlete_id) AND performed_by = auth.uid());
CREATE POLICY "coach or author updates performed exercises" ON public.training_session_items FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id) OR
    (public.is_linked_athlete(athlete_id) AND performed_by = auth.uid()))
  WITH CHECK (public.can_manage_athlete(athlete_id) OR
    (public.is_linked_athlete(athlete_id) AND performed_by = auth.uid()));

-- Torneos, participaciones, resultados e intentos.
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization and participating athletes read competitions" ON public.competitions FOR SELECT TO authenticated
  USING (is_org_member(organization_id) OR EXISTS (
    SELECT 1 FROM public.athlete_competitions ac WHERE ac.competition_id = competitions.id
      AND public.can_access_athlete(ac.athlete_id)));
CREATE POLICY "coaches create competitions" ON public.competitions FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "coaches update competitions" ON public.competitions FOR UPDATE TO authenticated
  USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

ALTER TABLE public.athlete_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete competition history visible to linked parties" ON public.athlete_competitions FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches add athlete competition results" ON public.athlete_competitions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND recorded_by = auth.uid());
CREATE POLICY "coaches update athlete competition results" ON public.athlete_competitions FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

ALTER TABLE public.competition_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competition attempts visible to linked parties" ON public.competition_attempts FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id));
CREATE POLICY "coaches add competition attempts" ON public.competition_attempts FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_athlete(athlete_id) AND recorded_by = auth.uid());
CREATE POLICY "coaches update competition attempts" ON public.competition_attempts FOR UPDATE TO authenticated
  USING (public.can_manage_athlete(athlete_id)) WITH CHECK (public.can_manage_athlete(athlete_id));

-- Bitácora: conserva eventos e instantáneas previas sin permitir edición/borrado por el cliente.
ALTER TABLE public.athlete_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "linked parties read shared athlete history" ON public.athlete_journal_entries FOR SELECT TO authenticated
  USING (public.can_access_athlete(athlete_id) AND
    (visibility = 'shared' OR public.can_manage_athlete(athlete_id)));
CREATE POLICY "athletes and coaches add athlete history notes" ON public.athlete_journal_entries FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND (
    (public.is_linked_athlete(athlete_id) AND actor_type = 'athlete' AND visibility = 'shared')
    OR (public.can_manage_athlete(athlete_id)
      AND actor_type = CASE WHEN is_org_admin(organization_id) THEN 'admin' ELSE 'coach' END)));

CREATE OR REPLACE FUNCTION public.append_athlete_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW); v_old jsonb; v_org uuid; v_athlete uuid;
  v_actor uuid; v_actor_type text; v_event_type text; v_title text;
  v_occurred_at timestamptz; v_metadata jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); END IF;
  v_org := NULLIF(v_new->>'organization_id','')::uuid;
  v_athlete := NULLIF(v_new->>'athlete_id','')::uuid;
  v_actor := COALESCE(NULLIF(v_new->>'recorded_by','')::uuid,
    NULLIF(v_new->>'created_by','')::uuid, NULLIF(v_new->>'coach_id','')::uuid,
    NULLIF(v_new->>'uploaded_by','')::uuid, NULLIF(v_new->>'updated_by','')::uuid,
    NULLIF(v_new->>'performed_by','')::uuid, auth.uid());
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
    ELSE 'other' END;
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
    ELSE 'Registro actualizado' END;
  v_occurred_at := COALESCE(NULLIF(v_new->>'measured_at','')::timestamptz,
    NULLIF(v_new->>'record_date','')::date::timestamptz,
    NULLIF(v_new->>'session_date','')::date::timestamptz,
    NULLIF(v_new->>'created_at','')::timestamptz, now());
  v_actor_type := CASE
    WHEN v_actor IS NULL THEN 'system'
    WHEN v_actor = auth.uid() AND public.is_linked_athlete(v_athlete) THEN 'athlete'
    WHEN public.is_org_admin(v_org) THEN 'admin'
    ELSE 'coach' END;
  v_metadata := v_new - 'object_path';
  INSERT INTO public.athlete_journal_entries (
    organization_id, athlete_id, occurred_at, event_type, title, author_id,
    actor_type, visibility, source_table, source_record_id, metadata, previous_snapshot
  ) VALUES (v_org, v_athlete, v_occurred_at, v_event_type,
    CASE WHEN TG_OP = 'UPDATE' THEN v_title || ' (modificado)' ELSE v_title END,
    v_actor, v_actor_type, 'shared', TG_TABLE_NAME,
    NULLIF(v_new->>'id','')::uuid, v_metadata, v_old);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_athlete_timeline() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['athlete_profiles','athlete_measurements','athlete_personal_records',
    'training_plans','training_plan_sessions','training_plan_items','training_sessions',
    'training_session_items','evaluations','interventions','athlete_competitions','media_assets']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_timeline ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_timeline AFTER INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.append_athlete_timeline()', t, t);
  END LOOP;
END;
$$;

-- Storage privado: el atleta vinculado también puede subir y consultar sus videos.
ALTER POLICY "org members read private athlete media" ON storage.objects TO authenticated
  USING (bucket_id = 'athlete-media'
    AND (is_org_member(((storage.foldername(name))[1])::uuid)
      OR EXISTS (SELECT 1 FROM public.athlete_accounts aa
        WHERE aa.organization_id = ((storage.foldername(name))[1])::uuid
          AND aa.athlete_id = ((storage.foldername(name))[2])::uuid
          AND aa.user_id = auth.uid() AND aa.account_status IN ('invited','active')))
    AND can_access_athlete(((storage.foldername(name))[2])::uuid));

ALTER POLICY "org members upload private athlete media" ON storage.objects TO authenticated
  WITH CHECK (bucket_id = 'athlete-media'
    AND (is_org_member(((storage.foldername(name))[1])::uuid)
      OR EXISTS (SELECT 1 FROM public.athlete_accounts aa
        WHERE aa.organization_id = ((storage.foldername(name))[1])::uuid
          AND aa.athlete_id = ((storage.foldername(name))[2])::uuid
          AND aa.user_id = auth.uid() AND aa.account_status IN ('invited','active')))
    AND can_access_athlete(((storage.foldername(name))[2])::uuid));

REVOKE ALL ON TABLE public.athlete_profiles, public.athlete_accounts, public.athlete_access_requests,
  public.exercise_catalog, public.athlete_measurements, public.athlete_personal_records,
  public.training_plans, public.training_plan_sessions, public.training_plan_items,
  public.training_session_items, public.competitions, public.athlete_competitions,
  public.competition_attempts, public.athlete_journal_entries FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.athlete_profiles, public.athlete_access_requests,
  public.exercise_catalog, public.athlete_measurements, public.athlete_personal_records,
  public.training_plans, public.training_plan_sessions, public.training_plan_items,
  public.training_session_items, public.competitions, public.athlete_competitions,
  public.competition_attempts, public.athlete_journal_entries TO authenticated;
GRANT SELECT ON TABLE public.athlete_accounts TO authenticated;
GRANT ALL ON TABLE public.athlete_profiles, public.athlete_accounts, public.athlete_access_requests,
  public.exercise_catalog, public.athlete_measurements, public.athlete_personal_records,
  public.training_plans, public.training_plan_sessions, public.training_plan_items,
  public.training_session_items, public.competitions, public.athlete_competitions,
  public.competition_attempts, public.athlete_journal_entries TO service_role;
