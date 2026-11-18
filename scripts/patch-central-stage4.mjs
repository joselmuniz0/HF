import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.hf-central/admin');
const htmlPath = path.join(dir, 'index.html');
const appPath = path.join(dir, 'app.js');
const cssPath = path.join(dir, 'styles.css');

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error('Stage 4: no se encontró ' + label);
  return source.replace(needle, replacement);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace('<h2>Ingreso de administración</h2>', '<h2>Ingreso a HF Coach</h2>');
html = html.replace(
  'Acceso al panel organizacional. La visibilidad de los datos se controla en Supabase mediante Row Level Security.',
  'Ingresá con tu correo habitual. Las funciones y los datos disponibles dependen de tu rol y de tu vinculación deportiva.'
);

const registration = [
'      <details id="athleteRegistration" class="registration-box">',
'        <summary>Crear cuenta de atleta</summary>',
'        <form id="athleteRegistrationForm" class="stack-form">',
'          <label>Nombre y apellido<input id="registerFullName" required minlength="2" maxlength="100"></label>',
'          <label>Correo habitual<input id="registerEmail" type="email" required autocomplete="email"></label>',
'          <label>Contraseña<input id="registerPassword" type="password" required minlength="10" autocomplete="new-password"></label>',
'          <button type="submit" class="primary">Registrarme</button>',
'        </form>',
'        <p id="registerStatus" class="notice" aria-live="polite">Después de confirmar tu correo podrás solicitar la vinculación con tu coach.</p>',
'      </details>'
].join('\n');
html = replaceOnce(html, '      <button id="loginBtn" class="primary">Ingresar</button>',
  '      <button id="loginBtn" class="primary">Ingresar</button>\n' + registration, 'botón de registro de atleta');

const desktopModules = [
'      <section class="panel" id="accessRequestsPanel">',
'        <div class="section-head"><div><h3>Solicitudes de vinculación</h3><p class="muted">Asociá una cuenta con una ficha deportiva existente.</p></div><button id="requestsRefresh" type="button">Actualizar</button></div>',
'        <div id="accessRequests"></div>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Alta de atleta</h3><p class="muted">La ficha deportiva se crea antes de activar la cuenta personal del atleta.</p></div></div>',
'        <form id="athleteCreateForm" class="data-form">',
'          <label>Nombre y apellido<input id="newAthleteName" required maxlength="120"></label>',
'          <label>Edad<input id="newAthleteAge" type="number" min="8" max="100"></label>',
'          <label>Nivel<select id="newAthleteLevel"><option value="initial">Inicial</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label>',
'          <label>Sexo (opcional)<select id="newAthleteSex"><option value="">Sin especificar</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option></select></label>',
'          <label>Fecha de nacimiento<input id="newAthleteBirth" type="date"></label>',
'          <label>Inicio deportivo<input id="newAthleteStart" type="date"></label>',
'          <label>Altura (cm)<input id="newAthleteHeight" type="number" min="50" max="250" step="0.1"></label>',
'          <label>Peso corporal (kg)<input id="newAthleteWeight" type="number" min="20" max="300" step="0.1"></label>',
'          <label>Arranque RM (kg)<input id="newAthleteSnatch" type="number" min="1" max="500" step="0.5"></label>',
'          <label>Envión RM (kg)<input id="newAthleteCJ" type="number" min="1" max="500" step="0.5"></label>',
'          <label>Coach responsable<select id="newAthleteCoach"></select></label>',
'          <label class="wide">Observaciones<textarea id="newAthleteNotes" rows="2"></textarea></label>',
'          <button type="submit" class="primary">Crear ficha deportiva</button>',
'        </form>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Métricas físicas y marcas</h3><p class="muted">Cada dato conserva fecha, autor y validación.</p></div></div>',
'        <div class="form-grid-two">',
'          <form id="measurementForm" class="stack-form"><h4>Nueva medición</h4>',
'            <label>Atleta<select id="measurementAthlete" required></select></label>',
'            <label>Indicador<select id="measurementKey"><option value="body_weight">Peso corporal</option><option value="height">Altura</option><option value="body_fat_percentage">Grasa corporal (%)</option><option value="waist_circumference">Cintura</option><option value="thigh_circumference">Muslo</option></select></label>',
'            <label>Valor<input id="measurementValue" type="number" min="0.1" step="0.01" required></label>',
'            <label>Unidad<select id="measurementUnit"><option value="kg">kg</option><option value="cm">cm</option><option value="%">%</option></select></label>',
'            <label>Fecha<input id="measurementDate" type="date"></label>',
'            <label>Observación<textarea id="measurementNotes" rows="2"></textarea></label>',
'            <button type="submit" class="primary">Guardar medición</button>',
'          </form>',
'          <form id="recordForm" class="stack-form"><h4>Nueva marca / RM</h4>',
'            <label>Atleta<select id="recordAthlete" required></select></label>',
'            <label>Ejercicio<input id="recordExercise" list="exerciseSuggestions" required></label>',
'            <datalist id="exerciseSuggestions"><option value="Snatch"><option value="Clean & Jerk"><option value="Back Squat"><option value="Front Squat"><option value="Deadlift"><option value="Clean Pull"><option value="Snatch Pull"></datalist>',
'            <label>Marca (kg)<input id="recordValue" type="number" min="1" step="0.5" required></label>',
'            <label>Fecha<input id="recordDate" type="date"></label>',
'            <label>Tipo<select id="recordType"><option value="tested">Probada</option><option value="estimated">Estimada</option><option value="competition">Competencia</option></select></label>',
'            <label>Observación<textarea id="recordNotes" rows="2"></textarea></label>',
'            <button type="submit" class="primary">Guardar marca</button>',
'          </form>',
'        </div>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Planificación de entrenamiento</h3><p class="muted">Plan, microciclo, sesión y prescripción de ejercicios.</p></div></div>',
'        <form id="planForm" class="data-form">',
'          <label>Atleta<select id="planAthlete" required></select></label>',
'          <label>Nombre del plan<input id="planName" required></label>',
'          <label>Objetivo<input id="planObjective"></label>',
'          <label>Fase<select id="planPhase"><option value="general_preparation">Preparación general</option><option value="specific_preparation">Preparación específica</option><option value="competition">Competencia</option><option value="transition">Transición</option></select></label>',
'          <label>Inicio<input id="planStart" type="date" required></label>',
'          <label>Finalización<input id="planEnd" type="date"></label>',
'          <label>Estado<select id="planStatus"><option value="draft">Borrador</option><option value="active">Activo</option></select></label>',
'          <label>Primera sesión<input id="planSessionTitle" placeholder="Día 1 - Fuerza"></label>',
'          <label>Semana<input id="planWeek" type="number" min="1" value="1"></label>',
'          <label>Día (1 a 7)<input id="planDay" type="number" min="1" max="7" value="1"></label>',
'          <label>Ejercicio inicial<input id="planExercise" placeholder="Back Squat"></label>',
'          <label>Series<input id="planSets" type="number" min="1" max="30"></label>',
'          <label>Repeticiones<input id="planReps" placeholder="5x3"></label>',
'          <label>Carga (kg)<input id="planLoad" type="number" min="0.5" step="0.5"></label>',
'          <label>% RM<input id="planPercent" type="number" min="1" max="200" step="0.5"></label>',
'          <label>RPE objetivo<input id="planRpe" type="number" min="1" max="10" step="0.5"></label>',
'          <label class="wide">Notas<textarea id="planNotes" rows="2"></textarea></label>',
'          <button type="submit" class="primary">Crear planificación</button>',
'        </form><div id="plansList" class="table-wrap"></div>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Torneos y resultados</h3><p class="muted">Historial competitivo con intentos y total olímpico.</p></div></div>',
'        <div class="form-grid-two">',
'          <form id="competitionForm" class="stack-form"><h4>Nuevo torneo</h4>',
'            <label>Nombre<input id="competitionName" required></label><label>Fecha<input id="competitionDate" type="date" required></label>',
'            <label>Ciudad<input id="competitionCity"></label><label>Federación<input id="competitionFederation"></label>',
'            <button type="submit" class="primary">Guardar torneo</button>',
'          </form>',
'          <form id="competitionResultForm" class="stack-form"><h4>Resultado de atleta</h4>',
'            <label>Torneo<select id="resultCompetition" required></select></label><label>Atleta<select id="resultAthlete" required></select></label>',
'            <label>Peso de competencia (kg)<input id="resultWeight" type="number" min="20" step="0.1"></label>',
'            <label>Categoría de peso<input id="resultCategory"></label>',
'            <label>Mejor arranque (kg)<input id="resultSnatch" type="number" min="0.5" step="0.5"></label>',
'            <label>Mejor envión (kg)<input id="resultCJ" type="number" min="0.5" step="0.5"></label>',
'            <label>Posición<input id="resultPlace" type="number" min="1"></label>',
'            <button type="submit" class="primary">Guardar resultado</button>',
'          </form>',
'        </div>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Bitácora deportiva</h3><p class="muted">Avances, retrocesos, observaciones y decisiones del proceso.</p></div></div>',
'        <form id="journalForm" class="data-form">',
'          <label>Atleta<select id="journalAthlete" required></select></label><label>Tipo de evento<input id="journalType" required placeholder="progreso, dificultad, observación"></label>',
'          <label>Título<input id="journalTitle" required></label><label>Visibilidad<select id="journalVisibility"><option value="shared">Compartido</option><option value="coach_only">Solo coach y administración</option></select></label>',
'          <label class="wide">Detalle<textarea id="journalDescription" rows="3"></textarea></label>',
'          <button type="submit" class="primary">Agregar a la bitácora</button>',
'        </form><div id="journalList" class="table-wrap"></div>',
'      </section>',
'      <section class="panel">',
'        <div class="section-head"><div><h3>Exportación de métricas</h3><p class="muted">CSV para Excel, Google Sheets, Python y Power BI. Se respetan los permisos del usuario.</p></div></div>',
'        <form id="csvForm" class="inline-form">',
'          <label>Conjunto de datos<select id="csvDataset"><option value="athletes">Atletas</option><option value="measurements">Mediciones</option><option value="records">Marcas y RM</option><option value="plans">Planificaciones</option><option value="sessions">Sesiones</option><option value="competitions">Resultados competitivos</option><option value="evaluations">Videoanálisis</option><option value="journal">Bitácora</option></select></label>',
'          <label>Desde<input id="csvFrom" type="date"></label><label>Hasta<input id="csvTo" type="date"></label><button type="submit" class="primary">Descargar CSV</button>',
'        </form>',
'      </section>'
].join('\n');
html = replaceOnce(html, '      <p class="footer-note">', desktopModules + '\n      <p class="footer-note">', 'módulos deportivos');

const athletePanels = [
'    <section id="athleteAccessPanel" class="panel login-panel" hidden>',
'      <h2>Vinculación con tu coach</h2><p>Tu correo está registrado. Indicá el correo habitual del coach que te entrena. Tu solicitud deberá ser aprobada.</p>',
'      <form id="athleteAccessForm" class="stack-form">',
'        <label>Nombre y apellido<input id="accessFullName" required minlength="2" maxlength="100"></label>',
'        <label>Correo del coach<input id="accessCoachEmail" type="email" required></label>',
'        <label>Mensaje opcional<textarea id="accessMessage" rows="2"></textarea></label>',
'        <button type="submit" class="primary">Solicitar vinculación</button>',
'      </form><p id="accessStatus" class="status" role="status" aria-live="polite"></p><div id="ownRequests"></div>',
'      <button id="accessLogoutBtn" type="button" class="quiet">Cerrar sesión</button>',
'    </section>',
'    <section id="athleteDashboard" class="athlete-portal" hidden>',
'      <div class="toolbar"><div><h2>Mi historia deportiva</h2><p id="athletePortalSub" class="muted">HF Coach</p></div><div class="actions"><button id="athleteRefreshBtn" type="button">Actualizar</button><button id="athleteLogoutBtn" type="button" class="quiet">Cerrar sesión</button></div></div>',
'      <div id="athletePortalStatus" class="status" role="status" aria-live="polite"></div><div id="athleteSummary" class="stats"></div>',
'      <section class="panel"><h3>Mi planificación</h3><div id="athletePlans"></div></section>',
'      <section class="panel"><h3>Mis videoanálisis y correcciones</h3><div id="athleteEvaluations"></div></section>',
'      <section class="panel"><h3>Mi evolución</h3><div id="athleteTimeline"></div></section>',
'      <section class="panel"><h3>Registrar información propia</h3><p class="muted">Las marcas y mediciones que declares quedan pendientes de validación del coach.</p>',
'        <div class="form-grid-two">',
'          <form id="athleteMeasurementForm" class="stack-form"><h4>Nueva medición</h4><label>Indicador<select id="selfMetric"><option value="body_weight">Peso corporal</option><option value="height">Altura</option></select></label><label>Valor<input id="selfMetricValue" type="number" min="0.1" step="0.01" required></label><label>Unidad<select id="selfMetricUnit"><option value="kg">kg</option><option value="cm">cm</option></select></label><button type="submit" class="primary">Enviar medición</button></form>',
'          <form id="athleteRecordForm" class="stack-form"><h4>Nueva marca personal</h4><label>Ejercicio<input id="selfRecordExercise" required></label><label>Marca (kg)<input id="selfRecordValue" type="number" min="1" step="0.5" required></label><label>Fecha<input id="selfRecordDate" type="date"></label><button type="submit" class="primary">Enviar marca</button></form>',
'        </div>',
'        <form id="athleteVideoForm" class="stack-form"><h4>Enviar video al coach</h4><label>Video<input id="athleteVideo" type="file" accept="video/*" required></label><label>Descripción<textarea id="athleteVideoNotes" rows="2"></textarea></label><button type="submit" class="primary">Subir video privado</button></form>',
'      </section>',
'    </section>'
].join('\n');
html = replaceOnce(html, '  </main>', athletePanels + '\n  </main>', 'paneles del atleta');
fs.writeFileSync(htmlPath, html, 'utf8');

let css = fs.readFileSync(cssPath, 'utf8');
css += [
'', '.registration-box{margin-top:16px;padding-top:12px;border-top:1px solid #ddd}',
'.registration-box summary{cursor:pointer;font-weight:650}',
'.stack-form,.data-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end}',
'.stack-form{grid-template-columns:1fr}',
'.stack-form label,.data-form label{display:flex;flex-direction:column;gap:5px}',
'.data-form .wide{grid-column:1/-1}',
'.stack-form input,.stack-form select,.stack-form textarea,.data-form input,.data-form select,.data-form textarea{width:100%;min-width:0}',
'.form-grid-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}',
'.access-request{display:grid;grid-template-columns:1fr minmax(180px,260px) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #e5e8e6}',
'.athlete-portal{max-width:1100px;margin:24px auto;padding:0 18px 40px}',
'.athlete-portal .panel{margin:16px 0}',
'.timeline-row{padding:12px 0;border-bottom:1px solid #e5e8e6}',
'.timeline-row small,.subtle{color:#68736f}',
'.inline-form{display:flex;gap:14px;align-items:end;flex-wrap:wrap}',
'.inline-form label{display:flex;flex-direction:column;gap:5px;min-width:150px}',
'@media(max-width:760px){.data-form,.form-grid-two{grid-template-columns:1fr}.access-request{grid-template-columns:1fr}.inline-form{align-items:stretch;flex-direction:column}.inline-form>*{width:100%}.athlete-portal{padding:0 12px 30px}}',
''
].join('\n');
fs.writeFileSync(cssPath, css, 'utf8');

let app = fs.readFileSync(appPath, 'utf8');
app = replaceOnce(app,
  'let data = { memberships: [], coaches: [], athletes: [], evaluations: [], sessions: [] };',
  'let data = { memberships: [], coaches: [], athletes: [], evaluations: [], sessions: [], accessRequests: [], measurements: [], records: [], plans: [], planSessions: [], planItems: [], competitions: [], athleteCompetitions: [], journal: [] };\nlet currentUserId = null;\nlet currentRole = null;\nlet athleteAccount = null;\nlet athletePortalData = {};',
  'estado de datos');
const signInStart = app.indexOf('async function signIn() {');
const loadStart = app.indexOf('async function loadData() {', signInStart);
if (signInStart < 0 || loadStart < 0) throw new Error('Stage 4: no se encontró el inicio de sesión existente.');
const signIn = [
'async function signIn() {',
'  try {',
'    const sb = getClient();',
"    const { data: auth, error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });",
'    if (error) throw error;',
'    currentUserId = auth.user.id;',
"    $('password').value = '';",
'    const { data: memberships, error: memberError } = await sb.from("organization_memberships").select("organization_id,role").eq("user_id", auth.user.id).in("role", ["admin","coach"]);',
'    if (memberError) throw memberError;',
"    $('loginPanel').hidden = true; $('dashboard').hidden = true; $('athleteDashboard').hidden = true; $('athleteAccessPanel').hidden = true;",
'    if (memberships && memberships.length) {',
'      currentRole = memberships.some(m => m.role === "admin") ? "admin" : "coach";',
'      const membership = memberships.find(m => m.role === currentRole) || memberships[0];',
'      organizationId = membership.organization_id;',
'      const { data: org, error: orgError } = await sb.from("organizations").select("name").eq("id", organizationId).maybeSingle();',
'      if (orgError) throw orgError;',
'      organizationName = org?.name || "HF Coach";',
"      $('sessionLabel').textContent = auth.user.email + ' · ' + currentRole;",
"      $('dashboard').hidden = false; $('orgLabel').textContent = organizationName + ' · ' + auth.user.email + ' · ' + currentRole;",
'      await loadData(); return;',
'    }',
'    const { data: links, error: linkError } = await sb.from("athlete_accounts").select("organization_id,athlete_id,account_status").eq("user_id", auth.user.id).eq("account_status","active").limit(1);',
'    if (linkError) throw linkError;',
'    if (links && links.length) {',
'      athleteAccount = links[0]; organizationId = athleteAccount.organization_id; currentRole = "athlete";',
"      $('sessionLabel').textContent = auth.user.email + ' · atleta'; $('athleteDashboard').hidden = false;",
'      await loadAthletePortal(); return;',
'    }',
'    currentRole = "unlinked";',
"    $('sessionLabel').textContent = auth.user.email + ' · sin vinculación'; $('athleteAccessPanel').hidden = false;",
"    $('accessFullName').value = auth.user.user_metadata?.full_name || '';",
'    await loadOwnRequests();',
'  } catch (error) { message(error.message || String(error), "error"); }',
'}',
''
].join('\n');
app = app.slice(0, signInStart) + signIn + app.slice(loadStart);

app = replaceOnce(app,
  '    data.sessions = sessions.data || [];',
  [
'    data.sessions = sessions.data || [];',
'    const extra = await Promise.all([',
'      sb.from("athlete_access_requests").select("*").eq("organization_id", organizationId),',
'      sb.from("athlete_measurements").select("*").eq("organization_id", organizationId),',
'      sb.from("athlete_personal_records").select("*").eq("organization_id", organizationId),',
'      sb.from("training_plans").select("*").eq("organization_id", organizationId),',
'      sb.from("training_plan_sessions").select("*").eq("organization_id", organizationId),',
'      sb.from("training_plan_items").select("*").eq("organization_id", organizationId),',
'      sb.from("competitions").select("*").eq("organization_id", organizationId),',
'      sb.from("athlete_competitions").select("*").eq("organization_id", organizationId),',
'      sb.from("athlete_journal_entries").select("*").eq("organization_id", organizationId)',
'    ]);',
'    for (const item of extra) if (item.error) throw item.error;',
'    [data.accessRequests,data.measurements,data.records,data.plans,data.planSessions,data.planItems,data.competitions,data.athleteCompetitions,data.journal] = extra.map(x => x.data || []);'
  ].join('\n'),
  'consultas longitudinales');
app = replaceOnce(app, '  renderSessions();', '  renderSessions();\n  renderOperationalModules();', 'renderización de módulos');

const addon = "\nfunction refreshOperationalSelects() {\n  const opts = data.athletes.map(function(a) {\n    return '<option value=\"' + esc(a.id) + '\">' + esc(a.full_name) + '</option>';\n  }).join(\"\");\n  [\"measurementAthlete\",\"recordAthlete\",\"planAthlete\",\"resultAthlete\",\"journalAthlete\"].forEach(function(id) {\n    const el = $(id); if (el) el.innerHTML = opts;\n  });\n  const competitions = (data.competitions || []).map(function(c) {\n    return '<option value=\"' + esc(c.id) + '\">' + esc(c.name) + ' · ' + date(c.competition_date) + '</option>';\n  }).join(\"\");\n  if ($(\"resultCompetition\")) $(\"resultCompetition\").innerHTML = competitions;\n  if ($(\"newAthleteCoach\")) {\n    const coaches = data.memberships.filter(function(m){ return m.role === \"coach\"; }).map(function(m) {\n      const p = data.coaches.find(function(c){ return c.user_id === m.user_id; });\n      return '<option value=\"' + esc(m.user_id) + '\">' + esc(p && p.display_name || p && p.email || \"Coach\") + '</option>';\n    }).join(\"\");\n    $(\"newAthleteCoach\").innerHTML = '<option value=\"\">Asignarme a mí</option>' + coaches;\n    $(\"newAthleteCoach\").disabled = currentRole !== \"admin\";\n  }\n}\nfunction renderOperationalModules() {\n  refreshOperationalSelects();\n  const requestRows = (data.accessRequests || []).filter(function(r){ return r.status === \"pending\"; });\n  $(\"accessRequests\").innerHTML = requestRows.map(function(r) {\n    const coach = data.coaches.find(function(c){ return c.user_id === r.requested_coach_id; });\n    const athleteOptions = data.athletes.map(function(a) {\n      return '<option value=\"' + esc(a.id) + '\">' + esc(a.full_name) + '</option>';\n    }).join(\"\");\n    return '<div class=\"access-request\"><div><b>' + esc(r.requested_full_name) + '</b><div class=\"subtle\">' +\n      esc(r.requested_email) + ' · Coach: ' + esc(coach && (coach.display_name || coach.email) || \"—\") +\n      '</div><small>' + esc(r.message || \"Sin mensaje\") + '</small></div>' +\n      '<select data-request-athlete=\"' + esc(r.id) + '\"><option value=\"\">Elegir ficha deportiva…</option>' +\n      athleteOptions + '</select><button type=\"button\" class=\"primary\" data-approve-request=\"' +\n      esc(r.id) + '\">Aprobar y vincular</button></div>';\n  }).join(\"\") || '<div class=\"empty\">No hay solicitudes pendientes.</div>';\n\n  $(\"plansList\").innerHTML = (data.plans || []).map(function(p) {\n    const athlete = data.athletes.find(function(a){ return a.id === p.athlete_id; });\n    const sessions = data.planSessions.filter(function(s){ return s.plan_id === p.id; });\n    return '<div class=\"timeline-row\"><b>' + esc(p.name) + '</b> · ' +\n      esc(athlete && athlete.full_name || \"Atleta\") + ' · ' + esc(p.status) +\n      '<div class=\"subtle\">' + date(p.start_date) + ' – ' + date(p.end_date) +\n      ' · ' + esc(p.objective || \"\") + '</div>' +\n      sessions.map(function(s) {\n        return '<div>' + esc(s.session_title) + ' · semana ' + esc(s.week_number) +\n          ' · día ' + esc(s.day_number) + '</div>' +\n          data.planItems.filter(function(i){ return i.plan_session_id === s.id; }).map(function(i) {\n            return '<small>' + esc(i.exercise_name_snapshot) + ' · ' + esc(i.sets || \"—\") +\n              ' x ' + esc(i.reps || \"—\") + ' · ' +\n              esc(i.target_load_kg || i.target_percent_rm || \"—\") + '</small>';\n          }).join(\"\");\n      }).join(\"\") + '</div>';\n  }).join(\"\") || '<div class=\"empty\">No hay planificaciones registradas.</div>';\n\n  $(\"journalList\").innerHTML = (data.journal || []).slice().sort(function(a,b) {\n    return new Date(b.occurred_at) - new Date(a.occurred_at);\n  }).slice(0,50).map(function(j) {\n    const athlete = data.athletes.find(function(a){ return a.id === j.athlete_id; });\n    return '<div class=\"timeline-row\"><b>' + esc(j.title) + '</b> · ' +\n      esc(athlete && athlete.full_name || \"Atleta\") +\n      '<div class=\"subtle\">' + date(j.occurred_at) + ' · ' +\n      esc(j.actor_type) + ' · ' + esc(j.visibility) + '</div><div>' +\n      esc(j.description || \"\") + '</div></div>';\n  }).join(\"\") || '<div class=\"empty\">La bitácora todavía no tiene registros.</div>';\n}\nfunction downloadOperationalCsv(dataset, from, to) {\n  const collections = {\n    athletes: data.athletes,\n    measurements: data.measurements,\n    records: data.records,\n    plans: data.plans,\n    sessions: data.sessions,\n    competitions: (data.athleteCompetitions || []).map(function(r) {\n      const comp = data.competitions.find(function(c){ return c.id === r.competition_id; });\n      return Object.assign({}, r, { competition_name: comp && comp.name || \"\" });\n    }),\n    evaluations: data.evaluations,\n    journal: data.journal\n  };\n  const rows = (collections[dataset] || []).filter(function(r) {\n    const field = {\n      athletes:\"created_at\", measurements:\"measured_at\", records:\"record_date\",\n      plans:\"start_date\", sessions:\"session_date\", competitions:\"created_at\",\n      evaluations:\"created_at\", journal:\"occurred_at\"\n    }[dataset];\n    const value = r[field] ? String(r[field]).slice(0,10) : \"\";\n    return (!from || !value || value >= from) && (!to || !value || value <= to);\n  });\n  if (!rows.length) throw new Error(\"No hay datos para exportar con esos filtros.\");\n  const keys = Array.from(new Set(rows.reduce(function(all,row) {\n    return all.concat(Object.keys(row));\n  }, [])));\n  const quote = function(value) {\n    if (value === null || value === undefined) return '\"\"';\n    const plain = typeof value === \"object\" ? JSON.stringify(value) : String(value);\n    return '\"' + plain.replace(/\"/g, '\"\"') + '\"';\n  };\n  const csv = [keys.map(quote).join(\",\"), ...rows.map(function(row) {\n    return keys.map(function(key){ return quote(row[key]); }).join(\",\");\n  })].join(\"\\r\\n\");\n  const blob = new Blob([\"\\ufeff\" + csv], {type:\"text/csv;charset=utf-8\"});\n  const url = URL.createObjectURL(blob);\n  const link = document.createElement(\"a\");\n  link.href = url;\n  link.download = \"hf-coach-\" + dataset + \"-\" + new Date().toISOString().slice(0,10) + \".csv\";\n  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);\n}\nasync function loadAthleteOwnRequests() {\n  const result = await getClient().from(\"athlete_access_requests\")\n    .select(\"id,status,created_at,review_note\").eq(\"requested_by\", currentUserId)\n    .order(\"created_at\", {ascending:false});\n  if (result.error) throw result.error;\n  $(\"ownRequests\").innerHTML = (result.data || []).map(function(r) {\n    return '<div class=\"timeline-row\">Solicitud <b>' + esc(r.status) +\n      '</b> · ' + date(r.created_at) +\n      (r.review_note ? '<div>' + esc(r.review_note) + '</div>' : '') + '</div>';\n  }).join(\"\") || '<p class=\"muted\">Todavía no enviaste una solicitud.</p>';\n}\nasync function registerAthleteAccount(event) {\n  event.preventDefault();\n  const status = $(\"registerStatus\");\n  try {\n    const result = await getClient().auth.signUp({\n      email: $(\"registerEmail\").value.trim(),\n      password: $(\"registerPassword\").value,\n      options: {\n        data: { full_name: $(\"registerFullName\").value.trim() },\n        emailRedirectTo: window.location.origin\n      }\n    });\n    if (result.error) throw result.error;\n    status.textContent = result.data.session\n      ? \"Cuenta creada. Ingresá para solicitar la vinculación con tu coach.\"\n      : \"Cuenta creada. Para ingresar primero tenés que confirmar el correo. La entrega del mensaje depende de la configuración SMTP de HF Coach.\";\n    status.className = \"notice success-text\";\n    $(\"athleteRegistrationForm\").reset();\n  } catch(error) {\n    status.textContent = error.message || String(error);\n    status.className = \"notice\";\n  }\n}\nasync function sendAthleteAccessRequest(event) {\n  event.preventDefault();\n  try {\n    $(\"accessStatus\").textContent = \"Enviando solicitud…\";\n    const cfg = window.HF_CENTRAL_CONFIG || {};\n    const orgId = cfg.organizationId || \"9775ad25-b866-4fa3-bd80-6244e9f8e972\";\n    const result = await getClient().functions.invoke(\"request-athlete-access\", {\n      body: {\n        organization_id: orgId,\n        coach_email: $(\"accessCoachEmail\").value.trim(),\n        full_name: $(\"accessFullName\").value.trim(),\n        message: $(\"accessMessage\").value.trim()\n      }\n    });\n    if (result.error) throw result.error;\n    if (result.data && result.data.error) throw new Error(result.data.error);\n    $(\"accessStatus\").textContent = \"Solicitud enviada. Tu coach debe aprobarla y vincular la cuenta con tu ficha.\";\n    $(\"accessStatus\").className = \"status success\";\n    await loadAthleteOwnRequests();\n  } catch(error) {\n    $(\"accessStatus\").textContent = error.message || String(error);\n    $(\"accessStatus\").className = \"status error\";\n  }\n}\nasync function approveAthleteAccount(event) {\n  const button = event.target.closest(\"[data-approve-request]\");\n  if (!button) return;\n  const requestId = button.dataset.approveRequest;\n  const select = document.querySelector('[data-request-athlete=\"' + requestId + '\"]');\n  if (!select || !select.value) return message(\"Seleccioná la ficha existente que corresponde al atleta.\", \"error\");\n  button.disabled = true;\n  try {\n    const result = await getClient().functions.invoke(\"approve-athlete-access\", {\n      body: { request_id: requestId, athlete_id: select.value }\n    });\n    if (result.error) throw result.error;\n    if (result.data && result.data.error) throw new Error(result.data.error);\n    await loadData();\n    message(\"Cuenta vinculada con \" + result.data.athlete_name + \".\", \"success\");\n  } catch(error) {\n    button.disabled = false;\n    message(\"No se pudo aprobar la solicitud: \" + (error.message || error), \"error\");\n  }\n}\nasync function createAthleteProfile(event) {\n  event.preventDefault();\n  let athleteId = null;\n  try {\n    const insert = await getClient().from(\"athletes\").insert({\n      organization_id: organizationId,\n      owner_coach_id: currentUserId,\n      full_name: $(\"newAthleteName\").value.trim(),\n      age: $(\"newAthleteAge\").value ? Number($(\"newAthleteAge\").value) : null,\n      level: $(\"newAthleteLevel\").value,\n      sex: $(\"newAthleteSex\").value || null,\n      body_weight_kg: $(\"newAthleteWeight\").value ? Number($(\"newAthleteWeight\").value) : null,\n      snatch_kg: $(\"newAthleteSnatch\").value ? Number($(\"newAthleteSnatch\").value) : null,\n      clean_jerk_kg: $(\"newAthleteCJ\").value ? Number($(\"newAthleteCJ\").value) : null,\n      notes: $(\"newAthleteNotes\").value.trim() || null\n    }).select(\"id\").single();\n    if (insert.error) throw insert.error;\n    athleteId = insert.data.id;\n\n    const profile = await getClient().from(\"athlete_profiles\").insert({\n      athlete_id: athleteId,\n      organization_id: organizationId,\n      date_of_birth: $(\"newAthleteBirth\").value || null,\n      sporting_start_date: $(\"newAthleteStart\").value || null,\n      created_by: currentUserId,\n      updated_by: currentUserId\n    });\n    if (profile.error) throw profile.error;\n\n    const timestamp = new Date().toISOString();\n    const measurements = [];\n    if ($(\"newAthleteWeight\").value) measurements.push({\n      organization_id:organizationId, athlete_id:athleteId, metric_key:\"body_weight\",\n      metric_value:Number($(\"newAthleteWeight\").value), unit:\"kg\",\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:timestamp\n    });\n    if ($(\"newAthleteHeight\").value) measurements.push({\n      organization_id:organizationId, athlete_id:athleteId, metric_key:\"height\",\n      metric_value:Number($(\"newAthleteHeight\").value), unit:\"cm\",\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:timestamp\n    });\n    if (measurements.length) {\n      const mr = await getClient().from(\"athlete_measurements\").insert(measurements);\n      if (mr.error) throw mr.error;\n    }\n\n    const records = [];\n    if ($(\"newAthleteSnatch\").value) records.push({\n      organization_id:organizationId, athlete_id:athleteId,\n      exercise_name_snapshot:\"Snatch\", record_value_kg:Number($(\"newAthleteSnatch\").value),\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:timestamp\n    });\n    if ($(\"newAthleteCJ\").value) records.push({\n      organization_id:organizationId, athlete_id:athleteId,\n      exercise_name_snapshot:\"Clean & Jerk\", record_value_kg:Number($(\"newAthleteCJ\").value),\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:timestamp\n    });\n    if (records.length) {\n      const rr = await getClient().from(\"athlete_personal_records\").insert(records);\n      if (rr.error) throw rr.error;\n    }\n\n    const selectedCoach = $(\"newAthleteCoach\").value;\n    if (currentRole === \"admin\" && selectedCoach && selectedCoach !== currentUserId) {\n      const assignment = await getClient().from(\"coach_athletes\").insert({\n        organization_id:organizationId, athlete_id:athleteId,\n        coach_id:selectedCoach, assigned_by:currentUserId\n      });\n      if (assignment.error) throw assignment.error;\n    }\n    $(\"athleteCreateForm\").reset();\n    await loadData();\n    message(\"Ficha creada y datos iniciales guardados en el historial.\", \"success\");\n  } catch(error) {\n    message(\"No se pudo completar el alta\" + (athleteId ? \"; la ficha \" + athleteId + \" quedó creada y requiere revisión\" : \"\") + \": \" + (error.message || error), \"error\");\n  }\n}\nasync function addAthleteMeasurement(event) {\n  event.preventDefault();\n  try {\n    const measuredAt = $(\"measurementDate\").value\n      ? new Date($(\"measurementDate\").value + \"T12:00:00\").toISOString()\n      : new Date().toISOString();\n    const result = await getClient().from(\"athlete_measurements\").insert({\n      organization_id:organizationId, athlete_id:$(\"measurementAthlete\").value,\n      metric_key:$(\"measurementKey\").value, metric_value:Number($(\"measurementValue\").value),\n      unit:$(\"measurementUnit\").value, measured_at:measuredAt,\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:new Date().toISOString(),\n      notes:$(\"measurementNotes\").value.trim() || null\n    });\n    if (result.error) throw result.error;\n    $(\"measurementForm\").reset(); await loadData();\n    message(\"Medición guardada con fecha y autor.\", \"success\");\n  } catch(error) { message(\"No se pudo guardar la medición: \" + (error.message || error), \"error\"); }\n}\nasync function addAthletePersonalRecord(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"athlete_personal_records\").insert({\n      organization_id:organizationId, athlete_id:$(\"recordAthlete\").value,\n      exercise_name_snapshot:$(\"recordExercise\").value.trim(),\n      record_value_kg:Number($(\"recordValue\").value),\n      record_date:$(\"recordDate\").value || new Date().toISOString().slice(0,10),\n      record_type:$(\"recordType\").value, recorded_by:currentUserId,\n      validation_status:\"validated\", validated_by:currentUserId,\n      validated_at:new Date().toISOString(), notes:$(\"recordNotes\").value.trim() || null\n    });\n    if (result.error) throw result.error;\n    $(\"recordForm\").reset(); await loadData();\n    message(\"Marca guardada en el historial.\", \"success\");\n  } catch(error) { message(\"No se pudo guardar la marca: \" + (error.message || error), \"error\"); }\n}\nasync function createAthleteTrainingPlan(event) {\n  event.preventDefault();\n  let planId = null;\n  try {\n    const result = await getClient().from(\"training_plans\").insert({\n      organization_id:organizationId, athlete_id:$(\"planAthlete\").value,\n      name:$(\"planName\").value.trim(), objective:$(\"planObjective\").value.trim() || null,\n      training_phase:$(\"planPhase\").value, start_date:$(\"planStart\").value,\n      end_date:$(\"planEnd\").value || null, status:$(\"planStatus\").value,\n      created_by:currentUserId, notes:$(\"planNotes\").value.trim() || null\n    }).select(\"id\").single();\n    if (result.error) throw result.error;\n    planId = result.data.id;\n    const title = $(\"planSessionTitle\").value.trim();\n    if (title) {\n      const sr = await getClient().from(\"training_plan_sessions\").insert({\n        organization_id:organizationId, athlete_id:$(\"planAthlete\").value, plan_id:planId,\n        week_number:Number($(\"planWeek\").value || 1), day_number:Number($(\"planDay\").value || 1),\n        session_title:title, scheduled_date:$(\"planStart\").value\n      }).select(\"id\").single();\n      if (sr.error) throw sr.error;\n      const exercise = $(\"planExercise\").value.trim();\n      if (exercise) {\n        const ir = await getClient().from(\"training_plan_items\").insert({\n          organization_id:organizationId, athlete_id:$(\"planAthlete\").value,\n          plan_session_id:sr.data.id, sequence_number:1, exercise_name_snapshot:exercise,\n          sets:$(\"planSets\").value ? Number($(\"planSets\").value) : null,\n          reps:$(\"planReps\").value.trim() || null,\n          target_load_kg:$(\"planLoad\").value ? Number($(\"planLoad\").value) : null,\n          target_percent_rm:$(\"planPercent\").value ? Number($(\"planPercent\").value) : null,\n          target_rpe:$(\"planRpe\").value ? Number($(\"planRpe\").value) : null\n        });\n        if (ir.error) throw ir.error;\n      }\n    }\n    $(\"planForm\").reset(); await loadData();\n    message(\"Planificación creada.\", \"success\");\n  } catch(error) {\n    message(\"Error al crear el plan\" + (planId ? \"; el plan quedó creado y puede requerir completar la sesión\" : \"\") + \": \" + (error.message || error), \"error\");\n  }\n}\nasync function createAthleteCompetition(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"competitions\").insert({\n      organization_id:organizationId, name:$(\"competitionName\").value.trim(),\n      competition_date:$(\"competitionDate\").value, city:$(\"competitionCity\").value.trim() || null,\n      federation:$(\"competitionFederation\").value.trim() || null, created_by:currentUserId\n    });\n    if (result.error) throw result.error;\n    $(\"competitionForm\").reset(); await loadData();\n    message(\"Torneo registrado.\", \"success\");\n  } catch(error) { message(\"No se pudo registrar el torneo: \" + (error.message || error), \"error\"); }\n}\nasync function addAthleteCompetitionResult(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"athlete_competitions\").insert({\n      organization_id:organizationId, athlete_id:$(\"resultAthlete\").value,\n      competition_id:$(\"resultCompetition\").value,\n      body_weight_kg:$(\"resultWeight\").value ? Number($(\"resultWeight\").value) : null,\n      weight_category:$(\"resultCategory\").value.trim() || null,\n      best_snatch_kg:$(\"resultSnatch\").value ? Number($(\"resultSnatch\").value) : null,\n      best_clean_jerk_kg:$(\"resultCJ\").value ? Number($(\"resultCJ\").value) : null,\n      placement:$(\"resultPlace\").value ? Number($(\"resultPlace\").value) : null,\n      recorded_by:currentUserId, validation_status:\"validated\",\n      validated_by:currentUserId, validated_at:new Date().toISOString()\n    });\n    if (result.error) throw result.error;\n    $(\"competitionResultForm\").reset(); await loadData();\n    message(\"Resultado competitivo guardado.\", \"success\");\n  } catch(error) { message(\"No se pudo guardar el resultado: \" + (error.message || error), \"error\"); }\n}\nasync function addAthleteJournalEntry(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"athlete_journal_entries\").insert({\n      organization_id:organizationId, athlete_id:$(\"journalAthlete\").value,\n      event_type:$(\"journalType\").value.trim(), title:$(\"journalTitle\").value.trim(),\n      description:$(\"journalDescription\").value.trim() || null,\n      author_id:currentUserId, actor_type:currentRole,\n      visibility:$(\"journalVisibility\").value\n    });\n    if (result.error) throw result.error;\n    $(\"journalForm\").reset(); await loadData();\n    message(\"Evento agregado a la bitácora.\", \"success\");\n  } catch(error) { message(\"No se pudo agregar el evento: \" + (error.message || error), \"error\"); }\n}\nasync function loadAthletePortal() {\n  try {\n    $(\"athletePortalStatus\").textContent = \"Cargando tu historia deportiva…\";\n    const id = athleteAccount.athlete_id;\n    const sb = getClient();\n    const queries = await Promise.all([\n      sb.from(\"athletes\").select(\"*\").eq(\"id\",id).maybeSingle(),\n      sb.from(\"athlete_profiles\").select(\"*\").eq(\"athlete_id\",id).maybeSingle(),\n      sb.from(\"athlete_measurements\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"athlete_personal_records\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"training_plans\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"training_plan_sessions\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"training_plan_items\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"evaluations\").select(\"*\").eq(\"athlete_id\",id).order(\"created_at\",{ascending:false}),\n      sb.from(\"interventions\").select(\"*\").eq(\"athlete_id\",id).order(\"created_at\",{ascending:false}),\n      sb.from(\"athlete_competitions\").select(\"*\").eq(\"athlete_id\",id),\n      sb.from(\"athlete_journal_entries\").select(\"*\").eq(\"athlete_id\",id).order(\"occurred_at\",{ascending:false}),\n      sb.from(\"training_sessions\").select(\"*\").eq(\"athlete_id\",id)\n    ]);\n    for (const q of queries) if (q.error) throw q.error;\n    athletePortalData = {\n      athlete:queries[0].data, profile:queries[1].data, measurements:queries[2].data || [],\n      records:queries[3].data || [], plans:queries[4].data || [],\n      planSessions:queries[5].data || [], planItems:queries[6].data || [],\n      evaluations:queries[7].data || [], interventions:queries[8].data || [],\n      competitions:queries[9].data || [], journal:queries[10].data || [],\n      sessions:queries[11].data || []\n    };\n    renderAthletePortal();\n    $(\"athletePortalStatus\").textContent = \"Información sincronizada.\";\n    $(\"athletePortalStatus\").className = \"status success\";\n  } catch(error) {\n    $(\"athletePortalStatus\").textContent = \"No se pudo cargar la información: \" + (error.message || error);\n    $(\"athletePortalStatus\").className = \"status error\";\n  }\n}\nfunction renderAthletePortal() {\n  const d = athletePortalData;\n  const athlete = d.athlete || {};\n  $(\"athletePortalSub\").textContent = athlete.full_name || \"Perfil deportivo\";\n  const latest = function(key) {\n    return d.measurements.filter(function(m){ return m.metric_key === key; })\n      .sort(function(a,b){ return new Date(b.measured_at) - new Date(a.measured_at); })[0];\n  };\n  const best = function(pattern) {\n    return d.records.filter(function(r){ return pattern.test(r.exercise_name_snapshot); })\n      .sort(function(a,b){ return new Date(b.record_date) - new Date(a.record_date); })[0];\n  };\n  const weight = latest(\"body_weight\");\n  const snatch = best(/snatch|arranque/i);\n  const cj = best(/clean|jerk|envion/i);\n  $(\"athleteSummary\").innerHTML = [\n    [\"Peso corporal\", weight ? weight.metric_value : athlete.body_weight_kg || \"—\", \"kg\"],\n    [\"Arranque\", snatch ? snatch.record_value_kg : athlete.snatch_kg || \"—\", \"kg\"],\n    [\"Envión\", cj ? cj.record_value_kg : athlete.clean_jerk_kg || \"—\", \"kg\"],\n    [\"Planes\", d.plans.length, \"\"]\n  ].map(function(x) {\n    return '<div class=\"stat\"><div class=\"value\">' + esc(x[1]) + ' ' + esc(x[2]) +\n      '</div><div class=\"label\">' + esc(x[0]) + '</div></div>';\n  }).join(\"\");\n\n  $(\"athletePlans\").innerHTML = d.plans.map(function(p) {\n    const sessions = d.planSessions.filter(function(s){ return s.plan_id === p.id; });\n    return '<div class=\"timeline-row\"><b>' + esc(p.name) + '</b> · ' + esc(p.status) +\n      '<div class=\"subtle\">' + date(p.start_date) + ' – ' + date(p.end_date) +\n      ' · ' + esc(p.objective || \"\") + '</div>' + sessions.map(function(s) {\n        return '<div>' + esc(s.session_title) + ' · semana ' + esc(s.week_number) +\n          ' · día ' + esc(s.day_number) + '</div>' +\n          d.planItems.filter(function(i){ return i.plan_session_id === s.id; }).map(function(i) {\n            return '<small>' + esc(i.exercise_name_snapshot) + ' · ' + esc(i.sets || \"—\") +\n              ' series · ' + esc(i.reps || \"—\") + ' · ' +\n              esc(i.target_load_kg || i.target_percent_rm || \"—\") + '</small>';\n          }).join(\"\");\n      }).join(\"\") + '</div>';\n  }).join(\"\") || '<div class=\"empty\">Todavía no tenés planificaciones.</div>';\n\n  $(\"athleteEvaluations\").innerHTML = d.evaluations.map(function(e) {\n    const intervention = d.interventions.find(function(i){ return i.evaluation_id === e.id; });\n    return '<div class=\"timeline-row\"><b>' + esc(e.lift) + ' · ' + date(e.created_at) +\n      '</b><div class=\"subtle\">Estado: ' + esc(e.review_status) + '</div><p>' +\n      esc(e.coach_feedback || \"El coach todavía no publicó una devolución.\") + '</p>' +\n      (intervention ? '<div><b>Seguimiento:</b> ' + esc(intervention.problem_identified) +\n        ' · ' + esc(intervention.objective || \"\") +\n        (intervention.reassessment_date ? ' · Reevaluación: ' + date(intervention.reassessment_date) : '') +\n        '</div>' : '') + '</div>';\n  }).join(\"\") || '<div class=\"empty\">Todavía no hay evaluaciones publicadas.</div>';\n\n  const measurements = d.measurements.map(function(m) {\n    return { occurred_at:m.measured_at, title:m.metric_key + \": \" + m.metric_value + \" \" + m.unit,\n      description:\"Validación: \" + m.validation_status, actor_type:\"medición\" };\n  });\n  const timeline = d.journal.concat(measurements).sort(function(a,b) {\n    return new Date(b.occurred_at) - new Date(a.occurred_at);\n  });\n  $(\"athleteTimeline\").innerHTML = timeline.slice(0,100).map(function(e) {\n    return '<div class=\"timeline-row\"><b>' + esc(e.title) + '</b><div class=\"subtle\">' +\n      date(e.occurred_at) + ' · ' + esc(e.actor_type || \"\") + '</div><div>' +\n      esc(e.description || \"\") + '</div></div>';\n  }).join(\"\") || '<div class=\"empty\">La bitácora todavía no tiene registros.</div>';\n}\nasync function submitAthleteMeasurement(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"athlete_measurements\").insert({\n      organization_id:organizationId, athlete_id:athleteAccount.athlete_id,\n      metric_key:$(\"selfMetric\").value, metric_value:Number($(\"selfMetricValue\").value),\n      unit:$(\"selfMetricUnit\").value, recorded_by:currentUserId,\n      validation_status:\"pending_validation\"\n    });\n    if (result.error) throw result.error;\n    $(\"athleteMeasurementForm\").reset(); await loadAthletePortal();\n  } catch(error) { $(\"athletePortalStatus\").textContent = \"No se pudo enviar la medición: \" + (error.message || error); }\n}\nasync function submitAthleteRecord(event) {\n  event.preventDefault();\n  try {\n    const result = await getClient().from(\"athlete_personal_records\").insert({\n      organization_id:organizationId, athlete_id:athleteAccount.athlete_id,\n      exercise_name_snapshot:$(\"selfRecordExercise\").value.trim(),\n      record_value_kg:Number($(\"selfRecordValue\").value),\n      record_date:$(\"selfRecordDate\").value || new Date().toISOString().slice(0,10),\n      record_type:\"tested\", recorded_by:currentUserId,\n      validation_status:\"pending_validation\"\n    });\n    if (result.error) throw result.error;\n    $(\"athleteRecordForm\").reset(); await loadAthletePortal();\n  } catch(error) { $(\"athletePortalStatus\").textContent = \"No se pudo enviar la marca: \" + (error.message || error); }\n}\nasync function uploadAthleteVideo(event) {\n  event.preventDefault();\n  const file = $(\"athleteVideo\").files && $(\"athleteVideo\").files[0];\n  if (!file) return;\n  if (file.size > 100 * 1024 * 1024) {\n    $(\"athletePortalStatus\").textContent = \"El video supera el límite de 100 MB.\"; return;\n  }\n  if (![\"video/mp4\",\"video/quicktime\",\"video/webm\"].includes(file.type)) {\n    $(\"athletePortalStatus\").textContent = \"Formato no admitido. Usá MP4, MOV o WEBM.\"; return;\n  }\n  try {\n    $(\"athletePortalStatus\").textContent = \"Subiendo video al almacenamiento privado…\";\n    const safeName = file.name.replace(/[^a-z0-9._-]/gi, \"_\").slice(-80);\n    const objectPath = organizationId + \"/\" + athleteAccount.athlete_id + \"/\" + Date.now() + \"-\" + safeName;\n    const upload = await getClient().storage.from(\"athlete-media\").upload(objectPath, file, {\n      contentType:file.type, upsert:false\n    });\n    if (upload.error) throw upload.error;\n    const meta = await getClient().from(\"media_assets\").insert({\n      organization_id:organizationId, athlete_id:athleteAccount.athlete_id,\n      uploaded_by:currentUserId, object_path:objectPath, file_name:file.name,\n      mime_type:file.type, size_bytes:file.size\n    });\n    if (meta.error) throw meta.error;\n    const note = $(\"athleteVideoNotes\").value.trim();\n    if (note) {\n      const jr = await getClient().from(\"athlete_journal_entries\").insert({\n        organization_id:organizationId, athlete_id:athleteAccount.athlete_id,\n        event_type:\"video_upload_note\", title:\"Observación al enviar video\",\n        description:note, author_id:currentUserId, actor_type:\"athlete\", visibility:\"shared\"\n      });\n      if (jr.error) throw jr.error;\n    }\n    $(\"athleteVideoForm\").reset();\n    $(\"athletePortalStatus\").textContent = \"Video cargado de forma privada. Tu coach podrá revisarlo.\";\n    await loadAthletePortal();\n  } catch(error) {\n    $(\"athletePortalStatus\").textContent = \"No se pudo cargar el video: \" + (error.message || error);\n  }\n}\nasync function logoutHF() {\n  try { if (supabase) await supabase.auth.signOut(); }\n  finally {\n    currentRole = null; currentUserId = null; athleteAccount = null; organizationId = null;\n    $(\"dashboard\").hidden = true; $(\"athleteDashboard\").hidden = true;\n    $(\"athleteAccessPanel\").hidden = true; $(\"loginPanel\").hidden = false;\n    $(\"sessionLabel\").textContent = \"Sin sesión\";\n  }\n}\n";

app = replaceOnce(app, "$('loginBtn').addEventListener('click', signIn);",
  addon + "\n" + "$('loginBtn').addEventListener('click', signIn);",
  'lógica operativa de HF Central');
app = replaceOnce(app,
  '    data.sessions = sessions.data || [];',
  [
    '    data.sessions = sessions.data || [];',
    '    const extra = await Promise.all([',
    '      sb.from("athlete_access_requests").select("*").eq("organization_id", organizationId),',
    '      sb.from("athlete_measurements").select("*").eq("organization_id", organizationId),',
    '      sb.from("athlete_personal_records").select("*").eq("organization_id", organizationId),',
    '      sb.from("training_plans").select("*").eq("organization_id", organizationId),',
    '      sb.from("training_plan_sessions").select("*").eq("organization_id", organizationId),',
    '      sb.from("training_plan_items").select("*").eq("organization_id", organizationId),',
    '      sb.from("competitions").select("*").eq("organization_id", organizationId),',
    '      sb.from("athlete_competitions").select("*").eq("organization_id", organizationId),',
    '      sb.from("athlete_journal_entries").select("*").eq("organization_id", organizationId),',
    '      sb.from("interventions").select("*").eq("organization_id", organizationId),',
    '      sb.from("media_assets").select("*").eq("organization_id", organizationId)',
    '    ]);',
    '    for (const item of extra) if (item.error) throw item.error;',
    '    [data.accessRequests,data.measurements,data.records,data.plans,data.planSessions,data.planItems,data.competitions,data.athleteCompetitions,data.journal,data.interventions,data.media] = extra.map(x => x.data || []);'
  ].join("\n"),
  'carga de datos longitudinales');
app = replaceOnce(app,
  '  renderSessions();',
  '  renderSessions();\n  renderOperationalModules();',
  'render de módulos longitudinales');
app = replaceOnce(app,
  'let data = { memberships: [], coaches: [], athletes: [], evaluations: [], sessions: [] };',
  'let data = { memberships: [], coaches: [], athletes: [], evaluations: [], sessions: [], accessRequests: [], measurements: [], records: [], plans: [], planSessions: [], planItems: [], competitions: [], athleteCompetitions: [], journal: [], interventions: [], media: [] };\nlet currentUserId = null;\nlet currentRole = null;\nlet athleteAccount = null;\nlet athletePortalData = {};',
  'estado de sesión y colecciones');
app = replaceOnce(app,
  "$('logoutBtn').addEventListener('click', async () => { if (supabase) await supabase.auth.signOut(); organizationId = null; $('dashboard').hidden = true; $('loginPanel').hidden = false; $('sessionLabel').textContent = 'Sin sesión'; });",
  "$('logoutBtn').addEventListener('click', logoutHF);\n$('accessLogoutBtn').addEventListener('click', logoutHF);\n$('athleteLogoutBtn').addEventListener('click', logoutHF);\n$('athleteRefreshBtn').addEventListener('click', loadAthletePortal);\n$('requestsRefresh').addEventListener('click', loadData);\n$('accessRequests').addEventListener('click', approveAthleteAccount);\n$('athleteRegistrationForm').addEventListener('submit', registerAthleteAccount);\n$('athleteAccessForm').addEventListener('submit', sendAthleteAccessRequest);\n$('athleteCreateForm').addEventListener('submit', createAthleteProfile);\n$('measurementForm').addEventListener('submit', addAthleteMeasurement);\n$('recordForm').addEventListener('submit', addAthletePersonalRecord);\n$('planForm').addEventListener('submit', createAthleteTrainingPlan);\n$('competitionForm').addEventListener('submit', createAthleteCompetition);\n$('competitionResultForm').addEventListener('submit', addAthleteCompetitionResult);\n$('journalForm').addEventListener('submit', addAthleteJournalEntry);\n$('csvForm').addEventListener('submit', function(e){ e.preventDefault(); try { downloadOperationalCsv($('csvDataset').value,$('csvFrom').value,$('csvTo').value); } catch(error) { message(error.message || String(error),'error'); } });\n$('athleteMeasurementForm').addEventListener('submit', submitAthleteMeasurement);\n$('athleteRecordForm').addEventListener('submit', submitAthleteRecord);\n$('athleteVideoForm').addEventListener('submit', uploadAthleteVideo);",
  'eventos de los módulos longitudinales');
app = replaceOnce(app,
  "    const { data: memberships, error: memberError } = await sb.from('organization_memberships')\n      .select('organization_id,role').eq('user_id', auth.user.id).eq('role', 'admin');",
  "    currentUserId = auth.user.id;\n    const { data: memberships, error: memberError } = await sb.from('organization_memberships')\n      .select('organization_id,role').eq('user_id', auth.user.id).in('role', ['admin','coach']);",
  'acceso para admin y coach');
app = replaceOnce(app,
  "    if (!memberships?.length) {\n      await sb.auth.signOut();\n      throw new Error('Esta cuenta no tiene rol de administrador en ninguna organización HF Coach.');\n    }\n    organizationId = memberships[0].organization_id;",
  "    if (memberships?.length) {\n      currentRole = memberships.some(m => m.role === 'admin') ? 'admin' : 'coach';\n      organizationId = memberships.find(m => m.role === currentRole).organization_id;\n      const { data: org, error: orgError } = await sb.from('organizations').select('name').eq('id', organizationId).maybeSingle();\n      if (orgError) throw orgError;\n      organizationName = org?.name || 'HF Coach';\n      $('sessionLabel').textContent = auth.user.email + ' · ' + currentRole;\n      $('loginPanel').hidden = true; $('dashboard').hidden = false;\n      $('orgLabel').textContent = organizationName + ' · ' + auth.user.email + ' · ' + currentRole;\n      $('inviteForm').hidden = currentRole !== 'admin';\n      await loadData();\n      return;\n    }\n    const { data: links, error: linkError } = await sb.from('athlete_accounts').select('organization_id,athlete_id,account_status').eq('user_id',auth.user.id).eq('account_status','active').limit(1);\n    if (linkError) throw linkError;\n    if (links?.length) {\n      athleteAccount = links[0]; organizationId = athleteAccount.organization_id; currentRole = 'athlete';\n      $('sessionLabel').textContent = auth.user.email + ' · atleta'; $('loginPanel').hidden = true; $('athleteDashboard').hidden = false;\n      await loadAthletePortal(); return;\n    }\n    currentRole = 'unlinked';\n    $('sessionLabel').textContent = auth.user.email + ' · pendiente de vinculación';\n    $('loginPanel').hidden = true; $('athleteAccessPanel').hidden = false;\n    $('accessFullName').value = auth.user.user_metadata?.full_name || '';\n    await loadAthleteOwnRequests();",
  'ruteo del usuario por rol');
app = app.replace(
  "    $('sessionLabel').textContent = auth.user.email;\n    $('loginPanel').hidden = true;\n    $('dashboard').hidden = false;\n    $('orgLabel').textContent = `${organizationName} · ${auth.user.email}`;\n    await loadData();",
  ""
);
if (!app.includes('loadAthletePortal') || !app.includes('downloadOperationalCsv') || !app.includes('approveAthleteAccount')) {
  throw new Error('Stage 4: la lógica nueva no quedó incluida en app.js.');
}
fs.writeFileSync(appPath, app, 'utf8');
console.log('HF Central Stage 4: lógica Javascript de roles, atletas, planificación, competencia, bitácora y CSV aplicada.');
