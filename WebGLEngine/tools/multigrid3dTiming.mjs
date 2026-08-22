// WebGLEngine/tools/multigrid3dTiming.mjs -- v3355
//
// *** A TIMING HARNESS WHOSE FIRST DUTY IS TO SAY "THESE TWO ARE INDISTINGUISHABLE". ***
//
// v3354 asked whether multigrid3d's V-cycle parameters had headroom. I ran one trial per config and got a table
// that RANKED THEM -- and one row was impossible: `coarseIters: 200` does strictly MORE work per preconditioner
// application, reported the IDENTICAL iteration count (46), and came out 12% faster. That cannot be true. One
// cold trial per config, in one process, with JIT warm-up landing wherever it lands, IS AN ANECDOTE THAT LOOKS
// LIKE A MEASUREMENT -- and I nearly reported pre3/post3 as an 8% win off it.
//
// multigrid.html already learned this on the 2D side and wrote it down: "A single cold pair made the gather path
// look 1.45x FASTER than scatter", which is why that page has a warm-up control defaulting to 3. THIS BRINGS THE
// SAME DISCIPLINE TO 3D AND ADDS THE PART THAT PAGE DOES NOT HAVE: A REFUSAL TO RANK WHAT IT CANNOT SEPARATE.
//
// THE ANSWER KEY IS A NULL TEST, AND IT IS THE THING ALMOST NO BENCHMARK HAS. Run the SAME config twice under
// two labels. A harness that reports a winner there is measuring its own noise, and every other number it
// produces is suspect. That is checkable, cheap, and fails loudly -- unlike "is 8% real", which needs a prior.
//
// TWO THINGS DELIBERATELY NOT DONE:
//   NO STATISTICAL TEST. n is small and the distribution is not normal (JIT, GC, thermal). The separation rule
//   is a SPREAD COMPARISON: two configs are distinguishable only if their [min, p95] bands do not overlap. That
//   is conservative and it is arithmetic, not a p-value nobody here can defend.
//   NO ITERATION RANKING. Iterations are not work -- v3354 measured pcCycles:2 taking 30% FEWER iterations and
//   10% MORE wall time. Both are reported and the harness refuses to call the iteration column a result.
import { PoissonMG3D, AIR, FLUID, SOLID } from "../fluid/multigrid3d.mjs";
import { stats } from "../brain/bench.mjs";   // REUSED, not re-derived: a second median is a second truth

/** The physical FLIP domain from multigrid3d-selfcheck: solid shell, AIR lid, structured divergence. */
export function domain(n) {
    const N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = i + n * (j + n * k);
        const wall = (i === 0 || j === 0 || k === 0 || i === n - 1 || k === n - 1);
        type[c] = wall ? SOLID : (j >= n - 3 ? AIR : FLUID);
        if (type[c] === FLUID) div[c] = Math.sin(Math.PI * i / n) * Math.sin(2 * Math.PI * j / n) * Math.sin(3 * Math.PI * k / n);
    }
    return { type, div, N };
}

/**
 * Time one config. `warm` runs are executed AND DISCARDED, and the count is returned so a reader can see it --
 * a discarded warm-up that is not reported is indistinguishable from no warm-up at all.
 */
export function timeConfig(n, opts = {}, solveOpts = {}, { trials = 5, warm = 2 } = {}) {
    const { type, div, N } = domain(n);
    const p = new Float32Array(N);
    const once = () => {
        const mg = new PoissonMG3D(n, n, n, opts);
        const t = Date.now();
        mg.solveCG(type, div, 1 / 60, p, Object.assign({ maxIters: 400, tol: 1e-8 }, solveOpts));
        return { ms: Date.now() - t, iters: mg.iters, res: mg.res };
    };
    for (let i = 0; i < warm; i++) once();
    const runs = [];
    for (let i = 0; i < trials; i++) runs.push(once());
    const s = stats(runs.map((r) => r.ms));
    return { n, trials, warm, iters: runs[0].iters, res: runs[0].res, ...s, runs: runs.map((r) => r.ms) };
}

/**
 * *** SEPARATED ONLY IF THE BANDS DO NOT OVERLAP. *** [min, p95] rather than mean +/- something, because the
 * fast tail is the one the machine can actually reach and the slow tail is scheduling noise. Returns null for
 * "cannot tell", which is a first-class answer here rather than a failure to produce one.
 */
export const UNUSABLE_SPREAD = 1.35;

/**
 * *** A RUN WHOSE OWN BAND IS WIDER THAN THE DIFFERENCE IT CLAIMS TO DETECT CANNOT SUPPORT ANY VERDICT, and
 * that refusal is why this is here at all. *** The null test failed once during v3355 with A spanning
 * [147..247] -- a 1.68x spread from a single GC or JIT outlier -- against a tight B, and correctly reported the
 * same config as separated from itself. Re-measured, 0 of 3 attempts separated at five different
 * warm-up/trial/size settings, SO THE PROBLEM WAS NOT INSUFFICIENT WARM-UP AND BUMPING THE COUNT WOULD HAVE
 * BEEN TUNING UNTIL GREEN. An intermittently failing gate is worse than no gate: it teaches people to re-run.
 * A clean 24^3 run bands at 1.15x; the outlier was 1.68x. Anything past 1.35x is called unusable and separates
 * from nothing.
 */
export function usable(t) { return t.min > 0 && t.p95 / t.min <= UNUSABLE_SPREAD; }

export function separated(a, b) {
    if (!usable(a) || !usable(b)) return null;   // refuse, rather than rank on a band that wide
    if (a.p95 < b.min) return { faster: "a", byMs: b.min - a.p95 };
    if (b.p95 < a.min) return { faster: "b", byMs: a.min - b.p95 };
    return null;
}

/** Rank a set of configs, refusing to order any pair the bands cannot separate. */
export function compare(labelled) {
    const pairs = [];
    for (let i = 0; i < labelled.length; i++) for (let j = i + 1; j < labelled.length; j++) {
        const s = separated(labelled[i].t, labelled[j].t);
        pairs.push({ a: labelled[i].label, b: labelled[j].label,
                     verdict: s ? (s.faster === "a" ? labelled[i].label : labelled[j].label) + " faster by >=" + s.byMs + "ms"
                               : "INDISTINGUISHABLE" });
    }
    return pairs;
}

// FRONT DOOR: prints and exits zero, so it is a REPORTING tool on tools.html rather than a gate.
// A measurement is not a pass or a fail, and dressing one up as a gate invites tuning the threshold until green.
if (process.argv[1] && process.argv[1].endsWith("multigrid3dTiming.mjs")) {
    const n = 24;
    const cfgs = [
        ["pre2 post2 (shipped)", { pre: 2, post: 2 }, {}],
        ["pre1 post1", { pre: 1, post: 1 }, {}],
        ["pre3 post3", { pre: 3, post: 3 }, {}],
        ["omega 1.2", { pre: 2, post: 2, omega: 1.2 }, {}],
        ["pcCycles 2", { pre: 2, post: 2 }, { pcCycles: 2 }],
    ];
    console.log("");
    console.log("[multigrid3dTiming] 3D V-cycle configs at " + n + "^3 -- tools/multigrid3dTiming.mjs");
    const L = cfgs.map(([label, o, s]) => ({ label, t: timeConfig(n, o, s, { trials: 5, warm: 2 }) }));
    console.log("  " + L[0].t.warm + " warm-up runs DISCARDED, " + L[0].t.trials + " timed. Reported so a discarded warm-up is not mistaken for none.");
    console.log("");
    console.log("  config                  iters    min  median   p95");
    for (const x of L) console.log("  " + x.label.padEnd(22) + String(x.t.iters).padStart(5) +
        String(x.t.min).padStart(7) + String(x.t.median).padStart(8) + String(x.t.p95).padStart(6));
    console.log("");
    console.log("  ITERATIONS ARE NOT WORK. Both columns are printed and only the TIME is ranked.\n  A config whose own [min,p95] band spans more than " + UNUSABLE_SPREAD + "x is UNUSABLE and separates from nothing.");
    console.log("");
    for (const p of compare(L)) console.log("  " + (p.a + " vs " + p.b).padEnd(52) + p.verdict);
    console.log("");
    const a = timeConfig(n, { pre: 2, post: 2 }, {}, { trials: 5, warm: 2 });
    const b = timeConfig(n, { pre: 2, post: 2 }, {}, { trials: 5, warm: 2 });
    console.log("  NULL TEST -- the same config under two labels: " +
        (separated(a, b) ? "*** SEPARATED. THIS HARNESS IS MEASURING ITS OWN NOISE AND EVERY VERDICT ABOVE IS SUSPECT. ***"
                         : "indistinguishable, as it must be."));
    console.log("");
    process.exit(0);
}
