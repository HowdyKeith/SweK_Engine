// WebGLEngine/physics/kaiju-box3d-selfcheck.mjs — v2257
//
// Proves the kaiju<->box3d bridge WITHOUT the WASM: a deterministic mock world (boxes fall under gravity and
// settle on the ground) stands in for box3d, so we can verify the parts that are the bridge's job -- correct
// body indexing, transform slicing, static bodies being skipped, dynamic bodies being written back, and the
// step->sync loop settling. The real WASM settle/determinism run lives in physics/box3d-smoke.mjs (rig-gated).
//
//   run: node physics/kaiju-box3d-selfcheck.mjs

import { createKaijuBox3D } from "./kaijuBox3d.js";

// deterministic stand-in for a box3d world handle: gravity + a ground plane at y=0, now with velocity,
// spin, kinematic drive, and runtime type change so the v2258 interaction verbs are observable.
function mockWorld() {
    const bs = [];   // { kind, pos:[x,y,z], vel:[vx,vy,vz], spin }
    const g = (i) => bs[i];
    return {
        addBox({ type, pos }) { bs.push({ kind: type, pos: pos.slice(), vel: [0, 0, 0], spin: 0 }); return bs.length - 1; },
        step(dt) {
            for (const b of bs) {
                if (b.kind !== "dynamic") continue;                 // static + kinematic don't fall under gravity
                b.vel[1] -= 9.8 * dt;
                b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt;
                if (b.pos[1] <= 0) { b.pos[1] = 0; b.vel[1] = 0; }  // hit ground -> settle vertical
            }
        },
        bodyCount() { return bs.length; },
        readTransforms() {
            const a = new Float32Array(bs.length * 7);
            for (let i = 0; i < bs.length; i++) { const o = i * 7, b = bs[i]; a[o] = b.pos[0]; a[o + 1] = b.pos[1]; a[o + 2] = b.pos[2]; a[o + 3] = Math.min(b.spin, 1); a[o + 6] = 1; }
            return a;
        },
        stateHash() { let h = 2166136261 >>> 0; for (const b of bs) for (const v of [b.pos[0], b.pos[1], b.pos[2], b.spin]) { h = (h ^ ((Math.round(v * 1000)) >>> 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; },
        impulse(i, v) { g(i).vel[0] += v[0]; g(i).vel[1] += v[1]; g(i).vel[2] += v[2]; },
        angularImpulse(i, v) { g(i).spin += Math.hypot(v[0], v[1], v[2]); },
        setVelocity(i, v) { g(i).vel = v.slice(); },
        setTransform(i, p) { g(i).pos = p.slice(); },
        setType(i, type) { g(i).kind = type; },
    };
}

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("kaiju-box3d-selfcheck");
{
    const rb = createKaijuBox3D(mockWorld());
    const ground = { pos: [0, -0.5, 0], half: [50, 0.5, 50], _got: null, apply(p, q) { this._got = { p, q }; } };
    rb.addStatic(ground);
    // three dynamic crates at distinct x, dropped from distinct heights
    const crates = [[-3, 5, 0], [0, 7, 0], [3, 6, 0]].map((pos) => ({ pos, half: [0.5, 0.5, 0.5], _got: null, apply(p, q) { this._got = { p, q }; } }));
    crates.forEach((c) => rb.addDynamic(c));

    ok("registers all four bodies", rb.count() === 4);
    ok("counts three dynamic, one static", rb.dynamicCount() === 3);

    const y0 = crates.map((c) => c.pos[1]);
    for (let t = 0; t < 20; t++) rb.stepAndSync(1 / 60, 4);   // a few frames: they should be falling
    ok("dynamic crates moved DOWN after stepping", crates.every((c, i) => c._got && c._got.p[1] < y0[i]), crates.map((c) => c._got && c._got.p[1].toFixed(2)).join(","));
    ok("the static ground was never written back", ground._got === null);

    // slice correctness: each crate must get ITS OWN x back, not a neighbor's
    ok("each body's transform maps to the right object", crates.every((c) => c._got && Math.abs(c._got.p[0] - c.pos[0]) < 1e-4));
    ok("quaternion is carried through (w=1 from the mock)", crates[0]._got.q[3] === 1);

    // settle: keep stepping until the hash stops changing, then confirm it holds
    let prev = rb.stateHash(), stableFor = 0;
    for (let t = 0; t < 600 && stableFor < 30; t++) { rb.stepAndSync(1 / 60, 4); const h = rb.stateHash(); if (h === prev) stableFor++; else { stableFor = 0; prev = h; } }
    ok("the pile settles (stateHash stops changing)", stableFor >= 30);
    ok("settled crates rest at the ground plane", crates.every((c) => Math.abs(c._got.p[1]) < 1e-6));
    const settledHash = rb.stateHash();
    for (let t = 0; t < 60; t++) rb.stepAndSync(1 / 60, 4);
    ok("stateHash is stable once settled", rb.stateHash() === settledHash);
}
{
    // determinism harness: two identical scripted runs must produce the same final hash
    const run = () => { const rb = createKaijuBox3D(mockWorld()); rb.addStatic({ pos: [0, -0.5, 0], half: [20, 0.5, 20] }); for (let i = 0; i < 12; i++) rb.addDynamic({ pos: [(i % 4) - 1.5, 2 + i * 0.6, 0], half: [0.4, 0.4, 0.4] }); for (let t = 0; t < 300; t++) rb.step(1 / 60, 4); return rb.stateHash(); };
    ok("identical scripted runs hash identically (lockstep precondition)", run() === run());
}

console.log("kaiju-box3d-selfcheck: the kaiju CAUSES the physics (v2258 verbs)");
{
    const rb = createKaijuBox3D(mockWorld());
    // impulse: a kick sends a resting crate sideways
    const crate = { pos: [0, 0, 0], half: [0.5, 0.5, 0.5], _got: null, apply(p, q) { this._got = { p, q }; } };
    const cr = rb.addDynamic(crate);
    rb.impulse(cr, [8, 0, 0]);
    for (let t = 0; t < 10; t++) rb.stepAndSync(1 / 60, 4);
    ok("impulse sends a body sideways", crate._got.p[0] > 0.1, "x=" + crate._got.p[0].toFixed(2));

    // throwObject: launch with velocity + spin -> it travels AND tumbles
    const car = { pos: [0, 5, 0], half: [0.6, 0.4, 0.9], _got: null, apply(p, q) { this._got = { p, q }; } };
    const carRec = rb.throwObject(car, { velocity: [12, 2, 0], spin: [0, 6, 0] });
    for (let t = 0; t < 15; t++) rb.stepAndSync(1 / 60, 4);
    ok("thrown object travels downrange", car._got.p[0] > 1, "x=" + car._got.p[0].toFixed(2));
    ok("thrown object is tumbling (quat left identity)", car._got.q[0] > 0);
    ok("throwObject registered a dynamic body", carRec.kind === "dynamic");

    // kinematic: an AI-driven collider is NOT synced back (we drive it), and counts as kinematic
    const kaiju = { pos: [0, 1, 0], _got: null, apply(p, q) { this._got = { p, q }; } };
    const krec = rb.addKinematic(kaiju);
    rb.driveKinematic(krec, [3, 1, 0], [0, 0, 0, 1]);
    rb.stepAndSync(1 / 60, 4);
    ok("kinematic collider is driven, not synced back", kaiju._got === null);
    ok("kinematic body is counted as kinematic", rb.kinematicCount() === 1);

    // setType: a static wall becomes dynamic debris -> now it falls and syncs
    const wall = { pos: [0, 3, 0], half: [1, 2, 0.3], _got: null, apply(p, q) { this._got = { p, q }; } };
    const wrec = rb.addStatic(wall);
    rb.stepAndSync(1 / 60, 4);
    ok("a static wall does not move or sync", wall._got === null);
    rb.setType(wrec, "dynamic");
    for (let t = 0; t < 10; t++) rb.stepAndSync(1 / 60, 4);
    ok("after setType(dynamic) the wall falls and syncs", wall._got && wall._got.p[1] < 3);
    ok("setType updated the record's kind", wrec.kind === "dynamic");
}

console.log(`\nkaiju-box3d-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
