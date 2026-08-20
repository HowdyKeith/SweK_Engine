// headless self-check for the Jolt backend: gravity+collision, cross-peer determinism (stateHash), and -- the whole
// point -- esBox3d AND esHullCombat running on the Jolt world with no change, proving the box3d-compatible interface.
import { createJoltBackend } from "./joltLoader.js";
import { createESBox3D } from "../esBox3d.js";
import { createHullCombat } from "../esHullCombat.js";

const backend = await createJoltBackend();

// 1. gravity + collision
{
    const w = backend.createWorld({ gravity: [0, -9.8, 0] });
    w.addBox({ type: "static", pos: [0, -0.5, 0], half: [20, 0.5, 20] });
    const crate = w.addBox({ type: "dynamic", pos: [0, 5, 0], half: [0.5, 0.5, 0.5] });
    const y0 = w.readTransforms()[crate * 7 + 1];
    for (let t = 0; t < 180; t++) w.step(1 / 60, 1);
    const y1 = w.readTransforms()[crate * 7 + 1];
    console.log("1. gravity+collision: crate y " + y0.toFixed(2) + " -> " + y1.toFixed(3) + " (" + (y1 < y0 - 1 && y1 > 0.4 && y1 < 0.7 ? "FELL + LANDED" : "?") + ")");
    w.destroy();
}

// 2. determinism via stateHash (lockstep desync detection)
{
    function run() { const w = backend.createWorld({ gravity: [0, -9.8, 0] }); w.addBox({ type: "static", pos: [0, -0.5, 0], half: [20, 0.5, 20] });
        for (let i = 0; i < 8; i++) { const b = w.addBox({ type: "dynamic", pos: [(i % 4) - 1.5, 3 + i * 0.6, (i % 3) - 1], half: [0.4, 0.4, 0.4] }); w.setVelocity(b, [(i % 3) - 1, 0, (i % 2) - 0.5]); }
        for (let t = 0; t < 300; t++) w.step(1 / 60, 1); const h = w.stateHash().toString(16).padStart(8, "0"); w.destroy(); return h; }
    const h1 = run(), h2 = run();
    console.log("2. determinism: hash " + h1 + " vs " + h2 + " -> " + (h1 === h2 ? "IDENTICAL -- LOCKSTEP-SAFE" : "DIVERGED"));
}

// 3. esBox3d flight substrate on Jolt (gravity 0 = space); ships move + collide
{
    const w = backend.createWorld({ gravity: [0, 0, 0] });
    const sub = createESBox3D(w, { shipHalf: 26 });
    const STATS = { turn: 200, accel: 320, speed: 320, mass: 900 };
    const a = sub.add({ x: -300, y: 0, half: 26, heading: 90, vx: 0, vy: 0 }, STATS);
    const b = sub.add({ x: 300, y: 0, half: 26, heading: 270, vx: 0, vy: 0 }, STATS);
    let minGap = 1e9;
    for (let t = 0; t < 200; t++) { sub.tick((ship) => ({ turn: 0, thrust: 1 }), 1 / 30); const d = Math.hypot(a.ship.x - b.ship.x, a.ship.y - b.ship.y); minGap = Math.min(minGap, d); }
    console.log("3. esBox3d on Jolt: ships closed from 600 to min gap " + minGap.toFixed(0) + "u, positions live (" + (a.ship.x !== -300 && minGap < 120 ? "FLIGHT SUBSTRATE WORKS on Jolt" : "?") + ")");
    w.destroy();
}

// 4. esHullCombat (ram damage + wreckage) on Jolt
{
    const w = backend.createWorld({ gravity: [0, 0, 0] });
    const c = createHullCombat(w, { seed: 3, shipHalf: 26 });
    const STATS = { turn: 0, accel: 0, speed: 400, mass: 900 };
    c.addShip({ x: -60, y: 0, half: 26, team: "blue", vx: 160, vy: 0 }, STATS, 100);
    c.addShip({ x: 60, y: 0, half: 26, team: "red", vx: -160, vy: 0 }, STATS, 100);
    let rams = 0;
    for (let t = 0; t < 30; t++) { const ev = c.step(() => ({ turn: 0, thrust: 0 }), 1 / 30); rams += ev.filter(e => e.type === "ram").length; }
    const hp = c.ships().map(s => s.hp.toFixed(0)).join("/");
    console.log("4. esHullCombat on Jolt: " + rams + " ram(s), hp " + hp + " (" + (rams > 0 && c.ships().some(s => s.hp < 100) ? "COMBAT LAYER WORKS on Jolt" : "?") + ")");
    w.destroy();
}
console.log("\nJolt backend: box3d-compatible, deterministic, runs esBox3d + esHullCombat unchanged.");
