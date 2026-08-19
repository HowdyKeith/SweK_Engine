// blobBrain.js -- the SweK GPU Brain, pointed at the Blobulator.
//
// A small policy MLP (the Brain's own BatchedMLP, running on the SAME WebGPU device as the raymarcher)
// watches an aggregate state of the lava and outputs a control action; a fixed actuator turns that action
// into per-blob Box3D impulses. It learns ONLINE with an evolution-strategies estimator (perturb the weights,
// run a short episode, nudge the champion toward whatever raised the reward) -- the same spirit as the Brain's
// es.update, just in the browser so it can steer physics live. Four reward modes ("rounds"):
//   fountain  -- keep the lava dancing in a height band (replaces the dumb timed fountain)
//   sheepdog  -- herd the blob centroid onto a (moving) target
//   spread    -- maximize dispersion   |   clump -- minimize it
//   sculpt    -- fill a target ring shape
//
// The policy decides at ~15 Hz (forward() reads back over the GPU, so we decouple it from the 60 fps render);
// the page applies the held action as continuous impulses each frame.

import { BatchedMLP } from "/brain/mlp.js";

const STATE = 13, HID = 16, ACT = 6;
const EP_TICKS = 45;          // ~3 s per episode at 15 Hz

function randn() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function xavier(nIn, nOut) { const a = new Float32Array(nOut * nIn); const s = 1 / Math.sqrt(nIn); for (let i = 0; i < a.length; i++) a[i] = randn() * s; return a; }

export function makeBlobBrain(device) {
  // champion weights (kept in JS; hot-swapped onto the GPU each episode)
  const cW0 = xavier(STATE, HID), cb0 = new Float32Array(HID);
  const cW1 = xavier(HID, ACT), cb1 = new Float32Array(ACT);
  const mlp = new BatchedMLP(device, [
    { nIn: STATE, nOut: HID, W: cW0.slice(), b: cb0.slice(), act: "relu" },
    { nIn: HID, nOut: ACT, W: cW1.slice(), b: cb1.slice(), act: "none" },
  ], 1);

  let mode = "fountain", target = [0, 0, 0], targetActive = false;
  let episode = 0, tick = 0, epReward = 0, best = -1e9, lastReward = 0, avg = 0, sigma = 0.22;
  const trace = [];                 // last N episode mean-rewards for the gauge
  let tW0, tb0, tW1, tb1;           // this episode's TRIAL weights (champion + noise)
  let action = new Float32Array(ACT);
  let busy = false;

  // Robust stochastic hill-climb: perturb the champion, run a short episode, ADOPT only if it beat the best
  // (so weights change only on improvements and can never blow up); the bar drifts down slowly so a lucky
  // episode in a noisy physics env can't lock progress. Weights are clamped, and a NES-style gradient (tested)
  // diverged here, so we use this instead.
  function perturb(w) { const o = new Float32Array(w.length); for (let i = 0; i < w.length; i++) { const v = w[i] + randn() * sigma; o[i] = v < -3 ? -3 : (v > 3 ? 3 : v); } return o; }
  function copyInto(dst, src) { for (let i = 0; i < dst.length; i++) dst[i] = src[i]; }
  function beginEpisode() {
    tW0 = perturb(cW0); tb0 = perturb(cb0); tW1 = perturb(cW1); tb1 = perturb(cb1);
    mlp.updateWeights(0, tW0, tb0); mlp.updateWeights(1, tW1, tb1);
    epReward = 0; tick = 0;
  }
  function endEpisode() {
    const R = epReward / Math.max(1, tick);
    lastReward = R; avg = avg * 0.9 + R * 0.1;
    if (R > best) { copyInto(cW0, tW0); copyInto(cb0, tb0); copyInto(cW1, tW1); copyInto(cb1, tb1); best = R; }   // adopt the improvement
    else { best = best * 0.95 + R * 0.05; }                                                                       // let the bar drift (noisy env)
    sigma = Math.max(0.05, sigma * 0.999);
    trace.push(R); if (trace.length > 80) trace.shift();
    episode++;
    beginEpisode();
  }

  // aggregate the blob cloud into a fixed-length, normalized state
  function features(blob, n, dims) {
    const { TW, TH } = dims;
    let mx = 0, my = 0, mz = 0, mvx = 0, mvy = 0, mvz = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < n; i++) {
      const x = blob[i * 6], y = blob[i * 6 + 1], zz = blob[i * 6 + 2], vx = blob[i * 6 + 3], vy = blob[i * 6 + 4], vz = blob[i * 6 + 5];
      mx += x; my += y; mz += zz; mvx += vx; mvy += vy; mvz += vz;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); minz = Math.min(minz, zz); maxz = Math.max(maxz, zz);
    }
    const k = Math.max(1, n); mx /= k; my /= k; mz /= k; mvx /= k; mvy /= k; mvz /= k;
    const spread = (Math.hypot(maxx - minx, maxy - miny, maxz - minz)) || 0;
    const s = [mx / TW, my / TH, mz / TW, mvx / 12, mvy / 12, mvz / 12, spread / (TW * 2),
      (maxx - minx) / (TW * 2), (maxy - miny) / TH, (maxz - minz) / (TW * 2),
      (target[0] - mx) / TW, (target[1] - my) / TH, (target[2] - mz) / TW];
    return { vec: Float32Array.from(s), mx, my, mz, mvx, mvy, mvz, spread, speed: Math.hypot(mvx, mvy, mvz) };
  }

  function reward(f, dims) {
    const { TW, TH } = dims;
    if (mode === "sheepdog") { const d = Math.hypot(target[0] - f.mx, target[1] - f.my, target[2] - f.mz); return 1 - 2 * Math.min(1, d / (TW * 1.6)); }
    if (mode === "spread") { return 2 * Math.min(1, f.spread / (TW * 2)) - 1; }
    if (mode === "clump") { return 1 - 2 * Math.min(1, f.spread / (TW * 2)); }
    if (mode === "sculpt") { return 1 - 2 * Math.min(1, sculptDist(f, dims) / TW); }
    // fountain: dance in a height band + keep moving, don't go still or splat
    const band = 1 - 2 * Math.abs(f.my / TH - 0.58);
    const motion = Math.min(1, f.speed / 12);
    return 0.7 * band + 0.3 * motion;
  }
  let _sculptAcc = 0;
  function sculptDist() { return _sculptAcc; }   // filled per-step from raw blobs below

  // squash the raw net output into world-scaled control params
  function decode(out, f, dims) {
    const { TW, TH } = dims;
    const th = Math.tanh;
    let gx, gy, gz;
    if ((mode === "sheepdog" || mode === "sculpt") && targetActive) { gx = target[0]; gy = target[1]; gz = target[2]; }
    else { gx = f.mx + th(out[0]) * TW; gy = TH * (0.3 + 0.5 * (0.5 + 0.5 * th(out[1]))); gz = f.mz + th(out[2]) * TW; }
    return { gx, gy, gz, gain: (0.5 + 0.5 * th(out[3])) * 9, launch: (0.5 + 0.5 * th(out[4])) * 24, jitter: (0.5 + 0.5 * th(out[5])) * 6 };
  }

  // one decision: observe -> reward -> policy -> action. Called at ~15 Hz by the page.
  async function step(blob, n, dims) {
    if (busy || n === 0) return action;
    busy = true;
    try {
      // sculpt distance needs raw blobs
      if (mode === "sculpt") { _sculptAcc = meanRingDist(blob, n, dims); }
      const f = features(blob, n, dims);
      epReward += reward(f, dims); tick++;
      const out = await mlp.forward(f.vec, 1);
      if (out && out.length >= ACT && Number.isFinite(out[0])) {
        const dec = decode(out, f, dims);
        action = Float32Array.from([dec.gx, dec.gy, dec.gz, dec.gain, dec.launch, dec.jitter]);
      }
      if (tick >= EP_TICKS) endEpisode();
    } catch (e) { /* keep last action on any GPU hiccup */ }
    busy = false;
    return action;
  }

  function meanRingDist(blob, n, dims) {
    const { TW, TH } = dims; const R = TW * 0.55, planeY = TH * 0.5; let acc = 0;
    for (let i = 0; i < n; i++) { const x = blob[i * 6], y = blob[i * 6 + 1], zz = blob[i * 6 + 2]; const rr = Math.hypot(x, zz); acc += Math.hypot(rr - R, y - planeY); }
    return acc / Math.max(1, n);
  }

  beginEpisode();
  return {
    step,
    setMode(m) { mode = m; episode = 0; avg = 0; best = -1e9; sigma = 0.22; trace.length = 0; beginEpisode(); },
    setTarget(t) { if (t) { target = t; targetActive = true; } else targetActive = false; },
    getMode() { return mode; },
    stats() { return { episode, reward: lastReward, avg, best, trace: trace.slice() }; },
  };
}
