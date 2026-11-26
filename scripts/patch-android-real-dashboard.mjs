import fs from 'node:fs';

const target = process.argv[2] || 'app-source/src/index.html';
let html = fs.readFileSync(target, 'utf8');
const marker = 'HF_REAL_DASHBOARD_V2';
if (html.includes(marker)) {
  console.log('HF dashboard v2 already injected.');
  process.exit(0);
}
if (!html.includes('</body>')) throw new Error('Dashboard: index.html missing </body>');

const css = `
#hfDashboardLauncher{position:fixed!important;z-index:9800!important;right:14px!important;bottom:calc(76px + env(safe-area-inset-bottom))!important;left:auto!important;display:block!important;visibility:visible!important;opacity:1!important;border:2px solid #F6B40E!important;border-radius:999px!important;padding:12px 16px!important;background:#74ACDF!important;color:#10283B!important;font-weight:850!important;box-shadow:0 5px 22px #17324a45!important;max-width:calc(100vw - 28px)}
#hfDashboardOverlay{position:fixed!important;inset:0!important;z-index:9900!important;background:#0d1720c9!important;display:none!important;overflow:auto!important;padding:calc(12px + env(safe-area-inset-top)) 12px calc(16px + env(safe-area-inset-bottom))!important}
#hfDashboardOverlay.open{display:block!important}
#hfDashboard{width:100%;max-width:900px;margin:0 auto;background:#fff;color:#17212b;border:1px solid #d7e1e9;border-radius:20px;padding:clamp(14px,3vw,24px);box-shadow:0 20px 60px #0005}
#hfDashboardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
#hfDashboardHead h1{margin:0!important;font-size:clamp(1.5rem,5vw,2.1rem)!important;line-height:1.15!important}
#hfDashboardClose{min-height:44px;border:1px solid #d7e1e9!important;background:#fff!important;color:#17212b!important;border-radius:12px!important;padding:8px 14px!important}
.hf-dash-sub{color:#5c6b78;margin:4px 0 16px}
.hf-dash-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.hf-dash-card{border:1px solid #d7e1e9;border-radius:15px;padding:14px;background:#fff;min-width:0}
.hf-dash-card h2{font-size:1.05rem;margin:0 0 8px}
.hf-dash-card p{color:#5c6b78;margin:0 0 12px;line-height:1.4}
.hf-dash-value{font-size:1.65rem;font-weight:850;margin:0 0 4px}
.hf-dash-action{width:100%;min-height:46px;border-radius:12px!important;border:1px solid #74ACDF!important;background:#74ACDF!important;color:#10283B!important;font-weight:750!important}
.hf-dash-notice{margin-top:12px;padding:12px;border-radius:12px;background:#e7f2fb;font-size:.9rem;line-height:1.4}
#hfDashboard .hf-dash-card:nth-child(4){border-top:3px solid #F6B40E}
@media(max-width:600px){#hfDashboard{border-radius:16px;padding:14px}.hf-dash-grid{grid-template-columns:1fr}.hf-dash-card{padding:13px}}
`;
const markup = `
<style id="HF_REAL_DASHBOARD_V2">${css}</style>
<button id="hfDashboardLauncher" type="button" aria-haspopup="dialog" aria-controls="hfDashboardOverlay">Dashboard HF Coach</button>
<div id="hfDashboardOverlay" role="dialog" aria-modal="true" aria-label="Dashboard HF Coach">
<section id="hfDashboard">
<header id="hfDashboardHead"><div><h1>HF Coach</h1><p class="hf-dash-sub">Panel de entrenamiento · acceso rápido</p></div><button id="hfDashboardClose" type="button">Cerrar panel</button></header>
<div class="hf-dash-grid">
<article class="hf-dash-card"><h2>Atletas</h2><div class="hf-dash-value" id="hfDashAthleteCount">—</div><p>Registros visibles en tu listado</p><button class="hf-dash-action" data-hf-dash-go="atletas">Ir a atletas</button></article>
<article class="hf-dash-card"><h2>Sesiones</h2><div class="hf-dash-value" id="hfDashSessionCount">—</div><p>Sesiones registradas disponibles</p><button class="hf-dash-action" data-hf-dash-go="sesiones">Ir a sesiones</button></article>
<article class="hf-dash-card"><h2>Planificación</h2><p>Ver planes y programación de entrenamiento.</p><button class="hf-dash-action" data-hf-dash-go="planificacion">Abrir planificación</button></article>
<article class="hf-dash-card"><h2>Videoanálisis</h2><p>Analizar técnica y trayectoria de barra.</p><button class="hf-dash-action" data-hf-dash-go="video">Abrir videoanálisis</button></article>
<article class="hf-dash-card"><h2>Biblioteca</h2><p>Ejercicios y recursos técnicos.</p><button class="hf-dash-action" data-hf-dash-go="biblioteca">Abrir biblioteca</button></article>
<article class="hf-dash-card"><h2>Informes</h2><p>Evaluaciones e informes de seguimiento.</p><button class="hf-dash-action" data-hf-dash-go="informes">Abrir informes</button></article>
</div>
<div class="hf-dash-notice" id="hfDashNotice">Los indicadores se toman del contenido disponible en la app. Si no hay registros, se informa cero; no se inventan métricas.</div>
</section></div>
<script id="HF_REAL_DASHBOARD_JS_V2">
(()=> {
 const overlay=document.getElementById('hfDashboardOverlay'),launch=document.getElementById('hfDashboardLauncher'),close=document.getElementById('hfDashboardClose');
 if(!overlay||!launch||!close)return;
 const open=()=>{refresh();overlay.classList.add('open');document.body.style.overflow='hidden'};
 const shut=()=>{overlay.classList.remove('open');document.body.style.overflow=''};
 const visibleCount=selectors=>{for(const s of selectors){const el=document.querySelector(s);if(el){const rows=[...el.children].filter(x=>x.textContent.trim()&&!x.matches('button,.empty,[class*=empty]'));if(rows.length)return rows.length;const txt=el.textContent.trim();if(txt&& !/todav[ií]a no|no hay|sin registros|empty/i.test(txt))return 1;return 0}}return null};
 function refresh(){const a=visibleCount(['#athletesList','#athletes-list','#athletesContainer']),s=visibleCount(['#sessionsList','#sessions-list','#sessionsContainer']);const av=document.getElementById('hfDashAthleteCount'),sv=document.getElementById('hfDashSessionCount');if(av)av.textContent=a===null?'—':String(a);if(sv)sv.textContent=s===null?'—':String(s)}
 const patterns={atletas:/atletas|athletes/i,sesiones:/sesiones|sessions|registrar sesi[oó]n/i,planificacion:/planificaci[oó]n|planning|planes/i,video:/videoan[aá]lisis|an[aá]lisis de video|video analysis/i,biblioteca:/biblioteca|library|ejercicios/i,informes:/informes|reports/i};
 function findTab(kind){const p=patterns[kind];const candidates=[...document.querySelectorAll('button,[role=tab],[data-tab],a')];return candidates.find(el=>el!==launch&&!overlay.contains(el)&&p.test((el.textContent||el.getAttribute('aria-label')||'').trim()))}
 launch.addEventListener('click',open);close.addEventListener('click',shut);overlay.addEventListener('click',e=>{if(e.target===overlay)shut()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))shut()});
 overlay.querySelectorAll('[data-hf-dash-go]').forEach(btn=>btn.addEventListener('click',()=>{const tab=findTab(btn.dataset.hfDashGo);if(tab){tab.click();shut()}else{document.getElementById('hfDashNotice').textContent='La sección solicitada no fue encontrada en esta versión de la app. No se simula la navegación.'}}));
 // Force launcher visibility and open immediately: this script is injected at body end, so waiting for load may miss the event in Android WebView.
 launch.style.setProperty("display","block","important");launch.style.setProperty("visibility","visible","important");launch.style.setProperty("opacity","1","important");
 open();
})();
</script>`;
html = html.replace('</body>', markup + '\n</body>');
fs.writeFileSync(target, html, 'utf8');
console.log('HF dashboard v2 injected: visible launcher, auto-open, responsive cards, live counts, navigation links.');
