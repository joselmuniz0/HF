
export function computeTargetLoad(percent, referenceLoadKg, increment = 0.5) {
  const p = Number(percent);
  const rm = Number(referenceLoadKg);
  const step = Number(increment);
  if (!Number.isFinite(p) || !Number.isFinite(rm) || !Number.isFinite(step) || rm <= 0 || step <= 0 || p < 0) return null;
  const raw = rm * p / 100;
  const rounded = Math.round(raw / step) * step;
  return Number(rounded.toFixed(2));
}

export function computeWeekTotals(oly, strength, manualTotal) {
  const toOptional = value => value === "" || value === null || value === undefined ? null : Number(value);
  const a = toOptional(oly);
  const b = toOptional(strength);
  const manual = toOptional(manualTotal);
  const total = manual !== null && Number.isFinite(manual)
    ? manual
    : Number.isFinite(a) && Number.isFinite(b) ? a + b : null;
  return { oly: a, strength: b, total };
}

export function formatPrescriptionBlock(block = {}) {
  const series = block.sets == null || block.sets === "" ? "—" : String(block.sets);
  const reps = String(block.reps ?? "—");
  const kind = block.intensity_type || "none";
  const value = block.intensity_value;
  let intensity = "";
  if (kind === "percent" && value !== "" && value != null) intensity = " · " + value + "%";
  else if (kind === "kg" && value !== "" && value != null) intensity = " · " + value + " kg";
  else if (kind === "rpe" && value !== "" && value != null) intensity = " · RPE " + value;
  const ref = block.reference_exercise ? " de " + block.reference_exercise : "";
  const load = block.target_load_kg != null && block.target_load_kg !== "" ? " (" + block.target_load_kg + " kg)" : "";
  return series + " × " + reps + intensity + ref + load;
}

export function validateCycle(cycle) {
  const errors = [];
  const weeks = Array.isArray(cycle?.weeks) ? cycle.weeks : [];
  const sessions = Array.isArray(cycle?.sessions) ? cycle.sessions : [];
  if (!weeks.length) errors.push("Agregá al menos un microciclo.");
  if (!sessions.length) errors.push("Agregá al menos una sesión.");
  const weekSet = new Set();
  weeks.forEach((week, index) => {
    const number = Number(week.week_number);
    if (!Number.isInteger(number) || number < 1) errors.push("El número de la semana " + (index + 1) + " no es válido.");
    if (weekSet.has(number)) errors.push("No puede haber dos semanas con el mismo número.");
    weekSet.add(number);
    ["oly_repetitions", "strength_repetitions", "total_repetitions"].forEach(key => {
      const value = week[key];
      if (value !== null && value !== undefined && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
        errors.push("Revisá los totales de la semana " + number + ".");
      }
    });
  });
  const slots = new Set();
  sessions.forEach((session, index) => {
    const week = Number(session.week_number);
    const day = Number(session.day_number);
    if (!weekSet.has(week)) errors.push("La sesión " + (index + 1) + " apunta a una semana inexistente.");
    if (!Number.isInteger(day) || day < 1 || day > 7) errors.push("El día de la sesión " + (index + 1) + " no es válido.");
    const slot = week + ":" + day + ":" + Number(session.session_order || 1);
    if (slots.has(slot)) errors.push("Hay sesiones duplicadas en la misma semana y día.");
    slots.add(slot);
    if (!String(session.session_title || "").trim()) errors.push("Cada sesión necesita un título.");
    const exercises = Array.isArray(session.exercises) ? session.exercises : [];
    if (!exercises.length) errors.push("La sesión " + (index + 1) + " debe tener ejercicios.");
    exercises.forEach((exercise, exerciseIndex) => {
      if (!String(exercise.exercise_name || "").trim()) errors.push("Falta el nombre de un ejercicio en la sesión " + (index + 1) + ".");
      const blocks = Array.isArray(exercise.blocks) ? exercise.blocks : [];
      if (!blocks.length) errors.push("El ejercicio " + (exerciseIndex + 1) + " necesita al menos un bloque.");
      blocks.forEach((block, blockIndex) => {
        if (!Number.isInteger(Number(block.sets)) || Number(block.sets) < 1) errors.push("Las series del bloque " + (blockIndex + 1) + " deben ser enteras y positivas.");
        if (!String(block.reps || "").trim()) errors.push("Cada bloque debe indicar repeticiones o duración.");
        if (block.intensity_type === "percent" && (!Number.isFinite(Number(block.intensity_value)) || Number(block.intensity_value) < -200 || Number(block.intensity_value) > 300)) {
          errors.push("El porcentaje del bloque " + (blockIndex + 1) + " debe estar entre -200 y 300.");
        }
      });
    });
  });
  return errors;
}
