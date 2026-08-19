// fx/showcase/livingBox.js -- a self-running "art of life" scene, not a game. Matter is pulled into a BLACK HOLE
// (softened gravity + accretion swirl), consumed at the horizon and respawned at the box edge so it never empties.
// A little ship is flown by an EVADE brain: a reactive flee-policy that steers away from the hole and nearby debris
// and back toward the box -- it never dies, it just evades forever. The physics + evade are pure and verifiable; on
// a rig the actual GPU Brain can supply the steering in place of evadeSteer (same in/out: threats -> a heading).
"use strict";

function _rnd(s) { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function makeDebris(n, R, seed) { const r = _rnd(seed || 7), a = []; for (let i = 0; i < n; i++) a.push({ x: (r() * 2 - 1) * R, y: (r() * 2 - 1) * R, z: (r() * 2 - 1) * R, vx: (r() * 2 - 1) * 0.1, vy: (r() * 2 - 1) * 0.1, vz: (r() * 2 - 1) * 0.1, seed: r() }); return a; }
function _respawn(p, R, r) { const s = r(); const th = s * 6.2831853, ph = r() * 3.14159; p.x = Math.cos(th) * Math.sin(ph) * R; p.y = Math.cos(ph) * R; p.z = Math.sin(th) * Math.sin(ph) * R; p.vx = -p.x * 0.05; p.vy = -p.y * 0.05; p.vz = -p.z * 0.05; }

function stepBlackHole(debris, hole, R, dt, rng) {
    const r = rng || Math.random; let consumed = 0;
    for (const p of debris) {
        const dx = hole.x - p.x, dy = hole.y - p.y, dz = hole.z - p.z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) + 1e-4;
        const g = hole.mass / (d2 + hole.soft);                    // softened gravity
        p.vx += (dx / d) * g * dt - (dy / d) * hole.swirl * dt;      // pull + tangential accretion swirl
        p.vy += (dy / d) * g * dt + (dx / d) * hole.swirl * dt;
        p.vz += (dz / d) * g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (d < hole.horizon) { _respawn(p, R, r); consumed++; }     // eaten -> reborn at the edge
        else if (Math.abs(p.x) > R * 1.3 || Math.abs(p.y) > R * 1.3 || Math.abs(p.z) > R * 1.3) _respawn(p, R, r);
    }
    return consumed;
}

// evade brain: flee the hole (hard) and nearby debris, and steer back toward center near the walls. Returns a unit heading.
function evadeSteer(ship, hole, debris, R) {
    let fx = 0, fy = 0, fz = 0;
    const hx = ship.x - hole.x, hy = ship.y - hole.y, hz = ship.z - hole.z, hd = Math.hypot(hx, hy, hz) + 0.05;
    const hw = hole.danger / (hd * hd); fx += (hx / hd) * hw; fy += (hy / hd) * hw; fz += (hz / hd) * hw;   // inverse-square flee from the hole
    for (const p of debris) { const dx = ship.x - p.x, dy = ship.y - p.y, dz = ship.z - p.z, d = Math.hypot(dx, dy, dz); if (d < 0.45) { const w = (0.45 - d) / (d + 0.05); fx += dx * w; fy += dy * w; fz += dz * w; } }
    const cd = Math.hypot(ship.x, ship.y, ship.z); if (cd > R * 0.85) { fx += -ship.x / cd * (cd - R * 0.85) * 4; fy += -ship.y / cd * (cd - R * 0.85) * 4; fz += -ship.z / cd * (cd - R * 0.85) * 4; }   // stay in the box
    const L = Math.hypot(fx, fy, fz) || 1; return [fx / L, fy / L, fz / L];
}
function stepShip(ship, dir, dt, opts = {}) {
    const accel = opts.accel || 3.0, maxV = opts.maxV || 1.4, drag = opts.drag == null ? 0.9 : opts.drag;
    ship.vx = (ship.vx + dir[0] * accel * dt) * drag; ship.vy = (ship.vy + dir[1] * accel * dt) * drag; ship.vz = (ship.vz + dir[2] * accel * dt) * drag;
    const v = Math.hypot(ship.vx, ship.vy, ship.vz); if (v > maxV) { const k = maxV / v; ship.vx *= k; ship.vy *= k; ship.vz *= k; }
    ship.x += ship.vx * dt; ship.y += ship.vy * dt; ship.z += ship.vz * dt; ship.heading = Math.atan2(ship.vy, ship.vx);
}

export { makeDebris, stepBlackHole, evadeSteer, stepShip };
if (typeof module !== "undefined" && module.exports) module.exports = { makeDebris, stepBlackHole, evadeSteer, stepShip };
