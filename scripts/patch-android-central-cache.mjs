import fs from "node:fs";
const htmlPath=process.argv[2]||"app-source/src/index.html";
const build=process.argv[3]||process.env.GITHUB_SHA||"dev";
let html=fs.readFileSync(htmlPath,"utf8");
const iframePattern=/<iframe title="HF Coach Central"[^>]*src="https:\/\/hf-coach-central\.vercel\.app\/?[^"]*"[^>]*><\/iframe>/;
if(!iframePattern.test(html)) throw new Error("No se encontró el iframe de HF Coach Central en Android.");
html=html.replace(iframePattern, '<iframe id="hfCentralIframe" title="HF Coach Central" src="https://hf-coach-central.vercel.app/?source=android&apkBuild='+build+'" loading="lazy" allow="clipboard-read; clipboard-write"></iframe>');
const bridgePattern=/<script id="HF_CENTRAL_MOBILE_BRIDGE">([\s\S]*?)<\/script>/;
const bridge=html.match(bridgePattern);
if(!bridge) throw new Error("No se encontró el puente móvil de HF Central.");
const code=[
'(function(){',
'  var open=document.getElementById("hfCentralOpen");',
'  var modal=document.getElementById("hfCentralModal");',
'  var close=document.getElementById("hfCentralClose");',
'  var iframe=document.getElementById("hfCentralIframe");',
'  if(!open||!modal||!close||!iframe)return;',
'  var base="https://hf-coach-central.vercel.app/?source=android&apkBuild='+build+'";',
'  open.addEventListener("click",function(){',
'    iframe.src=base+"&refresh="+Date.now();',
'    modal.classList.add("open");document.body.style.overflow="hidden";',
'  });',
'  close.addEventListener("click",function(){modal.classList.remove("open");document.body.style.overflow="";});',
'})();'
].join("\n");
html=html.replace(bridge[0], '<script id="HF_CENTRAL_MOBILE_BRIDGE">\n'+code+'\n</script>');
if(!html.includes('apkBuild='+build)||!html.includes('refresh="+Date.now()')) throw new Error("Cache-busting HF Central no quedó aplicado.");
fs.writeFileSync(htmlPath,html);
console.log("HF Android: iframe HF Central versionado por build y recarga forzada al abrir.");
