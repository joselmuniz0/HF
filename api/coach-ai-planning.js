const SUPABASE_URL = (process.env.HF_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.HF_SUPABASE_PUBLISHABLE_KEY || "";
const AI_MODEL = "openai/gpt-6.2-sol";

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0" };

function send(res, status, body) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(jsonHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function uuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeText(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeExercise(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function restSchemaObject(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}
const nullableNumber = { type: ["number", "null"] };
const nullableInteger = { type: ["integer", "null"] };

const blockSchema = restSchemaObject({
  sets: { type: "integer", minimum: 1, maximum: 50 },
  reps: { type: "string", minLength: 1, maxLength: 40 },
  intensity_type: { type: "string", enum: ["percent", "kg", "rpe", "none"] },
  intensity_value: nullableNumber,
  reference_exercise: { type: "string", maxLength: 100 },
  reference_load_kg: nullableNumber,
  target_load_kg: nullableNumber,
  target_rpe: nullableNumber,
  rest_seconds: nullableInteger,
  tempo: { type: "string", maxLength: 40 },
  notes: { type: "string", maxLength: 500 },
  manual_load_kg: nullableNumber
}, ["sets", "reps", "intensity_type", "intensity_value", "reference_exercise", "reference_load_kg", "target_load_kg", "target_rpe", "rest_seconds", "tempo", "notes", "manual_load_kg"]);

const exerciseSchema = restSchemaObject({
  exercise_name: { type: "string", minLength: 2, maxLength: 120 },
  exercise_kind: { type: "string", enum: ["single", "complex", "circuit", "accessory"] },
  group_type: { type: "string", maxLength: 40 },
  group_label: { type: "string", maxLength: 60 },
  original_notation: { type: "string", maxLength: 120 },
  notes: { type: "string", maxLength: 500 },
  blocks: { type: "array", minItems: 1, maxItems: 10, items: blockSchema }
}, ["exercise_name", "exercise_kind", "group_type", "group_label", "original_notation", "notes", "blocks"]);

const weekSchema = restSchemaObject({
  week_number: { type: "integer", minimum: 1, maximum: 1 },
  period: { type: "string", enum: ["preparatorio", "competitivo", "transicion"] },
  athlete_level: nullableInteger,
  oly_repetitions: nullableInteger,
  strength_repetitions: nullableInteger,
  total_repetitions: nullableInteger,
  notes: { type: "string", maxLength: 700 }
}, ["week_number", "period", "athlete_level", "oly_repetitions", "strength_repetitions", "total_repetitions", "notes"]);

const sessionSchema = restSchemaObject({
  week_number: { type: "integer", minimum: 1, maximum: 1 },
  day_number: { type: "integer", minimum: 1, maximum: 7 },
  session_reference: { type: "string", maxLength: 40 },
  session_title: { type: "string", minLength: 2, maxLength: 120 },
  focus: { type: "string", maxLength: 400 },
  notes: { type: "string", maxLength: 700 },
  exercises: { type: "array", minItems: 1, maxItems: 20, items: exerciseSchema }
}, ["week_number", "day_number", "session_reference", "session_title", "focus", "notes", "exercises"]);

const outputSchema = restSchemaObject({
  plan: restSchemaObject({
    name: { type: "string", minLength: 2, maxLength: 120 },
    objective: { type: "string", maxLength: 500 },
    notes: { type: "string", maxLength: 1500 },
    weeks: { type: "array", minItems: 1, maxItems: 1, items: weekSchema },
    sessions: { type: "array", minItems: 1, maxItems: 7, items: sessionSchema }
  }, ["name", "objective", "notes", "weeks", "sessions"]),
  review: restSchemaObject({
    summary: { type: "string", minLength: 10, maxLength: 1200 },
    data_used: { type: "array", maxItems: 12, items: { type: "string", maxLength: 240 } },
    data_gaps: { type: "array", maxItems: 12, items: { type: "string", maxLength: 240 } },
    coach_checks: { type: "array", maxItems: 12, items: { type: "string", maxLength: 240 } },
    risk_flags: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } }
  }, ["summary", "data_used", "data_gaps", "coach_checks", "risk_flags"])
}, ["plan", "review"]);

async function readRows(table, filters, accessToken, warnings, required = false) {
  const params = new URLSearchParams(filters);
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + params.toString(), {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (!response.ok) {
    const message = table + " (" + response.status + ")";
    if (required) throw new Error("No se pudo verificar el acceso a los datos del atleta: " + message);
    warnings.push("Fuente no disponible para el análisis: " + message);
    return [];
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function buildDateForDay(monday, dayNumber) {
  const date = new Date(monday + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toISOString().slice(0, 10);
}

function validateGeneratedPlan(output, input, data) {
  if (!output || !output.plan || !output.review) throw new Error("La respuesta de IA no tiene la estructura esperada.");
  const plan = output.plan;
  const review = output.review;
  if (!Array.isArray(plan.weeks) || plan.weeks.length !== 1) throw new Error("La IA no devolvió un único microciclo semanal.");
  if (!Array.isArray(plan.sessions) || plan.sessions.length !== input.trainingDays.length) throw new Error("La IA no respetó la cantidad de días seleccionados.");

  const selectedDays = [...input.trainingDays].sort((a, b) => a - b);
  const sessions = [...plan.sessions].sort((a, b) => Number(a.day_number) - Number(b.day_number));
  const returnedDays = sessions.map(session => Number(session.day_number));
  if (returnedDays.some((day, index) => day !== selectedDays[index])) {
    throw new Error("La IA devolvió días distintos de los seleccionados.");
  }

  const validatedRecords = (data.records || []).filter(record => record.validation_status === "validated");
  const recordMap = new Map();
  for (const record of validatedRecords) {
    const key = normalizeExercise(record.exercise_name_snapshot);
    const current = recordMap.get(key);
    if (!current || String(record.record_date || "") > String(current.record_date || "")) recordMap.set(key, record);
  }
  const observedLoads = new Map();
  for (const item of data.sessionItems || []) {
    const key = normalizeExercise(item.exercise_name_snapshot);
    const load = Number(item.load_kg);
    if (!key || !Number.isFinite(load) || load <= 0) continue;
    const previous = observedLoads.get(key) || [];
    previous.push(load);
    observedLoads.set(key, previous);
  }

  const coachChecks = new Set((Array.isArray(review.coach_checks) ? review.coach_checks : []).map(safeText).filter(Boolean));
  const pendingRecords = (data.records || []).filter(record => record.validation_status !== "validated");
  const pendingMeasurements = (data.measurements || []).filter(item => item.validation_status !== "validated");
  for (const record of pendingRecords) {
    coachChecks.add("Marca declarada pendiente de validación: " + safeText(record.exercise_name_snapshot, 100) +
      " (" + Number(record.record_value_kg).toLocaleString("es-AR") + " kg). No se utilizó como RM de referencia.");
  }
  for (const measurement of pendingMeasurements) {
    coachChecks.add("Medición declarada pendiente de validación: " + safeText(measurement.metric_key, 80) +
      " (" + Number(measurement.metric_value).toLocaleString("es-AR") + " " + safeText(measurement.unit, 20) + ").");
  }
  const week = plan.weeks[0];
  week.week_number = 1;
  week.period = input.phase === "competition" ? "competitivo" : input.phase === "transition" ? "transicion" : "preparatorio";
  week.athlete_level = input.level == null ? null : input.level;
  if (Number.isInteger(week.oly_repetitions) && Number.isInteger(week.strength_repetitions)) {
    week.total_repetitions = week.oly_repetitions + week.strength_repetitions;
  } else {
    week.total_repetitions = null;
  }

  for (const session of sessions) {
    const day = Number(session.day_number);
    session.week_number = 1;
    session.session_order = 1;
    session.session_reference = DAY_NAMES[day - 1];
    session.scheduled_date = buildDateForDay(input.startDate, day);
    for (const exercise of session.exercises) {
      if (!Array.isArray(exercise.blocks) || exercise.blocks.length < 1) throw new Error("Un ejercicio quedó sin bloques de prescripción.");
      for (const block of exercise.blocks) {
        const type = block.intensity_type;
        const value = block.intensity_value == null ? null : Number(block.intensity_value);
        if (!Number.isInteger(Number(block.sets)) || Number(block.sets) < 1 || !safeText(block.reps, 40)) {
          throw new Error("Una prescripción tiene series o repeticiones inválidas.");
        }
        if (type === "percent") {
          if (value == null || value < -100 || value > 200) throw new Error("Una intensidad porcentual está fuera del rango permitido.");
          const reference = recordMap.get(normalizeExercise(block.reference_exercise));
          if (value < 0) {
            block.reference_load_kg = reference ? Number(reference.record_value_kg) : null;
            block.target_load_kg = null;
            block.manual_load_kg = null;
          } else if (!reference) {
            block.reference_load_kg = null;
            block.target_load_kg = null;
            block.manual_load_kg = null;
            coachChecks.add("Verificar RM de referencia para " + exercise.exercise_name + "; no se asignó una carga en kg porque no hay una marca validada coincidente.");
          } else {
            const referenceLoad = Number(reference.record_value_kg);
            if (!Number.isFinite(referenceLoad) || referenceLoad <= 0) throw new Error("Una marca validada tiene un valor de referencia inválido.");
            block.reference_exercise = reference.exercise_name_snapshot;
            block.reference_load_kg = referenceLoad;
            block.target_load_kg = Math.round(referenceLoad * value / 100 * 2) / 2;
            block.manual_load_kg = null;
          }
        } else if (type === "kg") {
          const loads = observedLoads.get(normalizeExercise(exercise.exercise_name)) || [];
          const maxObserved = loads.length ? Math.max(...loads) : null;
          const proposed = block.target_load_kg == null ? value : Number(block.target_load_kg);
          if (maxObserved == null) {
            block.intensity_type = "rpe";
            block.target_rpe = block.target_rpe == null ? 6 : Number(block.target_rpe);
            block.intensity_value = block.target_rpe;
            block.target_load_kg = null;
            block.manual_load_kg = null;
            coachChecks.add("La carga en kg de " + exercise.exercise_name + " quedó expresada en RPE: no existen registros históricos comparables.");
          } else if (proposed != null && Number.isFinite(proposed) && proposed > maxObserved * 1.05) {
            block.intensity_type = "rpe";
            block.target_rpe = block.target_rpe == null ? 6 : Number(block.target_rpe);
            block.intensity_value = block.target_rpe;
            block.target_load_kg = null;
            block.manual_load_kg = null;
            coachChecks.add("La carga propuesta para " + exercise.exercise_name + " se dejó en RPE: supera en más de 5% el mayor registro reciente comparable.");
          } else {
            block.intensity_value = proposed;
            block.target_load_kg = proposed;
            block.manual_load_kg = null;
          }
        } else if (type === "rpe") {
          const rpe = block.target_rpe == null ? value : Number(block.target_rpe);
          if (rpe == null || rpe < 1 || rpe > 10) throw new Error("Una intensidad RPE está fuera del rango permitido.");
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
        if (block.target_rpe != null && (Number(block.target_rpe) < 1 || Number(block.target_rpe) > 10)) {
          throw new Error("El RPE objetivo debe estar entre 1 y 10.");
        }
        if (block.rest_seconds != null && (Number(block.rest_seconds) < 0 || Number(block.rest_seconds) > 3600)) {
          throw new Error("El descanso de un bloque está fuera del rango permitido.");
        }
        block.sets = Number(block.sets);
        block.reps = safeText(block.reps, 40);
        block.notes = safeText(block.notes, 500);
        block.tempo = safeText(block.tempo, 40);
      }
    }
  }

  return {
    plan: {
      name: safeText(plan.name, 120) || "Planificación semanal asistida por IA",
      objective: safeText(plan.objective, 500) || input.objective,
      notes: safeText(plan.notes, 1500),
      weeks: [week],
      sessions
    },
    review: {
      summary: safeText(review.summary, 1200),
      data_used: Array.isArray(review.data_used) ? review.data_used.map(s => safeText(s, 240)).filter(Boolean) : [],
      data_gaps: Array.isArray(review.data_gaps) ? review.data_gaps.map(s => safeText(s, 240)).filter(Boolean) : [],
      coach_checks: [...coachChecks],
      risk_flags: Array.isArray(review.risk_flags) ? review.risk_flags.map(s => safeText(s, 240)).filter(Boolean) : []
    }
  };
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (origin && host && new URL(origin).host !== host) return send(res, 403, { error: "Origen no autorizado." });
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  if (!SUPABASE_URL || !SUPABASE_KEY) return send(res, 503, { error: "Falta configurar Supabase en el entorno de HF Coach." });

  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return send(res, 403, { error: "Origen no autorizado." });
    } catch (_) {
      return send(res, 403, { error: "Origen no válido." });
    }
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!accessToken) return send(res, 401, { error: "Iniciá sesión en HF Coach para generar una planificación." });

  const oidcToken = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || "";
  if (!oidcToken) return send(res, 503, { error: "El entorno de IA de Vercel todavía no está habilitado para este proyecto." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const athleteId = body.athleteId;
  const startDate = body.startDate;
  const trainingDays = Array.isArray(body.trainingDays) ? body.trainingDays.map(Number) : [];
  const phase = ["general_preparation", "specific_preparation", "competition", "transition"].includes(body.phase)
    ? body.phase : "general_preparation";
  const levelValue = body.level == null || body.level === "" ? null : Number(body.level);
  const duration = Number(body.durationMinutes || 85);
  const objective = safeText(body.objective, 500);
  const coachInstructions = safeText(body.coachInstructions, 1200);

  if (!uuid(athleteId)) return send(res, 400, { error: "Seleccioná un atleta válido." });
  if (!isoDate(startDate) || new Date(startDate + "T12:00:00Z").getUTCDay() !== 1) {
    return send(res, 400, { error: "La fecha de inicio de la planificación debe ser lunes." });
  }
  if (trainingDays.length < 1 || trainingDays.length > 7 || new Set(trainingDays).size !== trainingDays.length || trainingDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    return send(res, 400, { error: "Seleccioná entre uno y siete días de entrenamiento válidos." });
  }
  if (!Number.isFinite(duration) || duration < 45 || duration > 150) return send(res, 400, { error: "La duración debe estar entre 45 y 150 minutos." });
  if (levelValue != null && (!Number.isInteger(levelValue) || levelValue < 1 || levelValue > 10)) return send(res, 400, { error: "El nivel del atleta debe estar entre 1 y 10." });

  try {
    const authResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + accessToken, Accept: "application/json" }
    });
    if (!authResponse.ok) return send(res, 401, { error: "La sesión de HF Coach venció. Volvé a iniciar sesión." });
    const user = await authResponse.json();
    if (!uuid(user.id)) return send(res, 401, { error: "No se pudo validar la cuenta de HF Coach." });

    const warnings = [];
    const athletes = await readRows("athletes", {
      select: "id,organization_id,age,level,sex,body_weight_kg,notes,snatch_kg,clean_jerk_kg",
      id: "eq." + athleteId,
      limit: "1"
    }, accessToken, warnings, true);
    if (!athletes.length) return send(res, 404, { error: "No tenés acceso a este atleta o no existe." });
    const athlete = athletes[0];

    const [memberships, aiAssignments] = await Promise.all([
      readRows("organization_memberships", {
        select: "role",
        user_id: "eq." + user.id,
        organization_id: "eq." + athlete.organization_id,
        limit: "1"
      }, accessToken, warnings, true),
      readRows("athlete_ai_coach_assignments", {
        select: "athlete_id,status",
        user_id: "eq." + user.id,
        organization_id: "eq." + athlete.organization_id,
        status: "eq.active",
        limit: "10"
      }, accessToken, warnings, true)
    ]);
    const hasCoachRole = memberships.some(row => row.role === "coach" || row.role === "admin");
    const ownAiAssignment = aiAssignments.find(row =>
      row.status === "active" && row.athlete_id === athleteId
    );
    if (!hasCoachRole && !ownAiAssignment) {
      return send(res, 403, { error: "La generación asistida requiere rol de coach/administrador o una vinculación activa de tu propia cuenta con HF Coach IA." });
    }
    if (!hasCoachRole && aiAssignments.some(row => row.status === "active") && !ownAiAssignment) {
      return send(res, 403, { error: "Coach IA solo puede generar propuestas para la ficha deportiva vinculada a tu propia cuenta." });
    }

    const [profiles, records, measurements, aiOnboardingRows, healthDeclarations, rawSessions, rawItems, plans, weeks, planSessions, planItems, blocks, evaluations] = await Promise.all([
      readRows("athlete_profiles", { select: "sporting_start_date,federation,dominant_side,profile_notes", athlete_id: "eq." + athleteId, limit: "1" }, accessToken, warnings),
      readRows("athlete_personal_records", { select: "exercise_name_snapshot,record_value_kg,record_date,record_type,validation_status", athlete_id: "eq." + athleteId, order: "record_date.desc", limit: "40" }, accessToken, warnings),
      readRows("athlete_measurements", { select: "metric_key,metric_value,unit,measured_at,validation_status,notes", athlete_id: "eq." + athleteId, order: "measured_at.desc", limit: "40" }, accessToken, warnings),
      readRows("athlete_ai_onboarding", { select: "declared_age,height_cm,weight_kg,training_years,training_days_per_week,training_objective,declared_level,level_status,snatch_kg,snatch_not_tested,clean_jerk_kg,clean_jerk_not_tested,back_squat_kg,back_squat_not_tested,front_squat_kg,front_squat_not_tested,profile_status,personal_data_status,sport_data_status,declared_at", athlete_id: "eq." + athleteId, limit: "1" }, accessToken, warnings),
      readRows("athlete_health_declarations", { select: "health_status,chronic_conditions,bone_joint_injuries,muscular_injuries,surgeries,medication_and_treatments,medical_restrictions,other_relevant_history,consent_for_ai_processing,consent_version,declared_at,declaration_status", athlete_id: "eq." + athleteId, order: "declared_at.desc", limit: "1" }, accessToken, warnings),
      readRows("training_sessions", { select: "id,session_date,session_type,main_load_kg,rpe,completion_status,notes", athlete_id: "eq." + athleteId, order: "session_date.desc", limit: "35" }, accessToken, warnings),
      readRows("training_session_items", { select: "training_session_id,exercise_name_snapshot,sets_completed,reps_completed,load_kg,rpe,rest_seconds,notes,created_at", athlete_id: "eq." + athleteId, order: "created_at.desc", limit: "120" }, accessToken, warnings),
      readRows("training_plans", { select: "name,objective,training_phase,start_date,end_date,status,athlete_level,created_at", athlete_id: "eq." + athleteId, order: "created_at.desc", limit: "12" }, accessToken, warnings),
      readRows("training_plan_weeks", { select: "week_number,period,oly_repetitions,strength_repetitions,total_repetitions,notes,plan_id", athlete_id: "eq." + athleteId, order: "week_number.desc", limit: "40" }, accessToken, warnings),
      readRows("training_plan_sessions", { select: "plan_id,week_number,day_number,session_title,focus", athlete_id: "eq." + athleteId, order: "week_number.desc", limit: "50" }, accessToken, warnings),
      readRows("training_plan_items", { select: "plan_session_id,exercise_name_snapshot,exercise_kind,sets,reps,target_load_kg,target_percent_rm,target_rpe,notes", athlete_id: "eq." + athleteId, limit: "100" }, accessToken, warnings),
      readRows("training_plan_item_blocks", { select: "plan_item_id,sets,reps,intensity_type,intensity_value,reference_exercise,reference_load_kg,target_load_kg,target_rpe,rest_seconds,tempo,notes", athlete_id: "eq." + athleteId, limit: "180" }, accessToken, warnings),
      readRows("evaluations", { select: "lift,created_at,metrics,findings,review_status,coach_feedback,confidence", athlete_id: "eq." + athleteId, review_status: "eq.reviewed", order: "created_at.desc", limit: "12" }, accessToken, warnings)
    ]);

    const onboarding = aiOnboardingRows[0] || null;
    const healthDeclaration = healthDeclarations[0] || null;
    if (!hasCoachRole && ownAiAssignment) {
      if (!onboarding || onboarding.profile_status !== "ready_for_ai_planning") {
        const reason = onboarding?.profile_status === "needs_video_assessment"
          ? "Primero completá la evaluación técnica por video y definí el nivel deportivo."
          : "Primero completá tu evaluación inicial y resolvé los estados pendientes de salud o revisión humana.";
        return send(res, 409, { error: reason });
      }
      if (!healthDeclaration || healthDeclaration.health_status !== "no_known_conditions" ||
          healthDeclaration.consent_for_ai_processing !== true) {
        return send(res, 403, { error: "La declaración de salud y su autorización de tratamiento no habilitan todavía la planificación personal con IA." });
      }
    }

    const isCurrentRm = record => {
      const name = String(record.exercise_name_snapshot || "").toLowerCase();
      const matches = [
        { names:["snatch","arranque"], value:onboarding?.snatch_kg, notTested:onboarding?.snatch_not_tested },
        { names:["clean & jerk","clean and jerk","envión"], value:onboarding?.clean_jerk_kg, notTested:onboarding?.clean_jerk_not_tested },
        { names:["back squat","sentadilla trasera"], value:onboarding?.back_squat_kg, notTested:onboarding?.back_squat_not_tested },
        { names:["front squat","sentadilla frontal"], value:onboarding?.front_squat_kg, notTested:onboarding?.front_squat_not_tested }
      ];
      const target = matches.find(item => item.names.includes(name));
      if (!target) return true;
      return !target.notTested && target.value != null &&
        Number(record.record_value_kg) === Number(target.value);
    };
    const eligibleRecords = onboarding ? records.filter(isCurrentRm) : records;
    const validatedRecords = eligibleRecords.filter(record => record.validation_status === "validated");
    const pendingRecords = eligibleRecords.filter(record => record.validation_status !== "validated");
    const validatedMeasurements = measurements.filter(item => item.validation_status === "validated");
    const pendingMeasurements = measurements.filter(item => item.validation_status !== "validated");
    const validatedBodyWeight = validatedMeasurements.find(item => item.metric_key === "body_weight");
    const pendingBodyWeight = pendingMeasurements.find(item => item.metric_key === "body_weight");
    const completedSessions = rawSessions.filter(session => ["completed", "partial"].includes(session.completion_status));
    const completedIds = new Set(completedSessions.map(session => session.id));
    const sessionItems = rawItems.filter(item => completedIds.has(item.training_session_id));
    const trainingDaysSorted = [...trainingDays].sort((a, b) => a - b);
    const scheduledDates = trainingDaysSorted.map(day => ({ day_number: day, date: buildDateForDay(startDate, day) }));

    const contextData = {
      athlete: {
        age: onboarding?.declared_age ?? athlete.age ?? null,
        age_status: onboarding ? "athlete_declared" : "missing",
        declared_level: onboarding?.declared_level ?? null,
        level_status: onboarding?.level_status ?? "missing",
        level_validated: onboarding?.level_status === "coach_validated",
        training_years: onboarding?.training_years ?? null,
        training_days_per_week: onboarding?.training_days_per_week ?? null,
        training_objective: onboarding?.training_objective ?? null,
        height_cm: onboarding?.height_cm ?? validatedMeasurements.find(item => item.metric_key === "height")?.metric_value ?? null,
        height_status: onboarding ? "athlete_declared" : (validatedMeasurements.some(item => item.metric_key === "height") ? "validated" : "missing"),
        level: athlete.level ?? null,
        sex: athlete.sex ?? null,
        body_weight_kg: validatedBodyWeight?.metric_value ?? null,
        body_weight_validation: validatedBodyWeight ? "validated" : (onboarding || pendingBodyWeight) ? "athlete_declared_pending_validation" : "missing",
        reported_body_weight_pending_kg: onboarding?.weight_kg ?? pendingBodyWeight?.metric_value ?? null,
        sporting_start_date: profiles[0]?.sporting_start_date ?? null,
        federation: profiles[0]?.federation ?? null,
        dominant_side: profiles[0]?.dominant_side ?? null,
        profile_notes: safeText(profiles[0]?.profile_notes, 1200),
        general_notes: safeText(athlete.notes, 1200)
      },
      validated_personal_records: validatedRecords.map(record => ({
        exercise: record.exercise_name_snapshot,
        value_kg: record.record_value_kg,
        date: record.record_date,
        type: record.record_type
      })),
      declared_records_pending_validation: pendingRecords.map(record => ({
        exercise: record.exercise_name_snapshot,
        reported_value_kg: record.record_value_kg,
        date: record.record_date,
        validation_status: record.validation_status
      })),
      validated_measurements: validatedMeasurements.map(item => ({
        metric: item.metric_key, value: item.metric_value, unit: item.unit, date: item.measured_at
      })),
      declared_measurements_pending_validation: pendingMeasurements.map(item => ({
        metric: item.metric_key, reported_value: item.metric_value, unit: item.unit,
        date: item.measured_at, validation_status: item.validation_status
      })),
      onboarding_profile_status: onboarding?.profile_status ?? "not_completed",
      declared_level: onboarding ? {
        value: onboarding.declared_level,
        status: onboarding.level_status
      } : null,
      health_declaration: healthDeclaration?.consent_for_ai_processing ? {
        status: healthDeclaration.health_status,
        chronic_conditions: healthDeclaration.chronic_conditions,
        bone_joint_injuries: healthDeclaration.bone_joint_injuries,
        muscular_injuries: healthDeclaration.muscular_injuries,
        surgeries: healthDeclaration.surgeries,
        medication_and_treatments: healthDeclaration.medication_and_treatments,
        medical_restrictions: healthDeclaration.medical_restrictions,
        other_relevant_history: healthDeclaration.other_relevant_history,
        declaration_status: healthDeclaration.declaration_status
      } : { status: healthDeclaration?.health_status ?? "not_reported", details_shared_with_ai: false },
      recent_completed_sessions: completedSessions.slice(0, 24).map(session => ({
        date: session.session_date,
        type: session.session_type,
        main_load_kg: session.main_load_kg,
        rpe: session.rpe,
        completion_status: session.completion_status,
        exercises: sessionItems.filter(item => item.training_session_id === session.id).slice(0, 16).map(item => ({
          exercise: item.exercise_name_snapshot,
          sets: item.sets_completed,
          reps: item.reps_completed,
          load_kg: item.load_kg,
          rpe: item.rpe,
          rest_seconds: item.rest_seconds,
          notes: safeText(item.notes, 180)
        }))
      })),
      previous_plans: plans.map(plan => ({
        name: plan.name,
        objective: plan.objective,
        phase: plan.training_phase,
        start_date: plan.start_date,
        end_date: plan.end_date,
        status: plan.status,
        athlete_level: plan.athlete_level
      })),
      previous_weekly_load: weeks.slice(0, 16),
      previous_sessions: planSessions.slice(0, 30),
      previous_exercises: planItems.slice(0, 50),
      previous_prescription_blocks: blocks.slice(0, 80),
      coach_reviewed_evaluations: evaluations.map(evaluation => ({
        lift: evaluation.lift,
        date: evaluation.created_at,
        metrics: evaluation.metrics,
        findings: evaluation.findings,
        coach_feedback: evaluation.coach_feedback,
        confidence: evaluation.confidence
      })),
      data_quality: {
        validated_personal_records: validatedRecords.length,
        records_pending_or_unvalidated: pendingRecords.length,
        validated_measurements: validatedMeasurements.length,
        measurements_pending_validation: pendingMeasurements.length,
        body_weight_pending_validation: Boolean(pendingBodyWeight || onboarding),
        onboarding_profile_status: onboarding?.profile_status ?? "not_completed",
        health_declaration_status: healthDeclaration?.health_status ?? "not_reported",
        level_status: onboarding?.level_status ?? "missing",
        completed_or_partial_sessions: completedSessions.length,
        recorded_exercise_sets: sessionItems.length,
        prior_plans: plans.length,
        coach_reviewed_evaluations: evaluations.length,
        unavailable_sources: warnings
      }
    };

    const systemPrompt = [
      "Sos Coach IA de HF Coach, una asistencia para planificar halterofilia. Tu salida es una propuesta técnica para revisión de un coach humano, nunca una decisión autónoma.",
      "Principio metodológico central: construir cada sesión y la semana desde el triángulo técnica, aceleración y carga. Técnica: posiciones, trayectoria y consistencia. Aceleración: intención de acelerar la barra y ejercicios que desarrollen velocidad; no inventes mediciones de velocidad si el sistema no las registra. Carga: progresión respaldada por datos y dosificación adecuada. No sacrifiques una dimensión por otra.",
      "El nivel declarado por el atleta (Inicial, Medio o Avanzado) es una autodeclaración orientativa, no una evaluación técnica validada. Usalo como referencia de complejidad y explicá que sigue pendiente de validación; no lo conviertas artificialmente a una escala numérica. Si el nivel es undetermined, no generes una propuesta hasta completar la evaluación por video y su revisión humana.",
      "Analizá el historial con prudencia. Diferenciá registros validados de los pendientes. Los valores dentro de declared_records_pending_validation y declared_measurements_pending_validation son datos declarados: podés mencionarlos como pendientes, pero no los uses para estimar, calcular ni asignar cargas o porcentajes. Para porcentajes usá solo un registro personal validado cuyo nombre de ejercicio coincida con exactitud con la referencia seleccionada y que corresponda a la RM actualmente declarada. No uses registros históricos que el atleta haya reemplazado o marcado como no vigentes. No inventes RM, marcas, kg, RPE, adherencia ni métricas. Si no hay referencia válida, usá RPE o dejá la carga sin asignar y explicá qué debe revisar el coach.",
      "Los complejos se expresan en reps como notación libre (por ejemplo 1+1+1); no conviertas automáticamente esa notación en volumen de repeticiones. No confundas variantes de ejercicios con el ejercicio de referencia. Conservá la notación porcentual negativa como notación sin convertirla a kg.",
      "Programá una semana exacta y una sesión por cada día solicitado. Ajustá el volumen y complejidad al nivel, experiencia, antecedentes registrados y tiempo disponible. Si faltan sesiones o historial, decilo en data_gaps y evitá progresiones supuestas. El trabajo técnico, potencia/aceleración, fuerza y complementario debe tener una lógica semanal coherente.",
      "No hagas diagnóstico médico, no estimes riesgos clínicos y no declares aptitud médica. Si hay antecedentes de salud declarados, tratá el texto únicamente como restricciones/observaciones aportadas por el atleta o coach, no como diagnóstico; conservá alertas para revisión humana y no prescribas ejercicios que contradigan restricciones explícitas. La IA no sustituye una evaluación profesional de salud.",
      "Devolvé únicamente el objeto JSON solicitado por el esquema. No incluyas markdown."
    ].join("\n");

    const userPrompt = {
      requested_week: {
        start_date_monday: startDate,
        sessions: scheduledDates,
        session_duration_max_minutes: duration,
        phase,
        athlete_level_override: levelValue,
        objective,
        coach_instructions: coachInstructions
      },
      athlete_and_training_data: contextData
    };

    const modelResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + oidcToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        stream: false,
        max_completion_tokens: 9000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPrompt) }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "hf_weekly_training_plan",
            description: "Plan semanal estructurado de halterofilia y notas de revisión del coach.",
            strict: true,
            schema: outputSchema
          }
        }
      }),
      signal: AbortSignal.timeout(55000)
    });
    if (!modelResponse.ok) {
      const providerMessage = await modelResponse.text().catch(() => "");
      console.error("HF Coach AI Gateway error", modelResponse.status, providerMessage.slice(0, 500));
      return send(res, 502, { error: "No se pudo generar la planificación con el servicio de IA. Revisá la configuración y volvé a intentar." });
    }
    const completion = await modelResponse.json();
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return send(res, 502, { error: "El servicio de IA no devolvió una planificación estructurada." });
    let generated;
    try { generated = JSON.parse(content); }
    catch (_) { return send(res, 502, { error: "La respuesta del Coach IA no pudo validarse como JSON." }); }

    const result = validateGeneratedPlan(generated, {
      trainingDays: trainingDaysSorted,
      startDate,
      phase,
      level: levelValue,
      objective
    }, { records: eligibleRecords, measurements, sessionItems });
    result.meta = {
      model: AI_MODEL,
      generation_access: hasCoachRole ? "coach" : "athlete_ai_personal",
      data_quality: contextData.data_quality,
      scheduled_dates: scheduledDates
    };

    // A personal athlete request is persisted atomically as a draft.
    // Publishing remains reserved for an authenticated human coach/admin.
    if (!hasCoachRole && ownAiAssignment) {
      const reviewNotes = [
        "PROPUESTA DE HF COACH IA · PENDIENTE DE REVISIÓN HUMANA",
        result.plan.notes,
        "Resumen de revisión IA: " + result.review.summary,
        result.review.data_used.length ? "Datos utilizados: " + result.review.data_used.join(" | ") : "",
        result.review.data_gaps.length ? "Datos faltantes: " + result.review.data_gaps.join(" | ") : "",
        result.review.coach_checks.length ? "Verificaciones pendientes: " + result.review.coach_checks.join(" | ") : "",
        result.review.risk_flags.length ? "Alertas: " + result.review.risk_flags.join(" | ") : ""
      ].filter(Boolean).join("\n");

      const endDate = result.plan.sessions.reduce((latest, session) =>
        String(session.scheduled_date || "") > latest ? String(session.scheduled_date) : latest, startDate
      );
      const persistResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_athlete_ai_weekly_plan", {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          p_athlete_id: athleteId,
          p_name: result.plan.name,
          p_objective: result.plan.objective,
          p_training_phase: phase,
          p_athlete_level: levelValue,
          p_start_date: startDate,
          p_end_date: endDate,
          p_notes: reviewNotes,
          p_weeks: result.plan.weeks,
          p_sessions: result.plan.sessions,
          p_ai_model: AI_MODEL
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!persistResponse.ok) {
        const detail = await persistResponse.text().catch(() => "");
        console.error("HF Coach AI draft persistence failed", persistResponse.status, detail.slice(0, 500));
        if (persistResponse.status === 409) {
          return send(res, 409, { error: "Ya existe una planificación o propuesta para esa semana. Revisá «Mi planificación» antes de generar otra." });
        }
        return send(res, 502, { error: "La semana se generó, pero no pudo guardarse como propuesta pendiente de revisión. No se publicó ni quedó registrada." });
      }
      const savedPlanId = await persistResponse.json().catch(() => null);
      if (!uuid(savedPlanId)) {
        console.error("HF Coach AI draft persistence returned an invalid plan ID", savedPlanId);
        return send(res, 502, { error: "La propuesta no pudo confirmarse en la base de datos. No se anunció como guardada." });
      }
      result.meta.saved_plan_id = savedPlanId;
      result.meta.saved_plan_status = "draft";
      result.meta.human_review_required = true;
      result.meta.review_status_label = "pending_human_review";
    }
    return send(res, 200, result);
  } catch (error) {
    console.error("HF Coach AI planning failed", error);
    return send(res, 500, { error: safeText(error && error.message, 500) || "No se pudo generar la planificación." });
  }
}

module.exports = handler;
module.exports.validateGeneratedPlan = validateGeneratedPlan;
module.exports.outputSchema = outputSchema;
