import fs from "node:fs";
import path from "node:path";

const adminDir = path.resolve(".hf-central/admin");
const appPath = path.join(adminDir, "app.js");
const cssPath = path.join(adminDir, "styles.css");

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error("Role UI: no se encontró " + label);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

let app = fs.readFileSync(appPath, "utf8");

const roleFunction = [
"function setRoleBlockVisibility(element, visible) {",
"  if (!element) return;",
"  element.classList.toggle('hf-role-hidden', !visible);",
"  if (visible) element.removeAttribute('aria-hidden');",
"  else element.setAttribute('aria-hidden', 'true');",
"}",
"",
"function applyRoleBasedInterface() {",
"  if (currentRole !== 'admin' && currentRole !== 'coach') return;",
"  const dashboard = document.getElementById('dashboard');",
"  if (!dashboard) return;",
"  const isAdmin = currentRole === 'admin';",
"  document.body.dataset.hfRole = currentRole;",
"",
"  // Coach management and invitation controls are visible only to organization admins.",
"  const inviteForm = document.getElementById('inviteForm');",
"  const coachList = document.getElementById('coaches');",
"  const invitePanel = inviteForm ? (inviteForm.closest('.panel') || inviteForm.parentElement) : null;",
"  const coachPanel = coachList ? (coachList.closest('.panel') || coachList.parentElement) : null;",
"  setRoleBlockVisibility(invitePanel, isAdmin);",
"  setRoleBlockVisibility(coachPanel, isAdmin);",
"  setRoleBlockVisibility(document.getElementById('coachInvitationAdminPanel'), isAdmin);",
"",
"  // A coach should not see organization-wide coach-count metrics.",
"  const coachLabels = Array.from(dashboard.querySelectorAll('*')).filter(function (node) {",
"    return node.children.length === 0 && node.textContent.trim().toLowerCase() === 'coaches';",
"  });",
"  coachLabels.forEach(function (label) {",
"    const metric = label.closest('.stat, .stat-card, .metric-card, .summary-card, .kpi-card, .card');",
"    if (metric && metric !== dashboard) setRoleBlockVisibility(metric, isAdmin);",
"  });",
"",
"  // Keep the same underlying coach workspace, but name it according to the role.",
"  Array.from(dashboard.querySelectorAll('h1, h2, h3, h4')).forEach(function (heading) {",
"    if (heading.textContent.trim() === 'Vista de organización') {",
"      heading.textContent = isAdmin ? 'Vista de organización' : 'Mi espacio de trabajo';",
"    }",
"  });",
"",
"  const roleContext = document.getElementById('hfRoleContext');",
"  if (roleContext) {",
"    roleContext.textContent = isAdmin",
"      ? 'Administración de la organización HF Coach.'",
"      : 'Espacio de trabajo del coach. La información disponible corresponde a tus atletas y asignaciones.';",
"    setRoleBlockVisibility(roleContext, true);",
"  }",
"",
"  // The organization competition calendar is administered centrally. Coaches can record results only.",
"  const competitionForm = document.getElementById('competitionForm');",
"  if (competitionForm) {",
"    setRoleBlockVisibility(competitionForm, isAdmin);",
"    const competitionNotice = document.getElementById('competitionAdminOnlyNotice');",
"    if (competitionNotice) setRoleBlockVisibility(competitionNotice, !isAdmin);",
"  }",
"",
"  // The coach can register and manage their own athletes; coach assignment stays locked to self.",
"  const coachSelector = document.getElementById('newAthleteCoach');",
"  if (coachSelector) {",
"    coachSelector.disabled = !isAdmin;",
"    if (!isAdmin) coachSelector.value = '';",
"  }",
"",
"  // Make refresh and report actions explicit in the coach workspace.",
"  Array.from(dashboard.querySelectorAll('button, a')).forEach(function (control) {",
"    const text = control.textContent.trim();",
"    if (text === 'Actualizar datos') control.textContent = isAdmin ? 'Actualizar datos' : 'Actualizar mis datos';",
"    if (text === 'Imprimir informe') control.textContent = isAdmin ? 'Imprimir informe' : 'Imprimir informe de mis atletas';",
"  });",
"}",
""
].join("\n");

if (!app.includes("function applyRoleBasedInterface()")) {
  const signInAt = app.indexOf("async function signIn() {");
  if (signInAt < 0) throw new Error("Role UI: no se encontró signIn().");
  app = app.slice(0, signInAt) + roleFunction + app.slice(signInAt);
}

const signInStart = app.indexOf("async function signIn() {");
const loadStart = app.indexOf("async function loadData() {", signInStart);
if (signInStart < 0 || loadStart < 0) throw new Error("Role UI: no se pudo delimitar signIn().");
let signIn = app.slice(signInStart, loadStart);
if (!signIn.includes("await loadData(); return;")) {
  throw new Error("Role UI: no se encontró el punto posterior a la carga del panel.");
}
signIn = replaceOnce(signIn, "await loadData(); return;", "await loadData(); applyRoleBasedInterface(); return;", "carga del panel");
app = app.slice(0, signInStart) + signIn + app.slice(loadStart);
fs.writeFileSync(appPath, app, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(".hf-role-hidden{")) {
  css += [
    "",
    ".hf-role-hidden{display:none!important}",
    "#hfRoleContext{margin:8px 0 14px;padding:10px 14px;border-left:3px solid #b8c8c0;background:#eef4f0;color:#40584a;border-radius:4px;font-size:13px}",
    ".hf-role-notice{grid-column:1/-1;padding:10px 12px;background:#f4f5f5;border-radius:6px;color:#58635e;font-size:13px}",
    ""
  ].join("\n");
}
fs.writeFileSync(cssPath, css, "utf8");

let html = fs.readFileSync(path.join(adminDir, "index.html"), "utf8");
if (!html.includes('id="competitionAdminOnlyNotice"')) {
  const competitionFormMarker = 'id="competitionForm"';
  const competitionFormIndex = html.indexOf(competitionFormMarker);
  if (competitionFormIndex < 0) throw new Error("Role UI: no se encontró el formulario de competencias.");
  const formStart = html.lastIndexOf("<form", competitionFormIndex);
  if (formStart < 0) throw new Error("Role UI: no se encontró el inicio del formulario de competencias.");
  const notice = '<p id="competitionAdminOnlyNotice" class="hf-role-notice" hidden>El calendario de competencias lo administra la organización. Podés registrar resultados de tus atletas en el formulario de resultados.</p>\\n          ';
  html = html.slice(0, formStart) + notice + html.slice(formStart);
}
if (!html.includes('id="hfRoleContext"')) {
  const heading = '<h2>Vista de organización</h2>';
  if (html.includes(heading)) {
    html = html.replace(heading, heading + '\n        <p id="hfRoleContext" class="hf-role-context">Administración de la organización HF Coach.</p>');
  } else {
    const dashboardStart = html.indexOf('id="dashboard"');
    if (dashboardStart < 0) throw new Error("Role UI: no se encontró el contenedor dashboard.");
    const firstPanel = html.indexOf('class="panel"', dashboardStart);
    if (firstPanel < 0) throw new Error("Role UI: no se encontró un panel del dashboard.");
    const insertAt = html.indexOf(">", firstPanel) + 1;
    html = html.slice(0, insertAt) + '\n<p id="hfRoleContext" class="hf-role-context">Administración de la organización HF Coach.</p>' + html.slice(insertAt);
  }
}
fs.writeFileSync(path.join(adminDir, "index.html"), html, "utf8");

console.log("HF Central: interfaz diferenciada por rol admin/coach aplicada.");
