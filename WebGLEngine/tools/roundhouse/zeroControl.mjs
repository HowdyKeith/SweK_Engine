// tools/roundhouse/zeroControl.mjs
//
// v4477 -- THE ZERO-RANGE SWEEP GETS A POSITIVE CONTROL BACK, ELEVEN HUNDRED VERSIONS AFTER LOSING ONE.
//
// THE DEBT. v2911 built zeroRangeSweep to find exact zeros that a default-only census cannot see, and proved it
// worked by finding optics.airy.airyRingErrFrac = 0 at the nSamples clamp. v2931 CURED that zero on purpose --
// firstMinimumRefined replaced a grid-quantised estimator and the grading moved to the exact j(1,1)/pi -- and
// v3313 found the control gone. v3314 established the cause and recorded the loss honestly rather than papering
// it: "this sweep's ability to find an exact zero is UNPROVEN until a replacement control is planted." Nothing
// planted one. v4353 ran sixteen claims through the instrument and wrote, in its own header:
//
//     *** THE SWEEP HAS HAD NO POSITIVE CONTROL SINCE v3313, AND THIS ROUND JUST MADE SIXTEEN CLAIMS WITH IT. ***
//
// It then declined to plant a replacement, and the reason it gave is the standard this file has to meet:
//
//     "A control whose mechanism is not understood is not a control; it is a second unexplained zero standing
//      where the explanation should be."
//
// WHAT WAS NOT UNDERSTOOD, AND WHAT IT COST. The candidate has always been splat.integral.isoRollDeviation. The
// register's sentence for it -- written at v2912 and unchanged since -- reads:
//
//     "isotropic covariance scaled by a dyadic sigma^2; rotation is an exact exponent shift, so the deviation is
//      exactly zero for power-of-two sigma"
//
// Measured across twenty sigma values that sentence did not fit: the deviation is also exactly zero at 1.05,
// 1.1, 1.2, 1.3, 1.5, 2 and 3, none of them powers of two. That reading produced a two-disjunct theory --
// "dyadic OR sigma >= 1" -- with the second disjunct unexplained, and it was one edit from being planted.
//
// THERE IS NO SECOND DISJUNCT. splatDefaults clamps sigma to 1. Every one of those seven rows IS THE sigma = 1
// ROW wearing a different label, because sweepDevice recorded the value it ASKED FOR rather than the value the
// device used. The instrument's own coordinate manufactured the mechanism. That defect is fixed in sweepDevice
// at this same version, and 5612 of the 17759 points the full sweep visits were mislabelled the same way.
//
// ------------------------------------------------------------------------------------------------------------
// THE MECHANISM, IN THREE TIERS. Only the first is used as the control's prediction, and the reason is that only
// the first can be evaluated WITHOUT CALLING THE MODULE UNDER TEST.
//
//   A -- GUARANTEED ZERO, derived from the exponent arithmetic alone.
//        For an isotropic covariance the world matrix is exactly diag(s2,s2,s2): covarianceFromScaleRot with the
//        identity quaternion multiplies by exact 0s and 1s. The camera-space covariance is W diag(s2) W^T, whose
//        (0,0) entry evaluates as fl( fl(c*s2)*c + fl(s*s2)*s ). WHEN s2 IS A POWER OF TWO every multiplication
//        by s2 is an exponent shift with no mantissa rounding, so that expression is exactly s2 * fl(fl(c^2) +
//        fl(s^2)) -- and it equals s2 exactly when fl(cos^2 t + sin^2 t) === 1.
//        BOTH CONDITIONS ARE REQUIRED AND THE SECOND ONE HAS BEEN SILENT SINCE v2912. All three of the device's
//        roll angles happen to satisfy it; roughly one angle in six does not, and at those a dyadic sigma gives
//        a NON-zero deviation. The register's sentence would have mispredicted every one of them.
//
//   B -- the camera-space rotation is a bit-for-bit no-op. A implies B, and B implies a zero deviation. B is
//        BROADER than A and holds at sigmas that are not dyadic at all, by rounding coincidence -- sigma = 0.13
//        is one, and the sweep itself found it. B is instrumentation here, not the prediction: evaluating it
//        means running the module's own mat3mul, which is one level below the observable rather than independent
//        of it.
//
//   C -- the projection absorbs a real difference. The camera-space covariance genuinely differs and the
//        J M J^T chain rounds the difference away, so the observable reads exactly zero over arithmetic that did
//        not cancel. This tier is why the mechanism is SUFFICIENT AND NOT NECESSARY, and the gate exhibits a
//        case rather than asserting it away.
//
// SO THE CONTROL PREDICTS IN ONE DIRECTION ONLY, and says so. "A holds" implies "exactly zero" with no measured
// counterexample in 1848 cells. "Exactly zero" does NOT imply "A holds". A control that claimed the biconditional
// would be a fitted curve wearing a derivation's clothes, and would go red the first time tier C fired.
//
// ------------------------------------------------------------------------------------------------------------
// WHAT MAKES THIS A CONTROL RATHER THAN A FACT ABOUT SPLAT. A positive control certifies an INSTRUMENT. The
// arms below run zeroRangeSweep itself -- not a re-implementation of its zero-detection -- over a sigma range
// containing a guaranteed zero and over one containing none, and require its verdict to agree with the device's
// own output at every point. It can fail: if the sweep stops finding zeros, arm 2 goes red; if it starts
// reporting them everywhere, arm 2 goes red from the other side.

import { splatDevice, ISO_ROLL_ANGLES } from "./splatBind.mjs";
import { covarianceFromScaleRot, projectCovariance, rotZ, mat3mul, mat3T } from "../../physics/splat/gaussianSplat.js";

export const CONTROL = { device: "splat", mode: "integral", field: "isoRollDeviation", knob: "sigma" };

/**
 * THE COERCION CENSUS, RECORDED RATHER THAN QUOTED. Every count this round states about the full sweep comes
 * from here, and the method is written down so the numbers can be re-derived instead of re-remembered.
 *
 * METHOD: for every device in DEVICE_NAMES with a defaults(), for every mode in deviceModeTable(), for every
 * finite numeric knob in that mode's default config, generate knobRange(value) and ask the device's own
 * defaults() what it would use for each. A point is COERCED when the answer differs from the request; a
 * knob-range is COLLAPSED when its requested values produce fewer distinct effective values than there are
 * requests. Measured at v4477 on this box, single-threaded, no device builds -- defaults() only, so the census
 * is cheap and does not depend on any simulation finishing.
 *
 * The sweep now totals the same quantities for whatever scope it is actually run over (`coercion` on its
 * result), so this record is the wide reading and the sweep is the live one. They are computed by the same
 * definition in sweepDevice.coercionSummary; this row is not a second implementation.
 */
export const COERCION_CENSUS_V4477 = Object.freeze({
    measuredAt: "v4477",
    sweptPoints: 17759,
    coerced: 5612,
    knobDropped: 0,
    collapsedRanges: 1225,
    // The one that made this round: splat.integral.sigma is NOT among the collapsed ranges, because
    // knobRange(0.1) stops at 1.0. The clamp was hit by a HAND-CHOSEN range walked while reading the field,
    // not by the sweep -- which is why the mislabelling survived a full sweep at v4353 without showing itself.
    splatSigmaCollapsesUnderKnobRange: false,
});

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * PREDICATE 1. sigma^2 is a power of two, so every multiplication by it is an exponent shift.
 * Deliberately arithmetic-only: it calls nothing in gaussianSplat.js, which is what lets it PREDICT rather than
 * re-measure. Note it is sigma SQUARED that must be dyadic, and squaring is where a non-dyadic sigma can still
 * land on one -- so this asks the question of the value the arithmetic actually uses.
 */
export function dyadicSquare(sigma) {
    return isPowerOfTwo(sigma * sigma);
}

/**
 * *** THE OBVIOUS SPELLING OF THIS IS WRONG, AND IT PASSED EVERY LITERAL THE GATE HAD. ***
 *
 * `Number.isInteger(Math.log2(q))` is not a power-of-two test. Math.log2(0.031249999999999993) returns EXACTLY
 * -5 -- the argument is one ulp below 2^-5 and the logarithm rounds onto the integer -- so the predicate
 * accepted a neighbour of a power of two and the derivation promised an exact zero it did not get, at 252 of
 * 2002 cells.
 *
 * IT WAS NOT CAUGHT BY THE ASSERTIONS. It was caught because dyadicSigmas() GENERATES its sigmas as 2^(e/2)
 * instead of listing 0.125, 0.25, 0.5, 1 by hand. Against a hand-written list of exact powers of two the broken
 * predicate scores a flawless pass, because every value on that list is one it gets right. A control built on
 * literals that happen to work is the thing this round exists to stop planting.
 *
 * The replacement reads the mantissa. A finite positive double is a power of two exactly when its 52 mantissa
 * bits are all zero, and that is a fact about the representation rather than about a transcendental function's
 * rounding. Subnormals are handled by the exponent field being zero with a single mantissa bit set, so they are
 * tested the same way and are correctly accepted.
 */
const POT_VIEW = new DataView(new ArrayBuffer(8));
export function isPowerOfTwo(q) {
    if (!Number.isFinite(q) || q <= 0) return false;
    POT_VIEW.setFloat64(0, q);
    const hi = POT_VIEW.getUint32(0), lo = POT_VIEW.getUint32(4);
    const mantissaHi = hi & 0x000fffff;
    const exponent = (hi >>> 20) & 0x7ff;
    if (exponent === 0) {                       // subnormal: a power of two iff exactly one mantissa bit is set
        const bits = (BigInt(mantissaHi) << 32n) | BigInt(lo);
        return bits !== 0n && (bits & (bits - 1n)) === 0n;
    }
    return mantissaHi === 0 && lo === 0;
}

/**
 * PREDICATE 2. The condition that has been missing from the register since v2912. Written as the same three
 * operations the covariance product performs -- two squarings and one addition -- because "cos^2 + sin^2 = 1" is
 * true in mathematics and is the thing in question in floating point.
 */
export function unitCircleExact(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return c * c + s * s === 1;
}

/**
 * TIER A. Sufficient, not necessary. Both conditions, over every angle the device actually rolls through.
 *
 * *** TAKES THE EFFECTIVE SIGMA, NOT THE REQUESTED ONE, AND THE DIFFERENCE IS THE WHOLE ROUND. *** It does not
 * clamp for you: guaranteedZero(3) is FALSE because 9 is not a power of two, while the device clamps 3 to 1 and
 * reads exactly zero. Both statements are correct about different questions, and answering the second with the
 * first is what produced a mechanism with a disjunct that does not exist. Pass effectiveSigma(x) -- controlGrid
 * does, and the gate asserts the two disagree so the hazard stays visible rather than being smoothed over.
 */
export function guaranteedZero(sigma, angles = ISO_ROLL_ANGLES) {
    return dyadicSquare(sigma) && angles.every(unitCircleExact);
}

/**
 * The sigma the device will use. The whole false mechanism came from predicting at the requested value and
 * measuring at the clamped one, so the control asks the device rather than re-deriving its clamp.
 */
export function effectiveSigma(sigma) {
    return splatDevice.defaults({ mode: CONTROL.mode, config: { sigma } }).config.sigma;
}

/** TIER B, as instrumentation. One level below the observable: camera space, before the projection. */
export function cameraRotationIsNoOp(sigma, theta) {
    const S3 = covarianceFromScaleRot([sigma, sigma, sigma], { x: 0, y: 0, z: 0, w: 1 });
    const rot = mat3mul(mat3mul(rotZ(theta), S3), mat3T(rotZ(theta)));
    const flat = mat3mul(mat3mul(I3, S3), mat3T(I3));
    return rot.every((v, i) => v === flat[i]);
}

/** The observable at ONE angle, through the shipped projection. The device reports the max over three. */
export function rollAt(sigma, theta, { z, f } = {}) {
    const cfg = splatDevice.defaults({ mode: CONTROL.mode, config: {} }).config;
    const zz = z ?? cfg.z, ff = f ?? cfg.f;
    const S3 = covarianceFromScaleRot([sigma, sigma, sigma], { x: 0, y: 0, z: 0, w: 1 });
    const base = projectCovariance(S3, I3, [0, 0, zz], ff);
    const S = projectCovariance(S3, rotZ(theta), [0, 0, zz], ff);
    return Math.max(Math.abs(S.xx - base.xx), Math.abs(S.yy - base.yy), Math.abs(S.xy - base.xy));
}

/** The SHIPPED observable, straight out of the device. This is what the sweep sees. */
export async function deviceRoll(sigma) {
    const out = await splatDevice.build({ mode: CONTROL.mode, config: { sigma } });
    return out.isoRollDeviation;
}

/**
 * The control's grid: predict with tier A, measure with the module, and report the disagreements rather than a
 * score. `guaranteedNonZero` is the count that must be zero -- a cell where the derivation promised an exact zero
 * and did not get one. `unexplainedZero` is tier C and is EXPECTED to be non-empty; it is reported, not failed.
 */
export function controlGrid({ sigmas, angles, predict = null }) {
    // `predict` is injectable for ONE reason: a report of "no counterexamples" is worthless unless the path that
    // reports counterexamples has been shown to fire. The gate runs this grid a second time with the register's
    // one-condition reading -- dyadic sigma alone, the angle condition dropped -- and requires the counterexample
    // list to be NON-empty. Without that, hardcoding `guaranteedButNonZero: []` would keep the control green.
    const rule = predict || ((s, t) => dyadicSquare(s) && unitCircleExact(t));
    const cells = [];
    for (const s0 of sigmas) {
        const s = effectiveSigma(s0);
        for (const t of angles) {
            const predicted = rule(s, t);
            const measured = rollAt(s, t);
            cells.push({ requested: s0, sigma: s, theta: t, predicted, measured, zero: measured === 0 });
        }
    }
    const guaranteed = cells.filter((c) => c.predicted);
    return {
        cells,
        guaranteed: guaranteed.length,
        // MUST BE EMPTY. The derivation broke if it is not.
        guaranteedButNonZero: guaranteed.filter((c) => !c.zero),
        // Tier B: A implies B, and a counterexample would mean the exponent argument is wrong about camera space.
        guaranteedButRotating: guaranteed.filter((c) => !cameraRotationIsNoOp(c.sigma, c.theta)),
        // Tier C: expected to be non-empty. Sufficient is not necessary.
        unexplainedZero: cells.filter((c) => c.zero && !c.predicted),
        zeros: cells.filter((c) => c.zero).length,
        nonZeros: cells.filter((c) => !c.zero).length,
    };
}

/**
 * Sigma values whose SQUARE is dyadic, generated rather than listed, so the grid is not a set of literals that
 * happen to pass. Powers of two within the device's clamp, plus their square roots where those are exact.
 */
export function dyadicSigmas() {
    const out = [];
    for (let e = 0; e >= -12; e--) {
        const s = Math.pow(2, e / 2);            // s^2 = 2^e exactly for even e; odd e gives an irrational s
        if (dyadicSquare(s) && s === effectiveSigma(s)) out.push(s);
    }
    return [...new Set(out)];
}

/**
 * The census above, re-derived. Uses the devices' own defaults() and runs no builds, so it costs seconds rather
 * than the hours a full sweep costs -- which is the point: the number this round quotes must be checkable by
 * the gate that quotes it, not remembered from a scratch script. Counts by the same definition sweepDevice uses.
 */
export async function coercionCensus() {
    const { getDevice, DEVICE_NAMES } = await import("./devices.mjs");
    const { deviceModeTable } = await import("./deviceModes.mjs");
    const { knobRange } = await import("./zeroRangeSweep.mjs");
    const { effectiveKnob, sweptAtOf, coercionSummary } = await import("./sweepDevice.mjs");
    const modes = await deviceModeTable();
    let sweptPoints = 0, coerced = 0, knobDropped = 0, collapsedRanges = 0;
    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;
        let dev;
        try { dev = await getDevice(name); } catch { continue; }
        if (typeof dev.defaults !== "function") continue;
        for (const mode of ms) {
            let cfg;
            try { cfg = (dev.defaults({ mode }) || {}).config || {}; } catch { continue; }
            for (const [k, v] of Object.entries(cfg)) {
                if (typeof v !== "number" || !Number.isFinite(v)) continue;
                const values = knobRange(v);
                const pts = values.map((val) => ({ sweptAt: sweptAtOf(k, val, effectiveKnob(dev, mode, cfg, k, val)) }));
                const c = coercionSummary(pts, values);
                sweptPoints += c.points;
                coerced += c.coerced;
                knobDropped += c.points - c.answerable;
                if (c.distinctEffective !== null && c.distinctEffective < c.distinctRequested) collapsedRanges++;
            }
        }
    }
    return { sweptPoints, coerced, knobDropped, collapsedRanges };
}

/** Angles satisfying predicate 2, and angles violating it -- both found by asking the predicate, not by listing. */
export function splitAngles(candidates) {
    return { exact: candidates.filter(unitCircleExact), inexact: candidates.filter((t) => !unitCircleExact(t)) };
}

export function angleLadder(n = 200, step = 0.031) {
    const out = [];
    for (let i = 1; i <= n; i++) out.push(i * step);
    return out;
}

/**
 * FROZEN BEFORE THE ARMS RUN. This is the claim the control makes about the INSTRUMENT, not about splat.
 * Written here so a reader can see what was predicted without reading the assertions that check it.
 */
export const CONTROL_CLAIM = Object.freeze({
    plantedAt: "v4477",
    replaces: "optics.airy.airyRingErrFrac, cured at v2931 and recorded lost at v3313/v3314",
    field: "splat.integral.isoRollDeviation",
    direction: "sufficient",
    conditions: [
        "sigma^2 is a power of two (every multiplication by it is an exact exponent shift)",
        "fl(cos^2 t + sin^2 t) === 1 at every one of the device's roll angles",
    ],
    // The half the register never said. Kept as a field so it cannot be dropped by editing prose.
    secondConditionSilentSince: "v2912",
    predicts: "exactly zero at every cell where both conditions hold",
    doesNotPredict: "that a non-guaranteed cell is non-zero -- rounding in the projection produces zeros the " +
        "derivation does not cover, and the sweep found one at sigma = 0.13",
    instrumentArm: "zeroRangeSweep itself, over sigma only, must report the hit iff the device's own output is 0",
});
