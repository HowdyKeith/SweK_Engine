// WebGLEngine/physics/mechanics/surfaceShip-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/surfaceShip-selfcheck.mjs      (a second; pure)
//
// THE SURFACE SHIP, HELD (physics/mechanics/surfaceShip.mjs; Keith, 2026-11-28: "then sub vs ship").
//   1  THE CLASSES   every class slower than the torpedo (the arena's scale), more hit points than a boat, louder than a boat by its slExtra
//   2  THE HULL      a held course runs straight at its speed; a turn is never faster than speed / turn radius; a full turn traces a circle of the class's radius; speed changes
//                    at `accel` and stops at the class's top
//   3  THE TARGET    three keel points, the middle first, 0.35 of the length fore and aft along the heading, at 70% of the draft but never above 3.5 m (the torpedo's ceiling
//                    plus half a metre), each with the ship's id, heading, speed and source level
//   4  THE TORPEDO   physics/mechanics/subTorpedo.mjs, unchanged, launched at each class held steady, homes and HITS -- the corvette too (its keel points once drew torpedoes
//                    through their ceiling); and one fired to pass under the bow fuses on the bow point
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as SH from "./surfaceShip.mjs";
import * as Tp from "./subTorpedo.mjs";
import * as K from "./subSonar.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("surfaceShip-selfcheck -- a ship on the surface for the sub arena\n");
const C = SH.SHIP_CLASSES, names = Object.keys(C);

console.log("1. THE CLASSES");
ok("!! every class slower than the torpedo's cruise, with more hit points than a boat and a positive length, beam and draft", names.every((k) => C[k].maxSpeed < Tp.TORPEDO.cruise && C[k].hp > 100 && C[k].length > 0 && C[k].beam > 0 && C[k].draft > 0), names.map((k) => `${k} ${C[k].maxSpeed} m/s`).join(", "));
const s0 = SH.createShip({ cls: "destroyer", speed: 3 });
ok("!! a ship is louder than a boat at the same speed by its class's slExtra, and so is heard further", Math.abs(SH.sourceLevelOf(s0) - K.sourceLevel(3) - C.destroyer.slExtra) < 1e-9 && K.passiveRange(SH.sourceLevelOf(s0), 2) > K.passiveRange(K.sourceLevel(3), 2));
let refused = false; try { SH.createShip({ cls: "battleship" }); } catch { refused = true; }
ok("!! an unknown class is refused", refused);

console.log("2. THE HULL");
{
    let s = SH.createShip({ cls: "freighter", heading: 0.4, speed: 2 }); for (let i = 0; i < 300; i++) s = SH.stepShip(s, { heading: 0.4, speed: 2 });
    const f = SH.forwardOf(0.4), d = 2 * 300 * SH.DT;
    ok("!! a held course runs straight at its speed (10 s at 2 m/s: 20 m along the heading)", Math.abs(s.pos[0] - f[0] * d) < 1e-6 && Math.abs(s.pos[1] - f[1] * d) < 1e-6, s.pos.map((v) => v.toFixed(3)).join(", "));
    // the arena's own convention, not this module's word for it: a torpedo launched on a heading moves where forwardOf says a ship on that heading moves
    const conv = [0.4, 1.9, -2.6].every((hd) => { let tp = Tp.launch(1, { pos: [0, 0, -20], heading: hd, pitch: 0 }); const p0 = tp.pos; tp = Tp.stepTorpedo(tp, [], { seeker: false }).torpedo; const d = [tp.pos[0] - p0[0], tp.pos[1] - p0[1]], l = Math.hypot(...d), f = SH.forwardOf(hd); return Math.abs(d[0] / l - f[0]) < 1e-6 && Math.abs(d[1] / l - f[1]) < 1e-6; });
    ok("!! THE SHIP STEERS IN THE ARENA'S CONVENTION: on any heading it moves where physics/mechanics/subTorpedo.mjs's torpedo on that heading moves", conv);
    let t = SH.createShip({ cls: "corvette", heading: 0, speed: 4 }), worst = 0; for (let i = 0; i < 60; i++) { const n = SH.stepShip(t, { heading: 3, speed: 4 }); worst = Math.max(worst, Math.abs(n.heading - t.heading) / SH.DT / SH.turnRateOf("corvette", t.speed)); t = n; }
    ok("!! a turn is never faster than speed / turn radius (the rudder's limit)", worst <= 1 + 1e-9, `at most ${worst.toFixed(4)} of the limit`);
    // exactly two laps (2 x 2 pi R / v), sampled evenly: a part lap would pull the samples' centre off the circle's
    let u = SH.createShip({ cls: "destroyer", heading: 0, speed: 5 }); const pts = [], n = Math.round(2 * 2 * Math.PI * C.destroyer.turnRadius / 5 / SH.DT); for (let i = 0; i < n; i++) { u = SH.stepShip(u, { heading: u.heading + 1, speed: 5 }); if (i % 30 === 0) pts.push(u.pos); }
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), r = rs.reduce((a, b) => a + b, 0) / rs.length;
    ok("!! held hard over, it traces a circle of its class's turn radius (300 m for a destroyer, to 1%)", Math.abs(r - C.destroyer.turnRadius) / C.destroyer.turnRadius < 0.01 && Math.max(...rs) - Math.min(...rs) < 6, `radius ${r.toFixed(1)} m`);
    let v = SH.createShip({ cls: "freighter", speed: 0 }); for (let i = 0; i < 30; i++) v = SH.stepShip(v, { speed: 99 });
    let w = v; for (let i = 0; i < 30 * 200; i++) w = SH.stepShip(w, { speed: 99 });
    ok("!! speed changes at the class's accel (1 s: 0.05 m/s for a freighter) and stops at its top speed", Math.abs(v.speed - C.freighter.accel * 30 * SH.DT) < 1e-9 && Math.abs(w.speed - C.freighter.maxSpeed) < 1e-9, `${v.speed.toFixed(4)}, then ${w.speed}`);
}

console.log("3. THE TARGET");
{
    const s = SH.createShip({ cls: "destroyer", pos: [10, 20], heading: 0.7, speed: 4 }), T = SH.targetsOf(s, 9), f = SH.forwardOf(0.7), L = C.destroyer.length * 0.35;
    const depthOk = names.every((k) => { const z = -SH.keelPoints(SH.createShip({ cls: k }))[0][2]; return Math.abs(z - Math.max(C[k].draft * 0.7, Tp.TORPEDO.minDepth + 0.5)) < 1e-12 && z > Tp.TORPEDO.minDepth; });
    ok("!! THREE KEEL POINTS, THE MIDDLE FIRST, 0.35 OF THE LENGTH FORE AND AFT ALONG THE HEADING, each with the ship's id, heading, speed and source level", T.length === 3 && Math.abs(T[0].pos[0] - 10) < 1e-12 && Math.abs(T[1].pos[0] - (10 + f[0] * L)) < 1e-9 && Math.abs(T[2].pos[1] - (20 - f[1] * L)) < 1e-9 && T.every((x) => x.id === 9 && x.heading === 0.7 && x.speed === 4 && x.sl === SH.sourceLevelOf(s)));
    ok("!! AT 70% OF THE DRAFT, BUT NEVER ABOVE 3.5 m (the torpedo's ceiling plus half a metre): every class's points below the ceiling", depthOk, names.map((k) => `${k} ${(-SH.keelPoints(SH.createShip({ cls: k }))[0][2]).toFixed(2)} m`).join(", "));
}

console.log("4. THE TORPEDO");
{
    const run = (cls, { aimAt = null, steps = 30 * 80 } = {}) => {
        let ship = SH.createShip({ cls, pos: [0, 300], heading: 0, speed: C[cls].maxSpeed * 0.6 });   // crossing from left to right, 300 m off
        const aim = aimAt || [ship.pos[0] + 60, ship.pos[1]], h = Math.atan2(-(aim[1]), aim[0]);
        let t = Tp.launch(1, { pos: [0, 0, -20], heading: h, pitch: 0 }); let ev = null;
        for (let i = 0; i < steps && t.status === "running"; i++) { ship = SH.stepShip(ship, { heading: 0, speed: ship.speed }); const r = Tp.stepTorpedo(t, SH.targetsOf(ship, 2), { tick: i, seed: 3 }); t = r.torpedo; if (r.event) ev = r.event; }
        return { status: t.status, ev, depth: -t.pos[2] };
    };
    const res = Object.fromEntries(names.map((k) => [k, run(k)]));
    ok("!! A TORPEDO LAUNCHED AT EACH CLASS HELD STEADY HOMES AND HITS -- the corvette too (no torpedo lost at its ceiling)", names.every((k) => res[k].status === "hit" && res[k].ev && res[k].ev.target === 2), names.map((k) => `${k} ${res[k].status}${res[k].ev ? " at " + res[k].ev.distance.toFixed(1) + " m" : ""}`).join("; "));
    // a dumb torpedo (no seeker) run under the destroyer's bow: the fuse finds the bow point, not the middle
    let ship = SH.createShip({ cls: "destroyer", pos: [0, 0], heading: 0, speed: 0 }), bow = SH.keelPoints(ship)[1];
    let t = Tp.launch(1, { pos: [bow[0], 200, -6], heading: Math.PI / 2, pitch: 0 }); let ev = null;
    for (let i = 0; i < 30 * 60 && t.status === "running"; i++) { const r = Tp.stepTorpedo(t, SH.targetsOf(ship, 2), { tick: i, seed: 1, seeker: false }); t = r.torpedo; if (r.event) ev = r.event; }
    ok("!! A TORPEDO RUN UNDER THE BOW FUSES ON THE BOW (a long hull is hit along its length, not only amidships)", t.status === "hit" && ev && ev.distance < 3, ev ? `at ${ev.distance.toFixed(2)} m` : t.status);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG (2026-11-28): 6 mutants. ALL 6 RED -- the turn limit or the accel ignored, no floor under the torpedo's ceiling, one keel point only, no louder than a boat; and the
// forward vector with +sin, GREEN at first (the straight-course row took its expected path from forwardOf itself) -- now red by the row holding the ship to the torpedo's motion.
