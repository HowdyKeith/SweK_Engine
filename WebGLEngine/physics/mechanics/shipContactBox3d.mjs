// WebGLEngine/physics/mechanics/shipContactBox3d.mjs -- UNNUMBERED (2026-11-04)
//
// THE HYBRID'S CONTACT TICK ON box3d: ships flown by the engine's own step, their contacts resolved by box3d, as Keith decided after the
// PD-joust verdict ("Step box3d's ships with the engine's own physics and use box3d only for contacts"). Registered as a round before it was
// built: physics/mechanics/BOX3D_HYBRID_SHIPS_WIP.md, with its correction (the ram impulse). Nothing in the engine uses it unless asked.
//
// box3dContacts(box3d) is a resolver for brain/pilot6dofPolicy.mjs's duel() `contacts` option, in the place of brain/shipCollision6dof.mjs's
// resolveShipCollisions. Each tick the duel has stepped both ships with rigidBody6dof.step(), then calls it. For each live pair:
//   1. THE TEST is the engine's own: rigidBody6dofCollision.mjs's checkContact on the stepped ships, a hit with a normal -- the test after
//      which resolveShipCollisions acts. No hit: nothing happens, and the duel goes on as the plain duel.
//   2. A CONTACT TICK is undone and flown again on box3d (flyPair below): a world of its own for the tick, gravity 0, both ships as boxes of
//      their half-extents and mass, damping 0, restitution 0.35 and friction 0.5 (the engine's coefficients), each set to its state at the
//      tick's start and given the tick's force and torque as impulses (as physics/mechanics/rigidBody6dofBox3d.mjs gives them), stepped once
//      with four substeps, read back, destroyed. box3d integrates that tick and resolves its contact; nothing carries to the next one.
//   3. RAM DAMAGE is the engine's rule (0.3 per unit of normal impulse, at most 25, both ships) on THE MOMENTUM box3d's CONTACT MOVED: ship A's
//      change of linear momentum over the tick less its thrust impulse, along the normal of the manifold box3d reports (the engine's normal
//      when it reports none). NOT box3d's reported per-point impulse, which sums its solve and relax passes and is not a momentum budget
//      (box3dLoader.js's v3586 note: 1.742 times the momentum moved at impact) -- see the registration's correction.
// It returns the tick's contacts as resolveShipCollisions does, [{ a, b, impulse, dmg }], with what box3d reported beside each.
"use strict";
import * as RBC from "./rigidBody6dofCollision.mjs";
import { rotateByQuat, worldToBody } from "./rigidBody6dof.mjs";

/** The engine's own coefficients and ram rule (brain/shipCollision6dof.mjs), and box3d's substeps for the tick. */
export const RESTITUTION = 0.35, FRICTION = 0.5, SUBSTEPS = 4;
export const RAM = Object.freeze({ perImpulse: 0.3, cap: 25 });
const densityOf = (half, mass) => mass / (8 * half[0] * half[1] * half[2]);
const three = (a, o) => [a[o], a[o + 1], a[o + 2]];

/**
 * Fly a pair one tick on box3d from their states at the tick's start (`starts`, the engine's bodies) under the tick's accumulators (`accs`,
 * body-frame force and torque): returns { bodies, normal, points, reportedImpulse, set } -- the bodies after the tick in the engine's form,
 * the normal of the first manifold box3d reports for the first body (null if none), how many points it reports for it, the sum of box3d's
 * own per-point impulses for it (a diagnostic only), and whether every coefficient could be set.
 */
export function flyPair(box3d, half, starts, accs, dt, { restitution = RESTITUTION, friction = FRICTION, substeps = SUBSTEPS } = {}) {
    const w = box3d.createWorld({ gravity: [0, 0, 0] });
    try {
        let set = true;
        const idx = starts.map((s) => {
            const i = w.addBox({ type: "dynamic", pos: [...s.pos], half: [...half], density: densityOf(half, s.mass) });
            set = w.setDamping(i, 0, 0) && w.setRestitution(i, restitution) && w.setFriction(i, friction) && set;
            return i;
        });
        if (!set) throw new Error("shipContactBox3d: this box3d artifact cannot set damping, restitution or friction");
        starts.forEach((s, k) => {
            const q = s.q, f = rotateByQuat(q, accs[k].force), t = rotateByQuat(q, accs[k].torque);
            w.setTransform(idx[k], s.pos, [q[1], q[2], q[3], q[0]]);
            w.setVelocity(idx[k], s.vel);
            w.setAngularVelocity(idx[k], rotateByQuat(q, s.w));
            w.impulse(idx[k], [f[0] * dt, f[1] * dt, f[2] * dt]);
            w.angularImpulse(idx[k], [t[0] * dt, t[1] * dt, t[2] * dt]);
        });
        w.step(dt, substeps);
        // every read is a view into the wasm heap, valid until the next box3d call: each is copied before the next is made
        const X = Array.from(w.readTransforms()), V = Array.from(w.readVelocities()), W = Array.from(w.readAngularVelocities()), C = w.readContacts() || [];
        const bodies = starts.map((s, k) => {
            const o = idx[k] * 7, q = [X[o + 6], X[o + 3], X[o + 4], X[o + 5]];
            return { ...s, I: [...s.I], pos: three(X, o), vel: three(V, idx[k] * 3), q, w: worldToBody(q, three(W, idx[k] * 3)) };
        });
        const own = C.filter((c) => c.body === idx[0]);   // box3d reports each contact once from each body: the first body's rows, each point once
        return { bodies, normal: own.length ? [...own[0].normal] : null, points: own.length, reportedImpulse: own.reduce((s, c) => s + c.totalImpulse, 0), set };
    } finally { w.destroy(); }
}

/** The normal impulse a contact tick moved on ship `start` -> `after` under `acc`: its momentum change less the thrust impulse, along `n`. */
export function contactImpulse(start, after, acc, dt, n) {
    const f = rotateByQuat(start.q, acc.force), m = start.mass;
    const dp = [0, 1, 2].map((k) => m * (after.vel[k] - start.vel[k]) - f[k] * dt), len = Math.hypot(n[0], n[1], n[2]) || 1;
    return Math.abs((dp[0] * n[0] + dp[1] * n[1] + dp[2] * n[2]) / len);
}

/**
 * A resolver for duel()'s `contacts`, on `box3d` (the loader, ready). `watch`, when given, is an array each contact tick is pushed onto:
 * { tick, impulse, dmg, points, reportedImpulse, normalFrom }.
 */
export function box3dContacts(box3d, { restitution = RESTITUTION, friction = FRICTION, substeps = SUBSTEPS, ram = RAM, watch = null } = {}) {
    return (ships, half, { start, acc, dt, tick = null }) => {
        const events = [];
        for (let i = 0; i < ships.length; i++) {
            if (ships[i].dead) continue;
            for (let j = i + 1; j < ships.length; j++) {
                const a = ships[i], b = ships[j];
                if (b.dead) continue;
                const c = RBC.checkContact(a.body, half, b.body, half);
                if (!c.hit || !c.normal) continue;
                const out = flyPair(box3d, half, [start[i], start[j]], [acc[i], acc[j]], dt, { restitution, friction, substeps });
                a.body = out.bodies[0]; b.body = out.bodies[1];
                const n = out.normal || c.normal, impulse = contactImpulse(start[i], a.body, acc[i], dt, n);
                let dmg = 0;
                if (impulse > 0) { dmg = Math.min(ram.cap, impulse * ram.perImpulse); a.hp -= dmg; b.hp -= dmg; }
                events.push({ a, b, impulse, dmg, box3d: { points: out.points, reportedImpulse: out.reportedImpulse, normalFrom: out.normal ? "box3d" : "engine" } });
                if (watch) watch.push({ tick, impulse, dmg, points: out.points, reportedImpulse: out.reportedImpulse, normalFrom: out.normal ? "box3d" : "engine" });
            }
        }
        return events;
    };
}
