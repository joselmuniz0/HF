import fs from 'node:fs';

const htmlPath = 'app-source/src/index.html';
const cloudPath = 'app-source/src/cloud.js';
let html = fs.readFileSync(htmlPath, 'utf8');
let cloud = fs.readFileSync(cloudPath, 'utf8');

// Add a read-only planning entry point to each centrally synchronized athlete card.
const athleteLevelMarker = ' <span class="tag">${esc(x.level)}</span>';
const athletePlanButton = '<button type="button" class="hf-athlete-plan-button" data-hf-plan-athlete="${esc(x.id)}" data-hf-plan-cloudstatus="${esc(x.cloud_status||"local_only")}">Ver planificación</button>';
if (!html.includes('data-hf-plan-athlete')) {
  if (!html.includes('document.getElementById("athletesList").innerHTML=a.map(x=>')) {
    throw new Error('Android: no se encontró el render de perfiles de atletas.');
  }
  if (!html.includes(athleteLevelMarker)) {
    throw new Error('Android: no se encontró el marcador de nivel dentro de la ficha de atleta.');
  }
  html = html.replace(athleteLevelMarker, athleteLevelMarker + athletePlanButton);
}


const athletePane = '<section id="atletas" class="pane" hidden>';
const listPlaceholder = '<div id="athletesList"></div>';
if (!html.includes('hf-athlete-roster')) {
  if (!html.includes(athletePane) || html.split(listPlaceholder).length !== 2) {
    throw new Error('Android: no se pudo ubicar la lista de atletas para mostrarla antes del formulario.');
  }
  html = html.replace(listPlaceholder, '');
  const roster = '<div class="card hf-athlete-roster"><h2>Atletas registrados</h2><p class="mut">Consultá la planificación enviada por el coach desde cada ficha.</p>' + listPlaceholder + '</div>';
  html = html.replace(athletePane, athletePane + '\n' + roster);
}

// Read only active, published plans through the user's authenticated Supabase session.
// RLS remains the authorization boundary for coach/administrator access to each athlete.
const cloudMarker = [
  'window.HFCloud = Object.freeze({',
  '  createAthlete: createAthleteDirect,',
  '  refreshAthletes: refreshCloudAthletes',
  '});'
].join('\n');
const cloudAddition = [
  '',
  'async function getPublishedTrainingPlans(athleteId) {',
  "  if (!athleteId) throw new Error('Seleccioná una ficha de atleta válida.');",
  "  if (!client) initClient();",
  "  if (!client) throw new Error('Configurá la conexión de HF Coach Central en Intercambio.');",
  '  const { data: authData, error: authError } = await client.auth.getUser();',
  '  if (authError) throw authError;',
  "  if (!authData.user) throw new Error('Iniciá sesión en Intercambio para consultar planificaciones.');",
  '  const { data: plans, error: plansError } = await client',
  "    .from('training_plans')",
  "    .select('id,athlete_id,name,objective,training_phase,start_date,end_date,status,published_at,approved_at,notes')",
  "    .eq('athlete_id', athleteId)",
  "    .eq('status', 'active')",
  "    .not('published_at', 'is', null)",
  "    .order('start_date', { ascending: false });",
  '  if (plansError) throw plansError;',
  '  const publishedPlans = plans || [];',
  '  if (!publishedPlans.length) return [];',
  '  const planIds = publishedPlans.map(plan => plan.id);',
  '  const [weeksResult, sessionsResult] = await Promise.all([',
  "    client.from('training_plan_weeks').select('*').in('plan_id', planIds).order('week_number'),",
  "    client.from('training_plan_sessions').select('*').in('plan_id', planIds).order('week_number').order('day_number').order('session_order')",
  '  ]);',
  '  if (weeksResult.error) throw weeksResult.error;',
  '  if (sessionsResult.error) throw sessionsResult.error;',
  '  const sessions = sessionsResult.data || [];',
  '  const sessionIds = sessions.map(session => session.id);',
  '  let items = [];',
  '  if (sessionIds.length) {',
  '    const itemsResult = await client.from("training_plan_items").select("*").in("plan_session_id", sessionIds).order("sequence_number");',
  '    if (itemsResult.error) throw itemsResult.error;',
  '    items = itemsResult.data || [];',
  '  }',
  '  const itemIds = items.map(item => item.id);',
  '  let blocks = [];',
  '  if (itemIds.length) {',
  '    const blocksResult = await client.from("training_plan_item_blocks").select("*").in("plan_item_id", itemIds).order("sequence_number");',
  '    if (blocksResult.error) throw blocksResult.error;',
  '    blocks = blocksResult.data || [];',
  '  }',
  '  const weeks = weeksResult.data || [];',
  '  return publishedPlans.map(plan => ({',
  '    ...plan,',
  '    weeks: weeks.filter(week => week.plan_id === plan.id).sort((a,b) => Number(a.week_number)-Number(b.week_number)).map(week => ({',
  '      ...week,',
  '      sessions: sessions.filter(session => session.plan_id === plan.id && Number(session.week_number) === Number(week.week_number))',
  '        .sort((a,b) => Number(a.day_number)-Number(b.day_number) || Number(a.session_order)-Number(b.session_order))',
  '        .map(session => ({',
  '          ...session,',
  '          exercises: items.filter(item => item.plan_session_id === session.id).sort((a,b) => Number(a.sequence_number)-Number(b.sequence_number)).map(item => ({',
  '            ...item,',
  '            blocks: blocks.filter(block => block.plan_item_id === item.id).sort((a,b) => Number(a.sequence_number)-Number(b.sequence_number))',
  '          }))',
  '        }))',
  '    }))',
  '  }));',
  '}',
  '',
  'window.HFCloud = Object.freeze({ ...window.HFCloud, getPublishedTrainingPlans });'
].join('\n');

if (!cloud.includes('getPublishedTrainingPlans')) {
  if (!cloud.includes(cloudMarker)) throw new Error('Android: no se encontró el puente HFCloud para consultar planes.');
  cloud = cloud.replace(cloudMarker, cloudMarker + cloudAddition);
}

// A compact modal keeps the coach in the athlete list and shows full plan detail without
// changing approval status or allowing edits from this view.
if (!html.includes('id="hfAthletePlanModal"')) {
  const modal = [
    '<style id="hf-athlete-planning-view-style">',
    '.hf-athlete-plan-button{display:inline-flex;align-items:center;justify-content:center;margin:8px 6px 2px 0;padding:8px 12px;border:1px solid #9db2a5;border-radius:8px;background:#eef5f0;color:#234333;font-size:12px;font-weight:700;cursor:pointer}',
    '.hf-athlete-plan-button:disabled{opacity:.55;cursor:wait}',
    '.hf-athlete-roster{margin-bottom:12px}',
    '.hf-athlete-roster>h2{margin-bottom:6px}',
    '.hf-athlete-roster>p{margin:0 0 10px;font-size:12px;color:#66736b}',
    '#hfAthletePlanModal{display:none;position:fixed;inset:0;z-index:10020;background:rgba(12,20,24,.72);padding:12px;box-sizing:border-box}',
    '#hfAthletePlanModal.open{display:flex;align-items:center;justify-content:center}',
    '#hfAthletePlanDialog{width:min(760px,100%);max-height:92dvh;overflow:auto;background:#f7f8f7;color:#20282e;border-radius:14px;box-shadow:0 18px 60px #0006}',
    '#hfAthletePlanDialog header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:#20282e;color:#fff;border-radius:14px 14px 0 0}',
    '#hfAthletePlanDialog header h2{font-size:16px;margin:0}',
    '#hfAthletePlanDialog header button{background:#fff;color:#20282e;border:0;border-radius:7px;padding:8px 11px;font-weight:700}',
    '#hfAthletePlanStatus{padding:12px 16px;font-size:13px;color:#5c6a64}',
    '#hfAthletePlanContent{padding:0 14px 16px}',
    '.hf-plan-published-card{background:#fff;border:1px solid #dce3de;border-radius:12px;margin:0 0 14px;padding:14px}',
    '.hf-plan-published-card h3{margin:0 0 5px;font-size:16px}',
    '.hf-plan-meta{font-size:12px;color:#65716c;margin-bottom:10px}',
    '.hf-plan-objective{font-size:13px;margin:8px 0}',
    '.hf-plan-week{border-top:1px solid #e7ece8;padding-top:10px;margin-top:12px}',
    '.hf-plan-week h4{font-size:14px;margin:0 0 8px}',
    '.hf-plan-session{background:#f8faf8;border:1px solid #e5ebe6;border-radius:9px;padding:10px;margin:8px 0}',
    '.hf-plan-session h5{font-size:13px;margin:0 0 6px}',
    '.hf-plan-exercise{padding:8px 0;border-top:1px dashed #dce3de;font-size:12px}',
    '.hf-plan-exercise:first-of-type{border-top:0}',
    '.hf-plan-exercise b{display:block;font-size:13px;margin-bottom:4px}',
    '.hf-plan-prescription{margin:3px 0;color:#35443b}',
    '.hf-plan-muted{color:#6b7771;font-size:11px;margin:4px 0}',
    '@media(max-width:560px){#hfAthletePlanModal{padding:6px}#hfAthletePlanDialog{max-height:96dvh;border-radius:10px}.hf-plan-published-card{padding:11px}}',
    '</style>',
    '<div id="hfAthletePlanModal" aria-hidden="true">',
    '  <section id="hfAthletePlanDialog" role="dialog" aria-modal="true" aria-labelledby="hfAthletePlanTitle">',
    '    <header><h2 id="hfAthletePlanTitle">Planificación del atleta</h2><button id="hfAthletePlanClose" type="button">Cerrar</button></header>',
    '    <div id="hfAthletePlanStatus" role="status" aria-live="polite">Cargando planificaciones publicadas…</div>',
    '    <div id="hfAthletePlanContent"></div>',
    '  </section>',
    '</div>',
    '<script id="hf-athlete-planning-view-runtime">',
    '(function(){',
    '  var modal=document.getElementById("hfAthletePlanModal");',
    '  var close=document.getElementById("hfAthletePlanClose");',
    '  var status=document.getElementById("hfAthletePlanStatus");',
    '  var content=document.getElementById("hfAthletePlanContent");',
    '  if(!modal||!close||!status||!content)return;',
    '  function esc(value){var map={"&":"&amp;","<":"&lt;",">":"&gt;"};map[String.fromCharCode(34)]="&quot;";map[String.fromCharCode(39)]="&#39;";return String(value==null?"":value).replace(/[&<>"\\u0027]/g,function(ch){return map[ch];});}',
    '  function dateLabel(value){if(!value)return "Sin fecha";var d=new Date(String(value).slice(0,10)+"T12:00:00");return Number.isNaN(d.getTime())?"Sin fecha":d.toLocaleDateString("es-AR");}',
    '  function blockLabel(block){',
    '    var intensity="";',
    '    if(block.intensity_type==="percent"&&block.intensity_value!=null) intensity=Number(block.intensity_value)+"% RM";',
    '    else if(block.intensity_type==="kg"&&block.intensity_value!=null) intensity=Number(block.intensity_value)+" kg";',
    '    else if(block.intensity_type==="rpe") intensity="RPE "+(block.target_rpe??block.intensity_value??"—");',
    '    else if(block.intensity_type==="none") intensity="Sin carga externa";',
    '    if(block.target_load_kg!=null) intensity+=(intensity?" · ":"")+Number(block.target_load_kg)+" kg";',
    '    var parts=[(block.sets??"—")+" × "+(block.reps??"—"),intensity,block.rest_seconds!=null?"Descanso "+block.rest_seconds+" s":"",block.tempo?"Tempo "+block.tempo:""];',
    '    return parts.filter(Boolean).join(" · ");',
    '  }',
    '  function renderPlans(plans){',
    '    if(!plans.length){content.innerHTML="";status.textContent="Este atleta todavía no tiene una planificación publicada por su coach.";return;}',
    '    status.textContent=plans.length===1?"1 planificación publicada.":" "+plans.length+" planificaciones publicadas.";',
    '    content.innerHTML=plans.map(function(plan){',
    '      var weeks=(plan.weeks||[]).map(function(week){',
    '        var sessions=(week.sessions||[]).map(function(session){',
    '          var exercises=(session.exercises||[]).map(function(item){',
    '            var blocks=(item.blocks||[]).map(function(block){return `<div class="hf-plan-prescription">${esc(blockLabel(block))}${block.notes?`<div class="hf-plan-muted">${esc(block.notes)}</div>`:""}</div>`;}).join("");',
    '            return `<div class="hf-plan-exercise"><b>${esc(item.exercise_name_snapshot)}</b>${blocks}${item.notes?`<div class="hf-plan-muted">${esc(item.notes)}</div>`:""}${item.original_notation?`<div class="hf-plan-muted">Notación: ${esc(item.original_notation)}</div>`:""}</div>`;',
    '          }).join("");',
    '          return `<div class="hf-plan-session"><h5>${esc(session.session_reference||("Día "+session.day_number))} · ${esc(session.session_title)}</h5>${session.scheduled_date?`<div class="hf-plan-muted">${dateLabel(session.scheduled_date)}</div>`:""}${session.focus?`<div class="hf-plan-muted">${esc(session.focus)}</div>`:""}${exercises}${session.notes?`<div class="hf-plan-muted">${esc(session.notes)}</div>`:""}</div>`;',
    '        }).join("");',
    '        return `<section class="hf-plan-week"><h4>Semana ${esc(week.week_number)} · ${esc(week.period||"")}</h4>${week.notes?`<div class="hf-plan-muted">${esc(week.notes)}</div>`:""}${sessions}</section>`;',
    '      }).join("");',
    '      return `<article class="hf-plan-published-card"><h3>${esc(plan.name)}</h3><div class="hf-plan-meta">Publicada · ${dateLabel(plan.start_date)}${plan.end_date?" - "+dateLabel(plan.end_date):""}${plan.training_phase?" · "+esc(plan.training_phase):""}</div>${plan.objective?`<p class="hf-plan-objective">${esc(plan.objective)}</p>`:""}${weeks}${plan.notes?`<p class="hf-plan-muted">${esc(plan.notes)}</p>`:""}</article>`;',
    '    }).join("");',
    '  }',
    '  async function openForAthlete(athleteId,button){',
    '    modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";',
    '    content.innerHTML="";status.textContent="Consultando planificaciones publicadas…";',
    '    if(button){button.disabled=true;button.textContent="Cargando…";}',
    '    try{',
    '      var cloudStatus=button&&button.getAttribute("data-hf-plan-cloudstatus");',
    '      if(cloudStatus==="local_only"){status.textContent="Esta ficha todavía está guardada solo en este dispositivo. Ingresá en Intercambio, configurá la conexión con HF Coach Central, iniciá sesión y pulsá «Actualizar atletas». Después podrás consultar la planificación publicada.";return;}',
    '      if(!window.HFCloud||typeof window.HFCloud.getPublishedTrainingPlans!=="function") throw new Error("No está disponible la conexión con HF Coach Central. Actualizá la aplicación.");',
    '      var plans=await window.HFCloud.getPublishedTrainingPlans(athleteId);renderPlans(plans);',
    '    }catch(error){status.textContent="No se pudo cargar la planificación: "+(error&&error.message?error.message:String(error));}',
    '    finally{if(button){button.disabled=false;button.textContent="Ver planificación";}}',
    '  }',
    '  function closeModal(){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.style.overflow="";}',
    '  close.addEventListener("click",closeModal);',
    '  modal.addEventListener("click",function(event){if(event.target===modal)closeModal();});',
    '  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&modal.classList.contains("open"))closeModal();});',
    '  document.addEventListener("click",function(event){var button=event.target.closest("[data-hf-plan-athlete]");if(!button)return;openForAthlete(button.getAttribute("data-hf-plan-athlete"),button);});',
    '})();',
    '</script>'
  ].join('\n');
  if (!html.includes('</body>')) throw new Error('Android: index.html no contiene </body>.');
  html = html.replace('</body>', modal + '\n</body>');
}

if (!cloud.includes('getPublishedTrainingPlans') || !html.includes('data-hf-plan-athlete') || !html.includes('data-hf-plan-cloudstatus') || !html.includes('hf-athlete-roster') || !html.includes('hfAthletePlanModal')) {
  throw new Error('Android: no quedaron instaladas todas las funciones para consultar planes.');
}
fs.writeFileSync(htmlPath, html, 'utf8');
fs.writeFileSync(cloudPath, cloud, 'utf8');
console.log('HF Android: perfiles de atletas incorporan consulta de planificaciones publicadas por el coach.');
