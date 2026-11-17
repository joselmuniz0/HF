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
const inviteStart = app.indexOf('async function inviteCoach(event) {');
const inviteEnd = app.indexOf("$('loginBtn').addEventListener('click', signIn);", inviteStart);
if (inviteStart < 0 || inviteEnd < 0) {
  throw new Error('No se encontró el controlador de invitaciones del panel central.');
}

const manualInviteHandler = [
  'async function inviteCoach(event) {',
  '  event.preventDefault();',
  "  $('inviteResultPanel').hidden = true;",
  "  $('inviteCopyStatus').textContent = '';",
  '  try {',
  "    const displayName = $('coachName').value.trim();",
  "    const email = $('coachEmail').value.trim();",
  "    const { data: result, error } = await getClient().functions.invoke('invite-coach', {",
  '      body: { organization_id: organizationId, display_name: displayName, email }',
  '    });',
  '    if (error) throw error;',
  "    if (result?.error) throw new Error(result.error);",
  "    const actionLink = String(result?.action_link || '').trim();",
  "    if (!actionLink) throw new Error('Supabase no devolvió el enlace de activación.');",
  '    const linkUrl = new URL(actionLink);',
  "    const supabaseOrigin = new URL($('supabaseUrl').value.trim()).origin;",
  "    if (linkUrl.protocol !== 'https:' || linkUrl.origin !== supabaseOrigin) {",
  "      throw new Error('El enlace recibido no corresponde al proyecto Supabase configurado.');",
  '    }',
  "    $('inviteLink').value = actionLink;",
  "    $('inviteResultEmail').textContent = 'Invitación para ' + displayName + ' · ' + email;",
  "    const shareText = 'Hola ' + displayName + ', te comparto tu invitación individual para activar tu cuenta en HF Coach.\\n\\nAbrí este enlace, verificá tu invitación y definí una contraseña personal de al menos 10 caracteres:\\n' + actionLink + '\\n\\nEste enlace es personal y de un solo uso. No lo reenvíes.';",
  "    $('shareInviteWhatsApp').href = 'https://wa.me/?text=' + encodeURIComponent(shareText);",
  "    $('inviteResultPanel').hidden = false;",
  "    $('inviteForm').reset();",
  '    await loadData();',
  "    message('Enlace de activación generado para ' + email + '. Compartilo individualmente por WhatsApp o copiá el enlace.', 'success');",
  '  } catch (error) {',
  "    message('No se pudo generar la invitación: ' + (error.message || error) + '. Verificá que la URL de retorno de HF Central esté autorizada en Supabase Auth.', 'error');",
  '  }',
  '}',
  '',
  'async function copyInviteLink() {',
  "  const input = $('inviteLink');",
  "  if (!input.value) return;",
  '  try {',
  '    if (navigator.clipboard?.writeText) {',
  '      await navigator.clipboard.writeText(input.value);',
  '    } else {',
  '      input.focus();',
  '      input.select();',
  "      if (!document.execCommand('copy')) throw new Error('El navegador no permitió copiar automáticamente.');",
  '    }',
  "    $('inviteCopyStatus').textContent = 'Enlace copiado. Pegalo en una conversación privada con el coach.';",
  "    $('inviteCopyStatus').className = 'notice success-text';",
  '  } catch {',
  '    input.focus();',
  '    input.select();',
  "    $('inviteCopyStatus').textContent = 'No se pudo copiar automáticamente. Seleccioná el enlace y copialo manualmente.';",
  "    $('inviteCopyStatus').className = 'notice';",
  '  }',
  '}',
  ''
].join('\n');

app = app.slice(0, inviteStart) + manualInviteHandler + app.slice(inviteEnd);
if (!app.includes("$('copyInviteLink').addEventListener('click', copyInviteLink);")) {
  app = replaceRequired(
    app,
    "$('inviteForm').addEventListener('submit', inviteCoach);",
    "$('inviteForm').addEventListener('submit', inviteCoach);\n$('copyInviteLink').addEventListener('click', copyInviteLink);",
    'botón para copiar el enlace de invitación'
  );
}
fs.writeFileSync(appPath, app, 'utf8');

let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('id="inviteResultPanel"')) {
  const resultPanel = [
    '        <div id="inviteResultPanel" class="invite-result" hidden>',
    '          <div><h4>Enlace individual de activación generado</h4><p id="inviteResultEmail" class="muted"></p></div>',
    '          <label for="inviteLink">Enlace seguro de un solo uso</label>',
    '          <textarea id="inviteLink" rows="3" readonly aria-label="Enlace de activación"></textarea>',
    '          <div class="invite-actions">',
    '            <button id="copyInviteLink" type="button" class="quiet">Copiar enlace</button>',
    '            <a id="shareInviteWhatsApp" class="button-link" href="#" target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a>',
    '          </div>',
    '          <p id="inviteCopyStatus" class="notice" role="status" aria-live="polite"></p>',
    '          <p class="notice">Compartí este enlace únicamente con el coach destinatario y por un canal privado. Es personal y de un solo uso. Si vence o ya fue utilizado, generá una nueva invitación.</p>',
    '        </div>'
  ].join('\n');
  html = replaceRequired(
    html,
    '        </form>\n        <div id="coaches"',
    '        </form>\n' + resultPanel + '\n        <div id="coaches"',
    'panel de enlace de activación manual'
  );
}
fs.writeFileSync(htmlPath, html, 'utf8');

let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.invite-result{')) {
  css += [
    '',
    '.invite-result{border:1px solid #dce0df;background:#f8f9f8;border-radius:10px;padding:15px;margin:10px 0 18px}',
    '.invite-result h4{margin:0 0 6px;font-size:15px}',
    '.invite-result textarea{display:block;width:100%;margin:8px 0;resize:vertical;overflow-wrap:anywhere}',
    '.invite-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
    '.button-link{display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border:1px solid #c8372d;border-radius:7px;background:#c8372d;color:#fff;font-size:14px;font-weight:600;text-decoration:none}',
    '.button-link:hover{filter:brightness(.95)}',
    '.success-text{color:#245b35!important}',
    '@media(max-width:760px){.invite-actions{align-items:stretch;flex-direction:column}.invite-actions>*{width:100%;text-align:center}}',
    ''
  ].join('\n');
}
fs.writeFileSync(cssPath, css, 'utf8');

console.log('HF Central Stage 3: generación y distribución manual de enlaces de invitación aplicada.');
