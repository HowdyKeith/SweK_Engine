// WebGLEngine/physics/xpbd/rigidCouple-selfcheck.mjs -- v4403
//
// *** FOUR SOLVERS IN THIS TREE AND UNTIL THIS ROUND NONE OF THEM TOUCHED. ***
//
// physics/xpbd/ is 77 modules and 38 gates and it collides against a PLANE (frictionalContact.js's
// floorN/floorD) and against other particles, and nothing else. physics/sph/'s boundaries are analytic box
// walls and sph.js's own third line says it "is NOT a rigid-body engine". box3d and Jolt collide their own
// bodies. couplingRegistry.js held four couplings and its only TWO-WAY one, fluidMeshSubstep, is fluid-to-mesh
// with both sides inside XPBD. physics/mechanics/reposeOps.mjs puts box3d and xpbd side by side, but as a
// DIFFERENTIAL on the critical-angle question -- a comparison, not a contact.
//
// So a soft body could not rest on a rigid one, a rigid one could not be held up by cloth, and buoyancy was
// unrepresentable. This gate is about the module that closes that, and about the two claims it has to earn.
//
// ---- THE CLAIMS, PREREGISTERED, AND THEY ARE NOT THE SAME KIND OF CLAIM ---------------------------------------
//
// tools/roundhouse/conservation.mjs reports EXACT separately from small on purpose: "a quantity that never
// changes a bit is conserved by CONSTRUCTION, and calling that conserved to 1e-16 understates it and invites
// somebody to loosen the tolerance later". This coupling has one of each and conflating them is the easy lie.
//
//   THE IMPULSE LEDGER IS EXACT. Every contact adds +s*n to the particle side and -s*n to the body side. IEEE
//   negation is exact and round-to-nearest is sign-symmetric, so sum(-x) is the exact negation of sum(x) and
//   the two sides cancel to a BIT-IDENTICAL zero for any number of contacts in any order.
//
//   TOTAL MOMENTUM IS ONLY BOUNDED. Recovering m_i * (w_i * s) needs m_i * w_i == 1, which floating point does
//   not promise, so the momentum sum lands at the rounding floor and not on zero. Claiming exactness there
//   would be claiming a property the arithmetic does not have.
//
// ---- AND THE ONE-WAY CONTROL IS THE POINT, BECAUSE "IT LOOKS RIGHT" IS NOT A MEASUREMENT --------------------
//
// fluid.js said it first: "Two-way coupling is therefore not bolted on; it is momentum. Drop the mesh half of
// the correction and the mesh is a wall the fluid slides off; drop the fluid half and the fluid tunnels straight
// through. Only both halves is a coupling." So every experiment below runs TWICE, differing in one boolean, and
// the one-way run is not a straw man -- it is what a coupling that forgot its second half actually does.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import * as RC from "./rigidCouple.js";
import { COUPLINGS, couplingById } from "./couplingRegistry.js";
import { auditConservation } from "../../tools/roundhouse/conservation.mjs";
import { noComments } from "../../tools/ship/sourceScan.mjs";
import { runInEngineOrigin } from "../../tools/ship/webgpuHarness.mjs";
import { initNode, mod } from "../box3d/box3dNode.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ....  " + m);
const GR = gateReport("physics/xpbd/rigidCouple-selfcheck.mjs");

const G = [0, -10, 0];
const HE = [0.12, 0.09, 0.11], RHO = 400;

/** The hammock: an 11x11 sheet pinned all the way round, a box lowered into it. */
function hammock() {
    const W = 11, H = 11, sp = 0.07, N = W * H;
    const { cons } = buildClothConstraints(W, H, sp);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = 3 * i;
        pos[o] = (x - (W - 1) / 2) * sp; pos[o + 1] = 0; pos[o + 2] = (y - (H - 1) / 2) * sp;
        invMass[i] = (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 0 : 1 / 0.03;
    }
    return { cloth: { pos, vel, invMass }, cons, batches: colorConstraints(cons),
             proxy: RC.makeRigidProxy({ halfExtents: HE, density: RHO, pos: [0, 0.113, 0] }) };
}
function runHammock(oneWay, { frames = 240, sub = 4, iterations = 2 } = {}) {
    const { cloth, cons, batches, proxy } = hammock();
    const dt = (1 / 60) / sub;
    let held = 0, exact = true, cum = 0; const series = [];
    for (let f = 0; f < frames; f++) {
        for (let k = 0; k < sub; k++) {
            const r = RC.rigidClothSubstep(cloth, cons, batches, proxy, { dt, iterations, gravity: G, radius: 0.02, oneWay });
            const res = Math.hypot(...RC.ledgerResidual(r.ledger));
            if (res !== 0) exact = false;
            cum += res;
            if (r.ledger.applied > 0) held++;
        }
        series.push(cum);
    }
    return { y: proxy.pos[1], speed: Math.hypot(...proxy.vel), held, total: frames * sub, exact, cum, series, proxy };
}

/** The free impact: zero gravity, a sheet fired at a free box. p is conserved, so p is the judge. */
function impact() {
    const W = 6, H = 6, sp = 0.08, N = W * H;
    const { cons } = buildClothConstraints(W, H, sp);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = 3 * i;
        // Deliberately OFF-CENTRE in y and z, because a sheet aimed at the middle of a face produces no torque
        // and would leave the whole (r x n) half of the formula untested.
        pos[o] = -0.55; pos[o + 1] = (y - (H - 1) / 2) * sp + 0.013; pos[o + 2] = (x - (W - 1) / 2) * sp - 0.021;
        vel[o] = 2.0; invMass[i] = 1 / 0.02;
    }
    return { cloth: { pos, vel, invMass }, cons, batches: colorConstraints(cons),
             proxy: RC.makeRigidProxy({ halfExtents: [0.2, 0.15, 0.12], density: 300, pos: [0, 0, 0] }) };
}
function runImpact(oneWay, { frames = 300, sub = 4, iterations = 2 } = {}) {
    const { cloth, cons, batches, proxy } = impact();
    const dt = (1 / 60) / sub;
    const px = []; let exact = true, applied = 0;
    for (let f = 0; f < frames; f++) {
        for (let k = 0; k < sub; k++) {
            const r = RC.rigidClothSubstep(cloth, cons, batches, proxy, { dt, iterations, gravity: [0, 0, 0], radius: 0.02, oneWay });
            if (Math.hypot(...RC.ledgerResidual(r.ledger)) !== 0) exact = false;
            applied += r.ledger.applied;
        }
        px.push(RC.linearMomentum(cloth, proxy)[0]);
    }
    return { px, exact, applied, proxy };
}

// =============================================================================================================
console.log("1. THE GAP, READ OUT OF THE TREE RATHER THAN ASSERTED");
{
    const fc = noComments(fs.readFileSync(path.join(HERE, "frictionalContact.js"), "utf8"));
    ok("XPBD's pre-existing contact surface really is a PLANE and pairwise particles, nothing else",
       /floorN/.test(fc) && /solvePlaneFriction/.test(fc),
       "physics/xpbd/frictionalContact.js takes (state, floorN, floorD, mu) -- a half-space and a friction " +
       "coefficient. A sheet had nothing but an infinite plane to land on");
    // *** THE POPULATION IS DERIVED, so this number cannot go stale beside the rows it counts. ***
    const others = COUPLINGS.filter((c) => c.id !== "rigid");
    const twoWayInside = others.filter((c) => c.kind === "two-way");
    ok("...and every coupling that existed before this round has BOTH SIDES inside xpbd/",
       others.length === 4 && twoWayInside.length === 1 && twoWayInside[0].id === "fluid",
       `${others.length} prior couplings, ${twoWayInside.length} of them two-way: ` +
       `${twoWayInside.map((c) => c.id).join(", ")} -- fluid-to-mesh, two particle sets`);
    const ro = noComments(fs.readFileSync(path.join(ENG, "physics/mechanics/reposeOps.mjs"), "utf8"));
    ok("...and the one file that names both solvers COMPARES them rather than coupling them",
       /gradeBoth/.test(ro) && /xpbdDeg/.test(ro),
       "reposeOps.gradeBoth(m, mu, {xpbdDeg}) grades box3d's critical angle against xpbd's. Two answers to one " +
       "question is a differential; neither solver can feel the other");
}

// =============================================================================================================
console.log("\n2. *** THE MASS PROPERTIES ARE DERIVED HERE AND CONFIRMED AGAINST box3d, WHICH EXPORTS NEITHER ***");
let box3dReady = false, m = null, Fn = null;
{
    let why = "";
    try { const st = await initNode(); box3dReady = !!(st && st.ready); m = mod(); Fn = (n) => m["_" + n]; }
    catch (e) { why = String(e && e.message || e); }
    ok("box3d loads headless, so a coupling against a real rigid engine can be measured and not just described",
       box3dReady, box3dReady ? "45 swk_* functions from the clang-built wasm" : "box3d unavailable: " + why);
}
const props = RC.boxMassProperties(HE[0], HE[1], HE[2], RHO);
if (box3dReady) {
    // *** NONE of the 45 built exports returns a mass, an inertia or an angular velocity. *** swk_velocities is
    // linear only. So the properties come from the solid-box formula -- and a formula agreeing with itself is
    // not evidence, so the body is PROBED: a known impulse, the velocity read BEFORE stepping (box3d's
    // ApplyLinearImpulseToCenter changes it immediately), and m = J/dv.
    const built = new Set(Object.keys(m).filter((k) => k.startsWith("_swk_")).map((k) => k.slice(1)));
    ok("...and it exports no accessor for any of them, which is WHY they are derived",
       !built.has("swk_body_mass") && !built.has("swk_body_inertia") && !built.has("swk_body_ang_velocity"),
       `${built.size} swk_* exports and not one of swk_body_mass / swk_body_inertia / swk_body_ang_velocity`);
    Fn("swk_world_create")(0, 0, 0);
    const b = Fn("swk_body_box")(1, 0, 0, 0, HE[0], HE[1], HE[2], RHO);
    const vp = Fn("malloc")(3 * 4);
    const J = 5.0;
    Fn("swk_body_impulse")(b, J, 0, 0);
    Fn("swk_velocities")(vp);
    const measuredMass = J / m.HEAPF32[vp / 4];
    const relM = Math.abs(measuredMass - props.mass) / props.mass;
    ok("*** the derived mass is box3d's OWN mass, to the precision of a float32 readback ***",
       relM < 3e-7,
       `measured J/dv = ${measuredMass.toFixed(8)} kg against the formula's ${props.mass} kg -- relative ` +
       `${relM.toExponential(3)}, which is about one ulp of float32 and therefore the readback's limit`);
    // The inertia the same way: an angular impulse, then the rotation ONE step produces. Damping is 0.05 by
    // engine choice (see swk_body_box), so the prediction carries the 1/(1+dt*d) factor rather than ignoring it.
    //
    // *** THE IMPULSE IS SMALL ON PURPOSE AND THE FIRST DRAFT'S WAS NOT. *** L = 2 on this box predicts 70 rad/s,
    // which is 1.17 radians -- 67 degrees -- in a single 1/60 step. Reading omega back as 2*atan2(qz,qw)/dt then
    // measured 46.96 against 70.09 and looked like a 33% error in the INERTIA. It was the small-angle
    // extraction failing, plus whatever box3d does with a spin that large in one step. L = 0.006 turns the same
    // body through 0.0035 rad and the same two numbers agree to 3e-4. A probe has to stay inside the regime the
    // readback is valid in, or it measures the probe.
    const L = 0.006, dt = 1 / 60, damp = 0.05;
    Fn("swk_body_ang_impulse")(b, 0, 0, L);
    Fn("swk_world_step")(dt, 4);
    const tp = Fn("malloc")(7 * 4);
    Fn("swk_transforms")(tp);
    const qz = m.HEAPF32[tp / 4 + 5], qw = m.HEAPF32[tp / 4 + 6];
    const omega = 2 * Math.atan2(qz, qw) / dt;
    const pred = (L / props.inertia[2]) / (1 + dt * damp);
    const relI = Math.abs(omega - pred) / pred;
    ok("...and the derived inertia is box3d's too, read off the rotation one angular impulse produces",
       relI < 1e-3,
       `omega from the quaternion delta ${omega.toFixed(8)} rad/s against I^-1 L / (1+dt*damp) = ` +
       `${pred.toFixed(8)} -- relative ${relI.toExponential(3)}, turning through ${(pred * dt).toFixed(5)} rad ` +
       `in the step. The residual is the one-step integrator, NOT the formula: a wrong inertia is out by a ` +
       `factor and this is out by 0.03%`);
    GR.table("box3d's own mass properties against the solid-box formula",
             ["quantity", "measured from box3d", "derived formula", "relative difference"],
             [["mass (kg)", measuredMass, props.mass, relM],
              ["omega after L=2 about z (rad/s)", omega, pred, relI]],
             "neither is readable through the 45 built exports, so both are derived and then probed");
    Fn("swk_world_destroy")();
} else {
    say("box3d did not load, so sections 2 and 7 are UNMEASURED here rather than passed. The derivation is " +
        "still exercised by every other section; what is missing is the confirmation against the engine.");
    GR.skip("box3d's own mass and inertia", "box3d did not load in this process");
}

// =============================================================================================================
console.log("\n3. *** THE ONE FORMULA:  w = 1/m + (r x n)^T I^-1 (r x n)  ***");
{
    const pr = RC.makeRigidProxy({ halfExtents: [0.2, 0.15, 0.12], density: 300, pos: [0, 0, 0] });
    const n = [0, 1, 0];
    const wCentre = RC.generalizedInvMass(pr, [0, 0.15, 0], n);
    const wCorner = RC.generalizedInvMass(pr, [0.2, 0.15, 0.12], n);
    const ratio = wCorner / pr.invMass;
    ok("at the CENTRE of a face the angular term is exactly zero, so w is exactly 1/m",
       wCentre === pr.invMass,
       `r x n = 0 there, so the dot product is a bit-identical zero and w = ${wCentre.toExponential(6)} = 1/m. ` +
       "NOT 'close to' -- the cross product of parallel vectors is exact");
    ok("*** at a CORNER the same contact costs 4.09x less to satisfy, which is the whole content of the term ***",
       ratio > 4 && ratio < 4.2,
       `w = ${wCorner.toExponential(6)} against 1/m = ${pr.invMass.toExponential(6)}, a factor of ` +
       `${ratio.toFixed(4)}. A shove at a corner is cheap because the body can ROTATE away instead of ` +
       "translating. Drop the term and every contact acts as if it were on the axis");
    const stat = RC.makeRigidProxy({ halfExtents: [1, 1, 1] });
    ok("...and a static proxy returns exactly 0, which is how the one-way case falls out of the same code",
       RC.generalizedInvMass(stat, [1, 1, 1], n) === 0 && stat.invMass === 0,
       "mass 0 -> invMass 0 and invInertia 0, so an infinitely heavy body takes none of the correction. " +
       "There is no second code path for 'this body is a wall'");
    GR.table("generalized inverse mass on a 0.4 x 0.3 x 0.24 box at density 300",
             ["contact point", "w", "w / (1/m)"],
             [["top face centre", wCentre, wCentre / pr.invMass],
              ["top corner", wCorner, ratio]],
             `the box masses ${pr.mass} kg, so 1/m is ${pr.invMass.toExponential(6)}`);
}

// =============================================================================================================
console.log("\n4. DETERMINISM: THE CONTACT SET IS A PURE FUNCTION OF THE POSITIONS, NOT OF THE WALK");
{
    const { cloth, proxy } = hammock();
    const N = cloth.invMass.length;
    const fwd = RC.rigidContacts({ pos: cloth.pos, invMass: cloth.invMass }, proxy, 0.5);
    const rev = RC.rigidContacts({ pos: cloth.pos, invMass: cloth.invMass }, proxy, 0.5,
                                 Array.from({ length: N }, (_, i) => N - 1 - i));
    // A deterministic scramble, so a re-run of this gate scrambles the same way. Nothing here uses Math.random.
    const scr = Array.from({ length: N }, (_, i) => i).sort((a, b) => ((a * 2654435761) % 1013904223) - ((b * 2654435761) % 1013904223));
    const shuf = RC.rigidContacts({ pos: cloth.pos, invMass: cloth.invMass }, proxy, 0.5, scr);
    const key = (cs) => cs.map((c) => c.i + ":" + c.axis + ":" + c.sign).join("|");
    ok("*** three different visit orders produce one identical contact list ***",
       fwd.length > 0 && key(fwd) === key(rev) && key(fwd) === key(shuf),
       `${fwd.length} contacts, identical forwards, backwards and scrambled. v2661's rule as selfCollide.js ` +
       "states it: discover, then SORT, because pair order feeds graph coloring and two orderings of one pair " +
       "set can produce two different solves");
    // *** AND A CHECK THIS GATE DID NOT HAVE UNTIL A SABOTAGE SAID SO. *** Re-choosing the face every
    // iteration -- the first draft's bug, the one boxFace's header is about -- read ZERO RED against every
    // scene below, because in all of them the body is caught before it ever descends past a particle's
    // midplane. A check must not need its own finding to stay hidden, so the property is tested DIRECTLY on
    // the configuration where the two rules disagree: a particle already deep inside the box, past the
    // halfway point, with the contact recorded against the TOP face. Held, it is pushed back up and out the
    // way it came. Re-chosen, the bottom is nearer and it is pushed DOWN, through the body.
    const deep = RC.makeRigidProxy({ halfExtents: [0.5, 0.1, 0.5], density: 100, pos: [0, 0, 0] });
    const pred = new Float64Array([0, -0.06, 0]);          // 0.06 below centre: nearer the bottom face
    const inv = new Float64Array([1]);
    const topFace = RC.boxFace(deep, [0, 0.4, 0]);         // discovered from ABOVE, where the sheet was
    const nearer = RC.boxFace(deep, [0, -0.06, 0]);        // what re-choosing would pick now
    const before = pred[1];
    RC.solveRigidContacts(pred, inv, deep, [{ i: 0, axis: topFace.axis, sign: topFace.sign, sd: 0 }],
                          { radius: 0.02, oneWay: true });
    ok("*** the contact keeps the face it was DISCOVERED with, even once the far side is nearer ***",
       topFace.sign === 1 && nearer.sign === -1 && pred[1] > before && pred[1] > 0.1,
       `discovered against the +${"xyz"[topFace.axis]} face; from inside, the -${"xyz"[nearer.axis]} face is ` +
       `now nearer. The particle went ${before.toFixed(3)} -> ${pred[1].toFixed(3)}, out through the face it ` +
       "came in by. Re-choosing sends it out the BOTTOM, which is a body passing through a sheet and reads as " +
       "tunnelling rather than as a normal being recomputed");
    const a = runHammock(false, { frames: 30 }), b = runHammock(false, { frames: 30 });
    ok("...and the whole coupled run is bit-reproducible in this process",
       a.y === b.y && a.cum === b.cum && a.held === b.held,
       `two runs agree on the body's y to the bit (${a.y}). Pure +,-,*,/ and sqrt with min/max, no library trig`);
}

// =============================================================================================================
console.log("\n5. *** WHAT IS EXACT AND WHAT IS ONLY SMALL -- THE FREE IMPACT, WHERE MOMENTUM IS CONSERVED ***");
let two = null, one = null;
{
    two = runImpact(false); one = runImpact(true);
    const aTwo = auditConservation(two.px), aOne = auditConservation(one.px);
    console.log(`        two-way   p_x ${two.px[0].toFixed(9)} -> ${two.px[two.px.length - 1].toFixed(9)}   relative drift ${aTwo.relDrift.toExponential(3)}`);
    console.log(`        one-way   p_x ${one.px[0].toFixed(9)} -> ${one.px[one.px.length - 1].toFixed(9)}   relative drift ${aOne.relDrift.toExponential(3)}`);
    ok("*** the impulse ledger is a BIT-IDENTICAL zero, every substep, and that is by construction ***",
       two.exact === true,
       "sum(+s*n) and sum(-s*n) are exact negations of each other because IEEE negation is exact and " +
       "round-to-nearest is sign-symmetric. This is not a tolerance and there is no tolerance to loosen");
    ok("...and dropping the body's half breaks it, so the check is not vacuous",
       one.exact === false && one.applied > 0,
       `the one-way run applied ${one.applied} projections and its ledger residual is non-zero`);
    ok("*** total momentum is BOUNDED at the rounding floor -- reported as small, NOT as exact ***",
       aTwo.relDrift < 1e-11 && aTwo.relDrift > 0,
       `relative drift ${aTwo.relDrift.toExponential(3)} over 300 frames. m_i * (w_i * s) needs m_i * w_i to ` +
       "be exactly 1, which floating point does not promise -- so this row is small and the ledger row is exact");
    ok("*** and the one-way control does not merely leak momentum, it REVERSES it ***",
       aOne.relDrift > 1,
       `p_x goes ${one.px[0].toFixed(3)} -> ${one.px[one.px.length - 1].toFixed(3)}, a relative error of ` +
       `${aOne.relDrift.toFixed(3)} -- ${(aOne.relDrift / aTwo.relDrift).toExponential(3)}x the two-way run's`);
    ok("...and the two-way body actually MOVES AND SPINS, where the one-way body never feels a thing",
       Math.hypot(...two.proxy.vel) > 0.1 && Math.hypot(...two.proxy.angVel) > 0.01 &&
       Math.hypot(...one.proxy.vel) === 0 && Math.hypot(...one.proxy.angVel) === 0,
       `two-way |v| ${Math.hypot(...two.proxy.vel).toFixed(5)} |w| ${Math.hypot(...two.proxy.angVel).toFixed(5)}; ` +
       "one-way both exactly 0. The spin is the off-centre aim doing its job");
    say("A ONE-SHOT IMPACT IS THE WRONG SHAPE FOR auditConservation's GROWTH RATIO AND THIS IS WHERE THAT " +
        "SHOWED. Its verdict compares the worst excursion in each half of the run, so a leak that happens " +
        "during contact and then plateaus reads BOUNDED, and a two-way run sitting at 1e-14 reads SECULAR " +
        "because a ratio of two rounding errors is noise. Both verdicts are honest about what they measure and " +
        "neither is the finding here -- the DRIFT is, which is why the numbers above are relative drift and " +
        "not verdicts. The growth ratio earns its keep in section 6, where contact is permanent.");
    GR.table("free impact, zero gravity: a 0.72 kg sheet at 2 m/s into a free 4.32 kg box, 300 frames",
             ["run", "p_x at start", "p_x at end", "relative drift", "ledger bit-exact zero"],
             [["two-way", two.px[0], two.px[two.px.length - 1], auditConservation(two.px).relDrift, "true"],
              ["one-way", one.px[0], one.px[one.px.length - 1], auditConservation(one.px).relDrift, "false"]],
             "p_x is conserved in this scene because there is no gravity, so it is the judge");
}

// =============================================================================================================
console.log("\n6. *** THE HAMMOCK: DOES A SHEET HOLD A RIGID BODY UP -- WHICH IS A NUMBER, NOT A PICTURE ***");
{
    const hTwo = runHammock(false), hOne = runHammock(true);
    const freeFall = 0.113 - 0.5 * 10 * 16;      // 240 frames at 1/60 is 4 s
    console.log(`        two-way   box y after 4 s ${hTwo.y.toFixed(4).padStart(10)}   |v| ${hTwo.speed.toFixed(4).padStart(8)}   substeps holding ${hTwo.held}/${hTwo.total}`);
    console.log(`        one-way   box y after 4 s ${hOne.y.toFixed(4).padStart(10)}   |v| ${hOne.speed.toFixed(4).padStart(8)}   substeps holding ${hOne.held}/${hOne.total}`);
    console.log(`        free fall from 0.113 for 4 s would reach ${freeFall.toFixed(2)}`);
    ok("*** the sheet CATCHES the box: it is still at its starting height after four seconds ***",
       hTwo.y > -0.05 && hTwo.speed < 0.2,
       `y = ${hTwo.y.toFixed(4)} against a free fall of ${freeFall.toFixed(2)} -- held ${(freeFall / hTwo.y).toExponential(2)} ` +
       `times its own free-fall displacement, at |v| ${hTwo.speed.toFixed(4)}`);
    ok("...and it holds PERMANENTLY, not for the handful of substeps an impact lasts",
       hTwo.held / hTwo.total > 0.9,
       `${hTwo.held} of ${hTwo.total} substeps have an active projection -- which is what gives the growth ` +
       "ratio in the next check something to grow in");
    ok("*** and the one-way run falls straight through, at free fall ***",
       hOne.y < freeFall + 1 && hOne.speed > 30,
       `y = ${hOne.y.toFixed(4)}, |v| ${hOne.speed.toFixed(2)} m/s, holding only ${hOne.held}/${hOne.total}. ` +
       "A sheet that takes all of every correction is a sheet that gets pushed out of the way");
    const aOne = auditConservation(hOne.series);
    ok("...and with contact permanent the ledger reads EXACT against a one-way run that accumulates",
       auditConservation(hTwo.series).verdict === "exact" && hOne.cum > 0,
       `two-way: ${auditConservation(hTwo.series).verdict} (every sample bit-identical to the first, which is ` +
       `zero); one-way: ${aOne.verdict}, ${hOne.cum.toExponential(3)} accumulated`);
    // *** SUBSTEPS, NOT ITERATIONS -- Macklin 2019, and it is measured here rather than cited. ***
    const cheap = runHammock(false, { frames: 240, sub: 1, iterations: 6 });
    const fine = runHammock(false, { frames: 240, sub: 4, iterations: 2 });
    ok("*** one substep of six iterations loses the box; four substeps of two hold it, at fewer projections ***",
       cheap.y < -10 && fine.y > -0.05,
       `1x6 -> y ${cheap.y.toFixed(2)} (through the sheet); 4x2 -> y ${fine.y.toFixed(4)} (held). Small Steps ` +
       "in Physics Simulation reproduced in the one place it decides whether the scene works at all");
    GR.table("the hammock: a 3.8 kg box lowered into an 11x11 sheet pinned all round, 240 frames",
             ["run", "box y after 4 s", "body speed", "substeps holding", "substeps total"],
             [["two-way, 4 substeps x 2 iterations", hTwo.y, hTwo.speed, hTwo.held, hTwo.total],
              ["one-way, 4 substeps x 2 iterations", hOne.y, hOne.speed, hOne.held, hOne.total],
              ["two-way, 1 substep x 6 iterations", cheap.y, cheap.speed, cheap.held, cheap.total]],
             `a free fall from 0.113 m for 4 s reaches ${freeFall.toFixed(2)} m`);
}

// =============================================================================================================
console.log("\n7. *** box3d OWNS THE BODY: THE POSE COMES FROM swk_transforms AND THE REACTION GOES BACK IN ***");
if (box3dReady) {
    const readPose = (tp) => { Fn("swk_transforms")(tp); const h = m.HEAPF32, o = tp / 4;
        return { pos: [h[o], h[o + 1], h[o + 2]], quat: [h[o + 3], h[o + 4], h[o + 5], h[o + 6]] }; };
    const run = (oneWay, frames = 180, sub = 4) => {
        Fn("swk_world_create")(0, -10, 0);
        const body = Fn("swk_body_box")(1, 0, 0.113, 0, HE[0], HE[1], HE[2], RHO);
        const tp = Fn("malloc")(7 * 4), vp = Fn("malloc")(3 * 4);
        const { cloth, cons, batches } = hammock();
        const proxy = RC.makeRigidProxy({ halfExtents: HE, density: RHO, pos: [0, 0.113, 0] });
        const dt = (1 / 60) / sub;
        let held = 0;
        for (let f = 0; f < frames; f++) for (let k = 0; k < sub; k++) {
            const pose = readPose(tp);
            Fn("swk_velocities")(vp);
            proxy.pos = pose.pos; proxy.quat = pose.quat;
            proxy.vel = [m.HEAPF32[vp / 4], m.HEAPF32[vp / 4 + 1], m.HEAPF32[vp / 4 + 2]];
            const r = RC.rigidClothSubstep(cloth, cons, batches, proxy,
                { dt, iterations: 2, gravity: G, radius: 0.02, oneWay, bodyDrivenExternally: true });
            if (r.ledger.applied > 0) held++;
            const rx = RC.rigidReaction(r.ledger, dt);
            Fn("swk_body_impulse")(body, rx.linear[0], rx.linear[1], rx.linear[2]);
            Fn("swk_body_ang_impulse")(body, rx.angular[0], rx.angular[1], rx.angular[2]);
            Fn("swk_world_step")(dt, 4);
        }
        const pose = readPose(tp);
        Fn("swk_velocities")(vp);
        const speed = Math.hypot(m.HEAPF32[vp / 4], m.HEAPF32[vp / 4 + 1], m.HEAPF32[vp / 4 + 2]);
        Fn("swk_world_destroy")();
        return { y: pose.pos[1], speed, held, total: frames * sub };
    };
    const t = run(false), o = run(true);
    const ff3 = 0.113 - 0.5 * 10 * 9;
    console.log(`        two-way   box3d body y after 3 s ${t.y.toFixed(4).padStart(10)}   |v| ${t.speed.toFixed(4).padStart(8)}   substeps holding ${t.held}/${t.total}`);
    console.log(`        one-way   box3d body y after 3 s ${o.y.toFixed(4).padStart(10)}   |v| ${o.speed.toFixed(4).padStart(8)}   substeps holding ${o.held}/${o.total}`);
    ok("*** an XPBD sheet holds up a body box3d is integrating, through swk_body_impulse alone ***",
       t.y > -0.05 && t.speed < 1,
       `y = ${t.y.toFixed(4)} after 3 s where free fall reaches about ${ff3.toFixed(2)}. The module never ` +
       "imports box3d and box3d never hears of XPBD: the only thing crossing is a pose out and an impulse in");
    ok("...and the same loop one-way drops it, so the seam is carrying the physics and not the scene setup",
       o.y < ff3 + 3 && o.speed > 20,
       `y = ${o.y.toFixed(4)}, |v| ${o.speed.toFixed(2)}. Identical rig, identical engine, one boolean`);
    const src = noComments(fs.readFileSync(path.join(HERE, "rigidCouple.js"), "utf8"));
    ok("...and rigidCouple.js imports NO physics engine, which is what makes it reachable from a page",
       !/box3d|jolt|Jolt|node:/.test(src) && /from\s*["']\.\/xpbd\.js["']/.test(src),
       "the proxy is a plain object the caller fills. reposeOps.mjs made the same choice for the same reason: " +
       "a file with no engine import can be gated from anywhere and cannot smuggle node:fs into a browser page");
    GR.table("box3d integrating the body, XPBD projecting the sheet, 180 frames x 4 substeps",
             ["run", "box3d body y after 3 s", "body speed", "substeps holding", "substeps total"],
             [["two-way", t.y, t.speed, t.held, t.total], ["one-way", o.y, o.speed, o.held, o.total]],
             `a box3d body in free fall from 0.113 m for 3 s reaches about ${ff3.toFixed(2)} m`);
} else {
    say("box3d did not load, so the closed loop through the real engine is UNMEASURED in this run.");
}

// =============================================================================================================
console.log("\n8. THE REGISTRY IS STILL THE UI'S ONLY SOURCE OF TRUTH");
{
    const c = couplingById("rigid");
    ok("the coupling is registered, two-way, and its own driver kind",
       !!c && c.kind === "two-way" && c.driver === "rigid" && c.fieldName === null,
       `id "${c.id}", driver "${c.driver}", kind "${c.kind}". "body" would have been a lie: that driver means ` +
       "two particle systems, and the second system here has an orientation and a lever arm");
    // *** READ RAW, NOT THROUGH noComments, AND THAT IS A FINDING ABOUT THE STRIPPER. *** sourceScan.noComments
    // is a JavaScript stripper; handed couple.html it returns 428 bytes out of 18,692 -- 97.7% of the file
    // gone, the module body with it, so every regex against it answers false. A check written that way would
    // have gone red on a page that was perfectly correct. The behavioural probe below is what actually settles
    // whether the page works; this one only asks that the delegating call is present and the math is not.
    const pageRaw = fs.readFileSync(path.join(ENG, "couple.html"), "utf8");
    const delegates = /coupling\.substep\(state, cons, batches, proxy, sub\)/.test(pageRaw);
    const noMath = !/dLambda|aTilde|generalizedInvMass|invInertia/.test(pageRaw);
    ok("...and couple.html DRIVES it from the registry rather than reimplementing it",
       delegates && /driver === "rigid"/.test(pageRaw) && noMath,
       "the page calls coupling.substep with the rigid signature and holds no multiplier update, no compliance " +
       "term and no inverse-mass math of its own -- the same property registry-selfcheck asserts of the registry");
    // The harness does new Function("return (" + src + ")"), so the script must BE a function expression --
    // a bare statement list is a SyntaxError the result reports as ok:false with every field undefined.
    const probe = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 90000, script: `
      async () => {
        const f = document.createElement("iframe");
        f.style.width = "1100px"; f.style.height = "760px";
        f.src = "/couple.html";
        document.body.appendChild(f);
        await new Promise((r) => { f.onload = r; setTimeout(r, 15000); });
        const w = f.contentWindow, d = f.contentDocument;
        const sel = d.getElementById("couplingSel");
        const ids = [...sel.options].map((o) => o.value);
        sel.value = "rigid"; sel.dispatchEvent(new w.Event("change"));
        await new Promise((r) => setTimeout(r, 200));
        const before = d.getElementById("status").textContent;
        const btn = d.getElementById("stepBtn");
        for (let i = 0; i < 120; i++) btn.click();
        await new Promise((r) => setTimeout(r, 200));
        const after = d.getElementById("status").textContent;
        // ink: is anything actually drawn on the canvas?
        const cv = d.getElementById("stage");
        const g = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let ink = 0; for (let i = 3; i < g.length; i += 4) if (g[i] > 8) ink++;
        return { ids, before, after, ink, tag: d.getElementById("driverTag").textContent };
      }
    ` });
    if (probe.skipped) {
        say("the page probe was SKIPPED: " + probe.reason);
        GR.skip("couple.html driving the rigid coupling", "the browser harness was unavailable: " + probe.reason);
    } else {
        const r = probe.result || {};
        ok("*** the page offers the rigid coupling, steps it, and draws something ***",
           probe.ok && Array.isArray(r.ids) && r.ids.includes("rigid") && r.ink > 500 &&
           /body y/.test(String(r.after)) && r.before !== r.after && probe.pageErrors.length === 0,
           `picker ${JSON.stringify(r.ids)}; driver tag "${r.tag}"; ${r.ink} inked pixels; status moved from ` +
           `"${String(r.before).slice(-40)}" to "${String(r.after).slice(-40)}"; ` +
           (probe.pageErrors.length ? "PAGE ERRORS: " + probe.pageErrors.join(" | ") : "no page errors") +
           (probe.ok ? "" : "; HARNESS: " + String(probe.reason).slice(0, 220)));
    }
}

// ---- v4403 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// The subject files, before and after all six -- md5-identical:
//    physics/xpbd/rigidCouple.js   d7dc2efb24419901f360634a23381ab7
//    couple.html                   8494fbfea738db3c318804ff35b53fb1
//
//   A  generalizedInvMass returns 1/m, the (r x n)^T I^-1 (r x n) term deleted
//      -> 1 RED: the corner check. ONE, and that is worth saying: the hammock still catches the box without
//      the angular term, because a sheet landing flat on a face has little lever arm to exploit. The term is
//      earned by its own check and NOT by the scene, which is the honest reading rather than the flattering one.
//   B  the body's half of the ledger given the wrong SIGN (+= instead of -=)
//      -> 3 RED: the bit-exact ledger, the hammock's permanent-contact ledger, and the closed loop through
//      box3d -- because the reaction handed to swk_body_impulse then pushes the body the way the cloth went.
//   C  the face RE-CHOSEN every iteration instead of held from discovery -- the first draft's actual bug
//      -> 0 RED ON THE FIRST ATTEMPT, and that is what section 4's face check is doing in this file. Every
//      scene here catches the body before it descends past a particle's midplane, so the nearest face never
//      flips and the bug hides. A CHECK MUST NOT NEED ITS OWN FINDING TO STAY HIDDEN (v4398's lesson, applied
//      again). The property is now tested directly on the configuration where the two rules disagree, and the
//      same sabotage reads 1 RED by name.
//   D  the contact list returned in walk order, the sort removed
//      -> 1 RED: three visit orders no longer agree.
//   E  the inertia formula m/3 -> m/4 on all three axes
//      -> 2 RED: the probe against box3d's own rotation, and the corner ratio. AIMED WRONG THE FIRST TIME --
//      only the x component was changed, and the probe reads the z one, so it read 1 RED for a reason that had
//      nothing to do with the check being weak.
//   F  couple.html calls coupling.substep with the "field" signature instead of the proxy
//      -> 2 RED: the source check and the behavioural page probe. The page draws nothing and the status line
//      stops moving, so the probe fails on behaviour rather than on a regex.
//
// =============================================================================================================
GR.skip("friction and restitution at the coupled contact",
        "the constraint here is frictionless and perfectly inelastic in the normal direction. " +
        "frictionalContact.js has Coulomb friction against a plane and fluid.js has it across two particle " +
        "sets; neither is wired to this face constraint yet");
GR.skip("any shape but a box, and any body but one",
        "swk_body_sphere exists in the shim and NOT in the built wasm (box3dNode's PENDING_REBUILD), and the " +
        "proxy carries a single set of half-extents");
GR.note("Every number in these tables is read from the same objects the checks above assert on -- the mass " +
        "from the probed body, the envelope from the runs themselves.");
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ` +
                `${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: FRICTION AND RESTITUTION. The coupled contact is frictionless and perfectly " +
    "inelastic along the normal, so a box set down on a tilted sheet slides where a real one would grip, and " +
    "nothing bounces. Also unchecked: TUNNELLING. Contacts are found once per substep against the predicted " +
    "positions, so a body crossing more than the contact radius in one substep passes through -- measured " +
    "while building this: a box dropped from 0.35 m reached the sheet at 2.3 m/s, 0.038 m per substep against " +
    "a 0.02 m radius, and went through. box3d's own CCD cannot help, because the contact test is on THIS side " +
    "of the seam. The scenes below start the body in contact for that reason, and it is a limit rather than a " +
    "tuning. And EDGES AND CORNERS are approximated by their dominant face, which is what makes a box the only " +
    "shape here; swk_body_sphere is in the shim and not in the built wasm.");
process.exit(fails ? 1 : 0);
