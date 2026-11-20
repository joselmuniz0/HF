
import test from "node:test";
import assert from "node:assert/strict";
import { computeTargetLoad, computeWeekTotals, formatPrescriptionBlock, validateCycle } from "../prototypes/training-cycle/cycle-core.mjs";

test("calcula total semanal como suma OLY y fuerza cuando no se informa un total", () => {
  assert.deepEqual(computeWeekTotals(129, 60, ""), { oly: 129, strength: 60, total: 189 });
});

test("respeta un total semanal cargado manualmente", () => {
  assert.equal(computeWeekTotals(129, 60, 191).total, 191);
});

test("convierte porcentajes positivos a kilos usando incrementos de 0,5 kg", () => {
  assert.equal(computeTargetLoad(85, 75), 64);
  assert.equal(computeTargetLoad(80, 102), 81.5);
});

test("no convierte porcentajes negativos: conserva la prescripción como notación", () => {
  assert.equal(computeTargetLoad(-40, 100), null);
});

test("mantiene la secuencia de repeticiones de un complejo", () => {
  assert.equal(formatPrescriptionBlock({ sets: 2, reps: "1+1+1", intensity_type: "percent", intensity_value: 75 }), "2 × 1+1+1 · 75%");
});

test("valida estructura de semanas, sesiones, ejercicios y bloques sin sumar repeticiones de complejos", () => {
  const cycle = {
    weeks: [{ week_number: 1, oly_repetitions: 129, strength_repetitions: 60, total_repetitions: 189 }],
    sessions: [{
      week_number: 1, day_number: 1, session_order: 1, session_title: "Día 1",
      exercises: [{ exercise_name: "Clean + Front Squat + Jerk", blocks: [
        { sets: 2, reps: "1+1+1", intensity_type: "percent", intensity_value: 75 }
      ] }]
    }]
  };
  assert.deepEqual(validateCycle(cycle), []);
});

test("rechaza sesiones duplicadas y referencias a semanas inexistentes", () => {
  const cycle = {
    weeks: [{ week_number: 1 }],
    sessions: [
      { week_number: 1, day_number: 1, session_title: "Día 1", exercises: [{ exercise_name: "Snatch", blocks: [{ sets: 1, reps: "1" }] }] },
      { week_number: 2, day_number: 1, session_title: "Día 1", exercises: [{ exercise_name: "Clean", blocks: [{ sets: 1, reps: "1" }] }] },
      { week_number: 1, day_number: 1, session_title: "Otra sesión", exercises: [{ exercise_name: "Jerk", blocks: [{ sets: 1, reps: "1" }] }] }
    ]
  };
  assert.ok(validateCycle(cycle).some(e => e.includes("semana inexistente")));
  assert.ok(validateCycle(cycle).some(e => e.includes("duplicadas")));
});
