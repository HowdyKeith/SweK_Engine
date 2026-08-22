// WebGLEngine/physics/xpbd/collisionKnobs.mjs -- v3603
// ---------------------------------------------------------------------------------------------------------------
// THE COLLISION PASS HAD TWO CONSTANTS AND NEITHER WAS REACHABLE, SO TWO PROPOSED FIXES COULD NOT EVEN BE ASKED.
//
// v3602 measured the shipped cloth solver's momentum row and found the collision pass is where it is poor
// (2.661e-2 at radius 0.4 against 8.924e-11 with collision off). Two cures were proposed: MORE COLLISION
// ITERATIONS, and COMPLIANT rather than rigid contacts. Neither was a knob -- clothFrame HARDCODED
// `compliance: 0` and ran exactly one sweep with no loop around it, so a sweep over either would have read
// EXACTLY ZERO MOVEMENT and been registered VACUOUS WITH THE WRONG REASON ATTACHED. That is v3541's finding
// arriving in a second solver: INVARIANT BECAUSE UNREAD is not invariant because the physics forbids it.
//
// This round makes them parameters and CHANGES NOTHING THAT SHIPS. The defaults are 1 sweep and compliance 0,
// and the proof is not a reading of the source: the default path is held to a STATE HASH captured from the
// pristine v3602 extract before the edit -- 40 collision-active frames, positions and velocities, sha256.
//
// ================================================================================================================
// AND WITH THE KNOBS REACHABLE, BOTH PROPOSALS ARE MEASURED RATHER THAN ARGUED -- ONE IS REFUTED ON ITS OWN PRO
// ================================================================================================================
//
// MORE ITERATIONS was proposed as "drastically reduces the collision number ... and MAINTAINS MOMENTUM
// CONSERVATION". IT DOES THE OPPOSITE OF THE SECOND HALF. Measured across 1/2/5/10/50/200 sweeps: worst
// penetration falls 2.037e-1 -> 1.603e-2 -> 1.865e-14 -> 3.331e-16, which is everything anybody wants from a
// contact -- WHILE THE MOMENTUM ROW RISES 2.661e-2 -> 8.609e-2 -> 1.037e-1 AND PLATEAUS. *** THE TWO GOALS
// TRADE ON THIS KNOB AND THE TRADE IS MONOTONE: CRISPER CONTACTS COST MOMENTUM-ROW FIDELITY. *** It is the
// same shape v3602 found on the mesh solve, on a different lever, which is why the pro was worth checking
// rather than accepting.
//
// COMPLIANCE moves it the other way: the momentum row falls 2.661e-2 -> 4.078e-3 at compliance 1e-3, 6.5x.
// *** AND ONE READING IS REPORTED WITHOUT AN EXPLANATION, BECAUSE I HAVE ONE FIXTURE: the worst penetration
// ALSO improved (2.037e-1 -> 1.489e-1), which a softer constraint should not do. The likely account is that
// the rigid single sweep OVERSHOOTS -- a correction for one pair pushing a particle into another -- but that
// is a story until somebody measures it, and it is recorded as an anomaly rather than as a finding. ***
//
// WHAT THIS ROUND DOES NOT DO, DELIBERATELY: it does not change a default, and it does not recommend either
// cure. NOTHING IN THE TREE READS THE MOMENTUM ROW, so moving a shipped default to improve it would be
// optimising for the instrument -- and the half that decides is MULTI-FRAME and VISUAL (does a compliant
// contact still hold, or does the cloth sag through itself), which one substep cannot answer and this sandbox
// cannot see. THE KNOBS ARE NOW ASKABLE. WHICH SETTING SHIPS IS KEITH'S AND IT NEEDS HIS RIG.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { colorConstraints } from "./xpbd.js";
import { clothFrame, predictPass, solveColorPass } from "./clothLoop.js";
import { findCollisionPairs } from "./selfCollide.js";
import { momentumResidual } from "./scheduleKey.mjs";
import { scene, DT, GRAVITY } from "./kktResidual.mjs";

export const DEFAULT_COLLISION_ITERATIONS = 1;      // what clothFrame shipped before v3603
export const DEFAULT_COLLISION_COMPLIANCE = 0;      // rigid
export const REFERENCE_RADIUS = 0.4;

// *** THE DEFAULTS ARE PROVEN BY A HASH CAPTURED FROM THE PRISTINE v3602 EXTRACT BEFORE THE EDIT, NOT BY
// READING THE SOURCE. A source check would pass on a parameter that was exposed and then quietly re-defaulted. ***
export const V3602_STATE = { frames: 40, radius: 0.4, iterations: 5, dt: DT,
                             posHash: "b80d901b389392c8", velHash: "3b55c8b3ccc0c4fb" };

/** Run the SHIPPED entry point for N frames and hash the state. Nothing here reimplements the loop. */
export function shippedRun({ frames = 40, radius = REFERENCE_RADIUS, iterations = 5,
                             collisionIterations, collisionCompliance, dt = DT } = {}) {
    const sc = scene(), n = sc.init.pos.length;
    const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel),
                  pred: new Float64Array(n), prev: new Float64Array(n) };
    const opts = { dt, iterations, gravity: GRAVITY, radius, adj: sc.adj };
    if (collisionIterations !== undefined) opts.collisionIterations = collisionIterations;
    if (collisionCompliance !== undefined) opts.collisionCompliance = collisionCompliance;
    for (let f = 0; f < frames; f++) clothFrame(buf, sc.init.invMass, sc.cons, sc.colors, opts);
    const h = (a) => createHash("sha256").update(Buffer.from(a.buffer)).digest("hex").slice(0, 16);
    return { pos: buf.pos, vel: buf.vel, posHash: h(buf.pos), velHash: h(buf.vel) };
}

/** One substep with both knobs exposed: the momentum row AND whether the contact was actually resolved. */
export function substepTrade({ collisionIterations = 1, collisionCompliance = 0,
                               radius = REFERENCE_RADIUS, iterations = 5, dt = DT } = {}) {
    const sc = scene(), im = sc.init.invMass, n = sc.init.pos.length;
    const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel),
                  pred: new Float64Array(n), prev: new Float64Array(n) };
    predictPass(buf, im, dt, GRAVITY);
    const xPred = Float64Array.from(buf.pred);
    const lam = new Float64Array(sc.cons.length);
    for (let it = 0; it < iterations; it++) for (const c of sc.colors) solveColorPass(buf.pred, im, sc.cons, c, lam, dt, false);
    const pairs = findCollisionPairs(buf.pred, im.length, 2 * radius, 2 * radius, sc.adj);
    const coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collisionCompliance }));
    const lamC = new Float64Array(coll.length);
    for (let it = 0; it < collisionIterations; it++)
        for (const c of colorConstraints(coll)) solveColorPass(buf.pred, im, coll, c, lamC, dt, true);
    let penetration = 0;
    for (const c of coll) {
        const ax = 3 * c.i, bx = 3 * c.j;
        const d = Math.hypot(buf.pred[ax] - buf.pred[bx], buf.pred[ax + 1] - buf.pred[bx + 1], buf.pred[ax + 2] - buf.pred[bx + 2]);
        penetration = Math.max(penetration, Math.max(0, 2 * radius - d));
    }
    return { momentum: momentumResidual(buf.pred, xPred, im, [...sc.cons, ...coll],
                                        Float64Array.from([...lam, ...lamC])),
             penetration, pairs: coll.length };
}

/** knobMoves' question, asked of each new parameter: does it move the observable AT ALL? */
export function isLive(knob) {
    const base = substepTrade();
    const moved = knob === "collisionIterations" ? substepTrade({ collisionIterations: 50 })
                                                 : substepTrade({ collisionCompliance: 1e-3 });
    const rel = Math.abs(moved.momentum - base.momentum) / Math.abs(base.momentum);
    return { knob, base: base.momentum, moved: moved.momentum, rel, live: rel > 1e-9 };
}

export const iterationTrade = (its = [1, 2, 5, 10, 50, 200]) =>
    its.map((k) => ({ k, ...substepTrade({ collisionIterations: k }) }));
export const complianceTrade = (cs = [0, 1e-9, 1e-7, 1e-5, 1e-3]) =>
    cs.map((k) => ({ k, ...substepTrade({ collisionCompliance: k }) }));

export const MEASURED_V3603 = {
    supersededByV3604:
        "*** SUPERSEDED AT v3604: every number here was taken at radius 0.4, which the alternating-projection bisection puts ABOVE the feasibility ceiling h*sqrt(5)/2 = 0.335410 -- an unsatisfiable contact set. The honest radius is r <= h/2 = 0.150000, and the 5x5 hanging fixture finds ZERO PAIRS there. See physics/xpbd/clothSoak.mjs. NOT DELETED: the question was asked and settled, and the reading is correct FOR THE CONFIGURATION IT WAS TAKEN AT. ***",
    wasUnreachable: "clothFrame hardcoded compliance 0 and ran ONE collision sweep with no loop, so both " +
                    "proposed cures would have swept to EXACTLY ZERO MOVEMENT and registered vacuous with the " +
                    "wrong reason -- v3541's INVARIANT BECAUSE UNREAD, in a second solver.",
    iterationTrade: { 1: 2.661e-2, 5: 8.609e-2, 10: 1.029e-1, 50: 1.037e-1, 200: 1.037e-1 },
    penetrationTrade: { 1: 2.037e-1, 5: 1.603e-2, 10: 8.051e-4, 50: 1.865e-14, 200: 3.331e-16 },
    refutedPro: "MORE ITERATIONS was proposed as maintaining momentum conservation. IT DOES THE OPPOSITE: the " +
                "momentum row RISES 2.661e-2 -> 1.037e-1 and plateaus while penetration goes to machine zero. " +
                "THE TWO GOALS TRADE, MONOTONELY, ON ONE KNOB.",
    complianceAt1e3: { momentum: 4.078e-3, penetration: 1.489e-1 },
    anomaly: "Compliance ALSO improved the worst penetration (2.037e-1 -> 1.489e-1), which a softer constraint " +
             "should not do. The likely account is that the rigid single sweep OVERSHOOTS, but that is a story " +
             "on one fixture and is recorded as an ANOMALY rather than as a finding.",
    notClaimed: "NO DEFAULT IS CHANGED and neither cure is recommended. Nothing in the tree reads the momentum " +
                "row, so moving a shipped default to improve it would be optimising for the instrument, and " +
                "the deciding half is multi-frame and VISUAL -- Keith's rig. The knobs are now ASKABLE.",
};

export function reportLines() {
    const L = [];
    L.push("[collisionKnobs] The collision pass's two constants, now reachable");
    L.push("");
    const d = shippedRun();
    L.push("1. THE DEFAULT PATH IS BIT-IDENTICAL TO PRISTINE v3602 (40 collision-active frames, hashed)");
    L.push("     pos " + d.posHash + (d.posHash === V3602_STATE.posHash ? "  MATCHES" : "  !! MOVED"));
    L.push("     vel " + d.velHash + (d.velHash === V3602_STATE.velHash ? "  MATCHES" : "  !! MOVED"));
    L.push("");
    L.push("2. BOTH KNOBS ARE LIVE (they were unreachable, so a sweep would have read exactly zero)");
    for (const k of ["collisionIterations", "collisionCompliance"]) {
        const r = isLive(k);
        L.push("     " + k.padEnd(22) + (r.live ? "LIVE" : "VACUOUS") + "  relative movement " + r.rel.toExponential(3));
    }
    L.push("");
    L.push("3. THE TRADE, MEASURED -- more sweeps buy contacts AND COST the momentum row");
    L.push("     sweeps   momentum row   worst penetration");
    for (const r of iterationTrade())
        L.push("     " + String(r.k).padStart(6) + "   " + r.momentum.toExponential(3) + "      " + r.penetration.toExponential(3));
    L.push("");
    L.push("4. COMPLIANCE MOVES IT THE OTHER WAY");
    L.push("     compliance   momentum row   worst penetration");
    for (const r of complianceTrade())
        L.push("     " + String(r.k).padStart(10) + "   " + r.momentum.toExponential(3) + "      " + r.penetration.toExponential(3));
    L.push("");
    L.push("  " + MEASURED_V3603.refutedPro);
    L.push("  ANOMALY: " + MEASURED_V3603.anomaly);
    L.push("  " + MEASURED_V3603.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
