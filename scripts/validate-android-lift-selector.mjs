import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/validate-android-lift-selector.mjs <html-file>");
const html = fs.readFileSync(file, "utf8");
const expected = [
  ["Snatch", "Arranque (Snatch)"],
  ["Clean", "Cargada (Clean)"],
  ["Split Jerk", "Envión — Split Jerk"],
  ["Push Jerk", "Envión — Push Jerk"],
  ["Clean & Jerk", "Cargada + Envión — Clean & Jerk"],
];
const selectMatch = html.match(/<select\b[^>]*\bid=["']lift["'][^>]*>([\s\S]*?)<\/select>/i);
if (!selectMatch) throw new Error("No se encontró <select id=\"lift\">.");
const options = [...selectMatch[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(([whole, attrs, label]) => {
  const value = attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1];
  const cleanLabel = label.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
  if (value == null) throw new Error("Opción sin atributo value: " + whole);
  return [value, cleanLabel];
});
if (options.length !== expected.length) {
  throw new Error(`Selector #lift: se esperaban ${expected.length} opciones y hay ${options.length}. ${JSON.stringify(options)}`);
}
for (let i=0;i<expected.length;i++) {
  if (options[i][0] !== expected[i][0] || options[i][1] !== expected[i][1]) {
    throw new Error(`Selector #lift incorrecto en posición ${i+1}. Esperado ${JSON.stringify(expected[i])}; recibido ${JSON.stringify(options[i])}`);
  }
}
console.log("PASS: #lift contiene exactamente las 5 opciones requeridas, en orden, con values y labels exactos: " + file);
