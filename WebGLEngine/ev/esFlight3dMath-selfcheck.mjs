// WebGLEngine/ev/esFlight3dMath-selfcheck.mjs — v3825 (Long Silence, Round A)
//
// The answer key for the one thing Round A can get silently wrong: the sim-number -> mesh-transform map. Round A
// adds a 3D view of the box3d fight WITHOUT touching the sim, so if a ship points the wrong way or lands off its
// real position, nothing throws -- it just looks subtly wrong on a rotating scene nobody can eyeball frame by
// frame. So the facing at the cardinal headings, the position map, the planarity (Y stays 0), and the yaw/facing
// round-trip are pinned to constructed values here. Same discipline as the rest of the tree; same discipline
// TheLongSilence arrived at independently for this genre.
//
// Node-only, no Three.js -- imports the pure math and ev/flightModel.js (both already run headless).

import { shipTransform, forwardFromYaw, fleetBounds, sceneScale } from "./esFlight3dMath.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  FAIL  " + msg); } }
function vecNear(v, x, y, z, e = 1e-9) { return near(v[0], x, e) && near(v[1], y, e) && near(v[2], z, e); }

// 1) FACING AT THE FOUR CARDINALS -- headingVector = (sin, -cos), mapped to (x, 0, z). heading 0 faces -Z
//    ("up the screen" in the 2D view), 90 faces +X, 180 faces +Z, 270 faces -X. Constructed, not derived from
//    the code under test.
const cardinals = [
    { h: 0,   f: [0, 0, -1] },
    { h: 90,  f: [1, 0, 0] },
    { h: 180, f: [0, 0, 1] },
    { h: 270, f: [-1, 0, 0] },
];
for (const c of cardinals) {
    const t = shipTransform({ x: 0, y: 0, heading: c.h });
    ok(vecNear(t.forward, c.f[0], c.f[1], c.f[2], 1e-12), `heading ${c.h}: forward ${JSON.stringify(t.forward)} expected ${JSON.stringify(c.f)}`);
}

// 2) POSITION MAP -- ES (x, y) -> (x, 0, y). The Y (out-of-plane) coordinate is ALWAYS 0: box3d holds it there
//    and Round A must not invent altitude. Checked across a spread including negatives.
for (const [x, y] of [[0, 0], [1300, 0], [-1300, 250], [37.5, -900.25], [-1, -1]]) {
    const t = shipTransform({ x, y, heading: 137 });
    ok(t.pos[0] === x && t.pos[1] === 0 && t.pos[2] === y, `pos map (${x},${y}) -> ${JSON.stringify(t.pos)}`);
    ok(t.forward[1] === 0, `facing stays planar at (${x},${y})`);
}

// 3) YAW / FACING ROUND-TRIP -- the rotation SENSE is right, not just internally consistent: a hull yawed by
//    rotY (local +X rotated about Y) must actually point along forward. Swept over the full circle.
for (let h = 0; h < 360; h += 7) {
    const t = shipTransform({ x: 0, y: 0, heading: h });
    const f = forwardFromYaw(t.rotY);
    ok(vecNear(f, t.forward[0], t.forward[1], t.forward[2], 1e-9), `yaw round-trip at heading ${h}`);
}

// 4) FLEET BOUNDS -- center and radius of a known A/B line-up; dead ships excluded; empty fleet degrades to a
//    unit box (never a zero-size camera frame).
{
    const ships = [
        { x: -1300, y: 0 }, { x: 1300, y: 0 },
        { x: -1300, y: 300 }, { x: 1300, y: -300 },
        { x: 0, y: 0, dead: true },   // excluded
    ];
    const b = fleetBounds(ships);
    ok(b.count === 4, "fleetBounds counts live ships only (" + b.count + ")");
    ok(near(b.center[0], 0) && near(b.center[1], 0) && near(b.center[2], 0), "fleetBounds center " + JSON.stringify(b.center));
    ok(near(b.radius, Math.hypot(1300, 300)), "fleetBounds radius " + b.radius.toFixed(2) + " expected " + Math.hypot(1300, 300).toFixed(2));

    const empty = fleetBounds([]);
    ok(empty.radius === 1 && empty.count === 0, "empty fleet -> unit box, no NaN");
    const allDead = fleetBounds([{ x: 5, y: 5, dead: true }]);
    ok(allDead.count === 0 && allDead.radius === 1, "all-dead fleet -> unit box");
}

// 5) SCENE SCALE -- maps a world half-extent to the target unit span; positive and finite for sane inputs, and
//    degenerate inputs do not divide by zero.
ok(near(sceneScale(1900, 30), 30 / 1900), "sceneScale(1900,30)");
ok(sceneScale(0) > 0 && Number.isFinite(sceneScale(0)), "sceneScale(0) is finite/positive (no divide-by-zero)");

if (fail) { console.error(`\nesFlight3dMath-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`esFlight3dMath-selfcheck: all ${pass} pass`);
