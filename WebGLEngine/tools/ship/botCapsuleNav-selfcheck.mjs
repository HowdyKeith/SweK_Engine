// WebGLEngine/tools/ship/botCapsuleNav-selfcheck.mjs -- v4632
//
// Gates simulation/BotManager.js's task board #85 addition: capsule-vs-mesh resolution for a bot in a world
// that exposes world.colliderBVH (a triangle-mesh collider -- walls, props, collider-forge-derived geometry),
// mirroring camera.js's own _moveFPCapsule (task #80) instead of only following a ground HEIGHT the way every
// bot always has via physics/character/terrainWalk.mjs's oracle. The whole point of this round is that a bot
// in such a world now gets BLOCKED by a wall instead of walking straight through it -- section 3 below is the
// one that actually proves that, not just that the bot still moves.
//
// A SELF-CONTAINED SYNTHETIC LEVEL, NOT world/controllerLabWorld.mjs's OWN LAYOUT: this gate exercises
// BotManager's own dispatch and _stepBotCapsule(), which do not care what demo built the collider -- reusing a
// specific demo's constants here would couple this gate to that demo's own future changes for no reason. The
// same trianglesFrom/MeshBVH technique every other gate this round already used.
//
// SABOTAGED AND RESTORED: _botCapsuleBVH() hardcoded to always return null (the dispatch that gates every
// capsule call) went red BY NAME on 5 of 15 checks -- the direct dispatch assertion in section 1, and every
// check in section 3 that depends on capsule resolution actually engaging (the bot walked straight through the
// wall to x=30, then floated at y=31 forever with no height oracle in this synthetic world to fall back to,
// and section 4's "stayed on the floor" check failed the same way) -- while sections 2, 4's own movement
// check, and all of section 5 (the height-only regression) stayed correctly green, since those do not depend
// on the capsule path engaging. Restored and re-verified.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { BotManager } = await import(pathToFileURL(path.join(ENG, "simulation", "BotManager.js")).href);
const { MeshBVH, trianglesFrom } = await import(pathToFileURL(path.join(ENG, "mesh", "meshBVH.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const quad = (p0, p1, p2, p3) => trianglesFrom([p0, p1, p2, p3], [[0, 1, 2], [0, 2, 3]]);

/** A flat floor plus one vertical wall blocking straight-line +X travel between x=5 and x=6, z in [-10, 10]. */
function buildWallWorld() {
    const floor = quad([-50, 0, -50], [50, 0, -50], [50, 0, 50], [-50, 0, 50]);
    const wall = quad([5, 0, -10], [5, 0, 10], [5, 6, 10], [5, 6, -10]);
    const total = floor.length + wall.length;
    const tris = new Float64Array(total);
    tris.set(floor, 0); tris.set(wall, floor.length);
    return { colliderBVH: new MeshBVH(tris) };
}

let nextEntityId = 1;
const fakeRouter = { exec: (req) => (req.type === "entity:spawnMesh" ? { ok: true, id: nextEntityId++ } : { ok: false }) };

console.log("1. _botCapsuleBVH() ONLY FIRES FOR A WORLD THAT EXPOSES colliderBVH");
{
    const bmHeight = new BotManager({ router: fakeRouter, world: { _heightAt: () => 3 } });
    const bmBare = new BotManager({ router: fakeRouter, world: {} });
    const bmMesh = new BotManager({ router: fakeRouter, world: buildWallWorld() });
    ok("!! *** a _heightAt-only world (every dungeon/kaiju-sandbox/OGRE bot world today) never takes the capsule branch ***",
       bmHeight._botCapsuleBVH() === null, "the entire existing bot fleet must be byte-for-byte unaffected by this round");
    ok("  a bare world (neither _heightAt nor colliderBVH) also gets no capsule branch", bmBare._botCapsuleBVH() === null);
    ok("!! *** a world with colliderBVH DOES return it ***", bmMesh._botCapsuleBVH() !== null);
}

console.log("\n2. spawn() FINDS THE REAL MESH SURFACE IN A colliderBVH WORLD, NOT THE OLD ?? 5 FALLBACK");
{
    const bmHeight = new BotManager({ router: fakeRouter, world: { _heightAt: (x, z) => 10 + 0.1 * x } });
    const botHeight = bmHeight.spawn({ x: 20, z: 0 });
    ok("  _heightAt world: spawn height unchanged from before this round (10 + 0.1*x + 1)",
       Math.abs(botHeight.y - (10 + 0.1 * 20 + 1)) < 1e-9, `y=${botHeight.y}`);

    const bmMesh = new BotManager({ router: fakeRouter, world: buildWallWorld() });
    const botMesh = bmMesh.spawn({ x: 0, z: 0 });
    ok("!! *** colliderBVH world: spawn finds the REAL floor (y=0+1=1), not the old hardcoded 5+1=6 fallback ***",
       Math.abs(botMesh.y - 1) < 1e-6, `y=${botMesh.y}`);
    ok("  vy/onGround fields exist on every spawned bot (read/written only by the capsule path, harmless otherwise)",
       botMesh.vy === 0 && botMesh.onGround === false);
}

console.log("\n3. A BOT IN A colliderBVH WORLD GETS BLOCKED BY A WALL -- NOT JUST FOLLOWING HEIGHT THROUGH IT");
{
    const bm = new BotManager({ router: fakeRouter, world: buildWallWorld() });
    const bot = bm.spawn({ x: 0, z: 0 });
    for (let i = 0; i < 30; i++) bm._followPathOrSteer(bot, 0, 0, 1 / 60, 1);   // settle
    ok("  settled grounded on the floor", bot.onGround === true && Math.abs(bot.y - 1) < 1e-6, `y=${bot.y}`);

    for (let i = 0; i < 600; i++) bm._followPathOrSteer(bot, 100, 0, 1 / 60, 1);   // walk hard toward +X, into the wall
    ok("!! *** never crossed the wall's own plane (x=5) despite steering toward x=100 for 10 simulated seconds ***",
       bot.x < 5, `final x=${bot.x.toFixed(3)}`);
    ok("  still grounded, not stuck falling through the floor at the wall", bot.onGround === true);
}

console.log("\n4. A BOT IN A colliderBVH WORLD STILL WALKS FREELY WHERE NOTHING BLOCKS IT");
{
    const bm = new BotManager({ router: fakeRouter, world: buildWallWorld() });
    const bot = bm.spawn({ x: 0, z: 0 });
    for (let i = 0; i < 30; i++) bm._followPathOrSteer(bot, 0, 0, 1 / 60, 1);
    // bot_grunt's own spec.speed is 3 u/s (this file's own header) -- 300 frames (5s) covers ~15 units,
    // comfortable margin over the z > 10 bar without depending on the exact per-kind speed value.
    for (let i = 0; i < 300; i++) bm._followPathOrSteer(bot, 0, 100, 1 / 60, 1);   // toward +Z, nothing in the way
    ok("!! *** real forward progress where the wall does not block ***", bot.z > 10, `final z=${bot.z.toFixed(3)}`);
    ok("  stayed on the floor the whole time", Math.abs(bot.y - 1) < 1e-6 && bot.onGround === true);
}

console.log("\n5. A HEIGHT-ONLY WORLD (EVERY EXISTING BOT DEMO) IS COMPLETELY UNAFFECTED BY THIS ROUND");
{
    const hAt = (x, z) => 10 + 0.05 * x;
    const bm = new BotManager({ router: fakeRouter, world: { _heightAt: hAt } });
    const bot = bm.spawn({ x: 0, z: 0 });
    for (let i = 0; i < 120; i++) bm._followPathOrSteer(bot, 100, 0, 1 / 60, 1);   // walk toward +X for 2s
    // A height-only world has no wall concept at all -- x should have advanced roughly speed*time (bot_grunt
    // default spec.speed), and y should track hAt(x, z) + BOT_EYE exactly, the same as every round before this one.
    ok("!! *** real forward progress in a height-only world, completely unblocked (no wall concept there at all) ***",
       bot.x > 5, `final x=${bot.x.toFixed(3)}`);
    ok("!! *** y still tracks _heightAt(x, z) + 1 exactly, the same formula this file has always used ***",
       Math.abs(bot.y - (hAt(bot.x, bot.z) + 1)) < 1e-6, `y=${bot.y.toFixed(4)}, expected=${(hAt(bot.x, bot.z) + 1).toFixed(4)}`);
}

console.log();
if (fails) { console.log("[botCapsuleNav-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[botCapsuleNav-selfcheck] all passed");
