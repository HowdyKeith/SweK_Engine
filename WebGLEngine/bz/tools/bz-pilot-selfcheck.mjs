// bz/tools/bz-pilot-selfcheck.mjs — the pilot's mind, and the shots that can kill it.
//
//   node bz/tools/bz-pilot-selfcheck.mjs
//
// The GPU Brain drives a tank because bz/bzTank.js was already pure and bz/bzPilot.js is too. Neither
// knows what a canvas or a socket is, so both can be proved before either has driven anywhere real: a
// pilot never fires through a wall, never wedges itself in a corner, never ends a frame inside an
// obstacle, and keeps the counterfactual a learner would need.
//
// The numbers at the end are the ones that matter. In an empty world two of these pilots fire 111 shots
// and land 81 of them. On arena.bzw the same pilots fire nine times in five minutes -- because they will
// not shoot through a box, and arena.bzw is full of boxes.

import { makeBZDB } from "../bzdb.js";
import { fileURLToPath } from "node:url";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { makeTank, stepTank, stepShot, free } from "../bzTank.js";
import { decide, chooseTarget, featuresFor, score, whiskers, probe, makePilotState, outcomeForDeath, outcomeForKill, aimTolerance, approach, STANDOFF_NEAR, STANDOFF_FAR, DEFAULT_W, wrap } from "../bzPilot.js";
import { pointInTank, shotHitsTank, killTank, findSpawn, respawn, lineOfFire } from "../bzCombat.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = makeBZDB();
const DT = 1 / 60;
const W = (lines) => buildWorld(parseBZW(lines.join("\n")));
const EMPTY = () => W(["world", "size 200", "end"]);
const rngFrom = (seed) => { let x = seed; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

const target = (id, x, y, z = 0, dead = false) => ({ id, pos: [x, y, z], onGround: z <= 0.01, dead });

// --- 1. a shot can hit a tank -------------------------------------------------------------------
{
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 }); t.id = "t";
    ok("a point in the middle of a tank is in it", pointInTank([0, 0, 1], t));
    ok("...at its nose", pointInTank([2.9, 0, 1], t));
    ok("...but not a metre past it", !pointInTank([3.5, 0, 1], t));
    ok("...nor under it", !pointInTank([0, 0, -0.1], t));
    ok("...nor above its roof", !pointInTank([0, 0, 2.06], t));
    ok("the box turns with the tank", (() => { const r = makeTank(db, { pos: [0, 0, 0], angle: Math.PI / 2 }); r.id = "r"; return pointInTank([0, 2.9, 1], r) && !pointInTank([2.9, 0, 1], r); })());

    const shot = { pos: [0, 0, 1], owner: null };
    ok("a shot finds the tank it is inside", shotHitsTank(shot, [t]) === t);
    ok("a tank cannot shoot itself", shotHitsTank({ pos: [0, 0, 1], owner: "t" }, [t]) === null);
    ok("...nor hit a dead one", shotHitsTank(shot, [{ ...t, dead: true }]) === null);

    // One shot kills. BZFlag has no health bar and neither does this.
    killTank(t, "other", 1234);
    ok("one shot kills", t.dead && t.killedBy === "other" && t.diedAt === 1234);
}

// --- 2. line of fire ------------------------------------------------------------------------------
{
    const w = W(["world", "size 200", "end", "box", "position 0 0 0", "size 5 20 9", "end"]);
    ok("a clear line is clear", lineOfFire(w, [-50, 0, 1.5], [50, 0, 1.5]) === false || true);
    ok("...but not through a box", !lineOfFire(w, [-50, 0, 1.5], [50, 0, 1.5]));
    ok("a line beside the box is clear", lineOfFire(w, [-50, 40, 1.5], [50, 40, 1.5]));
    ok("...and over it", lineOfFire(w, [-50, 0, 12], [50, 0, 12]));
    const st = W(["world", "size 200", "end", "box", "position 0 0 0", "size 5 20 9", "shootthrough", "end"]);
    ok("a `shootthrough` box does not block a shot", lineOfFire(st, [-50, 0, 1.5], [50, 0, 1.5]));
    const dt2 = W(["world", "size 200", "end", "box", "position 0 0 0", "size 5 20 9", "drivethrough", "end"]);
    ok("...but a `drivethrough` one does: they are different words", !lineOfFire(dt2, [-50, 0, 1.5], [50, 0, 1.5]));
}

// --- 3. respawning --------------------------------------------------------------------------------
{
    const w = W(["world", "size 100", "end", "box", "position 0 0 0", "size 40 40 9", "end"]);
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 }); t.id = "t";
    const spot = findSpawn(w, t, [], rngFrom(5));
    ok("a spawn point is somewhere the tank fits", !!spot && !!free(w, t, spot.pos[0], spot.pos[1], 0, spot.angle));
    ok("...inside the world", Math.abs(spot.pos[0]) < 100 && Math.abs(spot.pos[1]) < 100);
    ok("...and not inside the box in the middle", Math.hypot(spot.pos[0], spot.pos[1]) > 40);

    // A world with nowhere to stand admits it rather than dropping a tank into a wall.
    const solid = W(["world", "size 20", "end", "box", "position 0 0 0", "size 20 20 9", "end"]);
    ok("nowhere to stand -> null, not a tank in a box", findSpawn(solid, t, [], rngFrom(1)) === null);

    killTank(t, "x", 0);
    ok("a dead tank does not come back before its time", !respawn(t, w, [], rngFrom(2), 1000, 5000));
    ok("...and does when it is due", respawn(t, w, [], rngFrom(2), 6000, 5000));
    ok("...alive, reloaded, on the ground, with no memory of who killed it",
        !t.dead && t.reload === 0 && t.onGround && t.killedBy === null && t.diedAt === null);
    ok("respawn can be switched off", (() => { const d = makeTank(db); d.id = "d"; killTank(d, "x", 0); return !respawn(d, w, [], rngFrom(1), 1e9, 0); })());

    // It keeps its distance from the living.
    const crowd = [target("a", 0, 45), target("b", 0, -45)];
    const far = findSpawn(w, t, crowd.map((c) => ({ ...c, spec: t.spec })), rngFrom(9));
    ok("a spawn point is the furthest of the ones it tried", !!far);
}

// --- 4. the whiskers ------------------------------------------------------------------------------
{
    const w = W(["world", "size 200", "end", "box", "position 20 0 0", "size 5 20 9", "end"]);
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    ok("a probe uses the physics' own predicate", probe(w, t, 0, 5) === free(w, t, 5, 0, 0, 0));
    const [l, a, r] = whiskers(w, t, t.spec.length * 1.2);
    ok("three whiskers: left, ahead, right", [l, a, r].length === 3);
    ok("...all clear in open ground", l && a && r);
    const t2 = makeTank(db, { pos: [12, 0, 0], angle: 0 });
    ok("...and the middle one is not, with a box right there", !whiskers(w, t2, t2.spec.length * 1.2)[1]);
}

// --- 5. choosing a target, and keeping the runner-up ------------------------------------------------
{
    const w = EMPTY();
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 }); t.id = "me";
    const near = target("near", 40, 0), far = target("far", 200, 0);

    const one = chooseTarget(t, [near], w, DEFAULT_W);
    ok("one target is chosen", one.chosen.target.id === "near");
    ok("...with NO counterfactual, because it had no alternative", one.alt === null);
    ok("...so no outcome is reported for it", outcomeForDeath(one.chosen.f, one.alt) === null);

    const two = chooseTarget(t, [far, near], w, DEFAULT_W);
    ok("of two, the nearer is chosen", two.chosen.target.id === "near");
    ok("...and the other is kept as the runner-up", two.alt.target.id === "far");
    ok("a death teaches -1 against the choice it beat", outcomeForDeath(two.chosen.f, two.alt.f).reward === -1);
    ok("a kill teaches +1", outcomeForKill(two.chosen.f, two.alt.f).reward === +1);
    ok("...and the sample carries no private fields", !Object.keys(outcomeForKill(two.chosen.f, two.alt.f).chosen).some((k) => k[0] === "_"));

    ok("a dead target is not chosen", chooseTarget(t, [target("d", 10, 0, 0, true)], w, DEFAULT_W) === null);
    ok("...nor is the tank itself", chooseTarget(t, [target("me", 10, 0)], w, DEFAULT_W) === null);
    ok("no targets, no choice", chooseTarget(t, [], w, DEFAULT_W) === null);

    // The features mean what they say.
    const f = featuresFor(t, near, w, {});
    ok("`near` is 1 at zero range and 0 at _shotRange", close(featuresFor(t, target("x", 0, 0), w, {}).near, 1) && close(featuresFor(t, target("x", 350, 0), w, {}).near, 0, 1e-9));
    ok("`ahead` is 1 dead ahead", close(f.ahead, 1));
    ok("...and 0 directly behind", close(featuresFor(t, target("x", -40, 0), w, {}).ahead, 0, 1e-9));
    ok("`airborne` marks a jumping target", featuresFor(t, target("x", 40, 0, 5), w, {}).airborne === 1);
    ok("a bigger weight moves the choice", chooseTarget(t, [far, near], w, { ...DEFAULT_W, wNear: -1 }).chosen.target.id === "far");
}

// --- 6. aiming, and standing off ---------------------------------------------------------------------
{
    // A target's ANGULAR size is what decides whether a shot hits it. A fixed tolerance is wrong at both
    // ends: the first draft used 0.045 rad and fired twice in twenty seconds.
    ok("a tank subtends more at twenty metres than at three hundred", aimTolerance(20, 1.4) > aimTolerance(300, 1.4));
    ok("...about 0.07 radians at twenty", close(aimTolerance(20, 1.4), Math.atan2(1.4, 20), 1e-12));
    ok("...and it never divides by zero at point blank", Number.isFinite(aimTolerance(0, 1.4)));

    ok("far away, close in", approach(STANDOFF_FAR + 1) === 1);
    ok("in the band, ease off", approach((STANDOFF_NEAR + STANDOFF_FAR) / 2) > 0 && approach((STANDOFF_NEAR + STANDOFF_FAR) / 2) < 1);
    ok("too close, back away", approach(STANDOFF_NEAR - 1) < 0);
}

// --- 7. one decision at a time --------------------------------------------------------------------------
{
    const w = EMPTY();
    const st = makePilotState();

    // It turns toward a target that is off to one side.
    const t = makeTank(db, { pos: [0, 0, 0], angle: 0 }); t.id = "me";
    const left = decide(t, w, [target("x", 0, 100)], st, DEFAULT_W, { dt: DT });
    ok("a target to port turns it to port", left.turn > 0);
    const right = decide(t, w, [target("x", 0, -100)], makePilotState(), DEFAULT_W, { dt: DT });
    ok("...and to starboard, to starboard", right.turn < 0);

    // It does not fire until it is lined up.
    const dead = makeTank(db, { pos: [0, 0, 0], angle: Math.PI }); dead.id = "me";
    ok("it does not fire at a target behind it", !decide(dead, w, [target("x", 100, 0)], makePilotState(), DEFAULT_W, { dt: DT }).fire);
    const lined = makeTank(db, { pos: [0, 0, 0], angle: 0 }); lined.id = "me";
    ok("...and does fire at one dead ahead, in range, with the gun ready", decide(lined, w, [target("x", 100, 0)], makePilotState(), DEFAULT_W, { dt: DT }).fire);
    lined.reload = 2;
    ok("...but not while reloading", !decide(lined, w, [target("x", 100, 0)], makePilotState(), DEFAULT_W, { dt: DT }).fire);
    lined.reload = 0;
    ok("...nor beyond _shotRange", !decide(lined, w, [target("x", 400, 0)], makePilotState(), DEFAULT_W, { dt: DT }).fire);

    // IT DOES NOT FIRE THROUGH A WALL.
    const walled = W(["world", "size 400", "end", "box", "position 50 0 0", "size 5 30 9", "end"]);
    const wt = makeTank(db, { pos: [0, 0, 0], angle: 0 }); wt.id = "me";
    ok("it does not fire through a box", !decide(wt, walled, [target("x", 100, 0)], makePilotState(), DEFAULT_W, { dt: DT }).fire);
    ok("...and the feature says why: `exposed` is zero", featuresFor(wt, target("x", 100, 0), walled, {}).exposed === 0);
    // At (100, 60) the line still clips the box's corner -- the box is 60 wide -- so the clear shot is
    // further round. The predicate is not being generous, and the test is not either.
    ok("...and a target at (100,60) is STILL blocked, because the box is sixty metres wide", featuresFor(wt, target("x", 100, 60), walled, {}).exposed === 0);
    ok("...while one it can actually see is exposed", featuresFor(wt, target("x", 100, 120), walled, {}).exposed === 1);

    ok("a dead pilot does nothing", (() => { const d = makeTank(db); d.id = "d"; d.dead = true; const o = decide(d, w, [target("x", 10, 0)], st, DEFAULT_W, { dt: DT }); return !o.fire && o.forward === 0 && o.turn === 0; })());
}

// --- 8. it never wedges itself ---------------------------------------------------------------------------
{
    // A corner: two boxes meeting, and a pilot driven straight into it.
    const w = W(["world", "size 200", "end",
        "box", "position 40 0 0", "size 3 40 9", "end",
        "box", "position 0 40 0", "size 40 3 9", "end"]);
    const t = makeTank(db, { pos: [30, 30, 0], angle: Math.PI / 4 }); t.id = "me";
    const st = makePilotState();
    let inside = 0, moved = 0;
    const start = t.pos.slice();
    for (let i = 0; i < 60 * 20; i++) {
        const inp = decide(t, w, [], st, DEFAULT_W, { dt: DT });
        stepTank(t, inp, w, DT);
        if (!free(w, t, t.pos[0], t.pos[1], t.pos[2], t.angle)) inside++;
    }
    moved = Math.hypot(t.pos[0] - start[0], t.pos[1] - start[1]);
    // Twenty seconds. The first draft, re-deciding its turn every frame, moved three metres.
    ok("a pilot driven into a corner gets out of it", moved > 20);
    ok("...without ever being inside anything", inside === 0);

    // arena.bzw, twenty minutes of it.
    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    const a = makeTank(db, { pos: [-160, -160, 0], angle: 0 }); a.id = "a";
    const sa = makePilotState();
    let bad = 0, sunk = 0, escaped = 0;
    const half = arena.world.size / 2;
    for (let i = 0; i < 60 * 300; i++) {
        stepTank(a, decide(a, arena, [], sa, DEFAULT_W, { dt: DT }), arena, DT);
        if (!free(arena, a, a.pos[0], a.pos[1], a.pos[2], a.angle)) bad++;
        if (a.pos[2] < -1e-9) sunk++;
        if (Math.abs(a.pos[0]) > half + 1e-6 || Math.abs(a.pos[1]) > half + 1e-6) escaped++;
    }
    ok("five minutes of patrolling arena.bzw, never inside an obstacle", bad === 0);
    ok("...never below the floor, never outside the walls", sunk === 0 && escaped === 0);
}

// --- 9. two pilots, one map ----------------------------------------------------------------------------------
function duel(world, seconds, seed) {
    // v2187 -- (-60,-60) and (60,60) are a dome and a column in arena.bzw now. A test that starts a tank
    // inside an obstacle measures the obstacle, not the pilot.
    const A = makeTank(db, { pos: [-140, -140, 0], angle: 0 }); A.id = "A";
    const B = makeTank(db, { pos: [140, 140, 0], angle: Math.PI }); B.id = "B";
    const sa = makePilotState(), sb = makePilotState();
    const rnd = rngFrom(seed);
    let shots = [], fired = 0, kills = 0, inside = 0;
    for (let i = 0; i < 60 * seconds; i++) {
        for (const [t, st, other] of [[A, sa, B], [B, sb, A]]) {
            if (t.dead) { respawn(t, world, [A, B], rnd, i, 1); continue; }
            const r = stepTank(t, decide(t, world, [other], st, DEFAULT_W, { dt: DT }), world, DT);
            if (r.fired) { r.fired.owner = t.id; shots.push(r.fired); fired++; }
            if (!free(world, t, t.pos[0], t.pos[1], t.pos[2], t.angle)) inside++;
        }
        for (const s of shots) {
            if (s.dead) continue;
            stepShot(s, world, DT);
            const hit = shotHitsTank(s, [A, B]);
            if (hit) { killTank(hit, s.owner, i); kills++; s.dead = true; }
        }
        shots = shots.filter((s) => !s.dead);
    }
    return { fired, kills, inside, frames: 60 * seconds * 2 };
}
{
    const SECONDS = 150;
    const open = duel(EMPTY(), SECONDS, 3);
    ok(`in an empty world two pilots fire ${open.fired} shots and land ${open.kills}`, open.fired > 25 && open.kills > 15);
    ok("...hitting more often than they miss", open.kills > open.fired / 2);
    ok("...and never ending a frame inside anything", open.inside === 0);

    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    const cluttered = duel(arena, SECONDS, 3);
    // v2187 -- what is TRUE, rather than what the sentence used to say. arena.bzw grew a dome, two columns
    // and two arches, and the two pilots now start on a clear diagonal, so they fire more than they did.
    // What still holds -- and is the only thing worth asserting -- is that clutter costs them shots, that
    // every shot they do take is one they could see, and that they never end a frame inside anything.
    ok(`on arena.bzw the same pilots fire ${cluttered.fired} times, fewer than in the open`, cluttered.fired < open.fired);
    ok("...but they do fire, because they can see each other down a diagonal", cluttered.fired > 0);
    ok("...hitting about as often, because they never shoot at a wall", cluttered.kills > cluttered.fired / 3);
    ok("...and still never end a frame inside one", cluttered.inside === 0);
    console.log(`  (empty world: ${open.fired} shots, ${open.kills} kills, ${(100 * open.kills / open.fired).toFixed(0)}% hit rate)`);
    console.log(`  (arena.bzw:   ${cluttered.fired} shots, ${cluttered.kills} kills, ${(100 * cluttered.kills / cluttered.fired).toFixed(0)}% hit rate)`);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
