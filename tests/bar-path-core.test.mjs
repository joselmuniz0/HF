import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPatch, normalizedCrossCorrelation, searchTemplate, trackNextFrame,
  deriveKinematics, summarizeTracking, detectCandidateEvents
} from "../prototypes/bar-path/bar-path-core.mjs";

function makeNoise(width, height, seed = 42) {
  const gray = new Uint8Array(width * height);
  let state = seed >>> 0;
  for (let i = 0; i < gray.length; i++) {
    state = (1664525 * state + 1013904223) >>> 0;
    gray[i] = state & 255;
  }
  return gray;
}
function stampPatch(gray, width, x, y, patch) {
  const r = patch.radius, size = patch.size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      gray[(y - r + py) * width + x - r + px] = patch.data[py * size + px];
    }
  }
}
function texturedPatch(size = 19) {
  const data = new Uint8Array(size * size);
  let s = 2026;
  for (let i = 0; i < data.length; i++) {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    data[i] = (s >>> 8) & 255;
  }
  return { data, size, radius: (size - 1) / 2 };
}

test("template extraction and NCC return a perfect score for an identical patch", () => {
  const width = 80, height = 70;
  const gray = makeNoise(width, height);
  const x = 28, y = 31, radius = 8;
  const patch = extractPatch(gray, width, height, x, y, radius);
  assert.ok(patch);
  assert.equal(normalizedCrossCorrelation(patch.data, patch.data), 1);
  assert.equal(extractPatch(gray, width, height, 1, 1, 9), null);
});

test("template search locates a translated visual feature", () => {
  const width = 120, height = 100;
  const template = texturedPatch();
  const frame = makeNoise(width, height, 99);
  stampPatch(frame, width, 73, 57, template);
  const result = searchTemplate(frame, width, height, template, { x: 64, y: 52 }, 24);
  assert.ok(result);
  assert.deepEqual({ x: result.x, y: result.y }, { x: 73, y: 57 });
  assert.ok(result.score > 0.99);
});

test("frame tracker returns tracked coordinates when the visual feature is present", () => {
  const width = 120, height = 100;
  const template = texturedPatch();
  const frame = makeNoise(width, height, 55);
  stampPatch(frame, width, 76, 54, template);
  const result = trackNextFrame({
    gray: frame, width, height, template,
    previous: { x: 70, y: 52, time: 0, nextTime: 0.02 },
    searchRadius: 20, minCorrelation: 0.5
  });
  assert.equal(result.status, "tracked");
  assert.equal(result.x, 76);
  assert.equal(result.y, 54);
});

test("kinematics recover constant motion in px and calibrated units", () => {
  const samples = Array.from({ length: 11 }, (_, i) => ({
    frameIndex: i, time: i * 0.1, x: i * 2, y: 100 - i * 3,
    score: 0.9, status: "tracked", source: "auto"
  }));
  const px = deriveKinematics(samples);
  assert.ok(Math.abs(px[5].velocityX - 20) < 1e-8);
  assert.ok(Math.abs(px[5].velocityY - 30) < 1e-8);
  const meters = deriveKinematics(samples, { metersPerPixel: 0.01 });
  assert.ok(Math.abs(meters[5].velocityX - 0.2) < 1e-8);
  assert.ok(Math.abs(meters[5].velocityY - 0.3) < 1e-8);
  assert.ok(Math.abs(meters[5].acceleration) < 1e-8);
});

test("lost frames remain null and are not silently interpolated", () => {
  const samples = Array.from({ length: 6 }, (_, i) => ({
    frameIndex: i, time: i * 0.1,
    x: i === 2 ? null : i * 2,
    y: i === 2 ? null : 100 - i * 3,
    score: i === 2 ? null : 0.9,
    status: i === 2 ? "lost" : "tracked",
    source: i === 2 ? "none" : "auto"
  }));
  const result = deriveKinematics(samples);
  assert.equal(result[2].xDisplacement, null);
  assert.equal(result[2].velocityX, null);
  assert.equal(result[2].velocityY, null);
  const summary = summarizeTracking(samples, result);
  assert.equal(summary.trackedFrames, 5);
  assert.equal(summary.lostFrames, 1);
  assert.ok(Math.abs(summary.trackingRate - 5 / 6) < 1e-8);
});

test("automatic event candidates are time-ordered and explicitly labelled as candidates", () => {
  const velocities = [0, 0.2, 0.6, 1.0, 0.5, 0.2, 0.4, 0.9, 0.5, 0.1, -0.2];
  const samples = velocities.map((vy, i) => ({
    frameIndex: i, time: i * 0.1,
    x: 10 + i, y: 100 - velocities.slice(0, i + 1).reduce((a, v) => a + v, 0),
    score: 0.9, status: "tracked", source: "auto"
  }));
  const kin = deriveKinematics(samples);
  const events = detectCandidateEvents(kin, "Snatch");
  assert.ok(events.length >= 2);
  assert.deepEqual(events.map(e => e.frameIndex), [...events.map(e => e.frameIndex)].sort((a, b) => a - b));
  assert.ok(events.every(e => e.source === "automatic_candidate" && e.kind === "candidate"));
});

test("jerk event candidates use dip and drive language, not a snatch phase template", () => {
  const ys = [0, -1, -2, -1, 1, 4, 7, 9, 8, 7];
  const samples = ys.map((y, i) => ({
    frameIndex: i, time: i * 0.1, x: i, y: 100 - y,
    score: 0.9, status: "tracked", source: "auto"
  }));
  const events = detectCandidateEvents(deriveKinematics(samples), "Jerk");
  assert.ok(events.some(e => e.label.includes("Dip")));
  assert.ok(events.some(e => e.label.includes("drive")));
});
