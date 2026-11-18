#!/usr/bin/env bash
set -euo pipefail

mkdir -p .hf-central
cat .central-source/*.b64 | base64 --decode > .hf-central/HF-Central-Overlay.zip
echo "0de87f14c863b7a7cb00aaa2f3519f848915f00b62f5fb11410bcbd6220dc843  .hf-central/HF-Central-Overlay.zip" | sha256sum --check
unzip -oq .hf-central/HF-Central-Overlay.zip -d .hf-central

# Aplicar el flujo de activación al panel estático sin modificar el ZIP fuente original.
node scripts/patch-central-stage2.mjs
node scripts/patch-central-stage3.mjs
node scripts/patch-central-stage4.mjs
node --input-type=module --check < .hf-central/admin/app.js
echo "HF Central app.js syntax check passed."

# Mantener la Edge Function desplegable en Supabase y dentro del paquete de configuración.
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
test -f .hf-central/platform/app-overlay/reports.js
test -f .hf-central/supabase/functions/invite-coach/index.ts
test -f .hf-central/supabase/functions/request-athlete-access/index.ts
test -f .hf-central/supabase/functions/approve-athlete-access/index.ts
grep -q 'function loadAthletePortal' .hf-central/admin/app.js
grep -q 'function downloadOperationalCsv' .hf-central/admin/app.js
grep -q 'athleteRegistrationForm' .hf-central/admin/index.html

echo "HF Central overlay extracted, Stage 2 activation patch applied, and updated setup files generated."
