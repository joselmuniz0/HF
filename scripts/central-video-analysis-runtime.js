let hfCoachPoseLandmarker = null;
let hfCoachPoseTimestamp = 0;
let hfPendingVideoAnalysis = null;

function isVideoMediaAsset(asset) {
  return Boolean(asset && (String(asset.mime_type || "").toLowerCase().startsWith("video/") ||
    /\.(mp4|mov|webm)$/i.test(String(asset.file_name || ""))));
}
function populateCoachVideoAssetOptions() {
  const athleteSelect = $("coachVideoAthlete"), mediaSelect = $("coachVideoExisting");
  if (!athleteSelect || !mediaSelect) return;
  const selectedAthlete = athleteSelect.value, selectedMedia = mediaSelect.value;
  athleteSelect.innerHTML = '<option value="">Seleccionar atleta…</option>' +
    (data.athletes || []).map(function(a){ return '<option value="' + esc(a.id) + '">' + esc(a.full_name) + '</option>'; }).join("");
  if (selectedAthlete && data.athletes.some(function(a){ return a.id === selectedAthlete; })) athleteSelect.value = selectedAthlete;
  const assets = (data.mediaAssets || []).filter(function(a){ return a.athlete_id === athleteSelect.value && isVideoMediaAsset(a); });
  mediaSelect.innerHTML = '<option value="">Seleccionar video ya recibido…</option>' +
    assets.map(function(a){ return '<option value="' + esc(a.id) + '">' + esc(a.file_name) + ' · ' + date(a.created_at) + '</option>'; }).join("");
  if (selectedMedia && assets.some(function(a){ return a.id === selectedMedia; })) mediaSelect.value = selectedMedia;
}
function hfVideoAngle(a,b,c) {
  const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y],denom=(Math.hypot.apply(null,u)*Math.hypot.apply(null,v))||1;
  return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/denom)))*180/Math.PI;
}
function hfVideoMin(a,s,e) { let m=s; for(let i=s;i<=e;i++) if(a[i]<a[m]) m=i; return m; }
function hfVideoMax(a,s,e) { let m=s; for(let i=s;i<=e;i++) if(a[i]>a[m]) m=i; return m; }
function hfVideoSmooth(a) { return a.map(function(_,i){ return (a[Math.max(0,i-1)]+a[i]+a[Math.min(a.length-1,i+1)])/3; }); }
function hfVideoSeek(video,seconds) {
  return new Promise(function(resolve,reject) {
    let done=false;
    const finish=function(){ if(done)return; done=true; clearTimeout(timer); video.removeEventListener("seeked",finish); resolve(); };
    const timer=setTimeout(finish,3500);
    video.addEventListener("seeked",finish,{once:true});
    try { video.currentTime=Math.min(Math.max(seconds,0.001),Math.max(0.001,video.duration-0.001)); }
    catch(error){ clearTimeout(timer); reject(error); }
  });
}
async function hfLoadPoseModel() {
  if(hfCoachPoseLandmarker) return hfCoachPoseLandmarker;
  const base="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const model="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  const module=await import(base+"/vision_bundle.mjs");
  const fileset=await module.FilesetResolver.forVisionTasks(base+"/wasm");
  hfCoachPoseLandmarker=await module.PoseLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:model},runningMode:"VIDEO",numPoses:1});
  return hfCoachPoseLandmarker;
}
async function hfCoachVideoFile() {
  const localFile=$("coachVideoFile").files && $("coachVideoFile").files[0];
  if(localFile) return {file:localFile,mediaAsset:null};
  const mediaId=$("coachVideoExisting").value;
  if(!mediaId) throw new Error("Seleccioná un video existente o cargá un archivo desde tu equipo.");
  const asset=(data.mediaAssets||[]).find(function(a){return a.id===mediaId;});
  if(!asset) throw new Error("El video seleccionado ya no está disponible. Actualizá los datos del atleta.");
  const signed=await getClient().storage.from("athlete-media").createSignedUrl(asset.object_path,3600);
  if(signed.error) throw signed.error;
  const response=await fetch(signed.data.signedUrl);
  if(!response.ok) throw new Error("No se pudo descargar el video privado para analizarlo.");
  const blob=await response.blob();
  return {file:new File([blob],asset.file_name,{type:asset.mime_type||blob.type||"video/mp4"}),mediaAsset:asset};
}
function hfCoachVideoResultHtml(result) {
  const labels=result.metrics.jerk_mode?[
    ["Dip de rodilla",result.metrics.dip_knee_deg,"°"],["Dip → Drive",result.metrics.dip_to_drive_seconds," s"],
    ["Drive → Recepción",result.metrics.drive_to_receive_seconds," s"],["Lockout ratio",result.metrics.lockout_gap_ratio,""],
    ["Tipo de recepción",result.metrics.jerk_variant_label,""],["Recuperación de pies",result.metrics.recovery_foot_gap_px," px"]
  ]:[
    ["Cambio de tronco",result.metrics.torso_change_deg,"°"],["Extensión de rodilla",result.metrics.knee_extension_deg,"°"],
    ["Extensión de cadera",result.metrics.hip_extension_deg,"°"],["Distancia barra–cadera",result.metrics.bar_hip_distance_ratio,""],
    ["Extensión a recepción",result.metrics.extension_to_catch_seconds," s"],["Rodilla en recepción",result.metrics.catch_knee_deg,"°"],
    ["Tronco en recepción",result.metrics.catch_torso_deg,"°"]
  ];
  const metrics=labels.map(function(r){return '<div class="metric"><b>'+esc(r[1])+r[2]+'</b><span>'+esc(r[0])+'</span></div>';}).join("");
  const frames=result.frames.map(function(f){return '<figure><img src="'+f.url+'" alt="'+esc(f.title)+'"><figcaption>'+esc(f.title)+'</figcaption></figure>';}).join("");
  const findings=result.findings.length?result.findings.map(function(f){
    const links=(f.x||[]).map(function(name){
      const href="https://www.youtube.com/results?search_query="+encodeURIComponent(name+" weightlifting");
      return '<a class="tag" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(name)+'</a>';
    }).join(" ");
    return '<article class="evaluation"><b>'+esc(f.e)+'</b><p class="muted">Error observado: '+esc(f.m)+'</p><p><b>Causas probables (a confirmar):</b> '+esc((f.c||[]).join("; "))+'</p><p><b>Recursos de corrección:</b> '+links+'</p></article>';
  }).join(""):'<p class="muted">Con estos criterios no se marcaron desvíos. Revisá el video igualmente.</p>';
  return (result.confidence<0.6?'<p class="status error">Confianza baja: el modelo detectó poco el lado del cuerpo. El resultado puede fallar; revisá el encuadre y la iluminación.</p>':'')+
    '<div class="metrics">'+metrics+'</div><h4>Fotogramas clave</h4><div class="hf-video-frames">'+frames+'</div><h4>Hallazgos automáticos</h4>'+findings+
    '<p class="notice">Estimación 2D desde un solo ángulo. Los valores y hallazgos son orientativos, pueden fallar y deben ser revisados por un coach. No son mediciones biomecánicas de laboratorio ni un diagnóstico médico.</p>';
}
async function runCoachVideoAnalysis(event) {
  event.preventDefault();
  const athleteId=$("coachVideoAthlete").value, lift=$("coachVideoLift").value, status=$("coachVideoStatus");
  const analyzeButton=$("coachVideoAnalyze"), progress=$("coachVideoProgress"), resultNode=$("coachVideoAnalysisResult");
  if(!athleteId){status.textContent="Seleccioná el atleta antes de analizar.";status.className="status error";return;}
  analyzeButton.disabled=true; $("coachVideoSave").hidden=true; hfPendingVideoAnalysis=null; resultNode.innerHTML="";
  progress.hidden=false;progress.value=0;
  let videoUrl=null;
  const video=document.createElement("video");video.muted=true;video.playsInline=true;video.preload="auto";
  try {
    status.textContent="Preparando el video…";status.className="status";
    const chosen=await hfCoachVideoFile(), file=chosen.file;
    if(file.size>100*1024*1024) throw new Error("El video supera el límite de 100 MB.");
    if(!["video/mp4","video/quicktime","video/webm"].includes(file.type)) throw new Error("Formato no admitido. Utilizá MP4, MOV o WEBM.");
    videoUrl=URL.createObjectURL(file);video.src=videoUrl;
    await new Promise(function(resolve,reject){
      if(video.readyState>=1)return resolve();
      video.onloadedmetadata=resolve;
      video.onerror=function(){reject(new Error("El navegador no puede leer este formato. Probá con MP4 (H.264)."));};
      video.load();
    });
    if(!Number.isFinite(video.duration)||video.duration<=0) throw new Error("No se pudo determinar la duración del video.");
    if(video.duration>20) throw new Error("El video dura más de 20 segundos. Recortalo para incluir un solo intento completo.");
    if(!video.videoWidth||!video.videoHeight) throw new Error("El video no tiene dimensiones válidas.");
    status.textContent="Cargando MediaPipe. La primera vez requiere conexión a Internet…";
    const landmarker=await hfLoadPoseModel(), width=video.videoWidth, height=video.videoHeight, frames=[];
    status.textContent="Analizando cuadros…";
    for(let t=0;t<video.duration;t+=1/15){
      await hfVideoSeek(video,t);hfCoachPoseTimestamp+=67;
      const detection=landmarker.detectForVideo(video,hfCoachPoseTimestamp);
      frames.push({t:t,p:detection.landmarks&&detection.landmarks[0]?detection.landmarks[0]:null});
      progress.value=Math.min(1,t/video.duration);
    }
    const validFrames=frames.filter(function(f){return Boolean(f.p);});
    if(validFrames.length<10) throw new Error("No se detectó a la persona en suficientes cuadros. Filmá de costado, con buena luz y el cuerpo completo visible.");
    const visibility=function(offset){
      return validFrames.reduce(function(total,f){
        return total+[11,13,15,23,25,27].reduce(function(sum,i){return sum+Number((f.p[i+offset]||{}).visibility||0);},0);
      },0)/(validFrames.length*6);
    };
    const side=visibility(1)>visibility(0)?1:0, confidence=Math.max(visibility(0),visibility(1));
    const point=function(f,i){return {x:f.p[i+side].x*width,y:f.p[i+side].y*height};};
    const count=validFrames.length, wristY=hfVideoSmooth(validFrames.map(function(f){return point(f,15).y;}));
    const knee=validFrames.map(function(f){return hfVideoAngle(point(f,23),point(f,25),point(f,27));});
    const hip=validFrames.map(function(f){return hfVideoAngle(point(f,11),point(f,23),point(f,25));});
    const inclination=function(f){const shoulder=point(f,11),hipPoint=point(f,23);return Math.atan2(Math.abs(shoulder.x-hipPoint.x),hipPoint.y-shoulder.y)*180/Math.PI;};
    const end=hfVideoMin(wristY,0,count-1),start=hfVideoMax(wristY,0,end);
    if(end-start<5) throw new Error("No pude identificar el levantamiento. Verificá que el video muestre un solo intento completo.");
    const catchIndex=hfVideoMin(knee,start+Math.round((end-start)*0.3),end), extensionIndex=hfVideoMax(knee,start,catchIndex);
    let kneeStart=start;
    while(kneeStart<catchIndex&&wristY[kneeStart]>point(validFrames[kneeStart],25).y)kneeStart++;
    const torsoLength=Math.hypot(point(validFrames[start],11).x-point(validFrames[start],23).x,point(validFrames[start],11).y-point(validFrames[start],23).y)||1;
    const torsoChange=inclination(validFrames[kneeStart])-inclination(validFrames[start]);
    const barDistance=Math.abs(point(validFrames[extensionIndex],15).x-point(validFrames[extensionIndex],23).x)/torsoLength;
    const extensionToCatch=validFrames[catchIndex].t-validFrames[extensionIndex].t, catchInclination=inclination(validFrames[catchIndex]);
    const snatch=lift==="Snatch", findings=[];
    if(["Split Jerk","Push Jerk","Clean & Jerk"].includes(lift)){
      const earlyEnd=Math.max(start+2,Math.min(end,start+Math.floor((end-start)*.30)));
      let dip=start;for(let i=start;i<=earlyEnd;i++)if(knee[i]<knee[dip])dip=i;
      let drive=dip;for(let i=dip+1;i<=end;i++)if(wristY[i]<wristY[drive])drive=i;
      let receive=Math.min(count-1,drive+1);for(let i=drive+1;i<count;i++)if(knee[i]<knee[receive])receive=i;
      let lock=drive;for(let i=drive;i<count;i++)if(wristY[i]<wristY[lock])lock=i;
      const recover=Math.min(count-1,Math.max(receive,Math.floor(receive+(count-receive)*.45)));
      const dipDrive=Math.max(0,validFrames[drive].t-validFrames[dip].t),driveReceive=Math.max(0,validFrames[receive].t-validFrames[drive].t);
      const wristShoulderGap=Math.hypot(point(validFrames[lock],15).x-point(validFrames[lock],11).x,point(validFrames[lock],15).y-point(validFrames[lock],11).y);
      const shoulderScale=Math.hypot(point(validFrames[lock],11).x-point(validFrames[lock],23).x,point(validFrames[lock],11).y-point(validFrames[lock],23).y)||1;
      const lockoutRatio=wristShoulderGap/shoulderScale;
      const feetGap=Math.abs(validFrames[recover].p[27+side].x-validFrames[recover].p[28+side].x)*width;
      const splitGap=Math.abs(validFrames[receive].p[27+side].x-validFrames[receive].p[28+side].x);
      const baseGap=Math.abs(validFrames[dip].p[27+side].x-validFrames[dip].p[28+side].x)||1;
      const isSplit=lift==="Split Jerk"||(lift==="Clean & Jerk"&&splitGap/baseGap>1.35);
      const variantLabel=isSplit?"Split Jerk / tijera":"Push Jerk / paralela";
      if(dipDrive>.45)findings.push({e:"Dip/drive prolongado",m:dipDrive.toFixed(2)+" s desde el dip hasta el drive estimado",c:["Dip excesivamente profundo","Pérdida de tensión o sincronización"],x:["Push Press","Jerk Dip Squat","Tall Jerk"]});
      if(driveReceive>.45)findings.push({e:"Desplazamiento bajo la barra lento",m:driveReceive.toFixed(2)+" s desde el drive hasta la recepción estimada",c:["Falta de decisión en el desplazamiento","Drive vertical insuficiente"],x:["Jerk Balance","Tall Jerk","Jerk from Blocks"]});
      if(lockoutRatio>.30)findings.push({e:"Lockout posiblemente incompleto",m:"Ratio muñeca-hombro: "+lockoutRatio.toFixed(2),c:["Empuje final insuficiente","Movilidad o estabilidad overhead"],x:["Push Jerk","Jerk Recovery","Overhead Hold"]});
      if(isSplit&&feetGap>0)findings.push({e:"Recuperación de pies a revisar",m:"La posición estimada al final difiere de la recepción; confirmar visualmente.",c:["Secuencia de recuperación desordenada","Base de recepción demasiado amplia"],x:["Split Jerk Recovery","Jerk Recovery"]});
      status.textContent="Generando fotogramas de las fases del Jerk…";
      const jerkPhases=[["Rack inicial",start],["Dip",dip],["Drive",drive],["Recepción",receive],["Lockout",lock],["Recuperación",recover]],jerkImages=[];
      for(const phase of jerkPhases){
        const frame=validFrames[Math.min(count-1,phase[1])];await hfVideoSeek(video,frame.t);
        const canvas=document.createElement("canvas"),scale=Math.min(1,420/width);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
        const ctx=canvas.getContext("2d");ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.strokeStyle="#d84a41";ctx.lineWidth=3;
        [[11,13,15],[11,23,25,27,31]].forEach(chain=>chain.forEach((i,j)=>{const p=frame.p[i+side];if(j)ctx.lineTo(p.x*canvas.width,p.y*canvas.height);else ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.stroke();}));
        jerkImages.push({title:phase[0],url:canvas.toDataURL("image/jpeg",.8)});
      }
      const jerkMetrics={jerk_mode:true,jerk_variant:isSplit?"split":"push",jerk_variant_label:variantLabel,
        dip_knee_deg:Number(knee[dip].toFixed(1)),dip_to_drive_seconds:Number(dipDrive.toFixed(3)),
        drive_to_receive_seconds:Number(driveReceive.toFixed(3)),lockout_gap_ratio:Number(lockoutRatio.toFixed(3)),
        recovery_foot_gap_px:Number(feetGap.toFixed(1))};
      hfPendingVideoAnalysis={athleteId:athleteId,lift:lift,file:file,mediaAsset:chosen.mediaAsset,metrics:jerkMetrics,
        findings:findings,confidence:Number(confidence.toFixed(3)),frameCount:count,createdAt:new Date().toISOString()};
      resultNode.innerHTML=hfCoachVideoResultHtml({metrics:jerkMetrics,findings:findings,confidence:confidence,frames:jerkImages});
      $("coachVideoSave").hidden=false;status.textContent="Análisis del Jerk terminado. Revisá las fases e indicadores antes de guardar.";
      status.className="status success";return;
    }
    if(torsoChange>8)findings.push({e:"Caderas suben más rápido que los hombros en el primer tirón",m:"El tronco se inclina "+torsoChange.toFixed(0)+"° más entre el piso y la rodilla",c:["Posición inicial inadecuada","Debilidad de piernas o espalda"],x:[lift+" Deadlift",lift+" Deadlift with Pause"]});
    if(barDistance>0.45)findings.push({e:"Barra alejada del cuerpo en la extensión",m:"Muñecas a "+barDistance.toFixed(2)+" largos de tronco de la cadera",c:["Trayectoria incorrecta","Extensión prematura","Brazos activados antes de tiempo","Posición inicial inadecuada"],x:[lift+" Pull","Hang "+lift,lift+" High Pull","Muscle "+lift,lift+" Pull from Blocks"]});
    if(knee[extensionIndex]<165||hip[extensionIndex]<165)findings.push({e:"Extensión incompleta",m:"Rodilla "+knee[extensionIndex].toFixed(0)+"° y cadera "+hip[extensionIndex].toFixed(0)+"° en el punto de máxima extensión",c:["Equilibrio en talones","Transición apresurada"],x:[lift+" Pull",lift+" High Pull","Hang "+lift]});
    if(extensionToCatch>0.5)findings.push({e:"Entrada lenta bajo la barra",m:extensionToCatch.toFixed(2)+" s entre la extensión y la recepción",c:["Falta de empuje de brazos","Falta de coordinación"],x:snatch?["Snatch Balance","Drop Snatch","Tall Snatch"]:["Tall Clean","Clean with Pause","Front Squat"]});
    if(catchInclination>35)findings.push({e:"Tronco muy inclinado en la recepción",m:"Inclinación del tronco de "+catchInclination.toFixed(0)+"° respecto de la vertical",c:["Movilidad limitada de tobillos o cadera","Recepción con la barra adelantada"],x:snatch?["Overhead Squat","Overhead Squat with Pause"]:["Front Squat","Front Squat with Pause"]});
    status.textContent="Generando fotogramas clave…";
    const snapshot=async function(frame){
      await hfVideoSeek(video,frame.t);
      const canvas=document.createElement("canvas"),scale=Math.min(1,420/width);
      canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
      const context=canvas.getContext("2d");context.drawImage(video,0,0,canvas.width,canvas.height);
      context.strokeStyle="#d84a41";context.lineWidth=3;context.beginPath();
      [[11,13,15],[11,23,25,27,31]].forEach(function(chain){
        chain.forEach(function(i,index){const p=frame.p[i+side];if(index)context.lineTo(p.x*canvas.width,p.y*canvas.height);else context.moveTo(p.x*canvas.width,p.y*canvas.height);});
      });
      context.stroke();return canvas.toDataURL("image/jpeg",0.8);
    };
    const keyframes=[{title:"Inicio",frame:validFrames[start]},{title:"Extensión",frame:validFrames[extensionIndex]},{title:"Recepción",frame:validFrames[catchIndex]}], images=[];
    for(const item of keyframes)images.push({title:item.title,url:await snapshot(item.frame)});
    const metrics={
      torso_change_deg:Number(torsoChange.toFixed(1)),knee_extension_deg:Number(knee[extensionIndex].toFixed(1)),
      hip_extension_deg:Number(hip[extensionIndex].toFixed(1)),bar_hip_distance_ratio:Number(barDistance.toFixed(3)),
      extension_to_catch_seconds:Number(extensionToCatch.toFixed(3)),catch_knee_deg:Number(knee[catchIndex].toFixed(1)),
      catch_torso_deg:Number(catchInclination.toFixed(1))
    };
    hfPendingVideoAnalysis={athleteId:athleteId,lift:lift,file:file,mediaAsset:chosen.mediaAsset,metrics:metrics,
      findings:findings,confidence:Number(confidence.toFixed(3)),frameCount:count,createdAt:new Date().toISOString()};
    resultNode.innerHTML=hfCoachVideoResultHtml({metrics:metrics,findings:findings,confidence:confidence,frames:images});
    $("coachVideoSave").hidden=false;
    status.textContent="Análisis terminado. Revisá los indicadores antes de guardarlo en la ficha.";
    status.className="status success";
  }catch(error){
    status.textContent="No se pudo analizar el video: "+(error.message||error);status.className="status error";hfPendingVideoAnalysis=null;
  }finally{
    analyzeButton.disabled=false;progress.hidden=true;if(videoUrl)URL.revokeObjectURL(videoUrl);
  }
}
async function saveCoachVideoAnalysis() {
  const pending=hfPendingVideoAnalysis,status=$("coachVideoStatus"),saveButton=$("coachVideoSave");
  if(!pending){status.textContent="Primero tenés que completar el análisis.";status.className="status error";return;}
  saveButton.disabled=true;
  try{
    const sb=getClient();let mediaAssetId=pending.mediaAsset?pending.mediaAsset.id:pending.mediaAssetId||null;
    if(!mediaAssetId){
      const safeName=pending.file.name.replace(/[^a-z0-9._-]/gi,"_").slice(-80);
      const objectPath=organizationId+"/"+pending.athleteId+"/"+Date.now()+"-"+safeName;
      const upload=await sb.storage.from("athlete-media").upload(objectPath,pending.file,{contentType:pending.file.type,upsert:false});
      if(upload.error)throw upload.error;
      const meta=await sb.from("media_assets").insert({
        organization_id:organizationId,athlete_id:pending.athleteId,uploaded_by:currentUserId,
        object_path:objectPath,file_name:pending.file.name,mime_type:pending.file.type,size_bytes:pending.file.size
      }).select("id").single();
      if(meta.error){await sb.storage.from("athlete-media").remove([objectPath]);throw meta.error;}
      mediaAssetId=meta.data.id;pending.mediaAssetId=mediaAssetId;
    }
    const result=await sb.from("evaluations").insert({
      organization_id:organizationId,athlete_id:pending.athleteId,created_by:currentUserId,lift:pending.lift,
      created_at:pending.createdAt,metrics:pending.metrics,findings:pending.findings,confidence:pending.confidence,
      frame_count:pending.frameCount,review_status:"pending",video_name:pending.file.name,media_asset_id:mediaAssetId
    }).select("id").single();
    if(result.error)throw result.error;
    $("coachVideoAnalysisForm").reset();$("coachVideoAnalysisDetails").open=false;
    $("coachVideoAnalysisResult").innerHTML="";$("coachVideoSave").hidden=true;hfPendingVideoAnalysis=null;
    await loadData();message("Video y análisis guardados en la ficha del atleta. La evaluación queda pendiente de revisión del coach.","success");
  }catch(error){status.textContent="El análisis no pudo guardarse: "+(error.message||error);status.className="status error";}
  finally{saveButton.disabled=false;}
}
async function showEvaluationVideo(button) {
  const card=button.closest(".evaluation, .timeline-row"),preview=card&&card.querySelector("[data-video-preview]");
  const asset=(data.mediaAssets||[]).concat(athletePortalData.mediaAssets||[]).find(function(a){return a.id===button.dataset.mediaAsset;});
  if(!preview||!asset)return;
  button.disabled=true;
  try{
    const signed=await getClient().storage.from("athlete-media").createSignedUrl(asset.object_path,3600);
    if(signed.error)throw signed.error;
    preview.innerHTML='<video controls playsinline preload="metadata" src="'+esc(signed.data.signedUrl)+'"></video>';preview.hidden=false;
  }catch(error){preview.innerHTML='<p class="status error">No se pudo abrir el video: '+esc(error.message||error)+'</p>';preview.hidden=false;}
  finally{button.disabled=false;}
}
