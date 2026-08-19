// physics/xpbd/frictionalContactKey.mjs
//
// v3533 -- LAB REACH for physics/xpbd/frictionalContact.js (the weave/tear/clothloop pattern: a passing selfcheck
// already exists, so this is reach and a graded number, not a new claim). It grades the CONTACT MECHANICS that
// make a heap of grains hold a slope -- the particle-particle Coulomb path, which the plane-only "friction" mode
// never runs (a code path no other gate exercises, the plastic lesson).
//
//   coneErr    THE COULOMB CONE. A pair sliding faster than mu*depth has its tangential correction CLAMPED to
//              exactly mu*depth -- it slips, it does not stick. Applied tangential == mu*depth to the bit.
//   stickErr   below the cone (tangential motion < mu*depth) the pair STICKS: the tangential motion is cancelled
//              in full. Applied == the motion, exactly.
//   comErr     the correction is split by inverse mass and applied equal-and-opposite, so the pair centre of mass
//              does not move -- Newton's third law, to ~1e-18.
//   deterministic  pure +,-,*,/ and sqrt: the same contact solved twice is bit-identical.
//
// THE PLANT REMOVES THE CONE CLAMP (tangential resisted in full, unbounded): a sliding pair over-sticks, coneErr
// jumps from 0 to 0.075, while the stick case (already within the cone), the two-way split and determinism -- none
// of which depend on the clamp -- stay green. The Coulomb bound is exactly what lets a pile hold an angle of
// repose instead of spreading into a pancake.

import { solveFrictionalContacts } from "./frictionalContact.js";

const RADIUS = 0.1, REST = 0.2, MU = 0.5;
const DEPTH = REST - 0.15, BOUND = MU * DEPTH;            // pred overlaps at separation 0.15 along x, depth 0.05
// pred overlaps along x (normal exactly x); the tangential motion `tang` in y comes from prev_j.y = -tang.
const scenario = (tang) => ({ prev: Float64Array.from([0, 0, 0, 0.15, -tang, 0]), pred: Float64Array.from([0, 0, 0, 0.15, 0, 0]) });
const relTang = (pred, prev) => Math.hypot((pred[1] - prev[1]) - (pred[4] - prev[4]), (pred[2] - prev[2]) - (pred[5] - prev[5]));

// The real solve, and the planted solve with the cone clamp removed (tangential resisted in full).
function applyReal(tang) {
    const { prev, pred } = scenario(tang); const p0 = Float64Array.from(pred);
    solveFrictionalContacts(pred, prev, Float64Array.from([1, 1]), [[0, 1]], [[0]], RADIUS, MU);
    return relTang(p0, prev) - relTang(pred, prev);
}
function applyPlant(tang) {
    const { prev, pred } = scenario(tang); const p0 = Float64Array.from(pred);
    const s = DEPTH / 2; pred[0] += s; pred[3] -= s;                                  // push apart along x
    let ry = (pred[1] - prev[1]) - (pred[4] - prev[4]), rz = (pred[2] - prev[2]) - (pred[5] - prev[5]);
    pred[1] -= 0.5 * ry; pred[2] -= 0.5 * rz; pred[4] += 0.5 * ry; pred[5] += 0.5 * rz;   // resist in FULL, no mu*depth clamp
    return relTang(p0, prev) - relTang(pred, prev);
}

export function frictionalContactKeys(planted = false) {
    const apply = planted ? applyPlant : applyReal;
    // CONE: a fast slide (tangential 0.10 >> mu*depth 0.025) is clamped to the cone.
    const coneErr = Math.max(0, apply(0.10) - BOUND);
    // STICK: a slow pair (tangential 0.01 < mu*depth) is cancelled in full.
    const stickErr = Math.abs(apply(0.01) - 0.01);
    // TWO-WAY (always the real solve): the pair centre of mass does not move.
    const { prev, pred } = scenario(0.10); const b = Float64Array.from(pred);
    solveFrictionalContacts(pred, prev, Float64Array.from([1, 1]), [[0, 1]], [[0]], RADIUS, MU);
    const comErr = Math.abs(((pred[0] - b[0]) + (pred[3] - b[3])) / 2) + Math.abs(((pred[1] - b[1]) + (pred[4] - b[4])) / 2);
    // DETERMINISM: the same contact solved twice is bit-identical.
    const a1 = scenario(0.07), a2 = scenario(0.07);
    solveFrictionalContacts(a1.pred, a1.prev, Float64Array.from([1, 1]), [[0, 1]], [[0]], RADIUS, MU);
    solveFrictionalContacts(a2.pred, a2.prev, Float64Array.from([1, 1]), [[0, 1]], [[0]], RADIUS, MU);
    let dd = 0; for (let i = 0; i < 6; i++) dd = Math.max(dd, Math.abs(a1.pred[i] - a2.pred[i]));
    return {
        coneErr, stickErr, comErr,
        coneHolds: coneErr < 1e-9,
        sticks: stickErr < 1e-9,
        twoWay: comErr < 1e-12,
        deterministic: dd === 0,
    };
}
