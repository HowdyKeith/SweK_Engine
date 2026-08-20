// WebGLEngine/ev/flightModel3d-selfcheck.mjs — v3826 (Long Silence, Round B)
//
// The answer key for "ships leave the plane." Round B is a superset of the 2D flight model, and the one thing
// that must hold for the 2D game and Round A to stay correct is that it REDUCES EXACTLY to the old model at
// pitch 0. That, the 3D facing at cardinals, the speed cap over three axes, the 3D pursuit AI, and the esBox3d
// fly3d wiring (altitude flies, planar mode is byte-for-byte the old behavior) are all pinned here against
// constructed values -- Node-only, against the real flightModel.js and the planar fallback world.

import { forward3d, clampPitch, stepFlight3d, stepAI3d, yawTo, pitchTo, dist3d, MAX_PITCH } from "./flightModel3d.js";
import { headingVector, stepFlight, normDeg } from "./flightModel.js";
import { createESBox3D } from "../physics/esBox3d.js";
import { planarFallbackWorld } from "../physics/planarFallbackWorld.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function ok(c, m) { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } }

// 1) REDUCES TO 2D -- forward3d(h,0) === headingVector(h), alt 0, across the circle. THE load-bearing property.
for (let h = 0; h < 360; h += 11) {
    const f = forward3d(h, 0), hv = headingVector(h);
    ok(near(f.x, hv.x, 1e-12) && near(f.y, hv.y, 1e-12) && f.alt === 0, `forward3d(${h},0) reduces to headingVector`);
}

// 2) 3D FACING AT PITCH -- pitch tilts the nose up/down; the planar part shrinks by cos(pitch), alt = sin(pitch).
{
    const f = forward3d(90, 30);   // yaw 90 faces +x; 30 up
    ok(near(f.x, Math.cos(30 * Math.PI / 180)) && near(f.alt, Math.sin(30 * Math.PI / 180)) && near(f.y, 0), "forward3d(90,30) tilts correctly");
    const up = forward3d(0, 90);   // nose straight up -> pure alt
    ok(near(up.alt, 1) && near(up.x, 0, 1e-9) && near(up.y, 0, 1e-9), "forward3d(_,90) points to +alt");
    ok(clampPitch(200) === MAX_PITCH && clampPitch(-200) === -MAX_PITCH && clampPitch(10) === 10, "clampPitch bounds to +/-MAX_PITCH");
}

// 3) stepFlight3d REDUCES TO stepFlight -- same {x,y,vx,vy,heading} when pitch stays 0 and no pitch input.
{
    const stats = { accel: 40, speed: 300, turn: 90 };
    let a = { x: 0, y: 0, vx: 5, vy: -3, heading: 20 };
    let b = { x: 0, y: 0, alt: 0, vx: 5, vy: -3, valt: 0, heading: 20, pitch: 0 };
    for (let i = 0; i < 40; i++) {
        a = stepFlight(a, { turn: 1, thrust: true }, stats, 1 / 30);
        b = stepFlight3d(b, { turn: 1, pitch: 0, thrust: true }, stats, 1 / 30);
    }
    ok(near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9) && near(a.vx, b.vx, 1e-9) && near(a.vy, b.vy, 1e-9) && near(a.heading, b.heading, 1e-9),
        "stepFlight3d(pitch=0) matches stepFlight");
    ok(b.alt === 0 && b.valt === 0, "no altitude appears without pitch");
}

// 4) SHIPS ACTUALLY CLIMB -- pitch up + thrust raises altitude; pitch down lowers it; 3D speed is still capped.
{
    const stats = { accel: 40, speed: 300, turn: 90, pitchRate: 90 };
    let s = { x: 0, y: 0, alt: 0, vx: 0, vy: 0, valt: 0, heading: 0, pitch: 0 };
    for (let i = 0; i < 60; i++) s = stepFlight3d(s, { turn: 0, pitch: 1, thrust: true }, stats, 1 / 30);
    ok(s.alt > 0 && s.pitch > 0, "pitch-up + thrust gains altitude (" + s.alt.toFixed(1) + ")");
    ok(Math.hypot(s.vx, s.vy, s.valt) <= stats.speed + 1e-6, "3D speed stays capped");
    let d = { x: 0, y: 0, alt: 100, vx: 0, vy: 0, valt: 0, heading: 0, pitch: 0 };
    for (let i = 0; i < 60; i++) d = stepFlight3d(d, { turn: 0, pitch: -1, thrust: true }, stats, 1 / 30);
    ok(d.alt < 100, "pitch-down + thrust loses altitude");
}

// 5) 3D AI -- aims yaw AND pitch at a target above and to the side; fires only when aligned and in range.
{
    const ship = { x: 0, y: 0, alt: 0, heading: 0, pitch: 0 };
    const above = { x: 300, y: 0, alt: 300 };
    ok(pitchTo(ship, above) > 0, "pitchTo a higher target is positive (climb)");
    ok(pitchTo(ship, { x: 300, y: 0, alt: -300 }) < 0, "pitchTo a lower target is negative (dive)");
    const a = stepAI3d(ship, above, { range: 1400, standoff: 140 });
    ok(a.turn !== 0 && a.pitch === 1, "AI turns toward, and pitches UP toward a higher target");
    ok(a.firing === false, "AI holds fire while not yet aligned");
    // aligned + in range -> fire
    const aimed = { x: 0, y: 0, alt: 0, heading: yawTo({ x: 0, y: 0 }, { x: 0, y: -500 }), pitch: 0 };
    const fired = stepAI3d(aimed, { x: 0, y: -500, alt: 0 }, { range: 1400, standoff: 140 });
    ok(fired.firing === true && fired.turn === 0 && fired.pitch === 0, "AI fires when aligned and in range");
    ok(near(dist3d({ x: 0, y: 0, alt: 0 }, { x: 3, y: 4, alt: 12 }), 13), "dist3d is the full 3D distance");
}

// 6) esBox3d fly3d: ALTITUDE FLIES, PLANAR MODE IS UNCHANGED. Same inputs, two worlds.
{
    const stats = { accel: 60, speed: 300, turn: 90, pitchRate: 90 };
    // planar (default) -- altitude must never move, exactly as before Round B
    const p = createESBox3D(planarFallbackWorld(), {});
    const ps = { x: 0, y: 0, heading: 0 }; const prec = p.add(ps, stats);
    for (let i = 0; i < 30; i++) { p.driveShip(prec, { turn: 0, pitch: 1, thrust: true }, 1 / 30); p.step(1 / 30); p.sync(); }
    ok((ps.alt || 0) === 0 && p.fly3d === false, "planar mode: pitch input ignored, altitude stays 0");
    ok(Math.abs(ps.y) < 1e-6 && ps.x !== 0 ? false : true, "planar mode drives the plane");   // sanity: moved in-plane

    // fly3d -- same pitch-up thrust must gain altitude; x-z still handled by the (planar) world
    const w = createESBox3D(planarFallbackWorld(), { fly3d: true });
    const s = { x: 0, y: 0, heading: 0 }; const rec = w.add(s, stats);
    for (let i = 0; i < 30; i++) { w.driveShip(rec, { turn: 0, pitch: 1, thrust: true }, 1 / 30); w.step(1 / 30); w.sync(); }
    ok(w.fly3d === true && s.alt > 0 && s.pitch > 0, "fly3d mode: altitude climbs (" + (s.alt || 0).toFixed(1) + ")");
}

if (fail) { console.error(`\nflightModel3d-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`flightModel3d-selfcheck: all ${pass} pass`);
