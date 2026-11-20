import fs from "node:fs";
import path from "node:path";

const adminDir = path.resolve(".hf-central/admin");
const appPath = path.join(adminDir, "app.js");
const htmlPath = path.join(adminDir, "index.html");
const cssPath = path.join(adminDir, "styles.css");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error("No se encontró el punto de inserción esperado: " + label);
  return source.replace(search, replacement);
}

let html = fs.readFileSync(htmlPath, "utf8");
const formStart = html.indexOf('<form id="planForm"');
const formEnd = formStart >= 0 ? html.indexOf("</form>", formStart) : -1;
if (formStart < 0 || formEnd < 0) {
  throw new Error("Planificación: no se encontró el formulario planForm.");
}
const planningForm = [
  '<form id="planForm" class="data-form plan-form">',
  '  <label>Atleta<select id="planAthlete" required></select></label>',
  '  <label>Nombre del plan<input id="planName" required minlength="2" placeholder="Preparación general · ciclo 1"></label>',
  '  <label>Objetivo<input id="planObjective" placeholder="Fuerza, técnica, potencia, competencia…"></label>',
  '  <label>Fase<select id="planPhase"><option value="general_preparation">Preparación general</option><option value="specific_preparation">Preparación específica</option><option value="competition">Competencia</option><option value="transition">Transición</option></select></label>',
  '  <label>Inicio<input id="planStart" type="date" required></label>',
  '  <label>Finalización<input id="planEnd" type="date"></label>',
  '  <label>Estado<select id="planStatus"><option value="draft">Borrador</option><option value="active">Activo</option></select></label>',
  '  <div class="plan-builder-intro wide"><h4>Sesiones de entrenamiento</h4><p>Agregá cada jornada del plan. Dentro de cada jornada podés incorporar todos los ejercicios necesarios y definir series, repeticiones, %RM y kg para cada uno.</p></div>',
  '  <div id="planSessionBuilder" class="plan-session-builder wide"></div>',
  '  <button type="button" id="addPlanSessionBtn" class="quiet wide">+ Agregar día de entrenamiento</button>',
  '  <label class="wide">Notas generales del plan<textarea id="planNotes" rows="3" placeholder="Criterios del ciclo, observaciones y pautas generales…"></textarea></label>',
  '  <button type="submit" class="primary wide">Guardar planificación completa</button>',
  '</form>'
].join("\n");
html = html.slice(0, formStart) + planningForm + html.slice(formEnd + "</form>".length);
fs.writeFileSync(htmlPath, html, "utf8");

let app = fs.readFileSync(appPath, "utf8");
const plannerMatch = app.match(/(?:async\s+)?function\s+createAthleteTrainingPlan\s*\(event\)\s*\{/);
if (!plannerMatch) throw new Error("Planificación: no se encontró createAthleteTrainingPlan.");
const plannerStart = plannerMatch.index;
const competitionStart = app.indexOf("async function createAthleteCompetition(event)", plannerStart);
if (competitionStart < 0) throw new Error("Planificación: no se encontró el final del controlador de planes.");

const plannerCode = [
  "function hfPlanOptionalNumber(value, label, minimum) {",
  "  const raw = String(value == null ? '' : value).trim();",
  "  if (!raw) return null;",
  "  const number = Number(raw);",
  "  if (!Number.isFinite(number) || (minimum != null && number < minimum)) throw new Error(label + ' no es válido.');",
  "  return number;",
  "}",
  "",
  "function hfPlanExerciseMarkup() {",
  "  return [",
  "    '<div class=\"plan-exercise-row\" data-plan-exercise>',",
  "    '  <div class=\"plan-exercise-row-head\"><strong data-plan-exercise-number>Ejercicio</strong><button type=\"button\" class=\"quiet\" data-plan-remove-exercise>Quitar</button></div>',",
  "    '  <div class=\"plan-exercise-grid\">',",
  "    '    <label class=\"plan-exercise-name-field\">Ejercicio<input type=\"text\" data-plan-exercise-name required placeholder=\"Ej. Snatch, Back Squat, Clean Pull…\"></label>',",
  "    '    <label>Series<input type=\"number\" data-plan-sets min=\"1\" max=\"100\" step=\"1\" required placeholder=\"5\"></label>',",
  "    '    <label>Repeticiones<input type=\"text\" data-plan-reps required placeholder=\"3 / 2+1 / 3-2-1\"></label>',",
  "    '    <label>% RM<input type=\"number\" data-plan-percent min=\"0.1\" max=\"200\" step=\"0.5\" placeholder=\"80\"></label>',",
  "    '    <label>Carga (kg)<input type=\"number\" data-plan-load min=\"0.1\" step=\"0.5\" placeholder=\"80\"></label>',",
  "    '    <label>RPE objetivo<input type=\"number\" data-plan-rpe min=\"1\" max=\"10\" step=\"0.5\" placeholder=\"8\"></label>',",
  "    '    <label>Descanso (s)<input type=\"number\" data-plan-rest min=\"0\" max=\"3600\" step=\"15\" placeholder=\"180\"></label>',",
  "    '    <label>Tempo<input type=\"text\" data-plan-tempo placeholder=\"3-1-X\"></label>',",
  "    '    <label class=\"plan-exercise-notes\">Notas del ejercicio<input type=\"text\" data-plan-item-notes placeholder=\"Pausa, variante, observaciones…\"></label>',",
  "    '  </div>',",
  "  '</div>'",
  "  ].join('');",
  "}",
  "",
  "function hfPlanRefreshSessionCard(card) {",
  "  const builder = document.getElementById('planSessionBuilder');",
  "  Array.from(builder.querySelectorAll('[data-plan-session]')).forEach(function(session, index) {",
  "    const number = session.querySelector('[data-plan-session-number]');",
  "    if (number) number.textContent = String(index + 1);",
  "    Array.from(session.querySelectorAll('[data-plan-exercise]')).forEach(function(row, exerciseIndex) {",
  "      const label = row.querySelector('[data-plan-exercise-number]');",
  "      if (label) label.textContent = 'Ejercicio ' + (exerciseIndex + 1);",
  "    });",
  "    const count = session.querySelectorAll('[data-plan-exercise]').length;",
  "    '  <span class="plan-session-count" data-plan-session-count>0 ejercicios</span>',",
  "    if (countNode) countNode.textContent = count + (count === 1 ? ' ejercicio' : ' ejercicios');",
  "  });",
  "}",
  "",
  "function hfPlanAddExercise(sessionCard) {",
  "  const list = sessionCard.querySelector('[data-plan-exercises]');",
  "  list.insertAdjacentHTML('beforeend', hfPlanExerciseMarkup());",
  "  hfPlanRefreshSessionCard(sessionCard);",
  "}",
  "",
  "function hfPlanAddSession() {",
  "  const builder = document.getElementById('planSessionBuilder');",
  "  const count = builder.querySelectorAll('[data-plan-session]').length;",
  "  const day = (count % 7) + 1;",
  "  const card = document.createElement('section');",
  "  card.className = 'plan-session-card';",
  "  card.setAttribute('data-plan-session', '');",
  "  card.innerHTML = [",
  "    '<div class=\"plan-session-head\">',",
  "    '  <h4>Jornada <span data-plan-session-number></span></h4>',",
  "  <span class=\"plan-session-count\" data-plan-session-count>0 ejercicios</span>',",
  "    '  <button type=\"button\" class=\"quiet\" data-plan-remove-session>Quitar día</button>',",
  "    '</div>',",
  "    '<div class=\"plan-session-grid\">',",
  "    '  <label>Semana<input type=\"number\" data-plan-week min=\"1\" max=\"104\" step=\"1\" value=\"1\" required></label>',",
  "    '  <label>Día<select data-plan-day required><option value=\"1\">Día 1</option><option value=\"2\">Día 2</option><option value=\"3\">Día 3</option><option value=\"4\">Día 4</option><option value=\"5\">Día 5</option><option value=\"6\">Día 6</option><option value=\"7\">Día 7</option></select></label>',",
  "    '  <label>Fecha (opcional)<input type=\"date\" data-plan-date></label>',",
  "    '  <label>Título de la jornada<input type=\"text\" data-plan-title required placeholder=\"Día de fuerza · Técnica de arranque\"></label>',",
  "    '  <label class=\"plan-session-focus\">Enfoque<input type=\"text\" data-plan-focus placeholder=\"Fuerza máxima, velocidad, técnica…\"></label>',",
  "    '  <label class=\"plan-session-notes\">Notas de la jornada<input type=\"text\" data-plan-session-notes placeholder=\"Indicaciones generales para esta sesión…\"></label>',",
  "    '</div>',",
  "    '<div class=\"plan-exercise-list\" data-plan-exercises></div>',",
  "    '<button type=\"button\" class=\"quiet plan-add-exercise\" data-plan-add-exercise>+ Agregar ejercicio a este día</button>',",
  "  ].join('');",
  "  card.querySelector('[data-plan-day]').value = String(day);",
  "  card.querySelector('[data-plan-title]').value = 'Día ' + day;",
  "  builder.appendChild(card);",
  "  hfPlanAddExercise(card);",
  "  hfPlanRefreshSessionCard(card);",
  "}",
  "",
  "function hfPlanBuilderClick(event) {",
  "  const removeSession = event.target.closest('[data-plan-remove-session]');",
  "  if (removeSession) {",
  "    const card = removeSession.closest('[data-plan-session]');",
  "    if (card) card.remove();",
  "    if (!document.querySelector('#planSessionBuilder [data-plan-session]')) hfPlanAddSession();",
  "    hfPlanRefreshSessionCard();",
  "    return;",
  "  }",
  "  const addExercise = event.target.closest('[data-plan-add-exercise]');",
  "  if (addExercise) { hfPlanAddExercise(addExercise.closest('[data-plan-session]')); return; }",
  "  const removeExercise = event.target.closest('[data-plan-remove-exercise]');",
  "  if (removeExercise) {",
  "    const session = removeExercise.closest('[data-plan-session]');",
  "    const row = removeExercise.closest('[data-plan-exercise]');",
  "    if (row) row.remove();",
  "    if (session && !session.querySelector('[data-plan-exercise]')) hfPlanAddExercise(session);",
  "    hfPlanRefreshSessionCard(session);",
  "  }",
  "}",
  "",
  "function hfPlanResetBuilder() {",
  "  const builder = document.getElementById('planSessionBuilder');",
  "  if (!builder) return;",
  "  builder.innerHTML = '';",
  "  hfPlanAddSession();",
  "}",
  "",
  "function hfPlanCollectSessions() {",
  "  const cards = Array.from(document.querySelectorAll('#planSessionBuilder [data-plan-session]'));",
  "  if (!cards.length) throw new Error('Agregá al menos un día de entrenamiento.');",
  "  const usedSlots = new Set();",
  "  return cards.map(function(card, sessionIndex) {",
  "    const get = function(selector) { const node = card.querySelector(selector); return node ? node.value.trim() : ''; };",
  "    const week = hfPlanOptionalNumber(get('[data-plan-week]'), 'La semana', 1);",
  "    const day = hfPlanOptionalNumber(get('[data-plan-day]'), 'El día', 1);",
  "    if (!week || !day || day > 7 || !Number.isInteger(week) || !Number.isInteger(day)) throw new Error('Revisá la semana y el día de la jornada ' + (sessionIndex + 1) + '.');",
  "    const slot = week + '-' + day;",
  "    if (usedSlots.has(slot)) throw new Error('Hay dos jornadas asignadas a la misma semana y día. Cambiá uno de los días.');",
  "    usedSlots.add(slot);",
  "    const title = get('[data-plan-title]');",
  "    if (!title) throw new Error('La jornada ' + (sessionIndex + 1) + ' necesita un título.');",
  "    const exercises = Array.from(card.querySelectorAll('[data-plan-exercise]')).map(function(row, exerciseIndex) {",
  "      const value = function(selector) { const node = row.querySelector(selector); return node ? node.value.trim() : ''; };",
  "      const name = value('[data-plan-exercise-name]');",
  "      if (!name) throw new Error('Completá el nombre del ejercicio ' + (exerciseIndex + 1) + ' de ' + title + '.');",
  "      const sets = hfPlanOptionalNumber(value('[data-plan-sets]'), 'Las series de ' + name, 1);",
  "      const reps = value('[data-plan-reps]');",
  "      if (!sets || !Number.isInteger(sets)) throw new Error('Indicá un número entero de series para ' + name + '.');",
  "      if (!reps) throw new Error('Indicá las repeticiones para ' + name + '.');",
  "      const percent = hfPlanOptionalNumber(value('[data-plan-percent]'), 'El porcentaje de ' + name, 0.1);",
  "      const load = hfPlanOptionalNumber(value('[data-plan-load]'), 'La carga en kg de ' + name, 0.1);",
  "      const rpe = hfPlanOptionalNumber(value('[data-plan-rpe]'), 'El RPE de ' + name, 1);",
  "      const rest = hfPlanOptionalNumber(value('[data-plan-rest]'), 'El descanso de ' + name, 0);",
  "      if (percent != null && percent > 200) throw new Error('El porcentaje de RM de ' + name + ' no puede superar 200%.');",
  "      if (rpe != null && rpe > 10) throw new Error('El RPE de ' + name + ' debe estar entre 1 y 10.');",
  "      if (rest != null && !Number.isInteger(rest)) throw new Error('El descanso de ' + name + ' debe expresarse en segundos enteros.');",
  "      return {",
  "        exercise_name: name, sets: sets, reps: reps,",
  "        target_percent_rm: percent, target_load_kg: load, target_rpe: rpe,",
  "        rest_seconds: rest, tempo: value('[data-plan-tempo]') || null,",
  "        notes: value('[data-plan-item-notes]') || null, prescription: {}",
  "      };",
  "    });",
  "    if (!exercises.length) throw new Error('Agregá al menos un ejercicio en ' + title + '.');",
  "    return {",
  "      week_number: week, day_number: day, session_order: 1,",
  "      scheduled_date: get('[data-plan-date]') || null, session_title: title,",
  "      focus: get('[data-plan-focus]') || null, notes: get('[data-plan-session-notes]') || null,",
  "      exercises: exercises",
  "    };",
  "  });",
  "}",
  "",
  "async function createAthleteTrainingPlan(event) {",
  "  event.preventDefault();",
  "  const submitButton = document.querySelector('#planForm button[type=\"submit\"]');",
  "  if (submitButton) submitButton.disabled = true;",
  "  try {",
  "    const sessions = hfPlanCollectSessions();",
  "    const athleteId = document.getElementById('planAthlete').value;",
  "    if (!athleteId) throw new Error('Seleccioná el atleta.');",
  "    const startDate = document.getElementById('planStart').value;",
  "    const endDate = document.getElementById('planEnd').value || null;",
  "    if (endDate && endDate < startDate) throw new Error('La finalización no puede ser anterior al inicio.');",
  "    const exerciseCount = sessions.reduce(function(total, session) { return total + session.exercises.length; }, 0);",
  "    const result = await getClient().rpc('create_training_plan_atomic', {",
  "      p_athlete_id: athleteId, p_name: document.getElementById('planName').value.trim(),",
  "      p_objective: document.getElementById('planObjective').value.trim() || null,",
  "      p_training_phase: document.getElementById('planPhase').value, p_start_date: startDate,",
  "      p_end_date: endDate, p_status: document.getElementById('planStatus').value,",
  "      p_notes: document.getElementById('planNotes').value.trim() || null, p_sessions: sessions",
  "    });",
  "    if (result.error) throw result.error;",
  "    document.getElementById('planForm').reset();",
  "    hfPlanResetBuilder();",
  "    await loadData();",
  "    message('Planificación guardada: ' + sessions.length + ' jornadas y ' + exerciseCount + ' ejercicios.', 'success');",
  "  } catch (error) {",
  "    message('No se pudo guardar la planificación: ' + (error.message || error), 'error');",
  "  } finally {",
  "    if (submitButton) submitButton.disabled = false;",
  "  }",
  "}",
  "",
  "function hfPlanItemSummary(item) {",
  "  const prescription = [];",
  "  if (item.target_percent_rm != null) prescription.push(esc(item.target_percent_rm) + '% RM');",
  "  if (item.target_load_kg != null) prescription.push(esc(item.target_load_kg) + ' kg');",
  "  if (item.target_rpe != null) prescription.push('RPE ' + esc(item.target_rpe));",
  "  if (item.rest_seconds != null) prescription.push(esc(item.rest_seconds) + ' s descanso');",
  "  if (item.tempo) prescription.push('Tempo ' + esc(item.tempo));",
  "  const loadText = prescription.length ? prescription.join(' · ') : 'Carga libre / no consignada';",
  "  return '<div class=\"plan-item-line\"><b>' + esc(item.exercise_name_snapshot) + '</b> · ' +",
  "    esc(item.sets) + ' series x ' + esc(item.reps) + ' · ' + loadText +",
  "    (item.notes ? ' · ' + esc(item.notes) : '') + '</div>';",
  "}",
].join("\n");

app = app.slice(0, plannerStart) + plannerCode + "\n\n" + app.slice(competitionStart);

const planListener = "$('planForm').addEventListener('submit', createAthleteTrainingPlan);";
const planListeners = [
  planListener,
  "$('addPlanSessionBtn').addEventListener('click', hfPlanAddSession);",
  "$('planSessionBuilder').addEventListener('click', hfPlanBuilderClick);",
  "hfPlanResetBuilder();"
].join("\n");
if (!app.includes("hfPlanResetBuilder();")) {
  app = replaceRequired(app, planListener, planListeners, "controles del creador de sesiones");
}

const coachSummary = [
  "return '<small>' + esc(i.exercise_name_snapshot) + ' · ' + esc(i.sets || \"—\") +",
  "              ' x ' + esc(i.reps || \"—\") + ' · ' +",
  "              esc(i.target_load_kg || i.target_percent_rm || \"—\") + '</small>';"
].join("\n");
if (app.includes(coachSummary)) {
  app = app.replace(coachSummary, "return hfPlanItemSummary(i);");
} else if (!app.includes("return hfPlanItemSummary(i);")) {
  throw new Error("Planificación: no se pudo actualizar el resumen de ejercicios en la vista del coach.");
}

const athleteSummary = [
  "return '<small>' + esc(i.exercise_name_snapshot) + ' · ' + esc(i.sets || \"—\") +",
  "              ' series · ' + esc(i.reps || \"—\") + ' · ' +",
  "              esc(i.target_load_kg || i.target_percent_rm || \"—\") + '</small>';"
].join("\n");
if (app.includes(athleteSummary)) {
  app = app.replace(athleteSummary, "return hfPlanItemSummary(i);");
} else if (!app.includes("return hfPlanItemSummary(i);")) {
  throw new Error("Planificación: no se pudo actualizar el resumen de ejercicios en el portal del atleta.");
}

fs.writeFileSync(appPath, app, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(".plan-session-card{")) {
  css += [
    "",
    ".plan-builder-intro{margin-top:10px;padding:12px 14px;background:#f4f6f5;border-radius:8px}",
    ".plan-builder-intro h4{margin:0 0 5px}",
    ".plan-builder-intro p{margin:0;color:#637078;font-size:13px}",
    ".plan-session-builder{display:grid;gap:14px}",
    ".plan-session-card{grid-column:1/-1;border:1px solid #d8dfdc;border-radius:10px;padding:14px;background:#fbfcfb;min-width:0}",
    ".plan-session-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}",
    ".plan-session-head h4{margin:0;font-size:15px}",
    ".plan-session-count{margin-left:auto;color:#68747b;font-size:12px}",
    ".plan-session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}",
    ".plan-session-grid label,.plan-exercise-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:650;min-width:0}",
    ".plan-session-grid input,.plan-session-grid select,.plan-exercise-grid input{width:100%;min-width:0}",
    ".plan-session-focus,.plan-session-notes{grid-column:span 1}",
    ".plan-exercise-list{display:grid;gap:10px;margin-top:14px}",
    ".plan-exercise-row{border:1px solid #e1e6e3;border-radius:8px;padding:12px;background:#fff;min-width:0}",
    ".plan-exercise-row-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:13px}",
    ".plan-exercise-row-head button{padding:6px 9px;min-height:30px;font-size:11px}",
    ".plan-exercise-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    ".plan-exercise-name-field{grid-column:span 2}",
    ".plan-exercise-notes{grid-column:span 2}",
    ".plan-add-exercise{margin-top:10px}",
    ".plan-item-line{font-size:12px;line-height:1.5;padding:5px 0;border-top:1px solid #edf0ee}",
    ".plan-item-line:first-child{border-top:0}",
    "@media(max-width:760px){.plan-session-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.plan-exercise-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.plan-exercise-name-field,.plan-exercise-notes{grid-column:span 2}}",
    "@media(max-width:520px){.plan-session-grid,.plan-exercise-grid{grid-template-columns:1fr}.plan-session-focus,.plan-session-notes,.plan-exercise-name-field,.plan-exercise-notes{grid-column:1}.plan-session-head{align-items:flex-start}.plan-session-count{margin-left:0}.plan-session-head button{margin-left:auto}}",
    ""
  ].join("\n");
}
fs.writeFileSync(cssPath, css, "utf8");
console.log("HF Central: planificador con múltiples jornadas y ejercicios aplicado.");
