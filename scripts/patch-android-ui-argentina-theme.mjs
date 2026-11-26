import fs from 'node:fs';

const file='app-source/src/index.html';
let html=fs.readFileSync(file,'utf8');
const css=`
:root{
 --hf-arg-celeste:#74ACDF; --hf-arg-white:#FFFFFF; --hf-arg-sun:#FFD21F;
 --hf-accent:var(--hf-arg-celeste); --hf-accent-foreground:#10283B;
 --hf-accent-soft:color-mix(in srgb,var(--hf-accent) 17%,white);
 --hf-focus-ring:color-mix(in srgb,var(--hf-accent) 62%,white);
 --hf-background:#F4F7FA; --hf-surface:#FFFFFF; --hf-surface-raised:#FFFFFF;
 --hf-text:#17212B; --hf-text-muted:#5C6B78; --hf-border:#D7E1E9;
 --hf-gold:var(--hf-arg-sun); --hf-radius:16px;
}
html[data-hf-theme="dark"]{
 --hf-background:#101820; --hf-surface:#19242D; --hf-surface-raised:#202E39;
 --hf-text:#F3F7FA; --hf-text-muted:#B2C0CA; --hf-border:#354653;
}
*{box-sizing:border-box}
body{background:var(--hf-background)!important;color:var(--hf-text)!important}
body,button,input,select,textarea{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
h1,h2,h3{letter-spacing:-.025em;line-height:1.14}
h1{font-size:clamp(1.55rem,5vw,2.2rem)!important;margin:.35em 0 .6em!important}
button,.btn{border-radius:12px!important;min-height:44px;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease}
button:active,.btn:active{transform:scale(.985)}
button:not([disabled]),.btn{cursor:pointer}
button:not(.secondary):not(.ghost):not(.outline),#go,.primary{background:var(--hf-accent)!important;color:var(--hf-accent-foreground)!important;border-color:var(--hf-accent)!important}
button.secondary,.secondary,.ghost,.outline{background:var(--hf-surface)!important;color:var(--hf-text)!important;border:1px solid var(--hf-border)!important}
input,select,textarea{background:var(--hf-surface)!important;color:var(--hf-text)!important;border:1px solid var(--hf-border)!important;border-radius:12px!important;min-height:44px;padding:.65rem .8rem!important}
:focus-visible{outline:3px solid var(--hf-focus-ring)!important;outline-offset:2px}
.card,.panel,.box,fieldset,.section{border-radius:var(--hf-radius)!important;background:var(--hf-surface)!important;border-color:var(--hf-border)!important}
a{color:var(--hf-accent)!important}
[data-tab],nav button,.tabs button{border-radius:12px!important}
[data-tab].active,.tabs .active{background:var(--hf-accent-soft)!important;border-color:var(--hf-accent)!important;color:var(--hf-text)!important}
#hfAppearanceTrigger{position:relative;z-index:20;border:1px solid var(--hf-border)!important;background:var(--hf-surface)!important;color:var(--hf-text)!important;padding:.55rem .8rem!important;display:inline-flex;align-items:center;gap:.45rem;font-weight:650}
#hfAppearanceOverlay{position:fixed;inset:0;z-index:99999;background:rgba(10,20,30,.48);display:none;align-items:center;justify-content:center;padding:18px}
#hfAppearanceOverlay.open{display:flex}
#hfAppearanceDialog{width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--hf-surface);color:var(--hf-text);border:1px solid var(--hf-border);border-radius:22px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.24)}
#hfAppearanceDialog h2{margin:0 0 6px;font-size:1.35rem}
#hfAppearanceDialog p{color:var(--hf-text-muted);margin:0 0 16px}
.hf-theme-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.hf-theme-choice{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;padding:12px 8px!important;border:1px solid var(--hf-border)!important;background:var(--hf-surface)!important;color:var(--hf-text)!important}
.hf-theme-choice[aria-pressed=true]{border:2px solid var(--hf-accent)!important;box-shadow:0 0 0 2px var(--hf-accent-soft)}
.hf-swatch{width:34px;height:34px;border-radius:50%;border:2px solid rgba(0,0,0,.12)}
#hfCustomColor{width:100%;height:48px;padding:4px!important}
.hf-dialog-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:600px){body{padding-left:0!important;padding-right:0!important}.hf-theme-grid{grid-template-columns:repeat(2,1fr)}#hfAppearanceDialog{padding:17px}}
`;
const js=`
(()=>{const KEY='hfcoach-theme-accent-v1';const presets=[{name:'Argentina',color:'#74ACDF'},{name:'Celeste claro',color:'#A8D8F0'},{name:'Azul profundo',color:'#2364AA'},{name:'Verde',color:'#2E9D74'},{name:'Violeta',color:'#8056C7'},{name:'Coral',color:'#E66D5B'}];
function validHex(v){return /^#[0-9a-f]{6}$/i.test(v)}
function contrast(hex){const rgb=hex.slice(1).match(/.{2}/g).map(x=>parseInt(x,16));const lum=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});const L=.2126*lum[0]+.7152*lum[1]+.0722*lum[2];return L>.55?'#15212B':'#FFFFFF'}
function apply(color){if(!validHex(color))return;document.documentElement.style.setProperty('--hf-accent',color);document.documentElement.style.setProperty('--hf-accent-foreground',contrast(color));document.documentElement.style.setProperty('--hf-accent-soft',color+'26');document.documentElement.style.setProperty('--hf-focus-ring',color);localStorage.setItem(KEY,color);const custom=document.getElementById('hfCustomColor');if(custom)custom.value=color}
const saved=localStorage.getItem(KEY);apply(validHex(saved||'')?saved:'#74ACDF');
function addTrigger(){if(document.getElementById('hfAppearanceTrigger'))return;const candidates=[...document.querySelectorAll('button,a,[role=button]')].filter(el=>/mi cuenta|cuenta/i.test(el.textContent||''));const target=candidates[0];const btn=document.createElement('button');btn.id='hfAppearanceTrigger';btn.type='button';btn.textContent='🎨 Apariencia';btn.addEventListener('click',open);if(target&&target.parentElement){target.insertAdjacentElement('afterend',btn)}else{btn.style.position='fixed';btn.style.right='12px';btn.style.bottom='calc(16px + env(safe-area-inset-bottom))';btn.style.zIndex='1000';document.body.appendChild(btn)}}
function build(){if(document.getElementById('hfAppearanceOverlay'))return;const overlay=document.createElement('div');overlay.id='hfAppearanceOverlay';overlay.innerHTML='<section id="hfAppearanceDialog" role="dialog" aria-modal="true" aria-labelledby="hfAppearanceTitle"><h2 id="hfAppearanceTitle">Apariencia y colores</h2><p>Personalizá el color de HF Coach. El tema Argentina es el predeterminado.</p><div class="hf-theme-grid" id="hfThemeGrid"></div><label for="hfCustomColor" style="display:block;margin-top:16px;font-weight:600">Color personalizado</label><input id="hfCustomColor" type="color" value="#74ACDF"><div class="hf-dialog-actions"><button type="button" id="hfThemeReset" class="secondary">Restablecer Argentina</button><button type="button" id="hfThemeClose" class="primary">Cerrar</button></div></section>';document.body.appendChild(overlay);const grid=overlay.querySelector('#hfThemeGrid');presets.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='hf-theme-choice';b.setAttribute('aria-pressed','false');b.innerHTML='<span class="hf-swatch" style="background:'+p.color+'"></span><span>'+p.name+'</span>';b.addEventListener('click',()=>{apply(p.color);updatePressed()});grid.appendChild(b)});overlay.querySelector('#hfCustomColor').addEventListener('input',e=>apply(e.target.value));overlay.querySelector('#hfThemeReset').addEventListener('click',()=>{apply('#74ACDF');updatePressed()});overlay.querySelector('#hfThemeClose').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});}
function updatePressed(){document.querySelectorAll('.hf-theme-choice').forEach(b=>b.setAttribute('aria-pressed',String(b.querySelector('span:last-child').textContent==='Argentina'&&localStorage.getItem(KEY)==='#74ACDF')))}
function open(){build();document.getElementById('hfAppearanceOverlay').classList.add('open');updatePressed()}
function close(){document.getElementById('hfAppearanceOverlay')?.classList.remove('open')}
addTrigger();new MutationObserver(addTrigger).observe(document.body,{childList:true,subtree:true});
})();
`;
if(!html.includes('HF_ARGENTINA_THEME_V1')){html=html.replace('</head>', '<style id="HF_ARGENTINA_THEME_V1">'+css+'</style></head>');html=html.replace('</body>','<script id="HF_ARGENTINA_THEME_JS">'+js+'</script></body>');}
fs.writeFileSync(file,html);
console.log('Argentina theme and appearance selector injected.');
