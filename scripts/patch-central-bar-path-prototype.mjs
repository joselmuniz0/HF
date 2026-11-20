import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve("prototypes/bar-path");
const targetDir = path.resolve(".hf-central/admin/labs/bar-path");
const htmlPath = path.resolve(".hf-central/admin/index.html");
const cssPath = path.resolve(".hf-central/admin/styles.css");

for (const name of ["index.html", "bar-path.css", "bar-path-core.mjs", "bar-path-app.mjs"]) {
  if (!fs.existsSync(path.join(sourceDir, name))) {
    throw new Error("Bar path prototype: falta el archivo " + name);
  }
}
fs.mkdirSync(targetDir, { recursive: true });
for (const name of ["index.html", "bar-path.css", "bar-path-core.mjs", "bar-path-app.mjs"]) {
  fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
}

let html = fs.readFileSync(htmlPath, "utf8");
const marker = '<div id="evaluations"></div>';
const link = [
  '<section class="hf-bar-path-launch">',
  '  <div><strong>Etapa 2 · Trayectoria de barra</strong><p>Laboratorio aislado para seguimiento cuadro por cuadro, corrección manual y exportación para Kinovea.</p></div>',
  '  <a class="primary" href="./labs/bar-path/">Abrir laboratorio</a>',
  '</section>',
  marker
].join("\n");
if (!html.includes('class="hf-bar-path-launch"')) {
  if (!html.includes(marker)) throw new Error("Bar path prototype: no se encontró el área de evaluaciones para insertar el acceso.");
  html = html.replace(marker, link);
  fs.writeFileSync(htmlPath, html, "utf8");
}

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(".hf-bar-path-launch{")) {
  css += [
    "",
    ".hf-bar-path-launch{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;margin:12px 0;border:1px solid #cbd9d4;border-radius:9px;background:#f2f7f4}",
    ".hf-bar-path-launch p{margin:5px 0 0;color:#60706a;font-size:13px}",
    ".hf-bar-path-launch a{display:inline-block;padding:10px 14px;border-radius:7px;background:#c9362d;color:#fff;text-decoration:none;font-weight:700;font-size:13px;white-space:nowrap}",
    "@media(max-width:640px){.hf-bar-path-launch{align-items:stretch;flex-direction:column}.hf-bar-path-launch a{text-align:center}}",
    ""
  ].join("\n");
  fs.writeFileSync(cssPath, css, "utf8");
}
console.log("HF Central: laboratorio aislado de trayectoria de barra copiado e integrado.");
