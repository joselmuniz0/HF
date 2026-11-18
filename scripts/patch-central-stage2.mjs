import fs from 'node:fs';
import path from 'node:path';

const adminDir = path.resolve('.hf-central/admin');
const appPath = path.join(adminDir, 'app.js');
const htmlPath = path.join(adminDir, 'index.html');
const cssPath = path.join(adminDir, 'styles.css');

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error('No se encontró el punto de inserción esperado: ' + label);
  return source.replace(search, replacement);
}

let app = fs.readFileSync(appPath, 'utf8');
if (!app.includes('async function handleInviteLanding()')) {
  const start = app.indexOf('function setConfigInputs() {');
  const end = app.indexOf('async function signIn() {', start);
  if (start < 0 || end < 0) throw new Error('No se encontró el bloque de configuración del panel central.');

  const activationCode = [
    'function setConfigInputs() {',
    '  const runtime = window.HF_CENTRAL_CONFIG || {};',
    '  try {',
    "    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};",
    "    const url = runtime.supabaseUrl || saved.url || '';",
    "    const key = runtime.supabasePublishableKey || saved.key || '';",
    "    $('supabaseUrl').value = url;",
    "    $('supabaseKey').value = key;",
    "    if (runtime.supabaseUrl) $('supabaseUrl').readOnly = true;",
    "    if (runtime.supabasePublishableKey) $('supabaseKey').readOnly = true;",
    '  } catch { /* configuración inválida: se vuelve a ingresar */ }',
    '}',
    '',
    'function getClient() {',
    '  const runtime = window.HF_CENTRAL_CONFIG || {};',
    "  const url = ($('supabaseUrl')?.value || runtime.supabaseUrl || '').trim();",
    "  const key = ($('supabaseKey')?.value || runtime.supabasePublishableKey || '').trim();",
    "  if (!url.startsWith('https://') || !key) throw new Error('El panel no tiene configurada la URL y la clave pública de Supabase.');",
    '  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, key }));',
    '  if (!supabase) {',
    "    const isInviteCallback = new URLSearchParams(window.location.search).get('flow') === 'invite';",
    "    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: isInviteCallback ? 'implicit' : 'pkce' } });",
    '  }',
    '  return supabase;',
    '}',
    '',
    "function showInviteStatus(text, type = '') {",
    "  const el = $('inviteSetupStatus');",
    "  if (el) { el.textContent = text; el.className = 'status ' + type; }",
    '}',
    '',
    'async function handleInviteLanding() {',
    '  const params = new URLSearchParams(window.location.search);',
    "  if (params.get('flow') !== 'invite') return;",
    "  $('loginPanel').hidden = true;",
    "  $('dashboard').hidden = true;",
    "  $('inviteSetupPanel').hidden = false;",
    '  try {',
    '    const sb = getClient();',
    '    const { data: sessionData, error } = await sb.auth.getSession();',
    '    if (error) throw error;',
    '    if (!sessionData.session) throw new Error("No se pudo validar el enlace. Puede haber vencido o haber sido utilizado. Pedile al administrador una nueva invitación.");',
    "    $('inviteEmail').textContent = sessionData.session.user.email || 'Cuenta invitada';",
    "    showInviteStatus('Invitación validada. Definí tu contraseña para completar la activación.', 'success');",
    '  } catch (error) {',
    "    $('inviteSetupForm').hidden = true;",
    "    showInviteStatus(error.message || String(error), 'error');",
    '  }',
    '}',
    '',
    'async function setInvitePassword(event) {',
    '  event.preventDefault();',
    "  const password = $('invitePassword').value;",
    "  const confirmation = $('invitePasswordConfirm').value;",
    "  if (password.length < 10) return showInviteStatus('La contraseña debe tener al menos 10 caracteres.', 'error');",
    "  if (password !== confirmation) return showInviteStatus('Las contraseñas no coinciden.', 'error');",
    '  try {',
    '    const sb = getClient();',
    '    const { data: sessionData, error: sessionError } = await sb.auth.getSession();',
    '    if (sessionError) throw sessionError;',
    "    if (!sessionData.session) throw new Error('La sesión de invitación no está activa. Solicitá una nueva invitación.');",
    "    showInviteStatus('Guardando contraseña…');",
    '    const { error } = await sb.auth.updateUser({ password });',
    '    if (error) throw error;',
    '    await sb.auth.signOut();',
    "    $('inviteSetupPanel').hidden = true;",
    "    $('inviteDonePanel').hidden = false;",
    "    $('sessionLabel').textContent = 'Cuenta activada';",
    '    history.replaceState({}, document.title, window.location.pathname);',
    '  } catch (error) {',
    "    showInviteStatus(error.message || String(error), 'error');",
    '  }',
    '}',
    ''
  ].join('\n');
  app = app.slice(0, start) + activationCode + app.slice(end);
}

const inviteListener = "$('inviteForm').addEventListener('submit', inviteCoach);";
if (!app.includes("$('inviteSetupForm').addEventListener('submit', setInvitePassword);")) {
  app = replaceRequired(app, inviteListener, inviteListener + "\n$('inviteSetupForm').addEventListener('submit', setInvitePassword);", 'listener del formulario de invitación');
}
if (!app.includes('handleInviteLanding();')) {
  app = replaceRequired(app, 'setConfigInputs();', 'setConfigInputs();\nhandleInviteLanding();\nhandlePasswordRecoveryLanding();', 'inicio de los flujos de autenticación');
}

const passwordRecoveryCode = [
  'async function requestPasswordRecovery() {',
  '  const email = $("recoveryEmail").value.trim().toLowerCase();',
  '  const status = $("passwordRecoveryRequestStatus");',
  '  if (!email) { status.textContent = "Ingresá el correo de tu cuenta."; return; }',
  '  status.textContent = "Solicitando el enlace de recuperación…";',
  '  status.className = "notice";',
  '  try {',
  '    const { error } = await getClient().auth.resetPasswordForEmail(email);',
  '    if (error) throw error;',
  '    status.textContent = "Solicitud enviada. Si el correo está autorizado para recibir mensajes de este proyecto, vas a recibir un enlace. Revisá Recibidos y Spam."; ',
  '    status.className = "notice success";',
  '  } catch (error) {',
  '    status.textContent = "No se pudo enviar el enlace: " + (error.message || String(error));',
  '    status.className = "notice error";',
  '  }',
  '}',
  '',
  'async function handlePasswordRecoveryLanding() {',
  '  const params = new URLSearchParams(window.location.search);',
  '  if (!params.has("code")) return;',
  '  $("loginPanel").hidden = true;',
  '  $("inviteSetupPanel").hidden = true;',
  '  $("inviteDonePanel").hidden = true;',
  '  $("passwordResetPanel").hidden = false;',
  '  $("passwordResetStatus").textContent = "Validando el enlace de recuperación…";',
  '  try {',
  '    const { data, error } = await getClient().auth.getSession();',
  '    if (error) throw error;',
  '    if (!data.session) throw new Error("El enlace venció, ya fue utilizado o no es válido. Solicitá uno nuevo.");',
  '    $("passwordRecoveryEmail").textContent = data.session.user.email || "";',
  '    $("passwordResetForm").hidden = false;',
  '    $("passwordResetStatus").textContent = "Enlace validado. Elegí una contraseña nueva de al menos 10 caracteres."; ',
  '    $("passwordResetStatus").className = "notice success";',
  '  } catch (error) {',
  '    $("passwordResetForm").hidden = true;',
  '    $("passwordResetStatus").textContent = "No se pudo validar el enlace: " + (error.message || String(error));',
  '    $("passwordResetStatus").className = "notice error";',
  '  }',
  '}',
  '',
  'async function completePasswordRecovery() {',
  '  const password = $("recoveryNewPassword").value;',
  '  const confirmation = $("recoveryConfirmPassword").value;',
  '  const status = $("passwordResetStatus");',
  '  if (password.length < 10) { status.textContent = "La contraseña debe tener al menos 10 caracteres."; status.className = "notice error"; return; }',
  '  if (password !== confirmation) { status.textContent = "Las contraseñas no coinciden."; status.className = "notice error"; return; }',
  '  status.textContent = "Actualizando la contraseña…";',
  '  status.className = "notice";',
  '  try {',
  '    const { error } = await getClient().auth.updateUser({ password });',
  '    if (error) throw error;',
  '    await getClient().auth.signOut();',
  '    $("passwordResetForm").hidden = true;',
  '    $("passwordResetBackBtn").hidden = false;',
  '    status.textContent = "Contraseña actualizada. Ya podés volver al ingreso e iniciar sesión con tu nueva contraseña."; ',
  '    status.className = "notice success";',
  '    history.replaceState({}, document.title, window.location.pathname);',
  '  } catch (error) {',
  '    status.textContent = "No se pudo actualizar la contraseña: " + (error.message || String(error));',
  '    status.className = "notice error";',
  '  }',
  '}',
  '',
  'function returnToPasswordLogin() {',
  '  $("passwordResetPanel").hidden = true;',
  '  $("passwordResetBackBtn").hidden = true;',
  '  $("loginPanel").hidden = false;',
  '}',
  ''
].join("\\n");

if (!app.includes('async function requestPasswordRecovery()')) {
  app += "\\n" + passwordRecoveryCode;
}
app = replaceRequired(
  app,
  "$('loginBtn').addEventListener('click', signIn);",
  "$('passwordRecoveryRequestBtn').addEventListener('click', requestPasswordRecovery);\\n$('passwordResetSaveBtn').addEventListener('click', completePasswordRecovery);\\n$('passwordResetBackBtn').addEventListener('click', returnToPasswordLogin);\\n$('loginBtn').addEventListener('click', signIn);",
  'eventos de recuperación de contraseña'
);
fs.writeFileSync(appPath, app, 'utf8');

let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('id="inviteSetupPanel"')) {
  const invitePanels = [
    '    <section id="inviteSetupPanel" class="panel login-panel" hidden>',
    '      <h2>Activá tu cuenta de coach</h2>',
    '      <p>La invitación fue validada. Creá una contraseña personal para ingresar a HF Coach.</p>',
    '      <p class="muted">Cuenta: <strong id="inviteEmail">—</strong></p>',
    '      <form id="inviteSetupForm">',
    '        <label>Nueva contraseña<input id="invitePassword" type="password" minlength="10" autocomplete="new-password" required></label>',
    '        <label>Confirmar contraseña<input id="invitePasswordConfirm" type="password" minlength="10" autocomplete="new-password" required></label>',
    '        <button class="primary" type="submit">Guardar contraseña y activar cuenta</button>',
    '      </form>',
    '      <p id="inviteSetupStatus" class="status" role="status" aria-live="polite"></p>',
    '      <p class="notice">Usá una contraseña exclusiva. No la compartas con otros coaches ni con el administrador.</p>',
    '    </section>',
    '',
    '    <section id="inviteDonePanel" class="panel login-panel" hidden>',
    '      <h2>Cuenta activada</h2>',
    '      <p>La contraseña quedó configurada correctamente.</p>',
    '      <p>Ya podés cerrar esta página e ingresar a HF Coach desde la aplicación Android con tu correo y contraseña.</p>',
    '    </section>',
    ''
  ].join('\n');
  html = replaceRequired(html, '  <main class="shell">\n', '  <main class="shell">\n' + invitePanels, 'paneles de activación');
}
if (!html.includes('id="passwordRecoveryPanel"')) {
  const passwordRecoveryMarkup = [
    '      <details id="passwordRecoveryPanel" class="registration-box">',
    '        <summary>¿Olvidaste tu contraseña?</summary>',
    '        <div class="stack-form">',
    '          <label>Correo de tu cuenta<input id="recoveryEmail" type="email" required autocomplete="email" placeholder="tu-correo@gmail.com"></label>',
    '          <button id="passwordRecoveryRequestBtn" type="button" class="primary">Enviar enlace de recuperación</button>',
    '          <p id="passwordRecoveryRequestStatus" class="notice" role="status" aria-live="polite"></p>',
    '        </div>',
    '      </details>'
  ].join('\\n');
  html = replaceRequired(html, '      <button id="loginBtn" class="primary">Ingresar</button>', passwordRecoveryMarkup + '\\n      <button id="loginBtn" class="primary">Ingresar</button>', 'acceso a recuperación de contraseña');
}
if (!html.includes('id="passwordResetPanel"')) {
  const passwordResetPanel = [
    '    <section id="passwordResetPanel" class="panel login-panel" hidden>',
    '      <h2>Restablecer contraseña</h2>',
    '      <p>Cuenta: <strong id="passwordRecoveryEmail">—</strong></p>',
    '      <div id="passwordResetForm" class="stack-form">',
    '        <label>Nueva contraseña<input id="recoveryNewPassword" type="password" minlength="10" autocomplete="new-password" required></label>',
    '        <label>Confirmar contraseña<input id="recoveryConfirmPassword" type="password" minlength="10" autocomplete="new-password" required></label>',
    '        <button id="passwordResetSaveBtn" type="button" class="primary">Guardar nueva contraseña</button>',
    '      </div>',
    '      <p id="passwordResetStatus" class="notice" role="status" aria-live="polite"></p>',
    '      <button id="passwordResetBackBtn" type="button" class="quiet" hidden>Volver al ingreso</button>',
    '    </section>',
    ''
  ].join('\\n');
  html = replaceRequired(html, '  <main class="shell">\\n', '  <main class="shell">\\n' + passwordResetPanel, 'pantalla de restablecimiento');
}
\nif (!html.includes('<script src="./config.js"></script>')) {
  html = replaceRequired(html, '  <script type="module" src="./app.js"></script>', '  <script src="./config.js"></script>\n  <script type="module" src="./app.js"></script>', 'configuración runtime del panel');
}
fs.writeFileSync(htmlPath, html, 'utf8');

let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('#inviteSetupForm')) {
  css += '\n#inviteSetupForm label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;margin:14px 0}#inviteSetupForm button{width:100%}#inviteSetupStatus:empty{display:none}#inviteSetupPanel .notice{margin-top:18px}\n';
}
fs.writeFileSync(cssPath, css, 'utf8');
console.log('HF Central Stage 2: flujo de activación de coaches aplicado.');
