// WebGLEngine/physics/es-box3d-selfcheck.mjs — v2263
//   run: node physics/es-box3d-selfcheck.mjs

import { createESBox3D } from "./esBox3d.js";
import { normDeg } from "../ev/flightModel.js";

// mock box3d world for ES ships: planar motion in x-z + a simple equal-mass box collision (push apart + swap
// the colliding-axis velocity), so "two ships collide and separate" is observable without the WASM.
function mockWorld() {
    const bs = [];   // { half, pos:[x,0,z], vel:[vx,0,vz] }
    return {
        addShip({ x, z, half }) { bs.push({ half, pos: [x, 0, z], vel: [0, 0, 0] }); return bs.length - 1; },
        setVelocity(i, v) { bs[i].vel = v.slice(); },
        step(dt) {
            for (const b of bs) { b.pos[0] += b.vel[0] * dt; b.pos[2] += b.vel[2] * dt; }
            for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
                const a = bs[i], c = bs[j], dx = c.pos[0] - a.pos[0], dz = c.pos[2] - a.pos[2], m = a.half + c.half;
                if (Math.abs(dx) < m && Math.abs(dz) < m) {
                    const penX = m - Math.abs(dx), penZ = m - Math.abs(dz);
                    if (penX <= penZ) { const s = (dx < 0 ? -1 : 1) * penX / 2; a.pos[0] -= s; c.pos[0] += s; const t = a.vel[0]; a.vel[0] = c.vel[0]; c.vel[0] = t; }
                    else { const s = (dz < 0 ? -1 : 1) * penZ / 2; a.pos[2] -= s; c.pos[2] += s; const t = a.vel[2]; a.vel[2] = c.vel[2]; c.vel[2] = t; }
                }
            }
        },
        bodyCount() { return bs.length; },
        readTransforms() { const a = new Float32Array(bs.length * 7); for (let i = 0; i < bs.length; i++) { const o = i * 7, b = bs[i]; a[o] = b.pos[0]; a[o + 1] = b.pos[1]; a[o + 2] = b.pos[2]; a[o + 6] = 1; } return a; },
        readVelocities() { const a = new Float32Array(bs.length * 3); for (let i = 0; i < bs.length; i++) { const o = i * 3, b = bs[i]; a[o] = b.vel[0]; a[o + 1] = b.vel[1]; a[o + 2] = b.vel[2]; } return a; },
        stateHash() { let h = 2166136261 >>> 0; for (const b of bs) for (const v of [b.pos[0], b.pos[2]]) { h = (h ^ ((Math.round(v * 100)) >>> 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; },
    };
}

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };
const stats = { turn: 90, accel: 200, speed: 300 };

console.log("es-box3d-selfcheck: ES flight on box3d, with collisions");
{
    const es = createESBox3D(mockWorld(), { shipHalf: 20 });
    const s = { x: 0, y: 0, heading: 90 };   // heading 90 -> faces +x
    es.add(s, stats);
    for (let t = 0; t < 10; t++) es.tick(() => ({ turn: 0, thrust: true }), 1 / 30);
    ok("thrust drives the ship along its heading (+x at heading 90)", s.x > 1, "x=" + s.x.toFixed(1));
    ok("stays in the plane (ES y unchanged by a +x burn)", Math.abs(s.y) < 1e-6);
    ok("speed builds up toward the cap", Math.hypot(s.vx, s.vy) > 1);
}
{
    const es = createESBox3D(mockWorld());
    const s = { x: 0, y: 0, heading: 0 };
    es.add(s, stats);
    es.tick(() => ({ turn: 1, thrust: false }), 1 / 30);
    ok("turn advances heading by stats.turn*dt (same as stepFlight)", Math.abs(normDeg(s.heading) - 90 / 30) < 1e-6, "h=" + s.heading);
}
{
    // COLLISION: two ships thrust head-on. Without box3d they overlap; with it they cannot pass through.
    const es = createESBox3D(mockWorld(), { shipHalf: 20 });
    const A = { x: -60, y: 0, heading: 90 };    // faces +x
    const B = { x: 60, y: 0, heading: 270 };    // faces -x
    es.add(A, stats); es.add(B, stats);
    let minGap = Infinity, tunneled = false;
    for (let t = 0; t < 80; t++) { es.tick(() => ({ turn: 0, thrust: true }), 1 / 30); const gap = B.x - A.x; minGap = Math.min(minGap, gap); if (gap < 0) tunneled = true; }
    ok("ships never tunnel through each other", !tunneled && A.x < B.x, `A.x=${A.x.toFixed(1)} B.x=${B.x.toFixed(1)}`);
    ok("they actually made contact (min gap ~ 2*half)", minGap >= 39 && minGap <= 42, "minGap=" + minGap.toFixed(1));
}
{
    // speed cap holds through box3d (we clamp the target velocity each tick)
    const es = createESBox3D(mockWorld());
    const s = { x: 0, y: 0, heading: 90 };
    es.add(s, stats);
    for (let t = 0; t < 120; t++) es.tick(() => ({ turn: 0, thrust: true }), 1 / 30);
    ok("speed is capped at stats.speed", Math.hypot(s.vx, s.vy) <= stats.speed + 1e-3, "sp=" + Math.hypot(s.vx, s.vy).toFixed(1));
}
{
    // sync writes box3d's post-step state back onto the ES ship object
    const es = createESBox3D(mockWorld());
    const s = { x: 0, y: 0, heading: 90 };
    es.add(s, stats);
    es.tick(() => ({ turn: 0, thrust: true }), 1 / 30);
    ok("ship.x and ship.vx reflect box3d after sync", s.x > 0 && s.vx > 0);
    // determinism: identical scripted runs match
    const run = () => { const e = createESBox3D(mockWorld()); const a = { x: 0, y: 0, heading: 45 }, b = { x: 100, y: 0, heading: 200 }; e.add(a, stats); e.add(b, stats); for (let t = 0; t < 120; t++) e.tick(() => ({ turn: 1, thrust: true }), 1 / 30); return e.stateHash(); };
    ok("identical scripted runs hash identically (lockstep precondition)", run() === run());
}

console.log(`\nes-box3d-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
