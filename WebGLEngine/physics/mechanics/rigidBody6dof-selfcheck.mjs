// WebGLEngine/physics/mechanics/rigidBody6dof-selfcheck.mjs
//
// Run: node physics/mechanics/rigidBody6dof-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/rigidBody6dof.mjs -- a first, page-independent, AI-independent slice of
// the Newtonian 6DOF flight model (tools/ship/nextRounds.mjs's newtonian-6dof-flight-model entry). Every number
// checked below is either an EXACT analytical result (derived once, independently, by hand -- not fitted to the
// implementation) or a direct import of freeRotation.mjs's own already-proven solver, never a tolerance picked to
// make a run pass.
//
// SECTION 1 is the load-bearing one, in the same spirit as ev/flightModel3d-selfcheck.mjs's own "reduces exactly
// to flightModel.js" proof: with zero torque, this module's angular integrator must be indistinguishable from
// calling physics/mechanics/freeRotation.mjs directly -- not merely close, bit-identical, because 0/I[i] and x+0
// are exact operations in IEEE-754 and a solver that claims to extend a proven one should prove it reduces to it.
//
// SECTIONS 2-3 (linear motion under constant force) check against a formula DERIVED, not measured: symplectic
// ("semi-implicit") Euler's velocity under constant acceleration is exact for any step size (dv/dt = a with a
// constant integrates exactly under Euler, since there is no higher-order term to miss); position carries a
// KNOWN O(dt) term relative to the true continuous parabola, x(t) = x0 + v0 t + 1/2 a t^2 + 1/2 a dt t -- derived
// by direct summation of the discrete update in this file's sibling module's own header, and confirmed
// independently against a live run to 1e-14 before it was written into this gate as an exact check rather than a
// tolerance.
//
// SECTION 5 (on-axis torque) is exact for a different reason: with angular velocity confined to a single
// principal axis and torque applied along that same axis, the gyroscopic cross term (I[1]-I[2])*w[1]*w[2] and its
// cyclic siblings are all EXACTLY zero (two of the three factors in every term are zero), so the equation of
// motion collapses to a plain constant-derivative ODE that RK4 integrates exactly, the same way the linear case
// does -- w0(t) = w0_initial + (torque/I0) t, checked to floating-point precision.
//
// SABOTAGE LOG -- each applied to physics/mechanics/rigidBody6dof.mjs, the gate run, the module restored (diffed
// to confirm byte-identical):
//   A  the torque term dropped from derivWithTorque() (torqueBody[i]/I[i] never added, so an applied torque had
//      no effect at all)                                                                  -> 2 red: "the off-centre
//      application DID spin the body up" (section 4 -- it did not) and the on-axis linear-w-growth check (section
//      5 -- w0 never moved off its initial value).
//   B  step()'s position update switched from symplectic ("new" velocity) to explicit ("old" velocity) Euler
//      (physics/mechanics/rigidBody6dof.mjs's own header derives the symplectic discretisation term as +1/2 a dt
//      t; explicit Euler's own is -1/2 a dt t, a DIFFERENT, equally real term)              -> 1 red: section 3's
//      exact-formula check (measured position off by 2x the predicted dt-term, i.e. the sign of the term flipped
//      rather than merely drifting) -- the "naive parabola is measurably wrong" check right below it still
//      passed unchanged, which is the point: that check alone cannot tell symplectic from explicit Euler apart,
//      only "some dt-term exists"; the exact-formula check is what pins down WHICH one.
//   C  applyForceAtPoint()'s cross product argument order swapped (cross3(forceBody, pointBody) instead of
//      cross3(pointBody, forceBody) -- r x F computed as F x r, the negation of the correct torque)  -> 1 red:
//      the direct r x F check (point [1,0,0], force [0,2,0] must give torque [0,0,2] by the right-hand rule;
//      swapped, it gives [0,0,-2]).
"use strict";
import { boxInertia, distinctMoments, stepOmega, energy, momentumMag } from "./freeRotation.mjs";
import * as RB from "./rigidBody6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const near = (a, b, eps) => Math.abs(a - b) < eps;
const near3 = (a, b, eps) => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);

console.log("rigidBody6dof-selfcheck -- a dynamical 6DOF rigid body: F=ma, real torque on freeRotation.mjs's own solver\n");

const I = boxInertia({ m: 1, hx: 1, hy: 2, hz: 3 });   // the exact fixture freeRotation-selfcheck.mjs itself uses -- distinct moments, real intermediate axis
report("distinct moments (so the gyroscopic term can genuinely act on a mixed-axis spin): " + distinctMoments(I), I.map((v) => v.toFixed(6)).join("  "));

console.log("1. *** WITH ZERO TORQUE, THIS MODULE REDUCES TO freeRotation.mjs's OWN SOLVER -- VALUE-IDENTICAL UNDER === ***");
{
    // the exact tumbling fixture freeRotation-selfcheck.mjs itself uses: spin started near the intermediate axis
    const cases = [
        { w: [1e-6, 1, 1e-6], dt: 1e-3 },
        { w: [0.3, -0.7, 1.1], dt: 1 / 30 },
        { w: [0, 0, 0], dt: 1 / 30 },
    ];
    let allBit = true;
    for (const c of cases) {
        let w = c.w;
        for (let i = 0; i < 200; i++) {
            const viaModule = RB.stepOmegaWithTorque(I, w, [0, 0, 0], c.dt);
            const viaFreeRotation = stepOmega(I, w, c.dt);
            if (!(viaModule[0] === viaFreeRotation[0] && viaModule[1] === viaFreeRotation[1] && viaModule[2] === viaFreeRotation[2])) { allBit = false; break; }
            w = viaFreeRotation;
        }
    }
    ok("!! 200 steps x 3 seeds: stepOmegaWithTorque(I, w, [0,0,0], dt) === freeRotation.mjs's stepOmega(I, w, dt), EVERY COMPONENT, EVERY STEP", allBit);

    // and the same property through the full step() wrapper (position/orientation along for the ride, torque-free)
    let s = RB.createBody({ mass: 5, I, w: [1e-6, 1, 1e-6] });
    const acc = RB.createAccumulator();   // force AND torque both [0,0,0] -- pure coast-and-tumble
    const E0 = energy(I, s.w), L0 = momentumMag(I, s.w);
    for (let i = 0; i < 2000; i++) s = RB.step(s, acc, 1e-3);
    const E = energy(I, s.w), L = momentumMag(I, s.w);
    ok("!! ...and with zero force too, 2 s of coasting conserves body-frame energy and |L| to the same tight bound freeRotation-selfcheck.mjs itself holds its own solver to",
        Math.abs(E - E0) / E0 < 1e-6 && Math.abs(L - L0) / L0 < 1e-6, `dE/E ${((E - E0) / E0).toExponential(2)}  dL/L ${((L - L0) / L0).toExponential(2)}`);
    ok("...position does not move (zero force) and stays exactly where it started", s.pos[0] === 0 && s.pos[1] === 0 && s.pos[2] === 0);
}

console.log("\n2. LINEAR MOTION UNDER CONSTANT FORCE -- VELOCITY IS EXACT FOR ANY STEP SIZE");
{
    const mass = 3, F = [5, -2, 7], dt = 1 / 30, n = 90;
    let s = RB.createBody({ mass, pos: [1, 2, 3], vel: [0.5, -1, 2], q: [1, 0, 0, 0] });
    const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, F, [0, 0, 0]);   // at the CoM -- zero torque, pure translation
    for (let i = 0; i < n; i++) s = RB.step(s, acc, dt);
    const t = n * dt, a = F.map((f) => f / mass);
    const expectVel = [0.5, -1, 2].map((v0, i) => v0 + a[i] * t);
    ok("!! v(t) = v0 + (F/m) t EXACTLY (dv/dt = a with a constant has no higher-order term for Euler to miss, regardless of step size)",
        near3(s.vel, expectVel, 1e-9), `${s.vel.map((v) => v.toFixed(9))} vs ${expectVel.map((v) => v.toFixed(9))}`);
}

console.log("\n3. POSITION MATCHES THE DERIVED SYMPLECTIC-EULER FORMULA, NOT A LOOSE TOLERANCE");
{
    const mass = 3, F = [5, -2, 7], dt = 1 / 30, n = 90, p0 = [1, 2, 3], v0 = [0.5, -1, 2];
    let s = RB.createBody({ mass, pos: p0, vel: v0, q: [1, 0, 0, 0] });
    const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, F, [0, 0, 0]);
    for (let i = 0; i < n; i++) s = RB.step(s, acc, dt);
    const t = n * dt, a = F.map((f) => f / mass);
    // x(t) = x0 + v0 t + 1/2 a t^2 + 1/2 a dt t -- the true parabola PLUS the discretisation term derived in this
    // file's own header by summing the discrete update in closed form (not fitted to a run of the code).
    const expectPos = p0.map((x0, i) => x0 + v0[i] * t + 0.5 * a[i] * t * t + 0.5 * a[i] * dt * t);
    ok("!! p(t) = p0 + v0 t + 1/2 a t^2 + 1/2 a dt t, the EXACT symplectic-Euler discretisation, DERIVED not fitted",
        near3(s.pos, expectPos, 1e-9), `${s.pos.map((v) => v.toFixed(9))} vs ${expectPos.map((v) => v.toFixed(9))}`);
    // and the naive continuous parabola (no dt term) must NOT match as tightly -- proving the dt term is real, not a no-op
    const naivePos = p0.map((x0, i) => x0 + v0[i] * t + 0.5 * a[i] * t * t);
    const gapToNaive = Math.max(...s.pos.map((v, i) => Math.abs(v - naivePos[i])));
    ok("...and the naive continuous parabola (dropping the dt term) is measurably WRONG, by exactly 1/2 a dt t -- the discretisation term is real",
        gapToNaive > 1e-4, `gap to naive ${gapToNaive.toExponential(3)}, predicted 1/2 a dt t = ${a.map((ai) => (0.5 * ai * dt * t).toFixed(6))}`);
}

console.log("\n4. FORCE APPLIED OFF-CENTRE INDUCES TORQUE = r x F EXACTLY, AND NET FORCE ALONE DECIDES ONE TICK'S TRANSLATION");
{
    const acc1 = RB.createAccumulator(); RB.applyForceAtPoint(acc1, [0, 2, 0], [1, 0, 0]);
    ok("torque = r x F: point [1,0,0], force [0,2,0] -> torque [0,0,2] (right-hand rule)", near3(acc1.torque, [0, 0, 2], 1e-12));
    const acc2 = RB.createAccumulator(); RB.applyForceAtPoint(acc2, [9, -4, 7], [0, 0, 0]);
    ok("a force applied exactly AT the centre of mass induces zero torque, whatever its magnitude", near3(acc2.torque, [0, 0, 0], 1e-12));

    // SAME net force, DIFFERENT application points -> for ONE tick, vel/pos must be BIT-IDENTICAL (translation
    // depends only on net force); w must DIFFER (only torque depends on where it was applied).
    const state0 = RB.createBody({ mass: 2, I, pos: [0, 0, 0], vel: [1, 1, 1], q: [1, 0, 0, 0], w: [0, 0, 0] });
    const accOnAxis = RB.createAccumulator(); RB.applyForceAtPoint(accOnAxis, [0, 0, 10], [0, 0, 0]);
    const accOffAxis = RB.createAccumulator(); RB.applyForceAtPoint(accOffAxis, [0, 0, 10], [1, 0, 0]);
    const sOn = RB.step(state0, accOnAxis, 1 / 30), sOff = RB.step(state0, accOffAxis, 1 / 30);
    ok("!! one tick, same net force at two different points: vel is BIT-IDENTICAL", sOn.vel[0] === sOff.vel[0] && sOn.vel[1] === sOff.vel[1] && sOn.vel[2] === sOff.vel[2]);
    ok("...pos is BIT-IDENTICAL too", sOn.pos[0] === sOff.pos[0] && sOn.pos[1] === sOff.pos[1] && sOn.pos[2] === sOff.pos[2]);
    ok("...but the off-centre application DID spin the body up (w != 0) while the on-axis one did not", !near3(sOff.w, [0, 0, 0], 1e-12) && near3(sOn.w, [0, 0, 0], 1e-12), `on-axis w ${sOn.w}  off-axis w ${sOff.w}`);
}

console.log("\n5. TORQUE ALONG A SINGLE PRINCIPAL AXIS GROWS w EXACTLY LINEARLY -- THE GYROSCOPIC TERM PROVABLY VANISHES THERE");
{
    let s = RB.createBody({ mass: 1, I, w: [0.1, 0, 0] });
    const acc = RB.createAccumulator(); acc.torque = [0.7, 0, 0];
    const dt = 1 / 30, n = 500;
    for (let i = 0; i < n; i++) s = RB.step(s, acc, dt);
    const t = n * dt, expectW0 = 0.1 + 0.7 / I[0] * t;
    ok("!! w0(t) = w0_initial + (torque0/I0) t EXACTLY -- the gyroscopic term (I1-I2)w1w2/I0 is a product of two ZEROS when w stays purely on-axis",
        near(s.w[0], expectW0, 1e-9), `${s.w[0].toFixed(9)} vs ${expectW0.toFixed(9)}`);
    ok("...and w1, w2 STAY exactly zero the entire run -- torque on one principal axis with no cross-coupling never leaks into the others",
        s.w[1] === 0 && s.w[2] === 0, `w1=${s.w[1]}  w2=${s.w[2]}`);
}

console.log("\n6. THE QUATERNION STAYS UNIT UNDER SUSTAINED, ASYMMETRIC TORQUE");
{
    let s = RB.createBody({ mass: 4, I });
    const acc = RB.createAccumulator(); acc.torque = [0.3, -0.5, 0.2];
    let worstNorm = 0;
    for (let i = 0; i < 3000; i++) { s = RB.step(s, acc, 1 / 30); worstNorm = Math.max(worstNorm, Math.abs(Math.hypot(...s.q) - 1)); }
    ok("!! 100 s of sustained asymmetric torque: |q| stays within 1e-9 of unit, every step's worst case", worstNorm < 1e-9, `worst |q|-1 = ${worstNorm.toExponential(2)}`);
}

console.log("\n7. DETERMINISM");
{
    const mk = () => RB.createBody({ mass: 7, I, pos: [1, -2, 3], vel: [0.2, 0, -0.1], q: [0.9, 0.1, 0.2, 0.3], w: [0.05, -0.02, 0.1] });
    const runOnce = () => { let s = mk(); const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [3, -1, 2], [0.4, 0, -0.9]); for (let i = 0; i < 500; i++) s = RB.step(s, acc, 1 / 30); return s; };
    const a = runOnce(), b = runOnce();
    ok("the same initial state and inputs produce BIT-IDENTICAL results run twice",
        a.pos.every((v, i) => v === b.pos[i]) && a.vel.every((v, i) => v === b.vel[i]) && a.q.every((v, i) => v === b.q[i]) && a.w.every((v, i) => v === b.w[i]));
}

console.log("\n8. THE FRONT DOOR");
{
    const L = RB.reportLines();
    ok("reportLines names the module and shows a real off-centre-thrust run inducing spin", L.length === 6 && /6DOF/.test(L[0]) && /freeRotation\.mjs/.test(L[1]) && /off-axis/.test(L[3]) && /induced real spin/.test(L[5]));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nrigidBody6dof-selfcheck: ${fails} FAILED` : "\nrigidBody6dof-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
