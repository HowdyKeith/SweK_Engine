// tools/roundhouse/blobBodiesBind.mjs
//
// v3302 -- THE AQUARIUM THAT DISSOLVES YOU. Fifteenth promotion, and the answer key is built by CONSTRUCTION
// rather than borrowed from a textbook.
//
// THE OCCASION: a plan arrived for "blobulator as the universe physics" -- bake the density into a WebGPU 3D
// texture, solve Navier-Stokes on it with semi-Lagrangian advection, marching cubes on the way out. The shape of
// that plan is CORRECT; it is the standard Stam-1999 stable-fluids pipeline and it works. Nobody measured what
// it costs.
//
// THE KEY IS THE ROUND TRIP, AND IT NEEDS NO REFERENCE VALUE. Advect the field right N steps, then left N steps.
// It ends EXACTLY where it started, so the true answer is "unchanged" and every departure is PURE NUMERICS with
// no motion mixed in. That is a stronger position than comparing against an analytic solution, because there is
// no discretisation of the reference to argue about -- the reference is the input.
//
// WHAT IT COSTS, measured at 64^3 over four round trips:
//
//     PEAK KEPT 57.9%     MASS KEPT 99.99%
//
// *** AND THE TWO COLUMNS TOGETHER ARE THE FINDING. *** The blob does not EVAPORATE -- the books stay balanced
// to four decimal places. It DISSOLVES: it smears flatter and wider while conserving its own mass. That is
// semi-Lagrangian advection's numerical diffusion, it is the price of the unconditional stability that makes
// the method worth using at all, and a device grading only mass would call this run perfect.
//
// THE COMPARISON: the same seven blobs, moved as BODIES -- seven centres translated, the formula re-evaluated.
// Peak kept 100.0%, drift 8.9e-16, which is one float rounding rather than accumulation. Four round trips or
// four million, the blob is exact. THE GRID LOST 42% OF ITS PEAK; SEVEN NUMBERS LOST NOTHING, at a cost of
// 7 bodies against 262,144 voxels.

// *** v3713 -- THE PLANT, AND WHY IT IS NOT THE SHAPE THE CENSUS EXPECTS. Swap the trilinear sampler for a
// NEAREST-NEIGHBOUR one -- a plausible wrong derivation, and a tempting one: it is faster and "close enough".
// Per step the departure point is about a quarter of a cell, so it rounds back into the cell it started in and
// THE FIELD NEVER MOVES. MEASURED: peakKept 1.0000 and massKept 1.0000 against the honest run's 0.5617 and
// 0.9998.
//
// *** SO THIS PLANT MOVES BOTH ORIGINAL OBSERVABLES **TOWARD** THEIR IDEAL, AND v3690'S DISCRIMINATOR SAYS A
// PLANT MOVES THEM AWAY. By that rule this reads as a POSITIVE CONTROL, and it is the opposite: a run that
// reports no loss because it did no work. THE RULE IS SOUND WHERE THE IDEAL IS THE TRUTH -- here "nothing was
// lost" is not the truth, it is the symptom. The discriminator is about DIRECTION RELATIVE TO THE TRUTH, not
// direction relative to the prettier number, and this is the first case in the tree where those differ. ***
//
// A PLANT NOBODY CAN CATCH IS NOT A PLANT, so the observable came first: the round trip measures LOSS and is
// blind to MOTION. "Nothing was lost" and "nothing happened" were the same reading. shiftKept advects ONE WAY
// and compares the centroid's travel against v*dt*steps -- honest 1.0000, planted 0.0000.
import { advectionLoss } from "../../physics/blobBodies.js";
import { makeBlobs, blobFieldAt } from "../../simulation/tomo/blobPhantom.js";

export const BLOB_OBSERVABLES = [
    "peakKept", "massKept", "peak0", "peak", "trips", "gridN", "voxels",
    "bodyPeakKept", "bodyDrift", "bodyCount",
    "shiftKept", "oneWayShift", "expectedShift",
];

const DEF = { n: 64, trips: 4, seed: 20260715 };

/** Peak of the analytic field over a coarse probe grid -- the BODY path, where the formula travels with the centres. */
function bodyPeak(blobs) {
    let p = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) for (let k = 0; k < 40; k++) {
        const v = blobFieldAt(-2 + i * 0.1, -2 + j * 0.1, -2 + k * 0.1, blobs);
        if (v > p) p = v;
    }
    return p;
}

function buildBlobBodies({ mode = "roundtrip", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const blobs = makeBlobs(7, c.seed);

    if (mode === "bodies") {
        // move the centres right then left, N times, and re-evaluate the formula
        const p0 = bodyPeak(blobs);
        let moved = blobs.map((b) => ({ ...b }));
        for (let t = 0; t < c.trips; t++) {
            moved = moved.map((b) => ({ ...b, x: b.x + 0.5 }));
            moved = moved.map((b) => ({ ...b, x: b.x - 0.5 }));
        }
        const p = bodyPeak(moved);
        return {
            peakKept: null, massKept: null, peak0: p0, peak: p, trips: c.trips,
            gridN: null, voxels: null,
            bodyPeakKept: p / p0, bodyDrift: Math.abs(p - p0), bodyCount: blobs.length,
            shiftKept: null, oneWayShift: null, expectedShift: null,   // the bodies path advects nothing
        };
    }

    const r = advectionLoss(blobs, { n: c.n, trips: c.trips, nearest: !!c.planted });
    return {
        peakKept: r.peakKept, massKept: r.massKept, peak0: r.peak0, peak: r.peak,
        trips: c.trips, gridN: c.n, voxels: c.n ** 3,
        bodyPeakKept: null, bodyDrift: null, bodyCount: blobs.length,
        shiftKept: r.shiftKept, oneWayShift: r.oneWayShift, expectedShift: r.expectedShift,
    };
}

export const blobBodiesDevice = {
    // *** v3851 -- METHOD, AND IT IS THE SECOND ONE THE DEFAULT WOULD HAVE GOT WRONG. *** The advection law
    // is right (transport at v for dt), and the reading is right (a mass-weighted centroid along x). What is
    // wrong is HOW THE FIELD IS EVALUATED AT THE DEPARTURE POINT: round to the nearest voxel instead of
    // interpolating, and since v*dt is about a quarter of a cell it rounds back into the cell it started in
    // and the field never moves. NO PHYSICS LAW WAS REPLACED AND NO MEASUREMENT WAS SUBSTITUTED -- a
    // discretisation choice inside a correct scheme was. That is seismic's category (v3400), which
    // reparametrises a correct integral where dx/dz diverges: THE PHYSICS IS RIGHT AND THE READING IS RIGHT;
    // THE EVALUATION IS WRONG.
    plantKind: "method",
    // *** v3851 -- `plantKind` IS THE TAXONOMY; `planted.knob` BELOW IS THE CONFIG KEY. Two different
    // things wearing one word, and gates read the second by name, so it is NOT renamed here. ***
    // WHAT THE PLANT OVERTURNS, named on the device so plantedCoverage reads it rather than grepping prose:
    // shiftKept 1.0000 -> 0.0000, while peakKept and massKept both IMPROVE to a perfect 1.0000.
    planted: { knob: "nearest", observable: "shiftKept",
               note: "nearest-neighbour sampling stalls the field; the loss columns call that perfect" },
    modes: ["roundtrip", "bodies"],
    name: "blob-advection-roundtrip", observables: BLOB_OBSERVABLES, build: buildBlobBodies,
    defaults: ({ mode } = {}) => ({ mode: mode || "roundtrip", config: { ...DEF } }),
};
