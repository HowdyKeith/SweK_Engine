// headless self-check for esHullCombat: ram damage, wreckage on death, asteroid impacts, and determinism.
import { createHullCombat } from "./esHullCombat.js";

// minimal collision-free mock world (integrates pos += vel*dt); the combat layer detects impacts analytically.
function mockWorld() {
    const bs = [];
    return {
        addShip({ x, z, half }) { bs.push({ half: half || 30, pos: [x, 0, z], vel: [0, 0, 0], spin: 0 }); return bs.length - 1; },
        setVelocity(i, v) { bs[i].vel = v.slice(); },
        angularImpulse(i, v) { bs[i].spin += v[1]; },
        readTransforms() { const a = new Float32Array(bs.length * 7); for (let i = 0; i < bs.length; i++) { const o = i * 7; a[o] = bs[i].pos[0]; a[o + 1] = bs[i].pos[1]; a[o + 2] = bs[i].pos[2]; a[o + 6] = 1; } return a; },
        readVelocities() { const a = new Float32Array(bs.length * 3); for (let i = 0; i < bs.length; i++) { const o = i * 3; a[o] = bs[i].vel[0]; a[o + 1] = bs[i].vel[1]; a[o + 2] = bs[i].vel[2]; } return a; },
        step(dt) {
            for (const b of bs) { b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt; }
            // resolve overlaps like a real backend (separate + exchange normal velocity) so a ram shows up as a dv
            for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
                const a = bs[i], b = bs[j]; const dx = b.pos[0] - a.pos[0], dz = b.pos[2] - a.pos[2]; let d = Math.hypot(dx, dz); const rr = a.half + b.half;
                if (d > 0 && d < rr) { const nx = dx / d, nz = dz / d, ov = (rr - d) * 0.5; a.pos[0] -= nx * ov; a.pos[2] -= nz * ov; b.pos[0] += nx * ov; b.pos[2] += nz * ov;
                    const rel = (b.vel[0] - a.vel[0]) * nx + (b.vel[2] - a.vel[2]) * nz; if (rel < 0) { a.vel[0] += nx * rel; a.vel[2] += nz * rel; b.vel[0] -= nx * rel; b.vel[2] -= nz * rel; } }
            }
        },
        stateHash() { let h = 0; for (const b of bs) h = (h * 31 + Math.round(b.pos[0]) + Math.round(b.pos[2])) | 0; return h; },
    };
}
const STATS = { turn: 0, accel: 0, speed: 400, mass: 900 };

// --- test 1: head-on ram damages both ships ---
{
    const w = mockWorld(); const c = createHullCombat(w, { seed: 42 });
    const A = c.addShip({ x: 0, y: 0, half: 30, vx: 120, vy: 0, heading: 0 }, STATS, 100);
    const B = c.addShip({ x: 50, y: 0, half: 30, vx: -120, vy: 0, heading: 180 }, STATS, 100);
    // no thrust; keep their approach velocities and let them close
    for (let t = 0; t < 5; t++) c.step((ship, rec) => ({ turn: 0, thrust: 0 }), 1 / 30);
    const s = c.ships();
    console.log("ram: A hp " + s[0].hp.toFixed(1) + ", B hp " + s[1].hp.toFixed(1) + " -> " + (s[0].hp < 100 && s[1].hp < 100 ? "BOTH DAMAGED" : "no damage"));
}

// --- test 2: lethal ram bursts into tumbling debris ---
{
    const w = mockWorld(); const c = createHullCombat(w, { seed: 7, debrisCount: 5 });
    c.addShip({ x: 0, y: 0, half: 30, vx: 300, vy: 0 }, STATS, 8);       // fragile
    c.addShip({ x: 45, y: 0, half: 30, vx: -300, vy: 0 }, STATS, 100);   // heavy hitter
    let deaths = 0;
    for (let t = 0; t < 6; t++) { const ev = c.step(() => ({ turn: 0, thrust: 0 }), 1 / 30); deaths += ev.filter((e) => e.type === "death").length; }
    const deb = c.debris();
    console.log("death: " + deaths + " ship(s) destroyed, " + deb.length + " debris chunks spawned, tumbling spins " + (deb.every((d) => d.spin !== 0) ? "present" : "MISSING"));
}

// --- test 3: ship rams a static asteroid ---
{
    const w = mockWorld(); const c = createHullCombat(w, { seed: 1 });
    c.addShip({ x: 0, y: 0, half: 30, vx: 200, vy: 0 }, STATS, 100);
    c.addAsteroid(70, 0, 55);
    for (let t = 0; t < 4; t++) c.step(() => ({ turn: 0, thrust: 0 }), 1 / 30);
    console.log("asteroid: ship hp " + c.ships()[0].hp.toFixed(1) + " -> " + (c.ships()[0].hp < 100 ? "DAMAGED by asteroid" : "no damage"));
}

// --- test 4: determinism (same seed => identical HP + debris), the lockstep co-op requirement ---
{
    function run(seed) {
        const w = mockWorld(); const c = createHullCombat(w, { seed, debrisCount: 6 });
        c.addShip({ x: 0, y: 0, half: 30, vx: 260, vy: 20 }, STATS, 6);
        c.addShip({ x: 48, y: 5, half: 30, vx: -260, vy: -20 }, STATS, 100);
        for (let t = 0; t < 8; t++) c.step(() => ({ turn: 0, thrust: 0 }), 1 / 30);
        return { hp: c.ships().map((s) => s.hp.toFixed(3)).join(","), deb: c.debris().map((d) => d.x.toFixed(2) + ":" + d.y.toFixed(2) + ":" + d.spin.toFixed(3)).join("|") };
    }
    const r1 = run(999), r2 = run(999), r3 = run(1000);
    const same = r1.hp === r2.hp && r1.deb === r2.deb;
    const diff = r1.deb !== r3.deb;
    console.log("determinism: seed 999 twice identical=" + same + " (hp+debris), seed 1000 differs=" + diff + " -> " + (same && diff ? "LOCKSTEP-SAFE" : "CHECK"));
}
