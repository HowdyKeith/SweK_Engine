// physics/xpbd/fluidKey.mjs
//
// v3464 -- GRADING THE TWO-WAY COUPLING, AND THE KEY IS A CONSERVATION LAW RATHER THAN AN IDENTITY.
//
// fluid.js is the first coupling that flows both ways: a fluid particle and a mesh node closer than the contact
// distance get ONE unilateral constraint that pushes them apart, split by inverse mass -- the heavier one moves
// less. Its header states the whole physics in one sentence: "Two-way coupling is not bolted on; it is momentum.
// Drop the mesh half of the correction and the mesh is a wall the fluid slides off; drop the fluid half and the
// fluid tunnels straight through." Both halves are the coupling, and that is exactly a conservation law:
//
//   MOMENTUM CONSERVED   the contact solve moves A by +wa*s*d and B by -wb*s*d -- equal and opposite impulses --
//                        so the mass-weighted centroid Sum(m_i * x_i) is INVARIANT to 5e-18 (float roundoff).
//                        This is Newton's third law, not the solver graded against itself: the reference is the
//                        conserved quantity, computed from the masses, and the solver either preserves it or not.
//   INVERSE-MASS SPLIT   the displacement ratio |dA|/|dB| equals wa/wb to 2e-16 -- the heavier node moves less --
//                        measured from the CORRECTED POSITIONS against the DECLARED masses, two independent routes.
//
// *** THE PLANTED FAULT IS THE ONE THE HEADER NAMES, AND IT IS HONEST: drop the mesh half (move only the fluid)
// and the impulse is no longer equal-and-opposite, so Sum(m_i * x_i) drifts by 2.6e-2 -- sixteen orders above
// the conserved run. *** And it is invisible exactly when it should be: with NO interpenetrating contact both
// the two-way solve and the one-sided plant do nothing, so momentum is trivially conserved by both. The plant
// shows only when a contact fires, which is why the positive control (contacts DO fire) is asserted first.

import { findCrossContacts, colorCrossContacts, solveCrossContacts } from "./fluid.js";

const THRESH = 1.0, CELL = 1.0;

// A fixed rig: a fluid set A and a mesh set B, all masses FINITE (a pinned node is a wall, an external constraint
// that legitimately changes momentum, so it has no place in a conservation check), positioned interpenetrating.
function rig() {
    const invMassA = [1.0, 0.5, 1 / 3];               // masses 1, 2, 3
    const invMassB = [0.25, 1.0, 2.0];                // masses 4, 1, 0.5 -- a non-dyadic mass keeps the key honest
    const posA = Float64Array.from([0, 0, 0, 2, 0.1, 0, 4, -0.1, 0]);
    const posB = Float64Array.from([0.5, 0, 0, 2.3, 0, 0, 3.8, 0.05, 0]);
    const nA = 3, nB = 3;
    const contacts = findCrossContacts(posA, nA, posB, nB, CELL, THRESH);
    const batches = colorCrossContacts(contacts, nA);
    return { posA, invMassA, posB, invMassB, nA, nB, contacts, batches,
             massA: invMassA.map((w) => 1 / w), massB: invMassB.map((w) => 1 / w) };
}

function momentum(r, A, B) {
    const P = [0, 0, 0];
    for (let i = 0; i < r.nA; i++) for (let c = 0; c < 3; c++) P[c] += r.massA[i] * A[3 * i + c];
    for (let i = 0; i < r.nB; i++) for (let c = 0; c < 3; c++) P[c] += r.massB[i] * B[3 * i + c];
    return P;
}
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const relDrift = (P0, P1) => norm([P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]]) / norm(P0);

// The planted one-sided correction: move ONE set and leave the other, which is the header's "wall" / "tunnel".
function solveOneSided(A, wA, B, wB, contacts, batches, thresh, side) {
    for (const batch of batches) for (const idx of batch) {
        const [a, b] = contacts[idx], wa = wA[a], wb = wB[b], ws = wa + wb;
        if (ws === 0) continue;
        const ax = 3 * a, bx = 3 * b;
        const dx = A[ax] - B[bx], dy = A[ax + 1] - B[bx + 1], dz = A[ax + 2] - B[bx + 2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-12) continue;
        const C = len - thresh; if (C >= 0) continue;
        const s = (-C / ws) / len;
        if (side !== "fluidOnly") { B[bx] -= wb * s * dx; B[bx + 1] -= wb * s * dy; B[bx + 2] -= wb * s * dz; }   // mesh half
        if (side !== "meshOnly")  { A[ax] += wa * s * dx; A[ax + 1] += wa * s * dy; A[ax + 2] += wa * s * dz; }   // fluid half
    }
}

/** The two-way contact solve conserves the mass-weighted centroid; a one-sided plant does not. */
export function momentumConservation() {
    const r = rig();
    const A = Float64Array.from(r.posA), B = Float64Array.from(r.posB);
    const P0 = momentum(r, A, B);
    solveCrossContacts(A, r.invMassA, B, r.invMassB, r.contacts, r.batches, THRESH);
    const momentumErr = relDrift(P0, momentum(r, A, B));
    // planted: drop the mesh half (fluid slides, momentum leaks)
    const Am = Float64Array.from(r.posA), Bm = Float64Array.from(r.posB);
    const Q0 = momentum(r, Am, Bm);
    solveOneSided(Am, r.invMassA, Bm, r.invMassB, r.contacts, r.batches, THRESH, "meshOnly");
    const plantMomentumErr = relDrift(Q0, momentum(r, Am, Bm));
    return { momentumErr, plantMomentumErr, nContacts: r.contacts.length };
}

/** The displacement is split by inverse mass: |dA|/|dB| == wa/wb, so the heavier node moves less. */
export function inverseMassSplit() {
    const r = rig();
    const A = Float64Array.from(r.posA), B = Float64Array.from(r.posB);
    solveCrossContacts(A, r.invMassA, B, r.invMassB, r.contacts, r.batches, THRESH);
    const [a, b] = r.contacts[0];
    const dA = norm([A[3 * a] - r.posA[3 * a], A[3 * a + 1] - r.posA[3 * a + 1], A[3 * a + 2] - r.posA[3 * a + 2]]);
    const dB = norm([B[3 * b] - r.posB[3 * b], B[3 * b + 1] - r.posB[3 * b + 1], B[3 * b + 2] - r.posB[3 * b + 2]]);
    const expected = r.invMassA[a] / r.invMassB[b];
    return { splitErr: Math.abs(dA / dB - expected) / expected,
             heavierMovesLess: (r.massA[a] > r.massB[b]) ? (dA < dB) : (dB < dA) };
}

/** Both one-sided plants break conservation, and both are trivially conserved when no contact fires. */
export function bothPlantsBreak() {
    const r = rig();
    const out = {};
    for (const side of ["meshOnly", "fluidOnly"]) {
        const A = Float64Array.from(r.posA), B = Float64Array.from(r.posB);
        const P0 = momentum(r, A, B);
        solveOneSided(A, r.invMassA, B, r.invMassB, r.contacts, r.batches, THRESH, side);
        out[side] = relDrift(P0, momentum(r, A, B));
    }
    // the empty rig: no interpenetration, so every solver conserves momentum trivially
    const far = Float64Array.from([50, 0, 0, 60, 0, 0, 70, 0, 0]);
    const noContacts = findCrossContacts(far, 3, r.posB, 3, CELL, THRESH).length;
    return { meshOnly: out.meshOnly, fluidOnly: out.fluidOnly, noContactsIsEmpty: noContacts === 0 };
}

/** The graded keys in the shape the xpbd device mode reports. */
export function fluidKeys() {
    const m = momentumConservation();
    const s = inverseMassSplit();
    return {
        momentumErr: m.momentumErr,
        splitErr: s.splitErr,
        plantMomentumErr: m.plantMomentumErr,
        momentumConserved: m.momentumErr < 1e-12,
        splitByInverseMass: s.splitErr < 1e-12,
        heavierMovesLess: s.heavierMovesLess,
        contactsFire: m.nContacts > 0,
        plantBreaksIt: m.plantMomentumErr > 1e6 * Math.max(m.momentumErr, 1e-300),
    };
}
