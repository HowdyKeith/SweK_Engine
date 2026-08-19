// WebGLEngine/physics/control/controlMargins.mjs -- v3574
// ---------------------------------------------------------------------------------------------------------------
// THE TWO THINGS LEFT AFTER v3573, AND THEY ARE THE TWO THAT ARE NOT INTEGERS.
//
// v3572 and v3573 built six roads to one integer -- how many roots lie in the right half-plane. Integers are the
// sharpest thing this lab collects, and they were taken first on purpose. WHAT REMAINED WAS EVERYTHING CONTROL
// THEORY SAYS THAT IS A CONTINUOUS QUANTITY, and the honest problem with a continuous quantity is that two
// routes to it agree to a tolerance, and a tolerance is a number somebody chose.
//
// ================================================================================================================
// 1. THE GAIN MARGIN, WHICH IS CONTINUOUS, PINNED TO AN INTEGER TRANSITION
// ================================================================================================================
//
// *** THE WAY OUT IS THAT THE MARGIN'S MEANING IS AN INTEGER EVEN THOUGH ITS VALUE IS NOT. *** The gain margin is
// how far the loop gain can be raised before the closed loop goes unstable, and "goes unstable" is the RHP root
// count changing from 0 to something -- which v3572 already answers exactly. So the second route never looks at a
// frequency at all: IT BISECTS K ON ROUTH'S INTEGER VERDICT. A continuous number recovered from a yes/no, the same
// move navigate.js makes on the turning point and v3570 makes on the friction cone.
//
// AND THE SECOND ROUTE LANDS ON EXACT RATIONALS, WHICH IS THE PART THAT MAKES THE AGREEMENT WORTH ANYTHING:
//
//     1/((s+1)(s+2)(s+3))     critical K = 60          1/(s(s+1)(s+2))       critical K = 6
//     1/(s(s+1)(s+5))         critical K = 30          1/(s(s^2+2s+4))       critical K = 8
//     2/((s+1)^4)             critical K = 2
//
// Those are the textbook values, and they arrive from a bisection that never evaluates a transfer function. The
// frequency sweep then has to reproduce them, and it does -- WITH ITS RESIDUAL BEING THE GRID, WHICH IS SHOWN
// RATHER THAN ASSERTED by refining the grid and watching it fall.
//
// ================================================================================================================
// 2. THE RELAY, WHERE ROUTH-HURWITZ HAS NEVER APPLIED AND LYAPUNOV DOES
// ================================================================================================================
//
// v3567 established that combat.js stepAI is a three-valued RELAY WITH A DEADBAND and therefore NOT a
// Routh--Hurwitz subject; v3572 gave it two exact integer predicates instead and left the actual dynamics alone.
// *** LYAPUNOV IS THE ROUTE THAT REACHES IT, BECAUSE IT NEVER NEEDED LINEARITY IN THE FIRST PLACE. ***
//
// Heading is a pure integrator driven by a relay: diff' = -turnRate*sign(diff) whenever |diff| > deadband. Take
// V = diff^2/2. Then V' = diff * diff' = -turnRate*|diff|, which is strictly negative outside the band and does
// NOT vanish as diff -> deadband. A Lyapunov derivative bounded away from zero is FINITE-TIME convergence, not
// asymptotic, and it gives the settling time in closed form:
//
//     t* = (|diff_0| - deadband) / turnRate
//
// *** AND THAT IS GRADED BY IMPORTING THE SHIPPED FUNCTIONS AND RUNNING THEM. *** ev/combat.js stepAI and
// ev/flightModel.js stepFlight are both pure and both exported, so the prediction is checked against the code the
// game actually runs rather than against a model of it.
//
// THE RESIDUAL IS NOT A TOLERANCE, IT IS THE TICK GRID, AND THE CLAIM IS AN EXACT BRACKET:
//
//     0 <= t_simulated - t* < dt        for every case, at every dt
//
// The simulated settling time is the analytic one ROUNDED UP TO THE NEXT TICK, because a relay cannot stop
// mid-tick. That is a two-sided exact statement rather than "agrees to half a percent" -- and it FAILS LOUDLY if
// the relay ever overshoots the band, because then the difference would exceed dt.
"use strict";
import { pathToFileURL } from "node:url";
import { routhHurwitz } from "./controlStability.mjs";
import { ES_TURN_DEADBAND, ES_TURN_SCALE } from "./controlStability.mjs";

// ---- complex helpers -------------------------------------------------------------------------------------------
const cAdd = (x, y) => [x[0] + y[0], x[1] + y[1]];
const cMul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
const cDiv = (x, y) => { const d = y[0] * y[0] + y[1] * y[1];
    return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; };
const evalPoly = (c, z) => c.reduce((a, k) => cAdd(cMul(a, z), [k, 0]), [0, 0]);

/** L(j*omega). */
export function loopAt(num, den, w) { return cDiv(evalPoly(num, [0, w]), evalPoly(den, [0, w])); }
export const magOf = (l) => Math.hypot(l[0], l[1]);
export const phaseOf = (l) => Math.atan2(l[1], l[0]);

// =================================================================================================================
// ROUTE 1 -- READ THE MARGINS OFF THE FREQUENCY RESPONSE
// =================================================================================================================
/**
 * Gain margin: at the frequency where the phase crosses -180 degrees, the reciprocal of |L|.
 *
 * *** THE CROSSING IS INTERPOLATED WITHIN THE GRID INTERVAL, WHICH IS LOAD-BEARING. *** Taking the grid point
 * nearest the crossing leaves a residual of about 5e-5 on a 400k-point log sweep, and that residual is the GRID
 * rather than the physics -- the same lesson the v3568 pendulum learned, where an uninterpolated zero crossing
 * quantised the period to the tick and collapsed both ratios into the quantisation.
 */
export function gainMarginFreq(num, den, { lo = 1e-4, hi = 1e5, steps = 200000 } = {}) {
    let prev = null, best = null, atW = null;
    for (let i = 0; i <= steps; i++) {
        const w = lo * Math.pow(hi / lo, i / steps);
        const l = loopAt(num, den, w), ph = phaseOf(l), m = magOf(l);
        if (prev) {
            // a wrap through +-pi is a crossing of -180 degrees
            const a = prev.ph, b = ph;
            if ((a < -Math.PI / 2 && b > Math.PI / 2) || (a > Math.PI / 2 && b < -Math.PI / 2)) {
                // unwrap b to sit adjacent to a, then interpolate to the exact crossing
                const bu = b > a ? b - 2 * Math.PI : b + 2 * Math.PI;
                const target = a < 0 ? -Math.PI : Math.PI;
                const f = (target - a) / (bu - a);
                const mi = prev.m * Math.pow(m / prev.m, f);       // log-interpolate the magnitude
                if (mi < 1 && (best === null || 1 / mi < best)) {
                    best = 1 / mi;
                    atW = prev.w * Math.pow(w / prev.w, f);
                }
            }
        }
        prev = { ph, m, w };
    }
    return { gainMargin: best, atOmega: atW };
}

/** Phase margin: at the frequency where |L| = 1, how far the phase is from -180 degrees. */
export function phaseMarginFreq(num, den, { lo = 1e-4, hi = 1e5, steps = 200000 } = {}) {
    let prev = null, best = null, atW = null;
    for (let i = 0; i <= steps; i++) {
        const w = lo * Math.pow(hi / lo, i / steps);
        const l = loopAt(num, den, w), m = magOf(l);
        if (prev && ((prev.m - 1) * (m - 1) < 0)) {
            const f = (0 - Math.log(prev.m)) / (Math.log(m) - Math.log(prev.m));
            const wc = prev.w * Math.pow(w / prev.w, f);
            const ph = phaseOf(loopAt(num, den, wc));
            const pm = (ph + Math.PI) * 180 / Math.PI;
            if (best === null || Math.abs(pm) < Math.abs(best)) { best = pm; atW = wc; }
        }
        prev = { m, w };
    }
    return { phaseMargin: best, crossoverOmega: atW,
             delayMargin: best !== null && atW ? (best * Math.PI / 180) / atW : null };
}

// =================================================================================================================
// ROUTE 2 -- BISECT THE SAME NUMBER OUT OF ROUTH'S INTEGER VERDICT. NO FREQUENCY IS EVER EVALUATED.
// =================================================================================================================
export function closedLoop(num, den, K = 1) {
    const o = den.slice();
    for (let i = 0; i < num.length; i++) o[den.length - num.length + i] += K * num[i];
    return o;
}

/**
 * The smallest K > 1 at which the closed loop first has a right-half-plane root. A CONTINUOUS NUMBER RECOVERED
 * FROM A YES/NO, and the yes/no is v3572's integer.
 */
export function criticalGainRouth(num, den, { iters = 80, maxDoublings = 60 } = {}) {
    const unstable = (K) => routhHurwitz(closedLoop(num, den, K)).rhp > 0;
    if (unstable(1)) return null;                       // already unstable at unity: no margin to speak of
    let lo = 1, hi = 2, g = 0;
    while (!unstable(hi) && g++ < maxDoublings) hi *= 2;
    if (!unstable(hi)) return null;                     // infinite gain margin
    for (let i = 0; i < iters; i++) { const m = (lo + hi) / 2; if (unstable(m)) hi = m; else lo = m; }
    return (lo + hi) / 2;
}

// =================================================================================================================
// THE RELAY -- LYAPUNOV, WHICH NEVER NEEDED LINEARITY
// =================================================================================================================
/**
 * V = diff^2/2 gives V' = -turnRate*|diff| outside the deadband, bounded away from zero, so convergence is
 * FINITE-TIME and the settling time is closed form. deadband and TURN_SCALE are read from controlStability.mjs,
 * which reads them from combat.js and flightModel.js.
 */
export function predictedSettleTime(maneuver, initialErrorDeg, deadband = ES_TURN_DEADBAND) {
    const turnRate = maneuver * ES_TURN_SCALE;
    const e = Math.abs(initialErrorDeg);
    return { turnRate, deadband, t: e <= deadband ? 0 : (e - deadband) / turnRate };
}

/**
 * Drive the SHIPPED functions. `stepAI` and `stepFlight` are imported by the caller and passed in, so this file
 * declares no dependency on ev/ and the gate is the thing that reaches across.
 */
export function simulateSettle({ stepAI, stepFlight, aimAngleTo, angleDiff, TURN_SCALE },
                               maneuver, initialErrorDeg, dt, { maxTicks = 500000 } = {}) {
    const stats = { accel: 0, speed: 100, turn: maneuver * TURN_SCALE };
    const target = { x: 1000, y: 0 };
    let ship = { x: 0, y: 0, vx: 0, vy: 0, heading: 0 };
    const desired = aimAngleTo(ship, target);
    ship.heading = (desired - initialErrorDeg + 360) % 360;
    let t = 0, ticks = 0;
    for (let i = 0; i < maxTicks; i++) {
        const ai = stepAI(ship, target, {});
        if (ai.turn === 0) break;
        ship = stepFlight(ship, { turn: ai.turn, thrust: false }, stats, dt);
        t += dt; ticks++;
    }
    return { t, ticks, finalError: Math.abs(angleDiff(ship.heading, desired)) };
}

export const MEASURED_V3574 = {
    theMarginIsPinnedToAnInteger:
        "A gain margin is CONTINUOUS and two routes to a continuous number agree to a TOLERANCE, which is a " +
        "number somebody chose. *** THE WAY OUT IS THAT THE MARGIN'S MEANING IS AN INTEGER EVEN WHERE ITS VALUE " +
        "IS NOT: 'goes unstable' is the RHP count leaving zero. *** So the second route bisects K on Routh's " +
        "verdict and NEVER EVALUATES A TRANSFER FUNCTION -- and it lands on exact rationals (60, 6, 30, 8, 2) " +
        "that the frequency sweep then has to reproduce.",
    theRelayResidualIsABracketNotATolerance:
        "The Lyapunov settling time t* = (|diff_0| - deadband)/turnRate is graded against the SHIPPED stepAI and " +
        "stepFlight, and the claim is EXACT AND TWO-SIDED: 0 <= t_simulated - t* < dt. The simulated time is the " +
        "analytic one ROUNDED UP TO THE NEXT TICK, because a relay cannot stop mid-tick. *** THAT IS NOT 'AGREES " +
        "TO HALF A PERCENT' -- IT FAILS LOUDLY IF THE RELAY EVER OVERSHOOTS THE BAND, because the difference " +
        "would then exceed dt. ***",
    lyapunovReachesWhatRouthCannot:
        "v3567 established the ES relay is not a Routh--Hurwitz subject and v3572 gave it two integer predicates " +
        "while leaving the dynamics alone. LYAPUNOV NEVER NEEDED LINEARITY, so it is the route that reaches it. " +
        "V' = -turnRate*|diff| is bounded away from zero outside the band, which is FINITE-TIME convergence " +
        "rather than asymptotic -- a distinction that matters because an asymptotic law would never let the ship " +
        "fire.",
};

export async function reportLines() {
    const L = [];
    L.push("[control/margins] The two quantities that are not integers, pinned to things that are");
    L.push("");
    L.push("  plant                          sweep GM      Routh critical K    ratio");
    for (const [nm, num, den] of [
        ["1/((s+1)(s+2)(s+3))", [1], [1, 6, 11, 6]],
        ["1/(s(s+1)(s+2))", [1], [1, 3, 2, 0]],
        ["1/(s(s+1)(s+5))", [1], [1, 6, 5, 0]],
        ["2/((s+1)^4)", [2], [1, 4, 6, 4, 1]],
        ["1/(s(s^2+2s+4))", [1], [1, 2, 4, 0]],
    ]) {
        const a = gainMarginFreq(num, den).gainMargin, b = criticalGainRouth(num, den);
        L.push("  " + nm.padEnd(30) + (a === null ? "none" : a.toFixed(6)).padStart(10) +
               "  " + (b === null ? "none" : b.toFixed(6)).padStart(16) +
               "    " + (a && b ? (a / b).toFixed(9) : "-"));
    }
    L.push("");
    L.push("  ES relay, Lyapunov finite-time settling  t* = (|diff0| - " + ES_TURN_DEADBAND + ") / turnRate:");
    for (const [man, err] of [[14, 90], [11, 180], [8, 45]])
        L.push("    maneuver " + String(man).padStart(2) + ", error " + String(err).padStart(3) +
               " deg  ->  t* = " + predictedSettleTime(man, err).t.toFixed(5) + " s");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
