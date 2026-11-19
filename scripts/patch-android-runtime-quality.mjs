import fs from 'node:fs';

const htmlPath = 'app-source/src/index.html';
const cloudPath = 'app-source/src/cloud.js';
const swPath = 'app-source/src/public/sw.js';
let html = fs.readFileSync(htmlPath, 'utf8');
let cloud = fs.readFileSync(cloudPath, 'utf8');

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error('No se encontró ' + label);
  return source.replace(before, after);
}

const oldCoachText = '  <p class="mut">Coach responsable: la cuenta que inició sesión en Intercambio.</p>';
const newCoachText = [
  '  <label id="athCoachWrap" hidden>Coach responsable<select id="athCoach"><option value="">Asignarme a mí</option></select></label>',
  '  <p class="mut">El alta se guarda directamente en HF Coach Central, igual que en escritorio.</p>'
].join('\n');
if (html.includes(oldCoachText)) html = html.replace(oldCoachText, newCoachText);
else if (!html.includes('id="athCoachWrap"')) throw new Error('Falta el selector de coach.');

const oldButton = '<button id="cloudSync" type="button">Sincronizar ahora</button>';
const newButton = oldButton + '<button id="refreshCloudAthletes" type="button">Actualizar atletas desde Central</button>';
if (!html.includes('id="refreshCloudAthletes"')) {
  if (!html.includes(oldButton)) throw new Error('No se encontró el botón de sincronización.');
  html = html.replace(oldButton, newButton);
}

const syncStartMarker = 'async function syncNow() {';
const syncStart = cloud.indexOf(syncStartMarker);
const athleteSyncStart = syncStart >= 0 ? cloud.indexOf('  if (consent.profiles) {', syncStart) : -1;
const athleteSyncEnd = athleteSyncStart >= 0 ? cloud.indexOf('\n  if (consent.coachNotes && consent.profiles)', athleteSyncStart) : -1;
if (athleteSyncStart < 0 || athleteSyncEnd < 0) throw new Error('Android: no se encontró el bloque de sincronización de atletas.');
const atomicLegacySync = [
  '  if (consent.profiles) {',
  "    const levelMap = {initial:'initial',intermediate:'intermediate',advanced:'advanced',inicial:'initial',intermedio:'intermediate',avanzado:'advanced'};",
  "    const sexMap = {female:'female',male:'male',other:'other',femenino:'female',masculino:'male','otro / no informa':'other'};",
  '    for (const a of athletes) {',
  "      const {error} = await client.rpc('create_athlete_atomic', {",
  '        p_organization_id: orgId,',
  '        p_athlete_id: a.id,',
  "        p_full_name: String(a.name || '').trim(),",
  '        p_age: a.age ? Number(a.age) : null,',
  "        p_level: levelMap[String(a.level || 'initial').toLowerCase()] || 'initial',",
  "        p_sex: sexMap[String(a.sex || '').toLowerCase()] || null,",
  '        p_date_of_birth: a.dateOfBirth || null,',
  '        p_sporting_start_date: a.sportingStartDate || null,',
  '        p_height_cm: a.height ? Number(a.height) : null,',
  '        p_body_weight_kg: a.weight ? Number(a.weight) : null,',
  '        p_snatch_kg: a.snatch ? Number(a.snatch) : null,',
  '        p_clean_jerk_kg: a.cj ? Number(a.cj) : null,',
  '        p_notes: consent.coachNotes ? (a.notes || null) : null,',
  '        p_assigned_coach_id: null',
  '      });',
  '      if (error) throw error;',
  '      sent++;',
  '    }',
  '  }'
].join('\n');
if (!cloud.includes("client.rpc('create_athlete_atomic'")) {
  cloud = cloud.slice(0, athleteSyncStart) + atomicLegacySync + cloud.slice(athleteSyncEnd);
}
const oldSyncComplete = '  status(' + String.fromCharCode(96) + 'Sincronización completada. Registros y archivos enviados: ' + String.fromCharCode(36) + '{sent}.' + String.fromCharCode(96) + ');';
if (!cloud.includes('if (consent.profiles) await refreshCloudAthletes();')) {
  if (!cloud.includes(oldSyncComplete)) throw new Error('Android: no se encontró el cierre de la sincronización local.');
  cloud = cloud.replace(oldSyncComplete, '  if (consent.profiles) await refreshCloudAthletes();\n' + oldSyncComplete);
}

const createMarker = 'async function createAthleteDirect(payload) {';
const coachLoader = [
  'async function loadCloudCoachChoices() {',
  "  const wrap = document.getElementById('athCoachWrap');",
  "  const select = document.getElementById('athCoach');",
  '  if (!wrap || !select) return;',
  '  if (!client) initClient();',
  '  if (!client) return;',
  '  const { data: authData, error: authError } = await client.auth.getUser();',
  '  if (authError) throw authError;',
  '  if (!authData.user) return;',
  '  const { data: membership, error: membershipError } = await client.from("organization_memberships").select("organization_id,role").eq("user_id", authData.user.id).limit(1).maybeSingle();',
  '  if (membershipError) throw membershipError;',
  "  if (!membership || membership.role !== 'admin') { wrap.hidden = true; select.value = ''; return; }",
  '  const { data: members, error: membersError } = await client.from("organization_memberships").select("user_id").eq("organization_id", membership.organization_id).eq("role", "coach");',
  '  if (membersError) throw membersError;',
  '  const ids = (members || []).map(row => row.user_id);',
  '  let profiles = [];',
  '  if (ids.length) {',
  '    const { data, error } = await client.from("coach_profiles").select("user_id,display_name,email").eq("organization_id", membership.organization_id).in("user_id", ids);',
  '    if (error) throw error;',
  '    profiles = data || [];',
  '  }',
  '  const profileById = new Map(profiles.map(row => [row.user_id, row]));',
  '  const selected = select.value;',
  '  select.innerHTML = \'<option value="">Asignarme a mí</option>\';',
  '  for (const id of ids) {',
  '    const profile = profileById.get(id) || {};',
  '    const option = document.createElement("option");',
  '    option.value = id;',
  "    option.textContent = profile.display_name || profile.email || ('Coach ' + id.slice(0, 8));",
  '    select.appendChild(option);',
  '  }',
  '  if (ids.includes(selected)) select.value = selected;',
  '  wrap.hidden = false;',
  '}',
  ''
].join('\n');
if (!cloud.includes('async function loadCloudCoachChoices()')) {
  if (!cloud.includes(createMarker)) throw new Error('No se encontró createAthleteDirect.');
  cloud = cloud.replace(createMarker, coachLoader + createMarker);
}

const directCreateStart = cloud.indexOf(createMarker);
if (directCreateStart < 0) throw new Error('Android: no se encontró el alta directa para asignar coach.');
const directCreateSource = cloud.slice(directCreateStart);
if (!directCreateSource.includes('p_assigned_coach_id: null') && !directCreateSource.includes('p_assigned_coach_id: membership.role')) {
  throw new Error('Android: no se encontró el argumento de asignación del alta directa.');
}
const directCreateUpdated = directCreateSource.replace(
  'p_assigned_coach_id: null',
  "p_assigned_coach_id: membership.role === 'admin' ? (payload.assignedCoachId || null) : null"
);
cloud = cloud.slice(0, directCreateStart) + directCreateUpdated;

const loginExact = 'status(' + String.fromCharCode(96) + 'Sesión iniciada: ' + String.fromCharCode(36) + '{currentUser.email}.' + String.fromCharCode(96) + ');';
if (cloud.includes(loginExact) && !cloud.includes('await loadCloudCoachChoices();')) {
  cloud = cloud.replace(loginExact, loginExact + '\n    await loadCloudCoachChoices();');
}

const restoreMarker = "refreshCloudAthletes().catch(error => status('No se pudieron actualizar las fichas desde HF Central: ' + (error.message || error)));";
if (cloud.includes(restoreMarker) && !cloud.includes("loadCloudCoachChoices().catch(error => status('No se pudo cargar la lista de coaches:")) {
  cloud = cloud.replace(restoreMarker, restoreMarker + "\n      loadCloudCoachChoices().catch(error => status('No se pudo cargar la lista de coaches: ' + (error.message || error)));");
}

if (!cloud.includes('Lista actualizada desde HF Coach Central')) {
  cloud += [
    '',
    "document.getElementById('refreshCloudAthletes')?.addEventListener('click', async () => {",
    "  const button = document.getElementById('refreshCloudAthletes');",
    '  if (button) button.disabled = true;',
    '  try {',
    '    const count = await refreshCloudAthletes();',
    '    await loadCloudCoachChoices();',
    "    status('Lista actualizada desde HF Coach Central. Atletas visibles: ' + count + '.');",
    '  } catch (error) {',
    "    status('No se pudo actualizar desde HF Coach Central: ' + (error.message || error));",
    '  } finally {',
    '    if (button) button.disabled = false;',
    '  }',
    '});',
    "document.querySelector('[data-tab=\"intercambio\"]')?.addEventListener('click', () => loadCloudCoachChoices().catch(error => status('No se pudo cargar la lista de coaches: ' + (error.message || error))));",
    ''
  ].join('\n');
}

const oldPayload = '      notes:document.getElementById("athNotes").value.trim()||null\n    });';
const newPayload = '      notes:document.getElementById("athNotes").value.trim()||null,\n      assignedCoachId:document.getElementById("athCoach")?.value||null\n    });';
if (html.includes(oldPayload)) html = html.replace(oldPayload, newPayload);
else if (!html.includes('assignedCoachId:document.getElementById("athCoach")')) throw new Error('No se envía el coach seleccionado.');

html = html.replace(
  'Ficha creada en Supabase. Ya está disponible en HF Coach Central y en los dispositivos vinculados.',
  'Ficha creada en HF Coach Central. En otros dispositivos usá «Actualizar atletas desde Central» para verla.'
);

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
  html = replaceOnce(html, '</head>', helper + '\n</head>', 'cierre head para UUID compatibility');
}
html = html.replace(/crypto\.randomUUID\(\)/g, 'window.HFUuid()');
cloud = cloud.replace(/crypto\.randomUUID\(\)/g, 'window.HFUuid()');

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  const buildId = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
  sw = sw.replace(/const V="[^"]+"/, 'const V="hfc-' + buildId + '"');
  if (!sw.includes('hfc-' + buildId)) throw new Error('No se pudo versionar la caché del service worker.');
  fs.writeFileSync(swPath, sw, 'utf8');
}

fs.writeFileSync(htmlPath, html, 'utf8');
fs.writeFileSync(cloudPath, cloud, 'utf8');
console.log('HF Android runtime quality patch applied.');
