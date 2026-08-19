// tools/roundhouse/probeBind.mjs
//
// v2875 -- roundhouse device TWENTY-TWO: a probe on a TIMELIKE geodesic.
//
// geodesic.js gave the lab the LIGHT case (deflection 4M/b, shadow 3*sqrt(3)*M). This is the MATTER case, and the
// headline is the one the theory is famous for: an ellipse that does not close.
//
// Modes:
//   "precession"  -- integrate an orbit, find successive perihelia with a detector that knows no formula, and
//                    grade the advance against 6 pi M / (a(1-e^2)).
//   "firstorder"  -- SHARPER than agreement. The closed form is FIRST ORDER, so the residual must be LINEAR in
//                    M/p. Reports the ratio of errors when M/p halves; it must be 2.
//   "closure"     -- THE LOAD-BEARING NEGATIVE. Delete 3Mu^2 and the orbit must close EXACTLY. Any precession
//                    there is the integrator lying, not the spacetime.
//   "isco"        -- the ISCO at 6M and L = 2 sqrt(3) M, reached by two routes that share no code.
//   "capture"     -- head inward: below L_isco a probe has no stable circular orbit, and a low-L trajectory
//                    reaches the horizon.
import { planTransfer, planRoute } from "../../physics/blackhole/transfer.mjs";
import { emitterAt, escapedSkyFraction } from "../../physics/blackhole/emit.mjs";
import { placeProbes, flyTour } from "../../physics/blackhole/tour.mjs";
import {
    iscoRadius, iscoAngularMomentum, circularL, circularOmega, redshift, timeDilation,
    traceOrbit, measuredPrecession, precessionExact, plunges, properTimeToCentre, flyProbe } from "../../physics/blackhole/probe.js";
import { steerToCircular, steerToISCO, NAV } from "../../physics/blackhole/navigate.js";
import { runMission, adjudicate, findLowestStable, VERDICT } from "../../physics/blackhole/mission.js";

export const PROBE_OBSERVABLES = [
    "emitR", "emitConeRad", "emitConeDeg", "emitEscapedSky", "emitInsidePhotonSphere",
    "transferL", "transferE", "transferEcc", "apoErr", "periErr", "deltaLDepart", "deltaLArrive",
    "routeDeltaL", "routeLegs", "routeInfeasible", "routeWorstApoErr", "routeOrderMatters",
    "tourStations", "tourArrived", "tourRefused", "tourWorstErr", "tourIterations", "tourOrderIndependent",
    "precessionMeasured", "precessionExact", "precessionErrFrac", "orbits",
    "ratio1", "ratio2", "firstOrderHolds",
    "closureResidual", "closes",
    "iscoR", "iscoL", "iscoLIndependent", "iscoAgrees",
    "captured", "properTime", "plunges", "redshiftAtHorizonInfinite",
    // v2876 -- DRIVING the probe. The controller sees one bit per trial (in or out) and bisects; the exact
    // L = r sqrt(M/(r-3M)) is used only to grade. steerErr is the observable a claim should crystallise on.
    "steerVerdict", "steerL", "steerExactL", "steerErr", "steerTrials", "steerEcc", "steerStable",
    // v2877 -- MISSIONS. A proposer states objectives; the measurement adjudicates them. The interesting
    // observable is not how many succeeded, it is that not everything does.
    "missionVerdict", "achieved", "refuted", "impossible", "malformed", "notAllAchieved",
    "iscoFoundR", "iscoExactR", "iscoDeficitFrac", "iscoTrials",
    // v2890 -- "pilot": the PROPOSAL IS A CONTROL VALUE. The hypothesis carries an angular momentum L and a target
    // radius; the device releases the probe at the target with that L and measures what orbit it actually got.
    // A proposer for this mode needs no words -- a policy's weights can sit in the seat (see policyPilot.mjs).
    "pilotEcc", "pilotSide", "pilotPlunged", "pilotL", "pilotExactL", "pilotLErrFrac", "pilotTargetR", "pilotTurns",
];

const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    r1: 10,
    r2: 20,
 M: 1, a: 2000, e: 0.2, dphi: 2e-4, L: 3.0, r0: 20, rTarget: 10, turns: 6 };

export function probeDefaults(hyp) {
    const h = { mode: "precession", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.M = Math.max(1e-6, num(c.M, DEF.M));
    // a must stay well outside the ISCO or the "orbit" is a plunge and the precession question is meaningless
    c.a = Math.min(1e6, Math.max(20 * c.M, num(c.a, DEF.a)));
    c.e = Math.min(0.9, Math.max(0, num(c.e, DEF.e)));
    c.dphi = Math.min(1e-2, Math.max(1e-5, num(c.dphi, DEF.dphi)));
    c.L = Math.max(0, num(c.L, DEF.L));
    c.r0 = Math.max(2.01 * c.M, num(c.r0, DEF.r0));
    c.rTarget = Math.max(2.05 * c.M, num(c.rTarget, DEF.rTarget));
    h.config = c;
    if (!["precession", "firstorder", "closure", "isco", "capture", "steer", "steerisco", "mission", "findisco", "pilot", "tour", "place", "transfer", "route", "emit"].includes(h.mode)) h.mode = "precession";
    return h;
}

export async function buildProbe(hyp, base = {}) {
    const h = probeDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config, M = c.M;
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

    if (h.mode === "isco") {
        const two = circularL(M, 6 * M);
        return {
            iscoR: iscoRadius(M), iscoL: iscoAngularMomentum(M), iscoLIndependent: two,
            iscoAgrees: Math.abs(two - iscoAngularMomentum(M)) < 1e-12,
            // JSON CANNOT CARRY Infinity -- it serialises to null, which reads as "this observable is missing"
            // rather than "this observable is infinite". Those are opposite meanings, and a device that reported
            // the first when it meant the second would be lying quietly. So the FACT travels as a boolean.
            redshiftAtHorizonInfinite: redshift(M, 2 * M) === Infinity,
        };
    }

    if (h.mode === "closure") {
        // Same integrator, same orbit, one term removed. If this precesses, nothing else in this device means
        // anything -- which is exactly why it is a mode rather than a footnote.
        const n = measuredPrecession(M, c.a, c.e, { dphi: c.dphi, newtonian: true });
        return { closureResidual: n.ok ? Math.abs(n.perOrbit) : NaN, closes: n.ok && Math.abs(n.perOrbit) < 1e-6, orbits: n.orbits };
    }

    if (h.mode === "firstorder") {
        const err = (a) => {
            const r = measuredPrecession(M, a, c.e, { dphi: c.dphi });
            return r.ok ? Math.abs(r.perOrbit / precessionExact(M, a, c.e) - 1) : NaN;
        };
        const e1 = err(c.a), e2 = err(c.a * 2), e3 = err(c.a * 4);
        const r1 = e1 / e2, r2 = e2 / e3;
        return { ratio1: r1, ratio2: r2, firstOrderHolds: Math.abs(r1 - 2) < 0.15 && Math.abs(r2 - 2) < 0.15 };
    }

    if (h.mode === "capture") {
        const t = traceOrbit(M, c.L, 1 / c.r0, 0, { dphi: 1e-4, maxPhi: 40 * Math.PI });
        return {
            captured: t.captured, plunges: plunges(M, c.L),
            properTime: properTimeToCentre(M, c.r0),
            iscoL: iscoAngularMomentum(M),
        };
    }

    if (h.mode === "findisco") {
        // THE LAB REDISCOVERS ITS OWN INNERMOST STABLE ORBIT. 6M is never mentioned to the search -- it bisects
        // on measured holdability. The result lands slightly INSIDE, systematically, because the instability
        // growth rate vanishes at the boundary; that deficit is the observable, not an error to be tuned away.
        const f = findLowestStable(M);
        return {
            iscoFoundR: f.r, iscoExactR: iscoRadius(M),
            iscoDeficitFrac: Number.isFinite(f.r) ? (iscoRadius(M) - f.r) / iscoRadius(M) : null,
            iscoTrials: f.trials,
        };
    }

    // v3337 -- POINT-TO-POINT AND PRE-PLACEMENT. steer goes to ONE station; these are the two things it could
    // not do. Both grade against circularL(M, r) = sqrt(M r^2 / (r - 3M)), so a tour is a sequence of keyed
    // arrivals and a placement is exact by construction rather than measured.
    if (h.mode === "place") {
        const radii = Array.isArray(c.stations) ? c.stations : [8, 10, 14, 20];
        const placed = placeProbes(c.M, radii);
        const feasible = placed.filter((p) => p.feasible);
        return {
            tourStations: radii.length, tourArrived: feasible.length,
            tourRefused: placed.length - feasible.length,
            tourWorstErr: 0,                       // placement is the closed form; there is nothing to be wrong by
            tourIterations: 0,
            tourOrderIndependent: null,
            tourPeriods: feasible.map((p) => p.period),
        };
    }
    if (h.mode === "tour") {
        const radii = Array.isArray(c.stations) ? c.stations : [8, 14, 20];
        const fwd = flyTour(c.M, radii);
        const rev = flyTour(c.M, [...radii].reverse());
        // ORDER-INDEPENDENCE: every station has one exact L however the probe arrived, so a controller carrying
        // state between legs would show here and nowhere else.
        const same = radii.every((r) => {
            const a = fwd.legs.find((l) => l.r === r), b = rev.legs.find((l) => l.r === r);
            return a && b && a.L === b.L;
        });
        return {
            tourStations: radii.length, tourArrived: fwd.arrived, tourRefused: fwd.refused,
            tourWorstErr: fwd.worstErr, tourIterations: fwd.totalIterations,
            tourOrderIndependent: same, tourPeriods: null,
        };
    }
    // v3358 -- THE BOUNDARY-VALUE PROBLEM. steer/tour reach a station; these say what TRAJECTORY connects two.
    // Graded against V(r1) = V(r2) = E^2, which fixes L and E with no integration, then checked by integrating.
    if (h.mode === "transfer") {
        const r1 = Number.isFinite(c.r1) ? c.r1 : 10, r2 = Number.isFinite(c.r2) ? c.r2 : 20;
        const p = planTransfer(c.M, r1, r2);
        if (!p.feasible) {
            return { transferL: null, transferE: null, transferEcc: null, apoErr: null, periErr: null,
                     deltaLDepart: null, deltaLArrive: null, routeDeltaL: null, routeLegs: 0,
                     routeInfeasible: 1, routeWorstApoErr: null, routeOrderMatters: null };
        }
        return {
            transferL: p.L, transferE: p.E, transferEcc: p.ecc,
            apoErr: p.apoErr, periErr: p.periErr,
            deltaLDepart: p.deltaLDepart, deltaLArrive: p.deltaLArrive,
            routeDeltaL: null, routeLegs: 0, routeInfeasible: 0,
            routeWorstApoErr: p.apoErr, routeOrderMatters: null,
        };
    }
    if (h.mode === "route") {
        const stations = Array.isArray(c.stations) ? c.stations : [8, 14, 20];
        const fwd = planRoute(c.M, stations);
        const zig = planRoute(c.M, [stations[0], stations[stations.length - 1], ...stations.slice(1, -1)]);
        return {
            transferL: null, transferE: null, transferEcc: null, apoErr: null, periErr: null,
            deltaLDepart: null, deltaLArrive: null,
            routeDeltaL: fwd.totalDeltaL, routeLegs: fwd.legs.length,
            routeInfeasible: fwd.infeasible, routeWorstApoErr: fwd.worstApoErr,
            // backtracking costs more: ROUTES are order-dependent even though ARRIVALS are not
            routeOrderMatters: zig.allFeasible ? zig.totalDeltaL > fwd.totalDeltaL * 1.1 : null,
        };
    }
    // v3359 -- A PROBE AS AN EMITTER NEAR THE HOLE. sin(psi_c) = 3sqrt(3) M sqrt(1-2M/r)/r, which is the SAME
    // angle the lens device reports as the shadow: time-reversal of null geodesics.
    if (h.mode === "emit") {
        const r = Number.isFinite(c.r0) ? c.r0 : 10;
        const e = emitterAt(c.M, r);
        return {
            emitR: e.r, emitConeRad: e.coneAngleRad, emitConeDeg: e.coneAngleDeg,
            emitEscapedSky: e.escapedSkyFraction, emitInsidePhotonSphere: e.insidePhotonSphere,
        };
    }
    if (h.mode === "mission") {
        // A batch of proposals, adjudicated. Deliberately includes objectives that CANNOT be met, because a
        // planner that only ever reported success would be a yes-man with a physics engine attached.
        const objectives = Array.isArray(h.objectives) && h.objectives.length ? h.objectives : [
            { type: "circular", r: 20 }, { type: "circular", r: 8 },
            { type: "circular", r: 4 }, { type: "circular", r: 2.5 }, { type: "orbitTheMoon" },
        ];
        const a = adjudicate(M, objectives);
        return {
            achieved: a.tally.achieved || 0, refuted: a.tally.refuted || 0,
            impossible: a.tally.impossible || 0, malformed: a.tally.malformed || 0,
            notAllAchieved: (a.tally.achieved || 0) < a.total,
            missionVerdict: a.total + " proposals: " + JSON.stringify(a.tally),
        };
    }

    if (h.mode === "steer" || h.mode === "steerisco") {
        // THE PROBE IS DRIVEN, NOT JUST WATCHED. The target radius is the only thing the controller is told.
        const rT = h.mode === "steerisco" ? iscoRadius(M) : Math.max(2.05 * M, num(c.rTarget, 10 * M));
        const s2 = h.mode === "steerisco" ? steerToISCO(M) : steerToCircular(M, rT);
        const exact = circularL(M, rT);
        return {
            steerVerdict: s2.verdict,
            steerL: s2.L,
            steerExactL: Number.isFinite(exact) ? exact : null,
            // An IMPOSSIBLE target has no error to report, and reporting 0 would read as a perfect steer.
            steerErr: (s2.L !== undefined && Number.isFinite(exact)) ? Math.abs(s2.L - exact) : null,
            steerTrials: s2.iterations, steerEcc: s2.ecc, steerStable: s2.stable === true,
        };
    }

    if (h.mode === "pilot") {
        // Release at r = rTarget with radial velocity zero and the PROPOSED L. Exactly circular L keeps it there
        // (ecc ~ 0); L too high makes rTarget the periapsis (orbit swings OUT, side +1); too low makes it the
        // apoapsis (side -1) or, low enough, a plunge. The measured eccentricity is the graded error and the side
        // is the learning signal -- enough for a policy to steer by, nothing a policy could talk its way around.
        const rT = Math.min(1e4 * M, Math.max(6.2 * M, num(c.rTarget, DEF.rTarget)));   // stable orbits only
        const L = Math.min(100, Math.max(0.1, num(c.L, DEF.L)));
        const turns = Math.min(20, Math.max(1, num(c.turns, DEF.turns)));
        const exact = circularL(M, rT);
        const fly = flyProbe(M, { r0: rT, L, turns, dphi: c.dphi, sampleEvery: 20 });
        if (fly.captured) {
            return { pilotPlunged: true, pilotEcc: 1, pilotSide: -1, pilotL: L, pilotExactL: exact,
                     pilotLErrFrac: Math.abs(L - exact) / exact, pilotTargetR: rT, pilotTurns: fly.turns };
        }
        let rMin = Infinity, rMax = -Infinity, sum = 0;
        for (const smp of fly.samples) { if (smp.r < rMin) rMin = smp.r; if (smp.r > rMax) rMax = smp.r; sum += smp.r; }
        const mean = sum / fly.samples.length;
        return {
            pilotPlunged: false,
            pilotEcc: (rMax - rMin) / (rMax + rMin),
            pilotSide: Math.abs(mean - rT) < 1e-9 ? 0 : Math.sign(mean - rT),
            pilotL: L, pilotExactL: exact, pilotLErrFrac: Math.abs(L - exact) / exact,
            pilotTargetR: rT, pilotTurns: fly.turns,
        };
    }

    const m = measuredPrecession(M, c.a, c.e, { dphi: c.dphi });
    if (!m.ok) return { error: m.reason };
    const ex = precessionExact(M, c.a, c.e);
    return {
        precessionMeasured: m.perOrbit, precessionExact: ex,
        precessionErrFrac: Math.abs(m.perOrbit / ex - 1), orbits: m.orbits,
    };
}

export const probeDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["precession", "isco", "closure", "firstorder", "capture", "findisco", "mission", "steer", "steerisco", "pilot", "tour", "place", "transfer", "route", "emit"], name: "schwarzschild-probe", observables: PROBE_OBSERVABLES, build: buildProbe, defaults: probeDefaults };
