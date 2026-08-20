// bz/tools/bz-tank-selfcheck.mjs — the tank, and the collision under it.
//
//   node bz/tools/bz-tank-selfcheck.mjs
//   node bz/tools/bz-tank-selfcheck.mjs /path/to/bzflag/misc/maps
//
// Physics is the other thing you can prove headlessly. A jump reaches v^2/2g and no higher. A tank that
// drives at a box stops at the box's face minus half its own length, and pushing for another two seconds
// does not move it a millimetre further. A shot travels `_shotRange` and dies. None of that needs an eye.
//
// The collision predicate is a separating-axis test where BZFlag walks corner regions. They are the same
// predicate for convex rectangles, but "the same" is a claim, so it is checked -- not against a transcript
// of BZFlag's algorithm, which would only test a copy against its original, but against an INDEPENDENT
// oracle: two convex polygons overlap iff a vertex of one is inside the other, or two edges cross.

import { makeBZDB } from "../bzdb.js";
import { fileURLToPath } from "node:url";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { testRectRect, boxHit, pyramidHit, teleporterHit, obstacleHit, groundHeightAt, shrinkFactor } from "../bzCollide.js";
import { tankSpec, makeTank, stepTank, makeShot, stepShot, free } from "../bzTank.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = makeBZDB();
const DT = 1 / 60;

// --- the independent oracle -------------------------------------------------------------------------
function corners(x, y, a, dx, dy) {
    const c = Math.cos(a), s = Math.sin(a);
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, v]) =>
        [x + c * dx * u - s * dy * v, y + s * dx * u + c * dy * v]);
}
function pointInRect(p, x, y, a, dx, dy) {
    const c = Math.cos(-a), s = Math.sin(-a);
    const lx = c * (p[0] - x) - s * (p[1] - y);
    const ly = s * (p[0] - x) + c * (p[1] - y);
    return Math.abs(lx) <= dx && Math.abs(ly) <= dy;
}
function segCross(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
// Two convex polygons overlap iff a vertex of one lies inside the other, or two of their edges cross.
// Nothing here knows what a separating axis is, which is the point of it.
function rectsOverlapOracle(r1, r2) {
    const c1 = corners(...r1), c2 = corners(...r2);
    for (const p of c1) if (pointInRect(p, ...r2)) return true;
    for (const p of c2) if (pointInRect(p, ...r1)) return true;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        if (segCross(c1[i], c1[(i + 1) % 4], c2[j], c2[(j + 1) % 4])) return true;
    return false;
}

// --- 1. the collision predicate agrees with an independent oracle -------------------------------------
{
    // deterministic pseudo-random, so a failure is reproducible
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    let disagreements = 0, overlaps = 0, n = 10000;
    for (let i = 0; i < n; i++) {
        const r1 = [0, 0, rnd() * Math.PI * 2, 0.2 + rnd() * 3, 0.2 + rnd() * 3];
        const r2 = [(rnd() - 0.5) * 12, (rnd() - 0.5) * 12, rnd() * Math.PI * 2, 0.2 + rnd() * 3, 0.2 + rnd() * 3];
        const sat = testRectRect(...r1, ...r2);
        const oracle = rectsOverlapOracle(r1, r2);
        if (sat) overlaps++;
        if (sat !== oracle) disagreements++;
    }
    ok(`SAT agrees with the polygon oracle on all ${n} random rectangle pairs`, disagreements === 0);
    ok("...and the sample was not degenerate: some overlapped and some did not", overlaps > n * 0.2 && overlaps < n * 0.8);

    ok("a rectangle overlaps itself", testRectRect(0, 0, 0.3, 2, 1, 0, 0, 0.3, 2, 1));
    ok("...and not one far away", !testRectRect(0, 0, 0, 1, 1, 100, 0, 0, 1, 1));
    ok("a rotated rectangle can slip past a corner", !testRectRect(0, 0, 0, 1, 1, 2.9, 0, Math.PI / 4, 1, 1));
    ok("...and catch it a little closer", testRectRect(0, 0, 0, 1, 1, 2.2, 0, Math.PI / 4, 1, 1));
}

// --- 2. standing on a roof is not being inside it -------------------------------------------------------
{
    const box = { type: "box", pos: [0, 0, 0], rotation: 0, size: [10, 10, 5], driveThrough: false, shootThrough: false };
    ok("a tank at the roof's height is NOT inside the box", !boxHit(box, 0, 0, 5, 0, 3, 1.4, 2.05));
    ok("...a hair below it, it is", boxHit(box, 0, 0, 4.999, 0, 3, 1.4, 2.05));
    ok("a tank whose top touches the box's underside IS inside it (>= on the bottom)",
        boxHit({ ...box, pos: [0, 0, 2.05] }, 0, 0, 0, 0, 3, 1.4, 2.05));
    ok("...and a hair lower, it is not", !boxHit({ ...box, pos: [0, 0, 2.06] }, 0, 0, 0, 0, 3, 1.4, 2.05));
    ok("the asymmetry is load-bearing: reverse it and nothing can stand on anything",
        !boxHit(box, 0, 0, 5, 0, 3, 1.4, 2.05) && boxHit(box, 0, 0, 4.999, 0, 3, 1.4, 2.05));

    ok("`drivethrough` is not an obstacle", !obstacleHit({ ...box, driveThrough: true }, 0, 0, 0, 0, 3, 1.4, 2.05));
    ok("...but it is still there for anyone who asks the box directly", boxHit({ ...box, driveThrough: true }, 0, 0, 0, 0, 3, 1.4, 2.05));
}

// --- 3. a pyramid is a rectangle that shrinks with height -------------------------------------------------
{
    const py = { type: "pyramid", pos: [0, 0, 0], rotation: 0, size: [10, 10, 10], flipz: false, driveThrough: false };
    ok("at its base a pyramid is its full width", close(shrinkFactor(py, 0, 2.05), 1));
    ok("halfway up it is half", close(shrinkFactor(py, 5, 2.05), 0.5));
    ok("at its apex it is nothing", close(shrinkFactor(py, 10, 2.05), 0));
    ok("a tank at the base is inside it", pyramidHit(py, 8, 0, 0, 0, 3, 1.4, 2.05));
    ok("...and the same tank, level with the apex, is not", !pyramidHit(py, 8, 0, 10, 0, 3, 1.4, 2.05));
    ok("...nor is it at three-quarter height, where the pyramid has narrowed past it",
        !pyramidHit(py, 8, 0, 7.5, 0, 3, 1.4, 2.05));
    ok("a tank below a pyramid is outside it", !pyramidHit({ ...py, pos: [0, 0, 20] }, 0, 0, 0, 0, 3, 1.4, 2.05));

    // flipz: the wide end is up, and the shrink is measured from the tank's top
    const fp = { ...py, flipz: true };
    ok("a flipped pyramid is nothing at its base", close(shrinkFactor(fp, 0, 0), 0));
    ok("...and its full width at the top", close(shrinkFactor(fp, 10, 0), 1));
    ok("...so a tank at its foot is not inside it", !pyramidHit(fp, 8, 0, 0, 0, 3, 1.4, 2.05));
    ok("...and one near its top is", pyramidHit(fp, 8, 0, 9, 0, 3, 1.4, 2.05));
}

// --- 4. a teleporter is a doorway ---------------------------------------------------------------------
{
    const tp = { type: "teleporter", pos: [0, 0, 0], rotation: 0, size: [0.56, 4.48, 20],
        outerSize: [0.56, 5.6, 21.12], border: 1.12, driveThrough: false };
    ok("a tank in the doorway passes through", !teleporterHit(tp, 0, 0, 0, 0, 3, 1.4, 2.05));
    ok("...a tank at the left post does not", teleporterHit(tp, 0, -5.0, 0, 0, 0.3, 0.3, 2.05));
    ok("...nor at the right post", teleporterHit(tp, 0, 5.0, 0, 0, 0.3, 0.3, 2.05));
    ok("a tank beside the whole thing is clear", !teleporterHit(tp, 0, 8, 0, 0, 3, 1.4, 2.05));
    ok("the lintel is solid, twenty metres up", teleporterHit(tp, 0, 0, 20.5, 0, 0.3, 0.3, 0.3));
    ok("...and the air below it is not", !teleporterHit(tp, 0, 0, 10, 0, 0.3, 0.3, 0.3));
    ok("testing the outer rectangle instead would have walled off the door",
        testRectRect(0, 0, 0, 0.56, 5.6, 0, 0, 0, 3, 1.4) && !teleporterHit(tp, 0, 0, 0, 0, 3, 1.4, 2.05));
}

// --- 5. the tank's numbers come out of the database ------------------------------------------------------
{
    const s = tankSpec(db);
    ok("the tank is 6 long, 2.8 wide, 2.05 tall", s.length === 6 && s.width === 2.8 && s.height === 2.05);
    ok("`_tankRadius` is the expression \"0.72 * _tankLength\", and evaluates to 4.32", close(s.radius, 4.32));
    ok("`_muzzleFront` is `_tankRadius + 0.1`", close(s.muzzleFront, 4.42));
    ok("`_reloadTime` is `_shotRange / _shotSpeed` = 3.5 seconds, and is written nowhere", close(s.reloadTime, 3.5));
    ok("it turns at _tankAngVel = 0.785398 rad/s, a right angle in two seconds", close(Math.PI / 2 / s.angVel, 2, 1e-4));
    ok("the collision box is half a tank-length in x and half a tank-width in y", s.dx === 3 && close(s.dy, 1.4));

    // Change one number and everything that depends on it moves. That is why bzdb.js evaluates.
    const db2 = makeBZDB({ _tankLength: "12" });
    const s2 = tankSpec(db2);
    ok("doubling _tankLength doubles the tank's radius, because the radius IS an expression", close(s2.radius, 8.64));
    ok("...and its muzzle moves with it", close(s2.muzzleFront, 8.74));
    ok("...while _tankSpeed, a plain number, does not move", s2.speed === s.speed);
}

// --- 6. driving ------------------------------------------------------------------------------------------
{
    const world = buildWorld(parseBZW(["world", "size 200", "end", "box", "position 0 0 0", "size 20 20 9", "end"].join("\n")));

    // A tank drives at _tankSpeed. Ten seconds of open ground is 250 metres... except the world is 400 wide.
    const t = makeTank(db, { pos: [-150, 0, 0], angle: 0 });
    for (let i = 0; i < 60; i++) stepTank(t, { forward: 1 }, world, DT);
    ok("a tank drives at _tankSpeed: 25 metres in one second", close(t.pos[0], -125, 0.02));
    ok("...and stays on the ground", t.pos[2] === 0 && t.onGround);

    // Into the box. It stops at the box's face minus half its own length, and stays there.
    const b = makeTank(db, { pos: [-60, 0, 0], angle: 0 });
    let blocked = null;
    for (let i = 0; i < 300; i++) { const r = stepTank(b, { forward: 1 }, world, DT); if (r.blocked) blocked = r.blocked; }
    ok("a tank driving at a box stops against it", blocked && blocked.type === "box");
    ok("...at the face minus half a tank length, give or take one frame's step",
        b.pos[0] < -23 && b.pos[0] > -23 - 25 * DT - 1e-9);
    const x = b.pos[0];
    for (let i = 0; i < 120; i++) stepTank(b, { forward: 1 }, world, DT);
    ok("...and two more seconds of pushing does not move it a millimetre", close(b.pos[0], x, 1e-12));
    ok("...nor does it tunnel through", !free(world, b, 0, 0, 0, 0) && b.pos[0] < -20);

    // Sliding: drive at the box's face at 45 degrees. The x axis is blocked; the y axis is not.
    const sl = makeTank(db, { pos: [-40, -5, 0], angle: Math.PI / 4 });
    const y0 = sl.pos[1];
    for (let i = 0; i < 240; i++) stepTank(sl, { forward: 1 }, world, DT);
    ok("a tank driving into a wall at an angle slides along it", sl.pos[1] > y0 + 10);
    ok("...without ever entering it", !!free(world, sl, sl.pos[0], sl.pos[1], sl.pos[2], sl.angle));

    // A turn sweeps a wider footprint than the tank occupies, so a turn can collide. BZFlag tests the new
    // position AND angle together and expels the tank; we refuse the turn.
    const a0 = b.angle;
    stepTank(b, { turn: 1 }, world, DT);
    ok("a tank a few centimetres off a box can still turn", b.angle > a0);

    // `world size 200` is a FOUR HUNDRED unit world, so its west wall is at -200. Round one, still true.
    const snug = makeTank(db, { pos: [-200 + 3, 0, 0], angle: 0 });
    const a1 = snug.angle;
    const r = stepTank(snug, { turn: 1 }, world, DT);
    ok("...but a tank flush against a wall cannot rotate its corners into it", snug.angle === a1 && !!r.blocked);
    ok("...and is therefore never left overlapping anything", !!free(world, snug, snug.pos[0], snug.pos[1], snug.pos[2], snug.angle));
}

// --- 7. jumping and falling -------------------------------------------------------------------------------
{
    const world = buildWorld(parseBZW(["world", "size 200", "end", "box", "position 0 0 0", "size 20 20 9", "end"].join("\n")));
    const s = tankSpec(db);

    // v^2 / 2g, and not a centimetre more.
    const j = makeTank(db, { pos: [-60, 0, 0], angle: 0 });
    let apex = 0, air = 0;
    stepTank(j, { jump: true }, world, DT);
    ok("a jump leaves the ground", !j.onGround && j.vz > 0);
    for (let i = 0; i < 600 && !j.onGround; i++) { stepTank(j, {}, world, DT); apex = Math.max(apex, j.pos[2]); air++; }
    ok(`a jump reaches v^2/2g = ${(s.jumpVelocity ** 2 / (2 * -s.gravity)).toFixed(2)} m, and no higher`,
        apex <= s.jumpVelocity ** 2 / (2 * -s.gravity) + 1e-9 && apex > 18.2);
    ok("...and comes back down", j.onGround && close(j.pos[2], 0, 1e-9));
    ok("...in about 2v/g seconds", close(air * DT, 2 * s.jumpVelocity / -s.gravity, 0.05));
    ok("a tank on the ground cannot jump twice", (() => { const r = stepTank(j, { jump: true }, world, DT); const r2 = stepTank(j, { jump: true }, world, DT); return r.jumped && !r2.jumped; })());

    // Jump straight up beside the box, then drive on top of it while airborne.
    const k = makeTank(db, { pos: [-24, 0, 0], angle: 0 });
    stepTank(k, { jump: true }, world, DT);
    let landedOn = null;
    for (let i = 0; i < 600; i++) {
        // Drive only while clear of the roof and still short of the far edge. A tank jumping at 25 m/s
        // travels ninety-seven metres; the box is forty wide. Physics, not a bug.
        const over = k.pos[2] > 9.3 && k.pos[0] < -2;
        const r = stepTank(k, { forward: over ? 1 : 0 }, world, DT);
        if (r.landed) { landedOn = k.pos[2]; break; }
    }
    ok("a tank can jump onto a nine-metre box", close(landedOn, 9, 1e-9));
    ok("...and is then standing on it", k.onGround && close(k.pos[2], 9));
    ok("the roof it stands on is what groundHeightAt says it is",
        close(groundHeightAt(world, k.pos[0], k.pos[1], k.angle, s.dx, s.dy), 9));

    // Drive off the edge and fall.
    for (let i = 0; i < 300 && k.onGround; i++) stepTank(k, { forward: 1 }, world, DT);
    ok("driving off a roof starts a fall", !k.onGround);
    for (let i = 0; i < 300 && !k.onGround; i++) stepTank(k, {}, world, DT);
    ok("...which ends on the ground", k.onGround && close(k.pos[2], 0, 1e-9));
}

// --- 8. the world's walls hold ------------------------------------------------------------------------------
{
    const world = buildWorld(parseBZW(["world", "size 100", "end"].join("\n")));
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    for (let i = 0; i < 600; i++) stepTank(t, { forward: 1 }, world, DT);
    ok("a tank cannot drive out of the world", t.pos[0] <= 100);
    ok("...and stops with its own half-length inside the wall", close(t.pos[0], 100 - 3, 25 * DT + 1e-9));

    const open = buildWorld(parseBZW(["world", "size 100", "noWalls", "end"].join("\n")));
    const u = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    for (let i = 0; i < 600; i++) stepTank(u, { forward: 1 }, open, DT);
    ok("`noWalls` lets it drive right out", u.pos[0] > 100);
}

// --- 9. shooting ---------------------------------------------------------------------------------------------
{
    const world = buildWorld(parseBZW(["world", "size 400", "end", "box", "position 100 0 0", "size 5 20 9", "end"].join("\n")));
    const s = tankSpec(db);
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 });

    const r1 = stepTank(t, { fire: true }, world, DT);
    ok("firing produces a shot", !!r1.fired);
    ok("...from the muzzle: _muzzleFront ahead, _muzzleHeight up", close(r1.fired.pos[0], s.muzzleFront) && close(r1.fired.pos[2], s.muzzleHeight));
    ok("...at _shotSpeed", close(Math.hypot(...r1.fired.vel), s.shotSpeed));
    ok("...living for _shotRange / _shotSpeed seconds", close(r1.fired.life, s.reloadTime));

    const r2 = stepTank(t, { fire: true }, world, DT);
    ok("a tank cannot fire again until it has reloaded", !r2.fired);
    for (let i = 0; i < 60 * 4; i++) stepTank(t, {}, world, DT);
    ok("...and can, once _reloadTime has passed", !!stepTank(t, { fire: true }, world, DT).fired);

    // A shot travels until it hits the box at x = 95.
    const shot = makeShot(makeTank(db, { pos: [0, 0, 0], angle: 0 }));
    let hit = null, travelled = 0;
    for (let i = 0; i < 600 && !shot.dead; i++) { const r = stepShot(shot, world, DT); travelled = shot.pos[0]; if (r.hit) hit = r.hit; }
    ok("a shot stops at the first thing it hits", hit && hit.type === "box");
    ok("...at the box's near face, not somewhere inside it", travelled > 90 && travelled < 96);

    // A shot fired at nothing dies at _shotRange.
    const empty = buildWorld(parseBZW(["world", "size 2000", "end"].join("\n")));
    const s2 = makeShot(makeTank(db, { pos: [0, 0, 0], angle: 0 }));
    let n = 0;
    while (!s2.dead && n < 10000) { stepShot(s2, empty, DT); n++; }
    // The shot's age is checked after it moves, so it overshoots by at most one frame's step.
    ok("a shot fired at nothing dies after _shotRange metres, within one frame's step",
        close(s2.pos[0] - s.muzzleFront, s.shotRange, s.shotSpeed * DT + 1e-9));

    // `shootthrough` is not `drivethrough`.
    const st = buildWorld(parseBZW(["world", "size 400", "end", "box", "position 100 0 0", "size 5 20 9", "shootthrough", "end"].join("\n")));
    const s3 = makeShot(makeTank(db, { pos: [0, 0, 0], angle: 0 }));
    let through = false;
    for (let i = 0; i < 600 && !s3.dead; i++) { stepShot(s3, st, DT); if (s3.pos[0] > 110) through = true; }
    ok("a shot passes through a `shootthrough` box", through);
    const dt2 = buildWorld(parseBZW(["world", "size 400", "end", "box", "position 100 0 0", "size 5 20 9", "drivethrough", "end"].join("\n")));
    const s4 = makeShot(makeTank(db, { pos: [0, 0, 0], angle: 0 }));
    let stopped = false;
    for (let i = 0; i < 600 && !s4.dead; i++) { const r = stepShot(s4, dt2, DT); if (r.hit) stopped = true; }
    ok("...but not through a `drivethrough` one: they are different words", stopped);

    // A fast shot cannot pass through a thin wall in one frame.
    const thin = buildWorld(parseBZW(["world", "size 400", "end", "box", "position 100 0 0", "size 0.2 20 9", "end"].join("\n")));
    const s5 = makeShot(makeTank(db, { pos: [0, 0, 0], angle: 0 }));
    let tunneled = true;
    for (let i = 0; i < 600 && !s5.dead; i++) { const r = stepShot(s5, thin, DT); if (r.hit && r.hit.type === "box") tunneled = false; }
    ok("a 100 m/s shot does not tunnel through a 40 cm wall at 60Hz", !tunneled);
}

// --- 10. arena.bzw, driven ----------------------------------------------------------------------------------
{
    const world = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    const s = tankSpec(db);

    ok("the centre of the map is inside the central box", !free(world, makeTank(db, { pos: [0, 0, 0] }), 0, 0, 0, 0));
    ok("...and a base corner is not", free(world, makeTank(db, { pos: [-160, -160, 0] }), -160, -160, 0, 0));

    // Drive a lap: from a base, round the ring, and never end up inside anything.
    const t = makeTank(db, { pos: [-160, -160, 0], angle: 0 });
    let inside = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 6000; i++) {
        stepTank(t, { forward: 1, turn: (rnd() - 0.5) * 2, jump: rnd() < 0.002 }, world, DT);
        if (!free(world, t, t.pos[0], t.pos[1], t.pos[2], t.angle)) inside++;
    }
    // Before restingHeight, 4,031 of these 6,000 frames had the tank standing inside a pyramid, because
    // falling consulted only the flat roofs. Nothing noticed until something tried to drive around in there.
    // Before restingHeight and the turn check, 4,031 of these 6,000 frames had the tank overlapping
    // something -- and not one of them was a translation. Falling consulted only flat roofs, and a turn
    // swept the tank's own corners into the wall it was parked against.
    ok("100 seconds of driving, turning and jumping around arena.bzw never leaves the tank inside anything", inside === 0);
    ok("...and never outside the world", Math.abs(t.pos[0]) <= world.world.size / 2 && Math.abs(t.pos[1]) <= world.world.size / 2);
    ok("...and never below the floor", t.pos[2] >= -1e-9);
}

// --- 11. BZFlag's own maps, if you have them --------------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const maps = fs.readdirSync(dir).filter((f) => f.endsWith(".bzw"));
    console.log("");
    console.log(`  (real maps: ${maps.join(", ")})`);
    let inside = 0, escaped = 0, sunk = 0, frames = 0;
    for (const f of maps) {
        const world = buildWorld(parseBZW(fs.readFileSync(path.join(dir, f), "utf8")));
        const half = world.world.size / 2;
        let seed = 99;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        for (let start = 0; start < 6; start++) {
            const t = makeTank(db, { pos: [(rnd() - 0.5) * half, (rnd() - 0.5) * half, 60], angle: rnd() * 7 });
            for (let i = 0; i < 1500; i++) {
                stepTank(t, { forward: 1, turn: (rnd() - 0.5) * 2, jump: rnd() < 0.003 }, world, DT);
                frames++;
                if (!free(world, t, t.pos[0], t.pos[1], t.pos[2], t.angle)) inside++;
                if (Math.abs(t.pos[0]) > half + 1e-6 || Math.abs(t.pos[1]) > half + 1e-6) escaped++;
                if (t.pos[2] < -1e-6) sunk++;
            }
        }
    }
    ok(`real maps: ${frames} frames of driving, and the tank is never inside an obstacle`, inside === 0);
    ok("real maps: never outside the walls", escaped === 0);
    ok("real maps: never below the floor", sunk === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
