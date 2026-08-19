// WebGLEngine/physics/box3dSyncScenario.js — v2272
//
// A FIXED, deterministic box3d scenario every machine runs identically, so two peers can prove their box3d
// worlds evolve bit-for-bit the same -- the precondition for lockstep. Everything here is a pure function of
// the tick and the ship index (no clock, no RNG, no input), so the only variable is the physics runtime. Run
// it over the real WASM world on the Mac and on the PC: equal finalHash == the two "boots" are synchronized
// and cross-peer lockstep is safe; different == the WASM diverges across platforms and you must fall back to
// owner-authoritative. The same scenario over the JS fallback is deterministic too (used in the selfcheck).

import { createESBox3D } from "./esBox3d.js";

export function runSyncScenario(world, ticks = 600) {
    const es = createESBox3D(world, { shipHalf: 40 });
    const ships = [];
    for (let i = 0; i < 8; i++) {
        const s = { id: "S" + i, x: -420 + i * 120, y: (i % 3) * 90 - 90, heading: (i * 45) % 360 };
        s._bx = es.add(s, { turn: 90, accel: 200, speed: 300 });
        ships.push(s);
    }
    const checkpoints = [];
    for (let t = 0; t < ticks; t++) {
        for (let i = 0; i < ships.length; i++) {
            es.driveShip(ships[i]._bx, { turn: ((t + i) % 3) - 1, thrust: (t % 3) !== 0 }, 1 / 30);
        }
        es.step(1 / 30); es.sync();
        if ((t + 1) % 150 === 0) checkpoints.push(es.stateHash() >>> 0);
    }
    return { finalHash: es.stateHash() >>> 0, checkpoints, ticks, ships: ships.length };
}

if (typeof module !== "undefined" && module.exports) module.exports = { runSyncScenario };
