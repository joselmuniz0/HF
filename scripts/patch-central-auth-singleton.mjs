import fs from 'node:fs';

const root = '.hf-central/admin';
const read = name => fs.readFileSync(root + '/' + name, 'utf8');
const write = (name, value) => fs.writeFileSync(root + '/' + name, value, 'utf8');
function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(label + ': se esperaba una coincidencia; encontradas: ' + count);
  return source.replace(before, after);
}

let app = read('app.js');
app = replaceOnce(app,
"function setConfigInputs() {\n  const runtime = window.HF_CENTRAL_CONFIG || {};\n  try {\n    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};\n    const url = runtime.supabaseUrl || saved.url || '';\n    const key = runtime.supabasePublishableKey || saved.key || '';\n    $('supabaseUrl').value = url;\n    $('supabaseKey').value = key;\n    if (runtime.supabaseUrl) $('supabaseUrl').readOnly = true;\n    if (runtime.supabasePublishableKey) $('supabaseKey').readOnly = true;\n  } catch { /* configuración inválida: se vuelve a ingresar */ }\n}",
"function setConfigInputs() {\n  const runtime = window.HF_CENTRAL_CONFIG || {};\n  let saved = {};\n  // Safari puede restringir el almacenamiento local en navegación privada.\n  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}; }\n  catch (error) { console.warn('HF Coach: almacenamiento local no disponible; se usará la configuración del despliegue.', error); }\n  const url = runtime.supabaseUrl || saved.url || '';\n  const key = runtime.supabasePublishableKey || saved.key || '';\n  $('supabaseUrl').value = url;\n  $('supabaseKey').value = key;\n  if (runtime.supabaseUrl) $('supabaseUrl').readOnly = true;\n  if (runtime.supabasePublishableKey) $('supabaseKey').readOnly = true;\n}",
'setConfigInputs');

app = replaceOnce(app,
"function getClient() {\n  const runtime = window.HF_CENTRAL_CONFIG || {};\n  const url = ($('supabaseUrl')?.value || runtime.supabaseUrl || '').trim();\n  const key = ($('supabaseKey')?.value || runtime.supabasePublishableKey || '').trim();\n  if (!url.startsWith('https://') || !key) throw new Error('El panel no tiene configurada la URL y la clave pública de Supabase.');\n  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, key }));\n  if (!supabase && window.HF_SUPABASE_CLIENT) supabase = window.HF_SUPABASE_CLIENT;\n  if (!supabase) {\n    const searchParams = new URLSearchParams(window.location.search);\n    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));\n    const callbackType = hashParams.get('type') || searchParams.get('type') || '';\n    const isCodeCallback = searchParams.has('code') || hashParams.has('code');\n    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: isCodeCallback ? 'pkce' : 'implicit' } });\n    window.HF_SUPABASE_CLIENT = supabase;\n  }\n  return supabase;\n}",
"function getClient() {\n  const runtime = window.HF_CENTRAL_CONFIG || {};\n  const url = ($('supabaseUrl')?.value || runtime.supabaseUrl || '').trim();\n  const key = ($('supabaseKey')?.value || runtime.supabasePublishableKey || '').trim();\n  if (!url.startsWith('https://') || !key) throw new Error('El panel no tiene configurada la URL y la clave pública de Supabase.');\n  // No bloquear el login si Safari restringe esta copia auxiliar de la configuración.\n  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, key })); }\n  catch (error) { console.warn('HF Coach: no se pudo guardar la configuración local; se continúa con la configuración del despliegue.', error); }\n  if (!supabase) {\n    const searchParams = new URLSearchParams(window.location.search);\n    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));\n    const isCodeCallback = searchParams.has('code') || hashParams.has('code');\n    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: isCodeCallback ? 'pkce' : 'implicit' } });\n  }\n  // Todos los módulos comparten esta única instancia de Supabase Auth.\n  window.HF_SUPABASE_CLIENT = supabase;\n  return supabase;\n}\nwindow.HF_GET_SUPABASE_CLIENT = getClient;",
'getClient singleton');

const start = app.indexOf('async function signIn() {');
const end = app.indexOf('\nasync function loadData() {', start);
if (start < 0 || end < 0) throw new Error('No se encontró el bloque signIn completo.');
const signIn = String.raw`async function signIn() {
  const loginStatus = $('loginStatus');
  const loginButton = $('loginBtn');
  if (loginStatus) {
    loginStatus.hidden = false;
    loginStatus.textContent = 'Validando credenciales…';
    loginStatus.className = 'status';
  }
  if (loginButton) loginButton.disabled = true;
  try {
    const sb = getClient();
    const { data: auth, error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    if (error) throw error;
    currentUserId = auth.user.id;
    $('password').value = '';
    const { data: memberships, error: memberError } = await sb.from("organization_memberships").select("organization_id,role").eq("user_id", auth.user.id).in("role", ["admin","coach"]);
    if (memberError) throw memberError;
    $('loginPanel').hidden = true; $('dashboard').hidden = true; $('athleteDashboard').hidden = true; $('athleteAccessPanel').hidden = true;
    if (memberships && memberships.length) {
      currentRole = memberships.some(m => m.role === "admin") ? "admin" : "coach";
      const membership = memberships.find(m => m.role === currentRole) || memberships[0];
      organizationId = membership.organization_id;
      const { data: org, error: orgError } = await sb.from("organizations").select("name").eq("id", organizationId).maybeSingle();
      if (orgError) throw orgError;
      organizationName = org?.name || "HF Coach";
      $('sessionLabel').textContent = auth.user.email + ' · ' + currentRole;
      $('dashboard').hidden = false; $('orgLabel').textContent = organizationName + ' · ' + auth.user.email + ' · ' + currentRole;
      await loadData(); applyRoleBasedInterface(); return;
    }
    const { data: links, error: linkError } = await sb.from("athlete_accounts").select("organization_id,athlete_id,account_status").eq("user_id", auth.user.id).eq("account_status","active").limit(1);
    if (linkError) throw linkError;
    if (links && links.length) {
      athleteAccount = links[0]; organizationId = athleteAccount.organization_id; currentRole = "athlete";
      $('sessionLabel').textContent = auth.user.email + ' · atleta'; $('athleteDashboard').hidden = false;
      await loadAthletePortal(); return;
    }
    currentRole = "unlinked";
    $('sessionLabel').textContent = auth.user.email + ' · sin vinculación'; $('athleteAccessPanel').hidden = false;
    $('accessFullName').value = auth.user.user_metadata?.full_name || '';
    await loadOwnRequests();
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    if (loginStatus) {
      loginStatus.hidden = false;
      loginStatus.textContent = 'No se pudo iniciar sesión: ' + detail;
      loginStatus.className = 'status error';
    } else {
      message(detail, 'error');
    }
  } finally {
    if (loginButton) loginButton.disabled = false;
  }
}`;
app = app.slice(0, start) + signIn + app.slice(end);
const restoreSession = String.raw`async function restoreAuthenticatedSessionOnLoad() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const type = hash.get('type') || query.get('type') || '';
  // No interferir con los callbacks de invitación ni con la recuperación de contraseña.
  if (hash.has('coach_invite') || query.get('flow') === 'invite' ||
      query.has('code') || hash.has('code') ||
      ['invite', 'magiclink', 'recovery'].includes(type)) return;

  try {
    const sb = getClient();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const user = data.session && data.session.user;
    if (!user) return;

    currentUserId = user.id;
    const { data: memberships, error: memberError } = await sb
      .from('organization_memberships')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'coach']);
    if (memberError) throw memberError;

    $('loginPanel').hidden = true;
    $('dashboard').hidden = true;
    $('athleteDashboard').hidden = true;
    $('athleteAccessPanel').hidden = true;

    if (memberships && memberships.length) {
      currentRole = memberships.some(item => item.role === 'admin') ? 'admin' : 'coach';
      const membership = memberships.find(item => item.role === currentRole) || memberships[0];
      organizationId = membership.organization_id;
      const { data: org, error: orgError } = await sb
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();
      if (orgError) throw orgError;
      organizationName = org && org.name ? org.name : 'HF Coach';
      $('sessionLabel').textContent = user.email + ' · ' + currentRole;
      $('dashboard').hidden = false;
      $('orgLabel').textContent = organizationName + ' · ' + user.email + ' · ' + currentRole;
      await loadData();
      applyRoleBasedInterface();
      return;
    }

    const { data: links, error: linkError } = await sb
      .from('athlete_accounts')
      .select('organization_id,athlete_id,account_status')
      .eq('user_id', user.id)
      .eq('account_status', 'active')
      .limit(1);
    if (linkError) throw linkError;
    if (links && links.length) {
      athleteAccount = links[0];
      organizationId = athleteAccount.organization_id;
      currentRole = 'athlete';
      $('sessionLabel').textContent = user.email + ' · atleta';
      $('athleteDashboard').hidden = false;
      await loadAthletePortal();
      return;
    }

    currentRole = 'unlinked';
    $('sessionLabel').textContent = user.email + ' · sin vinculación';
    $('athleteAccessPanel').hidden = false;
    $('accessFullName').value = user.user_metadata && user.user_metadata.full_name || '';
    await loadOwnRequests();
  } catch (error) {
    console.warn('HF Coach: no se pudo restaurar la sesión guardada.', error);
    const status = $('loginStatus');
    if (status) {
      status.hidden = false;
      status.textContent = 'No se pudo restaurar la sesión: ' + (error.message || String(error)) + '. Ingresá nuevamente.';
      status.className = 'status error';
    }
  }
}`;
app = replaceOnce(app,
"$('loginBtn').addEventListener('click', signIn);",
restoreSession + "\n$('loginBtn').addEventListener('click', signIn);",
"restore session helper");
app = replaceOnce(app,
"setConfigInputs();\nhandleInviteLanding();",
"setConfigInputs();\nhandleInviteLanding();\nrestoreAuthenticatedSessionOnLoad();",
"restore session startup");
write('app.js', app);

let html = read('index.html');
html = replaceOnce(html,
'      <button id="loginBtn" class="primary">Ingresar</button>',
'      <button id="loginBtn" type="button" class="primary">Ingresar</button>\n      <p id="loginStatus" class="status" role="status" aria-live="polite" hidden></p>',
'login status');
write('index.html', html);

let recovery = read('recovery.js');
recovery = replaceOnce(recovery, '  let recoveryClientPromise = null;\n', '', 'recovery client cache');
const rs = recovery.indexOf('  async function getRecoveryClient() {');
const re = recovery.indexOf('\n  async function sendRecoveryRequest(button) {', rs);
if (rs < 0 || re < 0) throw new Error('No se encontró getRecoveryClient.');
recovery = recovery.slice(0, rs) + String.raw`  async function getRecoveryClient() {
    const getClient = window.HF_GET_SUPABASE_CLIENT;
    if (typeof getClient !== 'function') {
      throw new Error('El módulo de autenticación de HF Coach no está listo. Recargá la página e intentá nuevamente.');
    }
    return getClient();
  }
` + recovery.slice(re);
write('recovery.js', recovery);

let invitations = read('coach-invitations.js');
invitations = replaceOnce(invitations, '  var clientPromise = null;\n', '', 'invitation client cache');
const is = invitations.indexOf('  async function getClient() {');
const ie = invitations.indexOf('\n  async function invoke(name, body) {', is);
if (is < 0 || ie < 0) throw new Error('No se encontró getClient de invitaciones.');
invitations = invitations.slice(0, is) + String.raw`  async function getClient() {
    var getSharedClient = window.HF_GET_SUPABASE_CLIENT;
    if (typeof getSharedClient !== "function") {
      throw new Error("El módulo de autenticación de HF Coach no está listo. Recargá la página e intentá nuevamente.");
    }
    return getSharedClient();
  }
` + invitations.slice(ie);
write('coach-invitations.js', invitations);

let css = read('styles.css');
if (!css.includes('[hidden] { display: none !important; }')) {
  css += '\n/* Respetar el atributo hidden aunque un componente defina display:grid. */\n[hidden] { display: none !important; }\n';
}
write('styles.css', css);

console.log('Autenticación unificada: una sola instancia Supabase, almacenamiento tolerante a restricciones de Safari y errores de login visibles.');
