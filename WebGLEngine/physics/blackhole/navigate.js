// WebGLEngine/physics/blackhole/navigate.js -- v2876
//
// DRIVING THE PROBE: a closed control loop with an EXACT target it is never told.
//
// Keith asked whether the roundhouse could use the probes -- move them, drive them around. It can, and the reason
// it is worth doing is not that steering a spacecraft is impressive. It is that this particular steering problem
// HAS AN EXACT ANSWER KEY, so a controller can be graded rather than admired.
//
// THE PROBLEM. Release a probe at radius r0 with zero radial velocity and angular momentum L. Then r0 is a
// turning point, and which KIND of turning point it is depends entirely on L:
//
//     L < L_circ(r0)   too slow to hold station -> r0 is the APOAPSIS, the probe falls inward
//     L = L_circ(r0)   exactly balanced          -> a CIRCLE; the turning points coincide
//     L > L_circ(r0)   too fast                  -> r0 is the PERIAPSIS, the probe climbs outward
//
// That is a clean sign change, so a controller can bisect on it using nothing but "did it go in or out" --
// a question the trajectory answers and no formula is consulted for. The exact target is
// L_circ = r sqrt(M/(r-3M)), which probe.js already exports and which THIS MODULE NEVER CALLS while searching.
// It is used only afterwards, to grade.
//
// THREE REGIMES, AND THE MIDDLE ONE IS WHY THIS IS AN INSTRUMENT:
//   r > 6M        a STABLE circular orbit exists. The controller should find it and it should stay found.
//   3M < r < 6M   a circular orbit exists and is UNSTABLE. The controller can still find L -- the maths is
//                 perfectly well defined -- but the orbit will not survive a nudge. Reporting that as a success
//                 would be the most dangerous kind of wrong answer, because the number is RIGHT and the plan is
//                 useless. So stability is measured separately, by perturbing and watching.
//   r <= 3M       NO circular orbit exists for matter at any speed. The controller must REFUSE, not return its
//                 closest attempt.
//
// The same shape as the equation discoverer: find it, or say plainly that there is nothing to find.
"use strict";
import { circularL, iscoRadius, photonSphere, horizon, traceOrbit } from "./probe.js";

/**
 * Release at r0 with dr/dtau = 0 and angular momentum L; report what the orbit actually did.
 * Returns rMin/rMax over the traced arc, the implied eccentricity, and the flags that make a number meaningless.
 */
export function measureOrbit(M, L, r0, { dphi = 2e-4, maxPhi = 8 * Math.PI } = {}) {
    const u0 = 1 / r0;
    const acc = (u) => -u + M / (L * L) + 3 * M * u * u;
    let u = u0, du = 0, phi = 0;
    let uMin = u0, uMax = u0;
    const uH = 1 / (2 * M);
    while (phi < maxPhi) {
        const k1u = du, k1d = acc(u);
        const k2u = du + 0.5 * dphi * k1d, k2d = acc(u + 0.5 * dphi * k1u);
        const k3u = du + 0.5 * dphi * k2d, k3d = acc(u + 0.5 * dphi * k2u);
        const k4u = du + dphi * k3d, k4d = acc(u + dphi * k3u);
        u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        du += (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        phi += dphi;
        if (u >= uH) return { captured: true, escaped: false, rMin: 2 * M, rMax: r0, ecc: NaN, r0 };
        if (u <= 1e-9) return { captured: false, escaped: true, rMin: 1 / uMax, rMax: Infinity, ecc: NaN, r0 };
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
    }
    const rMax = 1 / uMin, rMin = 1 / uMax;
    return { captured: false, escaped: false, rMin, rMax, r0, ecc: (rMax - rMin) / (rMax + rMin) };
}

/**
 * DID IT GO IN OR OUT? The single bit a controller needs, and the only thing it is allowed to look at.
 * +1 = climbed outward (L too high), -1 = fell inward (L too low), 0 = held station.
 */
export function driftSign(M, L, r0, opts = {}) {
    const o = measureOrbit(M, L, r0, opts);
    if (o.captured) return -1;
    if (o.escaped) return +1;
    const out = o.rMax - r0, inn = r0 - o.rMin;
    if (Math.abs(out - inn) < 1e-12) return 0;
    return out > inn ? +1 : -1;
}

export const NAV = { CIRCULARISED: "circularised", UNSTABLE: "unstable", IMPOSSIBLE: "impossible", FAILED: "failed" };

/**
 * STEER TO A CIRCULAR ORBIT AT rTarget by bisecting on the drift sign.
 *
 * The controller is told the target radius and nothing else. It never calls circularL -- that is the answer key,
 * and a search that consulted it would be a lookup wearing a loop.
 */
export function steerToCircular(M, rTarget, { iters = 60, dphi = 2e-4, maxPhi = 8 * Math.PI } = {}) {
    if (!(rTarget > photonSphere(M))) {
        return { verdict: NAV.IMPOSSIBLE, reason: "no circular orbit exists for matter at or inside the photon sphere (3M); at " + rTarget.toFixed(3) + "M there is nothing to steer to" };
    }
    // Bracket: L just above the horizon-grazing value, up to something comfortably escaping.
    let lo = 0.1 * Math.sqrt(M * rTarget), hi = 10 * Math.sqrt(M * rTarget);
    const s = (L) => driftSign(M, L, rTarget, { dphi, maxPhi });
    if (s(lo) > 0 || s(hi) < 0) return { verdict: NAV.FAILED, reason: "could not bracket the circular value between " + lo.toFixed(4) + " and " + hi.toFixed(4) };
    let used = 0;
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (lo + hi);
        used++;
        const d = s(mid);
        if (d === 0) { lo = hi = mid; break; }
        if (d < 0) lo = mid; else hi = mid;
        if (hi - lo < 1e-12 * Math.max(1, hi)) break;
    }
    const L = 0.5 * (lo + hi);
    const orbit = measureOrbit(M, L, rTarget, { dphi, maxPhi });
    const stable = stabilityOf(M, rTarget, L, { dphi });
    return {
        verdict: stable.stable ? NAV.CIRCULARISED : NAV.UNSTABLE,
        L, iterations: used, ecc: orbit.ecc, rMin: orbit.rMin, rMax: orbit.rMax,
        stable: stable.stable, excursionGrowth: stable.growth,
        // stated, not hidden: inside the ISCO the number is RIGHT and the plan is useless
        reason: stable.stable ? undefined
            : "a circular orbit at " + rTarget.toFixed(3) + "M exists but is UNSTABLE (inside the ISCO at " + iscoRadius(M) + "M) -- the L is correct and the orbit will not survive a nudge",
    };
}

/**
 * Is a circular orbit at r with angular momentum L STABLE? Nudge it and see whether the excursion grows.
 * This is the physical definition, measured, rather than a lookup of r > 6M.
 */
export function stabilityOf(M, r, L, { dphi = 2e-4, nudge = 1e-3 } = {}) {
    const a = measureOrbit(M, L, r * (1 + nudge), { dphi, maxPhi: 6 * Math.PI });
    if (a.captured) return { stable: false, growth: Infinity };
    if (a.escaped) return { stable: false, growth: Infinity };
    // excursion relative to the nudge: a stable orbit oscillates within O(nudge); an unstable one runs away
    const excursion = Math.max(Math.abs(a.rMax - r), Math.abs(r - a.rMin)) / r;
    return { stable: excursion < 20 * nudge, growth: excursion / nudge };
}

/** The exact answer, for GRADING only. Never called by the search above. */
export const exactCircularL = (M, r) => circularL(M, r);

/**
 * Steer to the ISCO -- the innermost orbit a probe can hold. The target is exactly 6M and the exact angular
 * momentum is exactly 2 sqrt(3) M, so this is the sharpest single test of the controller.
 */
export function steerToISCO(M, opts = {}) { return steerToCircular(M, iscoRadius(M), opts); }
