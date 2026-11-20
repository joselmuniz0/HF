/**
 * HF Coach — bar-path prototype core.
 * Tracking scores are normalized cross-correlation values, not probabilities.
 * Missing/occluded points remain null; this module never interpolates a lost track.
 */

export function imageDataToGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  }
  return gray;
}

export function extractPatch(gray, width, height, cx, cy, radius = 9) {
  const size = radius * 2 + 1;
  const x0 = Math.round(cx) - radius;
  const y0 = Math.round(cy) - radius;
  if (x0 < 0 || y0 < 0 || x0 + size > width || y0 + size > height) return null;
  const patch = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const start = (y0 + y) * width + x0;
    patch.set(gray.subarray(start, start + size), y * size);
  }
  return { data: patch, size, radius };
}

export function normalizedCrossCorrelation(template, candidate) {
  if (!template || !candidate || template.length !== candidate.length || !template.length) return -1;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < template.length; i++) {
    sumA += template[i];
    sumB += candidate[i];
  }
  const meanA = sumA / template.length;
  const meanB = sumB / candidate.length;
  let numerator = 0, varianceA = 0, varianceB = 0;
  for (let i = 0; i < template.length; i++) {
    const a = template[i] - meanA;
    const b = candidate[i] - meanB;
    numerator += a * b;
    varianceA += a * a;
    varianceB += b * b;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator > 1e-8 ? numerator / denominator : -1;
}

export function searchTemplate(gray, width, height, template, origin, searchRadius = 32, step = 2) {
  if (!template || !origin) return null;
  const r = template.radius;
  const minX = Math.max(r, Math.floor(origin.x - searchRadius));
  const maxX = Math.min(width - r - 1, Math.ceil(origin.x + searchRadius));
  const minY = Math.max(r, Math.floor(origin.y - searchRadius));
  const maxY = Math.min(height - r - 1, Math.ceil(origin.y + searchRadius));
  let best = { x: null, y: null, score: -1 };
  const evaluate = (x, y) => {
    const patch = extractPatch(gray, width, height, x, y, r);
    if (!patch) return;
    const score = normalizedCrossCorrelation(template.data, patch.data);
    if (score > best.score) best = { x, y, score };
  };
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) evaluate(x, y);
  }
  if (best.x !== null && step > 1) {
    const coarse = best;
    const refineRadius = step + 1;
    best = { x: null, y: null, score: -1 };
    for (let y = Math.max(r, coarse.y - refineRadius); y <= Math.min(height - r - 1, coarse.y + refineRadius); y++) {
      for (let x = Math.max(r, coarse.x - refineRadius); x <= Math.min(width - r - 1, coarse.x + refineRadius); x++) evaluate(x, y);
    }
  }
  return best.x === null ? null : best;
}

export function blendTemplate(template, patch, amount = 0.035) {
  if (!template || !patch || template.data.length !== patch.data.length) return template;
  const next = new Uint8Array(template.data.length);
  for (let i = 0; i < next.length; i++) {
    next[i] = Math.max(0, Math.min(255, Math.round(template.data[i] * (1 - amount) + patch.data[i] * amount)));
  }
  return { ...template, data: next };
}

export function trackNextFrame({
  gray, width, height, template, previous, previousPrevious = null,
  searchRadius = 34, minCorrelation = 0.52
}) {
  if (!previous || previous.x == null || previous.y == null || !template) {
    return { x: null, y: null, score: null, status: "lost", source: "none" };
  }
  let predicted = { x: previous.x, y: previous.y };
  if (previousPrevious && previousPrevious.x != null && previousPrevious.y != null) {
    const dt = Math.max(1e-4, previous.time - previousPrevious.time);
    const nextDt = Math.max(1e-4, previous.nextTime - previous.time || dt);
    const ratio = Math.min(2.5, nextDt / dt);
    predicted = {
      x: previous.x + (previous.x - previousPrevious.x) * ratio,
      y: previous.y + (previous.y - previousPrevious.y) * ratio
    };
  }
  const match = searchTemplate(gray, width, height, template, predicted, searchRadius, 2);
  if (!match || match.score < minCorrelation ||
      Math.hypot(match.x - predicted.x, match.y - predicted.y) > searchRadius * 1.35) {
    return { x: null, y: null, score: match?.score ?? null, status: "lost", source: "none" };
  }
  return { x: match.x, y: match.y, score: match.score, status: "tracked", source: "auto" };
}

function smoothValid(values) {
  return values.map((value, index) => {
    if (value == null || !Number.isFinite(value)) return null;
    const neighbors = [values[index - 1], value, values[index + 1]].filter(v => v != null && Number.isFinite(v));
    return neighbors.reduce((sum, v) => sum + v, 0) / neighbors.length;
  });
}

function derivative(values, times) {
  return values.map((value, i) => {
    if (value == null || !Number.isFinite(value)) return null;
    const before = i > 0 ? i - 1 : null;
    const after = i < values.length - 1 ? i + 1 : null;
    if (before !== null && after !== null &&
        values[before] != null && values[after] != null) {
      const dt = times[after] - times[before];
      return dt > 0 ? (values[after] - values[before]) / dt : null;
    }
    if (after !== null && values[after] != null) {
      const dt = times[after] - times[i];
      return dt > 0 ? (values[after] - value) / dt : null;
    }
    if (before !== null && values[before] != null) {
      const dt = times[i] - times[before];
      return dt > 0 ? (value - values[before]) / dt : null;
    }
    return null;
  });
}

export function deriveKinematics(samples, calibration = null) {
  const valid = samples.filter(s => s && s.x != null && s.y != null);
  const origin = valid[0] || null;
  const mPerPx = calibration?.metersPerPixel || null;
  const times = samples.map(s => s.time);
  const rawX = samples.map(s => s.x == null || !origin ? null : (s.x - origin.x) * (mPerPx || 1));
  const rawY = samples.map(s => s.y == null || !origin ? null : (origin.y - s.y) * (mPerPx || 1));
  const x = smoothValid(rawX);
  const y = smoothValid(rawY);
  const vx = derivative(x, times);
  const vy = derivative(y, times);
  const ax = derivative(vx, times);
  const ay = derivative(vy, times);
  return samples.map((sample, i) => ({
    ...sample,
    xDisplacement: x[i],
    yDisplacement: y[i],
    velocityX: vx[i],
    velocityY: vy[i],
    speed: vx[i] == null || vy[i] == null ? null : Math.hypot(vx[i], vy[i]),
    accelerationX: ax[i],
    accelerationY: ay[i],
    acceleration: ax[i] == null || ay[i] == null ? null : Math.hypot(ax[i], ay[i])
  }));
}

function localPeaks(values) {
  const peaks = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] == null || values[i - 1] == null || values[i + 1] == null) continue;
    if (values[i] > values[i - 1] && values[i] >= values[i + 1]) peaks.push(i);
  }
  return peaks;
}

export function detectCandidateEvents(kinematics, lift = "Snatch") {
  const validVy = kinematics.map(s => s.velocityY).filter(v => v != null && Number.isFinite(v));
  if (kinematics.length < 5 || validVy.length < 5) return [];
  const maxPositive = Math.max(0, ...validVy);
  const maxAbs = Math.max(...validVy.map(Math.abs));
  if (!maxAbs) return [];
  const onsetThreshold = maxAbs * 0.12;
  const onset = kinematics.findIndex(s => s.velocityY != null && Math.abs(s.velocityY) >= onsetThreshold);
  const maxHeightIndex = kinematics.reduce((best, s, i, all) =>
    s.yDisplacement != null && (best < 0 || s.yDisplacement > all[best].yDisplacement) ? i : best, -1);
  const events = [];
  const add = (index, label, detail) => {
    if (index >= 0 && index < kinematics.length) {
      events.push({
        frameIndex: index,
        time: kinematics[index].time,
        label,
        detail,
        source: "automatic_candidate",
        kind: "candidate"
      });
    }
  };
  if (onset >= 0) add(onset, "Inicio de movimiento (candidato)", "Primer cambio de velocidad detectado en la trayectoria de la barra.");

  if (String(lift).toLowerCase() === "jerk") {
    const earlyEnd = Math.max(2, Math.floor(kinematics.length * 0.45));
    let dipIndex = -1;
    for (let i = 0; i < earlyEnd; i++) {
      if (kinematics[i].yDisplacement != null &&
          (dipIndex < 0 || kinematics[i].yDisplacement < kinematics[dipIndex].yDisplacement)) dipIndex = i;
    }
    if (dipIndex >= 0) {
      add(dipIndex, "Dip — mínimo de barra (candidato)", "Mínimo local de la barra durante la preparación del envión.");
      const drive = kinematics.findIndex((s, i) => i > dipIndex && s.velocityY != null && s.velocityY > maxPositive * 0.12);
      if (drive >= 0) add(drive, "Inicio del drive (candidato)", "La velocidad vertical cambia hacia arriba después del dip.");
    }
    if (maxHeightIndex >= 0) add(maxHeightIndex, "Altura máxima (candidato)", "Máxima coordenada vertical estimada de la barra.");
    return events.sort((a, b) => a.frameIndex - b.frameIndex);
  }

  const peaks = localPeaks(kinematics.map(s => s.velocityY));
  const selectedPeaks = peaks
    .filter(i => kinematics[i].velocityY > maxPositive * 0.18)
    .sort((a, b) => kinematics[b].velocityY - kinematics[a].velocityY);
  const firstPeak = selectedPeaks[0] ?? -1;
  const secondPeak = selectedPeaks.find(i => firstPeak >= 0 && Math.abs(kinematics[i].time - kinematics[firstPeak].time) >= 0.12) ?? -1;
  if (firstPeak >= 0) add(firstPeak, "Pico de velocidad ascendente 1 (candidato)", "Máximo local de velocidad vertical; no representa por sí solo el final de una fase.");
  if (secondPeak >= 0) {
    const lo = Math.min(firstPeak, secondPeak), hi = Math.max(firstPeak, secondPeak);
    let transition = lo;
    for (let i = lo + 1; i < hi; i++) {
      if (kinematics[i].velocityY != null && kinematics[transition].velocityY != null &&
          kinematics[i].velocityY < kinematics[transition].velocityY) transition = i;
    }
    add(transition, "Mínimo entre picos (candidato a transición)", "Valle de velocidad entre dos máximos locales.");
    add(secondPeak, "Pico de velocidad ascendente 2 (candidato)", "Segundo máximo local de velocidad vertical.");
  }
  if (maxHeightIndex >= 0) add(maxHeightIndex, "Altura máxima (candidato)", "Máxima coordenada vertical estimada de la barra.");
  return events.sort((a, b) => a.frameIndex - b.frameIndex);
}

export function summarizeTracking(samples, kinematics) {
  const valid = samples.filter(s => s.x != null && s.y != null);
  const scores = valid.map(s => s.score).filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return {
    totalFrames: samples.length,
    trackedFrames: valid.length,
    lostFrames: samples.length - valid.length,
    trackingRate: samples.length ? valid.length / samples.length : 0,
    medianCorrelation: scores.length ? scores[Math.floor(scores.length / 2)] : null,
    maxUpwardVelocity: Math.max(0, ...kinematics.map(s => s.velocityY ?? 0)),
    maxSpeed: Math.max(0, ...kinematics.map(s => s.speed ?? 0)),
    maxAcceleration: Math.max(0, ...kinematics.map(s => s.acceleration ?? 0))
  };
}
