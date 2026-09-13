// physics/apsidalKnob.mjs -- v4586
//
// THE START-RADIUS KNOB OF THE BLACK-HOLE AND NEUTRON-STAR SCENES, ADJUDICATED BY THE APSIDAL ANGLE. Both scenes launch
// a test particle at r0 with a fixed multiple of the circular speed under a Paczynski-Wiita potential (physics/blackHole.js,
// physics/neutronStar.js) and draw the orbit precessing. The key is the precession per radial period -- THE APSIDAL ANGLE --
// measured two ways that share only the potential:
//
//   MEASURED   the mean advance between consecutive apoapsis angles of the time integration (blackHole.apoapsisAngles, the
//              scene's own velocity-Verlet steps at the scene's own dt);
//   EXACT      the radial quadrature 2 * integral_{rmin}^{rmax} L dr / (r^2 sqrt(2(E - Phi) - L^2/r^2)) - 2 pi, with E and L
//              from the launch state, rmin = r0 exactly (a tangential launch starts at its own pericentre) and rmax the root
//              of the effective potential found by bisection, the endpoint singularities removed by r = mid - a cos(theta).
//
// Compared MODULO A FULL TURN, because near a neutron star's surface the advance exceeds 360 degrees per radial period
// (380.0 at r0 = 5.4, measured) and the apoapsis detector can only see it reduced.
//
// *** THE KEYS THE SCENES' OWN STATUS LINES STATED WERE THE WRONG ONES, AND THIS FILE MEASURED IT (lines rewritten at v4587). ***
// Both scenes said "below the ISCO" for r0 < 6 as if an orbit there plunged; at 1.05 x circular speed NOTHING plunges (rMin = r0 at every r0
// down to 5, captured = false throughout), and below r0 ~ 4.6 the launch is UNBOUND (E >= 0) and escapes instead. The
// near-circular closed form 2 pi (sqrt((r - rs)/(r - 3 rs)) - 1) is 90 degrees wrong at r0 = 6 (130 against 220 measured) because the launch is far from
// circular (rMax = 15.4 from r0 = 6). Neither is used. The exact quadrature agrees with the integration to a few parts per
// million at every bound start radius, and the residual is the apoapsis DETECTOR's step quantisation, not dt: the dt sweep
// at r0 = 10 reads 3.3e-6, 1.1e-6, 2.2e-6, 1.5e-6, 1.4e-6 at dt = 0.04 .. 0.0025, a floor, not a slope.
//
// SO THE TOLERANCE IS THE DETECTOR'S, DERIVED PER CANDIDATE: an apoapsis sampled once per step is located to within one
// step, so each angle carries at most the angle swept in one step at apocentre, L dt / rmax^2; the mean of n such angles
// against an advance of |dphi| is bounded by TOL_DETECTOR_STEPS * (L dt / rmax^2) / |dphi| with the floor TOL_FLOOR for the
// quadrature's own truncation. Not a number picked to pass today's run.
//
// AND IT REFUSES ON ITS OWN SUBJECT: an unbound launch (no apocentre to precess) is refused with the energy named; a launch
// that starts inside the neutron star's surface (r0 <= 5.32 in rs = 2 units for the canonical 1.4 M_sun, 11 km) is refused
// as impacted; a captured particle is refused. A candidate the page's slider offers (r0 = 4, black hole) is refused as
// UNBOUND -- the search must be told no on a well-formed value, or the branch was never tested.
//
// Run: node physics/labKnobs-selfcheck.mjs
"use strict";
import { pathToFileURL } from "node:url";
import * as BH from "./blackHole.js";
import * as NS from "./neutronStar.js";

export const G = 1, M = 1, C = 1, RS = BH.schwarzschildRadius(M, G, C);   // rs = 2 in both scenes' units
export const TOL_DETECTOR_STEPS = 2;      // an apoapsis is located to within a step; two steps of headroom
export const TOL_FLOOR = 1e-4;            // the quadrature's own truncation at QUAD_N panels, stated separately
export const QUAD_N = 20000;

const Phi = (r) => -G * M / (r - RS);
const effective = (E, L, r) => 2 * (E - Phi(r)) - L * L / (r * r);

/** The apocentre: the effective potential's outer root above r0, or null when the launch is unbound. */
export function apocentre(E, L, r0) {
    if (E >= 0) return null;
    let hi = r0 * 1.001; while (effective(E, L, hi) > 0) { hi *= 1.5; if (hi > 1e7) return null; }
    let a = r0 * 1.001, b = hi;
    for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (effective(E, L, m) > 0) a = m; else b = m; }
    return 0.5 * (a + b);
}

/** The exact apsidal advance per radial period, by quadrature with the endpoint singularities removed. */
export function exactApsidal(E, L, rmin, rmax, n = QUAD_N) {
    const mid = 0.5 * (rmin + rmax), a = 0.5 * (rmax - rmin); let s = 0;
    for (let i = 0; i < n; i++) {
        const th = Math.PI * (i + 0.5) / n, r = mid - a * Math.cos(th), g = effective(E, L, r);
        if (g <= 0) continue;
        s += L / (r * r * Math.sqrt(g)) * a * Math.sin(th) * (Math.PI / n);
    }
    return 2 * s - 2 * Math.PI;
}

/** The smallest difference between two angles modulo a full turn. */
export const circDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

/**
 * One scene's measurement: launch at r0 with vFactor x circular speed, integrate at dt until `radialPeriods` apoapses have
 * been seen (or the particle is captured / impacted / the step cap runs out), and return both routes with the evidence.
 */
export function measure(r0, { vFactor, dt, surface = null, radialPeriods = 6, maxSteps = 400000 } = {}) {
    const p = surface == null ? BH.makeParticle(r0, vFactor * BH.circularSpeed(r0, M, G, RS)) : NS.makeOrbit(r0, vFactor);
    const E = BH.energy(p, M, G, RS), L = BH.angularMomentum(p);
    if (surface != null && r0 <= surface) return { r0, E, L, impacted: true, apo: 0, reason: `starts inside the surface (${surface.toFixed(3)} in rs = 2 units)` };
    const angles = []; let rPrev = r0, rising = false, steps = 0;
    while (angles.length < radialPeriods && steps < maxSteps && !p.captured && !p.impacted) {
        if (surface == null) BH.step(p, dt, M, G, RS); else NS.stepOrbit(p, dt, surface);
        steps++;
        const r = Math.hypot(p.r[0], p.r[1]);
        if (r > rPrev) rising = true; else if (rising && r < rPrev) { angles.push(Math.atan2(p.r[1], p.r[0])); rising = false; }
        rPrev = r;
    }
    const d = []; for (let i = 1; i < angles.length; i++) { let x = angles[i] - angles[i - 1]; while (x < 0) x += 2 * Math.PI; d.push(x); }
    const measured = d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
    const rmax = apocentre(E, L, r0);
    const exact = rmax == null ? null : exactApsidal(E, L, r0, rmax);
    const perStep = rmax == null ? null : L * dt / (rmax * rmax);   // the angle swept in one step at apocentre
    return { r0, E, L, dt, steps, captured: !!p.captured, impacted: !!p.impacted, unbound: E >= 0, apo: angles.length,
             rMin: p.rMin, rMax: p.rMax, rmaxExact: rmax, measured, exact, perStep };
}

/** The adjudicator for one scene: the two routes agree modulo a turn within the detector's derived bound, or it says why not. */
export function adjudicateWith(scene) {
    return function adjudicate(r0, opts = {}) {
        if (!Number.isFinite(r0) || r0 <= RS) return { pass: false, evidence: { r0, reason: "the start radius must be finite and outside the horizon (rs = " + RS + ")" } };
        const m = measure(r0, { ...scene, ...opts });
        const law = "apsidal advance per radial period: the mean apoapsis-to-apoapsis angle of the integration equals the radial quadrature 2 int L dr / (r^2 sqrt(2(E - Phi) - L^2/r^2)) - 2 pi, modulo a turn";
        if (m.impacted) return { pass: false, evidence: { ...m, law, reason: m.reason || "impacted the surface: no apocentre to precess" } };
        if (m.captured) return { pass: false, evidence: { ...m, law, reason: "captured through the horizon: no apocentre to precess" } };
        if (m.unbound || m.rmaxExact == null) return { pass: false, evidence: { ...m, law, reason: `unbound at ${scene.vFactor} x circular speed (E = ${m.E.toFixed(4)} >= 0): the launch escapes, it does not plunge` } };
        if (m.apo < 2) return { pass: false, evidence: { ...m, law, reason: "fewer than two apoapses within the step cap: no advance to measure" } };
        const diff = circDiff(m.measured, m.exact), rel = diff / Math.abs(m.exact);
        const tol = Math.max(TOL_FLOOR, TOL_DETECTOR_STEPS * m.perStep / Math.abs(m.exact));
        return { pass: rel <= tol, evidence: { ...m, law, measuredDeg: m.measured * 180 / Math.PI, exactDeg: m.exact * 180 / Math.PI, rel, tol } };
    };
}

/** The two scenes as the page launches them (physics-lab.html): the black hole at 1.05 vc and dt 0.01, the neutron star at 1.02 vc and dt 0.008 with its surface. */
export const BLACK_HOLE = Object.freeze({ vFactor: 1.05, dt: 0.01, surface: null });
export const NEUTRON_STAR = Object.freeze({ vFactor: 1.02, dt: 0.008, surface: NS.surfaceGeom(1.4, 11) });

export const adjudicateBlackHole = adjudicateWith(BLACK_HOLE);
export const adjudicateNeutronStar = adjudicateWith(NEUTRON_STAR);

/** THE PREFERENCE, computed without consulting the adjudicator: the most precession per orbit a person can watch -- the
 *  smallest start radius -- which walks the search straight into the unbound region the adjudicator refuses. */
export function score(r0) { return Number.isFinite(r0) && r0 > 0 ? 1 / r0 : -Infinity; }

/** Candidate start radii spanning the refused region as well as the good one, in the pages' own slider ranges. */
export function proposeBlackHole({ current = 10 } = {}) { return [4, 4.5, 5, 6, 8, 10, 14, 20].filter((v) => v !== current); }
export function proposeNeutronStar({ current = 9 } = {}) { return [5, 5.4, 6, 7, 9, 12, 16].filter((v) => v !== current); }

export const MEASURED_V4586 = {
    theIscoIsNotTheBoundary:
        "At 1.05 x circular speed nothing plunges: rMin = r0 and captured = false at every r0 from 5 to 20; at r0 = 4 the " +
        "launch is unbound (E = +0.051) and at 4.5 marginally (E = -0.003, rMax 287). The pages' 'below the ISCO' line " +
        "described a circular orbit's stability, not this launch (rewritten at v4587).",
    theNearCircularFormIsNotTheKey:
        "2 pi (sqrt((r - rs)/(r - 3 rs)) - 1) reads 130.1 deg at r0 = 6 against 220.2 measured (0.41 of the measured) and 99.5 " +
        "at r0 = 10 against 106.4 (0.065): the launch is eccentric (rMax 15.4 from r0 = 6) and the small-eccentricity " +
        "closed form does not describe it. The exact quadrature does: 220.164 against 220.163 at r0 = 6.",
    theResidualIsTheDetector:
        "dt sweep at r0 = 10: 3.3e-6, 1.1e-6, 2.2e-6, 1.5e-6, 1.4e-6 at dt = 0.04, 0.02, 0.01, 0.005, 0.0025 -- a floor, " +
        "not a slope, so the residual is the apoapsis sampled once per step, and the tolerance is derived from that.",
    theNeutronStarAdvancePassesATurn:
        "r0 = 5.4 at 1.02 vc: exact 380.000 deg per radial period, the detector reads 19.999 -- equal modulo a full turn, " +
        "which is why the comparison is circular. The canonical 1.4 M_sun, 11 km star's surface sits at 5.321 (rs = 2 " +
        "units), BELOW the page's slider minimum of 5.4, so nothing on the slider impacts; the proposer offers r0 = 5 " +
        "to make the refusal branch run.",
};

export function reportLines() {
    const L = ["[apsidalKnob] the apsidal advance, integration against quadrature, modulo a turn"];
    for (const [name, adj, cands] of [["black hole", adjudicateBlackHole, [4, 5, 6, 10, 20]], ["neutron star", adjudicateNeutronStar, [5, 5.4, 6, 9, 16]]]) {
        L.push(`  ${name}:`);
        for (const r0 of cands) { const a = adj(r0), e = a.evidence; L.push(`    r0 ${String(r0).padStart(4)}  ${a.pass ? "PASS  " : "refuse"}  ${e.measuredDeg != null ? e.measuredDeg.toFixed(3) + " vs " + e.exactDeg.toFixed(3) + " deg, rel " + e.rel.toExponential(2) + " tol " + e.tol.toExponential(2) : e.reason}`); }
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
