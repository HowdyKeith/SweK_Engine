// WebGLEngine/physics/geostats/kriging-selfcheck.mjs -- v2840
//
// Run: node physics/geostats/kriging-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/geostats/kriging.js.
//
// Kriging is the BEST LINEAR UNBIASED ESTIMATOR, and every word of that is a property rather than a slogan:
//
//   UNBIASED   the weights sum to EXACTLY 1. Imposed as a constraint, which is why the system carries a
//              Lagrange multiplier -- so this is not a coincidence to be admired but an equation to be checked.
//   BEST       of all weight sets summing to 1, kriging's minimises the variance. THIS IS THE ONE WORTH GATING,
//              because it is what separates kriging from inverse-distance weighting, and because it can be
//              attacked directly: perturb the weights thousands of times, keep the sum at 1, and watch nothing
//              beat it. A search that FAILS to find a counterexample is the strongest evidence available here.
//   EXACT      predict where you already have data and you must get that datum back, with variance zero. An
//              interpolator that smooths through its own observations is lying about what it knows.
//
// And combining two predictions has a closed form -- inverse-variance weighting -- whose defining property is
// that the combined variance is LOWER THAN EITHER INPUT. If it were not, there would be no reason to combine
// rather than simply pick the better one.

import { spherical, exponential, gaussian, MODELS, solve, ordinaryKriging, varianceOfWeights, combine, localKriging } from "./kriging.js";
import { prose } from "../../tools/ship/sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 777;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const field = (x, y) => Math.sin(x / 20) * 10 + Math.cos(y / 25) * 6;
const samples = Array.from({ length: 14 }, () => { const x = rnd() * 100, y = rnd() * 100; return { at: [x, y], value: field(x, y) }; });
const gamma = spherical({ nugget: 0.05, sill: 8, range: 40 });

// 1. THE VARIOGRAMS behave like variograms
{
    for (const [name, mk] of Object.entries(MODELS)) {
        const g = mk({ nugget: 0.1, sill: 5, range: 30 });
        ok(`${name}: gamma(0) is exactly 0`, g(0) === 0);
        ok(`${name}: rises with distance`, g(5) < g(15) && g(15) < g(29));
        ok(`${name}: approaches nugget + sill far away`, Math.abs(g(300) - 5.1) < 0.2, g(300).toFixed(4));
    }
    ok("spherical reaches its sill exactly AT the range, unlike the asymptotic models",
        spherical({ sill: 5, range: 30 })(30) === 5 && exponential({ sill: 5, range: 30 })(30) < 5);
}

// 2. THE SOLVER
{
    ok("solves a small system", (() => { const x = solve([[2, 1], [1, 3]], [5, 10]); return Math.abs(x[0] - 1) < 1e-12 && Math.abs(x[1] - 3) < 1e-12; })());
    ok("returns NULL on a singular matrix rather than noise", solve([[1, 2], [2, 4]], [1, 2]) === null);
    ok("pivots, so a zero leading entry is not fatal", (() => { const x = solve([[0, 1], [1, 0]], [2, 3]); return x && Math.abs(x[0] - 3) < 1e-12 && Math.abs(x[1] - 2) < 1e-12; })());
}

// 3. EXACT INTERPOLATION -- bit-identical, not close
{
    let allExact = true;
    for (const s of samples) {
        const r = ordinaryKriging(samples, s.at, gamma);
        if (r.value !== s.value || r.variance !== 0 || r.exact !== true) allExact = false;
    }
    ok("!! predicting AT a sample returns that sample's value BIT-IDENTICALLY, variance zero", allExact);
    ok("...and it is handled explicitly, because two coincident points make the matrix singular",
        ordinaryKriging(samples, samples[0].at, gamma).exact === true);
    const near = ordinaryKriging(samples, [samples[0].at[0] + 1e-9, samples[0].at[1]], gamma);
    ok("...and a point a hair away is still solved normally", near !== null && Number.isFinite(near.value));
}

// 4. UNBIASED -- the weights sum to one
{
    let worst = 0;
    for (let i = 0; i < 300; i++) {
        const r = ordinaryKriging(samples, [rnd() * 100, rnd() * 100], gamma);
        worst = Math.max(worst, Math.abs(r.weights.reduce((a, b) => a + b, 0) - 1));
    }
    ok("!! weights sum to 1 over 300 queries", worst < 1e-9, "worst deviation " + worst.toExponential(2));
    ok("negative weights are ALLOWED and not clamped -- kriging screens, and clamping would break unbiasedness",
        (() => { for (let i = 0; i < 200; i++) { const r = ordinaryKriging(samples, [rnd() * 100, rnd() * 100], gamma); if (r.weights.some((w) => w < 0)) return true; } return false; })());
}

// 5. BEST -- the property that makes it worth the linear algebra
{
    let anyBeaten = 0, tested = 0;
    for (const q of [[37, 58], [12, 90], [75, 20], [50, 50]]) {
        const k = ordinaryKriging(samples, q, gamma);
        const base = varianceOfWeights(samples, q, gamma, k.weights);
        for (let t = 0; t < 2000; t++) {
            const w = k.weights.slice();
            const i = (rnd() * w.length) | 0, j = (rnd() * w.length) | 0;
            if (i === j) continue;
            const e = (rnd() - 0.5) * 0.2;
            w[i] += e; w[j] -= e;                      // perturbed, but the sum is preserved
            tested++;
            if (varianceOfWeights(samples, q, gamma, w) < base - 1e-10) anyBeaten++;
        }
    }
    ok("!! NO perturbation preserving sum(w)=1 achieves a lower variance", anyBeaten === 0, `${anyBeaten} of ${tested} perturbations beat it`);
    ok("...and the reported variance matches the one computed from the weights", (() => {
        const q = [37, 58], k = ordinaryKriging(samples, q, gamma);
        return Math.abs(k.variance - varianceOfWeights(samples, q, gamma, k.weights)) < 1e-9;
    })());
    ok("variance is never negative", (() => { for (let i = 0; i < 200; i++) if (ordinaryKriging(samples, [rnd() * 100, rnd() * 100], gamma).variance < 0) return false; return true; })());
    ok("variance GROWS with distance from the data", (() => {
        const near = ordinaryKriging(samples, [samples[0].at[0] + 2, samples[0].at[1] + 2], gamma).variance;
        const far = ordinaryKriging(samples, [1000, 1000], gamma).variance;
        return far > near;
    })());
}

// 6. COMBINING TWO PREDICTIONS
{
    const a = { value: 10, variance: 4 }, b = { value: 14, variance: 1 };
    const c = combine(a, b);
    ok("!! the combined variance is LOWER THAN EITHER INPUT -- the reason to combine at all", c.variance < a.variance && c.variance < b.variance,
        `${c.variance.toFixed(4)} vs ${a.variance} and ${b.variance}`);
    ok("!! the more confident estimate gets the larger weight", c.weightB > c.weightA, `${c.weightA.toFixed(3)} / ${c.weightB.toFixed(3)}`);
    ok("weights sum to 1, so the combination is unbiased too", Math.abs(c.weightA + c.weightB - 1) < 1e-12);
    ok("inverse-variance weighting is exact: w_a = v_b/(v_a+v_b)", Math.abs(c.weightA - 1 / 5) < 1e-12, c.weightA.toFixed(6));
    ok("a zero-variance MEASUREMENT wins outright over any prediction", (() => { const m = combine({ value: 5, variance: 0 }, { value: 99, variance: 3 }); return m.value === 5 && m.variance === 0; })());
    ok("two equal estimates combine to their mean with half the variance", (() => { const m = combine({ value: 4, variance: 2 }, { value: 8, variance: 2 }); return Math.abs(m.value - 6) < 1e-12 && Math.abs(m.variance - 1) < 1e-12; })());
    ok("correlation is accepted, since pretending independence would understate the variance",
        combine({ value: 1, variance: 2 }, { value: 3, variance: 2 }, { correlation: 0.9 }).variance > combine({ value: 1, variance: 2 }, { value: 3, variance: 2 }).variance);
}

// 7. LOCAL kriging agrees with the full solve where it should, and is cheaper
{
    const many = Array.from({ length: 120 }, () => { const x = rnd() * 200, y = rnd() * 200; return { at: [x, y], value: field(x, y) }; });
    const q = [100, 100];
    const full = ordinaryKriging(many, q, gamma);
    const local = localKriging(many, q, gamma, { k: 16 });
    ok("local kriging over the nearest 16 tracks the full solve closely", Math.abs(full.value - local.value) < 1.0,
        `full ${full.value.toFixed(4)} vs local ${local.value.toFixed(4)}`);
    ok("...and falls back to the full solve when there are fewer samples than k", localKriging(samples.slice(0, 5), q, gamma, { k: 12 }) !== null);
}

// 8. honest failure and browser-safety
{
    ok("no samples returns null rather than a number", ordinaryKriging([], [0, 0], gamma) === null);
    ok("a single sample predicts that sample everywhere (all the information there is)", (() => {
        const r = ordinaryKriging([{ at: [0, 0], value: 7 }], [50, 50], gamma);
        return r && Math.abs(r.value - 7) < 1e-12;
    })());
    const src = (await import("node:fs")).readFileSync(new URL("./kriging.js", import.meta.url), "utf8");
    ok("kriging.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
    ok("the variogram is documented as a MODELLING CHOICE rather than something derived here", /modelling decision the caller makes/i.test(prose(src)));
}


// 9. THE k-d TREE NEIGHBOURHOOD -- the one place v2841 measured the tree to be worth it
{
    const { build, kNearest, worthIndexing } = await import("../spatial/kdtree.js");
    const { kdNeighbourhood } = await import("./kriging.js");
    let sd = 31337; const r2 = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const big = Array.from({ length: 1200 }, () => { const x = r2() * 500, y = r2() * 500; return { at: [x, y], value: Math.sin(x / 40) + Math.cos(y / 50) }; });

    const nb = kdNeighbourhood(big, { buildKd: build, kNearest, k: 12, worthIndexing });
    ok("the rule APPROVES a k-nearest query over a large static sample set", nb.use === true);

    // identical predictions -- an index that changes the answer is not an optimisation
    let worst = 0;
    for (let i = 0; i < 60; i++) {
        const q = [r2() * 500, r2() * 500];
        const a = localKriging(big, q, gamma, { k: 12 });
        const b = localKriging(big, q, gamma, { k: 12, nearestFn: nb.nearestFn });
        worst = Math.max(worst, Math.abs(a.value - b.value));
    }
    ok("!! the tree-backed neighbourhood gives the SAME predictions as the linear one", worst < 1e-9, "worst " + worst.toExponential(2));

    // and it must REFUSE where the rule says no, rather than being wired in on faith
    const small = big.slice(0, 200);
    const no = kdNeighbourhood(small, { buildKd: build, kNearest, k: 12, worthIndexing });
    ok("!! ...and REFUSES on a small set, where a linear scan is competitive", no.use === false && /too much of the set/.test(no.reason));
    ok("...returning no nearestFn, so a caller cannot use it by accident", no.nearestFn === null);
    ok("without the rule supplied it just builds one (the caller has decided)", kdNeighbourhood(small, { buildKd: build, kNearest, k: 12 }).use === true);
    const src = (await import("node:fs")).readFileSync(new URL("./kriging.js", import.meta.url), "utf8");
    ok("the source records that the DECISION IS MADE BY THE RULE, not by taste", /made BY THE RULE, not by taste/.test(src));
    ok("...and that boids failed the same test and was reverted", /boids flock failed that test/.test(prose(src)));
}

console.log("kriging-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
