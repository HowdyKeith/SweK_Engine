// WebGLEngine/physics/impactKnob-selfcheck.mjs -- v4587
//
// Run: node physics/impactKnob-selfcheck.mjs
//
// THE SIBLING GATE OF physics/impactKnob.mjs, the impact-parameter adjudicator of the asteroid-impact scene: the capture
// boundary FROM THE START POINT, the (E, L) pericentre grading a miss, energy conservation at the radius reached grading a
// hit, and a refusal inside the boundary's dt-resolution. physics/labKnobs-selfcheck.mjs holds the four v4586 proposers
// together; this file sits beside the module, as reportDoors-selfcheck asks of every reportLines() provider.
//
// SABOTAGE LOG -- v4587, each applied to physics/impactKnob.mjs, the gate run, the module restored.
//   A  the boundary in the vInf = v0 form (the 2 GM / r0 term dropped, b_c = sqrt 3)  -> 2 red: b_c = sqrt(2.9),
//      and b = 1.71 misses.
//   B  the undecidable band ignored (an aim 6e-5 from the boundary graded on a side)  -> 2 red: the refusal by
//      name, and the greedy pick being that refused aim.
//   C  the pericentre law with its sign flipped                                        -> 3 red: every miss, the
//      bound row (a residual over it), b = 2's graze at 1.2720.
//   D  the tolerance a constant (0.5) instead of TOL_PER_DT * dt * TOL_HEADROOM         -> 1 red: the bound row.
"use strict";
import * as IK from "./impactKnob.mjs";
import * as I from "./impact.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
console.log("impactKnob-selfcheck -- the capture boundary from the start point, and the laws either side\n");

console.log("1. THE BOUNDARY IS THE START POINT'S, NOT THE FORMULA'S AT INFINITY");
{
    const bc = IK.captureBoundary(), naive = I.criticalImpactParameter(IK.GM, IK.R, IK.V0);
    ok("!! b_c = sqrt(2.9) = 1.70294 from x0 = -20 at v0 = 1; the vInf = v0 form gives sqrt(3), 1.7 % wide", Math.abs(bc - Math.sqrt(2.9)) < 1e-12 && Math.abs(naive - Math.sqrt(3)) < 1e-12, `${bc.toFixed(5)} vs ${naive.toFixed(5)}`);
    const m = IK.measure(1.71);
    ok("!! b = 1.71 MISSES (rMin > R), which the start-point form predicts and the infinity form does not", m.missed && !m.hit && 1.71 > bc && 1.71 < naive, `rMin ${m.rMin.toFixed(4)}`);
}
console.log("\n2. THE LAWS EITHER SIDE, UNDER A dt-DERIVED BOUND");
{
    const hits = [0.5, 1.3, 1.7].map((b) => IK.adjudicate(b)), misses = [1.71, 2.0, 3.2].map((b) => IK.adjudicate(b));
    ok("!! every hit passes on the speed at the radius reached, every miss on the (E, L) pericentre", hits.every((a) => a.pass && a.evidence.side === "hit") && misses.every((a) => a.pass && a.evidence.side === "miss"), [...hits, ...misses].map((a) => `${a.evidence.b}:${a.evidence.rel.toExponential(1)}`).join(" "));
    ok("the bound is TOL_PER_DT * dt * TOL_HEADROOM, and every residual sits under it", [...hits, ...misses].every((a) => a.evidence.tol === IK.TOL_PER_DT * IK.DT * IK.TOL_HEADROOM && a.evidence.rel <= a.evidence.tol));
    const exact = IK.pericentre(2.0), m = IK.measure(2.0);
    ok("the pericentre law is the launch's exact invariants: b = 2 grazes at 1.2720", Math.abs(exact - 1.27196) < 1e-4 && Math.abs(m.rMin - exact) / exact < 1e-3, `${m.rMin.toFixed(5)} vs ${exact.toFixed(5)}`);
}
console.log("\n3. *** IT SAYS NO ON ITS OWN SUBJECT ***");
{
    const u = IK.adjudicate(1.703);
    ok("!! an aim 6e-5 from the boundary is refused as UNDECIDABLE at this dt, not graded on which side a step landed", !u.pass && /undecidable/.test(u.evidence.reason) && u.evidence.band > 0);
    ok("the greedy pick (the closest shave) is that undecidable aim, so the search is told no first", (() => { const c = IK.propose(); const g = c.slice().sort((a, b) => IK.score(b) - IK.score(a))[0]; return g === 1.703 && !IK.adjudicate(g).pass; })());
    ok("a negative aim is refused with a reason", !IK.adjudicate(-1).pass && /non-negative/.test(IK.adjudicate(-1).evidence.reason));
}
console.log(fails ? `\nimpactKnob-selfcheck: ${fails} FAILED` : "\nimpactKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
