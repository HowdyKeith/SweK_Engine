// WebGLEngine/tools/ship/buildEnv-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/buildEnv-selfcheck.mjs      (a second or two; nothing is trained beyond two iterations of a trainer)
//
// THE GATE OF brain/rl/buildEnv.mjs (backlog `voxel-home`, stage V1): a home built one block at a time in the voxel world.
//   1  THE PLAN             a hollow house from the tree's building grammar: walls, a roof, the facade's windows and door, and a room inside
//   2  THE ENVIRONMENT      the policy chooses a column; the block and its height are the plan's; a block must be held up; a choice that cannot be placed is a step spent
//   3  A HOME'S FUNCTION    read off the voxels: roofed, a door, the room closed but for the door -- the rule that always finishes builds one every time, a random builder never
//   3b THE DRAWN CHOICE     the second way to choose: 36 numbers, the column drawn by their chances with the episode's own stream; what leaning to the unfinished columns builds
//   4  THE TRAINER          brain/rl/dockPolicy.js's trainDockES drives it, with its own MLP and with a circuit-wired policy
// SABOTAGE LOG (2026-11-13) -- through a byte-safe runner (one at a time, the file restored and its sha256 checked), the gate run whole; every one red by name (the number is the rows that went red):
//   E1 the house is solid: the room is filled 9 | E2 the door is bricked up in the plan 7 | E3 the windows are stone 2 | E4 the roof covers only the walls 6 | E5 a block needs nothing to hold it 4
//   E6 a block may hang from the one above its neighbour 2 | E7 a block beside a block is not held 6 | E8 a refused choice costs no step 1 | E9 the reward is 1 a block 2 | E10 x and z swapped in the action 8
//   E11 the last home is left standing at reset 4 | E13 the noise is the same for every seed 1 | E14 the check calls an open roof roofed 1 | E15 the flood cannot climb 1 | E16 a home needs no door 1
//   E17 the check does not ask the material 1 | E19 the block placed is the column's highest missing 6 | E20 96 steps are 80 5 | E21 the site's corner moved 2 | E22 no ground is laid 2 | E24 the footprint is always 5 by 5 4
//   E25 the way in is not looked for 1 | E26 the planOf option is ignored 1 | E12' the observation does not move as blocks go in 1 | E18' the episode does not end when the home is built 1
//   TWO WENT 0 RED, AND EACH IS A ROW NOW: E12 (nothing read the observation after a block went in) and E18 (nothing asked whether the last block ends the episode). E12' and E18' are those again.
//   E23 (the rule that always finishes does not ask whether a block is held): 0 RED, AND EQUIVALENT -- taken in the site's order, every column before a block's own is already finished, so its block is
//   always held; the 200 homes of section 3 are the same 200 either way. The test in the rule is belt and braces, said here so that nobody reads it as load-bearing.
//   THE DRAWN CHOICE'S (section 3b, 2026-11-14), the same runner, each red by name: D1 the gain is 2 3 | D2 the numbers are not held to [-1, 1] 1 | D3 the draw is Math.random's 2 | D4 the draw always takes the likeliest column 2
//     D5 the drawn choice is the default 8 | D6 a drawn env still says 2 actions 1 | D7 an unknown choice is taken as named 1 | D8 the draw uses the same number at every step of an episode 1
//     D9 the chances are the numbers, not their exponentials 3. One row of 3b was wrong when written (it compared a chance across two actions whose other columns differ) and was corrected before these ran.
"use strict";
import { miniWorld } from "../../render/voxelDevice.mjs";
import { buildingGrammar } from "../../world/buildingGrammar.mjs";
import { facadeSpecFor, facadeVoxels, FACADE } from "../../world/buildingFacade.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { painterFactory, weightCountOf } from "../../brain/rl/paintCircuitPolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, SEEDS = Array.from({ length: 200 }, (_, k) => k + 1);
const lcg = (s) => { let x = s >>> 0 || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
const actionOf = (x, z) => [(x + 0.5) / B.SITE * 2 - 1, (z + 0.5) / B.SITE * 2 - 1];
const siteVoxels = (env) => { const out = []; for (let y = 0; y < B.LAYERS; y++) for (let z = 0; z < B.SITE; z++) for (let x = 0; x < B.SITE; x++) { const id = env.world.voxelAt(env.at.x + x, env.at.y + y, env.at.z + z); if (id) out.push({ x, y, z, id }); } return out; };
const build = (env, seed) => { env.reset(seed); let n = 0; for (;;) { const a = B.greedyColumn(env); if (!a) break; n++; if (env.step(a).done) break; } return n; };

console.log("buildEnv-selfcheck -- a home built one block at a time in the voxel world: the plan, the environment, what makes it a home, the trainer\n");

console.log("1. THE PLAN");
section(() => {
    const plans = SEEDS.map((s) => B.homePlan(s)), at = (p, x, y, z) => p.cells.find((c) => c.x === x && c.y === y && c.z === z);
    ok("!! a footprint 4 to 6 voxels a side, every size among 200 seeds, three wall layers and a roof layer", plans.every((p) => p.w >= 4 && p.w <= 6 && p.d >= 4 && p.d <= 6) && new Set(plans.map((p) => p.w + "x" + p.d)).size === 9 && B.WALL_LAYERS === 3 && B.LAYERS === 4 && B.SITE === 6);
    ok("!! THE HOUSE IS HOLLOW: no block of any plan is inside the walls below the roof, and the roof covers the whole footprint", plans.every((p) => p.cells.every((c) => c.y === 3 || c.x === 0 || c.z === 0 || c.x === p.w - 1 || c.z === p.d - 1) && p.cells.filter((c) => c.y === 3).length === p.w * p.d && p.cells.filter((c) => c.y === 3).every((c) => c.id === B.BLOCKS.roof)));
    ok("!! EVERY PLAN HAS A DOOR: two voxels of air, one over the other from the ground, in the front wall and not in a corner; and the blocks are the walls' ring three high, less the door, plus the roof", plans.every((p) => p.door.length === 2 && p.door[0].y === 0 && p.door[1].y === 1 && p.door[0].x === p.door[1].x && p.door.every((c) => c.z === p.d - 1 && c.x > 0 && c.x < p.w - 1 && !at(p, c.x, c.y, c.z)) && p.blocks === 3 * (2 * p.w + 2 * p.d - 4) - 2 + p.w * p.d && p.blocks === p.cells.length),
        `${Math.min(...plans.map((p) => p.blocks))} to ${Math.max(...plans.map((p) => p.blocks))} blocks`);
    // the windows and the door are the facade's own, computed here from the grammar
    const same = plans.every((p) => { const rect = { x: 0, z: 0, w: p.w, d: p.d, h: 4 }, o = facadeVoxels(rect, buildingGrammar(p.seed, facadeSpecFor(rect))), glass = o.filter((v) => v.mat === FACADE.glass), air = o.filter((v) => v.mat === FACADE.air);
        return glass.length === p.windows && glass.every((v) => at(p, v.dx, v.dy, v.dz)?.id === B.BLOCKS.glass && v.dy === 1) && J(air.map((v) => [v.dx, v.dy, v.dz]).sort()) === J(p.door.map((c) => [c.x, c.y, c.z]).sort()) && p.cells.filter((c) => c.id === B.BLOCKS.glass).length === glass.length; });
    ok("!! THE WINDOWS AND THE DOOR ARE THE TREE'S FACADE'S: world/buildingGrammar.mjs run on the footprint and world/buildingFacade.mjs's facadeVoxels, computed here, give each plan's glass (the middle wall layer) and its door; every other wall block is stone", same && plans.every((p) => p.cells.every((c) => c.y === 3 || c.id === B.BLOCKS.wall || c.id === B.BLOCKS.glass)) && plans.some((p) => p.windows > 4) && B.BLOCKS.glass === FACADE.glass,
        `0 to ${Math.max(...plans.map((p) => p.windows))} windows`);
    ok("a plan is its seed's: the same twice, 200 seeds nearly 200 plans, and each column lists its blocks from the bottom up", J(B.homePlan(7)) === J(B.homePlan(7)) && new Set(plans.map((p) => p.hash)).size > 150 && plans.every((p) => p.columns.length === 36 && p.columns.every((col, k) => col.every((c, i) => c.x === k % 6 && c.z === Math.floor(k / 6) && (i === 0 || c.y > col[i - 1].y))) && p.columns.reduce((a, c) => a + c.length, 0) === p.blocks));
});

console.log("\n2. THE ENVIRONMENT");
section(() => {
    const env = new B.BuildEnv(), p = env.plan;
    ok("the painter's interface: 40 observations (the 6 x 6 site, the share missing, the step, two noise draws), 2 actions, 96 steps -- and no plan needs more than 96 blocks", env.obsDim === 40 && env.actDim === 2 && B.OBS_DIM === 40 && B.ACT_DIM === 2 && env.maxSteps === 96 && B.MAX_STEPS === 96 && SEEDS.every((s) => B.homePlan(s).blocks <= 96));
    const o0 = env.reset(1);
    ok("!! at the start the observation is the plan: each column's share of the four layers the house still needs there, the whole of the plan missing, step 0, and two noise draws in [-1, 1] that are the seed's", env.plan.columns.every((c, k) => Math.abs(o0[k] - c.length / 4) < 1e-7) && o0[36] === 1 && o0[37] === 0 && Math.abs(o0[38]) <= 1 && Math.abs(o0[39]) <= 1 && J(Array.from(env.reset(1))) === J(Array.from(o0)) && (env.reset(2)[38] !== o0[38]));
    env.reset(1);
    ok("an action is a column: each of the two numbers cut into six, the ends and what is not a number included", env.columnFor([-1, -1]) === 0 && env.columnFor([1, 1]) === 35 && env.columnFor([0.99, -0.99]) === 5 && env.columnFor([-0.99, 0.99]) === 30 && env.columnFor([5, -5]) === 5 && env.columnFor([NaN, 0.001]) === 3 * 6 + 3 && J([0, 1, 2, 3, 4, 5].map((x) => env.columnFor(actionOf(x, 2)))) === J([12, 13, 14, 15, 16, 17]));
    // the block and its height are the plan's
    const r1 = env.step(actionOf(0, 0)), r2 = env.step(actionOf(0, 0)), v = (x, y, z) => env.world.voxelAt(env.at.x + x, env.at.y + y, env.at.z + z);
    ok("!! THE BLOCK AND ITS HEIGHT ARE THE PLAN'S: a corner column chosen twice takes its lowest block and then the one above, stone, as real voxels in the world at the site's corner (5, 1, 5), for 1/60 of the plan each", r1.info.last.placed.y === 0 && r2.info.last.placed.y === 1 && v(0, 0, 0) === B.BLOCKS.wall && v(0, 1, 0) === B.BLOCKS.wall && v(0, 2, 0) === 0 && env.world.voxelAt(5, 1, 5) === 1 && J(B.ORIGIN) === J({ x: 5, y: 1, z: 5 }) && p.blocks === 60 && Math.abs(r1.reward - 1 / 60) < 1e-12 && r2.info.placed === 2);
    ok("!! THE OBSERVATION FOLLOWS THE BUILDING: after those two blocks the corner column's share is down from 4/4 to 2/4 and no other column's has moved, the plan's missing share is 58/60, and the step is 2/96", Math.abs(r2.obs[0] - 0.5) < 1e-7 && Math.abs(o0[0] - 1) < 1e-7 && Array.from(r2.obs.subarray(1, 36)).every((x, k) => x === o0[k + 1]) && Math.abs(r2.obs[36] - 58 / 60) < 1e-7 && Math.abs(r2.obs[37] - 2 / 96) < 1e-7 && r2.obs[38] !== o0[38]);
    const before = J(siteVoxels(env)), r3 = env.step(actionOf(2, 1)), r4 = env.step(actionOf(5, 5));
    ok("!! A CHOICE THAT CANNOT BE PLACED IS A STEP SPENT AND NOTHING ELSE: a column of the room whose only block is the roof (nothing holds it up yet) and a column outside this 5 x 4 house each cost a step, earn nothing, change no voxel, and say why", r3.reward === 0 && r3.info.last.why === "nothing to hold the block up" && r4.reward === 0 && r4.info.last.why === "nothing left in that column" && J(siteVoxels(env)) === before && env.t === 4 && r4.info.rejected === 2 && r4.info.placed === 2 && env.plan.w === 5 && env.plan.d === 4);
    // the lintel over the door
    env.reset(1); const dx = env.plan.door[0].x, dz = env.plan.door[0].z, lint = env.step(actionOf(dx, dz));
    for (let k = 0; k < 3; k++) env.step(actionOf(dx - 1, dz));
    const lint2 = env.step(actionOf(dx, dz));
    ok("!! THE LINTEL WAITS FOR A WALL: the door's column has one wall block, over two voxels of air; it is refused on the bare ground, and placed once the wall beside it is three high -- with the two voxels under it still air", lint.info.last.why === "nothing to hold the block up" && lint2.info.last.placed && lint2.info.last.placed.y === 2 && v(dx, 2, dz) === B.BLOCKS.wall && v(dx, 0, dz) === 0 && v(dx, 1, dz) === 0);
    // every block ever placed was held up, on plays that choose at random
    let floating = 0, wrongId = 0, mismatch = 0, steps = 0, retSum = 0;
    for (const s of SEEDS.slice(0, 40)) {
        const e = new B.BuildEnv(), r = lcg(77 + s); e.reset(s); let done = false, ret = 0;
        while (!done) { const res = e.step([r() * 2 - 1, r() * 2 - 1]), c = res.info.last.placed; steps++; ret += res.reward; done = res.done;
            if (c) { const w = (x, y, z) => x >= 0 && z >= 0 && x < 6 && z < 6 && y >= 0 && e.world.voxelAt(e.at.x + x, e.at.y + y, e.at.z + z) !== 0; if (!(c.y === 0 || w(c.x, c.y - 1, c.z) || w(c.x + 1, c.y, c.z) || w(c.x - 1, c.y, c.z) || w(c.x, c.y, c.z + 1) || w(c.x, c.y, c.z - 1))) floating++; if (e.world.voxelAt(e.at.x + c.x, e.at.y + c.y, e.at.z + c.z) !== c.id) wrongId++; } }
        const chk = B.homeCheck(e.world, e.plan); if (chk.placed !== e.placed || chk.wrong !== 0 || siteVoxels(e).length !== e.placed) mismatch++; retSum += Math.abs(ret - (1 - e.missing()));
    }
    ok("!! NO BLOCK IS EVER PLACED WITH NOTHING TO HOLD IT: on 40 random builds (3,840 steps) every block placed rested on the ground, on a block, or against one in its layer, checked here on the voxels; what is in the world is exactly what was placed, each block the plan's material; and an episode's return is the share of the home built", floating === 0 && wrongId === 0 && mismatch === 0 && steps === 40 * 96 && retSum < 1e-9, `${steps} steps`);
    // done, and taking the last home down
    const e2 = new B.BuildEnv({ maxSteps: 5 }); let d = null; for (let k = 0; k < 5; k++) d = e2.step(actionOf(0, 0));
    env.reset(3); let last = null, count = 0; for (;;) { const act = B.greedyColumn(env); if (!act) break; last = env.step(act); count++; if (count > 200) break; }
    ok("!! THE EPISODE ENDS AT THE LAST BLOCK: built by the rule, the step that places the plan's last block says done and complete, well before the 96 steps are spent, and no step before it said done", last.done === true && last.info.complete === true && count === env.plan.blocks && env.t === count && count < 96 && (() => { env.reset(3); for (let k = 0; k < count - 1; k++) if (env.step(B.greedyColumn(env)).done) return false; return true; })(), `${count} steps`);
    const n = build(env, 3), full = siteVoxels(env).length; env.reset(4);
    ok("an episode ends when the home is built or the steps are spent; and reset takes the last home down, every block of it, leaving the ground", d.done && d.info.complete === false && e2.t === 5 && n === B.homePlan(3).blocks && full === n && siteVoxels(env).length === 0 && env.world.voxelAt(5, 0, 5) === B.BLOCKS.ground && env.world.voxelAt(4, 0, 11) === B.BLOCKS.ground);
    const mine = miniWorld(), e3 = new B.BuildEnv({ world: mine, at: { x: 20, y: 9, z: -3 }, planOf: (s) => B.homePlan(s + 100) }); e3.step(actionOf(0, 0));
    ok("the world, the place and the plan can be handed in: a block lands in the world given, at the corner given, of the plan given", mine.voxelAt(20, 9, -3) === B.BLOCKS.wall && e3.plan.hash === B.homePlan(101).hash && mine.voxelAt(20, 8, -3) === B.BLOCKS.ground);
});

console.log("\n3. A HOME'S FUNCTION");
section(() => {
    const env = new B.BuildEnv(); let homes = 0, exact = 0;
    for (const s of SEEDS) { const n = build(env, s), c = B.homeCheck(env.world, env.plan); if (c.home && c.complete && c.roofed && c.door && c.enclosed && c.entered) homes++; if (n === env.plan.blocks) exact++; }
    ok("!! THE RULE THAT ALWAYS FINISHES BUILDS A HOME EVERY TIME: 'the first column whose next block can be placed', on 200 plans, 200 homes -- every block, a roof, a door, the room closed but for the door -- in exactly as many steps as the plan has blocks", homes === 200 && exact === 200, `${homes} homes`);
    build(env, 1); const p = env.plan, set = (c, id) => env.world.setVoxel(env.at.x + c.x, env.at.y + c.y, env.at.z + c.z, id), chk = () => B.homeCheck(env.world, p), roofMid = p.cells.find((c) => c.y === 3 && c.x === 2 && c.z === 1), wall = p.cells.find((c) => c.y === 1 && c.x === 0 && c.z === 2);
    const whole = chk(); set(roofMid, 0); const hole = chk(); set(roofMid, B.BLOCKS.roof); set(wall, 0); const gap = chk(); set(wall, wall.id); set(p.door[0], 1); set(p.door[1], 1); const shut = chk(); set(p.door[0], 0); set(p.door[1], 0);
    env.world.setVoxel(env.at.x + 1, env.at.y, env.at.z + 1, 1); const junk = chk(); env.world.setVoxel(env.at.x + 1, env.at.y, env.at.z + 1, 0); set(wall, B.BLOCKS.roof); const wrongMat = chk(); set(wall, wall.id);
    ok("!! WHAT MAKES IT A HOME IS READ OFF THE VOXELS, each part by itself: a finished house is a home; one roof block out, and it is not roofed and the room is open to the sky; one wall block out, and the room is open; the door bricked up, and there is no door and no way in; a wall block of the wrong material is not the plan's",
        whole.home && !hole.roofed && !hole.enclosed && !hole.home && gap.roofed && !gap.enclosed && !gap.home && !shut.door && !shut.entered && shut.enclosed && !shut.home && !wrongMat.complete && wrongMat.wrong === 1 && !wrongMat.home && chk().home, J({ hole: [hole.roofed, hole.enclosed], gap: gap.enclosed, shut: [shut.door, shut.entered] }));
    ok("a block in the room that the plan does not have is not counted against the plan's blocks (the check reads the plan's cells), and the home stands", junk.placed === p.blocks && junk.complete);
    let sum = 0, rh = 0, least = 1, most = 0; for (const s of SEEDS) { const r = lcg(1000 + s); env.reset(s); let d = false; while (!d) d = env.step([r() * 2 - 1, r() * 2 - 1]).done; const f = 1 - env.missing(); sum += f; least = Math.min(least, f); most = Math.max(most, f); if (B.homeCheck(env.world, env.plan).home) rh++; }
    ok("!! A BUILDER THAT CHOOSES COLUMNS AT RANDOM BUILDS 57 PERCENT OF THE HOME AND NEVER A HOME: on the same 200 plans, 96 steps each, a mean share of 0.573 (0.39 to 0.77) and no house with a roof over a closed room", Math.abs(sum / 200 - 0.5731) < 5e-4 && rh === 0 && least > 0.38 && most < 0.78, `${(sum / 200).toFixed(4)}, ${least.toFixed(2)} to ${most.toFixed(2)}, ${rh} homes`);
    env.reset(1); ok("the rule is the first placeable column in the site's order, and has nothing to say once the home is built", env.columnFor(B.greedyColumn(env)) === 0 && (build(env, 1), B.greedyColumn(env) === null));
});

console.log("\n3b. THE DRAWN CHOICE (the option choice: \"drawn\", 2026-11-14)");
section(() => {
    const env = new B.BuildEnv({ choice: "drawn" }), named = new B.BuildEnv(), level = new Float32Array(36), one = Float32Array.from({ length: 36 }, (_, c) => (c === 7 ? 1 : -1));
    ok("!! the action is 36 numbers, one a column, and the default is still the named choice of 2: nothing that was built before this option chooses differently", env.actDim === 36 && env.obsDim === 40 && env.choice === "drawn" && named.actDim === 2 && named.choice === "named" && new B.BuildEnv({ choice: "named" }).actDim === 2);
    const pl = env.chancesFor(level), po = env.chancesFor(one), big = env.chancesFor(Float32Array.from({ length: 36 }, (_, c) => (c === 7 ? 50 : c === 8 ? NaN : -50)));
    ok("!! A COLUMN'S CHANCE IS PROPORTIONAL TO exp(4 x ITS NUMBER): the same number for every column is 1/36 each (a random builder exactly); one column at +1 against the rest at -1 is e^8 times as likely as any other; the numbers are held to [-1, 1] and what is not a number counts as 0",
        Array.from(pl).every((v) => Math.abs(v - 1 / 36) < 1e-12) && Math.abs(po[7] / po[0] - Math.exp(8)) < 1e-6 && Math.abs(Array.from(po).reduce((a, b) => a + b, 0) - 1) < 1e-12 && Math.abs(big[7] / big[0] - Math.exp(8)) < 1e-6 && Math.abs(big[8] / big[0] - Math.exp(4)) < 1e-9 && B.DRAW_GAIN === 4);
    // the draws follow the chances, and are the seed's
    const lean = Float32Array.from({ length: 36 }, (_, c) => (c < 6 ? 0.5 : -0.5)), want = env.chancesFor(lean), count = new Float64Array(36); let n = 0;
    for (let s = 1; s <= 60; s++) { env.reset(s); for (let t = 0; t < 96; t++) { env.step(lean); count[env.last.col]++; n++; if (env.placed === env.plan.blocks) break; } }
    const firstRow = Array.from(count.subarray(0, 6)).reduce((a, b) => a + b, 0) / n, wantRow = Array.from(want.subarray(0, 6)).reduce((a, b) => a + b, 0);
    const trace = (seed) => { env.reset(seed); const out = []; for (let t = 0; t < 30; t++) { env.step(level); out.push(env.last.col); } return out; };
    ok("!! THE DRAWS FOLLOW THE CHANCES AND ARE THE SEED'S: leaning to the site's first row, that row is drawn as often as its chance says (within 2 in 100 over thousands of steps), every column is drawn sometimes, and the same seed draws the same columns again while another seed draws others",
        Math.abs(firstRow - wantRow) < 0.02 && wantRow > 0.9 && Array.from(trace(3)).length === 30 && J(trace(3)) === J(trace(3)) && J(trace(3)) !== J(trace(4)) && new Set(trace(3)).size > 15, `${firstRow.toFixed(3)} against ${wantRow.toFixed(3)} over ${n} steps`);
    const play = (act) => { let sum = 0, homes = 0; for (const s of SEEDS) { let o = env.reset(s), d = false; while (!d) { const r = env.step(act(o)); o = r.obs; d = r.done; } sum += 1 - env.missing(); if (B.homeCheck(env.world, env.plan).home) homes++; } return { share: sum / 200, homes }; };
    const flat = play(() => level), unfinished = play((o) => Float32Array.from({ length: 36 }, (_, c) => (o[c] > 0 ? 1 : -1))), byShare = play((o) => Float32Array.from({ length: 36 }, (_, c) => o[c] * 2 - 1));
    ok("!! WHAT THERE IS TO LEARN, MEASURED ON PLANS 1 TO 200: saying the same of every column builds 0.571 of a home and no home (the random builder again); LEANING TO THE COLUMNS THE OBSERVATION SAYS ARE UNFINISHED builds 0.919 and 128 homes; leaning by how much each still needs, 0.975 and 127 -- so most of a home is one look at the observation away",
        Math.abs(flat.share - 0.5710) < 5e-4 && flat.homes === 0 && Math.abs(unfinished.share - 0.9187) < 5e-4 && unfinished.homes === 128 && Math.abs(byShare.share - 0.9749) < 5e-4 && byShare.homes === 127, J([flat, unfinished, byShare].map((x) => [x.share.toFixed(4), x.homes])));
    let threw = false; try { new B.BuildEnv({ choice: "guessed" }); } catch (e) { threw = /"named" or "drawn"/.test(e.message); }
    ok("a choice that is neither is refused by name, and a drawn build still holds every block up (a refused draw is a step spent, as a named one is)", threw && (() => { env.reset(1); let spent = 0; for (let t = 0; t < 40; t++) { const r = env.step(level); if (!r.info.last.placed) spent++; } return spent > 0 && env.t === 40 && siteVoxels(env).length === env.placed; })());
});

console.log("\n4. THE TRAINER");
section(() => {
    const mk = (o = {}) => new B.BuildEnv({ maxSteps: 12, ...o }), opts = { envFactory: mk, obsDim: B.OBS_DIM, actDim: B.ACT_DIM, maxSteps: 12, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901 };
    const a = trainDockES({ ...opts, hidden: [16, 16] }), b = trainDockES({ ...opts, policyFactory: painterFactory("FLY", 901) }), b2 = trainDockES({ ...opts, policyFactory: painterFactory("FLY", 901) });
    ok("!! trainDockES DRIVES IT, as it drives the painter: with its own MLP (40-16-16-2: 962 weights) and with a policy wired as the fly's Giant Fiber Circuit (40 x 34 + 34 + 313 + 34 x 2 + 2 = 1,777 weights), the same weights twice, a share of the home missing as its distance",
        a.params.length === 962 && b.params.length === 1777 && weightCountOf(40, 2, 34, 313) === 1777 && J(Array.from(b.params)) === J(Array.from(b2.params)) && b.best.avgDist > 0 && b.best.avgDist <= 1 && a.best.avgDist > 0 && a.best.avgDist <= 1);
});

console.log(`\nbuildEnv-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
