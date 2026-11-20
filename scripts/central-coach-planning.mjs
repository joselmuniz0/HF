
import { computeTargetLoad, computeWeekTotals, formatPrescriptionBlock, validateCycle } from "./cycle-core.mjs";

const $ = id => document.getElementById(id);
const root = $("hfCoachCyclePlanner");
let currentTemplates = [];
let currentPlans = [];
let planDetailCache = new Map();
let loading = false;

const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const periodLabel = value => ({ preparatorio:"Preparatorio", competitivo:"Competitivo", transicion:"Transición" }[value] || value || "—");
const phaseLabel = value => ({ general_preparation:"Preparación general", specific_preparation:"Preparación específica", competition:"Competencia", transition:"Transición" }[value] || value || "—");
const dateLabel = value => value ? new Date(value + (String(value).length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-AR") : "Sin fecha";
const context = () => window.HFCoachPlanning || null;

function setStatus(text, type) {
  const el = $("cpStatus");
  if (!el) return;
  el.textContent = text || "";
  el.className = "status cp-status " + (type || "");
}
function requireContext() {
  const c = context();
  if (!c || !c.getClient || !c.getOrganizationId()) throw new Error("El entorno del coach todavía no está inicializado.");
  return c;
}
function client() { return requireContext().getClient(); }
function organizationId() { return requireContext().getOrganizationId(); }
function currentUserId() { return requireContext().getCurrentUserId(); }

function showLibrary() {
  $("cpLibraryView").hidden = false;
  $("cpEditorView").hidden = true;
}
function showEditor() {
  $("cpLibraryView").hidden = true;
  $("cpEditorView").hidden = false;
  $("cpEditorView").scrollIntoView({ behavior:"smooth", block:"start" });
}
function optionalNumber(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error("Hay un valor numérico inválido.");
  return number;
}
function setOptionsFromAthlete() {
  const athleteId = $("cpAthlete")?.value;
  const c = context();
  const records = c && c.getRecords ? c.getRecords() : [];
  const options = (records || [])
    .filter(r => r.athlete_id === athleteId)
    .sort((a,b) => new Date(b.record_date || 0) - new Date(a.record_date || 0))
    .map(r => '<option value="' + esc(r.exercise_name_snapshot) + '">' + esc(r.exercise_name_snapshot) + ' · ' + esc(r.record_value_kg) + ' kg</option>');
  const athlete = (c.getAthletes() || []).find(a => a.id === athleteId);
  const extras = [];
  if (athlete && athlete.snatch_kg) extras.push('<option value="Snatch">Snatch · ' + esc(athlete.snatch_kg) + ' kg</option>');
  if (athlete && athlete.clean_jerk_kg) extras.push('<option value="Clean & Jerk">Clean & Jerk · ' + esc(athlete.clean_jerk_kg) + ' kg</option>');
  $("cpRmReferences").innerHTML = Array.from(new Set(extras.concat(options))).join("");
}
function autoFillReference(input) {
  const row = input.closest("[data-cp-block]");
  if (!row) return;
  const c = context();
  const athleteId = $("cpAthlete").value;
  const name = input.value.trim().toLowerCase();
  const records = c && c.getRecords ? c.getRecords() : [];
  const match = (records || []).filter(r => r.athlete_id === athleteId && String(r.exercise_name_snapshot || "").trim().toLowerCase() === name)
    .sort((a,b) => new Date(b.record_date || 0) - new Date(a.record_date || 0))[0];
  if (match) {
    const target = row.querySelector("[data-cp-reference-kg]");
    if (target && !target.value) target.value = match.record_value_kg;
  }
  updateBlockPreview(row);
}
function updateBlockPreview(row) {
  if (!row) return;
  const type = row.querySelector("[data-cp-intensity-type]").value;
  const value = optionalNumber(row.querySelector("[data-cp-intensity-value]").value);
  const ref = optionalNumber(row.querySelector("[data-cp-reference-kg]").value);
  const manual = optionalNumber(row.querySelector("[data-cp-manual-kg]").value);
  let load = manual;
  let label = "";
  if (load !== null) label = "Carga fijada: " + load + " kg";
  else if (type === "percent" && value !== null && value >= 0 && ref !== null) {
    load = computeTargetLoad(value, ref);
    if (load !== null) label = "Carga calculada: " + load + " kg";
  } else if (type === "percent" && value !== null && value < 0) {
    label = "Notación negativa conservada; no se calcula kg";
  } else if (type === "kg" && value !== null) {
    load = value;
    label = "Carga: " + value + " kg";
  }
  const preview = row.querySelector("[data-cp-load-preview]");
  if (preview) preview.textContent = label;
}
function updateWeekTotal(card) {
  const oly = card.querySelector("[data-cp-oly]").value;
  const strength = card.querySelector("[data-cp-strength]").value;
  const manual = card.querySelector("[data-cp-total]").dataset.manual === "true" ? card.querySelector("[data-cp-total]").value : "";
  const result = computeWeekTotals(oly, strength, manual);
  const total = card.querySelector("[data-cp-total]");
  if (total.dataset.manual !== "true") total.value = result.total == null ? "" : result.total;
}
function createBlock(block) {
  const row = document.createElement("div");
  row.className = "cp-block-row";
  row.setAttribute("data-cp-block", "");
  row.innerHTML = [
    '<div class="cp-block-top"><b>Bloque de trabajo</b><button type="button" class="quiet cp-remove" data-cp-action="remove-block">Quitar bloque</button></div>',
    '<div class="cp-block-grid">',
    '<label>Series<input type="number" min="1" max="100" step="1" data-cp-sets required></label>',
    '<label>Repeticiones / duración<input type="text" data-cp-reps required placeholder="3 · 2+2+1 · 30" /></label>',
    '<label>Tipo de intensidad<select data-cp-intensity-type><option value="percent">% de referencia</option><option value="kg">Carga fija (kg)</option><option value="rpe">RPE</option><option value="none">Sin carga externa</option></select></label>',
    '<label>Valor<input type="number" step="0.5" data-cp-intensity-value placeholder="80 o -40" /></label>',
    '<label>Ejercicio de referencia<input type="text" list="cpRmReferences" data-cp-reference-name placeholder="Snatch / C&J / Back Squat" /></label>',
    '<label>RM de referencia (kg)<input type="number" min="0.1" step="0.5" data-cp-reference-kg placeholder="75" /></label>',
    '<label>Carga manual (kg)<input type="number" min="0.1" step="0.5" data-cp-manual-kg placeholder="Opcional" /></label>',
    '<label>RPE objetivo<input type="number" min="1" max="10" step="0.5" data-cp-rpe placeholder="Opcional" /></label>',
    '<label>Descanso (s)<input type="number" min="0" step="15" data-cp-rest placeholder="180" /></label>',
    '<label>Tempo<input type="text" data-cp-tempo placeholder="3-1-X" /></label>',
    '<label class="cp-block-notes">Notas<input type="text" data-cp-block-notes placeholder="Pausa, técnica, observación…" /></label>',
    '</div><small class="cp-load-preview" data-cp-load-preview></small>'
  ].join("");
  const values = block || {};
  row.querySelector("[data-cp-sets]").value = values.sets == null ? 1 : values.sets;
  row.querySelector("[data-cp-reps]").value = values.reps || "1";
  row.querySelector("[data-cp-intensity-type]").value = values.intensity_type || "none";
  row.querySelector("[data-cp-intensity-value]").value = values.intensity_value == null ? "" : values.intensity_value;
  row.querySelector("[data-cp-reference-name]").value = values.reference_exercise || "";
  row.querySelector("[data-cp-reference-kg]").value = values.reference_load_kg == null ? "" : values.reference_load_kg;
  row.querySelector("[data-cp-manual-kg]").value = values.manual_load_kg == null ? "" : values.manual_load_kg;
  row.querySelector("[data-cp-rpe]").value = values.target_rpe == null ? "" : values.target_rpe;
  row.querySelector("[data-cp-rest]").value = values.rest_seconds == null ? "" : values.rest_seconds;
  row.querySelector("[data-cp-tempo]").value = values.tempo || "";
  row.querySelector("[data-cp-block-notes]").value = values.notes || "";
  updateBlockPreview(row);
  return row;
}
function addBlock(exercise, block) {
  const list = exercise.querySelector("[data-cp-blocks]");
  list.appendChild(createBlock(block || {}));
  const count = list.children.length;
  const label = exercise.querySelector("[data-cp-block-count]");
  if (label) label.textContent = count + (count === 1 ? " bloque" : " bloques");
}
function createExercise(exercise) {
  const row = document.createElement("article");
  row.className = "cp-exercise";
  row.setAttribute("data-cp-exercise", "");
  row.innerHTML = [
    '<div class="cp-exercise-head"><b>Ejercicio</b><button type="button" class="quiet cp-remove" data-cp-action="remove-exercise">Quitar ejercicio</button></div>',
    '<div class="cp-exercise-grid">',
    '<label class="cp-exercise-name">Nombre del ejercicio<input type="text" data-cp-exercise-name required placeholder="Snatch · Clean + Jerk · Back Squat" /></label>',
    '<label>Formato<select data-cp-exercise-kind><option value="single">Simple</option><option value="complex">Complejo</option><option value="circuit">Circuito</option><option value="accessory">Accesorio</option></select></label>',
    '<label>Agrupación<select data-cp-group-type><option value="">Sin agrupar</option><option value="superset">Superserie</option><option value="circuit">Circuito</option><option value="paired">Trabajo combinado</option></select></label>',
    '<label>Nombre de grupo<input type="text" data-cp-group-label placeholder="Core · Fuerza auxiliar A" /></label>',
    '<label class="cp-exercise-notation">Notación original (opcional)<input type="text" data-cp-original placeholder="Ej. 45% 2x3 · 55% 1x3 · 65% 2x2…" /></label>',
    '<label class="cp-exercise-notes">Notas<input type="text" data-cp-exercise-notes placeholder="Indicaciones del coach…" /></label>',
    '</div>',
    '<div class="cp-block-heading"><b>Bloques de prescripción</b><span data-cp-block-count>0 bloques</span></div>',
    '<div data-cp-blocks class="cp-blocks"></div>',
    '<button type="button" class="quiet cp-add-block" data-cp-action="add-block">+ Agregar bloque de carga</button>'
  ].join("");
  const values = exercise || {};
  row.querySelector("[data-cp-exercise-name]").value = values.exercise_name || "";
  row.querySelector("[data-cp-exercise-kind]").value = values.exercise_kind || "single";
  row.querySelector("[data-cp-group-type]").value = values.group_type || "";
  row.querySelector("[data-cp-group-label]").value = values.group_label || "";
  row.querySelector("[data-cp-original]").value = values.original_notation || "";
  row.querySelector("[data-cp-exercise-notes]").value = values.notes || "";
  const blocks = Array.isArray(values.blocks) && values.blocks.length ? values.blocks : [{}];
  blocks.forEach(block => addBlock(row, block));
  return row;
}
function addExercise(session, exercise) {
  const list = session.querySelector("[data-cp-exercises]");
  list.appendChild(createExercise(exercise || {}));
  const count = list.children.length;
  const label = session.querySelector("[data-cp-exercise-count]");
  if (label) label.textContent = count + (count === 1 ? " ejercicio" : " ejercicios");
}
function createSession(session, defaultDay) {
  const card = document.createElement("section");
  card.className = "cp-session";
  card.setAttribute("data-cp-session", "");
  card.innerHTML = [
    '<div class="cp-session-head"><div><b>Sesión <span data-cp-session-index></span></b><small data-cp-exercise-count>0 ejercicios</small></div><button type="button" class="quiet cp-remove" data-cp-action="remove-session">Quitar sesión</button></div>',
    '<div class="cp-session-grid">',
    '<label>Día<select data-cp-day><option value="1">Día 1</option><option value="2">Día 2</option><option value="3">Día 3</option><option value="4">Día 4</option><option value="5">Día 5</option><option value="6">Día 6</option><option value="7">Día 7</option></select></label>',
    '<label>Referencia original<input type="text" data-cp-session-reference placeholder="#28 W. U. / Día 1" /></label>',
    '<label>Título<input type="text" data-cp-session-title required placeholder="Día 1 · Arranque" /></label>',
    '<label>Fecha (opcional)<input type="date" data-cp-session-date /></label>',
    '<label>Enfoque<input type="text" data-cp-session-focus placeholder="Técnica · Fuerza · Potencia" /></label>',
    '<label>Notas<input type="text" data-cp-session-notes placeholder="Indicaciones generales de la sesión" /></label>',
    '</div><div data-cp-exercises class="cp-exercises"></div>',
    '<button type="button" class="quiet cp-add-exercise" data-cp-action="add-exercise">+ Agregar ejercicio</button>'
  ].join("");
  const values = session || {};
  const day = values.day_number || defaultDay || 1;
  card.querySelector("[data-cp-day]").value = String(day);
  card.querySelector("[data-cp-session-reference]").value = values.session_reference || "";
  card.querySelector("[data-cp-session-title]").value = values.session_title || ("Día " + day);
  card.querySelector("[data-cp-session-date]").value = values.scheduled_date || "";
  card.querySelector("[data-cp-session-focus]").value = values.focus || "";
  card.querySelector("[data-cp-session-notes]").value = values.notes || "";
  const exercises = Array.isArray(values.exercises) && values.exercises.length ? values.exercises : [{}];
  exercises.forEach(exercise => addExercise(card, exercise));
  return card;
}
function addSession(weekCard, session) {
  const list = weekCard.querySelector("[data-cp-sessions]");
  const day = list.children.length + 1;
  const card = createSession(session || {}, day);
  list.appendChild(card);
  refreshSessionLabels(weekCard);
}
function refreshSessionLabels(weekCard) {
  Array.from(weekCard.querySelectorAll("[data-cp-session]")).forEach((session, index) => {
    const label = session.querySelector("[data-cp-session-index]");
    if (label) label.textContent = String(index + 1);
    const exerciseCount = session.querySelectorAll("[data-cp-exercise]").length;
    const counter = session.querySelector("[data-cp-exercise-count]");
    if (counter) counter.textContent = exerciseCount + (exerciseCount === 1 ? " ejercicio" : " ejercicios");
    session.querySelectorAll("[data-cp-exercise]").forEach(ex => {
      const blocks = ex.querySelectorAll("[data-cp-block]").length;
      const blockLabel = ex.querySelector("[data-cp-block-count]");
      if (blockLabel) blockLabel.textContent = blocks + (blocks === 1 ? " bloque" : " bloques");
    });
  });
}
function createWeek(week) {
  const card = document.createElement("article");
  card.className = "cp-week";
  card.setAttribute("data-cp-week", "");
  card.innerHTML = [
    '<div class="cp-week-head"><div><b>Microciclo · Semana <span data-cp-week-index></span></b><small data-cp-week-session-count>0 sesiones</small></div><button type="button" class="quiet cp-remove" data-cp-action="remove-week">Quitar semana</button></div>',
    '<div class="cp-week-grid">',
    '<label>Número de semana<input type="number" min="1" max="104" step="1" data-cp-week-number required /></label>',
    '<label>Período<select data-cp-period><option value="preparatorio">Preparatorio</option><option value="competitivo">Competitivo</option><option value="transicion">Transición</option></select></label>',
    '<label>Nivel<input type="number" min="1" max="10" step="1" data-cp-level placeholder="5" /></label>',
    '<label>Repeticiones OLY<input type="number" min="0" step="1" data-cp-oly placeholder="129" /></label>',
    '<label>Repeticiones fuerza<input type="number" min="0" step="1" data-cp-strength placeholder="60" /></label>',
    '<label>Total semanal<input type="number" min="0" step="1" data-cp-total placeholder="189" /></label>',
    '<label class="cp-week-notes">Notas del microciclo<input type="text" data-cp-week-notes placeholder="Objetivo, descarga, énfasis…" /></label>',
    '</div><div class="cp-sessions" data-cp-sessions></div>',
    '<button type="button" class="quiet cp-add-session" data-cp-action="add-session">+ Agregar sesión a esta semana</button>'
  ].join("");
  const values = week || {};
  card.querySelector("[data-cp-week-number]").value = values.week_number || 1;
  card.querySelector("[data-cp-period]").value = values.period || "preparatorio";
  card.querySelector("[data-cp-level]").value = values.athlete_level == null ? ($("cpAthleteLevel")?.value || 5) : values.athlete_level;
  card.querySelector("[data-cp-oly]").value = values.oly_repetitions == null ? "" : values.oly_repetitions;
  card.querySelector("[data-cp-strength]").value = values.strength_repetitions == null ? "" : values.strength_repetitions;
  card.querySelector("[data-cp-total]").value = values.total_repetitions == null ? "" : values.total_repetitions;
  card.querySelector("[data-cp-total]").dataset.manual = values.total_repetitions == null ? "false" : "true";
  card.querySelector("[data-cp-week-notes]").value = values.notes || "";
  const sessions = Array.isArray(week?.sessions) ? week.sessions : [];
  sessions.forEach(session => addSession(card, session));
  if (!sessions.length && !week?.no_default_session) addSession(card, {});
  refreshWeekLabels();
  updateWeekTotal(card);
  return card;
}
function refreshWeekLabels() {
  Array.from($("cpWeekBuilder").querySelectorAll("[data-cp-week]")).forEach((week, index) => {
    week.querySelector("[data-cp-week-index]").textContent = week.querySelector("[data-cp-week-number]").value || String(index + 1);
    const sessions = week.querySelectorAll("[data-cp-session]").length;
    week.querySelector("[data-cp-week-session-count]").textContent = sessions + (sessions === 1 ? " sesión" : " sesiones");
    refreshSessionLabels(week);
  });
}
function addWeek(week) {
  const builder = $("cpWeekBuilder");
  const next = Array.from(builder.querySelectorAll("[data-cp-week-number]")).reduce((max, el) => Math.max(max, Number(el.value) || 0), 0) + 1;
  const value = week || { week_number: next, period: "preparatorio", athlete_level: $("cpAthleteLevel").value || 5 };
  builder.appendChild(createWeek(value));
  refreshWeekLabels();
}
function clearEditor() {
  $("cpCycleForm").reset();
  $("cpWeekBuilder").innerHTML = "";
  $("cpAthleteLevel").value = 5;
  $("cpPhase").value = "general_preparation";
  $("cpCycleName").value = "";
  $("cpCycleObjective").value = "";
  $("cpCycleStart").value = new Date().toISOString().slice(0,10);
  $("cpCycleEnd").value = "";
  $("cpCycleNotes").value = "";
  addWeek({ week_number:1, period:"preparatorio", athlete_level:5 });
  setOptionsFromAthlete();
}
function collectStructure() {
  const weeks = Array.from($("cpWeekBuilder").querySelectorAll("[data-cp-week]")).map(card => {
    const totalInput = card.querySelector("[data-cp-total]");
    const totals = computeWeekTotals(
      card.querySelector("[data-cp-oly]").value,
      card.querySelector("[data-cp-strength]").value,
      totalInput.dataset.manual === "true" ? totalInput.value : ""
    );
    return {
      week_number:Number(card.querySelector("[data-cp-week-number]").value),
      period:card.querySelector("[data-cp-period]").value,
      athlete_level:optionalNumber(card.querySelector("[data-cp-level]").value),
      oly_repetitions:totals.oly,
      strength_repetitions:totals.strength,
      total_repetitions:totals.total,
      notes:card.querySelector("[data-cp-week-notes]").value.trim() || null
    };
  });
  const sessions = [];
  Array.from($("cpWeekBuilder").querySelectorAll("[data-cp-week]")).forEach(weekCard => {
    const weekNumber = Number(weekCard.querySelector("[data-cp-week-number]").value);
    Array.from(weekCard.querySelectorAll("[data-cp-session]")).forEach((sessionCard, sessionIndex) => {
      const exercises = Array.from(sessionCard.querySelectorAll("[data-cp-exercise]")).map(ex => {
        const blocks = Array.from(ex.querySelectorAll("[data-cp-block]")).map(block => {
          const type = block.querySelector("[data-cp-intensity-type]").value;
          const value = optionalNumber(block.querySelector("[data-cp-intensity-value]").value);
          const refLoad = optionalNumber(block.querySelector("[data-cp-reference-kg]").value);
          const manualLoad = optionalNumber(block.querySelector("[data-cp-manual-kg]").value);
          let targetLoad = manualLoad;
          if (targetLoad == null && type === "percent" && value != null && refLoad != null) targetLoad = computeTargetLoad(value, refLoad);
          if (targetLoad == null && type === "kg" && value != null) targetLoad = value;
          return {
            sets:Number(block.querySelector("[data-cp-sets]").value),
            reps:block.querySelector("[data-cp-reps]").value.trim(),
            intensity_type:type,
            intensity_value:value,
            reference_exercise:block.querySelector("[data-cp-reference-name]").value.trim() || null,
            reference_load_kg:refLoad,
            target_load_kg:targetLoad,
            target_rpe:optionalNumber(block.querySelector("[data-cp-rpe]").value) ?? (type === "rpe" ? value : null),
            rest_seconds:optionalNumber(block.querySelector("[data-cp-rest]").value),
            tempo:block.querySelector("[data-cp-tempo]").value.trim() || null,
            notes:block.querySelector("[data-cp-block-notes]").value.trim() || null,
            manual_load_kg:manualLoad
          };
        });
        return {
          exercise_name:ex.querySelector("[data-cp-exercise-name]").value.trim(),
          exercise_kind:ex.querySelector("[data-cp-exercise-kind]").value,
          group_type:ex.querySelector("[data-cp-group-type]").value || null,
          group_label:ex.querySelector("[data-cp-group-label]").value.trim() || null,
          original_notation:ex.querySelector("[data-cp-original]").value.trim() || null,
          notes:ex.querySelector("[data-cp-exercise-notes]").value.trim() || null,
          blocks:blocks
        };
      });
      sessions.push({
        week_number:weekNumber,
        day_number:Number(sessionCard.querySelector("[data-cp-day]").value),
        session_order:1,
        session_reference:sessionCard.querySelector("[data-cp-session-reference]").value.trim() || null,
        scheduled_date:sessionCard.querySelector("[data-cp-session-date]").value || null,
        session_title:sessionCard.querySelector("[data-cp-session-title]").value.trim(),
        focus:sessionCard.querySelector("[data-cp-session-focus]").value.trim() || null,
        notes:sessionCard.querySelector("[data-cp-session-notes]").value.trim() || null,
        exercises:exercises
      });
    });
  });
  return { weeks, sessions };
}
function collectCycle() {
  const athleteId = $("cpAthlete").value;
  const name = $("cpCycleName").value.trim();
  const start = $("cpCycleStart").value;
  const end = $("cpCycleEnd").value || null;
  if (!athleteId) throw new Error("Seleccioná el atleta.");
  if (name.length < 2) throw new Error("Ingresá el nombre del ciclo.");
  if (!start) throw new Error("Indicá la fecha de inicio.");
  if (end && end < start) throw new Error("La fecha final no puede ser anterior al inicio.");
  const structure = collectStructure();
  const errors = validateCycle(structure);
  if (errors.length) throw new Error(errors.join(" "));
  return {
    athleteId,
    name,
    objective:$("cpCycleObjective").value.trim() || null,
    phase:$("cpPhase").value,
    level:optionalNumber($("cpAthleteLevel").value),
    start,
    end,
    notes:$("cpCycleNotes").value.trim() || null,
    weeks:structure.weeks,
    sessions:structure.sessions
  };
}
function applyStructure(structure) {
  $("cpWeekBuilder").innerHTML = "";
  const weeks = Array.isArray(structure.weeks) ? structure.weeks : [];
  const sessions = Array.isArray(structure.sessions) ? structure.sessions : [];
  weeks.forEach(week => {
    const matching = sessions.filter(session => Number(session.week_number) === Number(week.week_number));
    $("cpWeekBuilder").appendChild(createWeek(Object.assign({}, week, { sessions:matching })));
  });
  if (!weeks.length) addWeek();
  refreshWeekLabels();
}
async function loadTemplates() {
  const c = requireContext();
  const result = await client().from("training_plan_templates").select("id,name,description,template_data,created_at").eq("organization_id", organizationId()).order("name");
  if (result.error) throw result.error;
  currentTemplates = result.data || [];
  $("cpTemplateSelect").innerHTML = '<option value="">Seleccionar plantilla guardada…</option>' + currentTemplates.map(t =>
    '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join("");
}
async function saveTemplate() {
  const c = requireContext();
  const name = $("cpTemplateName").value.trim();
  if (name.length < 2) throw new Error("Ingresá un nombre para la plantilla.");
  const structure = collectStructure();
  const errors = validateCycle(structure);
  if (errors.length) throw new Error(errors.join(" "));
  const payload = {
    organization_id:organizationId(),
    created_by:currentUserId(),
    name:name,
    description:$("cpTemplateDescription").value.trim() || null,
    template_data:structure
  };
  const result = await client().from("training_plan_templates").insert(payload).select("id").single();
  if (result.error) throw result.error;
  $("cpTemplateName").value = "";
  $("cpTemplateDescription").value = "";
  await loadTemplates();
  setStatus("Plantilla guardada en la biblioteca de este entorno de coach.", "success");
}
function useSelectedTemplate() {
  const template = currentTemplates.find(t => t.id === $("cpTemplateSelect").value);
  if (!template) throw new Error("Seleccioná una plantilla.");
  applyStructure(template.template_data || {});
  setStatus("Plantilla cargada. Asignale un atleta y completá las fechas del ciclo.", "success");
}
function zetaExample() {
  const levels = [ [45,2,"3"], [55,1,"3"], [65,2,"2"], [70,1,"2"], [75,2,"1"], [80,2,"1"], [85,2,"1"] ];
  const blocks = levels.map(x => ({ sets:x[1], reps:x[2], intensity_type:"percent", intensity_value:x[0], reference_exercise:"Snatch", reference_load_kg:null }));
  $("cpCycleName").value = "ZETA · Ejemplo de progresión preparatoria";
  $("cpCycleObjective").value = "Ejemplo de carga escalonada por bloques";
  $("cpPhase").value = "general_preparation";
  $("cpAthleteLevel").value = 5;
  $("cpCycleStart").value = new Date().toISOString().slice(0,10);
  $("cpWeekBuilder").innerHTML = "";
  const week = {
    week_number:2, period:"preparatorio", athlete_level:5,
    oly_repetitions:129, strength_repetitions:60, total_repetitions:189,
    notes:"Ejemplo basado en ZETA Weightlifting · Semana 2 · Día 1",
    sessions:[{
      day_number:1, session_reference:"Día 1", session_title:"Día 1 · Arranque",
      exercises:[
        {exercise_name:"Snatch Balance",exercise_kind:"single",blocks:blocks},
        {exercise_name:"Snatch (Déficit)",exercise_kind:"single",blocks:blocks},
        {exercise_name:"Back Squat",exercise_kind:"single",blocks:[
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:45},
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:55},
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:65},
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:70},
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:75},
          {sets:1,reps:"2",intensity_type:"percent",intensity_value:80},
          {sets:2,reps:"2",intensity_type:"percent",intensity_value:85}
        ]}
      ]
    }]
  };
  $("cpWeekBuilder").appendChild(createWeek(week));
  refreshWeekLabels();
  showEditor();
  setStatus("Se cargó un ejemplo parcial de ZETA: Semana 2, Día 1. Completá las referencias de RM y agregá las demás sesiones antes de guardar.", "");
}
async function loadPlans() {
  if (loading) return;
  loading = true;
  try {
    const result = await client().from("training_plans").select("*").eq("organization_id", organizationId()).order("created_at", { ascending:false });
    if (result.error) throw result.error;
    currentPlans = result.data || [];
    const weeksResult = currentPlans.length
      ? await client().from("training_plan_weeks").select("plan_id,week_number,period,oly_repetitions,strength_repetitions,total_repetitions").in("plan_id", currentPlans.map(p => p.id))
      : { data:[], error:null };
    if (weeksResult.error) throw weeksResult.error;
    renderPlanList(weeksResult.data || []);
  } catch (error) {
    $("cpPlanList").innerHTML = '<div class="empty">No se pudo cargar la biblioteca de ciclos: ' + esc(error.message || error) + '</div>';
  } finally {
    loading = false;
  }
}
function renderPlanList(weekRows) {
  const c = context();
  const athletes = c && c.getAthletes ? c.getAthletes() : [];
  const rows = currentPlans.map(plan => {
    const athlete = athletes.find(a => a.id === plan.athlete_id);
    const weeks = weekRows.filter(w => w.plan_id === plan.id).sort((a,b) => a.week_number-b.week_number);
    const published = plan.status === "active";
    return '<article class="cp-plan-card">' +
      '<div class="cp-plan-main"><div><h4>' + esc(plan.name) + '</h4><div class="cp-plan-meta">' +
      esc(athlete?.full_name || "Atleta") + ' · ' + esc(phaseLabel(plan.training_phase)) + ' · ' +
      dateLabel(plan.start_date) + (plan.end_date ? " – " + dateLabel(plan.end_date) : "") +
      '</div><div class="cp-week-pills">' + weeks.map(w =>
        '<span class="cp-week-pill">S' + esc(w.week_number) + ' · ' + esc(periodLabel(w.period)) +
        ' · OLY ' + esc(w.oly_repetitions ?? "—") + ' · F ' + esc(w.strength_repetitions ?? "—") +
        ' · Total ' + esc(w.total_repetitions ?? "—") + '</span>').join("") + '</div>' +
      '</div><span class="cp-status-pill ' + (published ? "published" : "draft") + '">' +
      (published ? "Publicado al atleta" : "Borrador") + '</span></div>' +
      '<div class="cp-plan-actions"><button type="button" class="quiet" data-cp-view="' + esc(plan.id) + '">Ver detalle</button>' +
      (plan.status === "draft" ? '<button type="button" class="primary" data-cp-publish="' + esc(plan.id) + '">Publicar al atleta</button>' : '') +
      '</div><div id="cpDetail-' + esc(plan.id) + '" class="cp-plan-detail" hidden></div>' +
      '<div class="cp-published-note">' + (published ? "Visible en el portal del atleta desde " + dateLabel(plan.published_at) + "." : "Todavía no es visible para el atleta.") + '</div>' +
      '</article>';
  }).join("");
  $("cpPlanList").innerHTML = rows || '<div class="empty">Todavía no hay ciclos de entrenamiento. Creá uno o cargá una plantilla.</div>';
}
async function viewPlan(planId) {
  const target = $("cpDetail-" + planId);
  if (!target) return;
  if (!target.hidden) { target.hidden = true; return; }
  const plan = currentPlans.find(p => p.id === planId);
  if (!plan) return;
  target.hidden = false;
  target.innerHTML = '<div class="empty">Cargando detalle…</div>';
  try {
    const [weeks, sessions] = await Promise.all([
      client().from("training_plan_weeks").select("*").eq("plan_id", planId).order("week_number"),
      client().from("training_plan_sessions").select("*").eq("plan_id", planId).order("week_number").order("day_number")
    ]);
    if (weeks.error) throw weeks.error;
    if (sessions.error) throw sessions.error;
    const items = sessions.data.length ? await client().from("training_plan_items").select("*").in("plan_session_id", sessions.data.map(s => s.id)).order("sequence_number") : { data:[], error:null };
    if (items.error) throw items.error;
    const blocks = items.data.length ? await client().from("training_plan_item_blocks").select("*").in("plan_item_id", items.data.map(i => i.id)).order("sequence_number") : { data:[], error:null };
    if (blocks.error) throw blocks.error;
    const content = (weeks.data || []).map(week => {
      const weekSessions = sessions.data.filter(s => s.week_number === week.week_number);
      return '<section class="cp-detail-week"><h5>Semana ' + esc(week.week_number) + ' · ' + esc(periodLabel(week.period)) +
        ' · OLY ' + esc(week.oly_repetitions ?? "—") + ' · Fuerza ' + esc(week.strength_repetitions ?? "—") +
        ' · Total ' + esc(week.total_repetitions ?? "—") + '</h5>' +
        weekSessions.map(session => {
          const sessionItems = items.data.filter(i => i.plan_session_id === session.id);
          return '<div class="cp-detail-session"><b>' + esc(session.session_reference || ("Día " + session.day_number)) +
            ' · ' + esc(session.session_title) + '</b>' +
            sessionItems.map(item => {
              const itemBlocks = blocks.data.filter(b => b.plan_item_id === item.id);
              return '<div class="cp-detail-exercise"><strong>' + esc(item.exercise_name_snapshot) + '</strong>' +
                itemBlocks.map(block => '<small>' + esc(formatPrescriptionBlock(block)) + '</small>').join("") +
                (item.notes ? '<small>' + esc(item.notes) + '</small>' : '') + '</div>';
            }).join("") + '</div>';
        }).join("") + '</section>';
    }).join("");
    target.innerHTML = content || '<div class="empty">El ciclo no tiene semanas.</div>';
  } catch (error) {
    target.innerHTML = '<div class="status error">No se pudo abrir el detalle: ' + esc(error.message || error) + '</div>';
  }
}
async function publishPlan(planId) {
  const plan = currentPlans.find(p => p.id === planId);
  if (!plan) return;
  const athlete = (context().getAthletes() || []).find(a => a.id === plan.athlete_id);
  if (!window.confirm('Publicar "' + plan.name + '" para ' + (athlete?.full_name || "el atleta") + '? El plan pasará a estar visible en su portal de HF Coach.')) return;
  try {
    const result = await client().rpc("publish_training_plan", { p_plan_id:planId });
    if (result.error) throw result.error;
    setStatus("Plan publicado. Ya está disponible en la sección «Mi planificación» del atleta.", "success");
    await loadPlans();
    await context().refreshCoachData();
  } catch (error) {
    setStatus("No se pudo publicar el plan: " + (error.message || error), "error");
  }
}
function fillAthleteOptions() {
  const c = context();
  if (!c || !c.getAthletes) return;
  const athletes = c.getAthletes() || [];
  const current = $("cpAthlete").value;
  $("cpAthlete").innerHTML = '<option value="">Elegir atleta…</option>' + athletes.map(a =>
    '<option value="' + esc(a.id) + '">' + esc(a.full_name) + '</option>').join("");
  if (current && athletes.some(a => a.id === current)) $("cpAthlete").value = current;
  setOptionsFromAthlete();
}
function onBuilderClick(event) {
  const button = event.target.closest("[data-cp-action]");
  if (!button) return;
  const action = button.dataset.cpAction;
  if (action === "add-week") { addWeek(); return; }
  if (action === "remove-week") {
    const card = button.closest("[data-cp-week]");
    if (card) card.remove();
    refreshWeekLabels();
    return;
  }
  if (action === "add-session") { addSession(button.closest("[data-cp-week]")); return; }
  if (action === "remove-session") {
    const week = button.closest("[data-cp-week]");
    const session = button.closest("[data-cp-session]");
    if (session) session.remove();
    refreshSessionLabels(week);
    refreshWeekLabels();
    return;
  }
  if (action === "add-exercise") { addExercise(button.closest("[data-cp-session]")); return; }
  if (action === "remove-exercise") {
    const session = button.closest("[data-cp-session]");
    const exercise = button.closest("[data-cp-exercise]");
    if (exercise) exercise.remove();
    refreshSessionLabels(button.closest("[data-cp-week]"));
    return;
  }
  if (action === "add-block") { addBlock(button.closest("[data-cp-exercise]")); return; }
  if (action === "remove-block") {
    const exercise = button.closest("[data-cp-exercise]");
    const block = button.closest("[data-cp-block]");
    if (block) block.remove();
    if (exercise && !exercise.querySelector("[data-cp-block]")) addBlock(exercise);
    refreshSessionLabels(button.closest("[data-cp-week]"));
  }
}
async function saveDraft(event) {
  event.preventDefault();
  const button = $("cpSaveDraft");
  button.disabled = true;
  try {
    const cycle = collectCycle();
    const result = await client().rpc("create_training_cycle_atomic", {
      p_athlete_id:cycle.athleteId,
      p_name:cycle.name,
      p_objective:cycle.objective,
      p_training_phase:cycle.phase,
      p_athlete_level:cycle.level,
      p_start_date:cycle.start,
      p_end_date:cycle.end,
      p_notes:cycle.notes,
      p_weeks:cycle.weeks,
      p_sessions:cycle.sessions
    });
    if (result.error) throw result.error;
    setStatus("Borrador guardado. Revisá el detalle y publicalo cuando esté listo para el atleta.", "success");
    showLibrary();
    await loadPlans();
    await context().refreshCoachData();
  } catch (error) {
    setStatus("No se pudo guardar el ciclo: " + (error.message || error), "error");
  } finally {
    button.disabled = false;
  }
}
async function refresh() {
  const c = context();
  if (!root || !c) return;
  if (!["admin","coach"].includes(c.getCurrentRole())) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  fillAthleteOptions();
  try {
    await Promise.all([loadPlans(), loadTemplates()]);
  } catch (error) {
    setStatus("No se pudo actualizar la planificación: " + (error.message || error), "error");
  }
}
async function renderAthletePlans() {
  const c = context();
  if (!c || !c.getAthletePortalData) return;
  const d = c.getAthletePortalData() || {};
  const plans = (d.plans || []).filter(p => p.status === "active");
  if (!plans.length) {
    $("athletePlans").innerHTML = '<div class="empty">Tu coach todavía no publicó una planificación.</div>';
    return;
  }
  try {
    const planIds = plans.map(p => p.id);
    const weeksResult = await client().from("training_plan_weeks").select("*").in("plan_id", planIds).order("week_number");
    if (weeksResult.error) throw weeksResult.error;
    const sessions = (d.planSessions || []).filter(s => planIds.includes(s.plan_id));
    const items = (d.planItems || []);
    const itemIds = items.map(i => i.id);
    const blocksResult = itemIds.length
      ? await client().from("training_plan_item_blocks").select("*").in("plan_item_id", itemIds).order("sequence_number")
      : { data:[], error:null };
    if (blocksResult.error) throw blocksResult.error;
    const weeks = weeksResult.data || [];
    const blocks = blocksResult.data || [];
    $("athletePlans").innerHTML = plans.map(plan => {
      const planWeeks = weeks.filter(w => w.plan_id === plan.id);
      const planSessions = sessions.filter(s => s.plan_id === plan.id);
      return '<article class="cp-athlete-plan">' +
        '<div class="cp-athlete-plan-head"><div><h4>' + esc(plan.name) + '</h4><div class="cp-plan-meta">' +
        esc(phaseLabel(plan.training_phase)) + ' · ' + dateLabel(plan.start_date) +
        (plan.end_date ? " – " + dateLabel(plan.end_date) : "") + '</div></div>' +
        '<span class="cp-status-pill published">Publicado</span></div>' +
        '<p class="cp-published-note">Tu coach publicó esta planificación el ' + dateLabel(plan.published_at || plan.approved_at) + '.</p>' +
        planWeeks.map(week => {
          const weekSessions = planSessions.filter(s => s.week_number === week.week_number);
          return '<section class="cp-athlete-week"><h5>Semana ' + esc(week.week_number) + ' · ' + esc(periodLabel(week.period)) +
            ' · Nivel ' + esc(week.athlete_level || plan.athlete_level || "—") +
            '</h5><div class="cp-athlete-volume">' +
            '<span>OLY <b>' + esc(week.oly_repetitions ?? "—") + '</b></span>' +
            '<span>Fuerza <b>' + esc(week.strength_repetitions ?? "—") + '</b></span>' +
            '<span>Total <b>' + esc(week.total_repetitions ?? "—") + '</b></span></div>' +
            weekSessions.map(session => {
              const sessionItems = items.filter(i => i.plan_session_id === session.id);
              return '<div class="cp-athlete-session"><h6>' +
                esc(session.session_reference || ("Día " + session.day_number)) + ' · ' + esc(session.session_title) +
                '</h6>' + sessionItems.map(item => {
                  const itemBlocks = blocks.filter(b => b.plan_item_id === item.id);
                  return '<div class="cp-athlete-exercise"><b>' + esc(item.exercise_name_snapshot) + '</b>' +
                    (item.group_label ? '<small>Grupo: ' + esc(item.group_label) + '</small>' : '') +
                    itemBlocks.map(block => '<small>' + esc(formatPrescriptionBlock(block)) + '</small>').join("") +
                    (item.original_notation ? '<small>Notación original: ' + esc(item.original_notation) + '</small>' : '') +
                    (item.notes ? '<small>' + esc(item.notes) + '</small>' : '') + '</div>';
                }).join("") + '</div>';
            }).join("") + (week.notes ? '<small>' + esc(week.notes) + '</small>' : '') + '</section>';
        }).join("") +
        (plan.notes ? '<p>' + esc(plan.notes) + '</p>' : '') +
        '</article>';
    }).join("");
  } catch (error) {
    $("athletePlans").innerHTML = '<div class="status error">La planificación está publicada, pero no se pudieron cargar todos sus bloques: ' + esc(error.message || error) + '</div>';
  }
}
function onCycleClick(event) {
  const button = event.target.closest("[data-cp-publish], [data-cp-view]");
  if (!button) return;
  if (button.hasAttribute("data-cp-publish")) publishPlan(button.dataset.cpPublish);
  else viewPlan(button.dataset.cpView);
}
function bind() {
  if (!root || root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  $("cpCreatePlan").addEventListener("click", () => { clearEditor(); showEditor(); setStatus("", ""); });
  $("cpBackToList").addEventListener("click", showLibrary);
  $("cpAddWeek").addEventListener("click", () => addWeek());
  $("cpWeekBuilder").addEventListener("click", onBuilderClick);
  $("cpWeekBuilder").addEventListener("input", event => {
    const week = event.target.closest("[data-cp-week]");
    if (week && (event.target.matches("[data-cp-oly]") || event.target.matches("[data-cp-strength]"))) updateWeekTotal(week);
    const block = event.target.closest("[data-cp-block]");
    if (block && (event.target.matches("[data-cp-intensity-value]") || event.target.matches("[data-cp-reference-kg]") || event.target.matches("[data-cp-manual-kg]"))) updateBlockPreview(block);
    if (event.target.matches("[data-cp-week-number]")) refreshWeekLabels();
  });
  $("cpWeekBuilder").addEventListener("change", event => {
    if (event.target.matches("[data-cp-total]")) event.target.dataset.manual = event.target.value ? "true" : "false";
    if (event.target.matches("[data-cp-reference-name]")) autoFillReference(event.target);
    const block = event.target.closest("[data-cp-block]");
    if (block) updateBlockPreview(block);
  });
  $("cpAthlete").addEventListener("change", setOptionsFromAthlete);
  $("cpCycleForm").addEventListener("submit", saveDraft);
  $("cpLoadTemplate").addEventListener("click", () => {
    try { useSelectedTemplate(); } catch (error) { setStatus(error.message || error, "error"); }
  });
  $("cpSaveTemplate").addEventListener("click", async () => {
    try { await saveTemplate(); } catch (error) { setStatus(error.message || error, "error"); }
  });
  $("cpLoadZetaExample").addEventListener("click", zetaExample);
  $("cpPlanList").addEventListener("click", onCycleClick);
}
function start() {
  if (!root) return;
  bind();
  const c = context();
  if (c && ["admin","coach"].includes(c.getCurrentRole())) refresh();
  window.addEventListener("hf:coach-data-ready", refresh);
  window.addEventListener("hf:athlete-data-ready", renderAthletePlans);
}
start();
