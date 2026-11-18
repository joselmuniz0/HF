import fs from 'node:fs';

const htmlPath = 'app-source/src/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('HF_CENTRAL_MOBILE_BRIDGE')) {
  const lines = [
    '<style id="HF_CENTRAL_MOBILE_BRIDGE">',
    '#hfCentralOpen{position:fixed;z-index:9900;right:12px;top:12px;background:#20262b;color:#fff;border:1px solid #647078;border-radius:999px;padding:10px 14px;font-weight:700;box-shadow:0 4px 18px #0005}',
    '#hfCentralModal{display:none;position:fixed;inset:0;z-index:9998;background:#111e}',
    '#hfCentralModal.open{display:block}',
    '#hfCentralModal header{height:48px;background:#20262b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font:600 14px system-ui}',
    '#hfCentralModal button{border:0;border-radius:6px;padding:8px 12px;background:#fff;color:#20262b;font-weight:700}',
    '#hfCentralModal iframe{display:block;width:100%;height:calc(100% - 48px);border:0;background:#f4f6f5}',
    '</style>',
    '<button id="hfCentralOpen" type="button">HF Coach · Mi cuenta</button>',
    '<div id="hfCentralModal" role="dialog" aria-modal="true" aria-label="HF Coach">',
    '  <header><span>HF Coach · Gestión y seguimiento</span><button id="hfCentralClose" type="button">Volver al análisis</button></header>',
    '  <iframe title="HF Coach Central" src="https://hf-coach-central.vercel.app/" loading="lazy" allow="clipboard-read; clipboard-write"></iframe>',
    '</div>',
    '<script id="HF_CENTRAL_MOBILE_BRIDGE">',
    '(function(){',
    '  var open=document.getElementById("hfCentralOpen");',
    '  var modal=document.getElementById("hfCentralModal");',
    '  var close=document.getElementById("hfCentralClose");',
    '  if(!open||!modal||!close)return;',
    '  open.addEventListener("click",function(){modal.classList.add("open");document.body.style.overflow="hidden";});',
    '  close.addEventListener("click",function(){modal.classList.remove("open");document.body.style.overflow="";});',
    '})();',
    '</script>'
  ];
  const bridge = lines.join('\n');
  if (!html.includes('</body>')) throw new Error('HF Android: index.html no contiene el cierre body.');
  html = html.replace('</body>', bridge + '\n</body>');
  fs.writeFileSync(htmlPath, html, 'utf8');
}
console.log('HF Android: acceso al portal responsive integrado sin reemplazar el analizador de video local.');
