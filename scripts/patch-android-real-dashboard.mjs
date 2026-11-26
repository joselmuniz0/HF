import fs from 'node:fs';

const target = process.argv[2] || 'app-source/src/index.html';
let html = fs.readFileSync(target, 'utf8');
if (html.includes('HF_REAL_DASHBOARD_V1')) {
  console.log('HF dashboard already injected; no changes.');
  process.exit(0);
}
if (!html.includes('</body>')) throw new Error('Dashboard: index.html missing </body>');

const css = `
#hfDashboardLauncher{position:fixed;z-index:9800;left:12px;bottom:calc(14px + env(safe-area-inset-bottom));border:0;border-radius:999px;padding:12px 16px;background:#74ACDF;color:#10283B;font-weight:800;box-shadow:0 5px 22px #17324a35}
#hfDashboardOverlay{position:fixed;inset:0;z-index:9900;background:#0d1720a8;display:none;overflow:auto;padding:clamp(12px,3vw,24px)}
#hfDashboardOverlay.open{display:block}
#hfDashboard{max-width:1000px;margin:0 auto;background:var(--hf-surface,#fff);color:var(--hf-text,#17212b);border-radius:22px;padding:clamp(16px,3vw,26px);box-shadow:0 20px 60px #0004}
#hfDashboardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#hfDashboardHead h1{margin:0 0 6px!important}
#hfDashboardClose{min-height:44px;border:1px solid var(--hf-border,#d7e1e9);background:var(--hf-surface,#fff);color:var(--hf-text,#17212b);border-radius:12px;padding:8px 14px}
.hf-dash-sub{color:var(--hf-text-muted,#5c6b78);margin:0 0 18px}
.hf-dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.hf-dash-card{border:1px solid var(--hf-border,#d7e1e9);border-radius:16px;padding:16px;background:var(--hf-surface-raised,#fff)}
.hf-dash-card h2{font-size:1.08rem;margin:0 0 8px}
.hf-dash-card p{color:var(--hf-text-muted,#5c6b78);margin:0 0 12px}
.hf-dash-value{font-size:1.8rem;font-weight:800;letter-spacing:-.03em;margin:0 0 4px}
.hf-dash-action{width:100%;min-height:44px;border-radius:12px;border:1px solid var(--hf-accent,#74ACDF);background:var(--hf-accent,#74ACDF);color:var(--hf-accent-foreground,#10283B);font-weight:750}
.hf-dash-notice{margin-top:14px;padding:12px;border-radius:12px;background:var(--hf-accent-soft,#e7f2fb);font-size:.9rem}
@media(max-width:600px){#hfDashboardOverlay{padding:10px}#hfDashboard{border-radius:18px;padding:15px}.hf-dash-grid{grid-template-columns:1fr}}
`;
const markup = `
<style id="HF_REAL_DASHBOARD_V1">${css}</style>
<button id="hfDashboardLauncher" type="button" aria-haspopup="dialog">Inicio · Dashboard</button>
<div id="hfDashboardOverlay" role="dialog" aria-modal="true" aria-label="Dashboard HF Coach">
<section id="hfDashboard">
<header id="hfDashboardHead"><div><h1>HF Coach</h1><p class="hf-dash-sub">Panel de entrenamiento · acceso rápido</p></div><button id="hfDashboardClose" type="button">Cerrar</button></header>
<div class="hf-dash-grid">
<article class="hf-dash-card"><h2>Atletas</h2><div class="hf-dash-value" id="hfDashAthleteCount">—</div><p>Perfiles cargados en este dispositivo</p><button class="hf-dash-action" data-hf-dash-go="atletas">Abrir atletas</button></article>
<article class="hf-dash-card"><h2>Planificación</h2><p>Consultar y administrar planes de entrenamiento.</p><button class="hf-dash-action" data-hf-dash-go="planificacion">Abrir planificación</button></article>
<article class="hf-dash-card"><h2>Videoanálisis</h2><p>Técnica, trayectoria de barra y evaluación del levantamiento.</p><button class="hf-dash-action" data-hf-dash-go="video">Abrir videoanálisis</button></article>
<article class="hf-dash-card"><h2>Biblioteca</h2><p>Ejercicios y recursos técnicos.</p><button class="hf-dash-action" data-hf-dash-go="biblioteca">Abrir biblioteca</button></article>
</div>
<div class="hf-dash-notice">Los indicadores se calculan desde elementos visibles de la aplicación. No se muestran métricas ficticias. Los accesos intentan abrir las secciones existentes de HF Coach.</div>
</section></div>
<script id="HF_REAL_DASHBOARD_JS">
(()=> {
 const overlay=document.getElementById('hfDashboardOverlay');
 const launch=document.getElementById('hfDashboardLauncher');
 const close=document.getElementById('hfDashboardClose');
 if(!overlay||!launch||!close)return;
 const open=()=>{refresh();overlay.classList.add('open');document.body.style.overflow='hidden'};
 const shut=()=>{overlay.classList.remove('open');document.body.style.overflow=''};
 function refresh(){
   const roster=document.querySelector('#athletesList');
   const count=roster?Array.from(roster.children).filter(el=>el.textContent.trim()).length:0;
   const value=document.getElementById('hfDashAthleteCount');
   if(value)value.textContent=roster?String(count):'No disponible';
 }
 function findTab(kind){
   const patterns={
     atletas:/atletas|athletes/i,
     planificacion:/planificaci[oó]n|planning|planes/i,
     video:/videoan[aá]lisis|an[aá]lisis|video analysis/i,
     biblioteca:/biblioteca|library|ejercicios/i
   };
   const p=patterns[kind];
   if(!p)return null;
   const candidates=[...document.querySelectorAll('button,[role="tab"],[data-tab],a')];
   return candidates.find(el=>el!==launch&&!overlay.contains(el)&&p.test((el.textContent||el.getAttribute('aria-label')||'').trim()));
 }
 launch.addEventListener('click',open);close.addEventListener('click',shut);
 overlay.addEventListener('click',e=>{if(e.target===overlay)shut()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))shut()});
 overlay.querySelectorAll('[data-hf-dash-go]').forEach(btn=>btn.addEventListener('click',()=>{
   const tab=findTab(btn.dataset.hfDashGo);
   if(tab){tab.click();shut()}else{
     const msg='No se encontró el acceso existente a esta sección. Se mantiene el dashboard abierto.';
     let notice=overlay.querySelector('.hf-dash-notice');notice.textContent=msg;
   }
 }));
})();
</script>`;
html = html.replace('</body>', markup + '\n</body>');
fs.writeFileSync(target, html, 'utf8');
console.log('HF functional dashboard launcher, live athlete count, and section shortcuts injected.');
