import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve('.hf-central/admin/app.js');
const htmlPath = path.resolve('.hf-central/admin/index.html');
let app = fs.readFileSync(appPath, 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('id="newAthleteEmail"')) {
  html = html.replace(
    /(<label>Nombre y apellido<input id="newAthleteName"[^>]*><\/label>)/,
    '$1\n          <label>Correo electrónico del atleta<input id="newAthleteEmail" type="email" required maxlength="320" autocomplete="email"><\/label>'
  );
}
if (!html.includes('id="newAthleteEmail"')) throw new Error('No se pudo incorporar el correo obligatorio al alta de atleta.');
html = html.replace(
  'La ficha deportiva se crea antes de activar la cuenta personal del atleta.',
  'El correo es obligatorio: se crea la ficha, se vincula la cuenta y se envía una invitación.'
);

const start = app.indexOf('async function createAthleteProfile(event) {');
if (start < 0) {
  if (app.includes('rpc("create_athlete_atomic"') || app.includes("rpc('create_athlete_atomic'")) {
    console.log('HF Central athlete registration already uses create_athlete_atomic.');
    process.exit(0);
  }
  throw new Error('No se encontró createAthleteProfile en HF Central.');
}

let end = app.indexOf('\nasync function ', start + 10);
const nextPlain = app.indexOf('\nfunction ', start + 10);
if (end < 0 || (nextPlain >= 0 && nextPlain < end)) end = nextPlain;
if (end < 0) end = app.indexOf('\nconst ', start + 10);
if (end < 0) throw new Error('No se pudo delimitar createAthleteProfile.');

const replacement = \`async function createAthleteProfile(event) {
  event.preventDefault();
  const form = event.currentTarget || $("athleteCreateForm");
  const button = form && form.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Creando ficha e invitación…"; }
  try {
    const email = $("newAthleteEmail").value.trim().toLowerCase();
    if (!email) throw new Error("El correo electrónico del atleta es obligatorio.");
    const ownerCoachId = currentRole === "admin" ? $("newAthleteCoach").value : currentUserId;
    if (!ownerCoachId) throw new Error("Seleccioná el coach responsable del atleta.");
    const { data, error } = await getClient().functions.invoke("create-athlete-invitation", {
      body: {
        organization_id: organizationId,
        owner_coach_id: ownerCoachId,
        email,
        full_name: $("newAthleteName").value.trim(),
        date_of_birth: $("newAthleteBirth").value || null,
        sporting_start_date: $("newAthleteStart").value || null,
        level: $("newAthleteLevel").value || "initial",
        sex: $("newAthleteSex").value || null,
        height_cm: $("newAthleteHeight").value ? Number($("newAthleteHeight").value) : null,
        body_weight_kg: $("newAthleteWeight").value ? Number($("newAthleteWeight").value) : null,
        snatch_kg: $("newAthleteSnatch").value ? Number($("newAthleteSnatch").value) : null,
        clean_jerk_kg: $("newAthleteCJ").value ? Number($("newAthleteCJ").value) : null,
        notes: $("newAthleteNotes").value.trim() || null
      }
    });
    if (error) throw error;
    if (!data || !data.ok) throw new Error(data?.error || "No se completó el alta integral del atleta.");
    form.reset();
    await loadData();
    message(data.message || "Atleta guardado en la base general y cuenta vinculada.", "success");
  } catch(error) {
    message("No se pudo completar el alta del atleta: " + (error.message || error), "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Crear ficha e invitar atleta"; }
  }
}\`;

const replacementWithBinding = replacement + `
document.getElementById("athleteCreateForm")?.addEventListener("input", () => {
  window.HFPendingAthleteCreateId = null;
});
`;
app = app.slice(0, start) + replacementWithBinding + app.slice(end);

// Reuse the same request identifier after an uncertain network result so a retry cannot create duplicates.
if (!app.includes('HFPendingAthleteCreateId')) {
  throw new Error('No se encontró el identificador idempotente de alta.');
}
if (!app.includes('athleteCreateForm') || !app.includes('newAthleteBirth') || !app.includes('newAthleteHeight')) {
  throw new Error('El formulario central no contiene los campos canónicos de alta.');
}

app = app.replace(/crypto\.randomUUID\(\)/g, 'window.HFUuid()');
if (!html.includes('id="hfUuidCompatibility"')) {
  const helper = [
    '<script id="hfUuidCompatibility">',
    'window.HFUuid = window.HFUuid || function () {',
    '  var c = window.crypto;',
    '  if (c && typeof c["randomUUID"] === "function") return c["randomUUID"]();',
    '  if (!c || typeof c.getRandomValues !== "function") throw new Error("No hay generador seguro de identificadores en este navegador.");',
    '  var bytes = new Uint8Array(16); c.getRandomValues(bytes);',
    '  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;',
    '  var h = Array.prototype.map.call(bytes, function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");',
    '  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);',
    '};',
    '</script>'
  ].join('\n');
  if (!html.includes('</head>')) throw new Error('HF Central: no se encontró el cierre head para UUID compatibility.');
  html = html.replace('</head>', helper + '\n</head>');
}
fs.writeFileSync(htmlPath, html, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');
console.log('HF Central athlete registration now uses atomic Supabase RPC and a secure UUID fallback.');
