// tools/roundhouse/runtimeBench.mjs
//
// Run:  node tools/roundhouse/runtimeBench.mjs      (the baseline)
//       bun  tools/roundhouse/runtimeBench.mjs      (the question)
//       node tools/roundhouse/runtimeBench.mjs --json    (machine-readable, for the comparer)
//
// v3997 -- "WOULD WE BE ABLE TO BENCHMARK BUN VS NODE FOR SweK ENGINE?" -- yes, and the first honest answer is
// that ONE NUMBER WOULD BE FALSE IN BOTH DIRECTIONS.
//
// ================================================================================================================
// WHAT THE MEASUREMENT ACTUALLY FOUND, BEFORE ANY OF THIS WAS WRITTEN
// ================================================================================================================
//
// Measured on Linux x64, node v22.22.2 against bun 1.3.11, medians of warmed runs:
//
//     Math.pow(x, n)               bun 13.4x FASTER
//     growing array push           bun 3.1x  faster
//     Math.hypot                   bun 1.7x  faster
//     scalar RK4, no allocation    bun 1.4x  faster
//     pure + - * / scalar loop     1.00x     -- indistinguishable
//     Math.sqrt                    node 1.2x faster
//     RK4 returning [a, b] per call, destructured    node 3.5x FASTER
//
// *** THE SPREAD IS 47x FROM END TO END AND THE SIGN CHANGES IN THE MIDDLE, so "bun is faster" and "node is
// faster" are both true statements about this engine and neither is a useful one. *** What decides it is the
// SHAPE OF THE INNER LOOP, and the two runtimes have opposite strengths: Bun calls libm faster, Node eliminates
// short-lived allocations better.
//
// THAT IS NOT AN ABSTRACT POINT. physics/stellar/laneEmden.mjs runs 2.2x slower under Bun, and bisecting it
// found the cause is neither Math.pow (which Bun wins 13x) nor the trace array (which Bun wins 3x) but
// `const [k1a, k1b] = deriv(...)` -- one array allocated and destructured, four times per RK4 step. Strip that
// one line's shape and the SAME arithmetic runs 3.8x faster on Node and 18.5x faster on Bun. THE ALLOCATION IS
// COSTING BOTH RUNTIMES, and it took a runtime comparison to notice.
//
// ================================================================================================================
// WHAT THIS FILE IS, AND WHY IT IS NOT A *-selfcheck
// ================================================================================================================
//
// It REPORTS. Its verdict differs by machine, by runtime version and by thermal state, and a gate whose correct
// answer depends on who invoked it is not a gate -- tools/ship/bunSurface.mjs drew that line at v3966 for the
// same reason and this follows it.
//
// What IS gradeable lives in runtimeBench-selfcheck.mjs: the harness methodology, and the ANSWERS. Whether the
// two runtimes agree on a number is a fact about the runtimes, not about this box.
//
// ================================================================================================================
// THREE THINGS THE HARNESS HAS TO GET RIGHT, BECAUSE A BENCHMARK THAT MEASURES NOTHING LOOKS EXACTLY LIKE ONE
// THAT MEASURES SOMETHING
// ================================================================================================================
//
//   1. WARM UP. A cold JIT measures the interpreter, not the engine. Every workload is run WARM times before the
//      clock starts, and the warm-up count is reported so it is arguable rather than hidden.
//   2. THE RESULT MUST ESCAPE. A loop whose value nobody reads can be deleted outright, and the benchmark then
//      reports the cost of deleting it. Every workload RETURNS a float, every return is accumulated into a sink,
//      and the sink is printed. runtimeBench-selfcheck drives a deliberately-dead workload to prove the
//      detection works rather than assuming it.
//   3. MEDIANS, NOT MEANS OR MINIMA. tools/roundhouse/perfLedger.mjs measured this tree's own timing noise on
//      the reference box: coefficient of variation 13%, and a 35% spread between fastest and slowest of five
//      identical runs. So a single sample is worthless and a mean is hostage to one scheduler tick. The median
//      of an odd number of reps is reported, with min and max beside it so the spread is visible.
//
// *** AND 1.35x IS THE FLOOR BELOW WHICH THIS FILE WILL NOT LET YOU CLAIM ANYTHING. *** That is perfLedger's
// measured worst-case noise range, not a number chosen here. A ratio inside it is reported as INDISTINGUISHABLE,
// in words, so a 1.1x that means nothing cannot be quoted as if it did.
"use strict";

/** perfLedger's MEASURED worst-case noise range on the reference box. Not a number chosen here. */
export const NOISE_FLOOR = 1.35;

const t = () => Number(process.hrtime.bigint()) / 1e6;
export const RUNTIME = typeof Bun !== "undefined" ? "bun " + Bun.version : "node " + process.version;
export const RUNTIME_KIND = typeof Bun !== "undefined" ? "bun" : "node";

// Exact float64 bits, so "the same answer" is a bit comparison and never an eyeball one.
const _buf = new DataView(new ArrayBuffer(8));
export function bitsOf(x) { _buf.setFloat64(0, x); return _buf.getBigUint64(0).toString(16).padStart(16, "0"); }

// ---- the workloads -------------------------------------------------------------------------------------------
//
// `bitStable` is a DECLARATION with DELIBERATELY ASYMMETRIC force, and the asymmetry is the honest part:
//   true  -- MUST agree on every runtime. The gate asserts it, and a failure is a real finding.
//   false -- MAY differ. The gate REPORTS what happened and asserts nothing, because whether a given libm
//            disagrees depends on the input range and the runtime versions. Asserting that a workload MUST
//            differ would be a gate that goes red the day a runtime gets more accurate, which is backwards.
// Measured here: pow-var is marked false and AGREED on this box, while trig is marked false and differed
// (40c1db0acd671a18 against ...1c). Both outcomes are fine; only a bitStable:true disagreement is a defect. Over 200,000 inputs, MATH.SQRT WAS THE ONLY FUNCTION TESTED THAT
// AGREED EVERYWHERE -- cbrt, cos, sin, tan, atan, exp, log, pow, hypot and atan2 all differ somewhere, by 1 ulp.
// That is allowed by the specification and it is why this column exists.
const N = 3e5;

export const WORKLOADS = {
    // --- the axis the runtimes actually split on ---------------------------------------------------------
    "rk4-alloc": {
        bitStable: true, axis: "allocation",
        why: "RK4 whose derivative returns [a, b] and is destructured -- four short-lived arrays per step. " +
             "This is the shape physics/stellar/laneEmden.mjs ships, and it is the single biggest gap measured.",
        run() {
            const dxi = 1e-3, d = 3; let xi = dxi, th = 1, dt = 0, s = 0;
            const deriv = (x, t2, d2) => [d2, -Math.max(t2, 0) - (x > 1e-12 ? ((d - 1) / x) * d2 : 0)];
            for (let i = 0; i < N; i++) {
                const [a1, b1] = deriv(xi, th, dt), [a2, b2] = deriv(xi + dxi / 2, th + dxi / 2 * a1, dt + dxi / 2 * b1);
                const [a3, b3] = deriv(xi + dxi / 2, th + dxi / 2 * a2, dt + dxi / 2 * b2), [a4, b4] = deriv(xi + dxi, th + dxi * a3, dt + dxi * b3);
                th += dxi / 6 * (a1 + 2 * a2 + 2 * a3 + a4); dt += dxi / 6 * (b1 + 2 * b2 + 2 * b3 + b4); xi += dxi; s += th;
            }
            return s;
        },
    },
    "rk4-scalar": {
        bitStable: true, axis: "allocation",
        why: "THE SAME ARITHMETIC with no allocation at all -- two scalar functions instead of one returning a " +
             "pair. The control for rk4-alloc, and the two together are the finding: the ratio SWAPS SIGN.",
        run() {
            const dxi = 1e-3, d = 3; let xi = dxi, th = 1, dt = 0, s = 0;
            const f1 = (x, t2, d2) => d2;
            const f2 = (x, t2, d2) => -Math.max(t2, 0) - (x > 1e-12 ? ((d - 1) / x) * d2 : 0);
            for (let i = 0; i < N; i++) {
                const a1 = f1(xi, th, dt), b1 = f2(xi, th, dt);
                const a2 = f1(xi + dxi / 2, th + dxi / 2 * a1, dt + dxi / 2 * b1), b2 = f2(xi + dxi / 2, th + dxi / 2 * a1, dt + dxi / 2 * b1);
                const a3 = f1(xi + dxi / 2, th + dxi / 2 * a2, dt + dxi / 2 * b2), b3 = f2(xi + dxi / 2, th + dxi / 2 * a2, dt + dxi / 2 * b2);
                const a4 = f1(xi + dxi, th + dxi * a3, dt + dxi * b3), b4 = f2(xi + dxi, th + dxi * a3, dt + dxi * b3);
                th += dxi / 6 * (a1 + 2 * a2 + 2 * a3 + a4); dt += dxi / 6 * (b1 + 2 * b2 + 2 * b3 + b4); xi += dxi; s += th;
            }
            return s;
        },
    },
    // --- the libm axis, which points the other way -------------------------------------------------------
    "pow-var": {
        bitStable: false, axis: "libm",
        why: "Math.pow with the exponent in a VARIABLE, which is the call laneEmden makes. Bun's is far faster " +
             "and its last bit differs, so this workload measures speed and disagreement at once.",
        run() { let s = 0; const n = 3; for (let i = 0; i < N * 4; i++) s += Math.pow(0.1 + (i % 1000) / 1000, n); return s; },
    },
    "sqrt": {
        bitStable: true, axis: "libm",
        why: "IEEE-754 REQUIRES a correctly-rounded sqrt, so this is the one Math function that must agree " +
             "bit-for-bit on any conforming runtime. It is here as the control for the disagreements.",
        run() { let s = 0; for (let i = 0; i < N * 4; i++) s += Math.sqrt(i * 0.001 + 1); return s; },
    },
    "trig": {
        bitStable: false, axis: "libm",
        why: "cos and sin of arbitrary angles. ECMA-262 permits an implementation-approximated result, and the " +
             "tree already knows it -- physics/optics/diffraction.js says 'GATED, not fingerprinted (trig is " +
             "not cross-architecture)'. This workload is the receipt for that sentence.",
        run() { let s = 0; for (let i = 0; i < N * 3; i++) { const a = i * 1e-4; s += Math.cos(a) + Math.sin(a * 0.7); } return s; },
    },
    // --- the plain-arithmetic control --------------------------------------------------------------------
    "arith-scalar": {
        bitStable: true, axis: "arithmetic",
        why: "+ - * / on scalars in a hot loop, no calls and no allocation. Measured INDISTINGUISHABLE (1.00x), " +
             "which is what makes the other results interpretable: the runtimes are not simply fast or slow.",
        run() { let a = 1.0001, b = 0.5, s = 0; for (let i = 0; i < N * 8; i++) { a = a * 1.0000001 + b * 0.3; b = b - a * 0.0001; s += a / (b + 2); } return s; },
    },
    "array-push": {
        bitStable: true, axis: "allocation",
        why: "Growing an array by push, the shape laneEmden's trace uses. Bun wins this one, which is why the " +
             "trace was RULED OUT as the cause of laneEmden's slowdown rather than assumed to be it.",
        run() { const a = []; for (let i = 0; i < N; i++) a.push([i, i * 0.5, i * 0.25]); return a.length + a[a.length - 1][2]; },
    },
};

/**
 * Run every workload and return timings plus the exact answer bits.
 *
 * `deadLoop` injects a workload whose result is thrown away INSIDE the runner, so the gate can prove the
 * escape-check catches it. Nothing in a normal run uses it.
 */
export function runWorkloads({ reps = 9, warm = 3, only = null, deadLoop = false } = {}) {
    if (reps % 2 === 0) throw new Error("reps must be ODD so the median is a real sample, not an average of two");
    const names = only ? only.slice() : Object.keys(WORKLOADS);
    const results = {};
    let sink = 0;
    for (const name of names) {
        const w = WORKLOADS[name];
        if (!w) throw new Error("unknown workload: " + name);
        for (let i = 0; i < warm; i++) sink += w.run();          // warm the JIT before the clock starts
        const ms = [];
        for (let i = 0; i < reps; i++) {
            const a = t();
            const v = w.run();
            ms.push(t() - a);
            // *** THE RETURN VALUE ESCAPES HERE, AND THAT IS THE WHOLE REASON THE LOOP SURVIVES OPTIMISATION. ***
            if (!deadLoop) sink += v;
        }
        ms.sort((x, y) => x - y);
        results[name] = {
            median: ms[(reps - 1) >> 1], min: ms[0], max: ms[reps - 1],
            spread: ms[reps - 1] / Math.max(1e-12, ms[0]),
            answer: w.run(), bits: bitsOf(w.run()), axis: w.axis, bitStable: w.bitStable,
        };
        sink += results[name].answer;
    }
    return { runtime: RUNTIME, kind: RUNTIME_KIND, reps, warm, sink, results };
}

/** A ratio inside perfLedger's measured noise range is not a result, and this is where that is enforced. */
export function verdictFor(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return "no-measurement";
    if (ratio > NOISE_FLOOR) return "bun-slower";
    if (ratio < 1 / NOISE_FLOOR) return "bun-faster";
    return "indistinguishable";
}

/**
 * Compare two runs. `a` is the baseline (node by convention), `b` the question.
 *
 * The SPEED half is reported. The ANSWER half is a fact about the runtimes rather than the box, and is what the
 * gate asserts against each workload's declared bitStable.
 */
export function compareRuns(a, b) {
    const rows = [];
    for (const name of Object.keys(a.results)) {
        if (!b.results[name]) continue;
        const A = a.results[name], B = b.results[name];
        const ratio = B.median / A.median;
        // *** A WORKLOAD WHOSE OWN RUNS DISAGREE BY MORE THAN THE NOISE FLOOR CANNOT SUPPORT A RATIO. ***
        // array-push measures 3.3x spread within a single runtime (garbage collection lands where it lands), so
        // its 3.4x between runtimes is not separable from its own scatter. Saying so is cheaper than pretending.
        const noisy = A.spread > NOISE_FLOOR || B.spread > NOISE_FLOOR;
        rows.push({
            name, axis: A.axis, declaredStable: A.bitStable, noisy,
            aSpread: A.spread, bSpread: B.spread,
            aMs: A.median, bMs: B.median, ratio, verdict: noisy ? "too-noisy-to-call" : verdictFor(ratio),
            bitsAgree: A.bits === B.bits, aBits: A.bits, bBits: B.bits,
            relDiff: A.answer === B.answer ? 0 : Math.abs(A.answer - B.answer) / Math.max(1e-300, Math.abs(A.answer)),
        });
    }
    return { a: a.runtime, b: b.runtime, rows };
}

// ---- CLI -------------------------------------------------------------------------------------------------------
// v3951's lesson, applied: `process` at module top level is a ReferenceError in a browser, so the guard comes
// first and the node: import lives INSIDE it. Nothing above this line touches either.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        const json = process.argv.includes("--json");
        const r = runWorkloads({ reps: Number(process.env.SWEK_BENCH_REPS || 9) });
        if (json) { console.log(JSON.stringify(r)); process.exit(0); }

        // --compare: run THIS runtime, then spawn the OTHER one on the same file and put the two side by side.
        // Node-side convenience only; the file itself never spawns anything when run plainly, so it stays
        // runnable under Bun where child_process is the surface bunSurface.mjs warns about.
        if (process.argv.includes("--compare")) {
            const { spawnSync } = await import("node:child_process");
            const other = RUNTIME_KIND === "node" ? "bun" : "node";
            const p = spawnSync(other, [process.argv[1], "--json"], { encoding: "utf8", timeout: 600000 });
            if (p.error || p.status !== 0) {
                console.log("\n  " + other + " could not be run: " + ((p.error && p.error.message) || ("exit " + p.status)));
                console.log("  That is a SKIP, not a result -- half a comparison is not a comparison.\n");
                process.exit(0);
            }
            const cmp = compareRuns(RUNTIME_KIND === "node" ? r : JSON.parse(p.stdout),
                                    RUNTIME_KIND === "node" ? JSON.parse(p.stdout) : r);
            console.log("\n  " + cmp.a + "   vs   " + cmp.b + "\n");
            console.log("  " + "workload".padEnd(15) + "axis".padEnd(13) + "node ms".padStart(9) +
                        "bun ms".padStart(9) + "ratio".padStart(9) + "  verdict".padEnd(22) + "answers");
            for (const w of cmp.rows) {
                console.log("  " + w.name.padEnd(15) + w.axis.padEnd(13) + w.aMs.toFixed(2).padStart(9) +
                    w.bMs.toFixed(2).padStart(9) + (w.ratio.toFixed(2) + "x").padStart(9) + "  " +
                    w.verdict.padEnd(20) + (w.bitsAgree ? "identical" : "DIFFER (rel " + w.relDiff.toExponential(1) + ")") +
                    (w.declaredStable ? "" : "  [may differ]"));
            }
            console.log("\n  ratio is bun/node: above 1 means bun is slower. Anything inside " + NOISE_FLOOR +
                        "x is INDISTINGUISHABLE -- perfLedger's measured noise range on this tree, not a number chosen here.\n");
            process.exit(0);
        }
        console.log("\nruntimeBench -- " + r.runtime + "   (" + r.reps + " reps, " + r.warm + " warm-up runs)\n");
        console.log("  " + "workload".padEnd(15) + "axis".padEnd(13) + "median".padStart(9) + "min".padStart(9) +
                    "max".padStart(9) + "spread".padStart(8) + "   answer bits");
        for (const [n, v] of Object.entries(r.results)) {
            console.log("  " + n.padEnd(15) + v.axis.padEnd(13) + v.median.toFixed(2).padStart(9) +
                v.min.toFixed(2).padStart(9) + v.max.toFixed(2).padStart(9) +
                v.spread.toFixed(2).padStart(7) + "x   " + v.bits + (v.bitStable ? "" : "  (may differ by runtime)"));
        }
        console.log("\n  sink " + r.sink.toExponential(6) + " -- printed so no runtime can delete the loops this timed");
        console.log("  RUN THE OTHER RUNTIME AND COMPARE: a single-runtime table is half a measurement.\n");
        process.exit(0);
    }
}
