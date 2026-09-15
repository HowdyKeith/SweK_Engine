// WebGLEngine/physics/apsidalKnob-selfcheck.mjs -- v4587
//
// Run: node physics/apsidalKnob-selfcheck.mjs
//
// THE SIBLING GATE OF physics/apsidalKnob.mjs, the start-radius adjudicator of the black-hole and neutron-star scenes. It
// holds the module's two routes to each other -- the integration's apoapsis advance against the radial quadrature, modulo a
// turn -- and holds the adjudicator to knobRegistry's bar: it refuses a WELL-FORMED value on its own subject (an unbound
// launch, a start inside the surface) and its tolerance is derived from the detector, not chosen. physics/labKnobs-selfcheck.mjs
// holds the four v4586 proposers together (registration, the join, the front door); this file is the one that sits beside
// the module, which reportDoors-selfcheck asks of every module that provides reportLines().
//
// SABOTAGE LOG -- v4587, each applied to physics/apsidalKnob.mjs, the gate run, the module restored.
//   A  the quadrature biased by 0.01 rad (exactApsidal returns 2 s - 2 pi + 0.01)   -> 4 red: every bound start,
//      the 2e-5 row, the neutron star's r0 = 5.4, the dt sweep. The bias is 1e-2 of a radian against advances
//      of order one, so the detector's bound (2e-4 at r0 = 10) is crossed by fifty times.
//   B  unbound launches accepted (the E >= 0 refusal skipped)                        -> 1 red: r0 = 4 refused as UNBOUND.
//   C  the tolerance a constant (1e-3) instead of derived                            -> 1 red: tol = max(floor, ...).
//   D  circDiff without the modulo (plain |a - b|)                                   -> 1 red: the neutron star's
//      r0 = 5.4, whose exact advance exceeds a turn and is read back modulo 2 pi.
//   FINDING, in the first draft of this gate: the dt-sweep row called the residual at r0 = 10 "a floor, not a
//   slope" and pinned it under 2e-5. It reads 5.4e-5, 1.7e-5, 2.6e-6 at dt 0.04, 0.02, 0.01 -- a slope, the
//   detector's own, and the first reading sat over the pin while under its derived tolerance (8.3e-4). The row
//   now holds each reading under the tolerance derived for that step and falling with it.
"use strict";
import * as A from "./apsidalKnob.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const deg = (x) => x * 180 / Math.PI;
console.log("apsidalKnob-selfcheck -- the apsidal advance, integration against quadrature\n");

console.log("1. THE TWO ROUTES AGREE WHERE THE LAUNCH IS BOUND");
{
    const rows = [5, 6, 10, 20].map((r0) => A.adjudicateBlackHole(r0));
    ok("!! every bound black-hole start passes, both routes within the detector's bound", rows.every((a) => a.pass && a.evidence.rel <= a.evidence.tol), rows.map((a) => `${a.evidence.r0}: rel ${a.evidence.rel.toExponential(1)}`).join(" "));
    ok("...to better than 2e-5, sharing only the potential", rows.every((a) => a.evidence.rel < 2e-5));
    const ns = [5.4, 6, 9, 16].map((r0) => A.adjudicateNeutronStar(r0));
    ok("!! the neutron star passes its slider, r0 = 5.4 exceeding a turn and read modulo 2 pi", ns.every((a) => a.pass) && deg(ns[0].evidence.exact) > 360 && deg(ns[0].evidence.measured) < 30, `${deg(ns[0].evidence.exact).toFixed(1)} vs ${deg(ns[0].evidence.measured).toFixed(1)} deg`);
}
console.log("\n2. *** IT SAYS NO ON ITS OWN SUBJECT ***");
{
    const u = A.adjudicateBlackHole(4), i = A.adjudicateNeutronStar(5), bad = A.adjudicateBlackHole(1);
    ok("!! r0 = 4 (on the page's slider) is refused as UNBOUND at 1.05 x circular speed", !u.pass && u.evidence.unbound && /unbound|escapes/.test(u.evidence.reason), u.evidence.reason);
    ok("!! r0 = 5 is refused as a start inside the neutron star's surface", !i.pass && i.evidence.impacted && /inside the surface/.test(i.evidence.reason));
    ok("a start inside the horizon is refused with a reason, not a throw", !bad.pass && /outside the horizon/.test(bad.evidence.reason));
    ok("the greedy pick (the smallest radius, score 1/r0) is a refused candidate for both scenes", (() => { const g = (c) => c.slice().sort((a, b) => A.score(b) - A.score(a))[0]; return !A.adjudicateBlackHole(g(A.proposeBlackHole())).pass && !A.adjudicateNeutronStar(g(A.proposeNeutronStar())).pass; })());
}
console.log("\n3. THE TOLERANCE IS DERIVED, NOT CHOSEN");
{
    const a = A.adjudicateBlackHole(10);
    ok("!! tol = max(floor, detector steps * (L dt / rmax^2) / |advance|), per candidate", a.evidence.tol === Math.max(A.TOL_FLOOR, A.TOL_DETECTOR_STEPS * a.evidence.perStep / Math.abs(a.evidence.exact)), `tol ${a.evidence.tol.toExponential(2)}`);
    const sweep = [0.04, 0.02, 0.01].map((dt) => A.adjudicateBlackHole(10, { dt }).evidence);
    ok("...and the dt sweep at r0 = 10 is a slope, the detector's: the residual FALLS with the step, each reading under the tolerance derived for that step", sweep.every((e, i) => e.rel <= e.tol && (i === 0 || e.rel < sweep[i - 1].rel)), sweep.map((e) => `${e.rel.toExponential(1)}/${e.tol.toExponential(1)}`).join(" "));
}
console.log(fails ? `\napsidalKnob-selfcheck: ${fails} FAILED` : "\napsidalKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
