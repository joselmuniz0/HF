import fs from "node:fs";
import path from "node:path";

const dir=path.resolve(".hf-central/admin");
const htmlPath=path.join(dir,"index.html");
const appPath=path.join(dir,"app.js");
const cssPath=path.join(dir,"styles.css");
let html=fs.readFileSync(htmlPath,"utf8");
let app=fs.readFileSync(appPath,"utf8");
let css=fs.readFileSync(cssPath,"utf8");

const marker='<section id="athleteAiPlanPanel" class="panel athlete-ai-plan-panel" hidden>';
if(!html.includes('id="athleteAiOnboardingPanel"')){
  if(!html.includes(marker)) throw new Error("No se encontró el panel de planificación personal IA.");
  const panel=[
'      <section id="athleteAiOnboardingPanel" class="panel athlete-ai-onboarding-panel" hidden>',
'        <div class="section-head"><div><h3>Evaluación inicial del atleta</h3><p class="muted">Completá tu perfil antes de solicitar una planificación individualizada con HF Coach IA.</p></div><span id="athleteAiOnboardingBadge" class="cp-status-pill draft">Pendiente</span></div>',
'        <div id="athleteAiOnboardingStatus" class="status" role="status" aria-live="polite">Tu evaluación inicial todavía no fue completada.</div>',
'        <div class="athlete-ai-state-grid">',
'          <div><b>Datos personales</b><span id="athleteAiPersonalState">Pendientes</span></div>',
'          <div><b>Antecedentes de salud</b><span id="athleteAiHealthState">Pendientes</span></div>',
'          <div><b>Marcas deportivas</b><span id="athleteAiSportState">Pendientes</span></div>',
'          <div><b>Nivel</b><span id="athleteAiLevelState">Pendiente</span></div>',
'        </div>',
'        <form id="athleteAiOnboardingForm" class="athlete-ai-onboarding-form">',
'          <h4 class="athlete-ai-form-heading">A. Datos personales</h4>',
'          <label>Edad (años)<input id="athleteAiAge" type="number" min="18" max="100" step="1" required></label>',
'          <label>Altura (cm)<input id="athleteAiHeight" type="number" min="50" max="250" step="0.1" required></label>',
'          <label>Peso corporal actual (kg)<input id="athleteAiWeight" type="number" min="20" max="300" step="0.1" required></label>',
'          <label>Antigüedad en halterofilia (años)<input id="athleteAiTrainingYears" type="number" min="0" max="80" step="0.5" required></label>',
'          <label>Días de entrenamiento por semana<select id="athleteAiTrainingDays" required><option value="">Seleccionar</option><option value="1">1 día</option><option value="2">2 días</option><option value="3">3 días</option><option value="4" selected>4 días</option><option value="5">5 días</option><option value="6">6 días</option><option value="7">7 días</option></select></label>',
'          <label class="athlete-ai-wide">Objetivo deportivo<textarea id="athleteAiTrainingObjective" rows="2" maxlength="1500" required placeholder="Ej.: desarrollar fuerza, potencia, técnica y continuidad deportiva."></textarea></label>',
'          <h4 class="athlete-ai-form-heading">B. Declaración de salud</h4>',
'          <p class="athlete-ai-privacy-note">La información de salud es sensible. Solo se solicita para considerar antecedentes relevantes al plan de entrenamiento. Podés elegir no compartirla; en ese caso, la planificación personalizada con IA quedará pendiente de revisión humana.</p>',
'          <label class="athlete-ai-wide">¿Qué situación describe mejor tus antecedentes?<select id="athleteAiHealthStatus" required><option value="no_known_conditions">No tengo antecedentes de salud conocidos que deba informar</option><option value="conditions_reported">Tengo enfermedades, lesiones, tratamientos o restricciones que debo declarar</option><option value="prefer_not_to_disclose">Prefiero no informar datos de salud</option></select></label>',
'          <div id="athleteAiHealthDetails" class="athlete-ai-health-details athlete-ai-wide" hidden>',
'            <label>Enfermedades o condiciones de base<textarea id="athleteAiConditions" rows="2" maxlength="2000" placeholder="Indicá la condición y cualquier observación relevante para el entrenamiento."></textarea></label>',
'            <label>Lesiones óseas, articulares o de columna<textarea id="athleteAiBoneJoint" rows="2" maxlength="2000"></textarea></label>',
'            <label>Lesiones musculares o tendinosas<textarea id="athleteAiMuscular" rows="2" maxlength="2000"></textarea></label>',
'            <label>Cirugías y fechas aproximadas<textarea id="athleteAiSurgeries" rows="2" maxlength="1500"></textarea></label>',
'            <label>Medicación o tratamientos actuales relevantes<textarea id="athleteAiMedication" rows="2" maxlength="2000"></textarea></label>',
'            <label>Indicaciones o restricciones médicas para la actividad física<textarea id="athleteAiRestrictions" rows="2" maxlength="2000"></textarea></label>',
'            <label>Otros antecedentes relevantes<textarea id="athleteAiOtherHealth" rows="2" maxlength="1500"></textarea></label>',
'          </div>',
'          <label class="athlete-ai-consent athlete-ai-wide"><input id="athleteAiHealthConsent" type="checkbox"> Autorizo de forma libre, expresa e informada el tratamiento de los datos de salud que declaro para adaptar la planificación individual de HF Coach IA. Entiendo que podrán ser consultados por el servicio de IA y por el coach humano habilitado para revisar mi ficha.</label>',
'          <h4 class="athlete-ai-form-heading">C. Perfil deportivo y marcas</h4>',
'          <p class="athlete-ai-privacy-note">Ingresá una marca vigente o marcá «No tengo RM vigente». Las marcas declaradas quedarán pendientes de validación y no se utilizarán como RM confirmadas hasta su revisión.</p>',
'          <div class="athlete-ai-rm-grid">',
'            <label>RM Snatch (kg)<input id="athleteAiSnatch" type="number" min="1" max="500" step="0.5"></label><label class="athlete-ai-not-tested"><input id="athleteAiSnatchNotTested" type="checkbox"> No tengo RM vigente</label>',
'            <label>RM Clean &amp; Jerk (kg)<input id="athleteAiCleanJerk" type="number" min="1" max="500" step="0.5"></label><label class="athlete-ai-not-tested"><input id="athleteAiCleanJerkNotTested" type="checkbox"> No tengo RM vigente</label>',
'            <label>RM Back Squat (kg)<input id="athleteAiBackSquat" type="number" min="1" max="700" step="0.5"></label><label class="athlete-ai-not-tested"><input id="athleteAiBackSquatNotTested" type="checkbox"> No tengo RM vigente</label>',
'            <label>RM Front Squat (kg)<input id="athleteAiFrontSquat" type="number" min="1" max="600" step="0.5"></label><label class="athlete-ai-not-tested"><input id="athleteAiFrontSquatNotTested" type="checkbox"> No tengo RM vigente</label>',
'          </div>',
'          <label class="athlete-ai-wide">Nivel deportivo declarado<select id="athleteAiDeclaredLevel" required><option value="undetermined">No sé definir mi nivel; solicito evaluación por video</option><option value="initial">Inicial</option><option value="intermediate">Medio</option><option value="advanced">Avanzado</option></select></label>',
'          <p class="athlete-ai-privacy-note athlete-ai-wide">El nivel que declares se registrará como autodeclarado, no como nivel validado. Si no lo declarás, la ficha quedará pendiente de evaluación técnica por video y revisión humana.</p>',
'          <h4 class="athlete-ai-form-heading">D. Declaración jurada</h4>',
'          <div class="athlete-ai-affidavit athlete-ai-wide"><b>Declaración jurada del atleta</b><p>Declaro bajo juramento que los datos personales, deportivos y de salud que incorporo son, según mi leal saber y entender, verdaderos, completos y actuales a la fecha de esta presentación. Me comprometo a informar cambios relevantes antes de solicitar nuevas planificaciones. Comprendo que los datos quedan registrados como autodeclarados hasta su validación; que HF Coach IA no diagnostica ni reemplaza a profesionales de la salud; y que toda planificación generada requiere revisión humana antes de su publicación. Esta declaración no limita mis derechos sobre mis datos personales ni equivale a una certificación de aptitud médica.</p><label class="athlete-ai-consent"><input id="athleteAiAcceptDeclaration" type="checkbox" required> Leí y acepto esta declaración jurada.</label></div>',
'          <button id="athleteAiOnboardingSubmit" type="submit" class="primary athlete-ai-wide">Guardar evaluación y declaración</button>',
'        </form>',
'        <p id="athleteAiOnboardingResult" class="status" role="status" aria-live="polite"></p>',
'      </section>'
  ].join("\n");
  html=html.replace(marker,panel+"\n"+marker);
}

const assignmentQuery='sb.from("athlete_ai_coach_assignments").select("coach_label,status").eq("athlete_id",id).eq("status","active").maybeSingle()';
if(!app.includes('sb.from("athlete_ai_onboarding")')){
  if(!app.includes(assignmentQuery)) throw new Error("No se encontró la consulta de asignación HF Coach IA en app.js.");
  app=app.replace(assignmentQuery,
    assignmentQuery+',\n      sb.from("athlete_ai_onboarding").select("*").eq("athlete_id",id).maybeSingle(),\n'+
    '      sb.from("athlete_health_declarations").select("*").eq("athlete_id",id).order("declared_at",{ascending:false}).limit(1)'
  );
}
const aiCoachPattern=/aiCoach:queries\[(\d+)\]\?\.data \|\| null/;
const match=app.match(aiCoachPattern);
if(!match) throw new Error("No se pudo identificar el índice de la asignación IA en el portal.");
if(!app.includes("aiOnboarding:queries[")){
  const base=Number(match[1]);
  app=app.replace(aiCoachPattern,
    'aiCoach:queries['+base+']?.data || null, aiOnboarding:queries['+(base+1)+']?.data || null, healthDeclaration:queries['+(base+2)+']?.data?.[0] || null'
  );
}

if(!css.includes(".athlete-ai-onboarding-panel{")){
  css += [
    "",
    ".athlete-ai-onboarding-panel{border-color:#d2dcd5}",
    ".athlete-ai-onboarding-panel[hidden]{display:none!important}",
    ".athlete-ai-onboarding-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}",
    ".athlete-ai-onboarding-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:650;min-width:0}",
    ".athlete-ai-onboarding-form input,.athlete-ai-onboarding-form select,.athlete-ai-onboarding-form textarea{width:100%;min-width:0;box-sizing:border-box}",
    ".athlete-ai-form-heading{grid-column:1/-1;margin:12px 0 0;padding-top:12px;border-top:1px solid #e3e8e4}",
    ".athlete-ai-wide{grid-column:1/-1}",
    ".athlete-ai-privacy-note{font-size:12px;color:#6b7774;line-height:1.5;margin:0}",
    ".athlete-ai-consent{display:flex!important;flex-direction:row!important;align-items:flex-start;gap:8px!important;font-weight:500!important;line-height:1.5}",
    ".athlete-ai-consent input{width:auto!important;min-width:16px;margin-top:2px}",
    ".athlete-ai-health-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border:1px solid #e0e5e1;border-radius:10px;padding:12px}",
    ".athlete-ai-health-details[hidden]{display:none!important}",
    ".athlete-ai-rm-grid{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}",
    ".athlete-ai-not-tested{display:flex!important;flex-direction:row!important;align-items:center;gap:5px!important;font-weight:500!important;white-space:nowrap;padding-bottom:9px}",
    ".athlete-ai-not-tested input{width:auto!important}",
    ".athlete-ai-affidavit{background:#f7f8f7;border:1px solid #dce3de;border-radius:10px;padding:12px;font-size:12px;line-height:1.55}",
    ".athlete-ai-affidavit p{margin:8px 0 12px}",
    ".athlete-ai-state-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0 18px}",
    ".athlete-ai-state-grid>div{display:flex;justify-content:space-between;gap:8px;padding:10px;border:1px solid #e1e6e2;border-radius:8px;font-size:12px}",
    ".athlete-ai-state-grid span{color:#6b7774;text-align:right}",
    "@media(max-width:620px){.athlete-ai-onboarding-form,.athlete-ai-health-details{grid-template-columns:1fr}.athlete-ai-wide,.athlete-ai-form-heading,.athlete-ai-health-details{grid-column:1}.athlete-ai-rm-grid{grid-template-columns:1fr}.athlete-ai-not-tested{padding-bottom:0}.athlete-ai-state-grid>div{flex-direction:column}.athlete-ai-state-grid span{text-align:left}}",
    ""
  ].join("\n");
}

if(!html.includes('id="athleteAiOnboardingPanel"') ||
   !app.includes('athlete_ai_health_declarations') && !app.includes('athlete_health_declarations') ||
   !app.includes('aiOnboarding:queries[')){
  throw new Error("HF athlete intake: faltan controles para completar la evaluación inicial.");
}
fs.writeFileSync(htmlPath,html,"utf8");
fs.writeFileSync(appPath,app,"utf8");
fs.writeFileSync(cssPath,css,"utf8");
console.log("HF Central: ficha de evaluación inicial y formulario de autogestión integrados.");
