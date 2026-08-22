// fx/avatar/tentacle.js -- "can the blobulator reach out a tentacle with fire applied to the end of its probe if it
// detects a threat?" -- this. On a detected threat the avatar grows a limb toward it: a chain of metaballs from a
// shoulder ball out to a probe tip, tapering as it goes, so the blobulator's Marching Cubes renders it as one
// continuous pseudopod off the body (metaballs merge by nature -- the limb IS the body, stretched). The tip carries
// heat, which drives the fire palette (the voxel fire filter's own colours) and a small VOXELIZED tip volume, so the
// probe-end is a crisp blocky ember against the soft body. Retracts when the threat clears. Pure + verified.
"use strict";
import { firePalette } from "../voxelize/pageVoxels.js";
import { voxelsToMesh } from "../voxelize/voxelMesh.js";

const _sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const _len = (v) => Math.hypot(v[0], v[1], v[2]);

// nearest threat within radius of origin, or null
function detectThreat(threats, origin, radius) {
    let best = null, bd = radius;
    for (const t of threats || []) { const d = _len(_sub(t.p || t, origin)); if (d <= bd) { bd = d; best = t; } }
    return best ? { t: best, dist: bd } : null;
}

function makeTentacle(opts = {}) {
    const segs = opts.segments || 5, maxReach = opts.maxReach || 2.4;
    const reachTime = opts.reachTime || 0.55, holdTime = opts.holdTime || 0.8;
    let reach = 0, phase = "idle", hold = 0, heat = 0, aim = [1, 0, 0];
    // step: grow toward a threat (or retract when it's gone). Returns the metaball segments to add to the body.
    function step(dt, shoulder, threat) {
        if (threat) { const d = _sub(threat.t.p || threat.t, shoulder), l = _len(d) || 1; aim = [d[0] / l, d[1] / l, d[2] / l];
            if (phase === "idle" || phase === "retract") { phase = "reach"; hold = 0; } }
        if (phase === "reach") { reach = Math.min(1, reach + dt / reachTime); if (reach >= 1) { phase = "hold"; hold = 0; } }
        else if (phase === "hold") { hold += dt; if (!threat || hold > holdTime) phase = "retract"; }
        else if (phase === "retract") { reach = Math.max(0, reach - dt / (reachTime * 1.6)); if (reach <= 0) phase = "idle"; }
        heat = phase === "idle" ? Math.max(0, heat - dt) : Math.min(1, heat + dt * 2.2);   // tip ignites as it extends
        if (reach <= 0) return { balls: [], tip: null, reach: 0, heat, phase };
        const dist = threat ? Math.min(threat.dist, maxReach) : maxReach * 0.6;
        const balls = [];
        for (let i = 1; i <= segs; i++) { const u = i / segs, ease = Math.sin(reach * Math.PI * 0.5); const k = u * dist * ease;
            balls.push({ id: "tent" + i, p: [shoulder[0] + aim[0] * k, shoulder[1] + aim[1] * k, shoulder[2] + aim[2] * k], r: 0.26 * (1 - 0.55 * u) });
        }
        const tip = { p: balls[balls.length - 1].p.slice(), heat, color: firePalette(1 - heat) };   // hot tip -> fire palette
        return { balls, tip, reach, heat, phase };
    }
    // the probe tip as a VOXELIZED volume -> watertight mesh (the blocky ember on the soft limb)
    function tipMesh(n = 3, cell = 0.09) {
        const occ = new Uint8Array(n * n * n); const c = (n - 1) / 2, R = c + 0.35;
        for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = x - c, dy = y - c, dz = z - c; if (dx * dx + dy * dy + dz * dz <= R * R) occ[(z * n + y) * n + x] = 1; }
        return voxelsToMesh(occ, n, n, n, cell);
    }
    return { step, tipMesh, get reach() { return reach; }, get phase() { return phase; }, get heat() { return heat; } };
}
export { makeTentacle, detectThreat };
