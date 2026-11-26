import fs from "node:fs";

const file = process.argv[2] || "app-source/src/index.html";
let html = fs.readFileSync(file, "utf8");
const run = process.env.GITHUB_RUN_NUMBER || "local";
const sha = (process.env.GITHUB_SHA || "local").slice(0, 7);
const version = process.env.HF_APP_VERSION || (run === "local" ? "local" : "1.0." + run);
const marker = "HF_BUILD_IDENTITY";
const block = `<style id="HF_BUILD_IDENTITY_STYLE">#hfBuildIdentity{position:fixed;z-index:9997;left:6px;bottom:5px;padding:4px 7px;border-radius:6px;background:rgba(20,25,30,.78);color:#fff;font:10px/1.35 system-ui,sans-serif;letter-spacing:.02em;max-width:75vw;pointer-events:none;opacity:.72}#hfBuildIdentity span{display:block}</style><div id="hfBuildIdentity" aria-label="Identificación de build"><span>HF Coach · ${version} · build ${run}</span><span>commit ${sha}</span></div>`;
if (!html.includes(marker)) {
  if (!html.includes("</body>")) throw new Error("No se encontró </body> para insertar identidad de build.");
  html = html.replace("</body>", block.replace('id="HF_BUILD_IDENTITY_STYLE"', 'id="HF_BUILD_IDENTITY_STYLE"') + "\n</body>");
  html = html.replace('<div id="hfBuildIdentity"', '<div id="hfBuildIdentity" data-marker="HF_BUILD_IDENTITY"');
}
if (!html.includes("HF_BUILD_IDENTITY") || !html.includes("commit " + sha)) throw new Error("No quedó insertada la identificación de build.");
fs.writeFileSync(file, html, "utf8");
console.log(`Build identity inserted: ${version}, run ${run}, commit ${sha}`);
