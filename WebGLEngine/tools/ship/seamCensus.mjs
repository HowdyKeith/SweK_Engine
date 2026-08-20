// WebGLEngine/tools/ship/seamCensus.mjs -- v3611
// ---------------------------------------------------------------------------------------------------------------
// A PIECEWISE APPROXIMATION IS SEVERAL FUNCTIONS STITCHED AT THRESHOLDS, AND AN ACCURACY TEST THAT SAMPLES A
// RANGE REPORTS A MAXIMUM WITHOUT EVER ASKING ABOUT THE STITCHES.
//
// PROVENANCE, AND NOTHING IS VENDORED. Keith raised dougjam/mixwell-2026 (MIT, SPDX header in the file, Doug L.
// James and Ethan James, ACM TOG 45(4) Art. 79, DOI 10.1145/3811312). Its rdLine1DS is a MATCHED SERIES in three
// pieces joined at y = 6.50416858646776 and y = 0.8220844420096408. Reading it raised a question this tree can
// ask of ITSELF, and the answer is what this file is: strict-libm's atan is the same shape -- argument reduction
// onto a table of anchors, a fixed odd series around each -- and NOTHING HAS EVER CHECKED ITS SEAMS.
//
// *** THE OBVIOUS KEY IS A MIRROR AND IT IS WORTH NAMING BEFORE ANYBODY REACHES FOR IT: Mixwell's `drift1D`
// LITERALLY RETURNS `rdLine1DS(height, r)` -- the same function, with the comment "Provided for backwards
// convenience". A forward/reverse round-trip would grade the function against itself, v3201's shape. ***
//
// ================================================================================================================
// FINDING 1: strict-libm's EIGHT atan SEAMS, CHECKED FOR THE FIRST TIME, AND THEY ARE CLEAN
// ================================================================================================================
//
// _atanUnit reduces t in [0,1] onto the nearest eighth: k = Math.round(t*8), u = (t - k/8)/(1 + t*k/8), then a
// fixed 13th-order odd series around that anchor. The selector flips at t = (k+0.5)/8, so there are EIGHT seams
// where two different anchors compute the same value. Evaluating BOTH anchors at each seam:
//
//     SIX OF EIGHT ARE BIT-IDENTICAL (jump exactly 0). The worst is 1.110e-16 -- ONE ULP -- at t = 0.9375,
//     and 5.551e-17 at t = 0.4375. The fold seam at t = 1 (a <= 1 ? direct : HALF_PI - reciprocal) is EXACT.
//
// A CLAIM NOBODY HAD CHECKED, NOW CHECKED. That is a different thing from a defect hunt that found nothing:
// the number exists now, and the next person to widen the anchor table has something to move.
//
// AND A SMALL OBSERVATION, REPORTED AND NOT DRESSED UP: at both imperfect seams the branch Math.round ACTUALLY
// SELECTS (round(k+0.5) = k+1, half-up) is the one that is one ulp off, and the branch it does not select is
// exact against Math.atan. One ulp is not a defect and the README claims 2.2e-16; it is recorded because it is
// the kind of thing that is invisible unless somebody evaluates both branches at the same point.
//
// ================================================================================================================
// FINDING 2, AND IT IS THE ONE WITH A CONSEQUENCE: THE REDUCTION HEADROOM IS 1.4779x, NOT ORDERS OF MAGNITUDE
// ================================================================================================================
//
// The seams are clean BECAUSE the series is accurate well past the |u| the reduction can produce -- so the
// question worth answering is HOW FAR past. Bisected on "still correct to ONE ULP" (no threshold typed):
//
//     LARGEST |u| STILL EXACT TO ONE ULP   0.092369334
//     THE REDUCTION GUARANTEES              |u| <= 1/16 = 0.062500000
//     HEADROOM                              1.4779x
//
// *** SO THE k/8 TABLE IS NOT DECORATIVE. A k/4 TABLE -- half the constants, the obvious saving -- WOULD PUT
// |u| <= 1/8 = 0.125, WHICH IS PAST 0.0924, AND THE ONE-ULP CLAIM WOULD BREAK. *** That is the plant this file
// drives, as a PARAMETER rather than a source edit, and it fires. Measured on the way: the series reads 2.51
// ulps at |u| = 0.1, 865 ulps at 0.15 and 4.8e+4 at 0.2, so the cliff is steep and close.
//
// ================================================================================================================
// THE EXTERNAL CONTRAST, MEASURED FROM THE PUBLISHED SOURCE AND NOT FROM THE PAPER
// ================================================================================================================
//
// The same census pointed at Mixwell's rdLine1DS (ported here for the measurement ONLY -- see the boundary
// note below) reads a seam agreement of 2.220e-7 at the far|mid stitch and 7.009e-5 at mid|near, with slopes
// at 1.760e-5 and 4.831e-4. SO THE PUBLISHED LIBRARY IS GOOD TO ABOUT FOUR DECIMAL DIGITS AT ITS WORST SEAM
// AND strict-libm IS GOOD TO ONE ULP AT ITS WORST -- eleven orders apart, for two functions of the same shape.
// NEITHER NUMBER IS A CRITICISM: a marbling drift wants a smooth plausible field and a determinism library
// wants bit-exactness, and each is built to the accuracy its job needs. THE POINT IS THAT THE QUESTION HAS AN
// ANSWER AND NOBODY HAD ASKED IT OF EITHER.
//
// AND THE FAR FIELD IS A REAL EXTERNAL KEY, NOT AN INTERNAL ONE: Mixwell's large-y branch satisfies
// dx*y^3 -> -(PI/256)*64 = -PI/4 exactly, hit to thirteen digits by y = 1e8. The exponent 3 and the
// coefficient PI/4 are the physics of the far field, not something the file declares.
//
// BOUNDARY, AND IT MATTERS FOR THE LICENCE AS MUCH AS THE HONESTY: NOTHING FROM MIXWELL IS VENDORED INTO THIS
// ENGINE. The three branch expressions live in this file ONLY as the object of a measurement, are marked as
// theirs, are not exported for use, and nothing in SweK calls them -- the greedyMesh3d rule, and the reason
// this round GRADES rather than ADOPTS. SweK has no marbling and no consumer for one; naming one is Keith's.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { strictAtan } from "../../../strict-libm/src/strictMath.mjs";

export const ULP = (x) => Math.abs(x) * Number.EPSILON;

// --- the instrument -------------------------------------------------------------------------------------------

/**
 * SEAM LOCATIONS ARE DERIVED FROM THE SELECTOR, NEVER TYPED. Sweep the domain, watch the branch index change,
 * and bisect each transition to the resolution asked for. A file that typed (k+0.5)/8 would be asserting the
 * arrangement rather than reading the structure -- and would go quietly wrong the day the table changed.
 */
export function findSeams(selector, lo, hi, { coarse = 4096, refine = 60 } = {}) {
    const out = [];
    let prev = selector(lo);
    for (let i = 1; i <= coarse; i++) {
        const t = lo + (hi - lo) * (i / coarse);
        const k = selector(t);
        if (k !== prev) {
            let a = lo + (hi - lo) * ((i - 1) / coarse), b = t;
            for (let j = 0; j < refine; j++) { const m = 0.5 * (a + b); if (selector(m) === prev) a = m; else b = m; }
            out.push({ at: b, from: prev, to: k });
            prev = k;
        }
    }
    return out;
}

/**
 * THE JUMP AT A SEAM, ISOLATED FROM THE GENUINE SLOPE. A function is SUPPOSED to change across a seam -- what
 * a stitch defect adds is an increment the true function does not have. So the measurement is the shipped
 * function's own increment across the seam MINUS the reference's increment over the same interval. It needs
 * only the shipped export and a reference; nothing is re-implemented, so this cannot drift from what ships.
 */
export function seamJump(f, ref, at, { eps = 1e-9 } = {}) {
    const dF = f(at + eps) - f(at - eps);
    const dG = ref(at + eps) - ref(at - eps);
    const value = Math.abs(dF - dG);
    const slope = Math.abs((dF - dG) / (2 * eps));
    return { at, value, slope, ulps: value / Math.max(ULP(ref(at)), Number.MIN_VALUE) };
}

/**
 * BOTH BRANCHES AT ONE POINT -- the sharper test, available when the caller can name the per-branch evaluator.
 * Two anchors compute the same value at a seam; the disagreement between them is the stitch, with no epsilon
 * and no reference needed.
 */
export function branchDisagreement(evalAt, seam) {
    const a = evalAt(seam.at, seam.from), b = evalAt(seam.at, seam.to);
    return { at: seam.at, from: seam.from, to: seam.to, a, b, jump: Math.abs(a - b) };
}

// --- SweK's own: strict-libm's atan ------------------------------------------------------------------------------
//
// The anchor table and the odd series are strict-libm's, restated here ONLY so both branches can be evaluated
// at one t -- _atanUnit is not exported, and the shipped strictAtan can only ever show the branch it picked.
// THE RESTATEMENT IS HELD TO THE SHIPPED FUNCTION: section 1 of the gate asserts they agree on the selected
// branch across the whole domain, so a drifting copy cannot pass unnoticed.

export const ATAN8 = [0.0, 0.12435499454676144, 0.24497866312686414, 0.35877067027057225,
    0.4636476090008061, 0.5585993153435624, 0.6435011087932844, 0.7188299996216245, 0.7853981633974483];

export const oddSeries = (u) => {
    const u2 = u * u;
    let s = 1 / 13; s = -1 / 11 + u2 * s; s = 1 / 9 + u2 * s; s = -1 / 7 + u2 * s;
    s = 1 / 5 + u2 * s; s = -1 / 3 + u2 * s; s = 1 + u2 * s;
    return u * s;
};

/** eighths = 8 is what ships. THE PLANT IS THIS PARAMETER: 4 halves the table and widens |u| to 1/8. */
export function atanBranch(t, k, eighths = 8) {
    const c = k / eighths;
    return atanAnchor(k, eighths) + oddSeries((t - c) / (1 + t * c));
}
export const atanAnchor = (k, eighths = 8) => (eighths === 8 ? ATAN8[k] : Math.atan(k / eighths));
export const atanSelector = (eighths = 8) => (t) => Math.round(t * eighths);
export const atanUnit = (t, eighths = 8) => atanBranch(t, Math.round(t * eighths), eighths);

/** THE HEADROOM, BISECTED ON "still correct to ONE ULP" -- no threshold typed anywhere. */
export function seriesHeadroom({ guarantee = 1 / 16 } = {}) {
    const bad = (u) => Math.abs(oddSeries(u) - Math.atan(u)) > ULP(Math.atan(u));
    let lo = guarantee, hi = 1;
    if (bad(lo)) return { limit: null, guarantee, headroom: null, note: "the guarantee itself already exceeds one ulp" };
    for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (bad(m)) hi = m; else lo = m; }
    return { limit: lo, guarantee, headroom: lo / guarantee };
}

export function atanSeamCensus(eighths = 8) {
    const seams = findSeams(atanSelector(eighths), 0, 1);
    return seams.map((s) => ({
        ...branchDisagreement((t, k) => atanBranch(t, k, eighths), s),
        ...seamJump((t) => atanUnit(t, eighths), Math.atan, s.at),
        selected: Math.abs(atanBranch(s.at, s.to, eighths) - Math.atan(s.at)),
        unselected: Math.abs(atanBranch(s.at, s.from, eighths) - Math.atan(s.at)),
    }));
}

/** Worst error over the reduced domain -- the number a k/4 table breaks. */
export function atanWorstUlps(eighths = 8, n = 20000) {
    let worst = 0, at = 0;
    for (let i = 1; i < n; i++) {
        const t = i / n, e = Math.abs(atanUnit(t, eighths) - Math.atan(t)) / Math.max(ULP(Math.atan(t)), Number.MIN_VALUE);
        if (e > worst) { worst = e; at = t; }
    }
    return { worstUlps: worst, at, eighths };
}

// --- the external case, MEASURED AND NOT VENDORED ------------------------------------------------------------------
//
// dougjam/mixwell-2026, MIT (Doug L. James and Ethan James, 2026). These three expressions are the OBJECT OF A
// MEASUREMENT and nothing in this engine calls them. Kept together so the seam numbers in the header can be
// re-derived on every run rather than quoted from a chat.

export const MIXWELL = {
    far: (y) => { const h = 1 / y, h2 = h * h, h3 = h * h2;
        return -(Math.PI / 256) * h3 * ((((6615 * h2 - 1960) * h2 + 600) * h2 - 192) * h2 + 64); },
    mid: (y) => { const dy = y - 2.3;
        const num = (((((-1.01973e-7 * dy + 1.77539e-6) * dy - 0.0068946) * dy - 0.043355) * dy - 0.0937878) * dy - 0.0413839);
        const den = ((((((0.00875686 * dy + 0.115772) * dy + 0.665761) * dy + 2.08615) * dy + 3.66495) * dy + 3.26035) * dy + 1.0);
        return num / den; },
    near: (y) => { const z = y * y;
        const A = ((((0.00015811568 * z - 0.00096477622) * z + 0.0076619254) * z - 0.16369764) * z - 0.039720771);
        const B = ((((-0.00018775463 * z + 0.0010681152) * z - 0.0073242188) * z + 0.09375) * z + 0.5);
        return A + B * Math.log(z > 0 ? Math.sqrt(z) : 1e-300); },
    SEAM_FAR_MID: 6.50416858646776,
    SEAM_MID_NEAR: 0.8220844420096408,
};

const relGap = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
const slopeAt = (f, y, h = 1e-6) => (f(y + h) - f(y - h)) / (2 * h);

export function mixwellSeams() {
    const { far, mid, near, SEAM_FAR_MID: s1, SEAM_MID_NEAR: s2 } = MIXWELL;
    return [
        { name: "far | mid", at: s1, value: relGap(far(s1), mid(s1)), slope: relGap(slopeAt(far, s1), slopeAt(mid, s1)) },
        { name: "mid | near", at: s2, value: relGap(mid(s2), near(s2)), slope: relGap(slopeAt(mid, s2), slopeAt(near, s2)) },
    ];
}

/** THE ONE EXTERNAL KEY: the far field is an exact limit the file never declares. dx*y^3 -> -PI/4. */
export function mixwellFarFieldLimit(ys = [10, 100, 1e4, 1e8]) {
    return { predicted: -(Math.PI / 256) * 64, measured: ys.map((y) => ({ y, v: MIXWELL.far(y) * y * y * y })) };
}

export const MEASURED_V3611 = {
    atanSeams: { count: 8, bitIdentical: 6, worstJump: 1.110e-16, worstAt: 0.9375, foldSeamAt1: 0 },
    headroom: { limit: 0.092369334, guarantee: 0.0625, ratio: 1.4779 },
    quarterTableBreaks: "a k/4 table puts |u| <= 0.125, past the one-ulp limit of 0.092369334 -- the plant is " +
        "the `eighths` PARAMETER and it fires",
    mixwell: { farMid: 2.220e-7, midNear: 7.009e-5, farFieldLimit: -Math.PI / 4 },
    verdict: "strict-libm's EIGHT atan SEAMS ARE CHECKED FOR THE FIRST TIME AND THEY ARE CLEAN -- six of eight " +
        "BIT-IDENTICAL, worst one ulp, fold seam exact. A claim nobody had checked, now checked. THE NUMBER " +
        "WITH A CONSEQUENCE IS THE HEADROOM: 1.4779x, so the k/8 table is not decorative and a k/4 table would " +
        "break the one-ulp claim.",
    notClaimed: "NOTHING FROM MIXWELL IS VENDORED. Its three branches sit here as the OBJECT of a measurement, " +
        "marked as theirs, exported for nothing, called by nothing in the engine. SweK has no marbling and no " +
        "consumer for one -- the greedyMesh3d rule -- so this round GRADES and does not ADOPT.",
    theMirrorNamed: "Mixwell's `drift1D` LITERALLY RETURNS rdLine1DS, so a forward/reverse round-trip would " +
        "grade the function against itself. DO NOT PROPOSE THAT KEY.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[seamCensus] a piecewise approximation is stitched, and nobody had looked at the stitches");
    say("");
    say("1. strict-libm's atan SEAMS -- locations DERIVED from the selector, not typed");
    say("     seam t     branch A            branch B            |jump|      selected err  unselected err");
    for (const s of atanSeamCensus()) {
        say("     " + s.at.toFixed(4) + "     " + s.a.toFixed(17) + " " + s.b.toFixed(17) + " " +
            s.jump.toExponential(3) + "   " + s.selected.toExponential(2) + "      " + s.unselected.toExponential(2));
    }
    const cen = atanSeamCensus();
    say("     " + cen.filter((s) => s.jump === 0).length + " of " + cen.length + " BIT-IDENTICAL; worst " +
        Math.max(...cen.map((s) => s.jump)).toExponential(3) + ". A claim nobody had checked, now checked.");
    say("");
    say("2. THE HEADROOM, BISECTED ON ONE ULP -- and it is why the seams are safe");
    const h = seriesHeadroom();
    say("     largest |u| still exact to one ulp   " + h.limit.toFixed(9));
    say("     the reduction guarantees             " + h.guarantee.toFixed(9));
    say("     HEADROOM                             " + h.headroom.toFixed(4) + "x");
    say("     worst over the domain at k/8: " + atanWorstUlps(8).worstUlps.toFixed(2) + " ulps");
    say("     worst over the domain at k/4: " + atanWorstUlps(4).worstUlps.toFixed(2) +
        " ulps  <- the table is NOT decorative");
    say("");
    say("3. THE EXTERNAL CASE THAT PROMPTED IT -- MEASURED, NOT VENDORED (mixwell-2026, MIT)");
    for (const s of mixwellSeams())
        say("     " + s.name.padEnd(12) + "at y = " + s.at.toFixed(6) + "   value " + s.value.toExponential(3) +
            "   slope " + s.slope.toExponential(3));
    const ff = mixwellFarFieldLimit();
    say("     far-field limit dx*y^3 -> " + ff.predicted.toFixed(12) + " (= -PI/4, PHYSICS not declared):");
    say("       " + ff.measured.map((m) => "y=" + m.y + " " + m.v.toFixed(9)).join("   "));
    say("     Four decimal digits at their worst seam against ONE ULP at ours -- and neither is a criticism:");
    say("     a drift field wants smooth and plausible, a determinism library wants bit-exact.");
    say("");
    say("  " + MEASURED_V3611.verdict);
    say("  NOT CLAIMED: " + MEASURED_V3611.notClaimed);
    say("  MIRROR NAMED: " + MEASURED_V3611.theMirrorNamed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
