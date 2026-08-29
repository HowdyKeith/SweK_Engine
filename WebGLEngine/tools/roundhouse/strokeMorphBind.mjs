// tools/roundhouse/strokeMorphBind.mjs
//
// AN IDENTITY THAT WAS STATED FROM THE ARMCHAIR, HALF TRUE, AND INVISIBLE IN THE THING THE MODULE PRODUCES.
//
// physics/mesh/strokeMorph.mjs exists because a dependency was REFUSED with a reason: morphicons verified
// cleanly (MIT, no dependencies, DOM-free, inspected with `npm pack` rather than trusted from the README) and
// the digit case does not use the two things it exists to solve. What deriving bought instead was AN EXACT KEY,
// and the module's own header records how it got one:
//
//     "*** I WROTE 'a + 1*(b-a) IS b IN IEEE-754' AND IT IS FALSE, AND THE GATE CAUGHT IT. *** a + 0*(b-a)
//      really is a exactly, but at t=1 the SUBTRACTION rounds and then the ADDITION rounds again."
//
// MEASURED HERE, and the asymmetry is the finding: across ten adjacent digit pairs at N=64, the naive lerp is
// exact at t=0 in ALL 640 comparisons and wrong at t=1 in FORTY of them, worst drift 1.776e-15. *** HALF OF
// THE CLAIM WAS TRUE, WHICH IS WHY IT SURVIVED BEING WRITTEN DOWN. *** The fix is not a tolerance: morphAt
// returns the endpoint ITSELF at t=0 and t=1, so the identity is true by construction rather than hoped for.
//
// ================================================================================================================
// *** AND THE BUG IS INVISIBLE IN THE ARTIFACT, WHICH IS THE PART WORTH CARRYING ***
// ================================================================================================================
//
// toPathD rounds to four decimal places. The drift is 1.776e-15. So under the plant the RENDERED PATH STRING IS
// BIT-IDENTICAL -- 0 of 10 pairs differ -- while 40 of 640 floats do. A test that compared the module's own
// output would certify the broken morph and see nothing at all. That is why the identity has to be asserted on
// floats, and it is the reason this bind reports both counts side by side instead of the one that looks worse.
//
// THE PLANT IS THE MODULE'S OWN RECORDED DEFECT PUT BACK: drop the t === 0 and t === 1 short-circuits from
// morphAt and let the lerp place the endpoints. plantKind METHOD -- the arithmetic is wrong and no config value
// records it.
//
// *** AND THE SAME PLANT ON THE RESAMPLER DOES NOT FIRE, WHICH IS REPORTED RATHER THAN QUIETLY DROPPED. ***
// resample also places its endpoints by identity for the same stated reason, so the obvious second plant is to
// let its interpolation do it. Measured across all ten glyphs: ZERO mismatches, zero drift. The last sample's
// interpolation factor is (total - s0)/(s1 - s0) with s1 = total, which is exactly 1, and pts[j-1] + 1*(pts[j]
// - pts[j-1]) happens to be exact for these coordinates -- adjacent points of one polyline, not two unrelated
// resamplings. THE IDENTITY BITES ONLY WHERE THE OPERANDS ARE GENERAL. Shipping only the half that fires and
// staying quiet about the half that does not would be picking the fixture to suit the plant.
//
// ================================================================================================================
// THE REFUSAL HAS AN EXPIRY, AND THE EXPIRY IS MEASURED HERE RATHER THAN TRUSTED
// ================================================================================================================
//
// The header refuses morphicons because "SUBPATH CORRESPONDENCE is trivial with one subpath each, and CYCLIC
// ROTATION ALIGNMENT -- the hardest part -- ONLY APPLIES TO CLOSED PATHS and never runs", with the expiry
// written in: "THE MOMENT SOMEBODY WANTS A CLOSED OR MULTI-SUBPATH ICON, THIS FILE IS THE WRONG TOOL." So the
// two conditions are observables, and they are counted TWO WAYS because "closed" has two readings and the
// answers differ:
//
//     multi-subpath glyphs           0 of 10
//     Z-terminated glyphs            0 of 10   <- closed in the SVG-DECLARATION sense
//     endpoint-coincident glyphs     2 of 10   <- 0 and 8 return exactly to their start
//
// The header's "none closed" is CORRECT under the first reading and false under the second, and this file does
// not adjudicate which one morphicons' rotation alignment uses -- that would need the package, which is not a
// dependency here. Both numbers are reported so a reader can see that the refusal's premise is narrower than
// one sentence makes it sound, and so the trip-wire fires if a glyph set arrives with a Z in it.

import {
    parseStroke, arcLengths, resample, pairStrokes, morphAt, toPathD, DIGIT_STROKES,
} from "../../physics/mesh/strokeMorph.mjs";

export const STROKEMORPH_OBSERVABLES = [
    "straightLineWorstErr",
    "resampleEndpointMismatch", "resampleEndpointPlantedMismatch", "resampleEndpointBreakDetected",
    "morphZeroMismatch", "morphOneMismatch", "morphComparisons",
    "naiveLerpZeroMismatch", "naiveLerpOneMismatch", "naiveWorstDrift",
    "pathStringDiffPairs",
    "reversedPairs", "travelSavedWorst",
    "parserRefusals", "parserAccepted",
    "glyphs", "multiSubpathGlyphs", "zTerminatedGlyphs", "endpointCoincidentGlyphs",
];

const DEF = { N: 64, curveSteps: 16, lineA: [0, 0], lineB: [3, 4] };

/** Paths this parser must REFUSE. A parser that ignores what it does not understand produces a shape that is
 *  wrong in a way nothing downstream can see. */
const UNSUPPORTED = [
    "M 1 1 Q 2 2 3 3",                 // quadratic
    "M 1 1 Z",                         // close
    "M 1 1 A 1 1 0 0 1 2 2",           // arc
    "M 1 1 l 2 2",                     // relative lineto
    "M 1 1",                           // a single point is not a stroke
];

/** The lerp WITHOUT the endpoint identity -- the module's own recorded defect, as a parameter. */
const naiveMorph = (a, target, t) =>
    a.map((p, i) => [p[0] + t * (target[i][0] - p[0]), p[1] + t * (target[i][1] - p[1])]);

/** resample WITHOUT copying the endpoints. The second plant, kept because its NOT firing is the finding. */
function naiveResample(pts, N) {
    const s = arcLengths(pts), total = s[s.length - 1];
    const out = []; let j = 1;
    for (let k = 0; k < N; k++) {
        const target = (total * k) / (N - 1);
        while (j < s.length - 1 && s[j] < target) j++;
        const s0 = s[j - 1], s1 = s[j], f = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
        out.push([pts[j - 1][0] + f * (pts[j][0] - pts[j - 1][0]),
                  pts[j - 1][1] + f * (pts[j][1] - pts[j - 1][1])]);
    }
    return out;
}

const same = (p, q) => p[0] === q[0] && p[1] === q[1];

function buildStrokeMorph({ mode = "morph", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const N = Math.max(2, c.N | 0);
    const keys = Object.keys(DIGIT_STROKES);

    // ---- THE STRAIGHT LINE: a closed form against the search, with no morphing in it.
    // On a segment the arc-length-fraction-k/(N-1) point IS A + f*(B-A), which the resampler never forms.
    let straightWorst = 0;
    for (const n of [2, 3, 8, N]) {
        const out = resample([c.lineA.slice(), c.lineB.slice()], n);
        for (let k = 0; k < n; k++) {
            const f = k / (n - 1);
            straightWorst = Math.max(straightWorst, Math.hypot(
                out[k][0] - (c.lineA[0] + f * (c.lineB[0] - c.lineA[0])),
                out[k][1] - (c.lineA[1] + f * (c.lineB[1] - c.lineA[1]))));
        }
    }

    // ---- THE RESAMPLER'S ENDPOINT IDENTITY, and the plant that does not fire on it.
    //
    // *** v4070 -- "THE PLANT THAT DOES NOT FIRE ON IT" WAS HONEST AND LEFT THE CHECK UNWITNESSED. *** An
    // observable census flagged resampleEndpointMismatch as moved by nothing, which is the point of it -- a
    // resampler must return the original endpoints, so a nonzero count is the defect. But a load-bearing
    // negative needs a witness that it COULD have counted, and the one this file supplies does not work:
    // resampleEndpointPlantedMismatch reads 0 in both arms, and naiveWorstDrift measures the two resamplers
    // apart at 1.78e-15 -- MACHINE EPSILON. naiveResample is not a contrast here at all, so nothing on the
    // row shows the comparison can fire.
    //
    // (The MORPH's endpoint identity beside it is properly witnessed and stays as it is: naiveLerpOneMismatch
    // is 40 and the plant moves morphOneMismatch from 0 to 40. The gap is the resampler's alone.)
    //
    // So the detector is tested directly: an endpoint moved ONE UNIT off must be counted by the same `same()`
    // the row above trusts. Derived from the run rather than typed -- it perturbs whatever the resampler just
    // produced -- and it must equal the glyph count, so a comparison that silently stopped comparing shows up
    // as a number falling rather than as a zero that looks like success.
    let resEnd = 0, resEndPlanted = 0, resEndDetects = 0;
    for (const d of Object.values(DIGIT_STROKES)) {
        const p = parseStroke(d, c.curveSteps);
        const o = resample(p, N), np = naiveResample(p, N);
        if (!same(o[0], p[0])) resEnd++;
        if (!same(o[N - 1], p[p.length - 1])) resEnd++;
        if (!same(np[0], p[0])) resEndPlanted++;
        if (!same(np[N - 1], p[p.length - 1])) resEndPlanted++;
        const moved = [o[N - 1][0] + 1, o[N - 1][1]];
        if (!same(moved, p[p.length - 1])) resEndDetects++;
    }

    // ---- THE MORPH'S ENDPOINT IDENTITY, over every adjacent digit pair.
    let m0 = 0, m1 = 0, tot = 0, n0 = 0, n1 = 0, drift = 0, strDiff = 0, rev = 0, saved = 0;
    for (let i = 0; i < keys.length; i++) {
        const j = (i + 1) % keys.length;
        const a = resample(parseStroke(DIGIT_STROKES[keys[i]], c.curveSteps), N);
        const b = resample(parseStroke(DIGIT_STROKES[keys[j]], c.curveSteps), N);
        const pr = pairStrokes(a, b);
        if (pr.reversed) { rev++; saved = Math.max(saved, pr.travelForward - pr.travelReversed); }
        const target = pr.target;

        const at0 = planted ? naiveMorph(a, target, 0) : morphAt(a, target, 0);
        const at1 = planted ? naiveMorph(a, target, 1) : morphAt(a, target, 1);
        // The naive lerp measured DIRECTLY, honest or not: this is the load-bearing negative made positive,
        // and it must read the same under both so the plant is shown to be the real defect rather than noise.
        const nv0 = naiveMorph(a, target, 0), nv1 = naiveMorph(a, target, 1);

        for (let k = 0; k < N; k++) {
            tot++;
            if (!same(at0[k], a[k])) m0++;
            if (!same(at1[k], target[k])) m1++;
            if (!same(nv0[k], a[k])) n0++;
            if (!same(nv1[k], target[k])) { n1++; drift = Math.max(drift, Math.hypot(nv1[k][0] - target[k][0], nv1[k][1] - target[k][1])); }
        }
        // *** THE ARTEFACT IS BLIND: toPathD rounds to four places and the drift is 1.8e-15. ***
        if (toPathD(morphAt(a, target, 1)) !== toPathD(nv1)) strDiff++;
    }

    // ---- THE PARSER REFUSES RATHER THAN SKIPS.
    let refused = 0, accepted = 0;
    for (const bad of UNSUPPORTED) {
        try { parseStroke(bad, c.curveSteps); accepted++; } catch { refused++; }
    }

    // ---- THE REFUSAL'S EXPIRY CONDITIONS, counted two ways because "closed" has two readings.
    let multi = 0, zTerm = 0, coincident = 0;
    for (const d of Object.values(DIGIT_STROKES)) {
        if ((d.match(/\bM\b/g) || []).length > 1) multi++;
        if (/\bZ\b/i.test(d)) zTerm++;
        const p = parseStroke(d, c.curveSteps);
        if (same(p[0], p[p.length - 1])) coincident++;
    }

    return {
        straightLineWorstErr: straightWorst,
        resampleEndpointMismatch: resEnd, resampleEndpointPlantedMismatch: resEndPlanted,
        resampleEndpointBreakDetected: resEndDetects,
        morphZeroMismatch: m0, morphOneMismatch: m1, morphComparisons: tot,
        naiveLerpZeroMismatch: n0, naiveLerpOneMismatch: n1, naiveWorstDrift: drift,
        pathStringDiffPairs: strDiff,
        reversedPairs: rev, travelSavedWorst: saved,
        parserRefusals: refused, parserAccepted: accepted,
        glyphs: keys.length, multiSubpathGlyphs: multi, zTerminatedGlyphs: zTerm,
        endpointCoincidentGlyphs: coincident,
    };
}

const STROKEMORPH_MODES = ["morph"];   // v4074 -- the single source `modes` and `defaults()` both read

export const strokeMorphDevice = {
    plantKind: "method",
    modes: STROKEMORPH_MODES,
    name: "the-identity-that-was-half-true-and-invisible-in-the-output",
    observables: STROKEMORPH_OBSERVABLES,
    build: buildStrokeMorph,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "morph"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: STROKEMORPH_MODES.includes(mode) ? mode : STROKEMORPH_MODES[0], config: { ...DEF } }),
};

/** v3327's split: this half PRINTS and strokeMorphBind-selfcheck beside it is what exits nonzero. */
export function reportLines() {
    const h = buildStrokeMorph({ mode: "morph", config: {} });
    const p = buildStrokeMorph({ mode: "morph", config: { planted: true } });
    const L = [];
    L.push("[mesh/strokeMorph] half true, and invisible in the output");
    L.push("");
    L.push("  *** THE ARMCHAIR CLAIM, MEASURED -- 'a + 1*(b-a) IS b IN IEEE-754' ***");
    L.push("    a + 0*(b-a) == a      " + h.naiveLerpZeroMismatch + " mismatches of " + h.morphComparisons + "   <- TRUE");
    L.push("    a + 1*(b-a) == b      " + h.naiveLerpOneMismatch + " mismatches of " + h.morphComparisons + "  <- FALSE, worst drift " + h.naiveWorstDrift.toExponential(3));
    L.push("    At t=1 the SUBTRACTION rounds and then the ADDITION rounds again. A claim that holds at");
    L.push("    one end is the hardest kind to doubt, which is how it got written down.");
    L.push("    The shipped morphAt returns the endpoint ITSELF at both ends: " + h.morphZeroMismatch + " and " + h.morphOneMismatch + " mismatches.");
    L.push("");
    L.push("  THE RESAMPLER, AGAINST A CLOSED FORM WITH NO SEARCH IN IT");
    L.push("    straight segment, worst   " + h.straightLineWorstErr.toExponential(3) + "   (N = 2, 3, 8, 64)");
    L.push("    endpoint identity         " + h.resampleEndpointMismatch + " of 20 mismatches");
    L.push("");
    L.push("  DIRECTION BY MEASUREMENT, AND A PARSER THAT REFUSES");
    L.push("    reversed pairing wins on  " + h.reversedPairs + " of " + h.glyphs + " adjacent pairs, worst travel saved " + h.travelSavedWorst.toFixed(4));
    L.push("    unsupported ops refused   " + h.parserRefusals + " of " + (h.parserRefusals + h.parserAccepted) + "  (quadratic, close, arc, relative, single point)");
    L.push("");
    L.push("  UNDER THE PLANT -- let the lerp place the endpoints, the module's own recorded defect");
    L.push("    t=1 mismatches            " + h.morphOneMismatch + " -> " + p.morphOneMismatch + "   matching the " + h.naiveLerpOneMismatch + " measured directly");
    L.push("    t=0 mismatches            " + h.morphZeroMismatch + " -> " + p.morphZeroMismatch + "     that half was never wrong");
    L.push("    *** RENDERED PATH STRING  " + h.pathStringDiffPairs + " -> " + p.pathStringDiffPairs + " pairs differ -- BIT-IDENTICAL ***");
    L.push("    toPathD rounds to four places and the drift is 1.8e-15, so A TEST THAT COMPARED THE");
    L.push("    MODULE'S OWN OUTPUT WOULD CERTIFY THE BROKEN MORPH AND SEE NOTHING AT ALL.");
    L.push("");
    L.push("  THE SECOND PLANT THAT DOES NOT FIRE, REPORTED RATHER THAN DROPPED");
    L.push("    same fault on the resampler   " + h.resampleEndpointPlantedMismatch + " of 20 mismatches");
    L.push("    The last sample's factor is (total-s0)/(s1-s0) with s1 = total, exactly 1, and adjacent");
    L.push("    points of ONE polyline round exactly. THE IDENTITY BITES ONLY WHERE THE OPERANDS ARE");
    L.push("    GENERAL -- so the resampler's endpoint copy is right, but not shown load-bearing here.");
    L.push("");
    L.push("  THE REFUSAL'S EXPIRY, AS A TRIP-WIRE (counted two ways -- 'closed' has two readings)");
    L.push("    multi-subpath glyphs        " + h.multiSubpathGlyphs + " of " + h.glyphs);
    L.push("    Z-terminated glyphs         " + h.zTerminatedGlyphs + " of " + h.glyphs + "   <- closed, DECLARATION reading");
    L.push("    endpoint-coincident glyphs  " + h.endpointCoincidentGlyphs + " of " + h.glyphs + "   <- closed, GEOMETRIC reading (the 0 and the 8)");
    L.push("    'The moment somebody wants a closed or multi-subpath icon, this file is the wrong tool.'");
    L.push("    Both conditions are counted every run, so the refusal expires loudly rather than quietly.");
    return L;
}
