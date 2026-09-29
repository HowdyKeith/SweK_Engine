// WebGLEngine/brain/autopilot6dof-selfcheck.mjs
//
// Run: node brain/autopilot6dof-selfcheck.mjs
//
// THE SIBLING GATE OF brain/autopilot6dof.mjs. SECTION 1 proves pointingError() the strong way: not just that
// its axis/angle LOOK right, but that applying the returned rotation vector as an actual quaternion rotation
// takes `from` exactly to `to`, for hand cases (90deg, the 180deg degenerate branch) AND random pairs.
//
// SECTION 4 is the load-bearing physics claim: this file's own header derives that the control law reduces,
// under small-angle linearisation, to a damped harmonic oscillator, critically damped at kd=2*sqrt(kp). That
// claim is checked TWO ways here -- against the REAL nonlinear rigidBody6dof.mjs simulator (not the linearised
// model itself, which would only prove the algebra, not the physics) -- with the DEFAULT (critical) gains
// converging to alignment and STAYING there, and a deliberately underdamped kd (1/8 of critical) measurably
// overshooting and oscillating. Both cases are measured from the same starting error with the same kp, so the
// only variable is kd -- proving the "critically damped" claim is testing something real, not a threshold that
// would pass regardless of damping.
//
// SABOTAGE LOG -- each applied to brain/autopilot6dof.mjs, the gate run, the module restored (diffed to
// confirm byte-identical):
//   A  the torque law's kd term sign flipped (kp * eBody[i] + kd * body.w[i] instead of minus -- so angular
//      velocity ADDS to the drive instead of damping it) -> 3 red: section 3 (facing gets WORSE, not better,
//      over real ticks), section 4's critical-damping check ("critical" gains now amplify rather than damp,
//      blowing straight past the overshoot threshold to facingCos -0.9999 -- overshooting past the target
//      entirely) and section 8's 180deg convergence-within-budget check (the ship spins up and never settles
//      within the whole 300-tick budget).
//   B  the degenerate 180deg branch removed entirely (the near-zero-cross-product case falls through to the
//      zero vector instead of pi*perp) -> 3 red: section 1's direct 180deg magnitude and apply-it-and-check
//      checks (both read 0 instead of pi / an unmoved vector), and section 8 (a ship started facing exactly
//      away from the target never begins turning -- zero torque forever, since eBody stays [0,0,0] the whole
//      run). Section 1's "axis is perpendicular to from" check stays green even under this sabotage -- the
//      zero vector is trivially perpendicular to everything, a reminder that a dot-product-is-zero check alone
//      cannot tell "correct perpendicular axis" from "no axis at all"; the magnitude and apply-it checks are
//      what actually catch it.
//   C  thrust's standoff comparison inverted (range < spec.standoff instead of range > spec.standoff, so the
//      ship thrusts only when ALREADY close and coasts when far) -> red: section 5's thrust-on-when-far and
//      thrust-off-when-close checks (both read backwards from what the sabotaged code now does).
"use strict";
import { pathToFileURL } from "node:url";
import { createBody, boxInertia, rotateByQuat, createAccumulator, applyForceAtPoint, step } from "../physics/mechanics/rigidBody6dof.mjs";
import { leadMoving } from "../physics/ballistics.mjs";
import * as AP from "./autopilot6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const near3 = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** axis*angle -> the quaternion it represents ([qw,qx,qy,qz], freeRotation.mjs's convention), for direct proof. */
function quatFromRotVec(e) {
    const angle = norm3(e);
    if (angle < 1e-12) return [1, 0, 0, 0];
    const axis = e.map((v) => v / angle);
    const h = angle / 2;
    return [Math.cos(h), axis[0] * Math.sin(h), axis[1] * Math.sin(h), axis[2] * Math.sin(h)];
}

console.log("autopilot6dof-selfcheck -- a PD torque/thrust attitude controller for rigidBody6dof.mjs ships\n");

console.log("1. pointingError() -- PROVEN BY ACTUALLY APPLYING THE ROTATION, NOT JUST INSPECTING AXIS/ANGLE");
{
    ok("already-aligned pair returns the zero vector", near3(AP.pointingError([1, 0, 0], [1, 0, 0]), [0, 0, 0]));

    const e90 = AP.pointingError([1, 0, 0], [0, 1, 0]);
    ok("!! 90deg case: magnitude is pi/2", near(norm3(e90), Math.PI / 2), `|e|=${norm3(e90)}`);
    ok("!! ...and applying it as a quaternion rotation actually takes [1,0,0] to [0,1,0]", near3(rotateByQuat(quatFromRotVec(e90), [1, 0, 0]), [0, 1, 0]), `${rotateByQuat(quatFromRotVec(e90), [1, 0, 0])}`);

    const e180 = AP.pointingError([1, 0, 0], [-1, 0, 0]);
    ok("!! the degenerate 180deg case returns a nonzero, pi-magnitude vector (not stuck at zero torque forever)", near(norm3(e180), Math.PI), `|e|=${norm3(e180)}`);
    ok("!! its axis is perpendicular to `from` (a valid rotation axis for a from->to flip)", near(dot3(e180, [1, 0, 0]), 0));
    ok("!! ...and applying it actually takes [1,0,0] to [-1,0,0]", near3(rotateByQuat(quatFromRotVec(e180), [1, 0, 0]), [-1, 0, 0], 1e-6));

    // random pairs: the strong, general version of the same proof.
    let s = 13371337 >>> 0;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const randUnit3 = () => { let v; do { v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (norm3(v) < 1e-6); const n = norm3(v); return v.map((c) => c / n); };
    let worst = 0;
    for (let trial = 0; trial < 100; trial++) {
        const from = randUnit3(), to = randUnit3();
        const e = AP.pointingError(from, to);
        const got = rotateByQuat(quatFromRotVec(e), from);
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(got[i] - to[i]));
    }
    ok("!! 100 random (from,to) pairs: applying pointingError()'s own rotation vector always lands exactly on `to`", worst < 1e-6, `worst component diff = ${worst.toExponential(2)}`);
}

console.log("\n2. decide() -- ZERO TORQUE WHEN ALREADY ALIGNED AND AT REST");
{
    const I = [2, 3, 1];
    const body = createBody({ mass: 6, I, pos: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] });
    const d = AP.decide(body, { pos: [50, 0, 0] }, {});
    ok("!! torqueBody is exactly [0,0,0] facing directly at the target with w=0", d.torqueBody.every((v) => v === 0), `${d.torqueBody}`);
    ok("facingCos reads 1 (perfectly aligned)", near(d.facingCos, 1));
}

console.log("\n3. decide() -- THE RETURNED TORQUE ACTUALLY REDUCES THE ERROR (real ticks, not just sign-checked)");
{
    const I = [1, 1, 1];   // symmetric -- no gyroscopic cross-coupling to confound this isolation
    let s = createBody({ mass: 5, I, pos: [0, 0, 0], q: [Math.cos(0.5), 0, Math.sin(0.5), 0] });   // ~57deg off
    const target = { pos: [1000, 0, 0], vel: [0, 0, 0] };
    const cosTrace = [];
    for (let i = 0; i < 30; i++) {
        const d = AP.decide(s, target, { standoff: 1e9 });   // huge standoff -> thrust never fires, isolates attitude
        const acc = createAccumulator(); acc.torque = d.torqueBody;
        s = step(s, acc, 1 / 30);
        cosTrace.push(d.facingCos);
    }
    ok("!! facing improves: the LAST sample is closer to aligned than the FIRST", cosTrace[cosTrace.length - 1] > cosTrace[0] + 0.3, `first=${cosTrace[0].toFixed(4)} last=${cosTrace[cosTrace.length - 1].toFixed(4)}`);
}

console.log("\n4. *** CRITICAL DAMPING (kd=2*sqrt(kp), THE DEFAULT) CONVERGES WITHOUT OVERSHOOT; UNDERDAMPED DOES ***");
{
    const I = [1, 1, 1];
    function run(kp, kd) {
        let s = createBody({ mass: 5, I, pos: [0, 0, 0], q: [Math.cos(0.15), 0, Math.sin(0.15), 0] });
        const target = { pos: [1000, 0, 0], vel: [0, 0, 0] };
        const trace = [];
        for (let i = 0; i < 200; i++) {
            const d = AP.decide(s, target, { kp, kd, standoff: 1e9 });
            const acc = createAccumulator(); acc.torque = d.torqueBody;
            s = step(s, acc, 1 / 30);
            trace.push(d.facingCos);
        }
        return trace;
    }
    const kp = 6, kdCrit = 2 * Math.sqrt(kp), kdUnder = kdCrit / 8;
    const critTrace = run(kp, kdCrit), underTrace = run(kp, kdUnder);
    const firstNear = (trace, thresh) => trace.findIndex((v) => v > thresh);
    const critFirst = firstNear(critTrace, 0.999), underFirst = firstNear(underTrace, 0.999);
    report("critical run: first tick cos>0.999", critFirst);
    report("underdamped run: first tick cos>0.999", underFirst);
    ok("both runs actually reach near-alignment within the budget (a meaningful comparison needs both to converge)", critFirst >= 0 && underFirst >= 0);
    if (critFirst >= 0 && underFirst >= 0) {
        const critMinAfter = Math.min(...critTrace.slice(critFirst));
        const underMinAfter = Math.min(...underTrace.slice(underFirst));
        ok("!! critically damped: once aligned it STAYS aligned (cos never drops back below 0.995)", critMinAfter > 0.995, `min after first alignment = ${critMinAfter.toFixed(6)}`);
        ok("!! underdamped (kd/8): it visibly OVERSHOOTS and oscillates (cos DOES drop back below 0.995 again)", underMinAfter < 0.995, `min after first alignment = ${underMinAfter.toFixed(6)}`);
    }
}

console.log("\n5. THRUST -- ON WHEN FACING AND FAR, OFF WHEN CLOSE, OFF WHEN NOT FACING");
{
    const I = [1, 1, 1];
    const facingFar = createBody({ mass: 5, I, pos: [0, 0, 0] });
    ok("!! facing the target, well beyond standoff -> thrust ON", AP.decide(facingFar, { pos: [500, 0, 0] }, { standoff: 40 }).thrust > 0);
    const facingClose = createBody({ mass: 5, I, pos: [0, 0, 0] });
    ok("!! facing the target, INSIDE standoff -> thrust OFF", AP.decide(facingClose, { pos: [10, 0, 0] }, { standoff: 40 }).thrust === 0);
    const notFacing = createBody({ mass: 5, I, pos: [0, 0, 0], q: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0] });   // 90deg off
    ok("!! 90deg off-target, far away -> thrust OFF (not facing the right way to burn toward it)", AP.decide(notFacing, { pos: [500, 0, 0] }, { standoff: 40 }).thrust === 0);
}

console.log("\n6. FIRING -- ALIGNED AND IN RANGE ONLY");
{
    const I = [1, 1, 1];
    const aligned = createBody({ mass: 5, I, pos: [0, 0, 0] });
    ok("!! aligned, in range -> firing TRUE", AP.decide(aligned, { pos: [100, 0, 0] }, { fireRange: 300, fireAngle: 0.05 }).firing === true);
    ok("!! aligned, OUT of range -> firing FALSE", AP.decide(aligned, { pos: [1000, 0, 0] }, { fireRange: 300, fireAngle: 0.05 }).firing === false);
    const off = createBody({ mass: 5, I, pos: [0, 0, 0], q: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0] });
    ok("!! in range but 90deg off -> firing FALSE", AP.decide(off, { pos: [100, 0, 0] }, { fireRange: 300, fireAngle: 0.05 }).firing === false);
}

console.log("\n7. LEAD AIMING DELEGATES TO physics/ballistics.mjs's OWN leadMoving() EXACTLY");
{
    const body = createBody({ mass: 5, I: [1, 1, 1], pos: [0, 0, 0], vel: [5, 2, 0] });
    const target = { pos: [200, 30, -10], vel: [-8, 4, 3] };
    const weaponSpeed = 900;
    const lead = leadMoving(body.pos, body.vel, target.pos, target.vel, weaponSpeed);
    const eBodyExpected = AP.pointingError(rotateByQuat(body.q, AP.FORWARD_BODY), lead.dir);
    const d = AP.decide(body, target, { weaponSpeed, standoff: 1e9 });
    // decide()'s torqueBody = I[i]*(kp*eBody[i] - kd*w[i]); w=[0,0,0] here and identity q means body frame ==
    // world frame, so dividing back out kp*I[i] recovers leadMoving()'s own implied error vector exactly.
    const eBodyFromDecide = d.torqueBody.map((v, i) => v / (body.I[i] * 6));   // kp default=6
    let worst = 0; for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(eBodyFromDecide[i] - eBodyExpected[i]));
    ok("!! ...to floating precision, recovered from decide()'s own torque output", worst < 1e-9, `worst diff ${worst.toExponential(2)}`);

    const dNoLead = AP.decide(body, target, { standoff: 1e9 });   // no weaponSpeed -> aims at target's CURRENT position
    const eNoLead = dNoLead.torqueBody.map((v, i) => v / (body.I[i] * 6));
    let differs = false; for (let i = 0; i < 3; i++) if (Math.abs(eNoLead[i] - eBodyExpected[i]) > 1e-3) differs = true;
    ok("!! ...and WITHOUT weaponSpeed, the decision genuinely differs (it is really leading, not ignoring the option)", differs);
}

console.log("\n8. A 180-DEGREE STARTING ERROR CONVERGES AND REACHES FIRING RANGE WITHIN A REASONABLE TICK BUDGET");
{
    const I = boxInertia({ m: 8, hx: 0.8, hy: 0.8, hz: 1.8 });
    let s = createBody({ mass: 8, I, pos: [0, 0, 0], q: [0, 0, 1, 0] });
    const target = { pos: [40, 0, 0], vel: [0, 0, 0] };
    let ticks = 0, fired = false;
    for (; ticks < 300; ticks++) {
        const d = AP.decide(s, target, {});
        const acc = createAccumulator();
        applyForceAtPoint(acc, [d.thrust, 0, 0], [0, 0, -0.9]);
        acc.torque = d.torqueBody;
        s = step(s, acc, 1 / 30);
        if (d.firing) { fired = true; break; }
    }
    ok("!! a ship started facing directly AWAY from its target turns, closes, and fires within 300 ticks (10s)", fired, `${ticks} ticks`);
}

console.log("\n9. THE FRONT DOOR");
{
    const L = AP.reportLines();
    ok("reportLines names the module and shows convergence from a 180deg error", L.some((l) => /autopilot6dof/.test(l)) && L.some((l) => /ticks to/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nautopilot6dof-selfcheck: ${fails} FAILED` : "\nautopilot6dof-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
