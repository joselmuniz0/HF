import {
  imageDataToGray, extractPatch, blendTemplate, trackNextFrame,
  deriveKinematics, detectCandidateEvents, summarizeTracking
} from "./bar-path-core.mjs";

const $ = id => document.getElementById(id);
const video = $("sourceVideo");
const frameCanvas = $("frameCanvas");
const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
const plotCanvas = $("trajectoryCanvas");
const plotContext = plotCanvas.getContext("2d");
const timeCanvas = $("timeCanvas");
const timeContext = timeCanvas.getContext("2d");

let objectUrl = null;
let file = null;
let width = 0, height = 0, displayScale = 1;
let seedPoint = null;
let calibrationClicks = [];
let calibration = null;
let samples = [];
let kinematics = [];
let candidates = [];
let events = [];
let selectedIndex = 0;
let canvasMode = "seed";
let trackTemplate = null;
let busy = false;
let renderSequence = 0;
let lastSummary = null;

const phaseLabels = {
  Snatch: [
    "Despegue / inicio", "Fin del primer tirón", "Inicio de transición",
    "Fin de transición", "Inicio del segundo tirón", "Máxima extensión",
    "Inicio de entrada / recambio", "Recepción", "Estabilización"
  ],
  Clean: [
    "Despegue / inicio", "Fin del primer tirón", "Inicio de transición",
    "Fin de transición", "Inicio del segundo tirón", "Máxima extensión",
    "Recepción en rack", "Recuperación de la cargada"
  ],
  Jerk: [
    "Inicio del dip", "Fin del dip / inicio del drive", "Fin del drive",
    "Entrada a split", "Recepción arriba", "Estabilización", "Recuperación"
  ]
};

function setStatus(message, kind = "") {
  const node = $("status");
  node.textContent = message;
  node.className = "status" + (kind ? " " + kind : "");
}
function setBusy(value) {
  busy = value;
  ["loadVideo", "startTracking", "exportCsv", "exportJson", "addEvent", "resetLab"].forEach(id => {
    $(id).disabled = value;
  });
  if (!value) {
    $("exportCsv").disabled = !samples.length;
    $("exportJson").disabled = !samples.length;
  }
}
function setMode(mode) {
  canvasMode = mode;
  $("canvasMode").value = mode;
  $("canvasModeHint").textContent = {
    seed: "Hacé clic en el centro del disco visible de la barra en el fotograma inicial.",
    calibrate: calibrationClicks.length === 0
      ? "Marcá el primer extremo del diámetro visible del disco."
      : "Marcá el extremo opuesto del diámetro del disco.",
    correct: "Elegí el centro visible del disco en el fotograma actual. Se recalculará el seguimiento hacia adelante."
  }[mode];
}
function clearResults() {
  samples = [];
  kinematics = [];
  candidates = [];
  events = [];
  selectedIndex = 0;
  trackTemplate = null;
  $("frameSlider").disabled = true;
  $("exportCsv").disabled = true;
  $("exportJson").disabled = true;
  $("frameSlider").value = 0;
  $("frameSlider").max = 0;
  $("frameReadout").textContent = "Sin análisis";
  $("metrics").innerHTML = "";
  $("candidateList").replaceChildren();
  $("eventList").replaceChildren();
  $("trajectoryLegend").textContent = "La trayectoria aparecerá después del seguimiento.";
  drawPlots();
}
function seekVideo(time) {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(time)) return reject(new Error("Tiempo de cuadro no válido."));
    if (Math.abs(video.currentTime - time) < 0.0005 && video.readyState >= 2) {
      requestAnimationFrame(() => resolve(video.currentTime));
      return;
    }
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      value instanceof Error ? reject(value) : resolve(video.currentTime);
    };
    const onSeeked = () => finish(video.currentTime);
    const onError = () => finish(new Error("El navegador no pudo decodificar ese fotograma."));
    const timer = setTimeout(() => finish(new Error("Tiempo de espera agotado al decodificar un fotograma.")), 7000);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try { video.currentTime = Math.max(0, Math.min(time, video.duration)); }
    catch (error) { finish(error); }
  });
}
function drawVideoToCanvas() {
  frameContext.drawImage(video, 0, 0, width, height);
}
function getGrayFromCurrentFrame() {
  drawVideoToCanvas();
  return imageDataToGray(frameContext.getImageData(0, 0, width, height));
}
function canvasPoint(event) {
  const rect = frameCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (frameCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (frameCanvas.height / rect.height)
  };
}
function drawPath(ctx, w, h, rows, currentIndex = -1) {
  const valid = [];
  ctx.lineWidth = Math.max(2, w / 500);
  ctx.strokeStyle = "#d13b31";
  ctx.beginPath();
  let open = false;
  rows.forEach((row, i) => {
    if (row.x == null || row.y == null) { open = false; return; }
    if (!open) { ctx.moveTo(row.x, row.y); open = true; }
    else ctx.lineTo(row.x, row.y);
    valid.push(row);
  });
  ctx.stroke();
  if (currentIndex >= 0 && rows[currentIndex] && rows[currentIndex].x != null) {
    const p = rows[currentIndex];
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(5, w / 100), 0, Math.PI * 2);
    ctx.fillStyle = "#f2b544";
    ctx.fill();
    ctx.strokeStyle = "#20272b";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return valid.length;
}
function drawFrameOverlay() {
  drawVideoToCanvas();
  const ctx = frameContext;
  if (samples.length) {
    const valid = samples.map(s => ({ x: s.x, y: s.y }));
    drawPath(ctx, width, height, valid, selectedIndex);
    const lost = samples[selectedIndex] && samples[selectedIndex].x == null;
    if (lost) {
      ctx.fillStyle = "#b3261e";
      ctx.fillRect(8, 8, Math.min(width - 16, 250), 32);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("SEGUIMIENTO PERDIDO — corregir", 16, 29);
    }
  } else if (seedPoint) {
    ctx.beginPath();
    ctx.arc(seedPoint.x, seedPoint.y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#f2b544";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  if (calibrationClicks.length) {
    ctx.fillStyle = "#147d64";
    calibrationClicks.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    });
  }
  if (calibration && calibration.points) {
    ctx.strokeStyle = "#147d64";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(calibration.points[0].x, calibration.points[0].y);
    ctx.lineTo(calibration.points[1].x, calibration.points[1].y);
    ctx.stroke();
  }
}
function drawTrajectoryPlot() {
  const ctx = plotContext, w = plotCanvas.width, h = plotCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#e5e9e7"; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const x = i * w / 5, y = i * h / 5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const valid = kinematics.filter(p => p.xDisplacement != null && p.yDisplacement != null);
  if (valid.length < 2) {
    ctx.fillStyle = "#6b7479"; ctx.font = "15px sans-serif";
    ctx.fillText("Sin puntos válidos para graficar", 24, 34);
    return;
  }
  const xs = valid.map(p => p.xDisplacement), ys = valid.map(p => p.yDisplacement);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (Math.abs(maxX - minX) < 1e-8) { minX -= 0.5; maxX += 0.5; }
  if (Math.abs(maxY - minY) < 1e-8) { minY -= 0.5; maxY += 0.5; }
  const pad = 28;
  const px = x => pad + (x - minX) / (maxX - minX) * (w - pad * 2);
  const py = y => h - pad - (y - minY) / (maxY - minY) * (h - pad * 2);
  ctx.strokeStyle = "#d13b31"; ctx.lineWidth = 3; ctx.beginPath();
  let opened = false;
  kinematics.forEach(p => {
    if (p.xDisplacement == null || p.yDisplacement == null) { opened = false; return; }
    if (!opened) { ctx.moveTo(px(p.xDisplacement), py(p.yDisplacement)); opened = true; }
    else ctx.lineTo(px(p.xDisplacement), py(p.yDisplacement));
  });
  ctx.stroke();
  const start = valid[0], end = valid[valid.length - 1];
  ctx.fillStyle = "#147d64"; ctx.beginPath(); ctx.arc(px(start.xDisplacement), py(start.yDisplacement), 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#20272b"; ctx.beginPath(); ctx.arc(px(end.xDisplacement), py(end.yDisplacement), 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#465159"; ctx.font = "12px sans-serif";
  ctx.fillText(calibration ? "x (m)" : "x (px relativos)", pad, h - 7);
  ctx.save(); ctx.translate(12, h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(calibration ? "y (m, positivo hacia arriba)" : "y (px, positivo hacia arriba)", 0, 0);
  ctx.restore();
}
function drawTimePlot() {
  const ctx = timeContext, w = timeCanvas.width, h = timeCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#e5e9e7";
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(i * w / 5, 0); ctx.lineTo(i * w / 5, h); ctx.stroke();
  }
  const valid = kinematics.filter(p => p.yDisplacement != null);
  if (valid.length < 2) {
    ctx.fillStyle = "#6b7479"; ctx.font = "15px sans-serif"; ctx.fillText("Sin datos temporales", 20, 30); return;
  }
  const maxT = Math.max(...valid.map(p => p.time));
  const minY = Math.min(...valid.map(p => p.yDisplacement));
  const maxY = Math.max(...valid.map(p => p.yDisplacement));
  const range = maxY - minY || 1;
  const x = t => 24 + t / (maxT || 1) * (w - 48);
  const y = v => h - 24 - (v - minY) / range * (h - 48);
  ctx.strokeStyle = "#275f84"; ctx.lineWidth = 2.5; ctx.beginPath();
  let opened = false;
  kinematics.forEach(p => {
    if (p.yDisplacement == null) { opened = false; return; }
    if (!opened) { ctx.moveTo(x(p.time), y(p.yDisplacement)); opened = true; }
    else ctx.lineTo(x(p.time), y(p.yDisplacement));
  });
  ctx.stroke();
  if (kinematics[selectedIndex]?.yDisplacement != null) {
    const p = kinematics[selectedIndex];
    ctx.fillStyle = "#f2b544"; ctx.beginPath(); ctx.arc(x(p.time), y(p.yDisplacement), 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#465159"; ctx.font = "12px sans-serif";
  ctx.fillText(calibration ? "Altura relativa (m)" : "Altura relativa (px)", 24, 16);
  ctx.fillText("Tiempo (s)", w - 88, h - 6);
}
function drawPlots() {
  drawTrajectoryPlot();
  drawTimePlot();
}
function format(value, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : Number(value).toFixed(digits);
}
function renderMetrics() {
  if (!samples.length) { $("metrics").innerHTML = ""; drawPlots(); return; }
  const s = lastSummary || summarizeTracking(samples, kinematics);
  const unit = calibration ? "m/s" : "px/s";
  const accelUnit = calibration ? "m/s²" : "px/s²";
  const metricRows = [
    ["Seguimiento válido", (s.trackingRate * 100).toFixed(1) + "%", s.trackedFrames + " / " + s.totalFrames + " cuadros"],
    ["Correlación mediana", format(s.medianCorrelation, 3), "No es una probabilidad"],
    ["Desplazamiento horizontal", format(Math.max(0, ...kinematics.map(p => Math.abs(p.xDisplacement ?? 0)))) + (calibration ? " m" : " px"), "Respecto del inicio"],
    ["Altura máxima", format(Math.max(0, ...kinematics.map(p => p.yDisplacement ?? 0))) + (calibration ? " m" : " px"), "Respecto de la barra al inicio"],
    ["Velocidad ascendente máxima", format(s.maxUpwardVelocity) + " " + unit, "Derivada de posición y tiempo"],
    ["Aceleración máxima estimada", format(s.maxAcceleration) + " " + accelUnit, "Segunda derivada; sensible al ruido"]
  ];
  $("metrics").innerHTML = metricRows.map(row =>
    '<article class="metric"><b>' + row[1] + '</b><span>' + row[0] + '</span><small>' + row[2] + '</small></article>'
  ).join("");
  drawPlots();
}
function renderCandidates() {
  const root = $("candidateList");
  root.replaceChildren();
  if (!candidates.length) {
    root.innerHTML = '<p class="muted">No se identificaron candidatos suficientes. Podés marcar eventos manualmente.</p>';
    return;
  }
  candidates.forEach(event => {
    const row = document.createElement("div");
    row.className = "event-row";
    const text = document.createElement("span");
    text.textContent = event.time.toFixed(3) + " s · " + event.label;
    const button = document.createElement("button");
    button.type = "button"; button.className = "secondary"; button.textContent = "Revisar y agregar";
    button.addEventListener("click", () => {
      selectedIndex = event.frameIndex;
      $("frameSlider").value = selectedIndex;
      renderFrameAtIndex(selectedIndex);
      addEvent(event.label, "candidate_reviewed");
    });
    row.append(text, button);
    root.appendChild(row);
  });
}
function renderEvents() {
  const root = $("eventList");
  root.replaceChildren();
  if (!events.length) {
    root.innerHTML = '<p class="muted">Todavía no hay límites de fase confirmados por el coach.</p>';
    return;
  }
  [...events].sort((a, b) => a.frameIndex - b.frameIndex).forEach((event, index) => {
    const row = document.createElement("div");
    row.className = "event-row";
    const text = document.createElement("span");
    text.textContent = event.time.toFixed(3) + " s · " + event.label + (event.source === "candidate_reviewed" ? " · candidato revisado" : " · coach");
    const controls = document.createElement("div");
    const go = document.createElement("button");
    go.type = "button"; go.className = "secondary"; go.textContent = "Ir";
    go.addEventListener("click", () => {
      selectedIndex = event.frameIndex;
      $("frameSlider").value = selectedIndex;
      renderFrameAtIndex(selectedIndex);
    });
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "quiet"; remove.textContent = "Quitar";
    remove.addEventListener("click", () => { events.splice(events.indexOf(event), 1); renderEvents(); });
    controls.append(go, remove);
    row.append(text, controls);
    root.appendChild(row);
  });
}
function addEvent(label = $("eventLabel").value, source = "coach") {
  if (!samples.length || selectedIndex < 0 || selectedIndex >= samples.length) return;
  const point = samples[selectedIndex];
  if (point.x == null || point.y == null) {
    setStatus("No se puede confirmar un evento en un cuadro sin seguimiento. Corregí el punto o elegí otro cuadro.", "error");
    return;
  }
  if (events.some(e => e.frameIndex === selectedIndex && e.label === label)) {
    setStatus("Ese evento ya está marcado en este cuadro.", "error");
    return;
  }
  events.push({ frameIndex: selectedIndex, time: point.time, label, source, kind: "phase_boundary" });
  renderEvents();
  setStatus("Evento agregado. La marca queda editable y requiere validación del coach.", "success");
}
function updatePhaseLabels() {
  const select = $("eventLabel");
  const current = select.value;
  const labels = phaseLabels[$("liftType").value] || phaseLabels.Snatch;
  select.replaceChildren(...labels.map(label => {
    const option = document.createElement("option"); option.value = label; option.textContent = label; return option;
  }));
  if (labels.includes(current)) select.value = current;
}
async function renderFrameAtIndex(index) {
  if (!samples.length) return;
  selectedIndex = Math.max(0, Math.min(samples.length - 1, Number(index)));
  $("frameSlider").value = selectedIndex;
  $("frameReadout").textContent =
    "Cuadro " + (selectedIndex + 1) + " / " + samples.length +
    " · " + samples[selectedIndex].time.toFixed(3) + " s · " +
    (samples[selectedIndex].x == null ? "sin seguimiento" : samples[selectedIndex].source);
  const sequence = ++renderSequence;
  try {
    await seekVideo(samples[selectedIndex].time);
    if (sequence !== renderSequence) return;
    drawFrameOverlay();
    drawPlots();
  } catch (error) {
    setStatus("No se pudo mostrar el cuadro: " + error.message, "error");
  }
}
async function captureAt(time) {
  await seekVideo(time);
  const gray = getGrayFromCurrentFrame();
  return { gray, actualTime: video.currentTime };
}
function recalc() {
  kinematics = deriveKinematics(samples, calibration);
  candidates = detectCandidateEvents(kinematics, $("liftType").value);
  lastSummary = summarizeTracking(samples, kinematics);
  $("frameSlider").disabled = false;
  $("frameSlider").max = Math.max(0, samples.length - 1);
  renderMetrics();
  renderCandidates();
  renderEvents();
}
async function loadLocalVideo() {
  const chosen = $("videoFile").files?.[0];
  if (!chosen) throw new Error("Seleccioná un video desde este dispositivo.");
  if (!/^video\/(mp4|quicktime|webm|x-m4v)$/i.test(chosen.type) && !/\.(mp4|mov|webm|m4v)$/i.test(chosen.name)) {
    throw new Error("Formato no compatible. Usá MP4 (H.264), MOV o WEBM.");
  }
  if (chosen.size > 250 * 1024 * 1024) throw new Error("El archivo supera 250 MB.");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(chosen);
  file = chosen;
  video.src = objectUrl;
  video.load();
  await new Promise((resolve, reject) => {
    if (video.readyState >= 1 && video.videoWidth) return resolve();
    const timer = setTimeout(() => reject(new Error("No se pudieron leer los metadatos del video.")), 12000);
    video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("El navegador no puede decodificar el archivo. Probá con MP4 H.264.")); }, { once: true });
  });
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("La duración del video no es válida.");
  if (video.duration > 20) throw new Error("Para el prototipo, recortá el video a un intento de hasta 20 segundos.");
  const targetWidth = Math.min(960, video.videoWidth);
  displayScale = targetWidth / video.videoWidth;
  width = Math.max(1, Math.round(video.videoWidth * displayScale));
  height = Math.max(1, Math.round(video.videoHeight * displayScale));
  frameCanvas.width = width; frameCanvas.height = height;
  clearResults();
  seedPoint = null; calibration = null; calibrationClicks = []; trackTemplate = null;
  $("videoInfo").textContent = chosen.name + " · " + video.videoWidth + "×" + video.videoHeight +
    " · " + video.duration.toFixed(2) + " s · frecuencia original no determinada por el navegador";
  $("canvasHelp").hidden = false;
  await seekVideo(0);
  drawVideoToCanvas();
  setMode("seed");
  setStatus("Video cargado localmente. Marcá el centro del disco de la barra en el primer cuadro.", "success");
}
async function runTracking() {
  if (!file || !seedPoint) throw new Error("Cargá un video y marcá primero el centro del disco de la barra.");
  const fps = Number($("sampleFps").value);
  const count = Math.floor(video.duration * fps) + 1;
  if (count > 1200) throw new Error("La muestra supera 1.200 cuadros. Reducí la frecuencia o recortá el video.");
  samples = [];
  kinematics = [];
  candidates = [];
  events = [];
  lastSummary = null;
  selectedIndex = 0;
  $("metrics").innerHTML = "";
  $("candidateList").replaceChildren();
  $("eventList").replaceChildren();
  await seekVideo(0);
  const initialGray = getGrayFromCurrentFrame();
  let template = extractPatch(initialGray, width, height, seedPoint.x, seedPoint.y, 9);
  if (!template) throw new Error("El punto elegido está demasiado cerca del borde. Marcá el centro del disco más hacia adentro.");
  trackTemplate = template;
  let previous = null, previousPrevious = null;
  setBusy(true);
  $("progress").hidden = false; $("progress").value = 0;
  try {
    for (let i = 0; i < count; i++) {
      const targetTime = Math.min(video.duration, i / fps);
      const captured = await captureAt(targetTime);
      const sampleTime = captured.actualTime;
      if (i === 0) {
        samples.push({ frameIndex: i, time: sampleTime, x: seedPoint.x, y: seedPoint.y, score: 1, status: "manual_anchor", source: "manual" });
      } else {
        const result = trackNextFrame({
          gray: captured.gray, width, height, template,
          previous: previous ? { ...previous, nextTime: sampleTime } : null,
          previousPrevious,
          searchRadius: Number($("searchRadius").value),
          minCorrelation: Number($("minCorrelation").value)
        });
        samples.push({ frameIndex: i, time: sampleTime, ...result });
        if (result.status === "tracked" && result.score > 0.82 && i % 10 === 0) {
          const patch = extractPatch(captured.gray, width, height, result.x, result.y, template.radius);
          template = blendTemplate(template, patch, 0.025);
        }
      }
      previousPrevious = previous;
      previous = samples[samples.length - 1];
      $("progress").value = (i + 1) / count;
      if (i % 10 === 0) setStatus("Siguiendo la barra: " + (i + 1) + " / " + count + " cuadros…");
    }
    trackTemplate = template;
    recalc();
    selectedIndex = 0;
    $("frameSlider").value = 0;
    await renderFrameAtIndex(0);
    setMode("correct");
    const rate = lastSummary.trackingRate * 100;
    setStatus("Seguimiento terminado: " + rate.toFixed(1) + "% de cuadros válidos. Revisá las pérdidas y corregí manualmente antes de exportar.", rate >= 90 ? "success" : "warning");
  } finally {
    $("progress").hidden = true;
    setBusy(false);
  }
}
async function correctFromCurrentFrame(point) {
  if (!samples.length) throw new Error("Primero ejecutá el seguimiento inicial.");
  const currentGray = getGrayFromCurrentFrame();
  const patch = extractPatch(currentGray, width, height, point.x, point.y, 9);
  if (!patch) throw new Error("El punto está demasiado cerca del borde del cuadro.");
  const anchor = { ...samples[selectedIndex], x: point.x, y: point.y, score: 1, status: "manual_anchor", source: "manual" };
  samples[selectedIndex] = anchor;
  let template = patch;
  let previous = anchor;
  let previousPrevious = selectedIndex > 0 ? samples[selectedIndex - 1] : null;
  const end = samples.length;
  setBusy(true);
  $("progress").hidden = false;
  try {
    for (let i = selectedIndex + 1; i < end; i++) {
      const captured = await captureAt(samples[i].time);
      const result = trackNextFrame({
        gray: captured.gray, width, height, template,
        previous: { ...previous, nextTime: samples[i].time },
        previousPrevious,
        searchRadius: Number($("searchRadius").value),
        minCorrelation: Number($("minCorrelation").value)
      });
      samples[i] = { ...samples[i], ...result, source: result.status === "tracked" ? "auto_after_manual" : "none" };
      previousPrevious = previous;
      previous = samples[i];
      if (result.status === "tracked" && result.score > 0.82 && i % 10 === 0) {
        const nextPatch = extractPatch(captured.gray, width, height, result.x, result.y, template.radius);
        template = blendTemplate(template, nextPatch, 0.02);
      }
      $("progress").value = (i - selectedIndex) / Math.max(1, end - selectedIndex - 1);
    }
    trackTemplate = template;
    recalc();
    await renderFrameAtIndex(selectedIndex);
    setStatus("Corrección manual aplicada desde " + samples[selectedIndex].time.toFixed(3) + " s. El seguimiento posterior se recalculó.", "success");
  } finally {
    $("progress").hidden = true;
    setBusy(false);
  }
}
function handleCanvasClick(event) {
  if (busy || !file) return;
  const point = canvasPoint(event);
  if (canvasMode === "seed") {
    if (samples.length) { setStatus("Ya hay una trayectoria. Usá Corrección manual para ajustar un cuadro.", "warning"); return; }
    seedPoint = point;
    setStatus("Punto inicial marcado. Calibrá el diámetro del disco (opcional) o iniciá el seguimiento.", "success");
    drawFrameOverlay();
    return;
  }
  if (canvasMode === "calibrate") {
    calibrationClicks.push(point);
    if (calibrationClicks.length === 1) {
      $("canvasModeHint").textContent = "Marcá ahora el extremo opuesto del diámetro del disco.";
    }
    if (calibrationClicks.length === 2) {
      const distance = Math.hypot(calibrationClicks[1].x - calibrationClicks[0].x, calibrationClicks[1].y - calibrationClicks[0].y);
      const meters = Number($("referenceLength").value);
      if (!(distance > 3) || !(meters > 0)) {
        calibrationClicks = [];
        setStatus("La referencia no es válida. Marcá dos puntos separados y una longitud mayor que cero.", "error");
        return;
      }
      calibration = { metersPerPixel: meters / distance, referenceLengthMeters: meters, measuredPixels: distance, points: calibrationClicks.map(p => ({ ...p })) };
      calibrationClicks = [];
      if (samples.length) recalc();
      setStatus("Calibración aplicada: " + format(calibration.metersPerPixel * 1000, 3) + " mm por píxel de análisis.", "success");
    }
    drawFrameOverlay();
    return;
  }
  if (canvasMode === "correct") {
    if (!samples.length) { setStatus("Primero ejecutá el seguimiento inicial.", "warning"); return; }
    correctFromCurrentFrame(point).catch(error => setStatus("No se pudo corregir: " + error.message, "error"));
  }
}
function toCsv(value) {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Number(value).toFixed(6));
}
function exportCsv() {
  const rows = [
    ["frame_index", "time_seconds", "x_source_px", "y_source_px", "x_analysis_px", "y_analysis_px",
      "x_displacement", "y_displacement_up", "velocity_x", "velocity_y_up", "speed",
      "acceleration_x", "acceleration_y_up", "acceleration", "correlation", "tracking_status", "point_source"]
  ];
  kinematics.forEach(p => rows.push([
    p.frameIndex, toCsv(p.time), p.x == null ? "" : toCsv(p.x / displayScale),
    p.y == null ? "" : toCsv(p.y / displayScale), toCsv(p.x), toCsv(p.y),
    toCsv(p.xDisplacement), toCsv(p.yDisplacement), toCsv(p.velocityX), toCsv(p.velocityY),
    toCsv(p.speed), toCsv(p.accelerationX), toCsv(p.accelerationY), toCsv(p.acceleration),
    toCsv(p.score), p.status, p.source
  ]));
  const csv = rows.map(row => row.map(cell => {
    const s = cell == null ? "" : String(cell);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\r\n");
  download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "hf-bar-path-series.csv");
}
function exportJson() {
  const payload = {
    schema: "hf-bar-path-prototype/1.0",
    created_at: new Date().toISOString(),
    source_file_name: file?.name || null,
    lift: $("liftType").value,
    video: {
      duration_seconds: video.duration,
      source_width: video.videoWidth,
      source_height: video.videoHeight,
      analysis_width: width,
      analysis_height: height,
      analysis_scale: displayScale,
      requested_sample_fps: Number($("sampleFps").value),
      source_fps: null,
      note: "El navegador no expone una frecuencia de cuadros de origen fiable en todos los formatos."
    },
    calibration,
    tracking_settings: {
      search_radius_px: Number($("searchRadius").value),
      minimum_correlation: Number($("minCorrelation").value),
      template_radius_px: trackTemplate?.radius ?? 9
    },
    samples: kinematics.map(p => ({
      frame_index: p.frameIndex,
      time_seconds: p.time,
      x_source_px: p.x == null ? null : p.x / displayScale,
      y_source_px: p.y == null ? null : p.y / displayScale,
      x_analysis_px: p.x,
      y_analysis_px: p.y,
      x_displacement: p.xDisplacement,
      y_displacement_up: p.yDisplacement,
      velocity_x: p.velocityX,
      velocity_y_up: p.velocityY,
      speed: p.speed,
      acceleration_x: p.accelerationX,
      acceleration_y_up: p.accelerationY,
      acceleration: p.acceleration,
      normalized_cross_correlation: p.score,
      tracking_status: p.status,
      point_source: p.source
    })),
    automatic_candidates: candidates,
    coach_events_and_phase_boundaries: [...events].sort((a, b) => a.frameIndex - b.frameIndex),
    tracking_summary: lastSummary,
    limitations: [
      "Seguimiento 2D de un punto visual del disco; no es una medición 3D.",
      "La correlación de plantilla no es una probabilidad de confianza.",
      "Los cuadros perdidos permanecen sin coordenadas y no se interpolan.",
      "La escala física depende de una referencia coplanar y correctamente medida.",
      "Velocidad y aceleración son derivadas estimadas y sensibles al ruido de seguimiento y a la frecuencia de muestreo.",
      "No se infieren fuerza, potencia, diagnóstico ni riesgo de lesión.",
      "Todos los candidatos automáticos deben ser revisados por un coach."
    ]
  };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "hf-bar-path-analysis.json");
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function resetLab() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null; file = null; video.removeAttribute("src"); video.load();
  seedPoint = null; calibration = null; calibrationClicks = []; trackTemplate = null;
  clearResults();
  $("videoFile").value = "";
  $("videoInfo").textContent = "No hay video cargado.";
  frameContext.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  setMode("seed");
  setStatus("Laboratorio restablecido. El video anterior no se guardó ni se envió a ningún servidor.");
}

$("videoFile").addEventListener("change", () => {
  if ($("videoFile").files?.length) loadLocalVideo().catch(error => setStatus(error.message, "error"));
});
$("loadVideo").addEventListener("click", () => loadLocalVideo().catch(error => setStatus(error.message, "error")));
$("canvasMode").addEventListener("change", event => {
  calibrationClicks = [];
  setMode(event.target.value);
});
$("startTracking").addEventListener("click", () => runTracking().catch(error => setStatus(error.message, "error")));
$("frameSlider").addEventListener("input", event => renderFrameAtIndex(Number(event.target.value)));
$("frameCanvas").addEventListener("click", handleCanvasClick);
$("addEvent").addEventListener("click", () => addEvent());
$("exportCsv").addEventListener("click", exportCsv);
$("exportJson").addEventListener("click", exportJson);
$("resetLab").addEventListener("click", resetLab);
$("liftType").addEventListener("change", () => {
  updatePhaseLabels();
  if (samples.length) {
    candidates = detectCandidateEvents(kinematics, $("liftType").value);
    renderCandidates();
  }
});
window.addEventListener("beforeunload", () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });

updatePhaseLabels();
clearResults();
setMode("seed");
setStatus("Cargá un video lateral para comenzar. El archivo se procesa solo en este navegador.");
