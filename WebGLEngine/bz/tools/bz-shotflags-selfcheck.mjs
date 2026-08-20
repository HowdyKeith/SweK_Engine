// bz/tools/bz-shotflags-selfcheck.mjs — what a flag does to a bullet, and the arithmetic behind the words.
//
//   node bz/tools/bz-shotflags-selfcheck.mjs
//
// BZFlag describes its shot flags in prose: "very short range", "infinite speed and range but long reload
// time", "shoots more often, shells go faster but not as far". Every one of those sentences is three numbers
// from BZDB, and this file checks that the numbers produce the sentence. When the arithmetic and the prose
// agree, the flag is right; when they do not, one of them is wrong, and it is worth knowing which.
//
// Then the two flags that are actual physics -- Ricochet and Super Bullet -- are fired into a real map and
// watched.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { makeBZDB } from "../bzdb.js";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { shotSpecFor, shotRange, applyShotFlag, stepShotWith, SHOT_MODS, SHOT_UNIMPLEMENTED } from "../bzShotFlags.js";
import { FLAGS, IMPLEMENTED, UNIMPLEMENTED, SHOT_FLAGS } from "../net/bzFlags.js";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

const db = makeBZDB();
const world = buildWorld(parseBZW(fs.readFileSync(path.join(HERE, "maps", "arena.bzw"), "utf8")));
const near = (a, b, e = 1) => Math.abs(a - b) <= e;

// --- 1. the base shot ---------------------------------------------------------------------------------
{
    ok("a shot's base speed is _shotSpeed = 100", near(db.eval("_shotSpeed"), 100));
    ok("...its base life is _reloadTime, which is _shotRange / _shotSpeed", near(db.eval("_reloadTime"), 350 / 100, 0.01));
    ok("...so its base range is 350 metres, and that is where '_shotRange' gets its name", near(shotRange(null, db), 350));
    ok("no flag does nothing to a shot", shotSpecFor(null, db) === null && shotSpecFor("V", db) === null);
}

// --- 2. THE DESCRIPTIONS ARE ARITHMETIC ---------------------------------------------------------------
{
    // Rapid Fire: "Shoots more often. Shells go faster but not as far."
    const f = shotSpecFor("F", db);
    ok("Rapid Fire's shells go FASTER: vel x1.5", near(f.velMul, 1.5, 0.01));
    ok("...more OFTEN: reload halved, because _rFireAdRate is 2", near(f.reloadMul, 0.5, 0.01));
    ok("...but NOT AS FAR: 263 m, less than the base 350", near(shotRange("F", db), 262.5, 1) && shotRange("F", db) < 350);
    ok("...which is the whole sentence, and it is three numbers", near(f.velMul, 1.5) && near(f.lifeMul, 0.5) && near(f.reloadMul, 0.5, 0.01));

    // Machine Gun: "Very fast reload and very short range."
    const mg = shotSpecFor("MG", db);
    ok("Machine Gun reloads TEN TIMES as fast: _mGunAdRate is 10", near(mg.reloadMul, 0.1, 0.001));
    ok("...and 'very short range' is 53 metres", near(shotRange("MG", db), 52.5, 1));
    ok("...because _mGunAdLife IS DEFINED AS 1.0 / _mGunAdRate -- the life is derived from the rate", near(mg.lifeMul, 0.1, 0.001));
    ok("...so a gun that fires ten times as often fires shots that live a tenth as long", near(mg.reloadMul, mg.lifeMul, 0.001));

    // Laser: "Infinite speed and range but long reload time."
    const l = shotSpecFor("L", db);
    ok("a Laser's 'infinite speed' is vel x1000", near(l.velMul, 1000, 1));
    ok("...its 'infinite range' is a number, and it is thirty-five kilometres", near(shotRange("L", db), 35000, 10));
    ok("...and its 'long reload time' is reload x2, because _laserAdRate is 0.5", near(l.reloadMul, 2, 0.01));

    // Thief: I first wrote this as a slow shot. It is a very FAST, very SHORT one.
    const th = shotSpecFor("TH", db);
    ok("a Thief's shot is FAST: vel x8", near(th.velMul, 8, 0.1));
    ok("...and very SHORT: 140 metres, life x0.05", near(shotRange("TH", db), 140, 1) && near(th.lifeMul, 0.05, 0.01));
}

// --- 3. applying a flag never mutates the last shot ---------------------------------------------------
{
    const base = { pos: [0, 0, 1], vel: [100, 0, 0], life: 3.5, dead: false };
    const laser = applyShotFlag(base, "L", db);
    ok("applying a flag returns a NEW shot", laser !== base && laser.vel !== base.vel);
    ok("...and does not touch the one it came from", base.vel[0] === 100 && base.life === 3.5);
    ok("...the laser is a thousand times faster", near(laser.vel[0], 100000, 1));
    ok("...and remembers which flag it is", laser.flag === "L");
    ok("a plain shot just records that it has no flag", applyShotFlag(base, null, db).flag === null);
    ok("a Ricochet shot is marked to bounce", applyShotFlag(base, "R", db).ricochet === true);
    ok("a Super Bullet shot is marked to pass buildings", applyShotFlag(base, "SB", db).superBullet === true);
}

// --- 4. RICOCHET reflects, it does not die -------------------------------------------------------------
{
    const mk = (pos, vel, flag) => applyShotFlag({ pos: pos.slice(), vel: vel.slice(), life: 3.5, dead: false }, flag, db);

    const plain = mk([-30, -140, 1.5], [100, 0, 0], null);
    let steps = 0;
    while (!plain.dead && steps < 400) { stepShotWith(plain, world, 1 / 60); steps++; }
    ok("a plain shot DIES on the first building it meets", plain.dead && steps < 40);

    const ric = mk([-30, -140, 1.5], [100, 0, 0], "R");
    let bounces = 0;
    steps = 0;
    while (!ric.dead && steps < 400) { const r = stepShotWith(ric, world, 1 / 60); bounces += r.bounced || 0; steps++; }
    ok("a Ricochet shot BOUNCES off the same building instead of dying", bounces >= 1);
    ok("...and it lives out its full life rather than stopping at the wall", ric.life <= 0.05);
    ok("...'Don't shoot yourself' -- the reflected shot is still a real shot heading somewhere", steps > 40);
}

// --- 5. SUPER BULLET passes buildings, and NOT the sky ------------------------------------------------
{
    const mk = (pos, vel, flag) => applyShotFlag({ pos: pos.slice(), vel: vel.slice(), life: 3.5, dead: false }, flag, db);

    const sb = mk([-30, -140, 1.5], [100, 0, 0], "SB");
    let through = 0, steps = 0;
    while (!sb.dead && steps < 600) { const r = stepShotWith(sb, world, 1 / 60); if (r.passedThrough) through++; steps++; }
    ok("a Super Bullet passes THROUGH a building rather than dying on it", through >= 1);

    // But a building is not the sky, and not the ground.
    const up = mk([0, 0, 1.5], [0, 0, 200], "SB");
    steps = 0;
    while (!up.dead && steps < 800) { stepShotWith(up, world, 1 / 60); steps++; }
    ok("...but fired at the sky it dies when its LIFE runs out, not by passing through the sky", up.dead && up.life <= 0.05);
    ok("...'shoots through buildings' is not 'shoots forever'", near(steps, 210, 5));

    const down = mk([0, 0, 30], [0, 0, -200], "SB");
    steps = 0;
    while (!down.dead && steps < 200) { stepShotWith(down, world, 1 / 60); steps++; }
    ok("...and it still dies on the GROUND, which is not a building", down.dead && down.pos[2] <= 0.5);
}

// --- 6. the invariant, with the shot flags folded in -------------------------------------------------
{
    const all = Object.keys(FLAGS).filter((k) => k !== "");
    const impl = new Set([...Object.keys(IMPLEMENTED), ...SHOT_FLAGS]);
    ok("the five shot flags are F, MG, L, SB, R", [...SHOT_FLAGS].sort().join() === "F,L,MG,R,SB");
    ok("...and every one of them has a spec", [...SHOT_FLAGS].every((f) => SHOT_MODS[f]));
    ok("thirteen flags are implemented now, not eight", impl.size === 13);

    const orphan = all.filter((k) => !impl.has(k) && !UNIMPLEMENTED[k]);
    ok("EVERY flag is still in exactly one list", orphan.length === 0, orphan.join(","));
    const both = [...impl].filter((k) => UNIMPLEMENTED[k]);
    ok("...and none is in both", both.length === 0, both.join(","));

    // The two I had wrong.
    ok("BY is corrected: 'the tank cannot stop bouncing', not 'your shots bounce'", /cannot stop bouncing/.test(UNIMPLEMENTED.BY));
    ok("TR is corrected: 'the tank cannot stop firing', not 'reload faster'", /cannot stop firing/.test(UNIMPLEMENTED.TR));
    ok("...and both are still unimplemented, now for the right reason", UNIMPLEMENTED.BY && UNIMPLEMENTED.TR && !SHOT_FLAGS.has("BY"));

    ok("the shot flags this engine will not do are named, with a reason", Object.keys(SHOT_UNIMPLEMENTED).every((k) => SHOT_UNIMPLEMENTED[k].length > 5));
    ok("...including guided, which needs MsgGMUpdate and a target lock", /MsgGMUpdate/.test(SHOT_UNIMPLEMENTED.GM));
}

console.log("");
console.log("  (every flag description is arithmetic from BZDB; ricochet and super bullet are fired into a");
console.log("   real map. No real bzfs was needed for this: the constants are the constants, and the");
console.log("   physics is bz/bzTank.js's own stepShot, not a second copy.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
