// tools/roundhouse/tidalBind.mjs
//
// v2894 -- LAUNCHING A BLOB INTO A BLACK HOLE, AND GRADING WHAT HAPPENS TO IT.
//
// The blobarium's blobs are extended objects. An extended object falling toward a compact mass is stretched,
// because its near side falls faster than its far side -- and unlike almost everything else one might want from
// "drop a blob into a black hole", THAT HAS A CLOSED FORM. For a radially free-falling body in Schwarzschild the
// geodesic deviation equation gives
//
//     radial:      d^2 xi / dtau^2 = + 2M xi / r^3        (stretch, along the fall)
//     transverse:  d^2 xi / dtau^2 = -  M xi / r^3        (squeeze, across it)
//
// so "how fast does the blob stretch" is a measurement with an answer key, and this device is that measurement.
//
// FOUR MODES, AND THE MIDDLE ONE IS THE INTERESTING ONE:
//
//   "deviation" -- integrate TWO neighbouring radial geodesics exactly (no approximation anywhere) and compare
//                  their separation to the LINEARISED tidal equation integrated along the same fall. Agreement
//                  in the small-separation limit is the check; the ratio is the observable.
//
//   "validity"  -- ...and then ask where that agreement STOPS. The linear tidal equation assumes the body is
//                  small compared to r. Sweeping the separation upward finds the boundary, in the same spirit as
//                  bornBind: the observable is not a value but a LIMIT, measured rather than assumed. This is the
//                  honest answer to "can we drop a GIANT blob in" -- you can, and the device tells you the size
//                  past which the textbook formula stops describing it.
//
//   "roche"     -- the disruption radius. A self-gravitating body of mass m and radius R is pulled apart when the
//                  tidal difference across it, 2 M R / r^3, exceeds its own surface gravity m / R^2 -- giving
//                  r_disrupt = R (2M/m)^(1/3). Measured by bisection on the integrated tidal field, graded
//                  against that closed form.
//
//   "blob"      -- the blobarium's own Wyvill blob, its centres each on their own geodesic. The ensemble's
//                  stretch is measured the way the blobarium measures anything else, and compared to the tidal
//                  prediction for the same fall. This is the one that answers the original question literally.
//
//                  *** AND ITS errFrac IS NOT A KEY, WHICH IS WORTH SAYING WHERE THE MODE IS DESCRIBED. *** The
//                  blob's extent is 1.0 at r0 = 50, and `validity` above measures the linear equation's domain
//                  limit at 1.407e-2 -- so this mode runs SEVENTY-ONE TIMES PAST IT on purpose, because that is
//                  what dropping a real blob in looks like. Out there the honest prediction is off by 47.8% and
//                  the PLANTED one by 34.6%: THE WRONG LAW FITS BETTER. Grading this mode on agreement would
//                  reward the wrong physics, so tidalBind-selfcheck grades it on the plant moving the PREDICTION
//                  while the ensemble MEASUREMENT stays bit-identical, and reports the 0.478 rather than
//                  bounding it.
//
// WHAT IS NOT HERE, ON PURPOSE: heating, radiation, shock. A pulsar beam depositing energy in a blob is a MODEL
// with no answer key in this tree -- see thermalModelNote() at the bottom, which states that plainly rather than
// letting a plausible-looking number in through the back door.

import { horizon } from "../../physics/blackhole/geodesic.js";

export const TIDAL_OBSERVABLES = [
    "separationExact", "separationLinear", "deviationErrFrac", "stretchFactor", "rFinal", "properTime",
    "validitySeparation", "validityFrac", "validityTol",
    "rocheMeasured", "rocheExact", "rocheErrFrac",
    "blobStretch", "blobStretchPredicted", "blobStretchErrFrac", "blobCount", "blobDisrupted",
];

// tau default 390: falling from r0=50 that reaches r ~ 3M, so the body is actually STRESSED. Calibration caught
// the original tau=20 -- the object fell 0.08M, nothing tidal happened, and every mode agreed with everything
// because nothing had occurred. A test that passes because the experiment did not run is the worst kind.
const DEF = { M: 1, r0: 50, xi0: 1e-3, tau: 390, dtau: 1e-3, bodyR: 0.5, bodyM: 1e-6, blobCount: 24, tol: 0.01 };

export function tidalDefaults(hyp) {
    const h = { mode: "deviation", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.M = Math.min(1e6, Math.max(1e-6, num(c.M, DEF.M)));
    // start outside the horizon, and far enough that a fall is worth integrating
    c.r0 = Math.max(2.5 * c.M, Math.min(1e5 * c.M, num(c.r0, DEF.r0)));
    c.xi0 = Math.min(0.5 * c.r0, Math.max(1e-9, num(c.xi0, DEF.xi0)));
    c.tau = Math.min(1e4, Math.max(0.01, num(c.tau, DEF.tau)));
    c.dtau = Math.min(0.05, Math.max(1e-5, num(c.dtau, DEF.dtau)));
    c.bodyR = Math.max(1e-6, num(c.bodyR, DEF.bodyR));
    c.bodyM = Math.max(1e-12, num(c.bodyM, DEF.bodyM));
    c.blobCount = Math.min(400, Math.max(2, num(c.blobCount, DEF.blobCount) | 0));
    c.tol = Math.min(0.5, Math.max(1e-4, num(c.tol, DEF.tol)));
    if (!["deviation", "validity", "roche", "blob"].includes(h.mode)) h.mode = "deviation";
    h.config = c;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "deviationErrFrac", max: 1e-3 };
    return h;
}

// Radial free-fall from rest at r0, in PROPER TIME. d^2r/dtau^2 = -M/r^2 exactly (the Schwarzschild radial
// geodesic in proper time takes the Newtonian form -- one of relativity's quieter surprises). Leapfrog, so the
// integration stays symplectic and the separation growth is physics rather than integrator drift.
function fallExact(M, r0, tau, dtau, stopAt) {
    let r = r0, v = 0, t = 0;
    const acc = (rr) => -M / (rr * rr);
    while (t < tau) {
        v += 0.5 * dtau * acc(r);
        r += dtau * v;
        if (r <= stopAt) return { r, v, t, hitHorizon: true };
        v += 0.5 * dtau * acc(r);
        t += dtau;
    }
    return { r, v, t, hitHorizon: false };
}

// The LINEARISED deviation equation integrated along the reference fall: d^2 xi/dtau^2 = 2M xi / r(tau)^3.
// *** v3686 -- THE PLANT, AND IT REPLACES A LAW RATHER THAN NUDGING A CONSTANT. *** `planted` drops the FACTOR
// OF TWO from the radial tidal term: the geodesic deviation equation gives +2GM/r^3 along the separation and
// -GM/r^3 across it, and USING THE TRANSVERSE MAGNITUDE FOR THE RADIAL DIRECTION IS THE STANDARD WRONG
// DERIVATION -- it is what you get by differentiating -GM/r^2 once and forgetting that the reference point is
// itself falling. IT IS TEMPTING PRECISELY BECAUSE IT IS DIMENSIONALLY RIGHT, has the correct 1/r^3 scaling,
// still stretches the pair, and still grows without bound: every shape-of-the-answer check passes. Only a
// comparison against the EXACT two-geodesic integration separates them, which is what deviationErrFrac is.
// A plant that changes a coefficient nobody derived would prove nothing; this one is a claim somebody could
// honestly hold.
function fallLinear(M, r0, xi0, tau, dtau, stopAt, planted = false) {
    let r = r0, v = 0, xi = xi0, dxi = 0, t = 0;
    const acc = (rr) => -M / (rr * rr);
    while (t < tau) {
        v += 0.5 * dtau * acc(r);
        r += dtau * v;
        if (r <= stopAt) break;
        v += 0.5 * dtau * acc(r);
        // tidal step on the separation, using the reference radius
        const a = (planted ? 1 : 2) * M * xi / (r * r * r);
        dxi += dtau * a;
        xi += dtau * dxi;
        t += dtau;
    }
    return { xi, r, t };
}

function deviationRun(c) {
    const stop = horizon(c.M) * 1.001;
    const lead = fallExact(c.M, c.r0, c.tau, c.dtau, stop);              // near side (falls faster)
    const trail = fallExact(c.M, c.r0 + c.xi0, c.tau, c.dtau, stop);     // far side
    const exactSep = trail.r - lead.r;
    const lin = fallLinear(c.M, c.r0, c.xi0, c.tau, c.dtau, stop, !!c.planted);
    return {
        separationExact: exactSep,
        separationLinear: lin.xi,
        deviationErrFrac: Math.abs(exactSep - lin.xi) / Math.abs(lin.xi),
        stretchFactor: exactSep / c.xi0,
        rFinal: lead.r,
        properTime: lead.t,
    };
}

export function buildTidal(hyp, base = {}) {
    const h = tidalDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config, M = c.M;

    if (h.mode === "deviation") return { kind: "deviation", ...deviationRun(c) };

    if (h.mode === "validity") {
        // Sweep the initial separation upward and find where the linear tidal equation stops matching the exact
        // two-geodesic integration to within tol. A LIMIT as the observable, not a value.
        let last = null;
        for (let xi = 1e-6 * c.r0; xi < 0.5 * c.r0; xi *= 1.6) {
            const r = deviationRun({ ...c, xi0: xi });
            if (r.deviationErrFrac > c.tol) {
                return {
                    kind: "validity",
                    validitySeparation: xi,
                    validityFrac: xi / c.r0,
                    validityTol: c.tol,
                    deviationErrFrac: r.deviationErrFrac,
                    separationExact: r.separationExact, separationLinear: r.separationLinear,
                };
            }
            last = { xi, r };
        }
        return { kind: "validity", validitySeparation: last ? last.xi : null, validityFrac: last ? last.xi / c.r0 : null,
                 validityTol: c.tol, deviationErrFrac: last ? last.r.deviationErrFrac : null };
    }

    if (h.mode === "roche") {
        // THE DISRUPTION RADIUS, MEASURED RATHER THAN INVERTED.
        //
        // Calibration caught this mode cheating: the first version computed the tidal field from the SAME closed
        // form it was then graded against, so it returned an error of exactly 0.0 -- a tautology wearing a lab
        // coat, and the zero was the tell. A measurement that cannot possibly disagree with its answer key is not
        // a measurement.
        //
        // So the tidal field is now MEASURED: integrate two neighbouring geodesics released at r, take the second
        // difference of their separation over a short proper time, and use that acceleration. It has integration
        // error, it does not know the formula, and the comparison against R (2M/m)^(1/3) is therefore real.
        const R = c.bodyR, m = c.bodyM;
        const measuredTidalAt = (r) => {
            const stop = horizon(M) * 1.001;
            if (r <= stop * 1.5) return Infinity;
            const dt = Math.min(1e-3, 1e-4 * Math.sqrt(r * r * r / M));
            const steps = 40;
            const a = fallExact(M, r, dt * steps, dt, stop);
            const b = fallExact(M, r + R, dt * steps, dt, stop);
            const sep = (b.r - a.r), tt = a.t;
            // xi(t) = R + 0.5 * xi'' t^2 for small t -> xi'' = 2 (sep - R) / t^2
            return tt > 0 ? 2 * (sep - R) / (tt * tt) : Infinity;
        };
        const tidal = measuredTidalAt;
        const selfG = m / (R * R);
        let lo = horizon(M) * 1.001, hi = 1e6 * M;
        for (let i = 0; i < 200; i++) {
            const mid = Math.sqrt(lo * hi);                    // geometric bisection: the answer spans decades
            if (tidal(mid) > selfG) lo = mid; else hi = mid;    // inside -> disrupted
        }
        const measured = Math.sqrt(lo * hi);
        const exact = R * Math.cbrt(2 * M / m);
        return { kind: "roche", rocheMeasured: measured, rocheExact: exact, rocheErrFrac: Math.abs(measured - exact) / exact };
    }

    // "blob" -- the blobarium's own object, dropped in. Each centre gets its OWN geodesic; the stretch is what
    // the ensemble does, not what a formula says it should.
    const stop = horizon(M) * 1.001;
    const n = c.blobCount;
    const spread = c.bodyR;                                     // initial half-extent along the fall
    const starts = [];
    for (let i = 0; i < n; i++) starts.push(c.r0 - spread + (2 * spread * i) / (n - 1));
    const ends = starts.map((r) => fallExact(M, r, c.tau, c.dtau, stop));
    const rs = ends.map((e) => e.r);
    const extent0 = starts[starts.length - 1] - starts[0];
    const extent1 = Math.max(...rs) - Math.min(...rs);
    // *** v4029 -- THE PLANT FLAG WAS NOT THREADED HERE, AND blob WAS THEREFORE BLIND BY OMISSION. ***
    // roche is blind to the plant BY CONSTRUCTION -- it never calls fallLinear at all, measuring the tidal field
    // from two exact geodesics instead. blob DOES call it, for exactly the law the plant replaces, and simply
    // did not pass the flag: the same shape as v4028's iou() dropping its threshold, a value that should reach a
    // call site and does not. Blind by construction and blind by omission are different facts and only one of
    // them is a property.
    const lin = fallLinear(M, c.r0, extent0, c.tau, c.dtau, stop, !!c.planted);
    return {
        kind: "blob",
        blobCount: n,
        blobStretch: extent1 / extent0,
        blobStretchPredicted: lin.xi / extent0,
        blobStretchErrFrac: Math.abs(extent1 - lin.xi) / Math.abs(lin.xi),
        blobDisrupted: ends.some((e) => e.hitHorizon) || extent1 / extent0 > 10,
        rFinal: Math.min(...rs),
        properTime: ends[0].t,
    };
}

/**
 * THE MODEL THAT IS NOT A MEASUREMENT, SAID OUT LOUD.
 *
 * "Let the blob get hit by a pulsar beam" is a reasonable thing to want and it is NOT gradeable in this tree.
 * physics/pulsar/pulsar.js is a TIMING model -- pulse arrival times, spin-down, beam direction. It contains no
 * radiation transport, no opacity, no cross-section, so any energy a beam deposits in a blob would be a number
 * this lab invented and then confirmed, which is the one thing the roundhouse exists to prevent.
 *
 * What IS gradeable about the same scene is the TIMING: when the sweeping beam crosses the blob, given the beam's
 * phase and the light travel time, is fixed by pulseArrivalTimes and is already keyed. So the honest split is:
 *   - beam ARRIVAL (when it hits)      -> measurable, keyed, belongs in a device
 *   - beam DEPOSITION (what it does)   -> a model; label it, render it, and never let it crystallise a claim
 */
export function thermalModelNote() {
    return {
        gradeable: ["beam arrival time", "beam sweep period", "which blob elements the beam crosses"],
        notGradeable: ["deposited energy", "temperature rise", "ablation", "shock"],
        reason: "pulsar.js models pulse TIMING, not radiation transport -- no cross-section, no opacity, no answer key",
        rule: "render it if you like; never let it crystallise a claim",
    };
}

export const tidalDevice = {
    // v3686 -- THE PLANT IS `knob` AND IT REPLACES A LAW, NOT A CONSTANT: it drops the factor of two from the
    // radial tidal term (+2GM/r^3 along, -GM/r^3 across), which is the standard wrong derivation. Declared here
    // because plantedCoverage holds UNDECLARED AT A WALL OF ZERO -- a plant nobody can name the kind of is a
    // plant nobody can reason about, and the census caught this one missing the moment it was added.
    plantKind: "knob",
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v4029 -- "blob" ADDED, AND THE RULE THAT ADDS IT IS THE ONE THIS COMMENT ALREADY STATED. The line above
    // says the list is "every mode its own build() branches on", and build() branches on FOUR: deviation,
    // validity and roche each return early, and blob is the fallthrough. The header said "THREE MODES" and then
    // listed four. So the device's own headline came true about itself -- A MODE NOBODY CAN DISCOVER IS A MODE
    // NOBODY WILL USE -- and five declared observables (blobStretch, blobStretchPredicted, blobStretchErrFrac,
    // blobCount, blobDisrupted) lived only in the branch nothing could reach by name. Found by knobLiveness:
    // blobCount was a declared knob that moved no observable at any value, because the mode that reads it was
    // not in the list the probe sweeps.
    modes: ["deviation", "validity", "roche", "blob"],
    name: "tidal-disruption",
    observables: TIDAL_OBSERVABLES,
    build: buildTidal,
    defaults: tidalDefaults,
};
