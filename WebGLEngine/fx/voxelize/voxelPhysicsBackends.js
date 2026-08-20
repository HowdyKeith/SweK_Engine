// fx/voxelize/voxelPhysicsBackends.js -- lets the voxel physics demo switch its rigid-body engine: the verified CPU
// integrator, or the REAL box3d / Jolt backends via the same world API the rest of the engine uses (createWorld /
// addBox / step / readTransforms / impulse -- the interface box3d-blobs already swaps box3d<->Jolt over). Each voxel
// becomes one dynamic box; a static slab is the floor; transforms are read back into px/py/pz each step. The CPU path
// is verified headless; box3d/Jolt are WASM (RIG-ONLY here) but built against the same verified API + proven pattern,
// and the factory falls back to CPU if a backend won't init, so a demo can never end up with no physics.
//
// Coordinate map: voxel space (px,py,pz), render treats +py as DOWN. World is Y-up, so body.y = -py*S and gravity is
// -Y; readback sets py = -world.y/S. S = worldScale.
"use strict";

import { physicsState, impact as cpuImpact, updatePhysics } from "./pageVoxels.js";

function cpuBackend(vg, opts = {}) {
    physicsState(vg, opts);
    return { name: "cpu", ready: true, impact: (pt, s) => cpuImpact(vg, pt, s), step: (dt) => updatePhysics(vg, dt), destroy() {} };
}

// which: "box3d" | "jolt". opts.box3d / opts.joltFactory are the loaded backends (injected by the page), so this
// module stays importable in Node (verification) without pulling in WASM. Returns the same {impact, step} surface.
async function rigidBackend(vg, opts, which) {
    let backend;
    if (which === "jolt") { if (!opts.joltFactory) throw new Error("no jolt"); backend = await opts.joltFactory(); }
    else { if (!opts.box3d) throw new Error("no box3d"); const st = await opts.box3d.init(); if (!(st && st.ready)) throw new Error("box3d not ready"); backend = opts.box3d; }
    const S = opts.worldScale || 6, floorPy = opts.floor || 0.9, g = (opts.g || 2.2) * 9.5, half = ((opts.voxHalf || 0.9 / vg.ny) * S) * 0.5;
    const world = backend.createWorld({ gravity: [0, -g, 0] });
    world.addBox({ type: "static", pos: [0, -floorPy * S - 0.5, 0], half: [S * 3, 0.5, S * 3] });
    const firstDyn = world.bodyCount(); for (const v of vg.voxels) world.addBox({ type: "dynamic", pos: [v.x * S, -v.y * S, v.pz * S], half: [half, half, half], density: 1 });
    function readback() { const xf = world.readTransforms(), nB = world.bodyCount(); let i = firstDyn; for (const v of vg.voxels) { if (i >= nB) break; v.px = xf[i * 7] / S; v.py = -xf[i * 7 + 1] / S; v.pz = xf[i * 7 + 2] / S; v.cr = v.r; v.cg = v.g; v.cb = v.b; v.alpha = 1; i++; } }
    readback();
    return { name: which, ready: true,
        impact: (pt, s) => { const xf = world.readTransforms(), nB = world.bodyCount(); for (let b = firstDyn; b < nB; b++) { const dx = xf[b * 7] - pt.x * S, dy = xf[b * 7 + 1] - (-pt.y * S), dz = xf[b * 7 + 2] - pt.z * S, d = Math.hypot(dx, dy, dz) + 0.1, f = s * Math.exp(-d / (S * 0.5)) / d * S * 9; world.impulse(b, [dx / d * f, dy / d * f + s * S * 3, dz / d * f]); } },
        step: (dt) => { world.step(dt, 4); readback(); }, destroy() { try { world.destroy(); } catch (e) {} } };
}

// factory: returns a backend, always resolving (CPU fallback) so the demo never loses physics.
async function makeVoxelPhysics(vg, kind, opts = {}) {
    if (kind === "cpu") return cpuBackend(vg, opts);
    try { const b = await rigidBackend(vg, opts, kind); return b; }
    catch (e) { const cpu = cpuBackend(vg, opts); cpu.fellBack = String(e && e.message || e); return cpu; }
}

export { cpuBackend, rigidBackend, makeVoxelPhysics };
