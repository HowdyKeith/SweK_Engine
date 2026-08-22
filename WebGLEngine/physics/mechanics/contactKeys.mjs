// WebGLEngine/physics/mechanics/contactKeys.mjs -- v3571
// ---------------------------------------------------------------------------------------------------------------
// THE TWO KEYS v3568 NAMED AND COULD NOT RUN, AND THE SECOND OF THEM KILLED THE EXACT ZERO I PROPOSED FOR IT.
//
// v3568 wrote swk_body_set_friction and swk_body_set_restitution into the shim, listed both in PENDING_REBUILD,
// and said the friction cone and the bounce ratio were blocked on a wasm rebuild. v3569 did the rebuild. This is
// what the two keys actually measure, and only one of them is the key I expected.
//
// ================================================================================================================
// 1. THE FRICTION CONE, AND THE DETECTOR IS THE ROUND'S FIRST FINDING
// ================================================================================================================
//
// A block on a slope slides iff tan(theta) > mu. THE RAMP IS NOT TILTED -- GRAVITY IS. Identical physics, and it
// avoids a rotated static hull entirely, so nothing in the measurement depends on the shim's transform path.
//
// THE FIRST DETECTOR WAS DISPLACEMENT AND IT WAS WRONG, in a way that looked like physics: bisecting on "did the
// box move more than 0.05" gave a critical angle 2.0% high at mu = 0.5, and 1.2% high at a threshold of 0.01.
// A CRITICAL ANGLE THAT MOVES WITH THE THRESHOLD IS MEASURING THE THRESHOLD. The cause is that a box BELOW the
// critical angle still creeps as it settles -- 1.5e-5 at half the critical angle, rising to 5.3e-4 at 99% of it,
// so any fixed displacement bound is crossed eventually by a block that is not sliding.
//
// *** THE VELOCITY IS A REAL BINARY AND THE DISPLACEMENT IS NOT. *** Below the critical angle the box's speed is
// EXACTLY 0.000e+0 -- zero, not small -- and above it O(0.1). So bisecting on |v| > tol gives the SAME ANSWER AT
// 1e-2, 1e-3 AND 1e-4, identical to six digits. A threshold-independent detector, which is what makes the number
// below a measurement rather than a choice.
//
// ================================================================================================================
// 2. AND THE RESIDUAL IS ADDITIVE, NOT THE 2% IT LOOKS LIKE
// ================================================================================================================
//
// With the honest detector the critical angle is still not atan(mu), and the excess REFINES TO A NONZERO LIMIT
// rather than away: 1.71% -> 2.00% -> 2.17% -> 2.25% as dt halves from 1/60 to 1/480, and 1.04% -> 2.22% as
// substeps go 1 to 16. *** A RESIDUAL THAT CONVERGES TO A NONZERO FLOOR UNDER REFINEMENT IS A PROPERTY OF THE
// MODEL AND NOT OF THE INTEGRATOR *** -- v3542's rule, in a new subject.
//
// AND THE MULTIPLICATIVE READING IS THE WRONG SHAPE. Across mu from 0.15 to 1.0, the RATIO runs 1.0687 down to
// 1.0136 -- five and a half points, and it would read as "the friction model is worst at low mu". THE DIFFERENCE
// tan(theta_c) - mu RUNS 0.0103 TO 0.0136 over the same 6.7x range. An additive offset of about 0.0097 plus a
// 0.39% slope reproduces every row. SO THE SOLVER IS NOT 5% WRONG AT LOW mu; IT IS ABOUT 0.01 OF tan HIGH
// EVERYWHERE, and at low mu that small constant is a large fraction of a small number.
//
// ================================================================================================================
// 3. THE BOUNCE, WHERE THE EXACT ZERO I PROPOSED IS FALSE AGAINST CORRECT SHIPPED CODE
// ================================================================================================================
//
// v3568 wrote: "e = 0 is an EXACT zero: the body must not leave the ground at all, which is a stronger falsifier
// than any tolerance." *** IT IS WRONG, AND THE SHIPPED SOLVER IS THE COUNTEREXAMPLE. *** At e = 0 a box dropped
// from 3 m rebounds at 0.0495 OF ITS IMPACT SPEED and rises 9.3 mm. Nothing is broken: A CONTACT SOLVER HAS TO
// RESOLVE PENETRATION, and pushing an interpenetrating body apart imparts separation velocity whether or not the
// material is bouncy. THAT IS RECOVERY, NOT RESTITUTION, and no restitution coefficient can switch it off.
//
// SECOND TIME IN THIS ARC A PROPOSED EXACT ZERO WOULD HAVE FIRED ON CORRECT SHIPPED CODE (physics/info/entropy
// was the first, and for the same reason: I asked a bound of a quantity the code was not computing). A KEY THAT
// FIRES ON CORRECT CODE IS WORSE THAN NO KEY, because the first thing anybody does with it is weaken it. Tested
// before it was built into anything, which is the only reason it is a finding rather than a defect.
//
// ALSO DEAD, AND IT IS WHY THE OBSERVABLE MOVED: THE GEOMETRIC HEIGHT SEQUENCE. h_n = e^(2n) h_0 needs a body
// that lands the same way every time, and A DROPPED BOX ROCKS AND CATCHES ITS EDGES -- measured apex ratios at
// e = 0.8 came back 0.336, 0.942, 0.643, which is a tumbling box and not a coefficient. box3d's shim exposes
// boxes only; a sphere would fix it and there is no sphere. SO THE OBSERVABLE IS THE DEFINITION ITSELF, |v_out| /
// |v_in| AT THE FIRST IMPACT, which needs no second bounce and no assumption about landing flat.
//
// ================================================================================================================
// 4. THE REPLACEMENT, AND IT IS SHARPER THAN THE KEY IT REPLACES
// ================================================================================================================
//
// The measured restitution is AFFINE IN THE REQUESTED e, and the slope is the same number to six digits across
// every one of nine intervals from e = 0.1 to 1.0:
//
//     measured = 0.964844 * e + 0.004923        slope spread across nine intervals: 7.2e-7
//
// NINE IDENTICAL SLOPES IS A STRUCTURAL CLAIM AND NOT A TOLERANCE. It says the solver applies the requested
// coefficient linearly and loses 3.5% of it, which is a MEASURED ENGINEERING NUMBER about shipped code rather
// than a verdict -- the shape the entropy round ended up in after losing its first key too.
//
// AND e = 0 SITS OFF THAT LINE BY 0.0446, which is how the two mechanisms are told apart: if the rebound at e = 0
// were just the affine model continued to zero it would read 0.0049, and it reads 0.0495. THE OFFSET IS NOT THE
// SAME THING AS THE LINE'S INTERCEPT, and only having both numbers shows it.
"use strict";
import { pathToFileURL } from "node:url";
import { initNode, mod, has } from "../box3d/box3dNode.mjs";
// v3630: THE ARITHMETIC MOVED, IT WAS NOT COPIED. This file could never be imported by a browser -- it pulls
// node:url and box3dNode at module scope -- so slopeSpeed/criticalAngle were structurally undoorable (v3617,
// second instance, found by Keith asking for a link). They now live in reposeOps.mjs, which has NO imports at
// all, and are RE-EXPORTED here so the two are the SAME FUNCTION OBJECT rather than two copies that agree today.
import { slopeSpeedWith, criticalAngleWith, gradeBoth } from "./reposeOps.mjs";
export { slopeSpeedWith, criticalAngleWith, gradeBoth };

const vy = (m = mod(), i = 1) => {
    const n = m._swk_body_count(), p = m._malloc(n * 3 * 4);
    m._swk_velocities(p, n);
    const v = m.HEAPF32[p / 4 + i * 3 + 1];
    m._free(p);
    return v;
};

export function frictionRestitutionAvailable() {
    return has("swk_body_set_friction") && has("swk_body_set_restitution");
}

// =================================================================================================================
// THE FRICTION CONE
// =================================================================================================================
/**
 * Tilt GRAVITY rather than the ramp. Returns the block's speed along the slope after `secs`.
 *
 * *** THE SPEED IS THE DETECTOR AND THE DISPLACEMENT IS NOT. *** A settling box creeps 1.5e-5 to 5.3e-4 below the
 * critical angle, so a displacement bound is crossed by a block that is not sliding and the recovered angle moves
 * with the bound. The speed below the critical angle is EXACTLY ZERO.
 */
export const slopeSpeed = (theta, mu, opts = {}) => slopeSpeedWith(mod(), theta, mu, opts);

/** Bisect on the BINARY outcome. atan(mu) is never consulted while searching -- only afterwards, to grade. */
export const criticalAngle = (mu, opts = {}) => criticalAngleWith(mod(), mu, opts);


/** The additive-versus-multiplicative comparison. `delta` is near-constant where `ratio` is not. */
export function frictionResidual(mus = [0.15, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0], opts = {}) {
    const rows = mus.map((mu) => ({ mu, ...criticalAngle(mu, opts) }));
    const spread = (f) => { const v = rows.map(f); return (Math.max(...v) - Math.min(...v)); };
    const meanDelta = rows.reduce((a, r) => a + r.delta, 0) / rows.length;
    return { rows, deltaSpread: spread((r) => r.delta), ratioSpread: spread((r) => r.ratio), meanDelta,
             deltaSpreadRel: spread((r) => r.delta) / meanDelta };
}

// =================================================================================================================
// RESTITUTION
// =================================================================================================================
/**
 * e as it is DEFINED: |v_out| / |v_in| at the first impact. Not a height ratio -- a dropped BOX rocks and catches
 * its edges, and the apex sequence measures the tumble rather than the coefficient.
 */
export function firstBounce(e, { h0 = 3, dt = 1 / 240, substeps = 8, secs = 3 } = {}) {
    const m = mod();
    m._swk_world_create(0, -9.8, 0);
    m._swk_body_box(0, 0, -0.5, 0, 50, 0.5, 50, 1);
    m._swk_body_box(1, 0, h0, 0, 0.5, 0.5, 0.5, 1);
    m._swk_body_set_restitution(0, e);
    m._swk_body_set_restitution(1, e);
    let vin = null, vout = null, prev = 0;
    for (let i = 0; i < secs / dt; i++) {
        m._swk_world_step(dt, substeps);
        const v = vy(m);
        if (vin === null && prev < -0.1 && v > prev + 0.02) { vin = prev; vout = v; }
        prev = v;
    }
    m._swk_world_destroy();
    return { vin, vout, measured: vin === null ? null : Math.abs(vout / vin) };
}

/** The affine fit, and the per-interval slopes are the claim -- nine identical numbers, not an average. */
export function restitutionResponse(es = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], opts = {}) {
    const measured = es.map((e) => firstBounce(e, opts).measured);
    const slopes = [];
    for (let i = 1; i < es.length; i++) slopes.push((measured[i] - measured[i - 1]) / (es[i] - es[i - 1]));
    const slope = slopes[0], intercept = measured[0] - slope * es[0];
    const zero = firstBounce(0, opts).measured;
    return {
        es, measured, slopes, slope, intercept,
        slopeSpread: (Math.max(...slopes) - Math.min(...slopes)) / Math.min(...slopes),
        zero, zeroOffLine: zero - intercept,
    };
}

export const MEASURED_V3571 = {
    myExactZeroWasWrongAgain:
        "*** v3568 WROTE 'e = 0 IS AN EXACT ZERO: THE BODY MUST NOT LEAVE THE GROUND AT ALL', AND THE SHIPPED " +
        "SOLVER IS THE COUNTEREXAMPLE. *** A box dropped from 3 m at e = 0 rebounds at 0.0495 of its impact " +
        "speed and rises 9.3 mm. Nothing is broken: a contact solver has to RESOLVE PENETRATION, and pushing an " +
        "interpenetrating body apart imparts separation velocity whether or not the material is bouncy. THAT IS " +
        "RECOVERY, NOT RESTITUTION. Second time in this arc a proposed exact zero would have fired on correct " +
        "shipped code, and for the same reason both times: I asked a bound of a quantity the code was not " +
        "computing. Tested BEFORE it was built into anything.",
    theReplacementIsLinearity:
        "The measured restitution is AFFINE in the requested e and the slope is the SAME NUMBER TO SIX DIGITS " +
        "across all nine intervals from 0.1 to 1.0 (spread 7.2e-7): measured = 0.964844 e + 0.004923. Nine " +
        "identical slopes is a STRUCTURAL claim, not a tolerance, and the 3.5% deficit is a measured engineering " +
        "number about shipped code. And e = 0 sits OFF that line by 0.0446, which is how recovery and " +
        "restitution are told apart -- the line's intercept is 0.0049 and the e = 0 rebound is ten times it.",
    theDetectorWasTheFirstFinding:
        "Bisecting the friction cone on DISPLACEMENT gave a critical angle that moved with the threshold (2.0% " +
        "high at 0.05, 1.2% at 0.01), because a settling box CREEPS below the critical angle -- 1.5e-5 at half " +
        "the critical angle rising to 5.3e-4 at 99% of it. The SPEED is a real binary: EXACTLY 0.000e+0 below " +
        "and O(0.1) above, so bisecting on |v| gives the identical answer at 1e-2, 1e-3 and 1e-4. A " +
        "THRESHOLD-INDEPENDENT DETECTOR IS WHAT MAKES THE NUMBER A MEASUREMENT RATHER THAN A CHOICE.",
    theResidualIsAdditive:
        "The friction excess REFINES TO A NONZERO LIMIT rather than away (1.71% -> 2.25% as dt halves from 1/60 " +
        "to 1/480; 1.04% -> 2.22% as substeps go 1 to 16), so it is the MODEL and not the integrator -- v3542's " +
        "rule in a new subject. AND THE MULTIPLICATIVE READING IS THE WRONG SHAPE: the ratio runs 1.0687 to " +
        "1.0136 across mu 0.15 to 1.0 and would read as 'worst at low mu', while tan(theta_c) - mu runs 0.0103 " +
        "to 0.0136 over the same 6.7x range. THE SOLVER IS ABOUT 0.01 OF tan HIGH EVERYWHERE, and at low mu a " +
        "small constant is a large fraction of a small number.",
};

// ---- FRONT DOOR --------------------------------------------------------------------------------------------------
export async function reportLines() {
    const st = await initNode();
    const L = [];
    L.push("[contactKeys] Friction and restitution, and the exact zero I proposed for the second one is false");
    L.push("");
    if (!st.ready) { L.push("  box3d wasm not loadable: " + st.reason); return L; }
    if (!frictionRestitutionAvailable()) {
        L.push("  the surface setters are absent from the artifact -- rebuild with build-box3d-wasm-clang.sh");
        return L;
    }
    const f = frictionResidual();
    L.push("  FRICTION CONE -- bisected on |v|, which is EXACTLY zero below the critical angle:");
    L.push("      mu     tan(theta_c)   ratio      delta = tan - mu");
    for (const r of f.rows)
        L.push("     " + r.mu.toFixed(2) + "     " + r.tan.toFixed(6) + "     " + r.ratio.toFixed(5) +
               "     " + r.delta.toFixed(6));
    L.push("    ratio spans " + f.ratioSpread.toFixed(4) + " while delta spans " + f.deltaSpread.toFixed(4) +
           " -- THE RESIDUAL IS ADDITIVE, about " + f.meanDelta.toFixed(4) + " of tan");
    L.push("");
    const r = restitutionResponse();
    L.push("  RESTITUTION -- |v_out|/|v_in| at the first impact, which is the definition:");
    L.push("    affine fit  measured = " + r.slope.toFixed(6) + " * e + " + r.intercept.toFixed(6));
    L.push("    nine per-interval slopes, spread " + r.slopeSpread.toExponential(2) + " -- structural, not fitted");
    L.push("    e = 0 rebounds at " + r.zero.toFixed(6) + " against the line's " + r.intercept.toFixed(6) +
           "  ->  OFF THE LINE BY " + r.zeroOffLine.toFixed(6));
    L.push("    *** THE EXACT ZERO v3568 PROPOSED IS FALSE. That rebound is PENETRATION RECOVERY, not");
    L.push("    restitution, and no coefficient switches it off. ***");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
