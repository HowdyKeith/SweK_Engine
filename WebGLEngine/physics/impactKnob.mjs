// physics/impactKnob.mjs -- v4586
//
// THE IMPACT-PARAMETER KNOB OF THE ASTEROID-IMPACT SCENE, ADJUDICATED ON BOTH SIDES OF THE CAPTURE BOUNDARY. The scene
// (physics/impact.js, stage 1) launches the asteroid at x0 = -20, y0 = b with speed v0 = 1 toward a planet of GM = 1 and
// radius R = 1, and integrates until it hits or flies past. Energy and angular momentum are exact invariants of a central
// force, and from them every side of the outcome has a closed form the integration must return:
//
//   the boundary   b_c = R sqrt(v0^2 + 2GM/R - 2GM/r0) / v0 = sqrt(2.9) = 1.70294 -- the b at which the pericentre grazes
//                  the surface, FROM THE START POINT, not from infinity;
//   a miss         the closest approach equals the pericentre of the (E, L) orbit, r_p = (sqrt(G^2M^2 + 2E L^2) - GM) / 2E;
//   a hit          the speed at the radius actually reached equals sqrt(v0^2 + 2GM(1/r_end - 1/r0)) -- evaluated at r_end
//                  rather than at R, because a step lands INSIDE the surface and the overshoot alone reads 1 % at b = 0.5.
//
// *** THE PAGE'S OWN STATUS LINE PRINTS THE WRONG CAPTURE RADIUS, AND THIS FILE MEASURED IT. *** physics-lab.html passes
// vInf = 1 to criticalImpactParameter and prints 1.73; the launch speed 1 is the speed at r0 = 20, not at infinity, and the
// true boundary from that start is 1.70294: MEASURED at 1.70263, 1.70297, 1.70301, 1.70304 by bisection at dt = 0.04, 0.02,
// 0.01, 0.005. An adjudicator built on the printed boundary would REFUSE a correct flyby at b = 1.71 (it misses, rMin
// 1.0064; the naive form says capture). The knob is a value a key can be wrong about, and the first candidate key was.
//
// THE TOLERANCE IS DERIVED FROM dt, NOT CHOSEN: at dt = 0.02 the miss-side pericentre residual reads 1.2e-4 (b = 2) and
// the hit-side speed residual 1.5e-4 (b = 1.3), both flat across the dt sweep (Verlet's energy error plus the once-per-step
// sampling of the closest approach), with the worst miss at 4.7e-4 (b = 3.2, a wide pericentre sampled coarsely). So the
// bound is TOL_PER_DT * dt * TOL_HEADROOM = 0.05 * 0.02 * 2 = 2e-3, above the measured floor by a stated factor.
//
// Run: node physics/labKnobs-selfcheck.mjs
"use strict";
import { pathToFileURL } from "node:url";
import * as I from "./impact.js";

export const GM = 1, R = 1, X0 = -20, V0 = 1, DT = 0.02;
export const TOL_PER_DT = 0.05, TOL_HEADROOM = 2;

/** The exact boundary from the start point: the b whose pericentre grazes the surface. */
export function captureBoundary({ gm = GM, r = R, x0 = X0, v0 = V0 } = {}) { const r0 = Math.abs(x0); return r * Math.sqrt(v0 * v0 + 2 * gm / r - 2 * gm / r0) / v0; }
/** The exact pericentre of the launch's (E, L) orbit. */
export function pericentre(b, { gm = GM, x0 = X0, v0 = V0 } = {}) { const r0 = Math.abs(x0), E = 0.5 * v0 * v0 - gm / r0, L = b * v0; return (Math.sqrt(gm * gm + 2 * E * L * L) - gm) / (2 * E); }
/** The exact speed at radius r by energy conservation from the start. */
export function speedAt(r, { gm = GM, x0 = X0, v0 = V0 } = {}) { const r0 = Math.abs(x0); return Math.sqrt(v0 * v0 + 2 * gm * (1 / r - 1 / r0)); }

export function measure(b, { dt = DT, maxSteps = 400000 } = {}) {
    const p = I.makeApproach(X0, b, V0, 0); let steps = 0;
    while (!p.hit && !p.missed && steps < maxSteps) { I.stepApproach(p, dt, GM, R); steps++; }
    const rEnd = Math.hypot(p.r[0], p.r[1]), vEnd = Math.hypot(p.v[0], p.v[1]);
    return { b, dt, steps, hit: p.hit, missed: p.missed, rMin: p.rMin, rEnd, vEnd, boundary: captureBoundary(), naiveBoundary: I.criticalImpactParameter(GM, R, V0) };
}

export function adjudicate(b, opts = {}) {
    const dt = opts.dt ?? DT, tol = TOL_PER_DT * dt * TOL_HEADROOM;
    if (!Number.isFinite(b) || b < 0) return { pass: false, evidence: { b, reason: "the impact parameter must be finite and non-negative" } };
    const m = measure(b, { dt });
    if (!m.hit && !m.missed) return { pass: false, evidence: { ...m, reason: "neither hit nor flew past within the step cap" } };
    // THE BOUNDARY HAS A RESOLUTION AT THIS dt (bisected 1.70263 .. 1.70304 across the dt sweep), and an aim inside it has no
    // verdict either side could stand behind: refused as undecidable, by name, rather than graded on which side a step landed.
    const band = TOL_PER_DT * dt * m.boundary;
    if (Math.abs(b - m.boundary) <= band) return { pass: false, evidence: { ...m, band, reason: `within ${band.toExponential(1)} of the capture boundary ${m.boundary.toFixed(5)}: undecidable at dt = ${dt}, the step lands on either side` } };
    const expectHit = b < m.boundary;
    const law = "b_c = R sqrt(v0^2 + 2GM/R - 2GM/r0)/v0 from the start point; a miss's closest approach is the (E, L) pericentre; a hit's speed at the radius reached is sqrt(v0^2 + 2GM(1/r - 1/r0))";
    if (m.hit !== expectHit) return { pass: false, evidence: { ...m, law, expectHit, reason: `the integration ${m.hit ? "hit" : "missed"} where the boundary ${m.boundary.toFixed(5)} says ${expectHit ? "hit" : "miss"}` } };
    if (m.hit) { const v = speedAt(m.rEnd), rel = Math.abs(m.vEnd - v) / v; return { pass: rel <= tol, evidence: { ...m, law, side: "hit", vLaw: v, rel, tol } }; }
    const rp = pericentre(b), rel = Math.abs(m.rMin - rp) / rp;
    return { pass: rel <= tol, evidence: { ...m, law, side: "miss", pericentreLaw: rp, rel, tol } };
}

/** THE PREFERENCE, without consulting the adjudicator: the closest shave -- the aim nearest the capture boundary, the most
 *  bending a person can watch -- which sends the greedy pick INTO the boundary's resolution band, where the adjudicator
 *  refuses it as undecidable. The law is shared knowledge (as gyroKnob's score shares the precession law); the verdict is not. */
export function score(b) { return Number.isFinite(b) && b >= 0 ? 1 / (Math.abs(b - captureBoundary()) + 1e-6) : -Infinity; }
export function propose({ current = 1.3 } = {}) { return [0.5, 1.0, 1.3, 1.6, 1.7, 1.703, 1.71, 1.8, 2.0, 2.5, 3.2].filter((v) => v !== current); }

export const MEASURED_V4586 = {
    thePrintedBoundaryIsWrong: "the page prints 1.73 (vInf = 1); the boundary from x0 = -20 is 1.70294, bisected at 1.70263 / 1.70297 / 1.70301 / 1.70304 over dt = 0.04 .. 0.005; b = 1.71 MISSES (rMin 1.0064) where the printed form says capture",
    theHitLawNeedsTheRadiusReached: "at b = 0.5 the speed at impact reads 1.72115 against 1.70294 at R (1.1 %): the step lands inside the surface; evaluated at the radius reached the residual is Verlet's alone, 1.5e-4",
    theGreedyPickIsUndecidable: "the search's preference is the closest shave, b = 1.703, which sits 6e-5 from the boundary: inside the dt-derived band of 1.7e-3 the step lands on either side, so it is refused as undecidable and the next-closest, 1.70, is accepted as a hit",
    theFloorIsFlatInDt: "miss b = 2: 6.0e-5, 1.2e-4, 1.3e-4, 1.5e-4; hit b = 1.3: 1.5e-4 at every dt -- the once-per-step sampling of the closest approach, so the bound is stated as TOL_PER_DT * dt * TOL_HEADROOM rather than fitted",
};

export function reportLines() {
    const L = ["[impactKnob] the capture boundary from the start point, and the pericentre and speed laws either side of it", `  boundary ${captureBoundary().toFixed(5)} (the page prints ${I.criticalImpactParameter(GM, R, V0).toFixed(4)})`];
    for (const b of [0.5, 1.3, 1.7, 1.703, 1.71, 2.0, 3.2]) { const a = adjudicate(b), e = a.evidence; L.push(`    b ${String(b).padStart(5)}  ${a.pass ? "PASS  " : "refuse"}  ${e.side || ""} rel ${e.rel != null ? e.rel.toExponential(2) : "-"} ${e.reason || ""}`); }
    return L;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
