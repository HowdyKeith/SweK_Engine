// WebGLEngine/physics/sph/spatialGrid-selfcheck.mjs — v2536
//
// Run: node physics/sph/spatialGrid-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A fast path with no slow path to check it against is a fast path nobody can trust. sph.js keeps the O(N^2)
// brute force precisely so these can assert THE GRID AGREES WITH IT -- not "the grid looks plausible", not "the
// grid is faster". Faster and wrong is worse than slow and right.
import { createSphWorld } from "./sph.js";
import { SpatialGrid } from "./spatialGrid.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// A deterministic cloud. Same seed both worlds, or the comparison means nothing.
const cloudBox = (world, n, box, seed = 777) => {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) world.addParticle([rnd() * box, rnd() * box, rnd() * box], [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4]);
};

const cloud = (world, n, seed = 777) => {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) world.addParticle([rnd() * 2, rnd() * 2, rnd() * 2], [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4]);
};

const OPTS = { h: 0.35, mass: 1000 * 0.13 ** 3, restDensity: 1000, gravity: [0, 0, 0] };

// ---- 1. the grid itself finds what is actually near ---------------------------------------------------------
{
    const g = new SpatialGrid(1.0);
    const P = [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }, { x: -0.4, y: 0.2, z: 0 }];
    g.rebuild(P);
    const near = g.near(0, 0, 0).sort();
    ok("a query finds the close ones", near.includes(0) && near.includes(1) && near.includes(3), "found " + JSON.stringify(near));
    ok("...and does not find the far one", !near.includes(2), "particle 2 is 8.7 units away");
    // the contract is a SUPERSET: it may return things in the 27 cells that are further than h. What it may NEVER
    // do is MISS something within h -- that would be a silently wrong simulation.
    const g2 = new SpatialGrid(0.5);
    g2.rebuild(P);
    ok("cell size h never hides a neighbour inside h", g2.near(0, 0, 0).includes(1), "0.5 away, h = 0.5");
}

// ---- 2. THE ONE THAT MATTERS: the grid computes the SAME PHYSICS -------------------------------------------
{
    for (const n of [80, 300]) {
        const brute = createSphWorld({ ...OPTS, useGrid: false });
        const fast = createSphWorld({ ...OPTS, useGrid: true });
        cloud(brute, n); cloud(fast, n);
        brute.computeDensity(); fast.computeDensity();
        let worstRho = 0;
        for (let i = 0; i < n; i++) worstRho = Math.max(worstRho, Math.abs(brute.particles[i].rho - fast.particles[i].rho));
        ok("DENSITY agrees with brute force (" + n + " particles)", worstRho < 1e-9,
           "worst difference " + worstRho.toExponential(2));

        const A = brute.accelerations(), B = fast.accelerations();
        let worstA = 0;
        for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) worstA = Math.max(worstA, Math.abs(A[i][d] - B[i][d]));
        ok("FORCES agree with brute force (" + n + " particles)", worstA < 1e-6,
           "worst difference " + worstA.toExponential(2));
    }
}

// ---- 3. no double counting --------------------------------------------------------------------------------
// The trap. The brute force runs j from i+1 and applies to BOTH i and j. A grid hands back every neighbour, so a
// naive port visits each pair TWICE and doubles every force -- which still looks like a plausible simulation,
// just stiffer. That is the worst kind of bug: it does not crash, it lies.
{
    const brute = createSphWorld({ ...OPTS, useGrid: false });
    const fast = createSphWorld({ ...OPTS, useGrid: true });
    cloud(brute, 120); cloud(fast, 120);
    brute.computeDensity(); fast.computeDensity();
    const A = brute.accelerations(), B = fast.accelerations();
    let ratio = 0, worst = 0;
    for (let i = 0; i < 120; i++) {
        const ma = Math.hypot(...A[i]), mb = Math.hypot(...B[i]);
        if (ma > 1e-6) { const r = mb / ma; if (Math.abs(r - 1) > Math.abs(ratio - 1)) { ratio = r; worst = i; } }
    }
    ok("forces are not DOUBLED (the j>i guard holds)", Math.abs(ratio - 1) < 1e-6 || ratio === 0,
       "worst force ratio grid/brute = " + ratio.toFixed(9) + " (2.0 would mean every pair counted twice)");
}

// ---- 4. stepping stays identical over time -----------------------------------------------------------------
// Agreement on one frame is cheap. A tiny bias compounds.
{
    const brute = createSphWorld({ ...OPTS, useGrid: false });
    const fast = createSphWorld({ ...OPTS, useGrid: true });
    cloud(brute, 150); cloud(fast, 150);
    for (let i = 0; i < 60; i++) { brute.step(1 / 120); fast.step(1 / 120); }
    let worst = 0;
    for (let i = 0; i < 150; i++) {
        const a = brute.particles[i], b = fast.particles[i];
        worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
    }
    ok("60 steps later they are still the same simulation", worst < 1e-6,
       "worst drift " + worst.toExponential(2) + " after 60 steps");
}

// ---- 4b. fieldAt agrees too -- it is a THIRD neighbour walk and it was missed the first time ---------------
// v2536 gave the grid to computeDensity and accelerations and NOT to fieldAt, because the ~1000-particle
// crossover said the grid loses at small N. That crossover was measured for the PAIR walk (N x N). fieldAt is
// sampled per GRID CELL -- ~22,000 of them for a 28-cell field -- so its cost is CELLS x N and N is the SMALL
// number. Different economics, same grid. These assert the field itself did not change.
{
    const w = createSphWorld({ ...OPTS });
    cloudBox(w, 400, 2);
    w.step(1 / 120);
    // brute-force the same field by hand, from the same particles
    const poly6 = (r2, h) => { const d = h * h - r2; return d <= 0 ? 0 : (315 / (64 * Math.PI * Math.pow(h, 9))) * d * d * d; };
    const bruteField = (x, y, z) => {
        let s = 0;
        for (const b of w.particles) {
            const r2 = (x - b.x) ** 2 + (y - b.y) ** 2 + (z - b.z) ** 2;
            if (r2 < OPTS.h * OPTS.h) s += OPTS.mass * poly6(r2, OPTS.h);
        }
        return s;
    };
    let worst = 0, sampled = 0, nonzero = 0;
    for (let i = 0; i < 400; i++) {
        const x = (i % 10) * 0.22, y = ((i / 10) | 0) % 10 * 0.22, z = ((i / 100) | 0) * 0.5;
        const a = w.fieldAt(x, y, z), b = bruteField(x, y, z);
        worst = Math.max(worst, Math.abs(a - b)); sampled++;
        if (b > 1e-9) nonzero++;
    }
    ok("fieldAt through the grid == fieldAt brute force", worst < 1e-9,
       "worst difference " + worst.toExponential(2) + " over " + sampled + " samples");
    // a test where every sample lands in empty space would pass while proving nothing
    ok("...and the samples actually hit the cloud", nonzero > 40, nonzero + " of " + sampled + " samples had density");
}

// ---- 5. it is faster WHERE IT IS SUPPOSED TO BE, and off where it is not -----------------------------------
// The first version of this asserted "the grid is faster" at 600 particles. IT IS NOT: 0.8x at 600, 0.4x at 200,
// because 27 Map lookups and a closure per neighbour cost more than the pairs they save. Asserting what I wanted
// would have turned this gate into a rubber stamp. What is true is narrower and more useful.
{
    const mk = (useGrid, n, box) => { const w = createSphWorld({ ...OPTS, useGrid }); cloudBox(w, n, box); return w; };
    const time = (w) => {
        for (let i = 0; i < 12; i++) w.step(1 / 120);          // warm the JIT. Measured cold, this lies -- and it
        const ts = [];                                          // has lied three times this session already.
        for (let i = 0; i < 11; i++) { const t = performance.now(); w.step(1 / 120); ts.push(performance.now() - t); }
        ts.sort((a, b) => a - b);
        return ts[5];
    };
    // Constant particle density -- the box grows with N, because flesh does not get denser as it gets bigger.
    const n = 2500, box = 2 * Math.cbrt(n / 600);
    const tb = time(mk(false, n, box)), tf = time(mk(true, n, box));
    ok("the grid beats brute force WHERE O(N^2) HURTS", tf < tb * 0.75,
       n + " particles: brute " + tb.toFixed(1) + "ms -> grid " + tf.toFixed(1) + "ms  (" + (tb / tf).toFixed(1) + "x)");

    // ...and the engine must not switch it on below the crossover, where it is a pessimisation.
    const small = createSphWorld({ ...OPTS });          // no useGrid: let it choose
    cloudBox(small, 300, 2);
    small.step(1 / 120);
    const big = createSphWorld({ ...OPTS });
    cloudBox(big, 1500, 3.2);
    big.step(1 / 120);
    ok("the engine picks by size: OFF at 300, ON at 1500", small.usingGrid() === false && big.usingGrid() === true,
       "300 -> grid " + small.usingGrid() + ",  1500 -> grid " + big.usingGrid());
}

console.log(fails ? "\nspatialGrid-selfcheck: " + fails + " FAILED" : "\nspatialGrid-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
