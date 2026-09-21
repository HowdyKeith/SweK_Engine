// WebGLEngine/physics/mechanics/rigidBody6dofCollision-selfcheck.mjs
//
// Run: node physics/mechanics/rigidBody6dofCollision-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/rigidBody6dofCollision.mjs. Every number below is either a closed-form
// textbook result (billiard-ball elastic exchange, the 1D two-body formula), a conservation LAW that must hold
// for ANY valid impulse regardless of contact-point approximation (momentum, angular momentum about a fixed
// point, energy non-increasing), or a direct geometric fact about a hand-placed box pair -- never a tolerance
// picked to make a run pass. The same formula was verified independently in a standalone scratch script before
// being written into rigidBody6dofCollision.mjs; this gate re-derives the closed forms itself rather than
// importing that scratch script, so the gate does not trust the same arithmetic it is meant to be checking.
//
// SECTION 3's conservation-law sweep is the load-bearing one: it proves momentum and angular-momentum
// conservation hold for resolveCollision() called with a RANDOM (unphysical) contact point, not just the
// realistic one contactPoint() picks -- because the proof (see rigidBody6dofCollision.mjs's own header) is that
// rA-rB = posB-posA identically for ANY shared point, so conservation never depended on contactPoint()'s own
// accuracy. Energy is checked to only ever DECREASE or hold (never increase, for any e in [0,1]) and to be
// EXACTLY conserved at e=1 -- the elastic case has zero slack for a tolerance to hide a real leak behind.
//
// SABOTAGE LOG -- each applied to physics/mechanics/rigidBody6dofCollision.mjs, the gate run, the module
// restored (diffed to confirm byte-identical):
//   A  the angular term's sign flipped in resolveCollision's K (dot3(n, angAworld) + dot3(n, angBworld) changed
//      to a subtraction) -> 3 red: section 3's energy-non-increasing AND exact-at-e=1 checks (a wrong-sign
//      angular term shrinks K for any off-centre contact, driving j past the energy-conserving magnitude) and
//      section 4's e=0 check (contact-point relative velocity no longer converges to zero). Section 1 stays
//      green -- a pure centre-line impact has zero angular contribution to K regardless of the term's sign, so
//      that check alone cannot see this sabotage; it takes an off-centre case to catch it.
//   B  the already-separating short-circuit's comparison inverted (vn < 0 instead of vn > 0, so approaching
//      pairs are skipped and separating pairs get an impulse) -> 7 red across sections 1, 2, 4 and 5: every
//      approaching-pair case now returns j=0 (or, for section 5's already-separating pair, a nonzero,
//      physically backwards impulse). Section 3's conservation-law sweep stays green -- momentum/angular-
//      momentum/energy conservation are properties of the FORMULA, not of when it fires, so a sabotage that
//      only changes WHICH trials get an impulse (not what the impulse computes once applied) cannot be seen by
//      a check that already skips j=0 trials on both the sabotaged and the correct code path.
//   C  contactPoint()'s two projected terms un-averaged (returns pA instead of the midpoint of pA and pB) ->
//      0 red on sections 1-5 (conservation holds for ANY point, by construction -- this IS the point of the
//      header's proof) but red on section 7's direct geometric check of where the contact point actually
//      lands for two axis-aligned touching boxes.
//   D  positionalCorrection()'s inverse-mass division dropped (mag = penetration * percent instead of
//      penetration / (1/a.mass + 1/b.mass) * percent) -> *** FIRST RUN: 0 RED, A FINDING NOT A PASS. *** The
//      section 1 "exact formula" check originally used two EQUAL masses (2 and 2), for which 1/mA+1/mB is
//      exactly 1 -- the exact value the sabotage implicitly assumes -- so the two formulas coincide for that
//      one case; section 2's ratio check only tests the mass SPLIT (dLight/dHeavy), which is blind to a
//      constant scale error applied equally to both. Fixed by changing section 1 to UNEQUAL masses (2 and 6,
//      1/mA+1/mB = 2/3), which makes the two formulas diverge (0.098 correct vs 0.0653 sabotaged) --
//      RE-SABOTAGED AFTER THE FIX: now 1 red, exactly there. Logged per this file's own house rule: a
//      sabotage that goes 0 red is the check's problem, not evidence the code is fine.
//   E  resolveCollision() made to unconditionally `return { j: 0, a, b }` (no impulse ever applied, for ANY
//      input) -- found by an ADVERSARIAL REVIEW to be a hole in section 3 specifically: with `checked` staying
//      0 (no trial ever produces a real impulse), the four conservation-law error variables never leave their
//      initialised 0, which reads identically to "impulse always exactly conserves everything." Sections 1, 2,
//      4 correctly go red regardless (they always exercise resolveCollision() directly) -- section 3 alone
//      needed the `checked > 50` assertion added above it to close the gap. Verified: 6 red total (sections 1,
//      2, 4, and section 3's own checked-count check), confirming the fix actually closes what the review found.
"use strict";
import { pathToFileURL } from "node:url";
import { boxInertia, createBody, rotateByQuat } from "./rigidBody6dof.mjs";
import * as C from "./rigidBody6dofCollision.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a, b) => add3(a, b, -1);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const near3 = (a, b, eps = 1e-9) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

function KE(body) {
    const lin = 0.5 * body.mass * dot3(body.vel, body.vel);
    const rot = 0.5 * (body.I[0] * body.w[0] ** 2 + body.I[1] * body.w[1] ** 2 + body.I[2] * body.w[2] ** 2);
    return lin + rot;
}
function totalMomentum(a, b) { return add3(scale3(a.vel, a.mass), scale3(b.vel, b.mass)); }
function angMomentumAbout(origin, body) {
    const r = sub3(body.pos, origin);
    const Lspin = rotateByQuat(body.q, [body.I[0] * body.w[0], body.I[1] * body.w[1], body.I[2] * body.w[2]]);
    return add3(Lspin, cross3(r, scale3(body.vel, body.mass)));
}
let seed = 424242 >>> 0;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randUnitQuat() { let x, y, z, w, n2; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; w = rnd() * 2 - 1; n2 = x * x + y * y + z * z + w * w; } while (n2 < 1e-6 || n2 > 1); const n = Math.sqrt(n2); return [w / n, x / n, y / n, z / n]; }

console.log("rigidBody6dofCollision-selfcheck -- OBB detection (obbOverlap.js) + a hand-derived impulse response\n");

console.log("1. HEAD-ON, EQUAL MASS, e=1 -- CLOSED FORM: VELOCITIES SWAP EXACTLY (billiard-ball case)");
{
    const I = [1, 1, 1];
    const a = createBody({ mass: 2, I, pos: [-1, 0, 0], vel: [5, 0, 0] });
    const b = createBody({ mass: 2, I, pos: [1, 0, 0], vel: [-3, 0, 0] });
    const p = [0, 0, 0], n = [1, 0, 0];   // on the centre line -> rA x n = rB x n = 0, no spin induced
    const { j, a: a2, b: b2 } = C.resolveCollision(a, b, { point: p, normal: n }, { restitution: 1 });
    ok("!! j > 0 (an approaching pair gets a real impulse)", j > 0, `j=${j.toFixed(6)}`);
    ok("!! a.vel === [-3,0,0] exactly, b.vel === [5,0,0] exactly", a2.vel[0] === -3 && b2.vel[0] === 5, `a.vel=${a2.vel} b.vel=${b2.vel}`);
    ok("...neither body picks up spin from a centre-line impact", norm3(a2.w) === 0 && norm3(b2.w) === 0);
}

console.log("\n2. UNEQUAL MASS, e=1 -- CLOSED FORM: THE STANDARD 1D TWO-BODY FORMULA");
{
    const m1 = 3, m2 = 7, v1 = 4, v2 = -2, I = [1, 1, 1];
    const a = createBody({ mass: m1, I, pos: [-1, 0, 0], vel: [v1, 0, 0] });
    const b = createBody({ mass: m2, I, pos: [1, 0, 0], vel: [v2, 0, 0] });
    const { a: a2, b: b2 } = C.resolveCollision(a, b, { point: [0, 0, 0], normal: [1, 0, 0] }, { restitution: 1 });
    const v1p = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2), v2p = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
    ok("!! a.vel[0] matches the textbook 1D elastic-collision formula", Math.abs(a2.vel[0] - v1p) < 1e-12, `got ${a2.vel[0]} want ${v1p}`);
    ok("!! b.vel[0] matches the textbook 1D elastic-collision formula", Math.abs(b2.vel[0] - v2p) < 1e-12, `got ${b2.vel[0]} want ${v2p}`);
}

console.log("\n3. *** OFF-CENTRE, RANDOM ORIENTATION/INERTIA/CONTACT-POINT -- CONSERVATION LAWS OVER 200 TRIALS ***");
{
    let maxMomErr = 0, maxAngErr = 0, maxEnergyGrowth = 0, elasticEnergyErr = 0, checked = 0;
    for (let trial = 0; trial < 200; trial++) {
        const mA = 0.5 + rnd() * 5, mB = 0.5 + rnd() * 5;
        const IA = [0.3 + rnd() * 2, 0.3 + rnd() * 2, 0.3 + rnd() * 2], IB = [0.3 + rnd() * 2, 0.3 + rnd() * 2, 0.3 + rnd() * 2];
        const a = createBody({ mass: mA, I: IA, pos: [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2], vel: [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3], q: randUnitQuat(), w: [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1] });
        const b = createBody({ mass: mB, I: IB, pos: [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2], vel: [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3], q: randUnitQuat(), w: [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1] });
        const p = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];   // deliberately arbitrary, NOT geometrically "real"
        let n = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; const nl = norm3(n); n = n.map((c) => c / nl);
        const e = trial % 4 === 0 ? 1 : rnd();   // force some exactly-elastic trials for the zero-slack energy check

        const beforeMom = totalMomentum(a, b), beforeAng = add3(angMomentumAbout([0, 0, 0], a), angMomentumAbout([0, 0, 0], b)), beforeE = KE(a) + KE(b);
        const { j, a: a2, b: b2 } = C.resolveCollision(a, b, { point: p, normal: n }, { restitution: e });
        if (j === 0) continue;
        checked++;
        const afterMom = totalMomentum(a2, b2), afterAng = add3(angMomentumAbout([0, 0, 0], a2), angMomentumAbout([0, 0, 0], b2)), afterE = KE(a2) + KE(b2);
        maxMomErr = Math.max(maxMomErr, norm3(sub3(afterMom, beforeMom)) / (norm3(beforeMom) || 1));
        maxAngErr = Math.max(maxAngErr, norm3(sub3(afterAng, beforeAng)) / (norm3(beforeAng) || 1));
        if (afterE > beforeE) maxEnergyGrowth = Math.max(maxEnergyGrowth, (afterE - beforeE) / beforeE);
        if (e === 1) elasticEnergyErr = Math.max(elasticEnergyErr, Math.abs(afterE - beforeE) / beforeE);
    }
    report("trials with a real (non-skipped) impulse", checked);
    // !! a review found this section vacuously passes if `checked` is 0 -- the four error variables below stay
    // at their initial 0 forever if no trial ever calls resolveCollision(), which reads identically to
    // "impulse always exactly conserves everything." Confirmed directly: a resolveCollision() hard-coded to
    // always return j=0 (no impulse ever applied, for ANY input) makes every check below PASS with checked=0,
    // while every OTHER section of this gate (1, 2, 4, 5) correctly goes red against that same sabotage. This
    // assertion is what closes that gap for section 3 specifically.
    ok("!! a meaningful number of the 200 random trials actually produced a real impulse (not a vacuous 0-trial pass)", checked > 50, `checked=${checked}`);
    ok("!! total linear momentum conserved to float precision, for an ARBITRARY (non-physical) contact point", maxMomErr < 1e-9, `max rel err ${maxMomErr.toExponential(2)}`);
    ok("!! total angular momentum about a fixed external origin conserved, SAME arbitrary point", maxAngErr < 1e-9, `max rel err ${maxAngErr.toExponential(2)}`);
    ok("!! kinetic energy NEVER increases, for any restitution in [0,1]", maxEnergyGrowth < 1e-9, `max growth ${maxEnergyGrowth.toExponential(2)}`);
    ok("!! at e=1 (perfectly elastic) energy is conserved with ZERO slack, not merely bounded", elasticEnergyErr < 1e-9, `max rel err ${elasticEnergyErr.toExponential(2)}`);
}

console.log("\n4. e=0 PERFECTLY INELASTIC -- POST-COLLISION NORMAL RELATIVE VELOCITY AT CONTACT IS EXACTLY ZERO");
{
    const a = createBody({ mass: 1.3, I: [0.7, 1.1, 0.9], pos: [0, 0, 0], vel: [2, 1, -1], w: [0.4, -0.2, 0.1] });
    const b = createBody({ mass: 2.1, I: [1.2, 0.8, 1.5], pos: [1, 0.3, -0.2], vel: [-1, 0.5, 0.2], q: randUnitQuat(), w: [-0.3, 0.2, 0.5] });
    const p = [0.4, 0.1, -0.1]; let n = [1, 0.2, -0.1]; const nl = norm3(n); n = n.map((c) => c / nl);
    const { a: a2, b: b2 } = C.resolveCollision(a, b, { point: p, normal: n }, { restitution: 0 });
    const rA = sub3(p, a2.pos), rB = sub3(p, b2.pos);
    const vpA = add3(a2.vel, cross3(rotateByQuat(a2.q, a2.w), rA)), vpB = add3(b2.vel, cross3(rotateByQuat(b2.q, b2.w), rB));
    const vnAfter = dot3(sub3(vpB, vpA), n);
    ok("!! contact-point relative velocity along the normal is ~0 after an inelastic impulse", Math.abs(vnAfter) < 1e-9, `${vnAfter.toExponential(2)}`);
}

console.log("\n5. AN ALREADY-SEPARATING PAIR GETS NO IMPULSE AT ALL");
{
    const I = [1, 1, 1];
    const a = createBody({ mass: 1, I, pos: [-1, 0, 0], vel: [-5, 0, 0] });
    const b = createBody({ mass: 1, I, pos: [1, 0, 0], vel: [5, 0, 0] });
    const { j, a: a2, b: b2 } = C.resolveCollision(a, b, { point: [0, 0, 0], normal: [1, 0, 0] }, { restitution: 0.8 });
    ok("j === 0 exactly", j === 0);
    ok("...and the returned bodies are the SAME objects (no needless copy on the no-op path)", a2 === a && b2 === b);
}

console.log("\n6. bodyOBB()/checkContact() WIRING -- A REAL GEOMETRIC CASE, ROTATION INCLUDED, NOT JUST obbOverlap.js's OWN GATE");
{
    const I = boxInertia({ m: 4, hx: 1, hy: 1, hz: 1 }), half = [1, 1, 1];
    // two unit cubes, axis-aligned, centres 1.8 apart on x -> half-extents sum to 2.0 > 1.8: they DO overlap
    const touching = C.checkContact(createBody({ mass: 4, I, pos: [-0.9, 0, 0] }), half, createBody({ mass: 4, I, pos: [0.9, 0, 0] }), half);
    ok("!! two axis-aligned unit cubes 1.8 apart on x (half-extents sum to 2.0) DO overlap", touching.hit, `depth ${touching.hit ? touching.depth.toFixed(4) : "n/a"}`);
    ok("...to the expected depth (2*1 - 1.8 = 0.2)", touching.hit && Math.abs(touching.depth - 0.2) < 1e-9);
    ok("...along the x axis (the only axis they're separated on)", touching.hit && Math.abs(Math.abs(touching.normal[0]) - 1) < 1e-9);

    // pulled 0.4 further apart -> centres 2.2 apart, half-extents sum only 2.0: clear
    const apart = C.checkContact(createBody({ mass: 4, I, pos: [-1.1, 0, 0] }), half, createBody({ mass: 4, I, pos: [1.1, 0, 0] }), half);
    ok("!! the SAME pair pulled 0.4 further apart no longer overlaps", !apart.hit);

    // a box rotated 45deg about y presents a diagonal cross-section wider than 1 along x -- reaches further than
    // the unrotated case, so a pair just barely NOT touching when axis-aligned DOES touch once one is rotated.
    // Exact geometry: a unit half-extent cube rotated 45 deg about y has an x-support of cos(45)+sin(45) = sqrt(2).
    const qY45 = [Math.cos(Math.PI / 8), 0, Math.sin(Math.PI / 8), 0];   // freeRotation.mjs's [qw,qx,qy,qz], 45 deg about Y
    const rotated = createBody({ mass: 4, I, pos: [-1.3, 0, 0], q: qY45 });
    const straight = createBody({ mass: 4, I, pos: [0.9, 0, 0] });
    const gapCase = C.checkContact(rotated, half, straight, half);   // centres 2.2 apart; unrotated would clear (2.0 < 2.2)
    ok("!! rotating one box 45deg about Y closes a gap axis-aligned boxes would clear -- toPoseQuat is really wired through to obbOverlap.js, not a no-op", gapCase.hit, `sqrt(2)+1=${(Math.SQRT2 + 1).toFixed(4)} > 2.2 gap`);
}

console.log("\n7. contactPoint() LANDS ON THE SHARED FACE FOR A DIRECT, HAND-VERIFIABLE CASE");
{
    const half = [1, 1, 1];
    const a = createBody({ mass: 1, I: [1, 1, 1], pos: [-0.9, 0.2, -0.3] });
    const b = createBody({ mass: 1, I: [1, 1, 1], pos: [0.9, 0.2, -0.3] });
    const obbA = C.bodyOBB(a, half), obbB = C.bodyOBB(b, half);
    const c = C.contactPoint(obbA, obbB, [1, 0, 0]);
    ok("!! contact point sits at x=0 (the shared face's plane, midway between the two support vertices)", Math.abs(c[0]) < 1e-9, `x=${c[0]}`);
    ok("...and carries the boxes' shared y/z offset (0.2,-0.3), not the world origin's", Math.abs(c[1] - 0.2) < 1e-9 && Math.abs(c[2] + 0.3) < 1e-9, `y=${c[1]} z=${c[2]}`);
}

console.log("\n8. *** positionalCorrection() -- A PARTIAL, MASS-SPLIT PUSH-APART, DERIVED AND MEASURED, NOT GUESSED ***");
{
    const I = [1, 1, 1];
    // (1) exact formula: separation increases by (depth-slop)*percent REGARDLESS of mass (the two masses'
    // inverse-mass split always sums back to the full correction -- see the header's own derivation). Masses
    // are deliberately UNEQUAL here (2 and 6, so 1/mA+1/mB = 2/3 =/= 1): an equal-mass pair makes 1/mA+1/mB
    // exactly 1, which would make this check blind to a sabotage that drops the inverse-mass division
    // entirely (found by sabotage-testing this very check -- see sabotage log entry D).
    const a = createBody({ mass: 2, I, pos: [0, 0, 0] }), b = createBody({ mass: 6, I, pos: [1, 0, 0] });
    const contact = { normal: [1, 0, 0], depth: 0.5 };
    const { a: a2, b: b2 } = C.positionalCorrection(a, b, contact, { percent: 0.2, slop: 0.01 });
    const sep = norm3(sub3(b2.pos, a2.pos)) - norm3(sub3(b.pos, a.pos));
    const expected = (0.5 - 0.01) * 0.2;
    ok("!! separation increases by EXACTLY (depth-slop)*percent, derived not fitted, for UNEQUAL masses", Math.abs(sep - expected) < 1e-12, `got ${sep} want ${expected}`);

    // (2) split by inverse mass: a 4x heavier body moves 1/4 as far.
    const light = createBody({ mass: 1, I, pos: [0, 0, 0] }), heavy = createBody({ mass: 4, I, pos: [1, 0, 0] });
    const { a: light2, b: heavy2 } = C.positionalCorrection(light, heavy, { normal: [1, 0, 0], depth: 0.4 }, {});
    const dLight = norm3(sub3(light2.pos, light.pos)), dHeavy = norm3(sub3(heavy2.pos, heavy.pos));
    ok("!! the 4x heavier body moves 1/4 as far as the lighter one", Math.abs(dLight / dHeavy - 4) < 1e-9, `light moved ${dLight.toFixed(4)}, heavy ${dHeavy.toFixed(4)}, ratio ${(dLight / dHeavy).toFixed(4)}`);

    // (3) position-ONLY: vel/w/q/mass/I are untouched.
    const va = createBody({ mass: 3, I: [2, 3, 4], pos: [0, 0, 0], vel: [1, -2, 3], q: [0.9, 0.1, 0.2, 0.3], w: [0.1, -0.2, 0.3] });
    const vb = createBody({ mass: 3, I: [2, 3, 4], pos: [1, 0, 0], vel: [-4, 5, -6], q: [0.9, 0.1, 0.2, 0.3], w: [-0.1, 0.2, -0.3] });
    const { a: va2, b: vb2 } = C.positionalCorrection(va, vb, { normal: [1, 0, 0], depth: 0.3 }, {});
    ok("!! velocity, angular velocity, orientation, mass and I are all UNCHANGED -- only pos moves", near3(va2.vel, va.vel) && near3(va2.w, va.w) && va2.q.every((v, i) => v === va.q[i]) && va2.mass === va.mass && va2.I.every((v, i) => v === va.I[i]));

    // (4) no penetration beyond slop -> no-op, same objects returned (matches resolveCollision's own no-op style).
    const { a: noA, b: noB } = C.positionalCorrection(a, b, { normal: [1, 0, 0], depth: 0.005 }, { slop: 0.01 });
    ok("!! depth below slop is a genuine no-op: the SAME objects come back, not merely unchanged values", noA === a && noB === b);

    // (5) repeated application is GRADUAL (geometric decay toward the slop bound: each call removes `percent`
    // of the REMAINING (depth-slop), so it approaches slop asymptotically -- it should never overshoot past
    // it into actual separation, and should visibly close most of the gap within a modest number of calls.
    let s = { a: createBody({ mass: 1, I, pos: [-0.3, 0, 0] }), b: createBody({ mass: 1, I, pos: [0.3, 0, 0] }) };
    const half = [1, 1, 1];
    const slop = 0.01;
    const startDepth = C.checkContact(s.a, half, s.b, half).depth;
    let depths = [startDepth], overshotPastSlop = false;
    for (let i = 0; i < 60; i++) {
        const c = C.checkContact(s.a, half, s.b, half);
        if (!c.hit) break;
        if (c.depth < slop - 1e-6) overshotPastSlop = true;
        s = C.positionalCorrection(s.a, s.b, c, { slop });
        depths.push(C.checkContact(s.a, half, s.b, half).hit ? C.checkContact(s.a, half, s.b, half).depth : 0);
    }
    const finalDepth = depths[depths.length - 1];
    ok("!! never overshoots past the slop bound into false separation", !overshotPastSlop);
    ok("!! 60 repeated calls close most of the way from the starting depth down toward the slop bound", finalDepth < startDepth * 0.1 && finalDepth >= slop - 1e-6, `start ${startDepth.toFixed(4)} -> ${finalDepth.toFixed(6)} (slop ${slop})`);
    ok("...monotonically -- depth never INCREASES from one call to the next", depths.every((d, i) => i === 0 || d <= depths[i - 1] + 1e-9));
}

console.log("\n9. THE FRONT DOOR");
{
    const L = C.reportLines();
    ok("reportLines names the module and shows a real contact + impulse", L.some((l) => /rigidBody6dofCollision/.test(l)) && L.some((l) => /impulse j=/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
    ok("!! ...and shows positional correction actually reducing depth", L.some((l) => /positional correction:/.test(l)));
}

console.log(fails ? `\nrigidBody6dofCollision-selfcheck: ${fails} FAILED` : "\nrigidBody6dofCollision-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
