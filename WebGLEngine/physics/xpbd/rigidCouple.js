// physics/xpbd/rigidCouple.js
//
// *** THE FIFTH COUPLING, AND THE FIRST THAT LEAVES XPBD. ***
//
// Four solvers live in this tree and until this file none of them touched. XPBD (77 modules, 38 gates) collides
// against a PLANE -- floorN/floorD in frictionalContact.js -- and against other particles, and against nothing
// else. SPH's boundaries are analytic box walls. box3d and Jolt collide their own bodies. couplingRegistry.js
// held four couplings and its only two-way one, fluidMeshSubstep, is fluid-to-mesh with BOTH SIDES INSIDE XPBD.
// physics/mechanics/reposeOps.mjs puts box3d and xpbd side by side, but as a DIFFERENTIAL on the critical-angle
// question -- a comparison, not a contact.
//
// fluid.js already stated the thesis this file has to satisfy: "Two-way coupling is therefore not bolted on; it
// is momentum. Drop the mesh half of the correction and the mesh is a wall the fluid slides off; drop the fluid
// half and the fluid tunnels straight through. Only both halves is a coupling." The rigid case adds the part
// that has no analogue between two particle sets: A BODY HAS A LEVER ARM.
//
// ---- WHAT HAD TO BE WRITTEN, AND IT IS ONE FORMULA -----------------------------------------------------------
//
// Between two particles the correction splits by inverse mass. Against a rigid body it splits by the GENERALIZED
// inverse mass at the contact point (Muller/Macklin, Detailed Rigid Body Simulation with XPBD, 2020 -- eq. 2):
//
//     w = 1/m + (r x n)^T  I^-1  (r x n)
//
// r is the contact point relative to the centre of mass and n the constraint direction. The second term is why a
// shove at a corner costs less than a shove through the centre: the body can rotate away instead of translating.
// Set it to zero and every contact acts as if it were on the axis, which is a body that cannot be spun -- and
// XPBD state in this tree is {pos, vel, invMass}, with no orientation, no angular velocity and no inertia
// anywhere in physics/xpbd/, so this term is the entire content of the "XPBD rigid bodies" extension. It is here
// rather than in its own round because the coupling is the only thing that needs it.
//
// ---- THE MASS PROPERTIES ARE DERIVED AND THEN CONFIRMED AGAINST THE ENGINE, NOT READ FROM IT ------------------
//
// The built wasm exports 45 swk_* functions and NONE of them returns a mass, an inertia or an angular velocity;
// swk_velocities is linear only. So both come from the solid-box formula here -- and the gate does not take that
// on trust, because a formula agreeing with itself is not evidence. It probes the real body: apply a known
// linear impulse, read the velocity BEFORE stepping (ApplyLinearImpulseToCenter changes it immediately), and
// m = J/dv. Measured on a 1.0 x 0.5 x 0.25 box at density 700: 87.50000331 against the formula's 87.5, a
// relative error of 3.8e-8, which is one ulp of float32 and therefore the readback's precision and not a
// disagreement. The inertia is confirmed the same way through the rotation one angular impulse produces.
//
// ---- WHAT IS EXACT AND WHAT IS ONLY SMALL, KEPT APART ON PURPOSE ---------------------------------------------
//
// tools/roundhouse/conservation.mjs reports EXACT separately from small, because "a quantity that never changes
// a bit is conserved by CONSTRUCTION, and calling that conserved to 1e-16 understates it and invites someone to
// loosen the tolerance later". This coupling has one of each, and conflating them would be the easy lie:
//
//   THE IMPULSE LEDGER IS EXACT. Every contact adds +s*n to the particle side and -s*n to the body side. IEEE
//   negation is exact and round-to-nearest is sign-symmetric, so sum(-x_k) is the exact negation of sum(x_k)
//   and the two sides cancel to a bit-identical zero, for any number of contacts in any order.
//
//   TOTAL MOMENTUM IS ONLY BOUNDED. Recovering m_i * (w_i * s) requires m_i * w_i == 1, which floating point
//   does not promise, so the momentum sum lands at the rounding floor rather than on zero. Claiming exactness
//   there would be claiming a property of the arithmetic that is not true.
//
// Pure +,-,*,/ and sqrt with min/max; no library trig, so bit-identical across machines like the rest of xpbd/.
"use strict";
import { colorConstraints } from "./xpbd.js";

/**
 * Solid box about its centre: m = 8*hx*hy*hz*rho and the principal inertias of a rectangular cuboid,
 * I_x = m/12 * ((2hy)^2 + (2hz)^2) = m/3 * (hy^2 + hz^2). DERIVED from the half-extents the caller already
 * passed to swk_body_box, never a second table of numbers to drift from the first.
 */
export function boxMassProperties(hx, hy, hz, density) {
    const mass = 8 * hx * hy * hz * density;
    return {
        mass,
        inertia: [mass / 3 * (hy * hy + hz * hz),
                  mass / 3 * (hx * hx + hz * hz),
                  mass / 3 * (hx * hx + hy * hy)],
    };
}

/** Rotate v by unit quaternion q = [x,y,z,w]. t = 2 q_v x v ; v' = v + q_w t + q_v x t. Muls and adds only. */
export function qRotate(q, v) {
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty),
            vy + w * ty + (z * tx - x * tz),
            vz + w * tz + (x * ty - y * tx)];
}
/** Rotate v by the conjugate of q -- world into body. */
export const qRotateInv = (q, v) => qRotate([-q[0], -q[1], -q[2], q[3]], v);

/**
 * A plain-JS mirror of one rigid body. The module never imports a physics engine: the caller fills this from
 * whichever one it has (the gate reads a real box3d body through swk_transforms / swk_velocities) and pushes the
 * reaction back the same way. reposeOps.mjs made the same choice for the same reason -- a file with no engine
 * import can be gated from anywhere and cannot smuggle node:fs into a page.
 *
 * mass 0 (or omitted with no density) means STATIC: invMass 0 and invInertia 0, so the body is a wall and every
 * correction lands on the particles. That is the one-way case expressed as a mass rather than as a flag.
 */
export function makeRigidProxy(opts = {}) {
    const he = opts.halfExtents || [0.5, 0.5, 0.5];
    const derived = opts.density ? boxMassProperties(he[0], he[1], he[2], opts.density) : null;
    const mass = opts.mass !== undefined ? opts.mass : (derived ? derived.mass : 0);
    const inertia = opts.inertia || (derived ? derived.inertia : [0, 0, 0]);
    const inv = (v) => (v > 0 ? 1 / v : 0);
    return {
        halfExtents: [he[0], he[1], he[2]],
        mass, inertia: [inertia[0], inertia[1], inertia[2]],
        invMass: inv(mass), invInertia: [inv(inertia[0]), inv(inertia[1]), inv(inertia[2])],
        pos: (opts.pos || [0, 0, 0]).slice(0, 3),
        quat: (opts.quat || [0, 0, 0, 1]).slice(0, 4),
        vel: (opts.vel || [0, 0, 0]).slice(0, 3),
        angVel: (opts.angVel || [0, 0, 0]).slice(0, 3),
    };
}

/** I^-1 in WORLD axes applied to w:  R * diag(invInertia) * R^T * w. Three rotations, no matrix built. */
export function worldInvInertiaApply(proxy, w) {
    const b = qRotateInv(proxy.quat, w);
    const s = [b[0] * proxy.invInertia[0], b[1] * proxy.invInertia[1], b[2] * proxy.invInertia[2]];
    return qRotate(proxy.quat, s);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * *** THE ONE FORMULA. ***  w = 1/m + (r x n)^T I^-1 (r x n), r relative to the centre of mass, n in world axes.
 * A static proxy returns 0 -- an infinitely heavy body takes none of the correction, which is what makes the
 * one-way case fall out of the same code path instead of needing a second one.
 */
export function generalizedInvMass(proxy, r, n) {
    const rn = cross(r, n);
    return proxy.invMass + dot(rn, worldInvInertiaApply(proxy, rn));
}

/**
 * The FACE of the box a world point should be pushed out through, and how far it is from that face's plane.
 * Body frame, so a face is an axis plus a sign and nothing else. Outside the slab on some axis -> the axis of
 * largest outward excursion, which for a point off a face IS that face and for a point off a corner is the
 * dominant one. Inside -> the nearest face. `sd` is the SIGNED distance to that plane, positive outside.
 *
 * *** A FACE, NOT A CLOSEST POINT, AND THE FIRST DRAFT'S BUG IS WHY. *** That draft returned the closest point
 * on the surface and recomputed the normal every iteration. A box lowered onto a taut sheet passed straight
 * through it: once the box had descended past the particles they were closest to its BOTTOM face, so the solver
 * pushed them out DOWNWARD -- because the shortest way out of a box is through the far side once you are more
 * than halfway across it. Measured mid-fall: 10 contacts found and 5 projections applied, the box accelerating
 * at a clean -g the whole way down. THE NORMAL HAS TO BE FIXED AT DISCOVERY AND HELD FOR THE SUBSTEP, which is
 * what a contact IS. Recomputing it every iteration is a nearest-surface query wearing a contact's name.
 */
export function boxFace(proxy, p) {
    const he = proxy.halfExtents;
    const l = qRotateInv(proxy.quat, [p[0] - proxy.pos[0], p[1] - proxy.pos[1], p[2] - proxy.pos[2]]);
    // out[a] > 0 means outside the slab on axis a. The largest value wins in BOTH cases: outside it is the
    // deepest excursion, inside (all negative) it is the least-negative, which is the nearest face.
    const out = [Math.abs(l[0]) - he[0], Math.abs(l[1]) - he[1], Math.abs(l[2]) - he[2]];
    let axis = 0;
    if (out[1] > out[axis]) axis = 1;
    if (out[2] > out[axis]) axis = 2;
    const sign = l[axis] >= 0 ? 1 : -1;
    return { axis, sign, sd: sign * l[axis] - he[axis] };
}

/**
 * The signed distance from p to the plane of the face (axis, sign), that face's outward WORLD normal, and p
 * projected onto the plane. Positive sd is outside. Called every iteration with a face fixed at discovery, so
 * the constraint keeps pushing the same way even as the body moves under it.
 */
export function faceConstraint(proxy, p, axis, sign) {
    const he = proxy.halfExtents;
    const l = qRotateInv(proxy.quat, [p[0] - proxy.pos[0], p[1] - proxy.pos[1], p[2] - proxy.pos[2]]);
    const nl = [0, 0, 0]; nl[axis] = sign;
    const cl = [l[0], l[1], l[2]]; cl[axis] = sign * he[axis];
    const nw = qRotate(proxy.quat, nl);
    const cw = qRotate(proxy.quat, cl);
    return { sd: sign * l[axis] - he[axis], normal: nw,
             point: [cw[0] + proxy.pos[0], cw[1] + proxy.pos[1], cw[2] + proxy.pos[2]] };
}

/** The surface point itself, for a caller that wants it. boxFace + faceConstraint are what the solver uses. */
export function closestOnBox(proxy, p) {
    const f = boxFace(proxy, p);
    const c = faceConstraint(proxy, p, f.axis, f.sign);
    return { point: c.point, normal: c.normal, depth: -c.sd };
}

/**
 * Every particle within `radius` of the box surface, as sorted contacts. SORTED BEFORE ANYTHING DOWNSTREAM SEES
 * THEM -- v2661's determinism rule, restated by selfCollide.js: "discover the pairs, then SORT them", because a
 * pair order that depends on the walk feeds graph coloring and two orderings of one pair set can produce two
 * different solves. `visitOrder` lets the gate scramble the walk and prove the output does not move.
 */
export function rigidContacts(state, proxy, radius, visitOrder) {
    const n = state.invMass.length;
    const order = visitOrder || Array.from({ length: n }, (_, i) => i);
    const out = [];
    for (const i of order) {
        const f = boxFace(proxy, [state.pos[3 * i], state.pos[3 * i + 1], state.pos[3 * i + 2]]);
        // The face is recorded WITH the contact. Everything downstream re-reads the geometry from the body's
        // current pose but never re-chooses the face.
        if (f.sd < radius) out.push({ i, axis: f.axis, sign: f.sign, sd: f.sd });
    }
    return out.sort((a, b) => a.i - b.i);
}

/**
 * Project `pred` out of the box and, when two-way, accumulate the equal-and-opposite half on the proxy.
 *
 * Unilateral: C = (pred_i - contactPoint) . n - radius, and C >= 0 is already satisfied, so it is skipped. The
 * correction splits by w_p : w_b with w_b the GENERALIZED inverse mass at the contact -- which for a static
 * proxy is 0 and the particle takes all of it.
 *
 * `oneWay` does not change the physics of the particle side; it DROPS THE BODY'S HALF OF THE LEDGER, which is
 * precisely the defect the momentum audit is built to see. It is a parameter and not a second function so that
 * the two runs the gate compares differ in exactly one boolean.
 */
export function solveRigidContacts(pred, invMass, proxy, contacts, opts = {}) {
    const radius = opts.radius ?? 0;
    const oneWay = !!opts.oneWay;
    const move = !!opts.move;
    const ledger = { particle: [0, 0, 0], body: [0, 0, 0], angular: [0, 0, 0], applied: 0 };
    for (let k = 0; k < contacts.length; k++) {
        const ct = contacts[k], i = ct.i, o = 3 * i;
        // GEOMETRY from the body's CURRENT pose, FACE from discovery. Re-reading the pose is what lets a body
        // being pushed during the solve push from where it now is; re-choosing the face is the bug boxFace's
        // header describes, and it read as the sheet being tunnelled through.
        const fc = faceConstraint(proxy, [pred[o], pred[o + 1], pred[o + 2]], ct.axis, ct.sign);
        const C = fc.sd - radius;
        if (C >= 0) continue;
        const n = fc.normal;
        const wp = invMass[i];
        const r = [fc.point[0] - proxy.pos[0], fc.point[1] - proxy.pos[1], fc.point[2] - proxy.pos[2]];
        const wb = oneWay ? 0 : generalizedInvMass(proxy, r, n);
        const wsum = wp + wb;
        if (wsum === 0) continue;
        const s = -C / wsum;
        pred[o] += wp * s * n[0]; pred[o + 1] += wp * s * n[1]; pred[o + 2] += wp * s * n[2];
        ledger.particle[0] += s * n[0]; ledger.particle[1] += s * n[1]; ledger.particle[2] += s * n[2];
        if (!oneWay) {
            // The body's half, in the same positional units. sum(-x) is the exact negation of sum(x).
            ledger.body[0] -= s * n[0]; ledger.body[1] -= s * n[1]; ledger.body[2] -= s * n[2];
            const rn = cross(r, n);
            ledger.angular[0] -= s * rn[0]; ledger.angular[1] -= s * rn[1]; ledger.angular[2] -= s * rn[2];
            if (move && proxy.invMass > 0) {
                proxy.pos = [proxy.pos[0] - proxy.invMass * s * n[0],
                             proxy.pos[1] - proxy.invMass * s * n[1],
                             proxy.pos[2] - proxy.invMass * s * n[2]];
                const dTheta = worldInvInertiaApply(proxy, [-s * rn[0], -s * rn[1], -s * rn[2]]);
                proxy.quat = qIntegrate(proxy.quat, dTheta);
            }
        }
        ledger.applied++;
    }
    return ledger;
}

/** The ledger's two sides summed. Bit-exact [0,0,0] when two-way; the particle side alone when one-way. */
export const ledgerResidual = (L) => [L.particle[0] + L.body[0], L.particle[1] + L.body[1], L.particle[2] + L.body[2]];

/** Integrate a small rotation vector into a unit quaternion: q <- normalize(q + 0.5 * (dTheta,0) (x) q). */
export function qIntegrate(q, dTheta) {
    const [x, y, z, w] = q, [ax, ay, az] = dTheta;
    const nx = x + 0.5 * (ax * w + ay * z - az * y);
    const ny = y + 0.5 * (-ax * z + ay * w + az * x);
    const nz = z + 0.5 * (ax * y - ay * x + az * w);
    const nw = w + 0.5 * (-ax * x - ay * y - az * z);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    if (len === 0) return [0, 0, 0, 1];
    return [nx / len, ny / len, nz / len, nw / len];
}

/**
 * One coupled substep of cloth AND body.
 *
 * *** THE ORDERING IS THE PHYSICS, AND THE FIRST DRAFT GOT IT WRONG IN A WAY THAT LOOKED LIKE TUNNELLING. ***
 * That draft ran all `iterations` of the cloth constraints and THEN projected the contacts once, at the end.
 * A box lowered onto a sheet pinned at its four corners fell straight through: the contact pushed the nearest
 * particles down and out of the way, and because no cloth iteration ran afterwards, that displacement never
 * propagated along the sheet to the pins. The sheet could not carry a load because the load arrived after the
 * sheet had finished solving. Measured: 5 of 600 steps in contact, box at y = -498 after ten seconds against
 * a free fall of -499.9 -- it had been slowed by a rounding error's worth and nothing else.
 *
 * Contacts are DISCOVERED once per substep (collision detection is per substep) and PROJECTED every iteration
 * alongside the cloth constraints, which is how a solve that has to satisfy both at once has to be written.
 *
 * The body is predicted and finalized here the same way the particles are -- position first, velocity read back
 * from the positional change. A caller that owns the body in another engine ignores proxy.vel and hands
 * rigidReaction(ledger, dt) to that engine instead; the gate does exactly that with a real box3d body.
 */
export function rigidClothSubstep(cloth, cons, batches, proxy, opts = {}) {
    const dt = opts.dt ?? 1 / 60, iters = opts.iterations ?? 4, g = opts.gravity || [0, 0, 0];
    const radius = opts.radius ?? 0.02, oneWay = !!opts.oneWay;
    const N = cloth.invMass.length;
    const prev = Float64Array.from(cloth.pos), pred = new Float64Array(cloth.pos.length);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (cloth.invMass[a] > 0) {
            cloth.vel[o] += g[0] * dt; cloth.vel[o + 1] += g[1] * dt; cloth.vel[o + 2] += g[2] * dt;
            pred[o] = cloth.pos[o] + cloth.vel[o] * dt;
            pred[o + 1] = cloth.pos[o + 1] + cloth.vel[o + 1] * dt;
            pred[o + 2] = cloth.pos[o + 2] + cloth.vel[o + 2] * dt;
        } else { pred[o] = cloth.pos[o]; pred[o + 1] = cloth.pos[o + 1]; pred[o + 2] = cloth.pos[o + 2]; }
    }
    // The body's prediction. A static proxy (invMass 0) is not predicted and not moved -- gravity on an
    // infinite mass is a no-op, which is the correct reading of "this body is a wall".
    const bPrevPos = proxy.pos.slice(), bPrevQuat = proxy.quat.slice();
    if (proxy.invMass > 0 && !opts.bodyDrivenExternally) {
        proxy.vel[0] += g[0] * dt; proxy.vel[1] += g[1] * dt; proxy.vel[2] += g[2] * dt;
        proxy.pos = [proxy.pos[0] + proxy.vel[0] * dt, proxy.pos[1] + proxy.vel[1] * dt, proxy.pos[2] + proxy.vel[2] * dt];
        proxy.quat = qIntegrate(proxy.quat, [proxy.angVel[0] * dt, proxy.angVel[1] * dt, proxy.angVel[2] * dt]);
    }

    const contacts = rigidContacts({ pos: pred, invMass: cloth.invMass }, proxy, radius, opts.contactOrder);
    const ledger = { particle: [0, 0, 0], body: [0, 0, 0], angular: [0, 0, 0], applied: 0 };
    const lam = new Float64Array(cons.length);
    for (let it = 0; it < iters; it++) {
        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            for (let bi = 0; bi < batch.length; bi++) {
                const ci = batch[bi], c = cons[ci];
                const w1 = cloth.invMass[c.i], w2 = cloth.invMass[c.j], wsum = w1 + w2;
                if (wsum === 0) continue;
                const ax = 3 * c.i, bx = 3 * c.j;
                const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len < 1e-12) continue;
                const C = len - c.rest, aTilde = c.compliance / (dt * dt);
                const dL = (-C - aTilde * lam[ci]) / (wsum + aTilde);
                lam[ci] += dL;
                const s = dL / len;
                pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
                pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
            }
        }
        // ...and the contacts in the SAME loop, re-evaluated against wherever the body now is.
        const l = solveRigidContacts(pred, cloth.invMass, proxy, contacts, { radius, oneWay, move: true });
        ledger.particle[0] += l.particle[0]; ledger.particle[1] += l.particle[1]; ledger.particle[2] += l.particle[2];
        ledger.body[0] += l.body[0]; ledger.body[1] += l.body[1]; ledger.body[2] += l.body[2];
        ledger.angular[0] += l.angular[0]; ledger.angular[1] += l.angular[1]; ledger.angular[2] += l.angular[2];
        ledger.applied += l.applied;
    }

    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (cloth.invMass[a] > 0) {
            cloth.vel[o] = (pred[o] - prev[o]) / dt;
            cloth.vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt;
            cloth.vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt;
        }
        cloth.pos[o] = pred[o]; cloth.pos[o + 1] = pred[o + 1]; cloth.pos[o + 2] = pred[o + 2];
    }
    if (proxy.invMass > 0 && !opts.bodyDrivenExternally) {
        proxy.vel = [(proxy.pos[0] - bPrevPos[0]) / dt, (proxy.pos[1] - bPrevPos[1]) / dt, (proxy.pos[2] - bPrevPos[2]) / dt];
        // omega from the quaternion delta: dq = q * conj(qPrev), omega = 2 * dq_v / dt (sign from dq_w).
        const cq = [-bPrevQuat[0], -bPrevQuat[1], -bPrevQuat[2], bPrevQuat[3]];
        const q = proxy.quat;
        const dq = [
            q[3] * cq[0] + q[0] * cq[3] + q[1] * cq[2] - q[2] * cq[1],
            q[3] * cq[1] - q[0] * cq[2] + q[1] * cq[3] + q[2] * cq[0],
            q[3] * cq[2] + q[0] * cq[1] - q[1] * cq[0] + q[2] * cq[3],
            q[3] * cq[3] - q[0] * cq[0] - q[1] * cq[1] - q[2] * cq[2],
        ];
        const sgn = dq[3] >= 0 ? 2 / dt : -2 / dt;
        proxy.angVel = [dq[0] * sgn, dq[1] * sgn, dq[2] * sgn];
    }
    return { contacts: contacts.length, ledger };
}

/**
 * The ledger as the impulse a rigid engine wants: positional units over dt. This is the seam -- a caller with a
 * box3d body passes linear to swk_body_impulse and angular to swk_body_ang_impulse and the loop is closed
 * through the real solver rather than through this file's own integrator.
 */
export function rigidReaction(ledger, dt) {
    return {
        linear: [ledger.body[0] / dt, ledger.body[1] / dt, ledger.body[2] / dt],
        angular: [ledger.angular[0] / dt, ledger.angular[1] / dt, ledger.angular[2] / dt],
    };
}

/** Total linear momentum of the coupled system: sum over particles of m_i v_i, plus the body's. */
export function linearMomentum(cloth, proxy) {
    const p = [0, 0, 0];
    for (let a = 0; a < cloth.invMass.length; a++) {
        if (cloth.invMass[a] <= 0) continue;
        const m = 1 / cloth.invMass[a], o = 3 * a;
        p[0] += m * cloth.vel[o]; p[1] += m * cloth.vel[o + 1]; p[2] += m * cloth.vel[o + 2];
    }
    if (proxy && proxy.mass > 0) { p[0] += proxy.mass * proxy.vel[0]; p[1] += proxy.mass * proxy.vel[1]; p[2] += proxy.mass * proxy.vel[2]; }
    return p;
}

export const ADDED_AT_V4403 = Object.freeze([
    "boxMassProperties", "qRotate", "qRotateInv", "makeRigidProxy", "worldInvInertiaApply",
    "generalizedInvMass", "boxFace", "faceConstraint", "closestOnBox", "rigidContacts", "solveRigidContacts", "ledgerResidual",
    "qIntegrate", "rigidClothSubstep", "rigidReaction", "linearMomentum",
]);
