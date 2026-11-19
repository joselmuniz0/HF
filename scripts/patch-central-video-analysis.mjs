import fs from "node:fs";
import path from "node:path";
const adminDir = path.resolve(".hf-central/admin");
const appPath = path.join(adminDir,"app.js");
const htmlPath = path.join(adminDir,"index.html");
const cssPath = path.join(adminDir,"styles.css");
function replaceOnce(source,needle,replacement,label) {
  const index=source.indexOf(needle);
  if(index<0) throw new Error("Video analysis: no se encontró "+label);
  return source.slice(0,index)+replacement+source.slice(index+needle.length);
}
let app=fs.readFileSync(appPath,"utf8");
if(!app.includes("async function runCoachVideoAnalysis(event)")) {
  const code=fs.readFileSync(path.resolve("scripts/central-video-analysis-runtime.js"),"utf8");
  app=replaceOnce(app,"journal: [] };","journal: [], mediaAssets: [] };","colección de mediaAssets");
  app=replaceOnce(app,"    data.sessions = sessions.data || [];",
    "    data.sessions = sessions.data || [];\n"+
    "    const mediaAssetsResult = await sb.from('media_assets').select('id,organization_id,athlete_id,uploaded_by,object_path,file_name,mime_type,size_bytes,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false });\n"+
    "    if (mediaAssetsResult.error) throw mediaAssetsResult.error;\n"+
    "    data.mediaAssets = mediaAssetsResult.data || [];","consulta de archivos multimedia");
  app=replaceOnce(app,'      sb.from("training_sessions").select("*").eq("athlete_id",id)\n',
    '      sb.from("training_sessions").select("*").eq("athlete_id",id),\n'+
    '      sb.from("media_assets").select("*").eq("athlete_id",id).order("created_at",{ascending:false})\n',"consulta de videos del atleta");
  app=replaceOnce(app,"      sessions:queries[11].data || []",
    "      sessions:queries[11].data || [], mediaAssets:queries[12].data || []","datos multimedia del portal");
  app=replaceOnce(app,"    const athlete = data.athletes.find(a => a.id === e.athlete_id);\n    const metrics = e.metrics || {};",
    "    const athlete = data.athletes.find(a => a.id === e.athlete_id);\n"+
    "    const mediaAsset = data.mediaAssets.find(a => a.id === e.media_asset_id) || data.mediaAssets.filter(a => a.athlete_id === e.athlete_id && a.file_name === e.video_name && isVideoMediaAsset(a)).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];\n"+
    "    const videoHtml = mediaAsset ? '<button type=\"button\" class=\"quiet\" data-open-evaluation-video=\"' + esc(e.id) + '\" data-media-asset=\"' + esc(mediaAsset.id) + '\">Ver video asociado</button><div class=\"hf-video-preview\" data-video-preview hidden></div>' : '';\n"+
    "    const metrics = e.metrics || {};","vínculo de video en la evaluación del coach");
  const findingMarker="$"+"{findingHtml}<label>Devolución validada por el coach</label>";
  app=replaceOnce(app,findingMarker,"$"+"{videoHtml}"+findingMarker,"visualización del video en la ficha del coach");
  app=replaceOnce(app,"    const intervention = d.interventions.find(function(i){ return i.evaluation_id === e.id; });",
    "    const intervention = d.interventions.find(function(i){ return i.evaluation_id === e.id; });\n"+
    "    const mediaAsset = d.mediaAssets.find(function(a){ return a.id === e.media_asset_id; }) || d.mediaAssets.filter(function(a){ return a.athlete_id === e.athlete_id && a.file_name === e.video_name && isVideoMediaAsset(a); }).sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); })[0];\n"+
    "    const videoHtml = mediaAsset ? '<button type=\"button\" class=\"quiet\" data-open-athlete-evaluation-video=\"' + esc(e.id) + '\" data-media-asset=\"' + esc(mediaAsset.id) + '\">Ver video del análisis</button><div class=\"hf-video-preview\" data-video-preview hidden></div>' : '';","video visible en portal de atleta");
  app=replaceOnce(app,'      esc(e.coach_feedback || "El coach todavía no publicó una devolución.") + \'</p>\' +\n',
    '      esc(e.coach_feedback || "El coach todavía no publicó una devolución.") + \'</p>\' + videoHtml +\n',"enlace al video dentro del portal");
  app=replaceOnce(app,"function renderOperationalModules() {\n  refreshOperationalSelects();",
    "function renderOperationalModules() {\n  refreshOperationalSelects();\n  populateCoachVideoAssetOptions();","actualización del selector de videos");
  app=replaceOnce(app,"$('loginBtn').addEventListener('click', signIn);",code+"\n$('loginBtn').addEventListener('click', signIn);","motor de videoanálisis");
  app=replaceOnce(app,"$('athleteVideoForm').addEventListener('submit', uploadAthleteVideo);",
    "$('athleteVideoForm').addEventListener('submit', uploadAthleteVideo);\n"+
    "$('coachVideoAnalysisForm').addEventListener('submit', runCoachVideoAnalysis);\n"+
    "$('coachVideoSave').addEventListener('click', saveCoachVideoAnalysis);\n"+
    "$('coachVideoAthlete').addEventListener('change', populateCoachVideoAssetOptions);\n"+
    "$('coachVideoFile').addEventListener('change', function(){ if ($('coachVideoFile').files.length) $('coachVideoExisting').value = ''; });\n"+
    "$('coachVideoExisting').addEventListener('change', function(){ if ($('coachVideoExisting').value) $('coachVideoFile').value = ''; });\n"+
    "$('evaluations').addEventListener('click', function(event){ const button = event.target.closest('[data-open-evaluation-video]'); if (button) showEvaluationVideo(button); });\n"+
    "$('athleteEvaluations').addEventListener('click', function(event){ const button = event.target.closest('[data-open-athlete-evaluation-video]'); if (button) showEvaluationVideo(button); });","eventos de videoanálisis");
}
let html=fs.readFileSync(htmlPath,"utf8");
if(!html.includes('id="coachVideoAnalysisDetails"')) {
  const marker='<div id="evaluations"></div>';
  const panel=[
    '<details id="coachVideoAnalysisDetails" class="hf-video-analysis">',
    '<summary>Nuevo videoanálisis</summary>',
    '<form id="coachVideoAnalysisForm" class="hf-video-form">',
    '<label>Atleta<select id="coachVideoAthlete" required><option value="">Seleccionar atleta…</option></select></label>',
    '<label>Levantamiento<select id="coachVideoLift"><option value="Snatch">Arranque (Snatch)</option><option value="Clean">Cargada (Clean)</option></select></label>',
    '<label>Video ya recibido<select id="coachVideoExisting"><option value="">Seleccionar video ya recibido…</option></select></label>',
    '<label>O cargar video desde este equipo<input id="coachVideoFile" type="file" accept="video/mp4,video/quicktime,video/webm"></label>',
    '<p class="notice">Usá un intento completo de hasta 20 segundos, cámara fija, vista lateral y cuerpo completo. El análisis se realiza en el navegador con MediaPipe. El video se guarda en el almacenamiento privado de HF Coach.</p>',
    '<div class="hf-video-actions"><button type="submit" id="coachVideoAnalyze" class="primary">Analizar video</button><button type="button" id="coachVideoSave" class="primary" hidden>Guardar análisis en la ficha</button></div>',
    '<progress id="coachVideoProgress" max="1" value="0" hidden></progress>',
    '<p id="coachVideoStatus" class="status" role="status" aria-live="polite"></p>',
    '</form><div id="coachVideoAnalysisResult" class="hf-video-result"></div></details>'
  ].join("\n")+"\n";
  html=replaceOnce(html,marker,panel+marker,"contenedor de evaluaciones HTML");
}
fs.writeFileSync(htmlPath,html,"utf8");
let css=fs.readFileSync(cssPath,"utf8");
if(!css.includes(".hf-video-analysis{")) {
  css+="\n"+
    ".hf-video-analysis{border:1px solid #dce3e1;border-radius:9px;padding:14px;margin:12px 0 18px;background:#fbfcfb}\n"+
    ".hf-video-analysis summary{cursor:pointer;font-weight:700;color:#344149}\n"+
    ".hf-video-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0;align-items:end}\n"+
    ".hf-video-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}\n"+
    ".hf-video-form input,.hf-video-form select{width:100%}\n"+
    ".hf-video-actions{display:flex;gap:10px;flex-wrap:wrap}\n"+
    ".hf-video-result{margin-top:14px}\n"+
    ".hf-video-frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\n"+
    ".hf-video-frames figure{margin:0;min-width:0}\n"+
    ".hf-video-frames img{display:block;width:100%;border-radius:8px;border:1px solid #dce0df}\n"+
    ".hf-video-frames figcaption{font-size:12px;color:#65716d;margin-top:5px}\n"+
    ".hf-video-preview{margin-top:12px}\n"+
    ".hf-video-preview video{width:100%;max-height:520px;background:#111;border-radius:8px}\n"+
    "@media(max-width:760px){.hf-video-form,.hf-video-frames{grid-template-columns:1fr}.hf-video-actions>*{width:100%}}\n";
}
fs.writeFileSync(cssPath,css,"utf8");
console.log("HF Central: videoanálisis de escritorio y visualización de videos por atleta aplicados.");
