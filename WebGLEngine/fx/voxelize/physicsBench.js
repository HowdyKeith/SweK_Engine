// fx/voxelize/physicsBench.js -- benchmark the physics backends against each other: ramp the body count, measure
// milliseconds per step, derive fps (capped at 60, the rAF ceiling), and find each engine's MAX bodies at 60fps.
// The classic "pyramid of falling boxes" stress test, made measurable. What you see: a degradation curve per engine
// (ms/step rises with N), a 60fps ceiling, and a max-bodies knee where each engine drops below 60. The honest story
// is a tradeoff -- SweK CPU is cheap per body but does floor-only collision; box3d/Jolt cost more but do real
// body-body stacking (that's what makes a pyramid actually pile). CPU numbers are measured here; box3d/Jolt on-rig.
"use strict";

import { physicsState, impact, updatePhysics } from "./pageVoxels.js";

// N bodies arranged in a proper square pyramid (small on top, wide base), as a voxel-grid the renderer understands.
function makePyramid(n) {
    const voxels = []; let placed = 0, level = 0;
    while (placed < n) { const w = level + 1; for (let i = 0; i < w && placed < n; i++) for (let k = 0; k < w && placed < n; k++) { voxels.push({ x: (i - w / 2) * 0.03, y: -level * 0.03, z: (k - w / 2) * 0.03, r: 0.55 + (level % 3) * 0.13, g: 0.55, b: 0.72 }); placed++; } level++; }
    return { voxels, nx: level + 1, ny: Math.max(1, level) };
}

// worst-case ms/step for N CPU bodies: floor far away so every body stays active the whole window (no sleeping).
function benchCPU(n, steps) {
    steps = steps || 90; const vg = makePyramid(n); physicsState(vg, { g: 2.4, floor: 1e6 }); impact(vg, { x: 0, y: 0, z: 0 }, 1.4);
    const t0 = performance.now(); for (let s = 0; s < steps; s++) updatePhysics(vg, 1 / 60); const t1 = performance.now();
    const ms = (t1 - t0) / steps; return { n, ms, fps: Math.min(60, 1000 / Math.max(1e-4, ms)) };
}
// generic: measure a backend's step cost via makeVoxelPhysics (used on-rig for box3d/Jolt); makeSim(vg) -> {step}
async function benchBackend(makeVoxelPhysics, backend, opts, n, steps) {
    steps = steps || 90; const vg = makePyramid(n); const phys = await makeVoxelPhysics(vg, backend, Object.assign({ g: 2.4, floor: 1e6 }, opts));
    phys.impact({ x: 0, y: 0, z: 0 }, 1.4); const t0 = performance.now(); for (let s = 0; s < steps; s++) phys.step(1 / 60); const t1 = performance.now();
    try { phys.destroy && phys.destroy(); } catch (e) {} const ms = (t1 - t0) / steps; return { n, ms, fps: Math.min(60, 1000 / Math.max(1e-4, ms)), backend: phys.name };
}
// ramp counts -> curve; maxAt60 = largest N whose fps stays >= threshold (interpolated knee)
function maxAt60(curve, thresh) { thresh = thresh || 58; let best = 0; for (const p of curve) if (p.fps >= thresh) best = p.n; return best; }

export { makePyramid, benchCPU, benchBackend, maxAt60 };
if (typeof module !== "undefined" && module.exports) module.exports = { makePyramid, benchCPU, benchBackend, maxAt60 };
