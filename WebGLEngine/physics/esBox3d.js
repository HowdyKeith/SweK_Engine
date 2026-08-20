// WebGLEngine/physics/esBox3d.js — v2263
//
// Run the Endless Sky combat stack with box3d as the flight SUBSTRATE. The flight FEEL is unchanged -- the same
// stats.turn / stats.accel / stats.speed and the same headingVector as stepFlight, drag-free like ES space
// flight -- but position and velocity now come from box3d, which means ships COLLIDE: they ram, bump, and can't
// overlap. Heading stays owned here (a scalar), so box3d never has to rotate a ship; box3d gives ES exactly the
// two things it lacked -- collision response and a shared plane.
//
// The ES AI (decide / stepAI / esTactics / esPilot) is untouched: it reads positions (now from box3d) and emits
// {turn, thrust} (now fed to driveShip). Coordinate map: ES (x, y) <-> box3d (x, z); box3d's Y is the locked
// out-of-plane axis. Wraps a box3d WORLD HANDLE (never imports the loader) so it runs headless against a mock.

import { headingVector, normDeg } from "../ev/flightModel.js";
import { forward3d, clampPitch } from "../ev/flightModel3d.js";   // v3826 Round B -- opt-in 3D flight
import { resolveSlabCollisions } from "./esSlabCollide.js";       // v3832 -- altitude-band 3D ship collision

export function createESBox3D(world, opts = {}) {
    if (!world || typeof world.addShip !== "function") throw new Error("esBox3d: needs a box3d world handle with addShip");
    const half = opts.shipHalf || 30;        // collision footprint; ES ships are tens of units across
    const density = opts.density || 1;
    const ships = [];                          // { idx, ship, stats }
    // v3832 -- when WE own collision (the 3D slab collider, fly3d), box3d's own ship collision must go DORMANT or
    // the two authorities fight: box3d would still ram altitude-separated ships in the plane, which is the bug.
    // A tiny box3d footprint means box3d never registers a ship-ship contact, so it becomes a pure planar
    // integrator and the slab collider is the sole authority. Default false -> the 2D game and Round A are unchanged.
    const ownCollision = !!opts.ownCollision;
    const collideHalf = ownCollision ? (opts.dormantHalf || 1) : half;

    function add(ship, stats) {
        const idx = world.addShip({ x: ship.x || 0, z: ship.y || 0, half: ship.half || collideHalf, density });
        if (ship.vx == null) ship.vx = 0;
        if (ship.vy == null) ship.vy = 0;
        if (ship.alt == null) ship.alt = 0;      // v3826 Round B -- altitude + its rate + pitch, flight-model-owned;
        if (ship.valt == null) ship.valt = 0;    // stay 0/untouched in planar mode, so the 2D game is unchanged.
        if (ship.pitch == null) ship.pitch = 0;
        const rec = { idx, ship, stats };
        ships.push(rec);
        return rec;
    }

    // one ship's flight input for this tick: turn the heading (flight-model owned), add thrust along the
    // facing, clamp to max speed, and hand box3d the target velocity. sync() overwrites vx/vy afterward with
    // the actual post-step value, so a collision that happened during step() shows up next tick.
    function driveShip(rec, input, dt) {
        const s = rec.ship, st = rec.stats;
        s.heading = normDeg((s.heading || 0) + (input && input.turn || 0) * st.turn * dt);
        let vx = s.vx || 0, vy = s.vy || 0;
        if (input && input.thrust) { const hv = headingVector(s.heading); vx += hv.x * st.accel * dt; vy += hv.y * st.accel * dt; }
        const sp = Math.hypot(vx, vy);
        if (sp > st.speed && sp > 0) { const k = st.speed / sp; vx *= k; vy *= k; }
        world.setVelocity(rec.idx, [vx, 0, vy]);     // ES (vx,vy) -> box3d (x,z); y stays 0 (planar)
        s.vx = vx; s.vy = vy;
    }

    // v3826 Round B -- the same tick, in 3D. Yaw AND pitch turn, thrust drives the full 3D facing, and the speed
    // cap is over all three axes. box3d still owns x-z (so ships collide in the plane's projection); ALTITUDE IS
    // OWNED HERE and integrated directly, because box3d's addShip helper hides its up axis. Reduces to driveShip
    // exactly when pitch and its input are 0 (forward3d(h,0) has alt 0, so valt stays 0 and s.alt never moves).
    function driveShip3d(rec, input, dt) {
        const s = rec.ship, st = rec.stats;
        s.heading = normDeg((s.heading || 0) + (input && input.turn || 0) * st.turn * dt);
        s.pitch = clampPitch((s.pitch || 0) + (input && input.pitch || 0) * ((st.pitchRate != null ? st.pitchRate : st.turn)) * dt);
        let vx = s.vx || 0, vy = s.vy || 0, valt = s.valt || 0;
        if (input && input.thrust) { const f = forward3d(s.heading, s.pitch), a = st.accel * dt; vx += f.x * a; vy += f.y * a; valt += f.alt * a; }
        const sp = Math.hypot(vx, vy, valt);
        if (sp > st.speed && sp > 0) { const k = st.speed / sp; vx *= k; vy *= k; valt *= k; }
        world.setVelocity(rec.idx, [vx, 0, vy]);     // box3d owns the plane; Y stays 0 in the substrate
        s.vx = vx; s.vy = vy; s.valt = valt;
        s.alt = (s.alt || 0) + valt * dt;            // altitude flies free, integrated off the substrate
    }

    // pull box3d's post-step position + velocity back onto the ships (this is where collisions become visible).
    // Altitude (s.alt/s.valt) is NOT read from box3d -- it is owned by driveShip3d -- so it survives sync.
    function sync() {
        const xf = world.readTransforms(), vel = world.readVelocities();
        for (const rec of ships) {
            const o = rec.idx * 7, vo = rec.idx * 3;
            if (o + 7 <= xf.length) { rec.ship.x = xf[o]; rec.ship.y = xf[o + 2]; }
            if (vo + 3 <= vel.length) { rec.ship.vx = vel[vo]; rec.ship.vy = vel[vo + 2]; }
        }
    }

    const drive = opts.fly3d ? driveShip3d : driveShip;   // v3826 Round B -- opt-in; default stays planar

    // v2313 -- add an external velocity delta on top of whatever driveShip set this tick (gravity, knockback).
    // rec is the record returned by add(); dvx/dvz are ES-plane velocity additions.
    function nudgeRec(rec, dvx, dvz) { const v = world.readVelocities(); const i = rec.idx * 3; world.setVelocity(rec.idx, [v[i] + dvx, 0, v[i + 2] + dvz]); }

    // v3832 -- 3D SLAB COLLISION, run between drive and step so box3d integrates the corrected velocity. box3d
    // owns x-z position, so the horizontal response goes back through setVelocity (nudge); altitude is ours, so
    // its velocity delta and hard separation are written straight onto the ship. Out-of-band pairs get nothing --
    // that is the whole point. Combined radii default to the box3d footprint (2*half) horizontally and a vertical
    // band. No-op unless there is more than one ship.
    function collide3d(o = {}) {
        if (ships.length < 2) return;
        const deltas = resolveSlabCollisions(ships.map((r) => r.ship), {
            rH: o.rH !== undefined ? o.rH : 2 * half,
            rV: o.rV !== undefined ? o.rV : 80,
            restitution: o.restitution || 0,
            invMass: o.invMass !== undefined ? o.invMass : 1,
            positional: o.positional !== undefined ? o.positional : 0.5,
        });
        for (let i = 0; i < ships.length; i++) {
            const d = deltas[i], rec = ships[i];
            if (d.dvx || d.dvy) nudgeRec(rec, d.dvx, d.dvy);          // x-z through box3d
            rec.ship.valt = (rec.ship.valt || 0) + d.dvalt;           // altitude velocity (ours)
            rec.ship.alt = (rec.ship.alt || 0) + d.dalt;              // hard vertical separation (ours)
        }
    }

    return {
        add,
        addAll(list, statsOf) { for (const s of list || []) add(s, typeof statsOf === "function" ? statsOf(s) : statsOf); return ships.length; },
        driveShip: drive,                         // v3826 Round B -- driveShip3d when opts.fly3d, else the planar one
        fly3d: !!opts.fly3d,
        ownCollision,                             // v3832 -- true when the slab collider is the authority
        nudge: nudgeRec,
        collide3d,                                // v3832 -- altitude-band 3D ship collision
        step(dt = 1 / 30) { world.step(dt, opts.substeps || 4); },
        sync,
        // convenience: drive every ship from inputFor(ship), step, sync. inputFor returns {turn,thrust[,pitch]}.
        tick(inputFor, dt = 1 / 30) {
            for (const rec of ships) drive(rec, inputFor(rec.ship, rec), dt);
            world.step(dt, opts.substeps || 4);
            sync();
        },
        ships() { return ships.map((r) => r.ship); },
        count() { return ships.length; },
        stateHash() { return typeof world.stateHash === "function" ? world.stateHash() : 0; },
        destroy() { if (typeof world.destroy === "function") world.destroy(); ships.length = 0; },
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createESBox3D };
