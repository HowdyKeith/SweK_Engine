// tools/roundhouse/flip3dBind.mjs
//
// v3729 -- roundhouse device: THE 3D FLIP/PIC FLUID (fluid/flip3d.mjs). The curriculum has proposed GRADE
// fluid/flip3d.mjs since the fluid grades opened; gradedCoverage's rule is this file existing and importing
// that module. IT IS THE LAST OF THE FLUID GRADES.
//
// *** THE PROBLEM THIS ROUND HAD TO SOLVE FIRST: THE OBVIOUS KEY IS v3718's KEY ONE DIMENSION UP. *** flip2d's
// device grades p = rho*g*d recovered from the PROJECTION, which is never handed rho or g. The 3D solver has a
// pressure field too, so porting that claim takes ten minutes -- and it would be a real measurement of a
// different codebase, which is why it IS shipped here as `hydrostatic`. But a port cannot answer the question
// the curriculum is actually asking, WHICH IS WHETHER THE THIRD DIMENSION IS RIGHT. So the round went looking
// for a key that DOES NOT EXIST IN 2D, and the blindness census below is the argument for it.
//
// *** THE 3D KEY: THE TWO LATERAL AXES ARE INTERCHANGEABLE, AND NOTHING TELLS THE CODE THAT. *** The three face
// arrays are indexed by hand with three different strides (ui/vi/wi); the divergence sums three separately
// written terms; the pressure stencil lists its six neighbours as a literal array; the gradient subtraction is
// three loops with different bounds. Every one of those is an opportunity for x and z to disagree. So: build a
// violent asymmetric fixture along x, build the SAME fixture along z BY TRANSPOSING EVERY PARTICLE, run both,
// and compare.
//
// MEASURED, 12x16x12, a half-domain dam break, 300 steps, iters 60:
//   front, meanAlong, meanHeight and maxDivergence are BIT-IDENTICAL between the two runs -- relative
//   difference EXACTLY 0, not "small". meanSpeed differs at 2.0e-16, one ulp, because it is a SUM over
//   particles and transposition permutes the order of the additions. THAT ONE IS REPORTED, NOT ASSERTED EXACT.
//
// *** THE FIRST ATTEMPT AT THIS KEY READ 1e-3 TO 1e-1 AND WAS MEASURING ITS OWN FIXTURE. *** Filling the x pool
// and the z pool with two separate fillBlock calls gives TWO DIFFERENT POOLS: fillBlock walks x,y,z and draws
// jitter in that order, so the seeded layouts are not transposes of each other. The difference was fixture
// noise, and at 1e-2 it would have been shipped as "the solver is isotropic to about a percent" -- a bar loose
// enough to hide every plant below. THE TRANSPOSED FIXTURE IS THE ONLY HONEST ONE, and the give-away was that
// the number did not fall as the run got longer.
//
// *** THE BLINDNESS CENSUS -- THREE PLANTS, AND THE PAIR SEPARATES BOTH WAYS. Measured on the shipped module,
// each restored afterwards:
//   A. the divergence drops its z term (a 2D solver wearing a 3D interface):
//        isotropy 0 -> 2.509e-1 FIRES.  hydrostatic BLIND: slope -9.810005, R^2 1.000000, bottom 78.4800.
//   B. the six-neighbour stencil lists k-1 and not k+1:
//        isotropy 0 -> 3.982e-1 FIRES.  hydrostatic BLIND: slope -9.810008, R^2 1.000000, bottom 78.4801.
//   C. the pressure scale halved -- IDENTICAL IN ALL THREE AXES:
//        isotropy EXACTLY 0, BLIND BY CONSTRUCTION.  hydrostatic FIRES: slope -9.625245 (1.88e-2 off, 18.8x a
//        1e-3 bar), R^2 0.999821, bottom 69.3768 against an exact 78.4800 -- 11.6%.
// *** SO NEITHER IS REDUNDANT AND NEITHER IS A GAP IN THE OTHER: a symmetric error moves the MAGNITUDE and an
// asymmetric one moves the AXES, and each key is deaf to the other's case. C IS THE HALF THAT IS EASY TO SKIP,
// and skipping it would have left "isotropy catches everything" standing unmeasured. ***
//
// *** AND THE HONEST HALF, MEASURED BECAUSE v3724 SAYS TO MEASURE IT: fluid/flip3d-selfcheck.mjs ALREADY
// CATCHES ALL THREE. *** Every plant trips the same two pre-existing checks -- "more pressure iterations drive
// the divergence down" and "and MONOTONICALLY" -- with reduction factors of 1.1e+0 (A), 6.0e-3 (B) and 1.8e+0
// (C) against the honest solver's 1.2e+4. THIS DEVICE IS NOT THE ONLY DETECTOR AND IS NOT SOLD AS ONE. What it
// adds is a different thing from detection: those pre-existing checks are a SELF-CONSISTENCY measure, and
// v3718 rejected exactly that as an answer key for flip2d because a stopping criterion is the solver grading
// itself. They say SOMETHING IS WRONG. These keys are reference-free and EXACT, and between them they say
// WHICH KIND -- red slope with green isotropy is a MAGNITUDE error, the reverse is an AXIS error. A DIAGNOSTIC
// THAT NAMES THE FAILURE MODE IS WORTH SHIPPING BESIDE A DETECTOR THAT ONLY RAISES A HAND, but it is worth it
// for THAT reason and not for a coverage gap, and no coverage gap is claimed here.
//
// *** WHAT IS REPORTED AND DELIBERATELY NOT ASSERTED: THE FOOTPRINT INVARIANCE. *** Bottom pressure depends on
// DEPTH ALONE, so widening the cross-section at fixed depth must not move it: measured 78.4800 / 78.4801 /
// 78.4801 at 6^2, 10^2 and 14^2 across 9.00x THE FLUID MASS, a spread of 1.94e-6. It reads like a second key
// and IT IS NOT ONE. The only defect it responds to is UNDER-CONVERGENCE, which scales with domain size
// (spread 1.94e-6 at iters 60, 1.73e-5 at 10, 1.97e-3 at 4) -- and at iters 4 THE SLOPE FIRES TOO (1.9e-3
// against a 1e-3 bar). A claim that moves only where an existing claim also moves is a SECOND DECLARATION, not
// a second key, and the honest place for it is the report.
//
// NOT PLANTED. The curriculum asked for a GRADE; a declared plant for flip3d is a separate round, and the
// three plants above were run and REVERTED -- they are evidence about these keys, not coverage.
// NOT CLAIMED: that fluid/flip3d.mjs is correct. The rigid coupling (twoWay, buoyancy over submerged faces),
// the mgpcg and rbgs solver paths, and the free surface in 3D are all UNGRADED here; the default jacobi path
// is what these keys drive.

import { Flip3D, FLUID } from "../../fluid/flip3d.mjs";

export const FLIP3D_OBSERVABLES = [
    "slopePerCell", "slopeExact", "slopeErrFrac", "linearityR2",
    "bottomPressure", "bottomExact", "bottomErrFrac", "fluidCellsInColumn",
    "frontRel", "meanAlongRel", "meanHeightRel", "maxDivRel", "meanSpeedRel", "worstRel", "transposed",
    "footprints", "footprintSpread", "massRatio",
    "particles", "steps", "iters", "kind",
];

const DEF = {
    n: 12, ny: 16, depth: 10, per: 2, h: 1, gravity: -9.81, dt: 1 / 60,
    steps: 300, iters: 60, seed: 1,
};

export function flip3dDefaults(hyp) {
    const h = { mode: "hydrostatic", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.n = Math.min(24, Math.max(6, num(c.n, DEF.n) | 0));
    c.ny = Math.min(32, Math.max(8, num(c.ny, DEF.ny) | 0));
    c.depth = Math.min(c.ny - 4, Math.max(3, num(c.depth, DEF.depth) | 0));
    c.per = Math.min(3, Math.max(1, num(c.per, DEF.per) | 0));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h)));
    c.gravity = Math.min(-0.1, Math.max(-100, num(c.gravity, DEF.gravity)));
    c.dt = Math.min(0.1, Math.max(1e-4, num(c.dt, DEF.dt)));
    c.steps = Math.min(2000, Math.max(30, num(c.steps, DEF.steps) | 0));
    c.iters = Math.min(400, Math.max(1, num(c.iters, DEF.iters) | 0));
    h.config = c;
    if (!["hydrostatic", "isotropy", "footprint"].includes(h.mode)) h.mode = "hydrostatic";
    if (!h.claim || !h.claim.observable) {
        h.claim = h.mode === "isotropy"
            ? { observable: "worstRel", max: 0 }              // EXACTLY zero: see the header, this is not a tolerance
            : h.mode === "footprint"
                ? { observable: "footprintSpread", max: 1e-3 }
                : { observable: "slopeErrFrac", max: 1e-3 };
    }
    return h;
}

/** Deterministic jitter -- fillBlock defaults to Math.random, and an unseeded run is not a measurement. */
function lcg(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

/**
 * A settled pool filling the whole cross-section, EXPORTED so a gate drives the same fixture rather than a
 * second spelling of it. `n` overrides the config's cross-section, which is what the footprint sweep varies.
 */
export function settledPool(c, n = c.n) {
    const f = new Flip3D(n, c.ny, n, { h: c.h, gravity: c.gravity, iters: c.iters });
    f.fillBlock(c.h, c.h, c.h, (n - 1) * c.h, (1 + c.depth) * c.h, (n - 1) * c.h, c.per, lcg(c.seed));
    for (let s = 0; s < c.steps; s++) f.step(c.dt);
    return f;
}

/** Pressure straight down the middle column over FLUID-marked cells only -- an AIR cell has no pressure. */
function column(f, n) {
    const i = n >> 1, k = n >> 1, js = [], ps = [];
    for (let j = 0; j < f.ny; j++) {
        const c = f.ci(i, j, k);
        if (f.type[c] !== FLUID) continue;
        js.push(j); ps.push(f.p[c]);
    }
    if (js.length < 4) return null;
    const mj = js.reduce((a, b) => a + b, 0) / js.length, mp = ps.reduce((a, b) => a + b, 0) / ps.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let t = 0; t < js.length; t++) { sxy += (js[t] - mj) * (ps[t] - mp); sxx += (js[t] - mj) ** 2; syy += (ps[t] - mp) ** 2; }
    return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), bottom: ps[0], cells: js.length };
}

/**
 * The transposed pair: one dam break along x, and THE SAME PARTICLES along z. Exported for the same reason --
 * a transposition built twice is two claims about one experiment.
 */
export function transposedPair(c) {
    const X = new Flip3D(c.n, c.ny, c.n, { h: c.h, gravity: c.gravity, iters: c.iters });
    X.fillBlock(c.h, c.h, c.h, Math.floor(c.n / 2) * c.h, (1 + c.depth) * c.h, (c.n - 1) * c.h, c.per, lcg(c.seed));
    const Z = new Flip3D(c.n, c.ny, c.n, { h: c.h, gravity: c.gravity, iters: c.iters });
    for (let i = 0; i < X.count(); i++) Z.addParticle(X.pz[i], X.py[i], X.px[i], X.pvz[i], X.pvy[i], X.pvx[i]);
    return { X, Z };
}

function lateralStats(f, along) {
    const N = f.count();
    let front = 0, sumAlong = 0, sumH = 0, sumS = 0;
    for (let i = 0; i < N; i++) {
        const a = along === "x" ? f.px[i] : f.pz[i];
        if (a > front) front = a;
        sumAlong += a; sumH += f.py[i];
        sumS += Math.hypot(f.pvx[i], f.pvy[i], f.pvz[i]);
    }
    return { N, front, meanAlong: sumAlong / N, meanHeight: sumH / N, meanSpeed: sumS / N, maxDiv: f.maxDivergence() };
}

const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12));

export async function buildFlip3D(hyp, base = {}) {
    const h = flip3dDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;

    if (h.mode === "isotropy") {
        const { X, Z } = transposedPair(c);
        if (X.count() < 8) return { error: "not-enough-particles (the fill produced nothing to move)" };
        for (let s = 0; s < c.steps; s++) { X.step(c.dt); Z.step(c.dt); }
        const a = lateralStats(X, "x"), b = lateralStats(Z, "z");
        const frontRel = rel(a.front, b.front), meanAlongRel = rel(a.meanAlong, b.meanAlong);
        const meanHeightRel = rel(a.meanHeight, b.meanHeight), maxDivRel = rel(a.maxDiv, b.maxDiv);
        return {
            kind: "isotropy",
            frontRel, meanAlongRel, meanHeightRel, maxDivRel,
            meanSpeedRel: rel(a.meanSpeed, b.meanSpeed),     // a SUM: transposition permutes the additions
            worstRel: Math.max(frontRel, meanAlongRel, meanHeightRel, maxDivRel),
            transposed: a.N === b.N ? a.N : -1,
            particles: a.N, steps: c.steps, iters: c.iters,
        };
    }

    if (h.mode === "footprint") {
        const sizes = [6, 10, 14].filter((n) => n <= 24);
        const rows = sizes.map((n) => ({ n, f: settledPool(c, n) })).map(({ n, f }) => {
            const col = column(f, n);
            return { n, N: f.count(), bottom: col ? col.bottom : NaN };
        });
        if (rows.some((r) => !Number.isFinite(r.bottom))) return { error: "no-column (a pool did not settle where expected)" };
        const b = rows.map((r) => r.bottom);
        return {
            kind: "footprint",
            footprints: rows.map((r) => r.n),
            footprintSpread: (Math.max(...b) - Math.min(...b)) / Math.max(...b),
            massRatio: rows[rows.length - 1].N / rows[0].N,
            bottomPressure: b[0], bottomExact: Math.abs(c.gravity) * c.depth * c.h,
            particles: rows.reduce((s, r) => s + r.N, 0), steps: c.steps, iters: c.iters,
        };
    }

    const f = settledPool(c);
    const col = column(f, c.n);
    if (!col) return { error: "not-enough-fluid-cells-in-column (the pool did not settle where expected)" };
    const slopeExact = c.gravity * c.h;                       // rho = 1: the projection is never handed either
    const bottomExact = Math.abs(c.gravity) * c.depth * c.h;
    return {
        kind: "hydrostatic",
        slopePerCell: col.slope, slopeExact,
        slopeErrFrac: Math.abs(col.slope - slopeExact) / Math.abs(slopeExact),
        linearityR2: col.r2,
        bottomPressure: col.bottom, bottomExact,
        bottomErrFrac: Math.abs(col.bottom - bottomExact) / bottomExact,
        fluidCellsInColumn: col.cells,
        particles: f.count(), steps: c.steps, iters: c.iters,
    };
}

export const flip3dDevice = {
    modes: ["hydrostatic", "isotropy", "footprint"],
    name: "flip3d-hydrostatic",
    observables: FLIP3D_OBSERVABLES,
    build: buildFlip3D,
    defaults: flip3dDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
// device.html lists every name in DEVICE_NAMES from /device/list and runs it, so registering is the door; this
// block is the one that works without a server.
if (import.meta.url === `file://${process.argv[1]}`) {
    const hy = await buildFlip3D({ mode: "hydrostatic" });
    const is = await buildFlip3D({ mode: "isotropy" });
    console.log("[flip3d] THE 3D FLIP/PIC FLUID -- one ported key, and one that cannot be asked in 2D\n");
    console.log("  HYDROSTATIC (flip2d's key, one dimension up -- and it is BLIND to a missing third dimension)");
    console.log("    slope per cell ", hy.slopePerCell.toFixed(6), "vs exact rho*g*h", hy.slopeExact.toFixed(6),
        `(err ${hy.slopeErrFrac.toExponential(2)}, R^2 ${hy.linearityR2.toFixed(6)}, ${hy.fluidCellsInColumn} fluid cells)`);
    console.log("    bottom cell    ", hy.bottomPressure.toFixed(4), "vs exact rho*g*d", hy.bottomExact.toFixed(4),
        `(err ${hy.bottomErrFrac.toExponential(2)})`);
    console.log("\n  ISOTROPY (the 3D key: the same dam break run along x and along z, particle for particle)");
    console.log("    front", is.frontRel.toExponential(3), " meanAlong", is.meanAlongRel.toExponential(3),
        " meanHeight", is.meanHeightRel.toExponential(3), " maxDiv", is.maxDivRel.toExponential(3));
    console.log("    worst", is.worstRel.toExponential(3), "-- BIT-IDENTICAL, not 'small'. meanSpeed differs at",
        is.meanSpeedRel.toExponential(3), "(one ulp: it is a SUM and transposition permutes the additions).");
    console.log("\n  WHY BOTH: the divergence dropping its z term leaves the hydrostatic column PERFECT");
    console.log("  (-9.810005, R^2 1.000000) and moves isotropy to 2.5e-1. Halving the pressure scale in ALL");
    console.log("  THREE axes leaves isotropy at EXACTLY 0 and moves the slope to -9.625245. A symmetric error");
    console.log("  moves the MAGNITUDE; an asymmetric one moves the AXES. NOT CLAIMED: that flip3d is correct.");
}
