#!/usr/bin/env bash
set -euo pipefail

mkdir -p .hf-central
cat .central-source/*.b64 | base64 --decode > .hf-central/HF-Central-Overlay.zip
echo "0de87f14c863b7a7cb00aaa2f3519f848915f00b62f5fb11410bcbd6220dc843  .hf-central/HF-Central-Overlay.zip" | sha256sum --check
unzip -oq .hf-central/HF-Central-Overlay.zip -d .hf-central
cp scripts/hf-central-recovery.js .hf-central/admin/recovery.js

# Aplicar el flujo de activación al panel estático sin modificar el ZIP fuente original.
node scripts/patch-central-stage2.mjs
node scripts/patch-central-stage3.mjs
node scripts/patch-central-stage4.mjs
node scripts/patch-central-athlete-registration.mjs
node scripts/patch-central-athlete-onboarding.mjs
node --check scripts/patch-central-athlete-onboarding.mjs
node scripts/patch-central-coach-invitations.mjs
node scripts/patch-central-role-ui.mjs
node scripts/patch-central-video-analysis.mjs
node scripts/patch-central-bar-path-prototype.mjs
node scripts/patch-central-planning-builder.mjs
node --check scripts/patch-central-planning-builder.mjs
node scripts/patch-central-cycle-planner.mjs
node --check scripts/patch-central-cycle-planner.mjs
node scripts/patch-central-athlete-ai-link.mjs
node --check scripts/patch-central-athlete-ai-link.mjs
node scripts/patch-central-athlete-ai-planning.mjs
node --check scripts/patch-central-athlete-ai-planning.mjs
node --check .hf-central/admin/coach-planning.mjs
node --check .hf-central/admin/cycle-core.mjs

node --check prototypes/bar-path/bar-path-core.mjs
node --check prototypes/bar-path/bar-path-app.mjs
node --test tests/bar-path-core.test.mjs
node --test tests/training-cycle-core.test.mjs
node --check api/coach-ai-planning.js
node --check scripts/central-coach-planning.mjs
node --test tests/coach-ai-planning.test.cjs

# Regression checks for coach invitations: only the applicable form is visible and invite status is authoritative.
grep -qF '[hidden] { display: none !important; }' .hf-central/admin/styles.css
grep -q "canonicalInviteHost = 'hf-coach-central.vercel.app'" .hf-central/admin/app.js
grep -q "function showLoginAfterAcceptedInvitation" .hf-central/admin/coach-invitations.js
grep -q "No hay invitaciones pendientes." .hf-central/admin/coach-invitations.js
node --input-type=module --check < .hf-central/admin/app.js
echo "HF Central app.js syntax check passed."
node --check .hf-central/admin/recovery.js
echo "HF Central recovery.js syntax check passed."
grep -q 'callbackType === "invite"' .hf-central/admin/recovery.js
grep -q 'type: tokenType' .hf-central/admin/recovery.js
grep -q 'function showAuthCallbackNotice' .hf-central/admin/recovery.js
grep -q 'hasRecentRecoveryRequest()' .hf-central/admin/recovery.js
if grep -q 'hf-coach-central-password-recovery' .hf-central/admin/recovery.js; then
  echo "Recovery client must share the main HF Central session storage key." >&2
  exit 1
fi
echo "HF Central auth callback regression checks passed."
node --check .hf-central/admin/coach-invitations.js
echo "HF Central coach-invitations.js syntax check passed."
grep -q 'coachVideoAnalysisDetails' .hf-central/admin/index.html
grep -q 'media_asset_id' .hf-central/admin/app.js
grep -q 'applyRoleBasedInterface' .hf-central/admin/app.js
grep -q 'hf-role-hidden' .hf-central/admin/styles.css
echo "HF Central role-based interface patch applied."

# Mantener la Edge Function desplegable en Supabase y dentro del paquete de configuración.
mkdir -p .hf-central/supabase/migrations
cp supabase/migrations/20261118_create_athlete_atomic.sql .hf-central/supabase/migrations/20261118_create_athlete_atomic.sql
cp supabase/migrations/20261119_harden_athlete_registration_security.sql .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql
cp supabase/migrations/20261119140000_coach_invitations.sql .hf-central/supabase/migrations/20261119140000_coach_invitations.sql
cp supabase/migrations/20261119154000_coach_invitation_role_guard.sql .hf-central/supabase/migrations/20261119154000_coach_invitation_role_guard.sql
cp supabase/migrations/20261119220000_hf_coach_rbac_consolidated.sql .hf-central/supabase/migrations/20261119220000_hf_coach_rbac_consolidated.sql
cp supabase/migrations/20261119234500_hf_video_analysis_media_link.sql .hf-central/supabase/migrations/20261119234500_hf_video_analysis_media_link.sql
cp supabase/migrations/20261120182557_create_training_plan_atomic.sql .hf-central/supabase/migrations/20261120182557_create_training_plan_atomic.sql
cp supabase/migrations/20261121120000_structured_training_cycles.sql .hf-central/supabase/migrations/20261121120000_structured_training_cycles.sql
cp supabase/migrations/20261121130000_athlete_plan_notifications.sql .hf-central/supabase/migrations/20261121130000_athlete_plan_notifications.sql
cp supabase/migrations/20261122120000_hf_athlete_email_registration_and_invites.sql .hf-central/supabase/migrations/20261122120000_hf_athlete_email_registration_and_invites.sql
cp supabase/migrations/20261123021500_hf_athlete_ai_coach_assignment.sql .hf-central/supabase/migrations/20261123021500_hf_athlete_ai_coach_assignment.sql
cp supabase/migrations/20261123030000_hf_athlete_ai_owner_fk_fix.sql .hf-central/supabase/migrations/20261123030000_hf_athlete_ai_owner_fk_fix.sql
cp supabase/migrations/20261123040000_hf_athlete_ai_plan_proposals.sql .hf-central/supabase/migrations/20261123040000_hf_athlete_ai_plan_proposals.sql

mkdir -p .hf-central/supabase/functions/invite-coach
cp supabase/functions/invite-coach/index.ts .hf-central/supabase/functions/invite-coach/index.ts
mkdir -p .hf-central/supabase/functions/invitacion-coach
cp supabase/functions/invitacion-coach/index.ts .hf-central/supabase/functions/invitacion-coach/index.ts

mkdir -p .hf-central/supabase/functions/create-coach-invitation
cp supabase/functions/create-coach-invitation/index.ts .hf-central/supabase/functions/create-coach-invitation/index.ts
mkdir -p .hf-central/supabase/functions/accept-coach-invitation
cp supabase/functions/accept-coach-invitation/index.ts .hf-central/supabase/functions/accept-coach-invitation/index.ts
mkdir -p .hf-central/supabase/functions/manage-coach-invitations
cp supabase/functions/manage-coach-invitations/index.ts .hf-central/supabase/functions/manage-coach-invitations/index.ts

# Incluir las funciones de vinculación dentro del paquete de instalación del panel.
mkdir -p .hf-central/supabase/functions/request-athlete-access .hf-central/supabase/functions/approve-athlete-access
cp supabase/functions/request-athlete-access/index.ts .hf-central/supabase/functions/request-athlete-access/index.ts
cp supabase/functions/approve-athlete-access/index.ts .hf-central/supabase/functions/approve-athlete-access/index.ts
mkdir -p .hf-central/supabase/functions/link-athlete-to-ai-coach
cp supabase/functions/link-athlete-to-ai-coach/index.ts .hf-central/supabase/functions/link-athlete-to-ai-coach/index.ts
mkdir -p .hf-central/supabase/functions/create-athlete-invitation
cp supabase/functions/create-athlete-invitation/index.ts .hf-central/supabase/functions/create-athlete-invitation/index.ts

# El ZIP original ya cumplió su función. Se elimina para que los artefactos contengan solo el contenido extraído y actualizado.
rm -f .hf-central/HF-Central-Overlay.zip

test -f .hf-central/admin/index.html
test -f .hf-central/admin/app.js
test -f .hf-central/admin/styles.css
test -f .hf-central/admin/recovery.js
test -f .hf-central/platform/app-overlay/reports.js
test -f .hf-central/supabase/functions/invite-coach/index.ts
test -f .hf-central/supabase/functions/invitacion-coach/index.ts
test -f .hf-central/supabase/functions/create-coach-invitation/index.ts
test -f .hf-central/supabase/functions/accept-coach-invitation/index.ts
test -f .hf-central/supabase/functions/manage-coach-invitations/index.ts
test -f .hf-central/supabase/migrations/20261119140000_coach_invitations.sql
test -f .hf-central/supabase/migrations/20261119154000_coach_invitation_role_guard.sql
test -f .hf-central/supabase/migrations/20261119220000_hf_coach_rbac_consolidated.sql
test -f .hf-central/supabase/migrations/20261119234500_hf_video_analysis_media_link.sql
test -f .hf-central/supabase/migrations/20261120182557_create_training_plan_atomic.sql
test -f .hf-central/supabase/migrations/20261121120000_structured_training_cycles.sql
test -f .hf-central/supabase/migrations/20261121130000_athlete_plan_notifications.sql
test -f .hf-central/admin/coach-planning.mjs
test -f .hf-central/admin/cycle-core.mjs
test -f .hf-central/admin/coach-invitations.js
test -f .hf-central/admin/labs/bar-path/index.html
test -f .hf-central/admin/labs/bar-path/bar-path-app.mjs
test -f .hf-central/admin/labs/bar-path/bar-path-core.mjs
grep -q 'hf-bar-path-launch' .hf-central/admin/index.html
grep -q 'planSessionBuilder' .hf-central/admin/index.html
grep -q 'create_training_plan_atomic' .hf-central/admin/app.js
grep -q 'data-plan-percent' .hf-central/admin/app.js
grep -q 'hfCoachCyclePlanner' .hf-central/admin/index.html
grep -q 'create_training_cycle_atomic' .hf-central/admin/coach-planning.mjs
grep -q 'publish_training_plan' .hf-central/admin/coach-planning.mjs
grep -q 'data-cp-notification-read' .hf-central/admin/coach-planning.mjs
grep -q 'athlete_notifications' .hf-central/admin/app.js
grep -q 'training_plan_item_blocks' .hf-central/admin/coach-planning.mjs
grep -q 'create-coach-invitation' .hf-central/admin/app.js
grep -q 'coach_invite' .hf-central/admin/coach-invitations.js
test -f .hf-central/supabase/functions/request-athlete-access/index.ts
test -f .hf-central/supabase/functions/approve-athlete-access/index.ts
test -f .hf-central/supabase/functions/create-athlete-invitation/index.ts
grep -q 'function loadAthletePortal' .hf-central/admin/app.js
grep -q 'function downloadOperationalCsv' .hf-central/admin/app.js
grep -q 'create-athlete-invitation' .hf-central/admin/app.js
grep -q 'newAthleteEmail' .hf-central/admin/index.html
grep -q 'create-athlete-invitation' .hf-central/admin/app.js
grep -q 'data-athlete-id' .hf-central/admin/app.js
grep -q 'linkAthleteAiBtn' .hf-central/admin/index.html
grep -q 'link-athlete-to-ai-coach' .hf-central/admin/app.js
grep -q 'athlete_ai_coach_assignments' .hf-central/admin/app.js
grep -q 'link_athlete_to_hf_ai' .hf-central/supabase/migrations/20261123021500_hf_athlete_ai_coach_assignment.sql
test -f .hf-central/supabase/functions/link-athlete-to-ai-coach/index.ts
test -f .hf-central/supabase/migrations/20261123030000_hf_athlete_ai_owner_fk_fix.sql
grep -q 'v_ai_owner := p_user_id' .hf-central/supabase/migrations/20261123030000_hf_athlete_ai_owner_fk_fix.sql
test -f .hf-central/supabase/migrations/20261123040000_hf_athlete_ai_plan_proposals.sql
grep -q "status = 'draft'" .hf-central/supabase/migrations/20261123040000_hf_athlete_ai_plan_proposals.sql
grep -q "athletes read own personal AI plan proposals" .hf-central/supabase/migrations/20261123040000_hf_athlete_ai_plan_proposals.sql
grep -q 'athleteAiPlanForm' .hf-central/admin/index.html
grep -q 'saved_plan_id' .hf-central/admin/coach-planning.mjs
grep -q 'downloadAthletePlanPdf' .hf-central/admin/coach-planning.mjs
grep -q 'data-cp-download' .hf-central/admin/coach-planning.mjs
grep -q 'jspdf@4.2.1/dist/jspdf.umd.min.js' .hf-central/admin/coach-planning.mjs
grep -q 'Página ' .hf-central/admin/coach-planning.mjs
echo "HF athlete PDF download integration checks passed."
grep -q 'athlete_id' .hf-central/supabase/migrations/20261122120000_hf_athlete_email_registration_and_invites.sql
grep -q 'create_athlete_atomic' .hf-central/supabase/migrations/20261118_create_athlete_atomic.sql
grep -q 'security invoker' .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql
grep -q 'admins create athletes for coaches' .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql
grep -q 'athleteRegistrationForm' .hf-central/admin/index.html
grep -q 'recovery.js' .hf-central/admin/index.html
grep -q 'passwordRecoveryRequestBtn' .hf-central/admin/recovery.js

grep -q 'cpGenerateWithAI' .hf-central/admin/coach-planning.mjs
grep -q 'cpAiReview' .hf-central/admin/index.html
grep -q 'cpImportWeeklyPlan' .hf-central/admin/coach-planning.mjs
grep -q 'cpImportChatJson' .hf-central/admin/index.html
grep -q 'cpConfirmChatImport' .hf-central/admin/index.html
test -f api/coach-ai-planning.js

echo "HF Central overlay extracted, Stage 2 activation patch applied, and updated setup files generated."
