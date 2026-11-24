
import { computeTargetLoad, computeWeekTotals, formatPrescriptionBlock, validateCycle } from "./cycle-core.mjs";

const $ = id => document.getElementById(id);
const root = $("hfCoachCyclePlanner");
let currentTemplates = [];
let currentPlans = [];
let planDetailCache = new Map();
let loading = false;
let aiGeneratedAthleteId = null;

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
  aiGeneratedAthleteId = null;
  $("cpAiReview").hidden = true;
  $("cpAiReview").innerHTML = "";
  $("cpImportChatJson").value = "";
  $("cpAthleteLevel").value = 5;
  $("cpPhase").value = "general_preparation";
  $("cpCycleName").value = "";
  $("cpCycleObjective").value = "";
  $("cpCycleStart").value = nextMondayISO();
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
    const aiProposal = plan.status === "draft" && plan.generation_source === "coach_ai_personal";
    return '<article class="cp-plan-card">' +
      '<div class="cp-plan-main"><div><h4>' + esc(plan.name) + '</h4><div class="cp-plan-meta">' +
      esc(athlete?.full_name || "Atleta") + ' · ' + esc(phaseLabel(plan.training_phase)) + ' · ' +
      dateLabel(plan.start_date) + (plan.end_date ? " – " + dateLabel(plan.end_date) : "") +
      '</div><div class="cp-week-pills">' + weeks.map(w =>
        '<span class="cp-week-pill">S' + esc(w.week_number) + ' · ' + esc(periodLabel(w.period)) +
        ' · OLY ' + esc(w.oly_repetitions ?? "—") + ' · F ' + esc(w.strength_repetitions ?? "—") +
        ' · Total ' + esc(w.total_repetitions ?? "—") + '</span>').join("") + '</div>' +
      '</div><span class="cp-status-pill ' + (published ? "published" : aiProposal ? "pending-review" : "draft") + '">' +
      (published ? "Publicado al atleta" : aiProposal ? "Propuesta IA · revisión pendiente" : "Borrador") + '</span></div>' +
      '<div class="cp-plan-actions"><button type="button" class="quiet" data-cp-view="' + esc(plan.id) + '">Ver detalle</button>' +
      (plan.status === "draft" ? '<button type="button" class="primary" data-cp-publish="' + esc(plan.id) + '">' + (aiProposal ? "Aprobar y publicar" : "Publicar al atleta") + '</button>' : '') +
      '</div><div id="cpDetail-' + esc(plan.id) + '" class="cp-plan-detail" hidden></div>' +
      '<div class="cp-published-note">' + (published ? "Visible en el portal del atleta desde " + dateLabel(plan.published_at) + "." : aiProposal ? "Propuesta generada por HF Coach IA. Revisá los datos, las cargas y las alertas antes de publicarla." : "Todavía no es visible para el atleta.") + '</div>' +
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
  const aiProposal = plan.generation_source === "coach_ai_personal";
  const prompt = aiProposal
    ? 'Revisaste la propuesta de HF Coach IA "' + plan.name + '" para ' + (athlete?.full_name || "el atleta") + ' y confirmás que puede publicarse? Esta acción la convierte en una planificación activa visible en el portal.'
    : 'Publicar "' + plan.name + '" para ' + (athlete?.full_name || "el atleta") + '? El plan pasará a estar visible en su portal de HF Coach.';
  if (!window.confirm(prompt)) return;
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

function nextMondayISO() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const daysAhead = (8 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysAhead);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function setAiReview(review, meta) {
  const panel = $("cpAiReview");
  if (!panel) return;
  const parts = [
    '<h4>Revisión del Coach IA · requiere aprobación humana</h4>',
    '<p>' + esc(review.summary || "Propuesta generada a partir de los datos disponibles.") + '</p>',
    '<div class="cp-ai-review-grid">',
    '<div><b>Datos utilizados</b><ul>' + (review.data_used || []).map(item => '<li>' + esc(item) + '</li>').join("") + '</ul></div>',
    '<div><b>Datos faltantes</b><ul>' + (review.data_gaps || []).map(item => '<li>' + esc(item) + '</li>').join("") + (meta?.data_quality?.records_pending_or_unvalidated ? '<li>' + esc(meta.data_quality.records_pending_or_unvalidated + " registros de marcas pendientes o no validadas; no se usaron como RM.") + '</li>' : '') + '</ul></div>',
    '<div><b>Verificaciones del coach</b><ul>' + (review.coach_checks || []).map(item => '<li>' + esc(item) + '</li>').join("") + '</ul></div>',
    '<div><b>Alertas</b><ul>' + (review.risk_flags || []).map(item => '<li>' + esc(item) + '</li>').join("") + '</ul></div>',
    '</div>',
    '<small>El plan sigue siendo un borrador local hasta que el coach lo guarde. La IA no lo publica ni cambia cargas después de esta propuesta.</small>'
  ];
  panel.innerHTML = parts.join("");
  panel.hidden = false;
}
async function generatePlanWithAI() {
  const button = $("cpGenerateWithAI");
  const athleteId = $("cpAthlete").value;
  const startInput = $("cpCycleStart").value;
  const days = Array.from(root.querySelectorAll("[data-cp-ai-day]:checked")).map(input => Number(input.value)).sort((a,b) => a-b);
  if (!athleteId) { setStatus("Seleccioná primero un atleta.", "error"); return; }
  if (!days.length) { setStatus("Seleccioná al menos un día de entrenamiento.", "error"); return; }
  let monday = startInput;
  if (!monday) monday = nextMondayISO();
  const date = new Date(monday + "T12:00:00");
  if (!Number.isFinite(date.getTime())) { setStatus("La fecha de inicio no es válida.", "error"); return; }
  const daysAhead = (8 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysAhead);
  monday = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  $("cpCycleStart").value = monday;
  const lastDate = new Date(monday + "T12:00:00");
  lastDate.setDate(lastDate.getDate() + days[days.length - 1] - 1);
  $("cpCycleEnd").value = lastDate.getFullYear() + "-" + String(lastDate.getMonth() + 1).padStart(2, "0") + "-" + String(lastDate.getDate()).padStart(2, "0");

  const c = requireContext();
  const sessionResult = await client().auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const accessToken = sessionResult.data?.session?.access_token;
  if (!accessToken) throw new Error("Iniciá sesión nuevamente para usar el Coach IA.");

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Generando propuesta…";
  setStatus("Analizando el historial del atleta y construyendo el microciclo semanal…", "");
  $("cpAiReview").hidden = true;
  try {
    const response = await fetch("/api/coach-ai-planning", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({
        athleteId,
        startDate: monday,
        trainingDays: days,
        durationMinutes: Number($("cpAiDuration").value || 85),
        phase: $("cpPhase").value,
        level: optionalNumber($("cpAthleteLevel").value),
        objective: $("cpCycleObjective").value.trim(),
        coachInstructions: $("cpCycleNotes").value.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo generar el plan semanal.");
    const plan = payload.plan;
    if (!plan || !Array.isArray(plan.weeks) || !Array.isArray(plan.sessions)) throw new Error("La propuesta recibida no tiene una estructura válida.");
    $("cpCycleName").value = $("cpCycleName").value.trim() || plan.name || "Planificación semanal asistida por IA";
    $("cpCycleObjective").value = $("cpCycleObjective").value.trim() || plan.objective || "";
    const coachNotes = $("cpCycleNotes").value.trim();
    const aiNotes = String(plan.notes || "").trim();
    $("cpCycleNotes").value = [coachNotes, aiNotes].filter((value, index, values) => value && values.indexOf(value) === index).join("\n\n");
    applyStructure({
      weeks: plan.weeks,
      sessions: plan.sessions.map(session => Object.assign({}, session, {
        scheduled_date: session.scheduled_date || null
      }))
    });
    aiGeneratedAthleteId = athleteId;
    setAiReview(payload.review || {}, payload.meta || {});
    showEditor();
    setStatus("Propuesta semanal generada. Revisá ejercicios, volúmenes, intensidades y alertas; después guardala como borrador.", "success");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function importWeeklyPlanFromChat() {
  const athleteId = $("cpAthlete").value;
  if (!athleteId) throw new Error("Seleccioná primero el atleta al que corresponde la planificación.");
  if (!$("cpConfirmChatImport").checked) throw new Error("Confirmá que esta planificación corresponde al atleta seleccionado y que revisarás las cargas antes de guardar.");
  const raw = $("cpImportChatJson").value.trim();
  if (!raw) throw new Error("Pegá el bloque JSON de la planificación semanal.");
  let cleaned = raw;
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.trim().endsWith("```")) cleaned = cleaned.trim().slice(0, -3);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("No se encontró un objeto JSON.");
  let parsed;
  try { parsed = JSON.parse(cleaned.slice(first, last + 1)); }
  catch (error) { throw new Error("El bloque no es un JSON válido: " + error.message); }
  const plan = parsed.plan && typeof parsed.plan === "object" ? parsed.plan : parsed;
  const review = parsed.review && typeof parsed.review === "object" ? parsed.review : {
    summary: "Planificación semanal importada desde el asistente de HF. Requiere revisión del coach.",
    data_used: ["Plan semanal generado en el chat"],
    data_gaps: ["Verificar que las cargas correspondan a las marcas actuales del atleta seleccionado."],
    coach_checks: ["Confirmar atleta, RM de referencia, intensidades y volumen antes de guardar."],
    risk_flags: []
  };
  if (!Array.isArray(plan.weeks) || plan.weeks.length !== 1 || !Array.isArray(plan.sessions) || !plan.sessions.length) throw new Error("La planificación debe contener una semana y una lista de sesiones estructuradas.");
  const days = plan.sessions.map(session => Number(session.day_number));
  if (days.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(days).size !== days.length) throw new Error("Cada sesión debe tener un day_number único entre 1 y 7.");
  for (const session of plan.sessions) {
    if (!Array.isArray(session.exercises) || !session.exercises.length) throw new Error("Cada sesión debe contener al menos un ejercicio.");
    for (const exercise of session.exercises) {
      if (!String(exercise.exercise_name || "").trim() || !Array.isArray(exercise.blocks) || !exercise.blocks.length) throw new Error("Cada ejercicio debe incluir su nombre y al menos un bloque de prescripción.");
      for (const block of exercise.blocks) {
        if (!Number.isInteger(Number(block.sets)) || Number(block.sets) < 1 || !String(block.reps || "").trim()) throw new Error("Cada bloque debe tener series y repeticiones.");
        if (!["percent", "kg", "rpe", "none"].includes(block.intensity_type)) throw new Error("Cada bloque debe indicar su tipo de intensidad.");
      }
    }
  }
  const athleteRecords = (context().getRecords ? context().getRecords() : []).filter(record => record.athlete_id === athleteId && record.validation_status === "validated");
  const normalizeExerciseName = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const coachChecks = Array.isArray(review.coach_checks) ? [...review.coach_checks] : [];
  const addCoachCheck = message => { if (!coachChecks.includes(message)) coachChecks.push(message); };
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      for (const block of exercise.blocks) {
        const value = block.intensity_value == null ? null : Number(block.intensity_value);
        if (block.intensity_type === "percent") {
          if (value == null || value < -100 || value > 200) throw new Error("Un porcentaje del bloque está fuera del rango permitido.");
          const reference = athleteRecords.find(record => normalizeExerciseName(record.exercise_name_snapshot) === normalizeExerciseName(block.reference_exercise));
          block.manual_load_kg = null;
          if (value < 0) {
            block.reference_load_kg = reference ? Number(reference.record_value_kg) : null;
            block.target_load_kg = null;
          } else if (reference && Number(reference.record_value_kg) > 0) {
            block.reference_load_kg = Number(reference.record_value_kg);
            block.target_load_kg = Math.round(Number(reference.record_value_kg) * value / 100 * 2) / 2;
          } else {
            block.reference_load_kg = null;
            block.target_load_kg = null;
            addCoachCheck("No hay una marca validada de " + String(block.reference_exercise || "referencia") + " para " + exercise.exercise_name + "; el porcentaje queda sin convertir a kg.");
          }
        } else if (block.intensity_type === "kg") {
          const proposed = block.target_load_kg == null ? value : Number(block.target_load_kg);
          const comparable = athleteRecords.find(record => normalizeExerciseName(record.exercise_name_snapshot) === normalizeExerciseName(exercise.exercise_name));
          if (comparable && proposed != null && proposed > Number(comparable.record_value_kg) * 1.05) {
            block.intensity_type = "rpe";
            block.target_rpe = block.target_rpe == null ? 6 : Number(block.target_rpe);
            block.intensity_value = block.target_rpe;
            block.target_load_kg = null;
            block.manual_load_kg = null;
            addCoachCheck("La carga propuesta para " + exercise.exercise_name + " supera en más de 5% su marca validada y se dejó en RPE.");
          } else {
            block.intensity_value = proposed;
            block.target_load_kg = proposed;
            block.manual_load_kg = null;
            addCoachCheck("Confirmar la carga directa en kg de " + exercise.exercise_name + " contra el historial del atleta seleccionado.");
          }
        } else if (block.intensity_type === "rpe") {
          const rpe = block.target_rpe == null ? value : Number(block.target_rpe);
          if (rpe == null || rpe < 1 || rpe > 10) throw new Error("El RPE debe estar entre 1 y 10.");
          block.target_rpe = rpe;
          block.intensity_value = rpe;
          block.target_load_kg = null;
          block.manual_load_kg = null;
        } else {
          block.intensity_value = null;
          block.reference_load_kg = null;
          block.target_load_kg = null;
          block.target_rpe = null;
          block.manual_load_kg = null;
        }
      }
    }
  }
  review.coach_checks = coachChecks;
  if (!Array.isArray(review.data_used)) review.data_used = ["Plan semanal importado desde el chat"];
  if (!Array.isArray(review.data_gaps)) review.data_gaps = [];
  if (!Array.isArray(review.risk_flags)) review.risk_flags = [];
  const personalPlanWarning = "La planificación del chat es personal: confirmar el perfil del atleta seleccionado antes de guardar.";
  if (!review.risk_flags.includes(personalPlanWarning)) review.risk_flags.push(personalPlanWarning);
  const phase = $("cpPhase").value;
  const period = phase === "competition" ? "competitivo" : phase === "transition" ? "transicion" : "preparatorio";
  const week = Object.assign({}, plan.weeks[0], {
    week_number: 1,
    period: ["preparatorio", "competitivo", "transicion"].includes(plan.weeks[0].period) ? plan.weeks[0].period : period,
    athlete_level: optionalNumber($("cpAthleteLevel").value)
  });
  if (Number.isInteger(week.oly_repetitions) && Number.isInteger(week.strength_repetitions)) week.total_repetitions = week.oly_repetitions + week.strength_repetitions;
  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const sessions = [...plan.sessions].sort((a, b) => Number(a.day_number) - Number(b.day_number)).map(session => Object.assign({}, session, {
    week_number: 1,
    session_order: 1,
    session_reference: session.session_reference || dayNames[Number(session.day_number) - 1]
  }));
  const startInput = $("cpCycleStart").value || nextMondayISO();
  const mondayDate = new Date(startInput + "T12:00:00");
  if (!Number.isFinite(mondayDate.getTime())) throw new Error("La fecha de inicio no es válida.");
  mondayDate.setDate(mondayDate.getDate() + (8 - mondayDate.getDay()) % 7);
  const monday = mondayDate.getFullYear() + "-" + String(mondayDate.getMonth() + 1).padStart(2, "0") + "-" + String(mondayDate.getDate()).padStart(2, "0");
  $("cpCycleStart").value = monday;
  for (const session of sessions) {
    const date = new Date(monday + "T12:00:00");
    date.setDate(date.getDate() + Number(session.day_number) - 1);
    session.scheduled_date = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  const lastDate = sessions.reduce((latest, session) => session.scheduled_date > latest ? session.scheduled_date : latest, monday);
  $("cpCycleEnd").value = lastDate;
  $("cpCycleName").value = $("cpCycleName").value.trim() || String(plan.name || "Planificación semanal importada");
  $("cpCycleObjective").value = $("cpCycleObjective").value.trim() || String(plan.objective || "");
  const coachNotes = $("cpCycleNotes").value.trim();
  const importedNotes = String(plan.notes || "").trim();
  $("cpCycleNotes").value = [coachNotes, importedNotes].filter((value, index, values) => value && values.indexOf(value) === index).join("\n\n");
  applyStructure({ weeks: [week], sessions: sessions });
  aiGeneratedAthleteId = athleteId;
  setAiReview(review, { data_quality: { records_pending_or_unvalidated: 0 } });
  showEditor();
  setStatus("Planificación semanal importada al editor. Confirmá que pertenece al atleta seleccionado y revisá todas las cargas antes de guardar el borrador.", "success");
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
    aiGeneratedAthleteId = null;
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
function setAthleteAiHealthFields() {
  const status = $("athleteAiHealthStatus")?.value;
  const details = $("athleteAiHealthDetails");
  const consent = $("athleteAiHealthConsent");
  if (details) details.hidden = status !== "conditions_reported";
  if (consent) {
    consent.disabled = status === "prefer_not_to_disclose";
    if (status === "prefer_not_to_disclose") consent.checked = false;
  }
}
function setAthleteAiRmFields() {
  [
    ["athleteAiSnatch","athleteAiSnatchNotTested"],
    ["athleteAiCleanJerk","athleteAiCleanJerkNotTested"],
    ["athleteAiBackSquat","athleteAiBackSquatNotTested"],
    ["athleteAiFrontSquat","athleteAiFrontSquatNotTested"]
  ].forEach(([inputId,checkId]) => {
    const input = $(inputId), check = $(checkId);
    if (!input || !check) return;
    input.disabled = check.checked;
    if (check.checked) input.value = "";
  });
}
function renderAthleteAiOnboarding() {
  const panel = $("athleteAiOnboardingPanel");
  if (!panel) return;
  const d = context()?.getAthletePortalData?.() || {};
  const linked = d.aiCoach?.status === "active" && d.aiCoach?.coach_label === "HF Coach IA";
  const ready = d.aiOnboarding?.profile_status === "ready_for_ai_planning";
  panel.hidden = !linked || !ready;
  if (!linked || !ready) return;
  const profile = d.aiOnboarding || null;
  const health = d.healthDeclaration || null;
  const form = $("athleteAiOnboardingForm");
  if (form && form.dataset.prefilled !== "true") {
    const athlete = d.athlete || {};
    const latestMeasurement = key => (d.measurements || [])
      .filter(item => item.metric_key === key)
      .sort((a,b) => new Date(b.measured_at || b.created_at) - new Date(a.measured_at || a.created_at))[0];
    const latestRecord = names => (d.records || [])
      .filter(item => names.includes(String(item.exercise_name_snapshot || "").toLowerCase()))
      .sort((a,b) => new Date(b.record_date || b.created_at) - new Date(a.record_date || a.created_at))[0];
    const put = (id,value,force=false) => { const element=$(id); if(element && value!=null && (force || element.value==="")) element.value=String(value); };
    put("athleteAiAge",profile?.declared_age ?? athlete.age);
    put("athleteAiHeight",profile?.height_cm ?? latestMeasurement("height")?.metric_value);
    put("athleteAiWeight",profile?.weight_kg ?? latestMeasurement("body_weight")?.metric_value ?? athlete.body_weight_kg);
    put("athleteAiTrainingYears",profile?.training_years ?? "");
    put("athleteAiTrainingDays",profile?.training_days_per_week ?? 4,Boolean(profile));
    put("athleteAiTrainingObjective",profile?.training_objective ?? "");
    put("athleteAiSnatch",profile ? profile.snatch_kg : (latestRecord(["snatch","arranque"])?.record_value_kg ?? athlete.snatch_kg));
    put("athleteAiCleanJerk",profile ? profile.clean_jerk_kg : (latestRecord(["clean & jerk","clean and jerk","envión"])?.record_value_kg ?? athlete.clean_jerk_kg));
    put("athleteAiBackSquat",profile ? profile.back_squat_kg : latestRecord(["back squat","sentadilla trasera"])?.record_value_kg);
    put("athleteAiFrontSquat",profile ? profile.front_squat_kg : latestRecord(["front squat","sentadilla frontal"])?.record_value_kg);
    put("athleteAiDeclaredLevel",profile?.declared_level ?? "undetermined",Boolean(profile));
    if(profile) {
      ["Snatch","Clean & Jerk","Back Squat","Front Squat"].forEach((name,index) => {
        const key=["snatch","clean_jerk","back_squat","front_squat"][index];
        const check=$("athleteAi"+(key==="clean_jerk"?"CleanJerk":key==="back_squat"?"BackSquat":key==="front_squat"?"FrontSquat":"Snatch")+"NotTested");
        if(check) check.checked=profile[key+"_not_tested"]===true;
      });
    }
    if(health) {
      put("athleteAiHealthStatus",health.health_status,true);
      put("athleteAiConditions",health.chronic_conditions);
      put("athleteAiBoneJoint",health.bone_joint_injuries);
      put("athleteAiMuscular",health.muscular_injuries);
      put("athleteAiSurgeries",health.surgeries);
      put("athleteAiMedication",health.medication_and_treatments);
      put("athleteAiRestrictions",health.medical_restrictions);
      put("athleteAiOtherHealth",health.other_relevant_history);
      const consent=$("athleteAiHealthConsent");
      if(consent) consent.checked=health.consent_for_ai_processing===true;
    }
    form.dataset.prefilled="true";
  }
  const status=profile?.profile_status || "incomplete";
  const badge=$("athleteAiOnboardingBadge");
  if(badge) {
    badge.textContent=status==="ready_for_ai_planning"?"Datos declarados":status==="needs_video_assessment"?"Requiere video":status==="requires_human_review"?"Revisión humana":"Pendiente";
    badge.className="cp-status-pill "+(status==="ready_for_ai_planning"?"published":status==="needs_video_assessment"||status==="requires_human_review"?"pending-review":"draft");
  }
  const setState=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  setState("athleteAiPersonalState",profile?"Declarados por atleta":"Pendientes");
  setState("athleteAiHealthState",health?.health_status==="no_known_conditions"&&health?.consent_for_ai_processing?"Declarada y autorizada":health?.health_status==="conditions_reported"?"Declarada · revisión humana":health?.health_status==="prefer_not_to_disclose"?"No informada":"Pendiente");
  setState("athleteAiSportState",profile?"Declaradas · validación pendiente":"Pendientes");
  setState("athleteAiLevelState",profile?.level_status==="athlete_declared"?"Declarado por atleta":profile?.level_status==="pending_video_assessment"?"Pendiente de video":"Pendiente");
  const message=$("athleteAiOnboardingStatus");
  if(message) {
    if(status==="ready_for_ai_planning") message.textContent="Perfil completo para generar propuestas. Tu nivel es autodeclarado; marcas y medidas siguen pendientes de validación.";
    else if(status==="needs_video_assessment") message.textContent="Falta la evaluación técnica por video para definir el nivel. La generación de un plan personal permanece bloqueada.";
    else if(status==="requires_human_review") message.textContent="La declaración de salud requiere revisión humana o no fue autorizada para su tratamiento por HF Coach IA. No se generará una planificación individualizada hasta resolverlo.";
    else message.textContent="Completá todos los datos, declarando una RM vigente o indicando que no tenés RM para cada levantamiento.";
  }
  if($("athleteAiHealthStatus")) setAthleteAiHealthFields();
  setAthleteAiRmFields();
}
async function submitAthleteAiOnboarding(event) {
  event.preventDefault();
  const form=$("athleteAiOnboardingForm");
  const button=$("athleteAiOnboardingSubmit");
  const status=$("athleteAiOnboardingResult");
  const originalText=button?.textContent || "Guardar evaluación y declaración";
  const setMessage=(message,kind)=>{if(status){status.textContent=message;status.className="status "+(kind||"");}};
  try {
    const c=requireContext();
    const d=c.getAthletePortalData()||{};
    if(!d.athlete?.id || d.aiCoach?.status!=="active") throw new Error("No encontramos una vinculación activa con HF Coach IA.");
    if(!$("athleteAiAcceptDeclaration").checked) throw new Error("Debés aceptar la declaración jurada.");
    const rm=(valueId,checkId)=>({
      value:$(valueId).value.trim(),
      notTested:$(checkId).checked
    });
    const snatch=rm("athleteAiSnatch","athleteAiSnatchNotTested");
    const cleanJerk=rm("athleteAiCleanJerk","athleteAiCleanJerkNotTested");
    const backSquat=rm("athleteAiBackSquat","athleteAiBackSquatNotTested");
    const frontSquat=rm("athleteAiFrontSquat","athleteAiFrontSquatNotTested");
    for(const [label,item] of [["Snatch",snatch],["Clean & Jerk",cleanJerk],["Back Squat",backSquat],["Front Squat",frontSquat]]) {
      if((!item.value && !item.notTested)||(item.value && item.notTested)) throw new Error(label+": ingresá una RM o marcá que no tenés una vigente.");
    }
    const healthStatus=$("athleteAiHealthStatus").value;
    const consent=healthStatus==="prefer_not_to_disclose"?false:$("athleteAiHealthConsent").checked;
    if(healthStatus!=="prefer_not_to_disclose"&&!consent) throw new Error("Autorizá el tratamiento de los datos de salud declarados o elegí no informar antecedentes y solicitar revisión humana.");
    const body={
      accept_declaration:true,
      age:$("athleteAiAge").value,
      height_cm:$("athleteAiHeight").value,
      weight_kg:$("athleteAiWeight").value,
      training_years:$("athleteAiTrainingYears").value,
      training_days_per_week:$("athleteAiTrainingDays").value,
      training_objective:$("athleteAiTrainingObjective").value.trim(),
      declared_level:$("athleteAiDeclaredLevel").value,
      snatch_kg:snatch.value,snatch_not_tested:snatch.notTested,
      clean_jerk_kg:cleanJerk.value,clean_jerk_not_tested:cleanJerk.notTested,
      back_squat_kg:backSquat.value,back_squat_not_tested:backSquat.notTested,
      front_squat_kg:frontSquat.value,front_squat_not_tested:frontSquat.notTested,
      health_status:healthStatus,
      consent_for_ai_processing:consent,
      chronic_conditions:$("athleteAiConditions").value,
      bone_joint_injuries:$("athleteAiBoneJoint").value,
      muscular_injuries:$("athleteAiMuscular").value,
      surgeries:$("athleteAiSurgeries").value,
      medication_and_treatments:$("athleteAiMedication").value,
      medical_restrictions:$("athleteAiRestrictions").value,
      other_relevant_history:$("athleteAiOtherHealth").value
    };
    button.disabled=true;
    button.textContent="Guardando declaración…";
    setMessage("Registrando datos declarados y estados de validación…","");
    const result=await client().functions.invoke("submit-athlete-ai-onboarding",{body});
    if(result.error) throw new Error(result.data?.error || result.error.message || "No se pudo guardar la evaluación inicial.");
    if(!result.data?.ok) throw new Error(result.data?.error || "No se confirmó el guardado de la evaluación.");
    setMessage(result.data.message,"success");
    form.dataset.prefilled="false";
    await c.refreshAthletePortalData();
    renderAthleteAiOnboarding();
    renderAthleteAiPlanForm();
  } catch(error) {
    setMessage(error.message||String(error),"error");
  } finally {
    if(button){button.disabled=false;button.textContent=originalText;}
  }
}
function renderAthleteAiPlanForm() {
  const panel = $("athleteAiPlanPanel");
  if (!panel) return;
  const d = context()?.getAthletePortalData?.() || {};
  const linked = d.aiCoach?.status === "active" && d.aiCoach?.coach_label === "HF Coach IA";
  panel.hidden = !linked;
  if (!linked) return;
  const start = $("athleteAiPlanStart");
  if (start && !start.value) start.value = nextMondayISO();
  const objective = $("athleteAiPlanObjective");
  if (objective && !objective.value) {
    objective.value = "Desarrollar técnica, aceleración y fuerza/carga con una progresión semanal coherente.";
  }
}
async function submitAthleteAiPlan(event) {
  event.preventDefault();
  const form = $("athleteAiPlanForm");
  const button = $("athleteAiPlanGenerate");
  const status = $("athleteAiPlanStatus");
  const originalText = button?.textContent || "Generar mi semana con Coach IA";
  const setMessage = (message, kind) => {
    status.textContent = message;
    status.className = "status " + (kind || "");
  };
  try {
    const c = requireContext();
    const d = c.getAthletePortalData() || {};
    const athlete = d.athlete;
    if (!athlete?.id || d.aiCoach?.status !== "active") {
      throw new Error("No encontramos una vinculación activa de tu cuenta con HF Coach IA.");
    }
    if (d.aiOnboarding?.profile_status !== "ready_for_ai_planning") {
      throw new Error("Antes de planificar, completá la evaluación inicial y resolvé los estados pendientes de salud o nivel.");
    }
    const trainingDays = Array.from(form.querySelectorAll("[data-athlete-ai-day]:checked"))
      .map(input => Number(input.value)).sort((a,b) => a-b);
    if (!trainingDays.length) throw new Error("Seleccioná al menos un día de entrenamiento.");
    const startDate = $("athleteAiPlanStart").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || new Date(startDate + "T12:00:00").getDay() !== 1) {
      throw new Error("La fecha de inicio debe ser un lunes.");
    }
    const session = await client().auth.getSession();
    if (session.error) throw session.error;
    const accessToken = session.data?.session?.access_token;
    if (!accessToken) throw new Error("La sesión venció. Volvé a ingresar para generar tu semana.");
    button.disabled = true;
    button.textContent = "Generando y guardando propuesta…";
    setMessage("Coach IA está analizando tus datos y preparando una propuesta. Las marcas y mediciones pendientes no se usarán como RM validadas.", "");
    const response = await fetch("/api/coach-ai-planning", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({
        athleteId: athlete.id,
        startDate,
        trainingDays,
        durationMinutes: Number($("athleteAiPlanDuration").value || 85),
        phase: $("athleteAiPlanPhase").value || "general_preparation",
        level: athlete.level == null ? null : Number(athlete.level),
        objective: $("athleteAiPlanObjective").value.trim(),
        coachInstructions: $("athleteAiPlanNotes").value.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo generar la propuesta semanal.");
    if (!payload.meta?.saved_plan_id || payload.meta?.saved_plan_status !== "draft" || payload.meta?.human_review_required !== true) {
      throw new Error("La IA devolvió una planificación, pero no confirmó que quedara guardada como borrador sujeto a revisión humana.");
    }
    setMessage("Propuesta guardada. Está pendiente de revisión humana y todavía no es una planificación activa.", "success");
    await c.refreshAthletePortalData();
    if (typeof form.reset === "function") {
      const dateValue = startDate;
      form.reset();
      $("athleteAiPlanStart").value = dateValue;
      $("athleteAiPlanDuration").value = "85";
      ["1","2","3","5"].forEach(day => {
        const checkbox = form.querySelector('[data-athlete-ai-day="' + day + '"]');
        if (checkbox) checkbox.checked = true;
      });
      renderAthleteAiPlanForm();
    }
  } catch (error) {
    setMessage(error.message || String(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function renderAthleteNotifications(notifications) {
  if (!notifications.length) return "";
  return '<div class="cp-notice-list"><h4>Avisos de tu coach</h4>' +
    notifications.map(notification =>
      '<div class="cp-athlete-notice"><div><b>' + esc(notification.title || "Nueva planificación disponible") + '</b>' +
      (notification.body ? '<p>' + esc(notification.body) + '</p>' : '') +
      '<small>' + dateLabel(notification.created_at) + '</small></div>' +
      '<button type="button" class="quiet" data-cp-notification-read="' + esc(notification.id) + '">Marcar como leído</button></div>'
    ).join("") + '</div>';
}
async function markNotificationRead(notificationId) {
  const d = context().getAthletePortalData() || {};
  const athleteId = d.athlete && d.athlete.id;
  const notification = (d.notifications || []).find(item => item.id === notificationId);
  if (!athleteId || !notification || notification.read_at) return;
  const readAt = new Date().toISOString();
  const result = await client().from("athlete_notifications").update({ read_at: readAt }).eq("id", notificationId).eq("athlete_id", athleteId);
  if (result.error) throw result.error;
  notification.read_at = readAt;
  renderAthletePlans();
}
let jsPdfLoaderPromise = null;

function loadJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (jsPdfLoaderPromise) return jsPdfLoaderPromise;
  jsPdfLoaderPromise = new Promise((resolve, reject) => {
    const sources = [
      "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js",
      "https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js"
    ];
    const trySource = index => {
      if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
      if (index >= sources.length) {
        jsPdfLoaderPromise = null;
        return reject(new Error("No se pudo cargar el generador PDF. Revisá la conexión e intentá nuevamente."));
      }
      const script = document.createElement("script");
      script.src = sources[index];
      script.async = true;
      script.onload = () => {
        const PdfConstructor = window.jspdf && window.jspdf.jsPDF;
        if (PdfConstructor) resolve(PdfConstructor);
        else trySource(index + 1);
      };
      script.onerror = () => {
        script.remove();
        trySource(index + 1);
      };
      document.head.appendChild(script);
    };
    trySource(0);
  });
  return jsPdfLoaderPromise;
}

function cleanPdfText(value) {
  return String(value == null ? "" : value)
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "|")
    .trim();
}

async function downloadAthletePlanPdf(planId, button) {
  const d = context()?.getAthletePortalData?.() || {};
  const plan = (d.plans || []).find(item => item.id === planId);
  const athlete = d.athlete;
  if (!plan || !athlete?.id || plan.athlete_id !== athlete.id) {
    throw new Error("No se encontró esta planificación en tu historia deportiva.");
  }
  const isOwnAiDraft = plan.status === "draft" && plan.generation_source === "coach_ai_personal";
  if (plan.status !== "active" && !isOwnAiDraft) {
    throw new Error("Esta planificación todavía no está disponible para descarga.");
  }

  const originalText = button?.textContent || "Descargar PDF";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparando PDF…";
  }
  try {
    const [weeksResult, sessionsResult] = await Promise.all([
      client().from("training_plan_weeks").select("*").eq("plan_id", planId).order("week_number"),
      client().from("training_plan_sessions").select("*").eq("plan_id", planId).order("week_number").order("day_number").order("session_order")
    ]);
    if (weeksResult.error) throw weeksResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    const sessions = sessionsResult.data || [];
    if (!sessions.length) throw new Error("La planificación no contiene sesiones para exportar.");

    const sessionIds = sessions.map(item => item.id);
    const itemsResult = await client().from("training_plan_items")
      .select("*").in("plan_session_id", sessionIds).order("sequence_number");
    if (itemsResult.error) throw itemsResult.error;
    const items = itemsResult.data || [];
    const itemIds = items.map(item => item.id);
    const blocksResult = itemIds.length
      ? await client().from("training_plan_item_blocks").select("*").in("plan_item_id", itemIds).order("sequence_number")
      : { data:[], error:null };
    if (blocksResult.error) throw blocksResult.error;
    const blocks = blocksResult.data || [];

    const jsPDF = await loadJsPdf();
    const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4", compress:true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - 17;
    let y = 18;

    const ensureSpace = (height) => {
      if (y + height > bottomLimit) {
        pdf.addPage();
        y = 18;
      }
    };
    const writeLine = (text, options = {}) => {
      const size = options.size || 9.5;
      const font = options.font || "normal";
      const color = options.color || [48, 56, 59];
      const indent = options.indent || 0;
      const width = contentWidth - indent;
      const lineHeight = size * 0.48;
      const lines = pdf.splitTextToSize(cleanPdfText(text), width);
      pdf.setFont("helvetica", font);
      pdf.setFontSize(size);
      pdf.setTextColor(color[0], color[1], color[2]);
      for (const line of lines) {
        ensureSpace(lineHeight + 0.5);
        pdf.text(line, margin + indent, y);
        y += lineHeight;
      }
      y += options.gapAfter == null ? 1.5 : options.gapAfter;
    };
    const sectionHeading = (text) => {
      ensureSpace(11);
      pdf.setFillColor(239, 243, 240);
      pdf.roundedRect(margin, y - 4, contentWidth, 8, 1.5, 1.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(35, 47, 53);
      pdf.text(cleanPdfText(text), margin + 3, y + 1.2);
      y += 9;
    };
    const phase = phaseLabel(plan.training_phase);
    const statusLabel = isOwnAiDraft
      ? "PROPUESTA IA - PENDIENTE DE REVISION HUMANA"
      : "PLANIFICACION PUBLICADA";
    const dateRange = dateLabel(plan.start_date) +
      (plan.end_date ? " - " + dateLabel(plan.end_date) : "");

    pdf.setFillColor(32, 40, 46);
    pdf.rect(0, 0, pageWidth, 34, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(237, 177, 178);
    pdf.text("HF COACH", margin, 11);
    pdf.setFontSize(17);
    pdf.setTextColor(255, 255, 255);
    pdf.text("Planificación de entrenamiento", margin, 21);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(226, 232, 235);
    pdf.text(cleanPdfText(athlete.full_name || "Atleta"), margin, 28);
    y = 43;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(isOwnAiDraft ? 137 : 45, isOwnAiDraft ? 103 : 103, isOwnAiDraft ? 34 : 66);
    const statusLines = pdf.splitTextToSize(statusLabel, contentWidth);
    pdf.text(statusLines, margin, y);
    y += statusLines.length * 4.5 + 2;

    writeLine(cleanPdfText(plan.name), { size:14, font:"bold", color:[32, 40, 46], gapAfter:2 });
    writeLine("Período: " + dateRange + " | Fase: " + phase, { size:9, color:[90, 101, 106] });
    if (plan.objective) writeLine("Objetivo: " + plan.objective, { size:9.5 });
    if (plan.athlete_level != null) writeLine("Nivel de planificación: " + plan.athlete_level, { size:9 });
    if (isOwnAiDraft) {
      writeLine("Esta propuesta todavía no está aprobada ni publicada. No reemplaza una planificación activa; su contenido requiere revisión humana antes de aplicarse.", {
        size:9, font:"bold", color:[126, 83, 29], gapAfter:3
      });
    }

    const orderedWeeks = (weeksResult.data || []).slice().sort((a,b) => Number(a.week_number) - Number(b.week_number));
    orderedWeeks.forEach(week => {
      sectionHeading("Microciclo " + week.week_number + " | " + periodLabel(week.period));
      writeLine(
        "Volumen planificado: OLY " + (week.oly_repetitions ?? "-") +
        " | Fuerza " + (week.strength_repetitions ?? "-") +
        " | Total " + (week.total_repetitions ?? "-"),
        { size:9, font:"bold", color:[71, 91, 79] }
      );
      if (week.notes) writeLine(week.notes, { size:8.5, color:[89, 99, 104] });
      const weekSessions = sessions.filter(session => Number(session.week_number) === Number(week.week_number));
      weekSessions.forEach(session => {
        const sessionDate = session.scheduled_date ? " | " + dateLabel(session.scheduled_date) : "";
        sectionHeading(
          (session.session_reference || ("Día " + session.day_number)) +
          " - " + session.session_title + sessionDate
        );
        if (session.focus) writeLine("Enfoque: " + session.focus, { size:9, font:"bold" });
        if (session.notes) writeLine(session.notes, { size:8.5, color:[89, 99, 104] });
        const sessionItems = items.filter(item => item.plan_session_id === session.id)
          .sort((a,b) => Number(a.sequence_number) - Number(b.sequence_number));
        sessionItems.forEach((item, index) => {
          const label = (index + 1) + ". " + item.exercise_name_snapshot;
          writeLine(label, { size:9.5, font:"bold", gapAfter:0.5 });
          if (item.group_label) writeLine("Agrupación: " + item.group_label, { size:8, color:[94, 105, 110], indent:3, gapAfter:0.5 });
          if (item.original_notation) writeLine("Notación: " + item.original_notation, { size:8, color:[94, 105, 110], indent:3, gapAfter:0.5 });
          const itemBlocks = blocks.filter(block => block.plan_item_id === item.id)
            .sort((a,b) => Number(a.sequence_number) - Number(b.sequence_number));
          itemBlocks.forEach((block, blockIndex) => {
            const prescription = formatPrescriptionBlock(block);
            const details = [
              "Bloque " + (blockIndex + 1) + ": " + prescription,
              block.rest_seconds != null ? "Descanso " + block.rest_seconds + " s" : "",
              block.tempo ? "Tempo " + block.tempo : "",
              block.intensity_type === "none" ? "Sin carga externa" : ""
            ].filter(Boolean).join(" | ");
            writeLine(details, { size:8.5, indent:4, gapAfter:0.5 });
            if (block.notes) writeLine("Nota: " + block.notes, { size:8, indent:7, color:[89, 99, 104], gapAfter:0.5 });
          });
          if (item.notes) writeLine("Indicaciones: " + item.notes, { size:8, indent:4, color:[89, 99, 104], gapAfter:1.5 });
        });
        y += 2;
      });
    });

    if (plan.notes) {
      sectionHeading(isOwnAiDraft ? "Revisión y observaciones de Coach IA" : "Observaciones");
      writeLine(plan.notes, { size:8.5, color:[76, 86, 91] });
    }

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(218, 224, 220);
      pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(112, 122, 126);
      pdf.text("HF Coach | " + cleanPdfText(athlete.full_name || "Atleta"), margin, pageHeight - 8);
      pdf.text("Página " + page + " de " + pageCount, pageWidth - margin, pageHeight - 8, { align:"right" });
    }

    const safeName = cleanPdfText(athlete.full_name || "atleta")
      .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atleta";
    const fileDate = String(plan.start_date || new Date().toISOString().slice(0,10));
    pdf.save("HF-Coach-" + safeName + "-" + fileDate + ".pdf");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function renderAthletePlans() {
  const c = context();
  if (!c || !c.getAthletePortalData) return;
  const d = c.getAthletePortalData() || {};
  renderAthleteAiOnboarding();
  renderAthleteAiPlanForm();
  const plans = (d.plans || []).filter(p =>
    p.status === "active" || (p.status === "draft" && p.generation_source === "coach_ai_personal")
  ).sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const notificationMarkup = renderAthleteNotifications((d.notifications || []).filter(n => !n.read_at));
  if (!plans.length) {
    $("athletePlans").innerHTML = notificationMarkup + '<div class="empty">Todavía no hay planificaciones publicadas ni propuestas pendientes de revisión.</div>';
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
    $("athletePlans").innerHTML = notificationMarkup + plans.map(plan => {
      const planWeeks = weeks.filter(w => w.plan_id === plan.id);
      const planSessions = sessions.filter(s => s.plan_id === plan.id);
      return '<article class="cp-athlete-plan">' +
        '<div class="cp-athlete-plan-head"><div><h4>' + esc(plan.name) + '</h4><div class="cp-plan-meta">' +
        esc(phaseLabel(plan.training_phase)) + ' · ' + dateLabel(plan.start_date) +
        (plan.end_date ? " – " + dateLabel(plan.end_date) : "") + '</div></div>' +
        '<span class="cp-status-pill ' + (plan.status === "active" ? "published" : "pending-review") + '">' +
        (plan.status === "active" ? "Publicado" : "Pendiente de revisión humana") + '</span></div>' +
        (plan.status === "active"
          ? '<p class="cp-published-note">Tu coach publicó esta planificación el ' + dateLabel(plan.published_at || plan.approved_at) + '.</p>'
          : '<p class="cp-published-note">HF Coach IA generó esta propuesta. No está aprobada ni se considera una planificación activa; un revisor humano debe validar sus ejercicios, volúmenes, intensidades y alertas.</p>') +
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
        (plan.notes ? '<p class="cp-plan-notes">' + esc(plan.notes) + '</p>' : '') +
        '<div class="cp-plan-actions"><button type="button" class="quiet" data-cp-download="' + esc(plan.id) + '">Descargar PDF</button></div>' +
        '</article>';
    }).join("");
  } catch (error) {
    $("athletePlans").innerHTML = notificationMarkup + '<div class="status error">La planificación está publicada, pero no se pudieron cargar todos sus bloques: ' + esc(error.message || error) + '</div>';
  }
}
function onCycleClick(event) {
  const button = event.target.closest("[data-cp-publish], [data-cp-view], [data-cp-notification-read], [data-cp-download]");
  if (!button) return;
  if (button.hasAttribute("data-cp-download")) {
    downloadAthletePlanPdf(button.dataset.cpDownload, button).catch(error => {
      $("athletePlans").insertAdjacentHTML("afterbegin",
        '<div class="status error">No se pudo descargar el PDF: ' + esc(error.message || error) + '</div>');
    });
    return;
  }
  if (button.hasAttribute("data-cp-notification-read")) {
    markNotificationRead(button.dataset.cpNotificationRead).catch(error => {
      $("athletePlans").insertAdjacentHTML("afterbegin", '<div class="status error">No se pudo marcar el aviso como leído: ' + esc(error.message || error) + '</div>');
    });
    return;
  }
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
  $("cpGenerateWithAI").addEventListener("click", () => generatePlanWithAI().catch(error => setStatus(error.message || error, "error")));
  $("cpAthlete").addEventListener("change", () => {
    setOptionsFromAthlete();
    if (aiGeneratedAthleteId && $("cpAthlete").value !== aiGeneratedAthleteId) {
      const selectedAthleteId = $("cpAthlete").value;
      clearEditor();
      $("cpAthlete").value = selectedAthleteId;
      setOptionsFromAthlete();
      setStatus("La propuesta anterior se retiró para evitar asignarla a otro atleta. Generá o importá una nueva planificación.", "error");
    }
  });
  $("cpImportWeeklyPlan").addEventListener("click", () => { try { importWeeklyPlanFromChat(); } catch (error) { setStatus(error.message || error, "error"); } });
  $("cpCycleForm").addEventListener("submit", saveDraft);
  $("cpLoadTemplate").addEventListener("click", () => {
    try { useSelectedTemplate(); } catch (error) { setStatus(error.message || error, "error"); }
  });
  $("cpSaveTemplate").addEventListener("click", async () => {
    try { await saveTemplate(); } catch (error) { setStatus(error.message || error, "error"); }
  });
  $("cpLoadZetaExample").addEventListener("click", zetaExample);
  $("cpPlanList").addEventListener("click", onCycleClick);
  $("athletePlans").addEventListener("click", onCycleClick);
  if ($("athleteAiPlanForm")) $("athleteAiPlanForm").addEventListener("submit", submitAthleteAiPlan);
  if ($("athleteAiOnboardingForm")) {
    $("athleteAiOnboardingForm").addEventListener("submit", submitAthleteAiOnboarding);
    $("athleteAiOnboardingForm").addEventListener("change", event => {
      if (event.target.id === "athleteAiHealthStatus") setAthleteAiHealthFields();
      if (event.target.matches("#athleteAiSnatchNotTested,#athleteAiCleanJerkNotTested,#athleteAiBackSquatNotTested,#athleteAiFrontSquatNotTested")) setAthleteAiRmFields();
    });
  }
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
