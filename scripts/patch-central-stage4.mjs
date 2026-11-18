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

const addon = String.raw