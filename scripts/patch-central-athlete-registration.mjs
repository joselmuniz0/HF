import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve('.hf-central/admin/app.js');
const htmlPath = path.resolve('.hf-central/admin/index.html');
let app = fs.readFileSync(appPath, 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');

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

const replacement = `async function createAthleteProfile(event) {
  event.preventDefault();
  const form = event.currentTarget || $("athleteCreateForm");
  const button = form && form.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Guardando…"; }
  try {
    const requestId = window.HFPendingAthleteCreateId || crypto.randomUUID();
    window.HFPendingAthleteCreateId = requestId;
    const { data: athleteId, error } = await getClient().rpc("create_athlete_atomic", {
      p_organization_id: organizationId,
      p_athlete_id: requestId,
      p_full_name: $("newAthleteName").value.trim(),
      p_age: $("newAthleteAge").value ? Number($("newAthleteAge").value) : null,
      p_level: $("newAthleteLevel").value || "initial",
      p_sex: $("newAthleteSex").value || null,
      p_date_of_birth: $("newAthleteBirth").value || null,
      p_sporting_start_date: $("newAthleteStart").value || null,
      p_height_cm: $("newAthleteHeight").value ? Number($("newAthleteHeight").value) : null,
      p_body_weight_kg: $("newAthleteWeight").value ? Number($("newAthleteWeight").value) : null,
      p_snatch_kg: $("newAthleteSnatch").value ? Number($("newAthleteSnatch").value) : null,
      p_clean_jerk_kg: $("newAthleteCJ").value ? Number($("newAthleteCJ").value) : null,
      p_notes: $("newAthleteNotes").value.trim() || null,
      p_assigned_coach_id: currentRole === "admin" ? ($("newAthleteCoach").value || null) : null
    });
    if (error) throw error;
    window.HFPendingAthleteCreateId = null;
    form.reset();
    await loadData();
    message("Ficha creada y guardada en Supabase. Está disponible para el coach asignado.", "success");
  } catch(error) {
    message("No se pudo completar el alta: " + (error.message || error), "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Crear ficha deportiva"; }
  }
}`;

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

app = app.replace(/crypto\\.randomUUID\\(\\)/g, 'window.HFUuid()');
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
  ].join('\\n');
  if (!html.includes('</head>')) throw new Error('HF Central: no se encontró el cierre head para UUID compatibility.');
  html = html.replace('</head>', helper + '\\n</head>');
}
fs.writeFileSync(htmlPath, html, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');
console.log('HF Central athlete registration now uses atomic Supabase RPC and a secure UUID fallback.');
