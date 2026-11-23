const test = require("node:test");
const assert = require("node:assert/strict");
const { validateGeneratedPlan, outputSchema } = require("../api/coach-ai-planning.js");

function block(overrides = {}) {
  return Object.assign({
    sets: 3,
    reps: "2",
    intensity_type: "rpe",
    intensity_value: 6.5,
    reference_exercise: "",
    reference_load_kg: null,
    target_load_kg: null,
    target_rpe: 6.5,
    rest_seconds: 120,
    tempo: "",
    notes: "",
    manual_load_kg: null
  }, overrides);
}
function exercise(name, blocks) {
  return {
    exercise_name: name,
    exercise_kind: "single",
    group_type: "",
    group_label: "",
    original_notation: "",
    notes: "",
    blocks
  };
}
function session(day, exercises) {
  return {
    week_number: 1,
    day_number: day,
    session_reference: "",
    session_title: "Sesión",
    focus: "Técnica y potencia",
    notes: "",
    exercises
  };
}
function generated() {
  return {
    plan: {
      name: "Semana de preparación",
      objective: "Técnica, aceleración y carga",
      notes: "Propuesta revisable.",
      weeks: [{
        week_number: 1,
        period: "preparatorio",
        athlete_level: 5,
        oly_repetitions: 50,
        strength_repetitions: 30,
        total_repetitions: 80,
        notes: ""
      }],
      sessions: [
        session(1, [exercise("Snatch", [
          block({ intensity_type: "percent", intensity_value: 75, reference_exercise: "Snatch", target_rpe: null }),
          block({ intensity_type: "percent", intensity_value: -5, reference_exercise: "Snatch", target_rpe: null })
        ])]),
        session(3, [exercise("Tempo Back Squat", [
          block({ intensity_type: "kg", intensity_value: 70, target_load_kg: 70, target_rpe: 7 })
        ])]),
        session(5, [exercise("Back Squat", [
          block({ intensity_type: "kg", intensity_value: 110, target_load_kg: 110, target_rpe: 7 })
        ])])
      ]
    },
    review: {
      summary: "Propuesta creada con los datos disponibles y pendiente de revisión del coach.",
      data_used: ["Marcas validadas", "Sesiones registradas"],
      data_gaps: [],
      coach_checks: [],
      risk_flags: []
    }
  };
}
const input = {
  trainingDays: [1, 3, 5],
  startDate: "2026-11-23",
  phase: "general_preparation",
  level: 5,
  objective: "Desarrollo general"
};
const data = {
  records: [{
    exercise_name_snapshot: "Snatch",
    record_value_kg: 60,
    record_date: "2026-10-01",
    validation_status: "validated"
  }, {
    exercise_name_snapshot: "Clean & Jerk",
    record_value_kg: 80,
    record_date: "2026-10-01",
    validation_status: "pending_validation"
  }],
  sessionItems: [{
    exercise_name_snapshot: "Back Squat",
    load_kg: 100
  }]
};

test("recalcula porcentajes solo con marcas validadas y no convierte porcentajes negativos", () => {
  const result = validateGeneratedPlan(generated(), input, data);
  const snatchBlocks = result.plan.sessions[0].exercises[0].blocks;
  assert.equal(snatchBlocks[0].reference_load_kg, 60);
  assert.equal(snatchBlocks[0].target_load_kg, 45);
  assert.equal(snatchBlocks[1].reference_load_kg, 60);
  assert.equal(snatchBlocks[1].target_load_kg, null);
});

test("convierte cargas sin historial comparable o por encima del umbral a RPE", () => {
  const result = validateGeneratedPlan(generated(), input, data);
  const tempoBlock = result.plan.sessions[1].exercises[0].blocks[0];
  const squatBlock = result.plan.sessions[2].exercises[0].blocks[0];
  assert.equal(tempoBlock.intensity_type, "rpe");
  assert.equal(tempoBlock.target_load_kg, null);
  assert.equal(squatBlock.intensity_type, "rpe");
  assert.equal(squatBlock.target_load_kg, null);
  assert.ok(result.review.coach_checks.length >= 2);
});

test("marca los registros y mediciones pendientes sin tratarlos como RM validadas", () => {
  const result = validateGeneratedPlan(generated(), input, {
    records: data.records,
    measurements: [{
      metric_key: "body_weight",
      metric_value: 100,
      unit: "kg",
      validation_status: "pending_validation"
    }],
    sessionItems: data.sessionItems
  });
  assert.ok(result.review.coach_checks.some(item => item.includes("Clean & Jerk") && item.includes("No se utilizó como RM")));
  assert.ok(result.review.coach_checks.some(item => item.includes("body_weight") && item.includes("pendiente de validación")));
});

test("construye las fechas del microciclo y conserva el total semanal", () => {
  const result = validateGeneratedPlan(generated(), input, data);
  assert.equal(result.plan.weeks[0].total_repetitions, 80);
  assert.deepEqual(result.plan.sessions.map(item => item.scheduled_date), [
    "2026-11-23", "2026-11-25", "2026-11-27"
  ]);
});

test("rechaza una respuesta que no respeta los días elegidos", () => {
  const bad = generated();
  bad.plan.sessions[2].day_number = 4;
  assert.throws(() => validateGeneratedPlan(bad, input, data), /días distintos/);
});

test("usa un esquema JSON estricto para la salida del modelo", () => {
  assert.equal(outputSchema.additionalProperties, false);
  assert.equal(outputSchema.properties.plan.additionalProperties, false);
  assert.equal(outputSchema.properties.plan.properties.sessions.items.additionalProperties, false);
});
