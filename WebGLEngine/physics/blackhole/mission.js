// WebGLEngine/physics/blackhole/mission.js -- v2877
//
// MISSION PLANNING: a proposer states an objective, a controller attempts it, and THE MEASUREMENT DECIDES.
//
// v2876 built the controller -- one bit per trial, bisect, land on the exact circular L. This is the layer above:
// something proposes WHERE to go, and this adjudicates whether that was possible, whether it was achieved, and
// whether the achievement is worth anything.
//
// THE PROPOSER CAN BE ANYTHING -- a model in the roundhouse, a script, a person at a keyboard. That is deliberate
// and it is the whole point: THE PROPOSER IS NOT THE AUTHORITY. The roundhouse learned this the hard way, and it
// is written into its design that the adult in the room is the verifier rather than a bigger model. So this file
// contains no model calls at all. It takes an objective from wherever, and it answers with a measurement.
//
// THREE VERDICTS, AND THE LAST TWO ARE WHY THIS EXISTS:
//   ACHIEVED    the objective was met, and the exact answer confirms it afterwards.
//   REFUTED     the objective was COHERENT but the physics says no. "A stable circular orbit at 4M" is a
//               perfectly sensible English sentence describing something that cannot happen. The controller
//               finds the right L and the stability test refuses it.
//   IMPOSSIBLE  the objective was not even coherent -- a circular orbit at 2.5M, inside the photon sphere.
//
// A planner that could only report ACHIEVED would be a yes-man with a physics engine attached.
//
// AND ONE OBJECTIVE HAS AN EXACT ANSWER NOBODY IS TOLD: "get as close as you can and STAY there". The answer is
// the ISCO, exactly 6M. findLowestStable() bisects on MEASURED stability -- nudge an orbit, watch whether the
// excursion grows -- and never mentions 6M. That the lab can rediscover its own innermost stable orbit by
// experiment is a sharper result than being able to steer to it once told.
"use strict";
import { steerToCircular, stabilityOf, measureOrbit, NAV } from "./navigate.js";
import { circularL, iscoRadius, photonSphere, horizon, redshift, timeDilation, circularOmega, circularPeriod } from "./probe.js";

export const VERDICT = { ACHIEVED: "achieved", REFUTED: "refuted", IMPOSSIBLE: "impossible", MALFORMED: "malformed" };

/**
 * Adjudicate one objective. The objective is a plain object so a model, a script or a human can all produce one.
 *   { type: "circular", r }      hold station on a circular orbit at r
 *   { type: "lowestStable" }     get as close as possible and stay -- exact answer is the ISCO
 *   { type: "survey", r }        hold station at r and report what an observer there sees
 */
export function runMission(M, objective, opts = {}) {
    if (!objective || typeof objective !== "object" || !objective.type) {
        return { verdict: VERDICT.MALFORMED, why: "an objective needs a type" };
    }

    if (objective.type === "survey") {
        const r = Number(objective.r);
        if (!(r > horizon(M))) return { verdict: VERDICT.IMPOSSIBLE, why: "nothing can hold station at or inside the horizon (" + horizon(M) + "M)" };
        return {
            verdict: VERDICT.ACHIEVED, type: "survey", r,
            report: {
                redshift: redshift(M, r), timeDilation: timeDilation(M, r),
                omega: circularOmega(M, r), period: circularPeriod(M, r),
                stableOrbitAvailable: r > iscoRadius(M),
            },
            why: "a static station reports what it reports; no steering was required",
        };
    }

    if (objective.type === "lowestStable") {
        const f = findLowestStable(M, opts);
        return {
            verdict: VERDICT.ACHIEVED, type: "lowestStable",
            r: f.r, L: f.L, trials: f.trials,
            exactR: iscoRadius(M), errR: Math.abs(f.r - iscoRadius(M)),
            biasNote: f.biasNote,
            why: "found by bisecting on MEASURED holdability -- nudge the orbit and watch whether the excursion grows. 6M was never mentioned to the search, and the result lands slightly INSIDE it because the instability growth rate vanishes at the boundary.",
        };
    }

    if (objective.type === "circular") {
        const r = Number(objective.r);
        if (!Number.isFinite(r)) return { verdict: VERDICT.MALFORMED, why: "circular needs a numeric r" };
        const s = steerToCircular(M, r, opts);
        if (s.verdict === NAV.IMPOSSIBLE) {
            return { verdict: VERDICT.IMPOSSIBLE, type: "circular", r, why: s.reason,
                     note: "not merely hard -- no circular orbit exists for matter at or inside the photon sphere" };
        }
        if (s.verdict === NAV.FAILED) return { verdict: VERDICT.MALFORMED, type: "circular", r, why: s.reason };
        const exact = circularL(M, r);
        const base = { type: "circular", r, L: s.L, exactL: exact, errL: Math.abs(s.L - exact), trials: s.iterations, ecc: s.ecc };
        if (s.verdict === NAV.UNSTABLE) {
            return { ...base, verdict: VERDICT.REFUTED,
                why: "the orbit EXISTS and the angular momentum is correct, but it is inside the ISCO (" + iscoRadius(M) + "M) and will not survive a nudge",
                note: "the number is right and the plan is useless -- the most dangerous kind of wrong answer, because nothing about the number looks wrong" };
        }
        return { ...base, verdict: VERDICT.ACHIEVED, why: "stable circular orbit reached; the exact L confirms it afterwards, it was not used to find it" };
    }

    return { verdict: VERDICT.MALFORMED, why: "unknown objective type '" + objective.type + "'" };
}

/**
 * FIND THE INNERMOST ORBIT A PROBE CAN HOLD, BY EXPERIMENT.
 *
 * Bisect on MEASURED holdability: at each candidate radius, steer to the circular orbit, nudge it outward by a
 * tenth of a percent, and watch whether the excursion stays bounded over a long arc. 6M appears NOWHERE in this
 * function; it is used afterwards only to grade.
 *
 * WHAT IT ACTUALLY RETURNS, AND WHY IT IS NOT 6M EXACTLY. Measured: about 5.96M, a deficit of roughly 0.65%,
 * ALWAYS FROM BELOW. Two effects, both real and neither a bug:
 *
 *   CRITICAL SLOWING DOWN. The instability growth rate goes to ZERO as r approaches the ISCO from inside, so a
 *   finite integration arc cannot see a runaway that has barely begun. Lengthening the arc pushes the boundary
 *   out -- MEASURED 3.84% at 6pi, 1.15% at 12pi, 0.655% at 24pi -- and then it PLATEAUS, because
 *   FINITE AMPLITUDE is the second effect: a 0.1% nudge is not an infinitesimal one, and the orbit it produces
 *   is a genuinely different bound orbit rather than a linear perturbation of the circle.
 *
 * So this is an EXPERIMENT WITH A KNOWN BIAS, not a lookup. It is reported that way rather than tuned until it
 * reads 6.000 -- the same call the Ising instrument made about locating T_c on a finite lattice, and the same
 * reason: a number massaged into agreement teaches nothing about the method that produced it.
 */
export function findLowestStable(M, { lo = 3.05, hi = 20, iters = 40, dphi = 2e-4, arcPi = 24, nudge = 1e-3, tol = 20e-3 } = {}) {
    let a = lo * M, b = hi * M, trials = 0;
    const holdable = (r) => {
        trials++;
        const s = steerToCircular(M, r, { dphi });
        if (s.verdict === NAV.IMPOSSIBLE || s.verdict === NAV.FAILED) return false;
        const o = measureOrbit(M, s.L, r * (1 + nudge), { dphi, maxPhi: arcPi * Math.PI });
        if (o.captured || o.escaped) return false;
        const excursion = Math.max(Math.abs(o.rMax - r), Math.abs(r - o.rMin)) / r;
        return excursion < tol;
    };
    if (!holdable(b)) return { r: NaN, L: NaN, trials, error: "the outer bracket is not holdable" };
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (a + b);
        if (holdable(mid)) b = mid; else a = mid;
        if (b - a < 1e-9 * M) break;
    }
    const r = b;
    const s = steerToCircular(M, r, { dphi });
    return { r, L: s.L, trials, arcPi, nudge,
             biasNote: "approaches 6M FROM BELOW; the residual is critical slowing down plus finite nudge amplitude, both stated rather than tuned away" };
}

/**
 * Adjudicate a BATCH of proposals -- which is what a proposer actually produces. Returns the tally, because the
 * interesting statistic is not how many succeeded but how many were REFUTED BY MEASUREMENT rather than by a rule.
 */
export function adjudicate(M, objectives, opts = {}) {
    const results = objectives.map((o) => ({ objective: o, result: runMission(M, o, opts) }));
    const tally = { achieved: 0, refuted: 0, impossible: 0, malformed: 0 };
    for (const r of results) tally[r.result.verdict] = (tally[r.result.verdict] || 0) + 1;
    return { results, tally, total: objectives.length };
}
