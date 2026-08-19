// WebGLEngine/physics/kaiju-box3d-scene-selfcheck.mjs — v2259
//   run: node physics/kaiju-box3d-scene-selfcheck.mjs

import { createKaijuBox3DScene } from "./kaijuBox3dScene.js";

// same deterministic stand-in as the bridge selfcheck: gravity + ground, with velocity/spin/type/drive.
function mockWorld() {
    const bs = [];
    const g = (i) => bs[i];
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

console.log("kaiju-box3d-scene-selfcheck");
{
    const scene = createKaijuBox3DScene(mockWorld(), { groundHalf: 200 });
    const blds = [{ x: 0, z: 0, w: 4, d: 4, h: 10 }, { x: 20, z: 0, w: 4, d: 4, h: 8 }, { x: 40, z: 0, w: 4, d: 4, h: 12 }];
    scene.addBuildings(blds);
    ok("three buildings register standing", scene.buildingCount() === 3 && scene.standingCount() === 3 && scene.activeCount() === 0);

    for (let t = 0; t < 5; t++) scene.step();
    ok("standing buildings do not move (nothing to render dynamically yet)", scene.activeBodies().length === 0);

    scene.driveKaiju([10, 8, 0]);   // must not throw; kaiju collider is kinematic
    ok("driving the kaiju collider is a no-op on the render list", scene.activeBodies().length === 0);

    scene.topple(blds[0], [40, 0, 0]);
    ok("toppling wakes ONE building to dynamic", scene.standingCount() === 2 && scene.activeCount() === 1);
    for (let t = 0; t < 12; t++) scene.step();
    const toppled = scene.activeBodies().find((e) => e.kind === "building");
    ok("a toppled building falls (y dropped below its standing center)", toppled && toppled.pos[1] < 5, "y=" + (toppled && toppled.pos[1].toFixed(2)));
    ok("the impulse pushed it sideways too", toppled && toppled.pos[0] > 0.1);

    scene.spawnDebris([20, 5, 0], 6, { spread: 8 });
    ok("debris adds six dynamic chunks", scene.activeCount() === 7);
    for (let t = 0; t < 12; t++) scene.step();
    ok("debris scattered off the spawn point", scene.activeBodies().some((e) => e.kind === "debris" && Math.abs(e.pos[0] - 20) > 0.2));

    const prop = scene.throwProp([0, 10, 0], [20, 2, 0], [0, 6, 0]);
    for (let t = 0; t < 12; t++) scene.step();
    ok("a thrown prop travels downrange", prop.pos[0] > 1, "x=" + prop.pos[0].toFixed(2));
    ok("a thrown prop tumbles", prop.quat[0] > 0);

    ok("still two buildings standing (drawn by kaiju's own renderer)", scene.standingCount() === 2);
    ok("activeBodies carries exactly the dynamic things (1 building + 6 debris + 1 prop)", scene.activeBodies().length === 8);
}
{
    // determinism: identical scripted destruction hashes identically
    const run = () => { const s = createKaijuBox3DScene(mockWorld()); const bl = []; for (let i = 0; i < 6; i++) bl.push({ x: i * 6, z: 0, w: 4, d: 4, h: 8 }); s.addBuildings(bl); s.toppleAll([10, 0, 0]); for (let t = 0; t < 200; t++) s.step(); return s.stateHash(); };
    ok("identical scripted destruction hashes identically", run() === run());
}

console.log(`\nkaiju-box3d-scene-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
