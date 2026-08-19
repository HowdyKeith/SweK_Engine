// tools/ship/loopMetric.mjs -- v3746
//
// *** STEP 2 OF THE SIX: A METRIC THAT IS NOT THE REFEREE. *** v3742 measured why "optimise the suite runtime"
// is the wrong target -- the top 5 gates are 51.2% of the time, all five are physics runs, and they are slow
// BECAUSE they take many steps on fine grids. There "make it faster" IS "make it do less", so a loop
// optimising gate runtime would be optimising the referee. This is the shape that is not.
//
// *** THE METRIC IS ITERATIONS TO A TOLERANCE THE CALLER SUPPLIES, AND THE TOLERANCE IS NEVER THE SOLVER'S TO
// CHOOSE. PoissonMG3D.solveCG already takes `tol` as an option and reports .iters and .res, so the separation
// is real rather than a convention: the GATE names the tolerance, the SOLVER reports what it took, and this
// harness REFUSES THE RUN IF THE RESIDUAL DOES NOT ACTUALLY MEET IT. Fewer iterations bought by stopping early
// is not a better score -- it is NO SCORE. ***
//
// THAT REFUSAL IS THE WHOLE POINT AND IT IS ASSERTED BOTH WAYS in the gate: an honest solve scores, and a
// solver planted to stop early takes FEWER iterations and scores NOTHING. A metric that merely counted
// iterations would have rewarded the plant.
//
// *** AND THE SCORE IS null, NOT Infinity, WHEN THE RUN FAILS. A large sentinel would make "did not converge"
// sortable against real results, and any loop that minimises would then treat a broken solver as merely bad
// rather than as disqualified. UNKNOWN IS NOT A DEFAULT -- the same rule claimCheck's UNCHECKABLE and
// frozenReferee's UNPAIRED are built on. ***
//
// DETERMINISM IS A PRECONDITION, NOT A NICETY (step 4). The fixture is a fixed analytic divergence field with
// no RNG anywhere, so repeated runs must return the SAME iteration count exactly -- not "close". If it ever
// varies, a loop would be optimising noise, and the right response is to find the nondeterminism, NOT to
// average it away. The gate asserts exact repeatability.
//
// WHAT THIS IS NOT: a benchmark of wall-clock time. Time is not used here at all, deliberately -- the sandbox
// is one core and a runtime measured on it is not a runtime for the rig (v3742). ITERATIONS ARE MACHINE-
// INDEPENDENT; seconds are not.

import { PoissonMG3D, AIR, FLUID, SOLID } from "../../fluid/multigrid3d.mjs";

/**
 * The fixture. Deliberately the SAME domain the existing multigrid3d gate uses, so the metric measures the
 * problem the tree already grades rather than a second one invented here for flattering numbers.
 */
export function fixture(n) {
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
 * *** THE PER-ITERATION COST SIGNATURE, AND IT EXISTS TO REFUSE A COMPARISON RATHER THAN TO SCORE ONE.
 *
 * v3746 measured iterations to a tolerance and called that the metric. ASKING KEITH'S STEP-0 QUESTION EXPOSED
 * THE GAP: pre 3 / post 3 finishes in 29 iterations against the shipped 36 -- a gain of 7 against a floor of
 * 3, ACCEPTED -- while doing HALF AGAIN AS MUCH SMOOTHING INSIDE EVERY ITERATION. A parameter search would
 * have found that on its first pass and banked it as a win.
 *
 * THE OBVIOUS FIX WAS TRIED AND FALSIFIED IN THE SAME ROUND: a cost model derived from the solver's own level
 * sizes -- sum over levels of (pre+post) x cells, plus the coarse solve, plus CG's fine apply. MEASURED
 * AGAINST WALL TIME ON ONE CORE: pre4/post4 models at 4.49M against pre2/post2's 3.30M (36% MORE WORK) AND RUNS
 * IN THE SAME 487 ms vs 510 ms. THE MODEL DOES NOT PREDICT THE TIME, SO IT MUST NOT SCORE. Wall time is the
 * thing that would, and it is machine-dependent on a one-core box -- the mirror this stack has refused since
 * v3746.
 *
 * *** SO THE SIGNATURE IS USED ONLY FOR THE ONE JUDGEMENT IT CAN MAKE RELIABLY: DID THE PER-ITERATION COST
 * CHANGE AT ALL? That is robust even where the magnitude is wrong, and it is enough to refuse the comparison.
 * TWO RUNS ARE ONLY COMPARABLE ON ITERATIONS IF AN ITERATION COSTS THE SAME IN BOTH -- the same rule as the
 * tolerance check one level down. A candidate that changes the smoothing schedule is NOT a faster solver, it
 * is A DIFFERENT SOLVER, and comparing their iteration counts is comparing two things wearing one label. ***
 */
export function costSignature(spec = {}) {
    const n = spec.n || 24;
    const o = spec.opts || { pre: 2, post: 2 };
    const mg = new PoissonMG3D(n, n, n, o);
    const cells = mg.levels.map((L) => L.type.length);
    // Derived from the solver's OWN level structure, never typed. Reported as parts so a reader can see what
    // moved rather than only that something did.
    return { sweeps: mg.pre + mg.post, levels: cells.length, coarseIters: mg.coarseIters,
             cells: cells.join("/"), key: [mg.pre + mg.post, cells.length, mg.coarseIters, cells.join("/")].join(":") };
}

/**
 * @param {{n:number, tol:number, maxIters:number, opts:object}} spec -- TOL AND MAXITERS COME FROM THE CALLER.
 * @returns {{ score:number|null, iters:number, res:number, tol:number, met:boolean, reason:string }}
 *   score = iterations, and ONLY when the residual actually reached the tolerance. null otherwise.
 */
export function measure(spec = {}) {
    const n = spec.n || 24;
    const tol = spec.tol != null ? spec.tol : 1e-8;
    const maxIters = spec.maxIters || 400;
    const { type, div, N } = fixture(n);
    const mg = new PoissonMG3D(n, n, n, spec.opts || { pre: 2, post: 2 });
    const p = new Float32Array(N);
    mg.solveCG(type, div, 1 / 60, p, { maxIters, tol });
    const iters = mg.iters, res = mg.res;

    // *** THE RESIDUAL IS RE-CHECKED AGAINST THE CALLER'S TOLERANCE HERE, NOT TRUSTED FROM THE LOOP EXIT. The
    // solver breaks when ITS `tol` is met, and a solver edited to loosen that internal test would exit early
    // and still report a small `it`. Reading .res and comparing it to the tolerance THE CALLER ASKED FOR is
    // what makes the plant visible: the iteration count drops and the residual does not meet the bar. ***
    const met = Number.isFinite(res) && res <= tol;
    if (!met) {
        return { score: null, iters, res, tol, met: false, cost: costSignature(spec).key,
                 reason: iters >= maxIters ? "hit maxIters without reaching tol" : "stopped before the residual met tol" };
    }
    return { score: iters, iters, res, tol, met: true, reason: "", cost: costSignature(spec).key };
}

/** Repeat the identical measurement. A deterministic fixture must return an IDENTICAL count every time. */
export function repeat(spec, times = 3) {
    const runs = [];
    for (let i = 0; i < times; i++) runs.push(measure(spec));
    const counts = [...new Set(runs.map((r) => r.iters))];
    return { runs, deterministic: counts.length === 1, counts };
}

/**
 * *** THE ACCEPT RULE, AND IT IS WHERE A LOOP WOULD CHEAT IF IT COULD. A candidate beats the baseline only if
 * it MET THE TOLERANCE and took strictly fewer iterations. A candidate that did not converge is REJECTED
 * OUTRIGHT rather than compared -- never "worse", which would let a minimiser walk toward it. ***
 */
export function better(baseline, candidate, floor) {
    // *** v3748 -- `floor` IS REQUIRED AND THERE IS NO DEFAULT. v3746's rule accepted ANY strictly-fewer count,
    // and tools/ship/loopNoise.mjs then measured that the iteration count moves 33..38 (sd 1.50) across eight
    // fixtures of the same kind -- SO 36 -> 35 WOULD HAVE BEEN ACCEPTED AS A WIN WHILE BEING SMALLER THAN THE
    // SPREAD BETWEEN PROBLEMS. A default of 0 would have reproduced exactly that, silently, for any caller who
    // did not know to pass one. THROWING BY NAME IS THE POINT: the caller must say what counts as real. ***
    if (typeof floor !== "number" || !Number.isFinite(floor) || floor < 0) {
        throw new Error("better(baseline, candidate, floor): floor is required -- get it from " +
                        "tools/ship/loopNoise.mjs floorIters(). An improvement smaller than the fixture spread " +
                        "is not an improvement, and a default would hide that.");
    }
    if (!candidate || candidate.score === null) return { accept: false, why: "candidate did not meet tol: " + (candidate && candidate.reason) };
    if (!baseline || baseline.score === null) return { accept: true, why: "baseline had no valid score" };
    if (candidate.tol !== baseline.tol) return { accept: false, why: "different tolerance -- not comparable" };
    // *** v3752 -- AND THE SAME REFUSAL FOR COST. If the two runs do not cost the same per iteration, their
    // iteration counts are not comparable, and no floor can rescue that -- the comparison is wrong before the
    // arithmetic starts. Callers that do not carry a signature are unchanged (both undefined compares equal),
    // so this tightens the rule without silently changing every existing caller's verdict. ***
    if (baseline.cost !== undefined && candidate.cost !== undefined && baseline.cost !== candidate.cost) {
        return { accept: false, why: "different per-iteration cost (" + baseline.cost + " vs " + candidate.cost +
                                     ") -- not comparable on iterations. A candidate that changes the smoothing " +
                                     "schedule is a DIFFERENT SOLVER, not a faster one." };
    }
    const gain = baseline.score - candidate.score;
    return gain >= floor
        ? { accept: true, gain, why: baseline.score + " -> " + candidate.score + " iterations at tol " + candidate.tol + " (gain " + gain + " >= floor " + floor + ")" }
        : { accept: false, gain, why: "gain " + gain + " is inside the noise floor " + floor + " (" + baseline.score + " -> " + candidate.score + ")" };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const r = measure({ n: 24, tol: 1e-8 });
    console.log("[loopMetric] n=24 tol=1e-8 -> " + (r.score === null ? "NO SCORE (" + r.reason + ")" : r.score + " iterations")
                + "   residual " + r.res.toExponential(3));
    const d = repeat({ n: 24, tol: 1e-8 }, 3);
    console.log("[loopMetric] deterministic across 3 runs: " + d.deterministic + "   counts " + d.counts.join(","));
}
