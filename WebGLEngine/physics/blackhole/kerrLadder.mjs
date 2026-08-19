// physics/blackhole/kerrLadder.mjs
//
// v3360 -- FRAME DRAGGING GIVES A ROUTE A PREFERRED DIRECTION.
//
// transfer.mjs measured a Schwarzschild result worth revisiting: a monotone route costs exactly the same flown
// outward or inward -- 1.27300 either way -- because geodesics are time-reversible and the burns are symmetric.
// That symmetry is a statement about a NON-SPINNING hole, and it should not survive rotation.
//
// AROUND A KERR HOLE THE SPACETIME ITSELF DISTINGUISHES ORBITAL SENSE. Frame dragging carries everything around
// with the hole, so a prograde orbit needs LESS angular momentum than a retrograde one at the same radius, and
// the two are not related by any symmetry. Bardeen, Press and Teukolsky (1972) give the equatorial circular
// values exactly:
//
//     L = +-sqrt(Mr) (r^2 -+ 2a sqrt(Mr) + a^2) / (r sqrt(r^2 - 3Mr +- 2a sqrt(Mr)))
//     E =            (r^2 - 2Mr +- a sqrt(Mr)) / (r sqrt(r^2 - 3Mr +- 2a sqrt(Mr)))
//
// upper signs prograde. At a = 0 both reduce to the Schwarzschild forms, and the reduction is checked against
// probe.js's circularL rather than asserted: measured BIT-IDENTICAL at r = 6, 10, 20.
//
// WHAT IS MEASURED HERE IS A LADDER COST, AND THE SCOPE IS DELIBERATE. The sum of |dL| between adjacent circular
// orbits is exact and is the angular momentum a probe must acquire to climb the ladder. It is NOT the full
// transfer-orbit cost -- the equatorial Kerr radial equation is a cubic in 1/r and its two-turning-point
// solution is a different and larger job. Calling this a ladder cost rather than a transfer cost is the
// difference between a bound that is exact and a number that is approximately something else.

import { isco, outerHorizon, isSubExtremal } from "./kerr.js";
import { circularL } from "./probe.js";

/** BPT equatorial circular-orbit angular momentum. Returns NaN where no circular orbit exists. */
export function kerrCircularL(M, a, r, prograde = true) {
    const s = prograde ? 1 : -1;
    const x = Math.sqrt(M * r);
    const disc = r * r - 3 * M * r + s * 2 * a * x;
    if (!(disc > 0)) return NaN;                    // inside the photon orbit: no circular orbit at all
    return s * x * (r * r - s * 2 * a * x + a * a) / (r * Math.sqrt(disc));
}

/** BPT equatorial circular-orbit energy. */
export function kerrCircularE(M, a, r, prograde = true) {
    const s = prograde ? 1 : -1;
    const x = Math.sqrt(M * r);
    const disc = r * r - 3 * M * r + s * 2 * a * x;
    if (!(disc > 0)) return NaN;
    return (r * r - 2 * M * r + s * a * x) / (r * Math.sqrt(disc));
}

/** Is a stable circular orbit available at r for this sense? */
export function stationAvailable(M, a, r, prograde = true) {
    if (!isSubExtremal(M, a)) return { ok: false, reason: "spin exceeds extremal: not a black hole" };
    if (!(r > outerHorizon(M, a))) return { ok: false, reason: "at or inside the outer horizon" };
    const rIsco = isco(M, a, prograde);
    if (r < rIsco) return { ok: false, reason: `inside the ${prograde ? "prograde" : "retrograde"} ISCO at ${rIsco.toFixed(4)}M` };
    return { ok: true, reason: "stable circular orbit" };
}

/**
 * Total |dL| to climb a ladder of circular stations in one orbital sense.
 * EXACT, and a lower bound on the manoeuvre cost rather than the full transfer-orbit budget.
 */
export function ladderCost(M, a, stations, prograde = true) {
    const legs = [];
    let total = 0, unavailable = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
        const r1 = stations[i], r2 = stations[i + 1];
        const s1 = stationAvailable(M, a, r1, prograde), s2 = stationAvailable(M, a, r2, prograde);
        if (!s1.ok || !s2.ok) {
            legs.push({ from: r1, to: r2, ok: false, reason: s1.ok ? s2.reason : s1.reason });
            unavailable++;
            continue;
        }
        const dL = Math.abs(kerrCircularL(M, a, r2, prograde) - kerrCircularL(M, a, r1, prograde));
        total += dL;
        legs.push({ from: r1, to: r2, ok: true, dL });
    }
    return { M, a, prograde, stations, legs, totalDeltaL: total, unavailable, allAvailable: unavailable === 0 };
}

/** The asymmetry frame dragging creates: the same ladder flown prograde versus retrograde. */
export function senseAsymmetry(M, a, stations) {
    const pro = ladderCost(M, a, stations, true);
    const retro = ladderCost(M, a, stations, false);
    return {
        a, prograde: pro.totalDeltaL, retrograde: retro.totalDeltaL,
        ratio: retro.totalDeltaL / pro.totalDeltaL,
        excessFrac: retro.totalDeltaL / pro.totalDeltaL - 1,
        bothAvailable: pro.allAvailable && retro.allAvailable,
    };
}
