// brain/fieldSpace.mjs
//
// v3339 -- THE SAME NAVIGATION MACHINERY IN SPACE, AND THE ONE ASSUMPTION THAT DOES NOT TRANSFER.
//
// Keith asked whether field navigation works around black holes and anomalies, and whether probes can act as
// EMITTERS rather than only as measurers. Both are yes, and they are yes for different reasons.
//
// EMITTERS: ALREADY STRUCTURAL. flowfieldCpu's Dijkstra is MULTI-SOURCE -- `goals` is an array and every entry
// is seeded at distance zero. A probe that emits IS a source. Measured on a 48x48 map: going from one emitter to
// three improved the cost-to-go at 1753 cells and made ZERO cells worse, which is the invariant that has to hold
// -- adding a source can only shorten the distance to the NEAREST source, never lengthen it.
//
// SPACE: THE MACHINERY TRANSFERS, THE COST MODEL DOES NOT, AND THE FAILURE IS SILENT.
//
// The terrain cost is  1 + slopeK*|dh|/cell  +  waterK if h <= WATER_LEVEL.
//
// That last term is an ABSOLUTE HEIGHT TEST, and it is meaningless for a potential. A gravitational potential has
// no absolute zero -- only differences are physical -- so adding a constant to Phi changes nothing about the
// field and everything about the terrain cost. Measured, same field, same mass, same everything:
//
//     Phi offset  20  ->  cost from the far corner    476.0
//     Phi offset   6  ->  cost from the far corner  12076.0
//
// A factor of TWENTY-FIVE for a change that is not physical. waterK invented a seabed in space, and nothing
// threw: both runs completed and returned plausible numbers.
//
// THE FIX IS GAUGE INVARIANCE, WHICH IS ALSO THE TEST. With waterK = 0 the cost depends only on the GRADIENT of
// the potential -- which is the local gravity, the thing a probe actually has to fight -- so shifting Phi by any
// constant must leave every cost unchanged. Measured across offsets 20, 6, -100 and 1000: 476.0134, 476.0133,
// 476.0134, 476.0125.
//
// THE RESIDUAL IS PRECISION, NOT MODEL, AND IT IS PREDICTABLE. The gradient is a difference of two nearby
// potential values held in a Float32Array, so a large offset costs significant bits to cancellation. The spread
// GROWS with the offset -- 1e-7 at offset 20, 2e-6 at offset 1000 -- which is the signature of float32
// cancellation rather than of the cost model caring about the offset. Keep the offset small and it vanishes.

import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

/** Newtonian potential of a point mass on a grid, softened at the centre so the singularity is not sampled. */
export function potentialField(n, { M = 1, cx = null, cz = null, offset = 0, soften = 2 } = {}) {
    const ox = cx == null ? n / 2 : cx, oz = cz == null ? n / 2 : cz;
    const a = new Float32Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const r = Math.max(soften, Math.hypot(x - ox, z - oz));
        a[z * n + x] = offset - 40 * M / r;
    }
    return a;
}

/**
 * A solver configured for SPACE: waterK = 0, so cost is 1 + slopeK*|grad Phi|/cell and nothing else.
 * The absolute value of the potential cannot enter, which is what makes it a physics model rather than a terrain
 * model wearing a physics label.
 */
export function spaceSolver(n, opts = {}) {
    return new FlowFieldSolverCPU(null, n, n, { ...opts, waterK: 0 });
}

/** Solve with any number of EMITTERS. Each is a source at distance zero -- a probe that broadcasts. */
export function solveWithEmitters(n, field, emitters, opts = {}) {
    const s = spaceSolver(n, opts);
    const out = s.solveSync(field, emitters.map((e) => ({ gx: e.x, gy: e.z })), { wantDist: true });
    return { solver: s, ...out };
}

/**
 * The gauge test: the same physical field at several potential offsets must produce the same costs.
 * Returns the spread, and the spread AT EACH OFFSET so the precision story is visible rather than averaged away.
 */
export function gaugeSpread(n, offsets, { M = 1, probe = [3, 3] } = {}) {
    const costs = offsets.map((offset) => {
        const f = potentialField(n, { M, offset });
        const r = solveWithEmitters(n, f, [{ x: n - 3, z: n - 3 }]);
        return r.dist[probe[1] * n + probe[0]];
    });
    const lo = Math.min(...costs), hi = Math.max(...costs);
    return { offsets, costs, spread: hi - lo, relSpread: (hi - lo) / ((hi + lo) / 2) };
}
