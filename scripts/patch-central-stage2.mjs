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
    '  if (!supabase && window.HF_SUPABASE_CLIENT) supabase = window.HF_SUPABASE_CLIENT;',
    '  if (!supabase) {',
    "    const searchParams = new URLSearchParams(window.location.search);",
    "    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));",
    "    const callbackType = hashParams.get('type') || searchParams.get('type') || '';",
    "    const isInviteCallback = searchParams.get('flow') === 'invite' || ['invite', 'magiclink'].includes(callbackType);",
    "    const isRecoveryCallback = searchParams.has('code') || searchParams.has('token_hash') || hashParams.get('type') === 'recovery';",
    "    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isRecoveryCallback, flowType: isInviteCallback ? 'implicit' : 'pkce' } });",
    '    window.HF_SUPABASE_CLIENT = supabase;',
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
    "  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));",
    "  const callbackType = hashParams.get('type') || params.get('type') || '';",
    "  if (params.get('flow') !== 'invite' && !['invite', 'magiclink'].includes(callbackType)) return;",
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
    "    const mobileConfig = window.HF_CENTRAL_CONFIG || {};",
    "    $('coachAccountLabel').textContent = sessionData.session.user.email || '';",
    "    $('androidSupabaseUrl').textContent = mobileConfig.supabaseUrl || '';",
    "    $('androidSupabaseKey').textContent = mobileConfig.supabasePublishableKey || '';",

    '    history.replaceState({}, document.title, window.location.pathname);',
    '  } catch (error) {',
    "    showInviteStatus(error.message || String(error), 'error');",
    '  }',
    '}',
    '',
    'async function copyCoachConfigValue(elementId, statusId) {',
    '  const value = document.getElementById(elementId)?.textContent?.trim() || "";',
    '  const status = document.getElementById(statusId);',
    '  if (!value) { if (status) status.textContent = "Configuración no disponible."; return; }',
    '  try { await navigator.clipboard.writeText(value); if (status) status.textContent = "Copiado."; }',
    '  catch (_) { if (status) status.textContent = "No se pudo copiar. Mantené presionado el valor para seleccionarlo."; }',
    '}',
  ].join('\n');
  app = app.slice(0, start) + activationCode + app.slice(end);
}

const inviteListener = "$('inviteForm').addEventListener('submit', inviteCoach);";
if (!app.includes("$('inviteSetupForm').addEventListener('submit', setInvitePassword);")) {
  app = replaceRequired(app, inviteListener, inviteListener + "\n$('inviteSetupForm').addEventListener('submit', setInvitePassword);", 'listener del formulario de invitación');
}
if (!app.includes('handleInviteLanding();')) {
  app = replaceRequired(app, 'setConfigInputs();', 'setConfigInputs();\nhandleInviteLanding();', 'inicio del flujo de activación');
}
app = app.replace(/^\s*handlePasswordRecoveryLanding\(\);\s*$/m, '');

const passwordRecoveryCode = [
  "async function requestPasswordRecovery(triggerButton) {",
  "  const emailInput = document.getElementById(\"recoveryEmail\");",
  "  const status = document.getElementById(\"passwordRecoveryRequestStatus\");",
  "  const button = triggerButton || document.getElementById(\"passwordRecoveryRequestBtn\");",
  "  if (!emailInput || !status || !button) { console.error(\"HF Coach: faltan elementos del formulario de recuperación.\"); return; }",
  "  const email = emailInput.value.trim().toLowerCase();",
  "  status.style.display = \"block\";",
  "  status.textContent = \"\";",
  "  status.className = \"notice\";",
  "  if (!email) { status.textContent = \"Ingresá el correo de tu cuenta antes de continuar.\"; status.className = \"notice error\"; emailInput.focus(); return; }",
  "  const originalText = button.textContent;",
  "  button.disabled = true;",
  "  button.textContent = \"Enviando…\";",
  "  status.textContent = \"Conectando con Supabase y solicitando el enlace…\";",
  "  try {",
  "    const client = getClient();",
  "    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + \"/\" });",
  "    if (error) throw error;",
  "    status.textContent = \"Solicitud aceptada por Supabase. Revisá Recibidos y Spam. Si no llega, comprobaremos la entrega SMTP y los límites del servicio.\"; ",
  "    status.className = \"notice success\";",
  "  } catch (error) {",
  "    console.error(\"HF Coach password recovery error:\", error);",
  "    status.textContent = \"No se pudo enviar el enlace: \" + (error && error.message ? error.message : String(error));",
  "    status.className = \"notice error\";",
  "  } finally {",
  "    button.disabled = false;",
  "    button.textContent = originalText;",
  "  }",
  "}",
  "",
  "async function handlePasswordRecoveryLanding() {",
  "  const params = new URLSearchParams(window.location.search);",
  "  if (!params.has(\"code\")) return;",
  "  $(\"loginPanel\").hidden = true;",
  "  $(\"inviteSetupPanel\").hidden = true;",
  "  $(\"inviteDonePanel\").hidden = true;",
  "  $(\"passwordResetPanel\").hidden = false;",
  "  $(\"passwordResetStatus\").style.display = \"block\";",
  "  $(\"passwordResetStatus\").textContent = \"Validando el enlace de recuperación…\";",
  "  try {",
  "    const { data, error } = await getClient().auth.getSession();",
  "    if (error) throw error;",
  "    if (!data.session) throw new Error(\"El enlace venció, ya fue utilizado o no es válido. Solicitá uno nuevo.\");",
  "    $(\"passwordRecoveryEmail\").textContent = data.session.user.email || \"\";",
  "    $(\"passwordResetForm\").hidden = false;",
  "    $(\"passwordResetStatus\").textContent = \"Enlace validado. Elegí una contraseña nueva de al menos 10 caracteres.\"; ",
  "    $(\"passwordResetStatus\").className = \"notice success\";",
  "  } catch (error) {",
  "    $(\"passwordResetForm\").hidden = true;",
  "    $(\"passwordResetStatus\").textContent = \"No se pudo validar el enlace: \" + (error.message || String(error));",
  "    $(\"passwordResetStatus\").className = \"notice error\";",
  "  }",
  "}",
  "",
  "async function completePasswordRecovery() {",
  "  const password = $(\"recoveryNewPassword\").value;",
  "  const confirmation = $(\"recoveryConfirmPassword\").value;",
  "  const status = $(\"passwordResetStatus\");",
  "  if (password.length < 10) { status.textContent = \"La contraseña debe tener al menos 10 caracteres.\"; status.className = \"notice error\"; return; }",
  "  if (password !== confirmation) { status.textContent = \"Las contraseñas no coinciden.\"; status.className = \"notice error\"; return; }",
  "  status.textContent = \"Actualizando la contraseña…\";",
  "  status.className = \"notice\";",
  "  try {",
  "    const { error } = await getClient().auth.updateUser({ password });",
  "    if (error) throw error;",
  "    await getClient().auth.signOut();",
  "    $(\"passwordResetForm\").hidden = true;",
  "    $(\"passwordResetBackBtn\").hidden = false;",
  "    status.textContent = \"Contraseña actualizada. Ya podés volver al ingreso e iniciar sesión con tu nueva contraseña.\"; ",
  "    status.className = \"notice success\";",
  "    history.replaceState({}, document.title, window.location.pathname);",
  "  } catch (error) {",
  "    status.textContent = \"No se pudo actualizar la contraseña: \" + (error.message || String(error));",
  "    status.className = \"notice error\";",
  "  }",
  "}",
  "",
  "function returnToPasswordLogin() {",
  "  $(\"passwordResetPanel\").hidden = true;",
  "  $(\"passwordResetBackBtn\").hidden = true;",
  "  $(\"loginPanel\").hidden = false;",
  "}",
  "",
].join("\n");
if (!app.includes('async function requestPasswordRecovery()')) {
  app += "\n" + passwordRecoveryCode;
}
app = replaceRequired(
  app,
  "$('loginBtn').addEventListener('click', signIn);",
  "$('loginBtn').addEventListener('click', signIn);",
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
    '      <p>Ya podés instalar HF Coach Android desde esta misma pantalla e ingresar con el correo y la contraseña que acabás de crear.</p>',
    '      <div id="coachAndroidInstall" class="coach-install">',
    '        <h3>1. Descargar HF Coach para Android</h3>',
    '        <p>Versión de prueba para el piloto · versión 1.0.68 · compilación del 19/11/2026 · 4,3 MB.</p>',
    '        <a class="button-link coach-download" href="https://ntui7yxdugxgtgoa.public.blob.vercel-storage.com/releases/HF-Coach.apk?download=1&build=68" target="_blank" rel="noopener noreferrer">Descargar HF Coach Android</a>',
    '        <h3>2. Instalar la aplicación</h3>',
    '        <ol><li>Cuando termine la descarga, abrí el archivo HF-Coach.apk.</li><li>Si Android lo solicita, autorizá la instalación desde el navegador o administrador de archivos que utilizaste.</li><li>Confirmá la instalación y abrí HF Coach.</li></ol>',
    '        <h3>3. Conectar tu cuenta</h3>',
    '        <p>En HF Coach abrí <strong>Intercambio</strong>. Ingresá los siguientes datos y luego iniciá sesión con el mismo correo y contraseña de esta activación.</p>',
    '        <div class="coach-config-row"><div><b>Cuenta</b><code id="coachAccountLabel">—</code></div></div>',
    '        <div class="coach-config-row"><div><b>URL de Supabase</b><code id="androidSupabaseUrl">—</code><small id="androidSupabaseUrlStatus" class="copy-status" aria-live="polite"></small></div><button id="copyAndroidSupabaseUrl" type="button" class="quiet">Copiar URL</button></div>',
    '        <div class="coach-config-row"><div><b>Clave pública de Supabase</b><code id="androidSupabaseKey">—</code><small id="androidSupabaseKeyStatus" class="copy-status" aria-live="polite"></small></div><button id="copyAndroidSupabaseKey" type="button" class="quiet">Copiar clave</button></div>',
    '        <p class="notice">La clave indicada es pública y sirve para conectar la aplicación. Nunca ingreses una clave service_role. La sincronización requiere conexión a Internet.</p>',
    '      </div>',
    '    </section>',
    ''
  ].join('\n');
  html = replaceRequired(html, '  <main class="shell">\n', '  <main class="shell">\n' + invitePanels, 'paneles de activación');
}
const inviteDoneStart = html.indexOf('<section id="inviteDonePanel"');
if (inviteDoneStart >= 0 && !html.slice(inviteDoneStart, html.indexOf('</section>', inviteDoneStart)).includes('coachAndroidInstall')) {
  const inviteDoneEnd = html.indexOf('</section>', inviteDoneStart);
  if (inviteDoneEnd < 0) throw new Error('No se pudo localizar el cierre del panel de activación.');
  const installMarkup = [
    '      <div id="coachAndroidInstall" class="coach-install">',
    '        <h3>1. Descargar HF Coach para Android</h3>',
    '        <p>Versión de prueba para el piloto · versión 1.0.68 · compilación del 19/11/2026 · 4,3 MB.</p>',
    '        <a class="button-link coach-download" href="https://ntui7yxdugxgtgoa.public.blob.vercel-storage.com/releases/HF-Coach.apk?download=1&build=68" target="_blank" rel="noopener noreferrer">Descargar HF Coach Android</a>',
    '        <h3>2. Instalar la aplicación</h3>',
    '        <ol><li>Cuando termine la descarga, abrí el archivo HF-Coach.apk.</li><li>Si Android lo solicita, autorizá la instalación desde el navegador o administrador de archivos que utilizaste.</li><li>Confirmá la instalación y abrí HF Coach.</li></ol>',
    '        <h3>3. Conectar tu cuenta</h3>',
    '        <p>En HF Coach abrí <strong>Intercambio</strong>. Ingresá los siguientes datos y luego iniciá sesión con el mismo correo y contraseña de esta activación.</p>',
    '        <div class="coach-config-row"><div><b>Cuenta</b><code id="coachAccountLabel">—</code></div></div>',
    '        <div class="coach-config-row"><div><b>URL de Supabase</b><code id="androidSupabaseUrl">—</code><small id="androidSupabaseUrlStatus" class="copy-status" aria-live="polite"></small></div><button id="copyAndroidSupabaseUrl" type="button" class="quiet">Copiar URL</button></div>',
    '        <div class="coach-config-row"><div><b>Clave pública de Supabase</b><code id="androidSupabaseKey">—</code><small id="androidSupabaseKeyStatus" class="copy-status" aria-live="polite"></small></div><button id="copyAndroidSupabaseKey" type="button" class="quiet">Copiar clave</button></div>',
    '        <p class="notice">La clave indicada es pública y sirve para conectar la aplicación. Nunca ingreses una clave service_role. La sincronización requiere conexión a Internet.</p>',
    '      </div>'
  ].join('\\n');
  html = html.slice(0, inviteDoneEnd) + installMarkup + '\\n' + html.slice(inviteDoneEnd);
}

if (!html.includes('id="passwordRecoveryPanel"')) {
  const passwordRecoveryMarkup = [
    '      <details id="passwordRecoveryPanel" class="registration-box">',
    '        <summary>¿Olvidaste tu contraseña?</summary>',
    '        <div class="stack-form">',
    '          <label>Correo de tu cuenta<input id="recoveryEmail" type="email" required autocomplete="email" placeholder="tu-correo@gmail.com"></label>',
    '          <button id="passwordRecoveryRequestBtn" type="button" class="primary">Enviar enlace de recuperación</button>',
    '          <p id="passwordRecoveryRequestStatus" class="notice" role="status" aria-live="polite" style="display:block;min-height:1.4em"></p>',
    '        </div>',
    '      </details>'
  ].join('\n');
  html = replaceRequired(html, '      <button id="loginBtn" class="primary">Ingresar</button>', passwordRecoveryMarkup + '\n      <button id="loginBtn" class="primary">Ingresar</button>', 'acceso a recuperación de contraseña');
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
  ].join('\n');
  html = replaceRequired(html, '  <main class="shell">\n', '  <main class="shell">\n' + passwordResetPanel, 'pantalla de restablecimiento');
}

if (!html.includes('<script src="./config.js"></script>')) {
  html = replaceRequired(html, '  <script type="module" src="./app.js"></script>', '  <script src="./config.js"></script>\n  <script type="module" src="./app.js"></script>', 'configuración runtime del panel');
}
if (!html.includes('<script src="./recovery.js"></script>')) {
  html = replaceRequired(
    html,
    '<script type="module" src="./app.js"></script>',
    '<script src="./recovery.js"></script>\n  <script type="module" src="./app.js"></script>',
    'controlador independiente de recuperación'
  );
}
fs.writeFileSync(htmlPath, html, 'utf8');

let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('#inviteSetupForm')) {
  css += '\n#inviteSetupForm label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;margin:14px 0}#inviteSetupForm button{width:100%}#inviteSetupStatus:empty{display:none}#inviteSetupPanel .notice{margin-top:18px}\n';
}
if (!css.includes('.coach-install{')) {
  css += '\n.coach-install{margin-top:18px;padding:18px;border:1px solid #dce0df;border-radius:10px;background:#f8f9f8}.coach-install h3{margin:16px 0 7px;font-size:15px}.coach-install h3:first-child{margin-top:0}.coach-install ol{padding-left:22px;line-height:1.6;color:#4f5c63;font-size:13px}.coach-download{display:flex;width:100%;margin:12px 0 18px;min-height:48px}.coach-config-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #e3e7e5}.coach-config-row>div{min-width:0;flex:1}.coach-config-row code{display:block;overflow-wrap:anywhere;user-select:all;padding:7px;background:#eef1f0;border-radius:6px;margin-top:6px;font-size:11px}.coach-config-row button{white-space:nowrap}.copy-status{display:block;color:#28633a;font-size:11px;min-height:14px;margin-top:3px}@media(max-width:600px){.coach-config-row{align-items:stretch;flex-direction:column}.coach-config-row button{width:100%}}\n';
}
fs.writeFileSync(cssPath, css, 'utf8');
console.log('HF Central Stage 2: flujo de activación de coaches aplicado.');
