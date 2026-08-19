// WebGLEngine/physics/box3d-net-selfcheck.mjs — v2260
//   run: node physics/box3d-net-selfcheck.mjs

import { createKaijuBox3DScene } from "./kaijuBox3dScene.js";
import { packBodies, applyBodies, lockstepStatus } from "./box3dNet.js";

function mockWorld() {
    const bs = []; const g = (i) => bs[i];
    return {
        addBox({ type, pos }) { bs.push({ kind: type, pos: pos.slice(), vel: [0, 0, 0], spin: 0 }); return bs.length - 1; },
        step(dt) { for (const b of bs) { if (b.kind !== "dynamic") continue; b.vel[1] -= 9.8 * dt; b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt; if (b.pos[1] <= 0) { b.pos[1] = 0; b.vel[1] = 0; } } },
        bodyCount() { return bs.length; },
        readTransforms() { const a = new Float32Array(bs.length * 7); for (let i = 0; i < bs.length; i++) { const o = i * 7, b = bs[i]; a[o] = b.pos[0]; a[o + 1] = b.pos[1]; a[o + 2] = b.pos[2]; a[o + 3] = Math.min(b.spin, 1); a[o + 6] = 1; } return a; },
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

console.log("box3d-net-selfcheck: owner-authoritative pack/apply + lockstep hash");
{
    // OWNER scene: topple a couple buildings, spawn debris, throw a prop, step a bit.
    const owner = createKaijuBox3DScene(mockWorld());
    const blds = [{ x: 0, z: 0, w: 4, d: 4, h: 10 }, { x: 20, z: 0, w: 4, d: 4, h: 8 }];
    owner.addBuildings(blds);
    owner.topple(blds[0], [40, 0, 0]);
    owner.spawnDebris([20, 5, 0], 4);
    owner.throwProp([0, 8, 0], [15, 2, 0], [0, 5, 0]);
    for (let t = 0; t < 8; t++) owner.step();

    const pkt = packBodies(owner, { nowMs: 5000 });
    ok("packet carries every dynamic body (1 building + 4 debris + 1 prop)", pkt.n === 6, "n=" + pkt.n);
    ok("packet carries the owner's state hash", typeof pkt.hash === "number");
    ok("packet survives JSON (transport is bytes)", JSON.parse(JSON.stringify(pkt)).n === 6);

    // RECEIVER: apply into a ghost store and confirm the transforms match the owner's.
    const wire = JSON.parse(JSON.stringify(pkt));
    const store = applyBodies(new Map(), wire);
    ok("receiver store has one ghost per body", store.size === 6);
    const ownerActive = owner.activeBodies();
    const g0 = store.get(0);
    ok("a ghost's position matches the owner (rounded)", Math.abs(g0.pos[0] - ownerActive[0].pos[0]) < 0.01 && Math.abs(g0.pos[1] - ownerActive[0].pos[1]) < 0.01);
    ok("kind survives the wire (building/debris/prop)", store.get(0).kind === "building" && [...store.values()].some((v) => v.kind === "debris") && [...store.values()].some((v) => v.kind === "prop"));

    // subsequent frames update in place (append-only ids are stable)
    for (let t = 0; t < 6; t++) owner.step();
    applyBodies(store, packBodies(owner, { nowMs: 6000 }));
    ok("re-applying keeps the same body count (stable ids)", store.size === 6);
    ok("a ghost tracked the owner after more steps", Math.abs(store.get(0).pos[1] - owner.activeBodies()[0].pos[1]) < 0.01);
}
{
    // LOCKSTEP: two scenes stepping identical inputs must agree; a different input diverges.
    const build = (impulse) => { const s = createKaijuBox3DScene(mockWorld()); const b = [{ x: 0, z: 0, w: 4, d: 4, h: 10 }]; s.addBuildings(b); s.topple(b[0], impulse); for (let t = 0; t < 100; t++) s.step(); return s.stateHash(); };
    ok("identical inputs -> hashes match (in sync)", lockstepStatus(build([10, 0, 0]), build([10, 0, 0])).match === true);
    ok("different inputs -> hashes differ (desync caught)", lockstepStatus(build([10, 0, 0]), build([40, 0, 5])).match === false);
    const s = lockstepStatus(0x1234abcd, 0x1234abcd);
    ok("lockstepStatus reports hex hashes", s.local === "1234abcd" && s.match);
}

console.log(`\nbox3d-net-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
