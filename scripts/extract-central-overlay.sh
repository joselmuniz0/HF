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
node --input-type=module --check < .hf-central/admin/app.js
echo "HF Central app.js syntax check passed."
node --check .hf-central/admin/recovery.js
echo "HF Central recovery.js syntax check passed."

# Mantener la Edge Function desplegable en Supabase y dentro del paquete de configuración.
mkdir -p .hf-central/supabase/migrations
cp supabase/migrations/20261118_create_athlete_atomic.sql .hf-central/supabase/migrations/20261118_create_athlete_atomic.sql
cp supabase/migrations/20261119_harden_athlete_registration_security.sql .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql

mkdir -p .hf-central/supabase/functions/invite-coach
cp supabase/functions/invite-coach/index.ts .hf-central/supabase/functions/invite-coach/index.ts

# Incluir las funciones de vinculación dentro del paquete de instalación del panel.
mkdir -p .hf-central/supabase/functions/request-athlete-access .hf-central/supabase/functions/approve-athlete-access
cp supabase/functions/request-athlete-access/index.ts .hf-central/supabase/functions/request-athlete-access/index.ts
cp supabase/functions/approve-athlete-access/index.ts .hf-central/supabase/functions/approve-athlete-access/index.ts

# El ZIP original ya cumplió su función. Se elimina para que los artefactos contengan solo el contenido extraído y actualizado.
rm -f .hf-central/HF-Central-Overlay.zip

test -f .hf-central/admin/index.html
test -f .hf-central/admin/app.js
test -f .hf-central/admin/styles.css
test -f .hf-central/admin/recovery.js
test -f .hf-central/platform/app-overlay/reports.js
test -f .hf-central/supabase/functions/invite-coach/index.ts
test -f .hf-central/supabase/functions/request-athlete-access/index.ts
test -f .hf-central/supabase/functions/approve-athlete-access/index.ts
grep -q 'function loadAthletePortal' .hf-central/admin/app.js
grep -q 'function downloadOperationalCsv' .hf-central/admin/app.js
grep -q 'create_athlete_atomic' .hf-central/admin/app.js
grep -q 'create_athlete_atomic' .hf-central/supabase/migrations/20261118_create_athlete_atomic.sql
grep -q 'security invoker' .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql
grep -q 'admins create athletes for coaches' .hf-central/supabase/migrations/20261119_harden_athlete_registration_security.sql
grep -q 'athleteRegistrationForm' .hf-central/admin/index.html
grep -q 'recovery.js' .hf-central/admin/index.html
grep -q 'passwordRecoveryRequestBtn' .hf-central/admin/recovery.js

echo "HF Central overlay extracted, Stage 2 activation patch applied, and updated setup files generated."
