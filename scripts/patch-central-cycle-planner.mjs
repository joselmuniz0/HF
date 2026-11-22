import fs from "node:fs";
import path from "node:path";
const dir=path.resolve(".hf-central/admin");
const htmlPath=path.join(dir,"index.html"), appPath=path.join(dir,"app.js"), cssPath=path.join(dir,"styles.css");
const modulePath=path.resolve("scripts/central-coach-planning.mjs"), corePath=path.resolve("prototypes/training-cycle/cycle-core.mjs");
for(const file of [htmlPath,appPath,cssPath,modulePath,corePath]) if(!fs.existsSync(file)) throw new Error("Falta archivo requerido: "+file);
function replaceOnce(s,n,r,label){const i=s.indexOf(n);if(i<0)throw new Error("No se encontró "+label);return s.slice(0,i)+r+s.slice(i+n.length);}
let html=fs.readFileSync(htmlPath,"utf8");
const heading="<h3>Planificación de entrenamiento</h3>", h=html.indexOf(heading);
if(h<0)throw new Error("No se encontró el panel de planificación.");
const start=html.lastIndexOf('<section class="panel">',h), next=html.indexOf('<section class="panel">',h+heading.length);
const end=next>=0?next:html.indexOf("</section>",h)+"</section>".length;
if(start<0||end<=start)throw new Error("No se pudo delimitar el panel de planificación.");
const panel=[
'      <section id="hfCoachCyclePlanner" class="panel hf-cycle-planner" hidden>',
'        <div class="section-head"><div><h3>Planificación de ciclos</h3><p class="muted">Microciclos, progresiones de carga, plantillas del coach y publicación al atleta.</p></div></div>',
'        <p id="cpStatus" class="status cp-status" role="status" aria-live="polite"></p>',
'        <div id="cpLibraryView">',
'          <div class="cp-library-toolbar"><button type="button" class="primary" id="cpCreatePlan">+ Crear ciclo</button><button type="button" class="quiet" id="cpLoadZetaExample">Cargar ejemplo ZETA</button></div>',
'          <div class="cp-template-panel"><div><b>Biblioteca del entorno coach</b><small>Plantillas reutilizables dentro de la organización.</small></div><div class="cp-template-controls"><select id="cpTemplateSelect"><option value="">Seleccionar plantilla guardada…</option></select><button type="button" class="quiet" id="cpLoadTemplate">Cargar plantilla</button></div></div>',
'          <h4 class="cp-subheading">Ciclos y planificaciones</h4><div id="cpPlanList" class="cp-plan-list"><div class="empty">Cargando planificaciones…</div></div>',
'        </div>',
'        <div id="cpEditorView" hidden>',
'          <div class="cp-editor-toolbar"><button type="button" class="quiet" id="cpBackToList">← Volver</button><span class="cp-editor-hint">El borrador solo es visible para el coach y la administración.</span></div>',
'          <form id="cpCycleForm" class="cp-cycle-form">',
'            <div class="cp-cycle-header">',
'              <label>Atleta<select id="cpAthlete" required><option value="">Elegir atleta…</option></select></label>',
'              <label>Nombre del ciclo<input id="cpCycleName" required minlength="2" placeholder="Preparación general · ciclo 1"></label>',
'              <label>Objetivo<input id="cpCycleObjective" placeholder="Técnica, fuerza, potencia…"></label>',
'              <label>Fase general<select id="cpPhase"><option value="general_preparation">Preparación general</option><option value="specific_preparation">Preparación específica</option><option value="competition">Competencia</option><option value="transition">Transición</option></select></label>',
'              <label>Nivel<input id="cpAthleteLevel" type="number" min="1" max="10" step="1" value="5"></label>',
'              <label>Inicio<input id="cpCycleStart" type="date" required></label><label>Finalización<input id="cpCycleEnd" type="date"></label>',
'              <label class="cp-cycle-notes">Notas generales<textarea id="cpCycleNotes" rows="2"></textarea></label>',
'            </div><datalist id="cpRmReferences"></datalist>',
'            <div class="cp-ai-controls">',
'              <div><b>Coach IA · propuesta semanal</b><small>Analiza datos reales del atleta y genera un borrador editable. No publica automáticamente.</small></div>',
'              <fieldset class="cp-ai-days"><legend>Días de entrenamiento</legend>',
'                <label><input type="checkbox" data-cp-ai-day value="1" checked> Lunes</label>',
'                <label><input type="checkbox" data-cp-ai-day value="2" checked> Martes</label>',
'                <label><input type="checkbox" data-cp-ai-day value="3" checked> Miércoles</label>',
'                <label><input type="checkbox" data-cp-ai-day value="4"> Jueves</label>',
'                <label><input type="checkbox" data-cp-ai-day value="5" checked> Viernes</label>',
'                <label><input type="checkbox" data-cp-ai-day value="6"> Sábado</label>',
'                <label><input type="checkbox" data-cp-ai-day value="7"> Domingo</label>',
'              </fieldset>',
'              <label>Duración máxima por sesión<select id="cpAiDuration"><option value="60">60 minutos</option><option value="75">75 minutos</option><option value="85" selected>85 minutos</option><option value="90">90 minutos</option><option value="105">105 minutos</option><option value="120">120 minutos</option></select></label>',
'              <button type="button" class="primary" id="cpGenerateWithAI">Generar semana con Coach IA</button>',
'            </div>',
'            <div id="cpAiReview" class="cp-ai-review" hidden></div>',
'            <div class="cp-weeks-heading"><div><h4>Microciclos</h4><p>OLY, fuerza y total semanal. El total se suma cuando ambos componentes están informados; puede corregirse manualmente.</p></div><button type="button" class="quiet" id="cpAddWeek">+ Agregar semana</button></div>',
'            <div id="cpWeekBuilder" class="cp-week-builder"></div>',
'            <div class="cp-save-template-panel"><div><b>Guardar como plantilla del coach</b><small>Reutilizable con otros atletas.</small></div><label>Nombre<input id="cpTemplateName" placeholder="Base preparatoria 4 días"></label><label>Descripción<input id="cpTemplateDescription" placeholder="Objetivo y características"></label><button type="button" class="quiet" id="cpSaveTemplate">Guardar plantilla</button></div>',
'            <div class="cp-submit-row"><button type="submit" class="primary" id="cpSaveDraft">Guardar borrador</button><span>Revisá el detalle y publicalo cuando esté listo para el atleta.</span></div>',
'          </form></div>',
'        <div hidden aria-hidden="true"><form id="planForm"><select id="planAthlete"></select><div id="planSessionBuilder"></div><button type="button" id="addPlanSessionBtn"></button><button type="submit"></button></form><div id="plansList"></div></div>',
'      </section>'
].join("\n");
html=html.slice(0,start)+panel+html.slice(end);
if(!html.includes('src="./coach-planning.mjs"')) html=replaceOnce(html,'  <script type="module" src="./app.js"></script>','  <script type="module" src="./app.js"></script>\n  <script type="module" src="./coach-planning.mjs"></script>',"la carga del módulo");
fs.writeFileSync(htmlPath,html,"utf8");
let app=fs.readFileSync(appPath,"utf8");
if(!app.includes("window.HFCoachPlanning=")){
  let a=app.indexOf("async function loadData()"), b=app.indexOf("\nfunction render()",a);
  if(a<0||b<0)throw new Error("No se encontró loadData().");
  let chunk=replaceOnce(app.slice(a,b),"    render();",'    render();\n    window.dispatchEvent(new Event("hf:coach-data-ready"));',"evento de refresco del coach");
  app=app.slice(0,a)+chunk+app.slice(b);
  a=app.indexOf("async function loadAthletePortal()");b=app.indexOf("\nfunction renderAthletePortal()",a);
  if(a<0||b<0)throw new Error("No se encontró loadAthletePortal().");
  chunk=replaceOnce(app.slice(a,b),"    renderAthletePortal();",'    renderAthletePortal();\n    window.dispatchEvent(new Event("hf:athlete-data-ready"));',"evento de refresco del atleta");
  chunk=replaceOnce(chunk,'      sb.from("media_assets").select("*").eq("athlete_id",id).order("created_at",{ascending:false})\n    ]);',
    '      sb.from("media_assets").select("*").eq("athlete_id",id).order("created_at",{ascending:false}),\n      sb.from("athlete_notifications").select("*").eq("athlete_id",id).order("created_at",{ascending:false})\n    ]);',
    "la consulta de avisos internos para el atleta");
  chunk=replaceOnce(chunk,'      sessions:queries[11].data || [], mediaAssets:queries[12].data || []',
    '      sessions:queries[11].data || [], mediaAssets:queries[12].data || [], notifications:queries[13].data || []',
    "el almacenamiento de avisos en el portal del atleta");
  app=app.slice(0,a)+chunk+app.slice(b);
  app+='\n\n// Puente de datos para el módulo de ciclos de HF Coach.\nwindow.HFCoachPlanning=Object.freeze({getClient:()=>getClient(),getOrganizationId:()=>organizationId,getCurrentUserId:()=>currentUserId,getCurrentRole:()=>currentRole,getAthletes:()=>data.athletes||[],getRecords:()=>data.records||[],getPlans:()=>data.plans||[],getAthletePortalData:()=>athletePortalData,refreshCoachData:()=>loadData()});\n';
}
fs.writeFileSync(appPath,app,"utf8");
let css=fs.readFileSync(cssPath,"utf8");
if(!css.includes(".hf-cycle-planner{")) css+="\n"+
".hf-cycle-planner{border-color:#d3ddd7;background:#fff}.hf-cycle-planner[hidden],[hidden]{display:none!important}.cp-status:empty{display:none}\n"+
".cp-library-toolbar,.cp-editor-toolbar,.cp-submit-row,.cp-weeks-heading,.cp-week-head,.cp-session-head,.cp-exercise-head,.cp-block-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.cp-library-toolbar{margin:14px 0}\n"+
".cp-template-panel,.cp-save-template-panel{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,2fr);gap:12px;align-items:end;border:1px solid #dce3df;background:#f7faf8;border-radius:9px;padding:14px;margin:14px 0}.cp-template-panel>div:first-child,.cp-save-template-panel>div:first-child{display:grid;gap:4px}.cp-template-panel small,.cp-save-template-panel small,.cp-editor-hint{color:#68747b;font-size:12px}.cp-template-controls{display:flex;gap:8px;min-width:0}.cp-template-controls select{flex:1;min-width:0}\n"+
".cp-plan-list,.cp-week-builder,.cp-sessions,.cp-exercises,.cp-blocks{display:grid;gap:12px}.cp-plan-card,.cp-week,.cp-session,.cp-exercise,.cp-block-row{border:1px solid #dce4df;border-radius:9px;padding:12px;background:#fff;min-width:0}.cp-plan-main,.cp-athlete-plan-head{display:flex;justify-content:space-between;gap:12px}.cp-plan-meta,.cp-plan-card small,.cp-detail-exercise small{font-size:12px;color:#68747b}.cp-week-pills,.cp-athlete-volume{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.cp-week-pill,.cp-athlete-volume span{font-size:11px;background:#eef4f0;color:#415a4a;border-radius:5px;padding:5px 7px}.cp-status-pill{font-size:11px;padding:5px 9px;border-radius:99px;background:#f1f2f2}.cp-status-pill.published{background:#eaf4ed;color:#28613a}.cp-plan-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.cp-plan-detail{border-top:1px solid #e6ebe8;margin-top:10px;padding-top:10px}.cp-detail-week,.cp-athlete-week{border-top:1px solid #e6ebe8;margin-top:10px;padding-top:10px}.cp-detail-session,.cp-athlete-session{background:#f7faf8;border-radius:7px;padding:10px;margin:8px 0}.cp-detail-exercise,.cp-athlete-exercise{display:grid;gap:4px;border-top:1px solid #e6ebe8;padding:7px 0;font-size:13px}.cp-published-note{font-size:11px;color:#68747b;margin-top:8px}\n"+
".cp-cycle-form{display:grid;gap:14px}.cp-cycle-header,.cp-week-grid,.cp-session-grid,.cp-exercise-grid,.cp-block-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cp-cycle-header{padding:14px;background:#f6f8f7;border:1px solid #e1e7e3;border-radius:9px}.cp-cycle-header label,.cp-week-grid label,.cp-session-grid label,.cp-exercise-grid label,.cp-block-grid label,.cp-save-template-panel label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:650;min-width:0}.cp-cycle-header input,.cp-cycle-header select,.cp-week-grid input,.cp-week-grid select,.cp-session-grid input,.cp-session-grid select,.cp-exercise-grid input,.cp-exercise-grid select,.cp-block-grid input,.cp-block-grid select{width:100%;min-width:0}.cp-cycle-notes,.cp-week-notes{grid-column:span 2}.cp-week-grid{padding:12px;background:#f1f5f2;border-radius:8px}.cp-block-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cp-block-notes{grid-column:span 2}.cp-load-preview{display:block;min-height:16px;color:#426a50;font-size:11px;margin-top:6px}.cp-block-top{margin-bottom:8px;font-size:12px}.cp-remove{font-size:11px;padding:6px 8px}.cp-save-template-panel{grid-template-columns:1.2fr 1fr 1fr auto}.cp-submit-row{justify-content:flex-start;border-top:1px solid #e1e6e3;padding-top:14px}.cp-submit-row span{font-size:12px;color:#68747b}\n"+
".cp-notice-list{border:1px solid #cbded1;background:#f2f8f4;border-radius:9px;padding:12px;margin-bottom:14px}.cp-notice-list h4{margin:0 0 8px;color:#315b3d}.cp-athlete-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #d8e6dc}.cp-athlete-notice p{margin:4px 0;color:#465a4c;font-size:13px}.cp-athlete-notice small{color:#687b6c;font-size:11px}.cp-athlete-notice button{white-space:nowrap}\n"+
"@media(max-width:900px){.cp-cycle-header,.cp-week-grid,.cp-session-grid,.cp-exercise-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cp-block-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cp-save-template-panel{grid-template-columns:repeat(2,minmax(0,1fr))}}\n"+
"@media(max-width:560px){.cp-cycle-header,.cp-week-grid,.cp-session-grid,.cp-exercise-grid,.cp-block-grid,.cp-save-template-panel{grid-template-columns:1fr}.cp-cycle-notes,.cp-week-notes,.cp-block-notes{grid-column:1}.cp-template-controls,.cp-library-toolbar,.cp-submit-row{align-items:stretch;flex-direction:column}.cp-template-controls>*{width:100%}.cp-plan-main,.cp-athlete-plan-head{flex-direction:column}.cp-plan-actions>*{width:100%}}\n";

css+="\n"+
".cp-ai-controls{display:grid;grid-template-columns:minmax(180px,1fr) minmax(250px,2fr) minmax(160px,1fr) auto;gap:12px;align-items:end;border:1px solid #cbd9d0;background:#f3f7f4;border-radius:9px;padding:14px;margin:14px 0}.cp-ai-controls>div:first-child{display:grid;gap:4px}.cp-ai-controls small{color:#68747b;font-size:12px}.cp-ai-days{display:flex;gap:8px 12px;flex-wrap:wrap;border:0;padding:0;margin:0}.cp-ai-days legend{font-size:12px;font-weight:600;margin-bottom:6px}.cp-ai-days label{display:flex;align-items:center;gap:4px;font-size:12px}.cp-ai-review{border:1px solid #d7e0da;border-radius:9px;padding:14px;margin:14px 0;background:#fafcfb}.cp-ai-review[hidden]{display:none!important}.cp-ai-review-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cp-ai-review ul{margin:6px 0 10px;padding-left:18px;font-size:12px}.cp-ai-review small{font-size:11px;color:#68747b}@media(max-width:900px){.cp-ai-controls{grid-template-columns:1fr}.cp-ai-review-grid{grid-template-columns:1fr}}";

fs.writeFileSync(cssPath,css,"utf8");
fs.copyFileSync(modulePath,path.join(dir,"coach-planning.mjs"));
fs.copyFileSync(corePath,path.join(dir,"cycle-core.mjs"));
const verify=fs.readFileSync(appPath,"utf8");
for(const token of ["window.HFCoachPlanning=","hf:coach-data-ready","hf:athlete-data-ready"]) if(!verify.includes(token)) throw new Error("Falta el vínculo "+token);
if(!html.includes('id="hfCoachCyclePlanner"')) throw new Error("No se insertó el módulo.");
console.log("HF Central: planificador de ciclos integrado al entorno coach y portal del atleta conectado.");
