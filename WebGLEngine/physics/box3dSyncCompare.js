// WebGLEngine/physics/box3dSyncCompare.js — v2273
//
// Compare the box3d sync reports from every machine and say whether they agree and, if not, WHERE they first
// split. Early divergence (checkpoint 0) means the runtimes disagree from the first frames -- a fundamental
// float/SIMD mismatch. Late divergence means small differences accumulated. Pure + shared: the /box3d/sync
// route uses it server-side and the Box3D page uses it client-side, and the selfcheck pins its behavior.

export function compareSyncReports(reports) {
    const list = Object.entries(reports || {}).map(([machine, r]) => ({ machine, hash: (r && r.hash) || "", checkpoints: (r && r.checkpoints) || [], mode: (r && r.mode) || "" }));
    const withHash = list.filter((r) => r.hash);
    const machines = withHash.map((r) => ({ machine: r.machine, hash: r.hash, mode: r.mode }));
    if (withHash.length < 2) return { count: withHash.length, synchronized: false, divergedAt: null, machines, note: "need reports from 2+ machines" };

    const h0 = withHash[0].hash;
    const synchronized = withHash.every((r) => r.hash === h0);

    // first checkpoint index where not all machines agree (only over machines that reported checkpoints)
    let divergedAt = null;
    const cpCounts = withHash.map((r) => r.checkpoints.length).filter((n) => n > 0);
    const cpLen = cpCounts.length ? Math.min(...cpCounts) : 0;
    if (!synchronized && cpLen > 0) {
        for (let i = 0; i < cpLen; i++) {
            const c0 = withHash[0].checkpoints[i];
            if (!withHash.every((r) => r.checkpoints[i] === c0)) { divergedAt = i; break; }
        }
    }
    // guard: also flag mixed wasm/fallback, since a fallback vs wasm "match" would be meaningless
    const modes = new Set(withHash.map((r) => r.mode).filter(Boolean));
    const mixedModes = modes.size > 1;
    return { count: withHash.length, synchronized, divergedAt, machines, mixedModes };
}

if (typeof module !== "undefined" && module.exports) module.exports = { compareSyncReports };

// v2470 -- WHY A DIVERGENCE MIGHT NOT BE A BUG AT ALL.
//
// Measured on real hardware (2026-07-15, backend-physics-check on Galaxina): two identical worlds, seven bodies,
// 600 steps, one per backend -> worst difference 0.925 m. That was AFTER box3d's WASM was rebuilt so that its damping
// matches Jolt's exactly: both engines now measure 0.05000/s, both pass all four exact checks, and they still do not
// compute the same trajectory (Jolt 95.15633 m, box3d 95.15535 m on a one-second drop).
//
// It is worth being precise about why that can never be fixed. Collisions amplify: a 1e-6 m nudge becomes 9e-2 m in
// 2.5 seconds -- about 90,000x, measured Jolt against itself. To hold two engines inside a 1e-4 m agreement for that
// long they would have to track each other to ~1e-9 m through every operation. Two independent codebases do not share
// operations -- different collision ordering, different solver iterations, different damping arithmetic, different
// fused multiply-adds -- so they differ in the last bit at BEST, and the last bit amplified 90,000x is a metre.
//
// MIXED-BACKEND LOCKSTEP IS NOT BROKEN. IT IS IMPOSSIBLE. Each backend IS deterministic against ITSELF -- the rigid
// suite proves both stay bit-identical, difference exactly 0 -- so lockstep works perfectly when every peer runs the
// same engine. The rule is simply that the engine is part of the protocol, and it never used to be.
//
// So when peers diverge, ask this FIRST. A divergence with a cause is a finding; a divergence without one is a
// week of looking for a bug that was never there.
function backendMismatch(idA, idB) {
    if (!idA || !idB) return { mismatch: false, reason: "backend ids not supplied — cannot rule this out" };
    if (idA === idB) return { mismatch: false, reason: "both peers ran " + idA };
    return {
        mismatch: true,
        reason: "peers ran DIFFERENT physics engines (" + idA + " vs " + idB + "). This is not a bug to hunt: two " +
                "independent engines differ in the last bit, and collisions amplify that ~90,000x in 2.5s. Pin the " +
                "backend — both peers must run the same one.",
    };
}

export { backendMismatch };
