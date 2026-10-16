// WebGLEngine/physics/mechanics/aeroSurface-selfcheck.mjs
//
// Run: node physics/mechanics/aeroSurface-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/aeroSurface.mjs. THREE sections are load-bearing, each closing a real
// bug found before this module was ever committed:
//   SECTION 2/2b -- this module's own FIRST version got its sign convention backwards: a specific test case
//     looked right (two independent sign errors, in the alpha formula and the lift-direction formula, happened
//     to cancel for that one input) until a MIRRORED input (wind from above instead of below) was checked and
//     produced the SAME-signed force instead of the opposite one. "One test case looks right" is not proof; a
//     sign convention is only proven by checking that mirrored inputs give mirrored outputs.
//   SECTION 3 -- an ADVERSARIAL REVIEW found the first version's dynamic pressure used the FULL 3D flow speed
//     while alpha already (correctly) used only the crossflow component -- consistent for pure pitch but wrong
//     for any sideslip/roll, inflating force by 397x for a spanwise component that has nothing to do with lift.
//   SECTION 12/12b -- the SAME review found createSurface() trusted a caller-supplied span/chord/normal triad
//     to be orthonormal and right-handed with no check; normal is now DERIVED (chord x span, Gram-Schmidt-
//     orthonormalised), so an inconsistent triad is no longer constructible at all.
//
// SABOTAGE LOG -- each applied to physics/mechanics/aeroSurface.mjs, the gate run, the module restored
// (diffed to confirm byte-identical):
//   A  the alpha formula's negation dropped (atan2(normalComp, chordComp) instead of atan2(-normalComp,
//      chordComp)) with the liftDir formula left correct (cross(flowDir, span)) -- the exact "one sign wrong,
//      not both" case this file's own header warns about -> 7 red: section 2/2b's mirrored-sign checks (wind
//      from below now gives NEGATIVE alpha/Cl/force.z, the wind-from-above mirror gives the opposite --
//      exactly backwards) and section 12's 45deg-peak check (Cl at +45deg now reads negative). Section 7's
//      numerical-derivative check stays GREEN under this sabotage -- it differentiates Cl against alpha USING
//      THE SAME (now differently-defined) alpha consistently, so the measured local slope still matches
//      clAlpha in magnitude; it is not, by itself, a sign-convention proof, which is exactly why section 2's
//      mirrored-input check exists as a separate, non-redundant assertion.
//   B  the liftDir formula's argument order swapped back (cross(span, flowDir) instead of cross(flowDir,
//      span)) with alpha's formula left correct -- the OTHER half of the same pair -> red: section 2c's direct
//      liftDir-direction check and section 2/2b's force-sign checks (alpha is now correctly signed but the
//      force itself points the wrong way).
//   C  the drag polar's k formula's aspectRatio and oswaldEfficiency swapped in the denominator (1/(pi*AR*e)
//      -- algebraically identical when they're literally multiplied, so INSTEAD sabotaged as dropping
//      oswaldEfficiency entirely: k = 1/(pi*aspectRatio)) -> red: section 6's direct k-value check.
//   D  dynamic pressure reverted to the FULL 3D flow speed (norm3(flowBody) instead of norm3(planar)) -- an
//      ADVERSARIAL REVIEW's own finding 1, caught here BEFORE it ever shipped -> 1 red: section 3's spanwise-
//      flow-must-not-scale-force check (34.9996N unsabotaged vs 13896.2N sabotaged -- the exact 397x-scale
//      blowup the review measured, reproduced on demand).
//   E  createSurface() reverted to accept `normal` as an independent free parameter instead of deriving it via
//      Gram-Schmidt from span/chord -- the review's own finding 2 -> 6 red: section 12's non-default-triad
//      orthonormality/handedness checks (the default-orientation case alone stays green, since its default
//      normal=[0,0,1] happens to already equal chord x span for the shipped default axes) and section 12b's
//      Gram-Schmidt-correction checks (an unchecked, un-corrected chord is trusted as-is again).
//   v4866 -- THE OPT-IN STALL (section 15). 14 sabotages of aeroSurface.mjs, each red by name: S1b stall ON by default (4 red: the default row, the 45 degree peak, the un-stalled-still-climbing row ...) | S2 stall
//   never applied 7 | S3 the blend a step (no smoothstep) 3 | S4 the blend linear, not smoothstep 1 (only the continuity row at 1e-6 degree sees it: a linear blend leaves the angle with a slope) | S5 separated drag
//   dropped 2 | S6 separated drag ~ sin(alpha) not sin^2 2 | S7 abs() dropped so a negative alpha never stalls 2 | S8 the flat plate without its factor 2 2 | S9 the polar built from the attached lift 2 |
//   S10 the stall angle read against the geometric alpha, not the total 1 | S11 createSurface keeps the caller's stall object 1 | S12 STALL not frozen 1 | S13 blend width halved 2 | S14 the blend not capped at 1
//   (lift of 120 at 45 degrees) 3. S1 as first written (`if (true)` on a null stall) crashed instead of going red and was replaced by S1b, which survives to the row.
"use strict";
import { pathToFileURL } from "node:url";
import { createBody, boxInertia, worldToBody, rotateByQuat, createAccumulator, applyForceAtPoint } from "./rigidBody6dof.mjs";
import * as A from "./aeroSurface.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const near3 = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

console.log("aeroSurface-selfcheck -- per-surface lift/drag, an independently-derived closed-form model\n");

const wing = A.createSurface({ area: 4, aspectRatio: 6, clAlpha: 5.7, cd0: 0.02, oswaldEfficiency: 0.85 });

console.log("1. ZERO AoA, SYMMETRIC SECTION -- Cl EXACTLY ZERO, FORCE IS PURE DRAG");
{
    const flow = [30, 0, 0];
    const r = A.surfaceForce(flow, wing);
    ok("!! alpha === 0 exactly (flow purely along chord, no incidence/deflection)", r.alpha === 0, `alpha=${r.alpha}`);
    ok("!! Cl === 0 exactly", r.cl === 0, `cl=${r.cl}`);
    const q = 0.5 * A.AIR_DENSITY_SEA_LEVEL * 900;
    ok("!! force is EXACTLY -flowDir * cd0 * q * area (pure parasitic drag, no lift term at all)", near3(r.force, [-wing.cd0 * q * wing.area, 0, 0]), `${r.force}`);
}

console.log("\n2. *** SIGN CONVENTION: MIRRORED INPUTS MUST GIVE MIRRORED SIGNS (not just 'a plausible sign') ***");
{
    const below = A.surfaceForce([30, 0, -3], wing);   // aircraft sinks relative to air -> wind from below -> +AoA
    ok("!! wind from below: alpha > 0", below.alpha > 0, `alpha=${(below.alpha * 180 / Math.PI).toFixed(3)}deg`);
    ok("!! ...Cl > 0", below.cl > 0, `cl=${below.cl.toFixed(4)}`);
    ok("!! ...force.z > 0 (lift acts toward +normal)", below.force[2] > 0, `force=${below.force}`);

    console.log("\n2b. THE MIRROR CASE");
    const above = A.surfaceForce([30, 0, 3], wing);   // aircraft climbs relative to air -> wind from above -> -AoA
    ok("!! wind from above: alpha < 0", above.alpha < 0, `alpha=${(above.alpha * 180 / Math.PI).toFixed(3)}deg`);
    ok("!! ...Cl < 0", above.cl < 0, `cl=${above.cl.toFixed(4)}`);
    ok("!! ...force.z < 0", above.force[2] < 0, `force=${above.force}`);
    ok("!! ...and the two cases are EXACT mirror images (same |alpha|, |Cl|, |force|)", near(below.alpha, -above.alpha) && near(below.cl, -above.cl) && near(norm3(below.force), norm3(above.force)));

    console.log("\n2c. liftDir's OWN baseline direction, checked directly");
    const planarDir = [1, 0, 0];   // no spanwise component in this scenario, so planarDir === flowDir here
    const liftDir = cross3(planarDir, wing.span).map((v, i, a) => v / norm3(a));
    ok("!! at zero AoA, liftDir points along +normal exactly (the conventional 'lift is up' direction)", near3(liftDir, wing.normal), `liftDir=${liftDir}`);
}

console.log("\n3. *** DYNAMIC PRESSURE USES ONLY THE CROSSFLOW (PLANAR) COMPONENT -- A SPANWISE COMPONENT MUST NOT SCALE THE FORCE ***");
{
    // an adversarial review found the FIRST version of this file used the FULL 3D flow speed for dynamic
    // pressure while already (correctly) using only the planar component for alpha -- consistent for pure
    // pitch cases (planar==flow there) but WRONG in general: adding spanwise flow (sideslip/roll, nothing to
    // do with this 2D section's own lift/drag) inflated the force by orders of magnitude with alpha unchanged.
    const noSpan = A.surfaceForce([5, 0, -0.5], wing);
    const bigSpan = A.surfaceForce([5, 100, -0.5], wing);   // same planar flow, 100 m/s of UNRELATED spanwise flow added
    ok("!! alpha is unaffected by the added spanwise component (already true before this fix)", near(noSpan.alpha, bigSpan.alpha, 1e-12), `${noSpan.alpha} vs ${bigSpan.alpha}`);
    ok("!! ...and now the FORCE MAGNITUDE is unaffected too -- 100 m/s of spanwise flow must not change it", near(norm3(noSpan.force), norm3(bigSpan.force), 1e-9), `${norm3(noSpan.force).toFixed(4)} vs ${norm3(bigSpan.force).toFixed(4)} (an earlier version of this file gave a 397x ratio here)`);
}

console.log("\n4. FORCE SCALES WITH v^2 (dynamic pressure), SAME ALPHA BOTH TIMES");
{
    const rA = A.surfaceForce([20, 0, -2], wing), rB = A.surfaceForce([40, 0, -4], wing);
    ok("!! doubling speed at the same alpha quadruples the force magnitude", near(norm3(rB.force) / norm3(rA.force), 4), `ratio=${(norm3(rB.force) / norm3(rA.force)).toFixed(6)}`);
    ok("Cl/Cd unchanged (confirms the ratio is purely from q)", near(rA.cl, rB.cl) && near(rA.cd, rB.cd));
}

console.log("\n5. THE PARABOLIC DRAG POLAR IS EVEN IN alpha (Cd depends only on Cl^2)");
{
    const zero = A.surfaceForce([30, 0, 0], wing), pos = A.surfaceForce([30, 0, -3], wing), neg = A.surfaceForce([30, 0, 3], wing);
    ok("Cd(alpha=0) === cd0 exactly", zero.cd === wing.cd0, `cd=${zero.cd}`);
    ok("!! Cd(+alpha) === Cd(-alpha) exactly (Cl is odd, Cl^2 is even)", near(pos.cd, neg.cd), `${pos.cd} vs ${neg.cd}`);
    ok("!! ...and both exceed cd0 (induced drag is never negative)", pos.cd > wing.cd0 && neg.cd > wing.cd0);
}

console.log("\n6. *** THE INDUCED-DRAG FACTOR k = 1/(pi * oswaldEfficiency * aspectRatio), CHECKED DIRECTLY ***");
{
    const r = A.surfaceForce([30, 0, -5], wing);
    const kExpected = 1 / (Math.PI * wing.oswaldEfficiency * wing.aspectRatio);
    const cdExpected = wing.cd0 + kExpected * r.cl * r.cl;
    ok("!! Cd matches cd0 + k*Cl^2 with k computed independently from the classic lifting-line formula", near(r.cd, cdExpected, 1e-12), `${r.cd} vs ${cdExpected}`);
}

console.log("\n7. clAlpha IS THE SMALL-ANGLE LIFT-CURVE SLOPE, CHECKED BY NUMERICAL DIFFERENTIATION AT alpha=0");
{
    const h = 1e-4;
    // a tiny flow-angle perturbation gives a tiny alpha perturbation directly (planar flow along chord + a
    // small normal component, so alpha ~= atan(h/speed) ~= h/speed for small h)
    const speed = 100;
    const plus = A.surfaceForce([speed, 0, -h * speed], wing), minus = A.surfaceForce([speed, 0, h * speed], wing);
    const dCl = (plus.cl - minus.cl) / (plus.alpha - minus.alpha);
    ok("!! dCl/dalpha at alpha~0 matches clAlpha to 4 significant figures", Math.abs(dCl - wing.clAlpha) < 1e-3, `measured ${dCl.toFixed(6)} vs clAlpha ${wing.clAlpha}`);
}

console.log("\n8. CONTROL SURFACE DEFLECTION SHIFTS alpha EXACTLY BY effectiveness*deflection");
{
    const deflected = A.createSurface({ ...wing, control: { effectiveness: 0.6, deflection: 0.1 } });
    const flow = [30, 0, -2];
    const withD = A.surfaceForce(flow, deflected), withoutD = A.surfaceForce(flow, wing);
    ok("!! alpha shifts by EXACTLY 0.6*0.1 = 0.06 rad", near(withD.alpha, withoutD.alpha + 0.06, 1e-12), `${withD.alpha} vs ${withoutD.alpha + 0.06}`);
}

console.log("\n9. DEGENERATE CASES -- NO NaN, NO CRASH");
{
    const zeroFlow = A.surfaceForce([0, 0, 0], wing);
    ok("!! near-zero flow speed returns zero force, not NaN", zeroFlow.force.every((v) => v === 0), `${zeroFlow.force}`);
    const spanOnly = A.surfaceForce([0, 30, 0], wing);
    // now that q uses the PLANAR speed (section 3's fix), pure spanwise flow has zero planar component, so
    // this hits the SAME near-zero-speed path as zeroFlow above -- exactly zero force, not just "finite".
    ok("!! pure spanwise flow (no planar component) has zero planar speed -> exactly zero force, same as no flow at all", near3(spanOnly.force, [0, 0, 0]) && spanOnly.alpha === 0, `${spanOnly.force}`);
}

console.log("\n10. relativeAirflow() -- MATCHES worldToBody() DIRECTLY, WIND SUBTRACTED CORRECTLY");
{
    const body = createBody({ mass: 5, I: [1, 1, 1], pos: [0, 0, 0], vel: [20, 3, -1], q: [Math.cos(0.2), 0, Math.sin(0.2), 0] });
    const noWind = A.relativeAirflow(body);
    ok("!! with no wind, relativeAirflow === worldToBody(q, vel) exactly", near3(noWind, worldToBody(body.q, body.vel)), `${noWind}`);
    const wind = [5, 0, 0];
    const withWind = A.relativeAirflow(body, wind);
    ok("!! with wind, relativeAirflow === worldToBody(q, vel - wind) exactly", near3(withWind, worldToBody(body.q, [15, 3, -1])), `${withWind}`);
}

console.log("\n11. applySurfaceForce()/createSurface() -- THE FULL INTEGRATION PATH INTO rigidBody6dof.mjs's OWN applyForceAtPoint()");
{
    const s = A.createSurface({ mount: [-2, 0, 0], area: 1, aspectRatio: 5, clAlpha: 5, cd0: 0.02, oswaldEfficiency: 0.8 });
    const flow = [30, 0, -4];
    const acc = createAccumulator();
    const r = A.applySurfaceForce(acc, flow, s);
    ok("!! the accumulator's force matches surfaceForce()'s own returned force exactly", near3(acc.force, r.force));
    const expectedTorque = cross3(s.mount, r.force);
    ok("!! the accumulator's torque matches r x F for the surface's own mount point exactly", near3(acc.torque, expectedTorque), `${acc.torque} vs ${expectedTorque}`);
    ok("createSurface() defaults (unit span/chord/normal triad, area=1) are self-consistent", near(norm3(A.createSurface().span), 1) && near(norm3(A.createSurface().chord), 1) && near(norm3(A.createSurface().normal), 1));
}

console.log("\n12. *** normal IS DERIVED, NEVER A FREE PARAMETER -- A LEFT-HANDED OR NON-ORTHOGONAL TRIAD IS NOT CONSTRUCTIBLE ***");
{
    // an adversarial review found the FIRST version accepted span/chord/normal as three INDEPENDENT vectors,
    // trusting the caller to hand it a right-handed orthonormal triad -- a perfectly orthonormal but
    // LEFT-handed one silently reversed every lift force's sign, and a merely-unit-length-but-not-orthogonal
    // one silently corrupted alpha even at intended zero AoA. createSurface() now takes only span/chord.
    for (const [label, span, chord] of [
        ["default-orientation", [0, 1, 0], [1, 0, 0]],
        ["a fin, span along Z", [0, 0, 1], [1, 0, 0]],
        ["arbitrary, non-axis-aligned", [0.6, 0.8, 0], [0, 0, 1]],
    ]) {
        const s = A.createSurface({ span, chord });
        const orthonormal = near(dot3(s.span, s.chord), 0, 1e-12) && near(dot3(s.span, s.normal), 0, 1e-12) && near(dot3(s.chord, s.normal), 0, 1e-12) && near(norm3(s.span), 1) && near(norm3(s.chord), 1) && near(norm3(s.normal), 1);
        const rightHanded = near3(s.normal, cross3(s.chord, s.span), 1e-9);
        ok(`!! [${label}] the derived triad is exactly orthonormal`, orthonormal);
        ok(`!! [${label}] ...and right-handed by construction (normal === chord x span exactly)`, rightHanded, `${s.normal} vs ${cross3(s.chord, s.span)}`);
    }

    console.log("\n12b. A NON-ORTHOGONAL chord INPUT IS GRAM-SCHMIDT-CORRECTED, NOT TRUSTED AS-IS");
    const messy = A.createSurface({ span: [0, 1, 0], chord: [1, 0.3, 0.1] });   // chord has a spurious span-axis component
    ok("!! the stored chord has ZERO component along span after correction", near(dot3(messy.chord, messy.span), 0, 1e-12), `dot=${dot3(messy.chord, messy.span).toExponential(2)}`);
    const alongOwnChord = A.surfaceForce(messy.chord.map((v) => v * 30), messy);   // flow purely along the CORRECTED chord
    ok("!! flow along the corrected chord gives alpha=0 exactly, despite the messy raw input", alongOwnChord.alpha === 0, `alpha=${alongOwnChord.alpha}`);
}

console.log("\n13. THE FULL-RANGE CLOSED FORM'S OWN THEORETICAL SHAPE: PEAKS AT 45deg, RETURNS TO ZERO AT 90deg");
{
    const at45 = A.surfaceForce([30 * Math.cos(Math.PI / 4), 0, -30 * Math.sin(Math.PI / 4)], wing);
    const at90 = A.surfaceForce([0, 0, -30], wing);
    ok("!! Cl at alpha=45deg equals clAlpha/2 EXACTLY (sin(45)cos(45) = 1/2)", near(at45.cl, wing.clAlpha / 2, 1e-9), `${at45.cl} vs ${wing.clAlpha / 2}`);
    ok("!! Cl at alpha=90deg returns to exactly zero (sin(90)cos(90) = 0)", near(at90.cl, 0, 1e-9), `${at90.cl}`);
}

console.log("\n14. THE FRONT DOOR");
{
    const L = A.reportLines();
    ok("reportLines names the module and shows wing+tail forces and a resulting torque", L.some((l) => /aeroSurface/.test(l)) && L.some((l) => /wing:/.test(l)) && L.some((l) => /tail:/.test(l)) && L.some((l) => /net torque/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log("\n15. *** THE OPT-IN STALL (v4866) -- NOTHING STALLS UNLESS A SURFACE IS GIVEN ONE; A STALLED ONE LOSES LIFT AND GAINS DRAG, CONTINUOUSLY ***");
{
    const D = Math.PI / 180, stalled = A.createSurface({ area: 4, aspectRatio: 6, clAlpha: 5.7, cd0: 0.02, oswaldEfficiency: 0.85, stall: A.STALL });
    const k = 1 / (Math.PI * 0.85 * 6), flowAt = (deg, V = 30) => [V * Math.cos(deg * D), 0, -V * Math.sin(deg * D)];
    ok("!! the default is NO stall: a surface made without one carries stall === null", wing.stall === null && A.createSurface().stall === null);
    ok("!! STALL is frozen and names a light aircraft's numbers (15 deg to separate, 8 deg to finish, flat-plate drag 1.8)", Object.isFrozen(A.STALL) && near(A.STALL.angle, 15 * D, 1e-15) && near(A.STALL.width, 8 * D, 1e-15) && A.STALL.drag === 1.8);
    ok("!! createSurface COPIES the stall it is given -- mutating the caller's object afterwards moves nothing", (() => { const mine = { angle: 0.2, width: 0.1, drag: 1 }, s = A.createSurface({ stall: mine }); mine.angle = 9; return s.stall.angle === 0.2; })());
    const same = [0, 5, 10, 14.99].every((deg) => { const a = A.surfaceForce(flowAt(deg), wing), b = A.surfaceForce(flowAt(deg), stalled); return a.cl === b.cl && a.cd === b.cd && a.force.every((v, i) => v === b.force[i]); });
    ok("!! BELOW the stall angle a stalled surface is BIT-IDENTICAL to the un-stalled one (0, 5, 10, 14.99 deg: cl, cd and every force component)", same);
    const edge = (d) => { const a = A.surfaceForce(flowAt(15 + d), wing), b = A.surfaceForce(flowAt(15 + d), stalled); return { dcl: Math.abs(a.cl - b.cl), dcd: Math.abs(a.cd - b.cd) }; };
    const e = edge(1e-6);
    ok("!! CONTINUOUS at the stall angle: 1e-6 deg past it, cl and cd have moved by less than 1e-9 (the blend starts at zero with zero slope)", e.dcl < 1e-9 && e.dcd < 1e-9, `dcl=${e.dcl.toExponential(2)} dcd=${e.dcd.toExponential(2)}`);
    const cl = (deg) => A.surfaceForce(flowAt(deg), stalled).cl;
    ok("!! LIFT FALLS PAST THE STALL: cl(15) > cl(19) > cl(23), strictly", cl(15) > cl(19) && cl(19) > cl(23), `${cl(15).toFixed(4)} > ${cl(19).toFixed(4)} > ${cl(23).toFixed(4)}`);
    ok("!! ...and the un-stalled closed form does the opposite, still climbing at 23 degrees (this is what the stall is FOR)", A.surfaceForce(flowAt(23), wing).cl > A.surfaceForce(flowAt(15), wing).cl);
    ok("!! FULLY SEPARATED (23 deg and beyond) is EXACTLY the flat plate: cl = sin(2 alpha) at 23, 30, 45 deg", [23, 30, 45].every((deg) => near(cl(deg), Math.sin(2 * deg * D), 1e-12)), [23, 30, 45].map((deg) => cl(deg).toFixed(4)).join(" "));
    const sep = A.surfaceForce(flowAt(30), stalled), a30 = 30 * D;
    ok("!! SEPARATED DRAG is the polar PLUS drag * sin^2(alpha): cd(30 deg) === cd0 + k cl^2 + 1.8 sin^2(30 deg)", near(sep.cd, 0.02 + k * sep.cl * sep.cl + 1.8 * Math.sin(a30) ** 2, 1e-12), `${sep.cd.toFixed(5)}`);
    ok("!! ...which is more than three times the attached drag at the stall angle (cd(30) > 3 cd(15))", sep.cd > 3 * A.surfaceForce(flowAt(15), stalled).cd, `${sep.cd.toFixed(4)} vs ${A.surfaceForce(flowAt(15), stalled).cd.toFixed(4)}`);
    const neg = A.surfaceForce(flowAt(-30), stalled);
    ok("!! SYMMETRIC: -30 degrees gives -cl and the same cd and the same force magnitude as +30", near(neg.cl, -sep.cl, 1e-12) && near(neg.cd, sep.cd, 1e-12) && near(norm3(neg.force), norm3(sep.force), 1e-9));
    const mid = A.surfaceForce(flowAt(19), stalled), t = (19 - 15) / 8, blend = t * t * (3 - 2 * t), a19 = 19 * D;
    ok("!! INSIDE the blend (19 deg, halfway) cl is the smoothstep mix of the two forms: (1-b) clAlpha sin cos + b sin(2 alpha), b = 0.5", near(mid.cl, (1 - blend) * 5.7 * Math.sin(a19) * Math.cos(a19) + blend * Math.sin(2 * a19), 1e-12) && near(blend, 0.5, 1e-12), `cl=${mid.cl.toFixed(5)}`);
    // the angle is the TOTAL alpha -- incidence and control deflection count, the geometric angle alone does not decide it
    const tilted = A.createSurface({ area: 4, aspectRatio: 6, clAlpha: 5.7, stall: A.STALL, incidence: 0.1 }), plain = A.createSurface({ area: 4, aspectRatio: 6, clAlpha: 5.7, incidence: 0.1 });
    const atTilt = A.surfaceForce(flowAt(12), tilted), noTilt = A.surfaceForce(flowAt(12), plain);   // 12 deg + 5.73 deg of incidence = 17.7 deg total, in the blend
    ok("!! the stall angle is the TOTAL alpha: 12 deg of flow + 0.1 rad of incidence stalls (cl differs from the un-stalled form), 12 deg alone does not", atTilt.alpha > A.STALL.angle && atTilt.cl !== noTilt.cl && A.surfaceForce(flowAt(12), stalled).cl === A.surfaceForce(flowAt(12), wing).cl, `alpha=${(atTilt.alpha / D).toFixed(2)}deg`);
    ok("!! no NaN or Infinity anywhere in -180..180 degrees at 0.5 deg steps, and cl never exceeds the flat plate's 1.0 once past the blend", (() => { for (let deg = -180; deg <= 180; deg += 0.5) { const r = A.surfaceForce(flowAt(deg), stalled); if (!Number.isFinite(r.cl) || !Number.isFinite(r.cd) || !r.force.every(Number.isFinite)) return false; if (Math.abs(deg) >= 23 && Math.abs(deg) <= 157 && Math.abs(r.cl) > 1 + 1e-12) return false; } return true; })());
}

console.log(fails ? `\naeroSurface-selfcheck: ${fails} FAILED` : "\naeroSurface-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
