// WebGLEngine/physics/splat/sortPrecision-selfcheck.mjs -- v2861
//
// Run: node physics/splat/sortPrecision-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades physics/splat/sortPrecision.js -- the answer key that makes a GPU-vs-CPU splat sort comparison mean
// something. The whole difficulty of phase 4 is that a float64 CPU sort and a quantised GPU sort DISAGREE ON
// NEAR-TIES BY CONSTRUCTION, so a naive comparison fails forever and a fudge tolerance hides real bugs. The key
// here is exact instead: quantisation is a known function, so the pairs that collide are computable, and every
// other pair's order is MANDATORY.
import {
    toFloat16, toFloat32, quantise, freePairs, gradeOrdering, orderByMetric, orderAtPrecision,
    pairAgreement, zDepthMetric, radialMetric, SPARK_SETTINGS,
} from "./sortPrecision.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. float16 quantisation is real, before anything is built on it -----------------------------------------
{
    ok("exactly representable values survive", toFloat16(1) === 1 && toFloat16(1.5) === 1.5 && toFloat16(-2) === -2);
    // 10 explicit mantissa bits: 1+2^-10 is the next representable value after 1; 1+2^-11 must collapse to 1.
    ok("!! the mantissa is exactly 10 bits", toFloat16(1 + Math.pow(2, -10)) === 1 + Math.pow(2, -10) && toFloat16(1 + Math.pow(2, -11)) === 1,
       "1+2^-10 survives, 1+2^-11 collapses -- this is what makes near-ties collide");
    ok("the largest finite half is 65504", toFloat16(65504) === 65504 && toFloat16(70000) === Infinity);
    ok("tiny values underflow to zero", toFloat16(1e-8) === 0);
    ok("0.1 quantises to the known half value", Math.abs(toFloat16(0.1) - 0.0999755859375) < 1e-15,
       toFloat16(0.1).toString());
    ok("float32 quantisation is Math.fround", toFloat32(0.1) === Math.fround(0.1) && toFloat32(1 / 3) === Math.fround(1 / 3));
    ok("float64 passes through untouched", quantise(1 / 3, "float64") === 1 / 3);
    // Quantisation must be idempotent, or "collides" is not well defined.
    ok("quantising twice changes nothing", toFloat16(toFloat16(0.1)) === toFloat16(0.1) && toFloat32(toFloat32(1 / 3)) === toFloat32(1 / 3));
}

// ---- 2. THE KEY: collisions are computable and shrink with precision -----------------------------------------
{
    const depths = [5.0, 5.0009, 5.002, 7.5, 7.5001, 12.0];
    const f16 = freePairs(depths, "float16");
    const f32 = freePairs(depths, "float32");
    const f64 = freePairs(depths, "float64");
    ok("float16 leaves some pairs indistinguishable", f16.size > 0, f16.size + " free pairs of 15");
    ok("!! float32 is STRICTLY SHARPER than float16", f32.size < f16.size,
       f32.size + " free vs " + f16.size + " -- this is why sort32 is worth setting, and it is measured not assumed");
    ok("float64 (the reference) frees nothing", f64.size === 0, "distinct doubles cannot collide");
}

// ---- 3. a reduced-precision sort PASSES, and only where it should ---------------------------------------------
{
    const depths = [5.0, 5.0009, 5.002, 7.5, 7.5001, 12.0];
    for (const p of ["float16", "float32"]) {
        // several tie-break seeds: a legitimate sorter may resolve collisions any way at all
        let allOk = true, checked = 0;
        for (let seed = 1; seed <= 8; seed++) {
            const g = gradeOrdering(orderAtPrecision(depths, p, seed), depths, p);
            allOk = allOk && g.ok; checked = g.checkedPairs;
        }
        ok("a legitimate " + p + " sort passes for ANY tie-break", allOk, checked + " mandatory pairs enforced");
    }
    // ...and the reference itself must pass at every precision.
    const truth = orderByMetric(depths);
    ok("the float64 reference ordering passes at all precisions",
       ["float16", "float32", "float64"].every((p) => gradeOrdering(truth, depths, p).ok));
}

// ---- 4. IT MUST FAIL A GENUINELY WRONG SORT (a key that cannot fail is decoration) -----------------------------
{
    const depths = [5.0, 5.0009, 5.002, 7.5, 7.5001, 12.0];
    const reversed = [5, 4, 3, 2, 1, 0];
    const g = gradeOrdering(reversed, depths, "float16");
    ok("!! a reversed ordering FAILS even at the loosest precision", !g.ok && g.violations > 5,
       g.violations + " violations, worst gap " + g.worstViolation.toFixed(3) + " -- nowhere near a tie");

    // A single far-apart swap must be caught: this is the failure mode a fudge tolerance would swallow.
    const oneSwap = orderByMetric(depths).slice();
    [oneSwap[0], oneSwap[5]] = [oneSwap[5], oneSwap[0]];
    ok("!! ONE far-apart swap is caught", !gradeOrdering(oneSwap, depths, "float16").ok,
       "an 'agree within N swaps' tolerance would have excused this");

    // But a swap of two genuinely colliding splats must NOT be flagged.
    const collide = [3.0, 3.0 + Math.pow(2, -14), 9.0];
    const base = orderByMetric(collide);
    const swapped = [base[1], base[0], base[2]];
    ok("...while swapping two COLLIDING splats is not a violation", gradeOrdering(swapped, collide, "float16").ok,
       "the key excuses exactly what the precision genuinely cannot resolve");
}

// ---- 5. malformed input is refused rather than scored ----------------------------------------------------------
{
    const d = [1, 2, 3];
    ok("a wrong-length ordering is refused", gradeOrdering([0, 1], d, "float32").ok === false);
    ok("a non-permutation is refused, not silently scored", gradeOrdering([0, 0, 1], d, "float32").error === "ordering is not a permutation");
}

// ---- 6. THE TRAP: radial and z-depth are different QUANTITIES, not different precisions -------------------------
{
    // Off-axis splats: radial distance and z-depth genuinely disagree about which is in front.
    const cam = [[0, 0, 10], [6, 6, 7], [0, 0, 9]];
    const z = zDepthMetric(cam), r = radialMetric(cam);
    const oz = orderByMetric(z), orr = orderByMetric(r);
    ok("!! radial and z-depth produce DIFFERENT orderings", JSON.stringify(oz) !== JSON.stringify(orr),
       "z " + JSON.stringify(oz) + " vs radial " + JSON.stringify(orr));
    ok("...and the disagreement is LARGE, so it cannot be mistaken for rounding", pairAgreement(oz, orr) < 0.7,
       "agreement " + pairAgreement(oz, orr).toFixed(3) + " -- comparing these two would look like catastrophic precision loss and be nothing of the kind");
    // Grading the radial ordering against the z-depth truth must FAIL loudly at the sharpest precision.
    ok("...grading one against the other fails at float64", !gradeOrdering(orr, z, "float64").ok,
       "which is the correct outcome: they answer different questions");
    // On-axis, the two metrics agree -- so a test that only used centred splats would never notice.
    const onAxis = [[0, 0, 3], [0, 0, 7], [0, 0, 5]];
    ok("!! ...but ON-AXIS they agree, so a centred test would miss it entirely",
       JSON.stringify(orderByMetric(zDepthMetric(onAxis))) === JSON.stringify(orderByMetric(radialMetric(onAxis))),
       "the same shape as the perspective-shear sabotage: invisible from the middle of the screen");
}

// ---- 7. the required Spark configuration is recorded as DATA ----------------------------------------------------
{
    ok("SPARK_SETTINGS pins sortRadial:false", SPARK_SETTINGS.sortRadial === false,
       "Spark 2.0 DEFAULTS to radial; leaving the default would compare two different quantities");
    ok("...sort32:true", SPARK_SETTINGS.sort32 === true, "float32 metric rather than the float16 default");
    ok("...stochastic:false", SPARK_SETTINGS.stochastic === false, "stochastic rendering has no explicit ordering to compare");
    ok("...and carries WHY, so the next person cannot silently drop one", /sortRadial/.test(SPARK_SETTINGS.why || ""));
}

// ---- 8. determinism ----------------------------------------------------------------------------------------------
{
    const d = [1.5, 2.25, 2.2500001, 9];
    const a = gradeOrdering(orderByMetric(d), d, "float32");
    const b = gradeOrdering(orderByMetric(d), d, "float32");
    ok("grading is deterministic", a.checkedPairs === b.checkedPairs && a.violations === b.violations);
}

console.log(fails ? "\nsortPrecision-selfcheck: " + fails + " FAILED" : "\nsortPrecision-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
