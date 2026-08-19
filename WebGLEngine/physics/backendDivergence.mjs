// physics/backendDivergence.mjs -- run the SAME lockstep scenario on two physics backends and compare their
// stateHash trajectories tick by tick. Two questions it answers:
//   (1) is each backend INTERNALLY deterministic? (same backend twice -> identical trajectory) -- the lockstep-safe
//       property: if two peers on the SAME backend feed the same inputs, they stay in sync.
//   (2) how far do box3d and Jolt DIVERGE on the same scene? They are different solvers, so they will NOT match --
//       which proves a fleet must run ONE backend on every peer (you can't mix a box3d peer with a Jolt peer).
//
// The harness reads positions with readTransforms() (both backends expose the same 7-floats/body layout) and
// computes its OWN quantized-position hash + drift metric, so the comparison is apples-to-apples across engines
// (it does NOT rely on each backend's internal stateHash, which use different algorithms). box3d's WASM is built
// per-rig, so if it can't load this runs Jolt-only and reports box3d as unavailable (run on a rig for the cross
// comparison); Jolt runs headless in Node, so the determinism + divergence machinery is fully exercised here.
"use strict";

// deterministic scenario: a ground + a seeded pile of dynamic boxes with initial spins/velocities. Identical on
// any backend (same numbers in), so any trajectory difference is the SOLVER, not the setup.
function buildScene(world, seedOffset = 0) {
    world.addBox({ type: "static", pos: [0, -0.5, 0], half: [30, 0.5, 30] });
    let s = 12345 + seedOffset; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const idx = [];
    for (let i = 0; i < 14; i++) {
        const b = world.addBox({ type: "dynamic", pos: [(i % 4) * 1.05 - 1.6 + (r() - 0.5) * 0.02, 2 + Math.floor(i / 4) * 1.1, ((i * 3) % 4) * 1.05 - 1.6], half: [0.5, 0.5, 0.5] });
        world.setVelocity(b, [(r() - 0.5) * 2, 0, (r() - 0.5) * 2]);
        if (world.angularImpulse) world.angularImpulse(b, [(r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3]);
        idx.push(b);
    }
    return idx;
}

// harness hash of the dynamic bodies' positions (quantized), independent of any backend's internal hash
function harnessHash(world, idx) {
    const xf = world.readTransforms(); let h = 2166136261 >>> 0;
    for (const i of idx) { for (let c = 0; c < 3; c++) { const q = Math.round(xf[i * 7 + c] * 1000) | 0; h ^= q & 0xff; h = Math.imul(h, 16777619) >>> 0; h ^= (q >> 8) & 0xff; h = Math.imul(h, 16777619) >>> 0; } }
    return h >>> 0;
}
function positions(world, idx) { const xf = world.readTransforms(); return idx.map((i) => [xf[i * 7], xf[i * 7 + 1], xf[i * 7 + 2]]); }

// run the scenario, recording the harness hash + positions each tick
function runTrajectory(makeWorld, ticks, seedOffset = 0) {
    const world = makeWorld(); const idx = buildScene(world, seedOffset);
    const hashes = [], poss = [];
    for (let t = 0; t < ticks; t++) { world.step(1 / 60, 2); hashes.push(harnessHash(world, idx)); poss.push(positions(world, idx)); }
    if (world.destroy) world.destroy();
    return { hashes, poss };
}

// compare two trajectories: first tick where the harness hashes differ, and the max/final positional drift
function compare(a, b) {
    const n = Math.min(a.hashes.length, b.hashes.length); let firstDiff = -1, maxDrift = 0, finalDrift = 0;
    for (let t = 0; t < n; t++) {
        if (firstDiff < 0 && a.hashes[t] !== b.hashes[t]) firstDiff = t;
        let td = 0; for (let k = 0; k < a.poss[t].length; k++) { const dx = a.poss[t][k][0] - b.poss[t][k][0], dy = a.poss[t][k][1] - b.poss[t][k][1], dz = a.poss[t][k][2] - b.poss[t][k][2]; td = Math.max(td, Math.hypot(dx, dy, dz)); }
        maxDrift = Math.max(maxDrift, td); if (t === n - 1) finalDrift = td;
    }
    return { identical: firstDiff < 0, firstDiff, maxDrift, finalDrift };
}

export { buildScene, harnessHash, runTrajectory, compare };
