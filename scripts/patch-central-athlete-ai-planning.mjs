import fs from "node:fs";
import path from "node:path";

const adminDir = path.resolve(".hf-central/admin");
const htmlPath = path.join(adminDir, "index.html");
const cssPath = path.join(adminDir, "styles.css");
let html = fs.readFileSync(htmlPath, "utf8");

const marker = '      <section class="panel"><h3>Mi planificación</h3><div id="athletePlans"></div></section>';
if (!html.includes('id="athleteAiPlanPanel"')) {
  if (!html.includes(marker)) throw new Error("HF athlete AI plan: no se encontró el panel Mi planificación.");
  const panel = [
    '      <section id="athleteAiPlanPanel" class="panel athlete-ai-plan-panel" hidden>',
    '        <div class="section-head"><div><h3>Coach IA · mi semana</h3><p class="muted">Generá una propuesta personal basada en tu historia deportiva. Se guardará para revisión humana; no se publica automáticamente.</p></div></div>',
    '        <form id="athleteAiPlanForm" class="athlete-ai-plan-form">',
    '          <label>Comienzo de la semana<input id="athleteAiPlanStart" type="date" required></label>',
    '          <fieldset class="athlete-ai-days"><legend>Días de entrenamiento</legend>',
    '            <label><input type="checkbox" data-athlete-ai-day value="1" checked> Lunes</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="2" checked> Martes</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="3" checked> Miércoles</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="4"> Jueves</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="5" checked> Viernes</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="6"> Sábado</label>',
    '            <label><input type="checkbox" data-athlete-ai-day value="7"> Domingo</label>',
    '          </fieldset>',
    '          <label>Duración máxima por sesión<select id="athleteAiPlanDuration"><option value="75">75 minutos</option><option value="85" selected>85 minutos</option><option value="90">90 minutos</option></select></label>',
    '          <label>Fase<select id="athleteAiPlanPhase"><option value="general_preparation">Preparación general</option><option value="specific_preparation">Preparación específica</option><option value="competition">Competencia</option><option value="transition">Transición</option></select></label>',
    '          <label class="athlete-ai-wide">Objetivo de la semana<textarea id="athleteAiPlanObjective" rows="2" maxlength="500"></textarea></label>',
    '          <label class="athlete-ai-wide">Observaciones para Coach IA (opcional)<textarea id="athleteAiPlanNotes" rows="2" maxlength="1200" placeholder="Disponibilidad, cambios de agenda o aspectos del entrenamiento que quieras señalar…"></textarea></label>',
    '          <button id="athleteAiPlanGenerate" type="submit" class="primary">Generar mi semana con Coach IA</button>',
    '        </form>',
    '        <p id="athleteAiPlanStatus" class="status" role="status" aria-live="polite"></p>',
    '      </section>'
  ].join("\n");
  html = html.replace(marker, panel + "\n" + marker);
  fs.writeFileSync(htmlPath, html, "utf8");
}

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(".athlete-ai-plan-panel{")) {
  css += [
    "",
    ".athlete-ai-plan-panel{border-color:#cbd9d0;background:#fbfdfb}",
    ".athlete-ai-plan-panel[hidden]{display:none!important}",
    ".athlete-ai-plan-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end}",
    ".athlete-ai-plan-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:650;min-width:0}",
    ".athlete-ai-plan-form input,.athlete-ai-plan-form select,.athlete-ai-plan-form textarea{width:100%;min-width:0;box-sizing:border-box}",
    ".athlete-ai-plan-form .athlete-ai-wide{grid-column:1/-1}",
    ".athlete-ai-days{display:flex;gap:8px 12px;flex-wrap:wrap;border:1px solid #dce5df;border-radius:8px;padding:10px;margin:0;min-width:0}",
    ".athlete-ai-days legend{font-size:12px;font-weight:650}",
    ".athlete-ai-days label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:500}",
    ".athlete-ai-days input{width:auto}",
    ".cp-status-pill.pending-review{background:#f4f1e9;color:#705923}",
    ".cp-plan-notes{white-space:pre-line;font-size:12px;color:#68747b}",
    "@media(max-width:620px){.athlete-ai-plan-form{grid-template-columns:1fr}.athlete-ai-plan-form .athlete-ai-wide{grid-column:1}.athlete-ai-plan-form button{width:100%}.athlete-ai-days{gap:8px 10px}}",
    ""
  ].join("\n");
  fs.writeFileSync(cssPath, css, "utf8");
}

const moduleSource = fs.readFileSync(path.join(adminDir, "coach-planning.mjs"), "utf8");
if (!html.includes('id="athleteAiPlanPanel"') ||
    !moduleSource.includes("async function submitAthleteAiPlan(event)") ||
    !moduleSource.includes('refreshAthletePortalData()') ||
    !moduleSource.includes('saved_plan_status !== "draft"')) {
  throw new Error("HF athlete AI plan: faltan controles o lógica de guardado/revisión.");
}
console.log("HF Central: formulario personal de Coach IA integrado en Mi historia deportiva.");
