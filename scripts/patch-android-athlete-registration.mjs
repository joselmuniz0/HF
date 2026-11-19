import fs from 'node:fs';

const htmlPath = 'app-source/src/index.html';
const cloudPath = 'app-source/src/cloud.js';
let html = fs.readFileSync(htmlPath, 'utf8');
let cloud = fs.readFileSync(cloudPath, 'utf8');

const formStart = html.indexOf('<form id="athForm">');
const formEndAt = html.indexOf('</form>', formStart);
if (formStart < 0 || formEndAt < 0) throw new Error('Android: no se encontró el formulario de alta de atletas.');

const athleteForm = [
  '<form id="athForm" class="athlete-create-form">',
  '  <div class="row"><input id="athName" placeholder="Nombre y apellido" required minlength="2" maxlength="120">',
  '    <input id="athAge" type="number" min="8" max="100" placeholder="Edad"></div>',
  '  <div class="row"><select id="athLevel" required><option value="initial">Inicial</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select>',
  '    <select id="athSex"><option value="">Sexo (opcional)</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option></select></div>',
  '  <div class="row"><label>Fecha de nacimiento<input id="athBirth" type="date"></label>',
  '    <label>Inicio deportivo<input id="athStart" type="date"></label></div>',
  '  <div class="row"><input id="athHeight" type="number" min="50" max="250" step="0.1" placeholder="Altura (cm)">',
  '    <input id="athWeight" type="number" min="20" max="300" step="0.1" placeholder="Peso corporal (kg)"></div>',
  '  <div class="row"><input id="athSnatch" type="number" min="0.5" max="500" step="0.5" placeholder="Arranque RM (kg)">',
  '    <input id="athCJ" type="number" min="0.5" max="500" step="0.5" placeholder="Envión RM (kg)"></div>',
  '  <input id="athNotes" placeholder="Observaciones / objetivos" maxlength="2000" style="width:100%;margin:6px 0">',
  '  <p class="mut">Coach responsable: la cuenta que inició sesión en Intercambio.</p>',
  '  <p id="athleteSaveStatus" class="mut" role="status" aria-live="polite">Para crear una ficha, configurá Supabase e iniciá sesión en Intercambio.</p>',
  '  <button class="p" type="submit">Crear ficha deportiva</button>',
  '</form>'
].join('\n');

html = html.slice(0, formStart) + athleteForm + html.slice(formEndAt + '</form>'.length);

const oldHandlerStart = html.indexOf('document.getElementById("athForm").onsubmit');
const oldHandlerEnd = html.indexOf('\nwindow.delAth', oldHandlerStart);
if (oldHandlerStart < 0 || oldHandlerEnd < 0) {
  if (!html.includes('window.HFCloud.createAthlete')) throw new Error('Android: no se encontró el manejador del formulario de atletas.');
} else {
  const newHandler = `document.getElementById("athForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const button=form.querySelector('button[type="submit"]');
  const status=document.getElementById("athleteSaveStatus");
  const pendingKey="hf_pending_athlete_create_id";
  if(!window.HFCloud||!window.HFCloud.createAthlete){
    if(status)status.textContent="No se pudo cargar el módulo de conexión. Cerrá y volvé a abrir HF Coach.";
    return;
  }
  let requestId=localStorage.getItem(pendingKey);
  if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(pendingKey,requestId);}
  if(button){button.disabled=true;button.textContent="Guardando…";}
  if(status)status.textContent="Guardando la ficha en HF Coach Central…";
  try{
    const saved=await window.HFCloud.createAthlete({
      id:requestId,
      fullName:document.getElementById("athName").value.trim(),
      age:document.getElementById("athAge").value?Number(document.getElementById("athAge").value):null,
      level:document.getElementById("athLevel").value,
      sex:document.getElementById("athSex").value||null,
      dateOfBirth:document.getElementById("athBirth").value||null,
      sportingStartDate:document.getElementById("athStart").value||null,
      heightCm:document.getElementById("athHeight").value?Number(document.getElementById("athHeight").value):null,
      bodyWeightKg:document.getElementById("athWeight").value?Number(document.getElementById("athWeight").value):null,
      snatchKg:document.getElementById("athSnatch").value?Number(document.getElementById("athSnatch").value):null,
      cleanJerkKg:document.getElementById("athCJ").value?Number(document.getElementById("athCJ").value):null,
      notes:document.getElementById("athNotes").value.trim()||null
    });
    localStorage.removeItem(pendingKey);
    form.reset();
    render();
    if(status)status.textContent="Ficha creada en Supabase. Ya está disponible en HF Coach Central y en los dispositivos vinculados.";
  }catch(error){
    if(status)status.textContent="No se pudo guardar la ficha: "+(error&&error.message?error.message:String(error))+". Revisá Intercambio y tu conexión.";
  }finally{
    if(button){button.disabled=false;button.textContent="Crear ficha deportiva";}
  }
};
document.getElementById("athForm").addEventListener("input",()=>{
  localStorage.removeItem("hf_pending_athlete_create_id");
});`;
  html = html.slice(0, oldHandlerStart) + newHandler + html.slice(oldHandlerEnd);
}

// Make the central list explicit about records that predate cloud registration.
const oldRender = 'document.getElementById("athletesList").innerHTML=a.map(x=>`<div class="card"><b>${esc(x.name)}</b> <span class="tag">${esc(x.level)}</span>';
const newRender = 'document.getElementById("athletesList").innerHTML=a.map(x=>`<div class="card"><b>${esc(x.name)}</b> ${x.cloud_status==="local_only"?\'<span class="tag bad">Solo en este dispositivo</span>\':\'\'} <span class="tag">${esc(x.level)}</span>';
if (html.includes(oldRender)) {
  html = html.replace(oldRender, newRender);
}

// Expose the existing renderer to the cloud module so remote changes update the app immediately.
if (!html.includes('window.addEventListener("hf-athletes-updated",render)')) {
  const escMarker = 'function esc(s){';
  if (!html.includes(escMarker)) throw new Error('Android: no se encontró la función render() para enlazar la actualización remota.');
  html = html.replace(escMarker, 'window.HFRender=render;window.addEventListener("hf-athletes-updated",render);\n' + escMarker);
}

if (!html.includes('id="athBirth"') || !html.includes('id="athHeight"') || !html.includes('createAthlete')) {
  throw new Error('Android: no quedaron instalados todos los campos del alta unificada.');
}

const cloudCode = `

async function refreshCloudAthletes() {
  if (!client) initClient();
  if (!client) throw new Error('Configurá la URL y la clave pública de Supabase en Intercambio.');
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Iniciá sesión en Intercambio para consultar las fichas de la organización.');

  const { data: rows, error } = await client
    .from('athletes')
    .select('id,organization_id,owner_coach_id,full_name,age,level,sex,body_weight_kg,snatch_kg,clean_jerk_kg,notes')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const ids = (rows || []).map(row => row.id);
  let profiles = [];
  let measurements = [];
  if (ids.length) {
    const [profileResult, measurementResult] = await Promise.all([
      client.from('athlete_profiles').select('athlete_id,date_of_birth,sporting_start_date').in('athlete_id', ids),
      client.from('athlete_measurements').select('athlete_id,metric_key,metric_value,measured_at').in('athlete_id', ids).order('measured_at', { ascending: false })
    ]);
    if (profileResult.error) throw profileResult.error;
    if (measurementResult.error) throw measurementResult.error;
    profiles = profileResult.data || [];
    measurements = measurementResult.data || [];
  }

  const profileByAthlete = new Map(profiles.map(profile => [profile.athlete_id, profile]));
  const metricByAthlete = new Map();
  for (const metric of measurements) {
    if (!metricByAthlete.has(metric.athlete_id)) metricByAthlete.set(metric.athlete_id, {});
    const current = metricByAthlete.get(metric.athlete_id);
    if (metric.metric_key === 'height' && current.height == null) current.height = Number(metric.metric_value);
  }

  const remote = (rows || []).map(row => {
    const profile = profileByAthlete.get(row.id) || {};
    const metrics = metricByAthlete.get(row.id) || {};
    const levels = { initial: 'Inicial', intermediate: 'Intermedio', advanced: 'Avanzado' };
    return {
      id: row.id,
      name: row.full_name,
      age: row.age,
      level: levels[row.level] || row.level || 'Inicial',
      sex: row.sex || '',
      weight: row.body_weight_kg,
      height: metrics.height ?? '',
      dateOfBirth: profile.date_of_birth || '',
      sportingStartDate: profile.sporting_start_date || '',
      snatch: row.snatch_kg,
      cj: row.clean_jerk_kg,
      notes: row.notes || '',
      cloud_status: 'synced'
    };
  });

  const remoteIds = new Set(ids);
  const store = window.HFStore;
  const local = store ? store.read('athletes') : [];
  const localOnly = local
    .filter(item => !remoteIds.has(item.id))
    .map(item => ({ ...item, cloud_status: 'local_only' }));
  if (store) store.save('athletes', [...remote, ...localOnly]);
  window.dispatchEvent(new Event('hf-athletes-updated'));
  return remote.length;
}

async function createAthleteDirect(payload) {
  if (!client) initClient();
  if (!client) throw new Error('Configurá la URL y la clave pública de Supabase en Intercambio.');
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Iniciá sesión en Intercambio antes de crear una ficha.');

  const { data: membership, error: memberError } = await client
    .from('organization_memberships')
    .select('organization_id,role')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!membership || !['admin','coach'].includes(membership.role)) {
    throw new Error('Tu cuenta no está asociada a una organización como coach o administrador.');
  }

  const { data: athleteId, error } = await client.rpc('create_athlete_atomic', {
    p_organization_id: membership.organization_id,
    p_athlete_id: payload.id || crypto.randomUUID(),
    p_full_name: payload.fullName,
    p_age: payload.age ?? null,
    p_level: payload.level || 'initial',
    p_sex: payload.sex || null,
    p_date_of_birth: payload.dateOfBirth || null,
    p_sporting_start_date: payload.sportingStartDate || null,
    p_height_cm: payload.heightCm ?? null,
    p_body_weight_kg: payload.bodyWeightKg ?? null,
    p_snatch_kg: payload.snatchKg ?? null,
    p_clean_jerk_kg: payload.cleanJerkKg ?? null,
    p_notes: payload.notes || null,
    p_assigned_coach_id: null
  });
  if (error) throw error;

  await refreshCloudAthletes();
  return { id: athleteId || payload.id };
}

window.HFCloud = Object.freeze({
  createAthlete: createAthleteDirect,
  refreshAthletes: refreshCloudAthletes
});

if (getConfig()) {
  initClient();
  client.auth.getSession().then(({ data, error }) => {
    if (!error && data && data.session) {
      currentUser = data.session.user;
      refreshCloudAthletes().catch(error => status('No se pudieron actualizar las fichas desde HF Central: ' + (error.message || error)));
    }
  });
}
`;

if (!cloud.includes('createAthleteDirect')) cloud += cloudCode;
const loginMarker = 'status(`Sesión iniciada: ${currentUser.email}.`);';
if (cloud.includes(loginMarker) && !cloud.includes('await refreshCloudAthletes();')) {
  cloud = cloud.replace(loginMarker, loginMarker + '\n    await refreshCloudAthletes();');
}

fs.writeFileSync(htmlPath, html, 'utf8');
fs.writeFileSync(cloudPath, cloud, 'utf8');
console.log('Android athlete registration now uses the same Supabase RPC and preserves legacy local-only records.');
