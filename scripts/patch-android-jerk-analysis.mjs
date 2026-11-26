import fs from "node:fs";
const file = process.argv[2] || "app-source/src/index.html";
let html = fs.readFileSync(file, "utf8");
const oldSelector = '<option value="Snatch">Arranque (Snatch)</option><option value="Clean">Cargada (Clean)</option>';
const jerkOptions = '<option value="Split Jerk">Envión — Split Jerk</option><option value="Push Jerk">Envión — Push Jerk</option><option value="Clean & Jerk">Cargada + Envión — Clean & Jerk</option>';
if (html.includes('value="Split Jerk"') && html.includes('value="Push Jerk"') && html.includes('value="Clean & Jerk"')) {
  html = html.replace('Cargada + Envión (análisis del Jerk)', 'Cargada + Envión — Clean & Jerk');
} else if (html.includes(oldSelector)) {
  html = html.replace(oldSelector, oldSelector + jerkOptions);
} else {
  throw new Error("No se encontró el selector base de levantamientos para integrar Jerk.");
}
if (!html.includes('value="Split Jerk"') || !html.includes('value="Push Jerk"') || !html.includes('value="Clean & Jerk"')) throw new Error("Selector Jerk no quedó integrado.");
const marker = '    const inc=f=>{const a=pt(f,11),b=pt(f,23);return Math.atan2(Math.abs(a.x-b.x),b.y-a.y)*180/Math.PI};';
if (!html.includes(marker)) {
  if (!html.includes('Evaluación específica del Jerk')) throw new Error("No se encontró el punto de inserción del análisis Jerk.");
  console.log("Jerk analyzer already patched; no-op.");
} else {
  const block = [
'    // Jerk-specific branch: phases, separate metrics and pending coach review.',
'    if(["Split Jerk","Push Jerk","Clean & Jerk"].includes(L)){',
'      const kneeSm=sm(kn), wristSm=sm(wy), earlyEnd=Math.max(2,Math.floor(n*.30));',
'      const dip=mn(kneeSm,0,Math.min(n-1,earlyEnd));',
'      let drive=dip; for(let i=dip+1;i<n;i++) if(wristSm[i]<wristSm[drive]) drive=i;',
'      let receive=Math.min(n-1,drive+1); for(let i=drive+1;i<n;i++) if(kneeSm[i]<kneeSm[receive]) receive=i;',
'      const lock=Math.min(n-1,Math.max(drive,receive)), recover=Math.min(n-1,Math.max(receive,Math.floor(receive+(n-receive)*.45)));',
'      const splitWidth=Math.abs(pt(V[receive],27).x-pt(V[receive],28).x), stanceWidth=Math.abs(pt(V[dip],27).x-pt(V[dip],28).x)||1;',
'      const isSplit=L==="Split Jerk" || (L==="Clean & Jerk" && splitWidth/stanceWidth>1.35);',
'      const dipDriveTime=Math.max(0,V[drive].t-V[dip].t), underbarTime=Math.max(0,V[receive].t-V[drive].t);',
'      const wristShoulderGap=Math.hypot(pt(V[lock],15).x-pt(V[lock],11).x,pt(V[lock],15).y-pt(V[lock],11).y);',
'      const shoulderScale=Math.hypot(pt(V[lock],11).x-pt(V[lock],23).x,pt(V[lock],11).y-pt(V[lock],23).y)||1, gapRatio=wristShoulderGap/shoulderScale;',
'      const footRecovery=Math.abs(V[recover].p[27].x-V[recover].p[28].x)*W, findings=[];',
'      if(dipDriveTime>.45) findings.push({e:"Dip/drive prolongado",m:dipDriveTime.toFixed(2)+" s desde dip hasta elevación estimada de muñecas",c:["Dip excesivamente profundo","Pérdida de tensión o sincronización"],x:["Push Press","Jerk Dip Squat","Tall Jerk"]});',
'      if(underbarTime>.45) findings.push({e:"Desplazamiento bajo la barra lento",m:underbarTime.toFixed(2)+" s desde drive hasta recepción estimada",c:["Falta de decisión en el desplazamiento","Drive vertical insuficiente"],x:["Jerk Balance","Tall Jerk","Jerk from Blocks"]});',
'      if(gapRatio>.30) findings.push({e:"Lockout posiblemente incompleto",m:"Ratio muñeca-hombro: "+gapRatio.toFixed(2),c:["Empuje final insuficiente","Movilidad o estabilidad overhead"],x:["Push Jerk","Jerk Recovery","Overhead Hold"]});',
'      if(isSplit && recover>receive && footRecovery>0) findings.push({e:"Recuperación de pies a revisar",m:"La posición estimada al final difiere de la recepción; confirmar visualmente.",c:["Secuencia de recuperación desordenada","Base de recepción demasiado amplia"],x:["Split Jerk Recovery","Jerk Recovery"]});',
'      const phases=[["Rack inicial",0],["Dip",dip],["Drive",drive],["Recepción",receive],["Lockout",lock],["Recuperación",recover]];',
'      $("#st").textContent="Generando fotogramas del Jerk…";',
'      const snap=async f=>{await seek(f.t);const cv=document.createElement("canvas"),sc=Math.min(1,420/W);cv.width=W*sc;cv.height=H*sc;const g=cv.getContext("2d");g.drawImage(vid,0,0,cv.width,cv.height);g.strokeStyle="#ec5b50";g.lineWidth=3;g.beginPath();[[11,13,15],[11,23,25,27,31]].forEach(ch=>ch.forEach((i,j)=>{const q=f.p[i+s];j?g.lineTo(q.x*cv.width,q.y*cv.height):g.moveTo(q.x*cv.width,q.y*cv.height)}));g.stroke();return cv.toDataURL("image/jpeg",.8)};',
'      const urls=[];for(const [,i] of phases) urls.push(await snap(V[Math.min(n-1,i)]));',
'      const row=(a,b)=>"<tr><td>"+a+"</td><td>"+b+"</td></tr>";',
'      $("#out").innerHTML=(conf<.6?"<div class=\\"card bad\\"><b>Confianza baja.</b> Resultados inciertos.</div>":"")+"<div class=\\"card\\"><h3>Evaluación específica del Jerk</h3><table>"+row("Variante",isSplit?"Split Jerk / tijera":"Push Jerk / paralela")+row("Dip estimado",kn[dip].toFixed(0)+"°")+row("Dip → Drive",dipDriveTime.toFixed(2)+" s")+row("Drive → Recepción",underbarTime.toFixed(2)+" s")+row("Lockout ratio",gapRatio.toFixed(2))+row("Recepción",isSplit?"Tijera estimada":"Paralela estimada")+"</table></div>"+',
'        "<div class=\\"card\\"><h3>Fases detectadas</h3><div class=\\"row\\">"+phases.map((p,i)=>"<figure style=\\"margin:0\\"><img src=\\""+urls[i]+"\\" alt=\\""+p[0]+"\\"/><figcaption class=\\"mut\\">"+p[0]+"</figcaption></figure>").join("")+"</div></div>"+',
'        "<h2>Diagnóstico</h2>"+(findings.length?findings.map(d=>"<div class=\\"card bad\\"><b>"+d.e+"</b><div class=\\"mut\\">Indicador: "+d.m+"</div><p><b>Posibles causas:</b> "+d.c.join("; ")+"</p><p><b>Ejercicios:</b> "+d.x.map(z=>"<a class=\\"tag\\" href=\\""+yt(z)+"\\" target=\\"_blank\\" rel=\\"noopener\\">"+z+"</a>").join("")+"</p></div>").join(""):"<div class=\\"card\\">Sin alertas automáticas; validar manualmente.</div>")+"<p class=\\"mut\\">Estimación 2D heurística. Requiere revisión de coach. Clean & Jerk prioriza el segmento de envión.</p>";',
'      const evaluation={id:crypto.randomUUID(),athlete_id:$("#analysisAth").value||null,lift:L,created_at:new Date().toISOString(),metrics:{jerk_variant:isSplit?"split":"push",dip_knee_deg:Number(kn[dip].toFixed(1)),dip_to_drive_seconds:Number(dipDriveTime.toFixed(3)),drive_to_receive_seconds:Number(underbarTime.toFixed(3)),lockout_gap_ratio:Number(gapRatio.toFixed(3)),recovery_foot_gap_px:Number(footRecovery.toFixed(1))},findings,confidence:Number(conf.toFixed(3)),frame_count:n,review_status:"pending",video_name:selectedVideoFile?.name||null};',
'      const saved=JSON.parse(localStorage.getItem("hf_evaluations")||"[]");saved.push(evaluation);localStorage.setItem("hf_evaluations",JSON.stringify(saved));window.HFLastEvaluation=evaluation;',
'      $("#st").textContent="Jerk analizado: "+n+" cuadros. Evaluación pendiente de revisión del coach.";$("#pg").hidden=true;$("#go").disabled=false;return;',
'    }'
  ].join("\n");
  html=html.replace(marker,marker+"\n"+block);
}
fs.writeFileSync(file,html);
console.log("Jerk selector and analyzer integrated.");
