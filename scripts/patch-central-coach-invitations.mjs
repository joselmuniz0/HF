import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const adminDir = path.resolve(".hf-central/admin");
const appPath = path.join(adminDir, "app.js");
const htmlPath = path.join(adminDir, "index.html");
const cssPath = path.join(adminDir, "styles.css");

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error("No se encontró el punto de inserción: " + label);
}
function writeText(file, value) {
  fs.writeFileSync(file, value, "utf8");
}

let app = fs.readFileSync(appPath, "utf8");
if (!app.includes("create-coach-invitation")) {
  const start = app.indexOf("async function inviteCoach(event) {");
  const end = app.indexOf("async function copyInviteLink() {", start);
  if (start < 0 || end < 0) throw new Error("No se encontró el controlador de invitaciones generado por Stage 3.");

  const replacement = [
    "async function inviteCoach(event) {",
    "  event.preventDefault();",
    "  $('inviteResultPanel').hidden = true;",
    "  $('inviteCopyStatus').textContent = '';",
    "  const displayName = $('coachName').value.trim();",
    "  const email = $('coachEmail').value.trim().toLowerCase();",
    "  try {",
    "    const { data: result, error } = await getClient().functions.invoke('create-coach-invitation', {",
    "      body: { organization_id: organizationId, display_name: displayName, email }",
    "    });",
    "    if (error) {",
    "      let detail = error.message || 'No se pudo generar la invitación.';",
    "      try { const body = await error.context.clone().json(); if (body && body.error) detail = body.error; } catch (_) {}",
    "      throw new Error(detail);",
    "    }",
    "    if (!result || !result.ok || !result.invite_url) throw new Error(result && result.error ? result.error : 'El servidor no devolvió una invitación válida.');",
    "    const inviteUrl = new URL(result.invite_url);",
    "    // Preview deployments use a different host; invitations always target the canonical app domain.",
    "    const canonicalInviteHost = 'hf-coach-central.vercel.app';",
    "    if (inviteUrl.protocol !== 'https:' || inviteUrl.hostname !== canonicalInviteHost || inviteUrl.port || inviteUrl.username || inviteUrl.password || inviteUrl.pathname !== '/') {",
    "      if (result.invitation_id) {",
    "        const cleanup = await getClient().functions.invoke('manage-coach-invitations', { body: { action: 'revoke', invitation_id: result.invitation_id } });",
    "        if (cleanup.error || (cleanup.data && cleanup.data.error)) console.warn('No se pudo revocar la invitación con URL inválida.', cleanup.error || cleanup.data.error);",
    "      }",
    "      throw new Error('El enlace generado no corresponde al dominio oficial de HF Coach Central. La invitación se revocó automáticamente.');",
    "    }",
    "    if (!inviteUrl.hash.startsWith('#coach_invite=')) throw new Error('El enlace generado no contiene el token esperado.');",
    "    $('inviteLink').value = inviteUrl.toString();",
    "    $('inviteResultPanel').dataset.invitationId = result.invitation_id || '';",
    "    $('inviteResultEmail').textContent = 'Invitación para ' + displayName + ' · ' + email;",
    "    let expiry = document.getElementById('inviteExpiresAt');",
    "    if (!expiry) { expiry = document.createElement('p'); expiry.id = 'inviteExpiresAt'; expiry.className = 'muted'; $('inviteResultEmail').after(expiry); }",
    "    expiry.textContent = 'Vencimiento: ' + new Date(result.expires_at).toLocaleString('es-AR') + ' · Estado: pendiente de aceptación';",
    "    const shareStart = result.account_exists",
    "      ? 'Ya tenés una cuenta de HF Coach. Abrí este enlace, iniciá sesión con tu correo y contraseña y confirmá la invitación para incorporarte a la organización:'",
    "      : 'Te invito a HF Coach como coach. Abrí este enlace para crear tu cuenta, definir una contraseña personal y confirmar la invitación:';",
    "    const expiryHours = Number(result.expires_in_hours) || 72;",
    "    const shareText = 'Hola ' + displayName + ', ' + shareStart + ' ' + inviteUrl.toString() + ' El enlace es personal, vence en ' + expiryHours + ' horas y no activa permisos hasta que confirmes la invitación. No lo reenvíes.';",
    "    $('shareInviteWhatsApp').href = 'https://wa.me/?text=' + encodeURIComponent(shareText);",
    "    $('inviteResultPanel').hidden = false;",
    "    $('inviteForm').reset();",
    "    await loadData();",
    "    message('Invitación creada para ' + email + '. El coach recibirá permisos únicamente después de aceptarla.', 'success');",
    "    const listPanel = document.getElementById('coachInvitationAdminPanel');",
    "    if (listPanel && !listPanel.hidden) document.getElementById('refreshCoachInvitations')?.click();",
    "  } catch (error) {",
    "    message('No se pudo crear la invitación para ' + (email || 'el coach') + ': ' + (error.message || String(error)), 'error');",
    "  }",
    "}",
    ""
  ].join("\n");
  app = app.slice(0, start) + replacement + app.slice(end);
}
if (!app.includes("HF custom invitations installed")) {
  app += "\n/* HF custom invitations installed */\n";
}
writeText(appPath, app);

let html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes('id="coachInviteLanding"')) {
  const landing = [
    '    <section id="coachInviteLanding" class="panel login-panel coach-invite-landing" hidden>',
    '      <h2>Invitación a HF Coach</h2>',
    '      <p id="coachInviteGreeting">Hola.</p>',
    '      <p>Organización: <strong id="coachInviteOrganization">HF Coach</strong></p>',
    '      <p>Cuenta invitada: <strong id="coachInviteEmail">—</strong></p>',
    '      <p id="coachInviteExpiry" class="muted"></p>',
    '      <p id="coachInviteGlobalStatus" class="status" role="status" aria-live="polite"></p>',
    '      <div id="coachInviteSignedIn" hidden>',
    '        <p>La sesión actual corresponde al correo invitado.</p>',
    '        <button id="coachInviteAcceptSignedIn" class="primary" type="button">Confirmar invitación y activar acceso</button>',
    '      </div>',
    '      <div id="coachInviteExistingForm" class="stack-form" hidden>',
    '        <h3>Ya tengo una cuenta</h3>',
    '        <form id="coachInviteExistingLoginForm" class="stack-form">',
    '          <label>Contraseña de HF Coach<input id="coachInviteExistingPassword" type="password" autocomplete="current-password" required></label>',
    '          <button id="coachInviteExistingSubmit" class="primary" type="submit">Ingresar y aceptar invitación</button>',
    '          <p id="coachInviteExistingStatus" class="status" role="status" aria-live="polite"></p>',
    '        </form>',
    '        <button id="coachInviteResetToggle" class="quiet" type="button">No tengo contraseña o no puedo ingresar</button>',
    '        <form id="coachInviteResetForm" class="stack-form" hidden>',
    '          <h4>Definir una contraseña nueva</h4>',
    '          <label>Nueva contraseña<input id="coachInviteResetPassword" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>',
    '          <label>Confirmar contraseña<input id="coachInviteResetPasswordConfirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>',
    '          <p class="notice">El enlace personal autoriza esta actualización solo para la cuenta invitada. La contraseña debe tener al menos 12 caracteres.</p>',
    '          <button id="coachInviteResetSubmit" class="primary" type="submit">Actualizar contraseña y aceptar</button>',
    '          <p id="coachInviteResetStatus" class="status" role="status" aria-live="polite"></p>',
    '        </form>',
    '      </div>',
    '      <form id="coachInviteNewForm" class="stack-form" hidden>',
    '        <h3>Crear mi cuenta de coach</h3>',
    '        <label>Nueva contraseña<input id="coachInviteNewPassword" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>',
    '        <label>Confirmar contraseña<input id="coachInviteNewPasswordConfirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>',
    '        <p class="notice">La contraseña debe tener al menos 12 caracteres. Usá una clave exclusiva para tu cuenta.</p>',
    '        <button id="coachInviteNewSubmit" class="primary" type="submit">Crear cuenta y aceptar invitación</button>',
    '        <p id="coachInviteNewStatus" class="status" role="status" aria-live="polite"></p>',
    '      </form>',
    '      <p class="muted">El enlace se puede abrir varias veces sin consumirlo. La invitación se confirma solamente al pulsar el botón correspondiente.</p>',
    '    </section>',
    ''
  ].join("\n");
  requireText(html, "  </main>", "cierre main para pantalla de invitación");
  html = html.replace("  </main>", landing + "\n  </main>");
}
if (!html.includes('id="coachInvitationAdminPanel"')) {
  const resultMarker = '        <div id="inviteResultPanel"';
  const resultStart = html.indexOf(resultMarker);
  if (resultStart < 0) throw new Error("No se encontró el panel de resultado de invitación Stage 3.");
  const coachesStart = html.indexOf('        <div id="coaches"', resultStart);
  if (coachesStart < 0) throw new Error("No se encontró la sección de coaches después del formulario de invitación.");
  const admin = [
    '        <section id="coachInvitationAdminPanel" class="panel coach-invitation-admin">',
    '          <div class="section-head"><div><h3>Invitaciones activas</h3><p class="muted">Solo se muestran enlaces pendientes. Eliminar una cuenta en Auth no revoca su invitación: usá Revocar para invalidar el enlace.</p></div>',
    '            <button id="refreshCoachInvitations" type="button" class="quiet">Actualizar</button></div>',
    '          <p id="coachInvitationAdminStatus" class="status" role="status" aria-live="polite"></p>',
    '          <div id="coachInvitationsList" class="coach-invitations-list"></div>',
    '        </section>',
    ''
  ].join("\n");
  html = html.slice(0, coachesStart) + admin + html.slice(coachesStart);
}
if (!html.includes('<script src="./coach-invitations.js"></script>')) {
  requireText(html, "</body>", "cierre body para script de invitaciones");
  html = html.replace("</body>", '  <script src="./coach-invitations.js"></script>\n</body>');
}
writeText(htmlPath, html);

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes("hf-coach-invite-active #coachInviteLanding")) {
  css += [
    "",
    "body.hf-coach-invite-active #loginPanel,body.hf-coach-invite-active #dashboard,body.hf-coach-invite-active #inviteSetupPanel,body.hf-coach-invite-active #inviteDonePanel,body.hf-coach-invite-active #passwordResetPanel{display:none!important}",
    "body.hf-coach-invite-active:before{content:\"\";position:fixed;inset:0;z-index:9998;background:#f3f4f3}",
    "body.hf-coach-invite-active #coachInviteLanding:not([hidden]){position:fixed;inset:16px;z-index:9999;margin:auto;width:calc(100% - 32px);max-width:560px;max-height:calc(100vh - 32px);overflow:auto}",
    ""
  ].join("\n");
}
if (!css.includes(".coach-invite-landing{")) {
  css += [
    "",
    ".coach-invite-landing{max-width:560px;margin:24px auto}",
    ".coach-invite-landing .stack-form{display:grid;grid-template-columns:1fr;gap:12px;margin-top:16px}",
    ".coach-invite-landing .stack-form label{display:flex;flex-direction:column;gap:6px}",
    ".coach-invitation-admin{margin-top:16px}",
    ".coach-invitations-list{display:grid;gap:8px;margin-top:10px}",
    ".coach-invitation-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e1e5e3;border-radius:8px;background:#fff}",
    ".coach-invitation-details{display:grid;gap:5px;min-width:0}",
    ".coach-invitation-details strong{overflow-wrap:anywhere;font-size:13px}",
    ".coach-invitation-details small{color:#65716d;font-size:12px}",
    "@media(max-width:600px){.coach-invitation-row{align-items:stretch;flex-direction:column}.coach-invitation-row button{width:100%}}",
    ""
  ].join("\n");
}
if (!css.includes("[hidden] { display: none !important; }")) {
  css += [
    "",
    "/* Prevent display rules on stack forms from overriding the HTML hidden state. */",
    "[hidden] { display: none !important; }",
    ""
  ].join("\n");
}
writeText(cssPath, css);

const sourceScript = path.resolve("scripts/coach-invitations.js");
const targetScript = path.join(adminDir, "coach-invitations.js");
if (!fs.existsSync(sourceScript)) throw new Error("Falta scripts/coach-invitations.js.");
fs.copyFileSync(sourceScript, targetScript);

console.log("HF Central: se integró el sistema propio de invitaciones de coaches.");
