// WebGLEngine/tools/ship/escapeEnv-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/escapeEnv-selfcheck.mjs      (a few seconds, arithmetic; it trains nothing but two iterations of the trainer on the environment, to see that the trainer drives it)
//
// THE GATE OF THE ESCAPE ENVIRONMENT (brain/rl/escapeEnv.mjs; backlog `fly-escapes-home`): a fly feeds in the yard of its voxel house and runs home from what is on a collision course.
//   1  THE WORLD         the house stands whole in real voxels; walls and windows are in the way and the door is the way in; the ways home and to the food; the food
//   2  THE BODY          one number: home, or food; half a cell a tick along the shortest way; feeding only at the food
//   3  THE MOVERS        a strike pursues and catches in the open, and gives up on a fly in its room; a pass misses by 3 to 6 cells and harms nothing; when they come
//   4  THE OBSERVATION   the angular size, the looming rate and the bearing rate, as an eye at the fly would have them; the rates through noise
//   5  THE RETURN AND THE FLOORS   half for the time fed, half for living; the four flies written by hand and one that is told the mover's kind, on 200 episodes
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, the file restored and its sha256 checked), this gate run whole for each; the number is the rows that went red:
//   THE WORLD AND THE BODY: E1 the walls can be walked through 7 | E2 the fly walks a cell a tick 5 | E3 below 0 is home 11 | E4 the fly feeds wherever it is 3 | E14 the way counts a diagonal step 5
//   E15 the food any distance from home 5 | E17 the house not built 9 | E18 the last house left standing 4 | E26 the door's cell is home 5
//   THE MOVERS: E6 a strike does not give up on a fly in its room 4 | E7 a fly in its room can be caught 3 | E8 a pass aimed at the fly 4 | E19 a mover starts from the yard's corner 6
//   E20 a mover comes the tick the last one went 6 | E23 a strike flies straight 9 | E25 every mover a strike 7
//   THE OBSERVATION AND THE RETURN: E9 the looming rate seen without noise 1 | E10 the size not doubled 1 | E11 the looming rate's sign turned 4 | E24 the bearing rate always 0 4 | E12 living worth nothing 3
//   E13 a tick fed worth double 5 | E16 the reflex fly does not ask the bearing 2 | E21 the last step always says the fly lived 1 | E22 dist is the return 1
//   ONE WENT 0 RED AND IS EQUIVALENT: E5 (the fly feeds on a tick it chose home) -- the body walks before it feeds, and a fly told to go home has always left its food's centre by then.
"use strict";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, SEEDS = Array.from({ length: 200 }, (_, k) => 900001 + 7919 * k), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const cell = (x, z) => (z - E.YARD_LO) * E.YARD + (x - E.YARD_LO);
/** One episode with act(obs, env); what happened. */
function fly(env, seed, act, each) { let o = env.reset(seed), done = false, ret = 0, info = null; while (!done) { const r = env.step(act(o, env)); ret += r.reward; if (each) each(r, env); o = r.obs; done = r.done; info = r.info; } return { ret, info, caught: env.caught, fed: env.fed, log: env.log.slice() }; }
const over = (act) => { const env = new E.EscapeEnv(); let sum = 0, alive = 0, strikes = 0, caught = 0, passes = 0, fledPass = 0, fed = 0; for (const s of SEEDS) { const r = fly(env, s, act); sum += r.ret; fed += r.fed; if (!r.caught) alive++; for (const m of r.log) { if (m.kind === "strike") { strikes++; if (m.caught) caught++; } else { passes++; if (m.fled) fledPass++; } } } return { score: sum / SEEDS.length, alive, strikes, caught, passes, fledPass, fed: fed / SEEDS.length / E.MAX_STEPS }; };
const ORACLE = (o, env) => [env.mover && env.mover.kind === "strike" ? 1 : -1];

console.log("escapeEnv-selfcheck -- the fly escapes to its home: the world, the body, the movers, the observation, the return and the floors\n");

console.log("1. THE WORLD");
section(() => {
    const env = new E.EscapeEnv({ seed: 7 }), p = env.plan, door = p.door.find((c) => c.y === 0), v = (x, y, z) => env.world.voxelAt(env.at.x + x, env.at.y + y, env.at.z + z);
    ok("!! THE HOUSE STANDS WHOLE, IN REAL VOXELS: it is buildEnv's plan for the seed, every block of it is in the world, and buildEnv's own homeCheck calls it a home (roofed, a door, the room closed but for the door)", p.hash === B.homePlan(7).hash && p.cells.every((c) => v(c.x, c.y, c.z) === c.id) && B.homeCheck(env.world, p, env.at).home === true);
    const walls = p.cells.filter((c) => c.y === 0), room = []; for (let z = 1; z < p.d - 1; z++) for (let x = 1; x < p.w - 1; x++) room.push([x, z]);
    ok("!! THE WALLS ARE IN THE WAY AND THE DOOR IS THE WAY IN: a cell is walkable when its ground-level voxel is air -- no wall cell of the bottom layer is, the door's cell is, the room's cells are, and the yard is 14 x 14 cells around the 6 x 6 site",
        E.YARD === 14 && E.YARD_LO === -4 && env.walk.length === 196 && walls.length > 8 && walls.every((c) => env.walk[cell(c.x, c.z)] === 0) && !!door && env.walk[cell(door.x, door.z)] === 1 && room.length > 0 && room.every(([x, z]) => env.walk[cell(x, z)] === 1) && env.walk[cell(-4, -4)] === 1 && env.walk[cell(9, 9)] === 1);
    const out = [[door.x + 1, door.z], [door.x - 1, door.z], [door.x, door.z + 1], [door.x, door.z - 1]].find(([x, z]) => !(x >= 0 && z >= 0 && x < p.w && z < p.d)), hw = env.homeWay;
    let behind = null, far = 0; for (let z = E.YARD_LO; z < E.YARD_LO + E.YARD; z++) for (let x = E.YARD_LO; x < E.YARD_LO + E.YARD; x++) { const w = hw[cell(x, z)]; if (Number.isFinite(w) && w > far) { far = w; behind = [x, z]; } }
    const straight = Math.min(...room.map(([x, z]) => Math.abs(x - behind[0]) + Math.abs(z - behind[1])));
    ok("!! THE WAY HOME GOES THROUGH THE DOOR AND ROUND THE HOUSE: the room's cells are 0 steps from home, the door's cell 1, the cell outside it 2; every yard cell has a way; and the farthest cell's way is longer than its straight count of cells to the room (it goes round)",
        room.every(([x, z]) => hw[cell(x, z)] === 0) && hw[cell(door.x, door.z)] === 1 && !!out && hw[cell(out[0], out[1])] === 2 && Array.from(hw).every((w, i) => env.walk[i] === 0 || Number.isFinite(w)) && far > straight, `farthest ${far} steps, ${straight} straight`);
    const shut = Uint8Array.from(env.walk); shut[cell(door.x, door.z)] = 0; const sealed = E.wayField(shut, room);
    ok("!! ...AND ONLY THROUGH THE DOOR: with the door's cell shut the same field has no way home from any cell outside (wayField is a plain breadth-first count: 0 at its targets, 1 more a step, Infinity where there is none)", sealed[cell(out[0], out[1])] === Infinity && sealed[cell(-4, -4)] === Infinity && sealed[cell(room[0][0], room[0][1])] === 0 && J(Array.from(E.wayField(env.walk, [[-4, -4]])).slice(0, 3)) === J([0, 1, 2]));
    const foods = SEEDS.slice(0, 60).map((s) => { env.reset(s); const [x, z] = env.food, q = env.plan; return { way: env.homeWay[cell(x, z)], outside: !(x >= 0 && z >= 0 && x < q.w && z < q.d), start: env.x === x + 0.5 && env.z === z + 0.5 && env.atFood() && env.foodWay[cell(x, z)] === 0, key: `${x},${z}` }; });
    ok("!! THE FOOD IS A YARD CELL OUTSIDE THE HOUSE, 3 TO 8 STEPS FROM THE ROOM, the seed's; the fly starts on it; over 60 seeds the ways are spread over that range and the places differ", foods.every((f) => f.outside && f.way >= 3 && f.way <= 8 && f.start) && new Set(foods.map((f) => f.way)).size >= 5 && new Set(foods.map((f) => f.key)).size > 30 && J(E.FOOD_WAY) === J([3, 8]));
    const a = fly(new E.EscapeEnv(), 31, E.RULES.reflex), b = fly(new E.EscapeEnv(), 31, E.RULES.reflex), c = fly(new E.EscapeEnv(), 32, E.RULES.reflex), used = new E.EscapeEnv(); fly(used, 5, E.RULES.hide);
    ok("an episode is its seed's and nothing else's: the same seed twice is the same return and the same movers, another seed another; an environment that has flown another episode first gives the same, and the earlier house is taken down", a.ret === b.ret && J(a.log) === J(b.log) && J(a.log) !== J(c.log) && fly(used, 31, E.RULES.reflex).ret === a.ret && used.plan.hash === B.homePlan(31).hash && B.homeCheck(used.world, used.plan, used.at).home);
});

console.log("\n2. THE BODY");
section(() => {
    const env = new E.EscapeEnv(); env.reset(11); env.wait = 1e9;   // no mover in this section
    const way0 = env.homeWay[cell(...env.cellOf())], ways = []; let ticks = 0;
    while (!env.inRoom() && ticks < 100) { env.step([1]); ticks++; ways.push(env.homeWay[cell(...env.cellOf())]); }
    ok("!! ABOVE 0 THE FLY GOES HOME BY THE SHORTEST WAY, HALF A CELL A TICK: from its food, `way` steps from the room, it is in the room after 2 x way ticks (less the half cell at each end that a cell's centre saves), its count of steps home never rising; and once home it stays", env.inRoom() && ticks <= 2 * way0 && ticks >= 2 * way0 - 2 && ways.every((w, i) => i === 0 || w <= ways[i - 1]) && E.FLY_SPEED === 0.5 && (() => { const x = env.x, z = env.z; env.step([1]); env.step([0.001]); return env.inRoom() && Math.abs(env.x - x) + Math.abs(env.z - z) <= 1; })(), `${ticks} ticks for ${way0} steps`);
    const fedBefore = env.fed; let back = 0; while (!env.atFood() && back < 100) { env.step([-1]); back++; }
    const fedAt = env.fed; env.step([-1]); env.step([0]); env.step([NaN]); const fed3 = env.fed; env.step([1]); const afterFlee = env.fed;
    ok("!! AT 0 OR BELOW IT GOES BACK TO ITS FOOD AND FEEDS ONLY THERE: nothing is fed on the way home, in the room or on the way back; at the food each tick of -1, of 0 and of a number that is not one feeds once; a tick spent leaving does not", fedBefore === 0 && env.atFood() === false && back <= 2 * way0 + 1 && fedAt <= 1 && fed3 === fedAt + 3 && afterFlee === fed3);
    const still = new E.EscapeEnv(); still.reset(11); still.wait = 1e9; const r = still.step([-1]);
    ok("the fly never stands in a wall: over three episodes of the reflex fly every position is in a walkable cell of the yard", [3, 4, 5].every((s) => { const e = new E.EscapeEnv(); let good = true; fly(e, s, E.RULES.reflex, (_, en) => { const [x, z] = en.cellOf(); if (!en.walk[cell(x, z)]) good = false; }); return good; }) && r.reward === 0.5 / 160);
});

console.log("\n3. THE MOVERS");
section(() => {
    const stats = { strikes: 0, passes: 0, first: [], far: [], speed: [], closest: [], caughtAt: [], steady: true, passCaught: 0 };
    for (const s of SEEDS.slice(0, 120)) {
        const env = new E.EscapeEnv(); env.reset(s); let seen = null, least = Infinity, lastD = null, t = 0, done = false;
        while (!done) {
            const r = env.step([-1]); t++; done = r.done; const m = env.mover;
            if (m && m !== seen) { if (seen === null) stats.first.push(t); seen = m; least = Infinity; lastD = null; const d0 = Math.hypot(m.x - env.x, m.z - env.z); stats.far.push(d0); stats.speed.push(m.speed); if (m.kind === "strike") stats.strikes++; else stats.passes++; }
            if (m) { const d = Math.hypot(m.x - env.x, m.z - env.z); least = Math.min(least, d); if (m.kind === "strike" && lastD !== null && d > 1 && Math.abs((lastD - d) - m.speed) > 1e-9) stats.steady = false; lastD = d; m._least = least; }
        }
        for (const m of env.log) { if (m.kind === "pass" && m.caught) stats.passCaught++; if (m.kind === "strike" && m.caught) stats.caughtAt.push(m.age); }
        if (seen && seen.kind === "pass" && seen._least !== undefined && env.log.includes && env.log.some((l) => l.kind === "pass")) stats.closest.push(seen._least);
    }
    const mn = (a) => Math.min(...a), mx = (a) => Math.max(...a);
    ok("the movers' numbers are the header's: starts 12 to 16 cells off, 0.4 to 0.7 cells a tick, a miss of 3 to 6, gone 6 cells past, a gap of 6 to 14 ticks, half strikes, a disc 0.6 in radius", J([E.BIRD_START, E.BIRD_SPEED, E.PASS_MISS, E.PASS_BEYOND, E.GAP, E.P_STRIKE, E.BIRD_RADIUS]) === J([[12, 16], [0.4, 0.7], [3, 6], 6, [6, 14], 0.5, 0.6]));
    ok("!! WHEN THEY COME AND FROM WHERE: the first mover appears 6 to 14 ticks in; every mover starts 12 to 16 cells from the fly (the spawn is before its first move) at 0.4 to 0.7 cells a tick; about half are strikes",
        mn(stats.first) >= 6 && mx(stats.first) <= 15 && mn(stats.far) > 12 - 0.71 && mx(stats.far) <= 16 && mn(stats.speed) >= 0.4 && mx(stats.speed) <= 0.7 && stats.strikes / (stats.strikes + stats.passes) > 0.4 && stats.strikes / (stats.strikes + stats.passes) < 0.6, `${stats.strikes} strikes, ${stats.passes} passes, first at ${mn(stats.first)} to ${mx(stats.first)}`);
    ok("!! A STRIKE PURSUES AND CATCHES A FLY IN THE OPEN: at a fly that never leaves its food it closes by its speed every tick, and catches it (within 0.7) after 17 to 40 ticks; A PASS HARMS NOTHING: no fly is caught by one, and a pass comes no nearer a still fly than about 3 cells",
        stats.steady && stats.caughtAt.length > 80 && mn(stats.caughtAt) >= 17 && mx(stats.caughtAt) <= 41 && stats.passCaught === 0 && stats.closest.length > 5 && mn(stats.closest) > 2.7 && E.CATCH === 0.7, `${stats.caughtAt.length} caught at ${mn(stats.caughtAt)} to ${mx(stats.caughtAt)} ticks; passes' closest ${mn(stats.closest).toFixed(2)}`);
    const home = over(E.RULES.hide), free = over(E.RULES.freeze);
    ok("!! A FLY IN ITS ROOM IS GIVEN UP ON, AND A FLY THAT NEVER RUNS IS CAUGHT BY ITS FIRST STRIKE: 200 episodes of the fly that hides meet 618 strikes and none catches it; 200 of the fly that freezes meet 177 strikes and every one catches it (the 23 that live met none)",
        home.strikes === 618 && home.caught === 0 && home.alive === 200 && free.strikes === 177 && free.caught === 177 && free.alive === 23, `${home.strikes} ${home.caught} | ${free.strikes} ${free.caught} ${free.alive}`);
    const all = over(E.RULES.fleeAll);
    ok("!! GOING AT ONCE IS IN TIME, ALMOST ALWAYS: the fly that goes home for everything meets 513 strikes and 2 catch it (the longest way against the fastest strike) -- so what is left to learn is which to go for, not how fast", all.strikes === 513 && all.caught === 2 && all.alive === 198 && all.fledPass === all.passes && all.passes === 379);
});

console.log("\n4. THE OBSERVATION");
section(() => {
    const env = new E.EscapeEnv(); let o = env.reset(900001), strikeObs = [], passObs = [], firstPass = [], noisy = 0, exact = 0, lastSize = null;
    ok("an observation is 13 numbers; before any mover the first six are 0, the fly is at its food, 0 steps from it and its way from home, and the last two are the episode's noise", o.length === 13 && E.OBS_DIM === 13 && E.ACT_DIM === 1 && J(Array.from(o.slice(0, 6))) === J([0, 0, 0, 0, 0, 0]) && o[9] === 1 && o[7] === 0 && near(o[6], env.homeWay[cell(...env.cellOf())] / 10, 1e-6) && o[8] === 0 && o[10] === 0 && Math.abs(o[11]) <= 1 && o[11] !== o[12]);
    for (const s of SEEDS.slice(0, 80)) {
        const e = new E.EscapeEnv(); e.reset(s); let done = false, prev = null, age = 0, cur = null;
        while (!done) {
            const r = e.step([-1]); done = r.done; const m = e.mover, ob = r.obs;
            if (m !== cur) { cur = m; age = 0; prev = null; }
            if (m) { const st = e.sight(); age++;
                if (!near(ob[1], Math.min(1, 2 * 2 * Math.atan(0.6 / st.d)), 1e-6) || !near(ob[4], Math.cos(st.bearing), 1e-6) || !near(ob[5], Math.sin(st.bearing), 1e-6) || ob[0] !== 1) exact++;
                if (prev) { const want = (st.size - prev.size) * 20, ratio = Math.abs(want) > 1e-6 && Math.abs(ob[2]) < 1 ? ob[2] / want : 1; if (ratio < 0.8 - 1e-6 || ratio > 1.2 + 1e-6) noisy++; (m.kind === "strike" ? strikeObs : passObs).push([ob[2], ob[3]]); if (m.kind === "pass" && age === 2) firstPass.push(Math.abs(ob[3])); }
                else if (ob[2] !== 0 || ob[3] !== 0) exact++;
                prev = st; }
            else if (ob[0] !== 0 || ob[1] !== 0) exact++;
        }
    }
    ok("!! WHAT AN EYE AT THE FLY WOULD HAVE: with a mover there, the size is 2 atan(0.6 / its distance) (x 2), the bearing's cosine and sine are the direction to it, and on a mover's first tick the two rates are 0 (there is no tick before to compare); with none, nothing", exact === 0);
    ok("!! THE LOOMING RATE IS THE SIZE'S CHANGE A TICK (x 20) SEEN THROUGH 20 PERCENT NOISE: every reading is within a fifth of the true change, and they are not the true change (the noise is there)", noisy === 0 && strikeObs.length > 500 && E.RATE_NOISE === 0.2 && strikeObs.some(([l]) => l > 0) && (() => { const e = new E.EscapeEnv(); e.reset(900001); let off = 0, n = 0, pv = null, done = false; while (!done) { const r = e.step([-1]); done = r.done; const st = e.sight(); if (st && pv && e.mover.age > 1) { n++; if (Math.abs(r.obs[2] - (st.size - pv.size) * 20) > 1e-7) off++; } pv = st; } return n > 10 && off > n / 2; })());
    const sMax = Math.max(...strikeObs.map(([, b]) => Math.abs(b))), pMin = Math.min(...firstPass);
    ok("!! *** THE COLLISION COURSE IS A STEADY BEARING: for a fly that stays at its food a strike's bearing rate reads 0 on every tick, and a pass's is never under the reflex's threshold on its first comparison *** -- a strike looms on every tick; that is the cue the reflex fly uses", sMax < 1e-9 && pMin > E.REFLEX.steady && E.REFLEX.steady === 0.02 && strikeObs.every(([l]) => l > 0) && firstPass.length > 30, `strikes' largest ${sMax.toExponential(1)}; passes' least ${pMin.toFixed(4)}`);
    const walk = new E.EscapeEnv(); walk.reset(900001); let moved = 0, d2 = false; while (!d2) { const m0 = walk.mover, r = walk.step([m0 && m0.kind === "strike" ? 1 : -1]); d2 = r.done; if (walk.mover && walk.mover.kind === "strike" && walk.mover.age > 1 && Math.abs(r.obs[3]) > E.REFLEX.steady) moved++; }
    ok("!! ...AND THE FLY'S OWN WALKING UNSTEADIES IT, AS IT WOULD AN EYE'S: once the fly runs, a strike's bearing rate reads above the threshold on some ticks -- which is why the reflex fly stops asking for a steady bearing once it has left its food", moved > 0, `${moved} ticks`);
});

console.log("\n5. THE RETURN AND THE FLOORS (200 episodes, seeds 900001 + 7919 k)");
section(() => {
    const env = new E.EscapeEnv(), a = fly(env, 900001, E.RULES.hide), b = fly(env, 900001, E.RULES.freeze), c = fly(env, 900009, E.RULES.reflex);
    ok("!! AN EPISODE'S RETURN IS HALF THE SHARE OF THE TIME FED PLUS HALF FOR LIVING: the fly that hides returns 0.5 exactly (alive, fed nothing); one that is caught returns only what it fed; and the last step's info says so (docked = lived, crashed = caught, dist = 1 - the return)",
        a.ret === 0.5 && a.fed === 0 && !a.caught && b.caught && near(b.ret, 0.5 * b.fed / 160, 1e-12) && b.fed > 0 && near(c.ret, 0.5 * c.fed / 160 + (c.caught ? 0 : 0.5), 1e-12) && a.info.docked === true && a.info.crashed === false && b.info.docked === false && b.info.crashed === true && near(b.info.dist, 1 - b.ret, 1e-12) && E.MAX_STEPS === 160);
    const F = Object.fromEntries(Object.entries(E.RULES).map(([n, act]) => [n, over(act)])), O = over(ORACLE);
    console.log(`     freeze ${F.freeze.score.toFixed(4)} (${F.freeze.alive} live) | hide ${F.hide.score.toFixed(4)} | fleeAll ${F.fleeAll.score.toFixed(4)} (${F.fleeAll.alive}) | reflex ${F.reflex.score.toFixed(4)} (${F.reflex.alive}) | told the kind ${O.score.toFixed(4)} (${O.alive})`);
    ok("!! *** THE FLOORS, FOUR FLIES WRITTEN BY HAND: freeze 0.2840 (23 of 200 live), hide 0.5000 (200), fleeAll 0.5395 (198, fed 0.09 of the time), reflex 0.6465 (156, fed 0.51) *** -- each better than the one before; and the reflex fly leaves its food for 81 of 328 passes where fleeAll leaves for all of its",
        near(F.freeze.score, 0.2840) && F.freeze.alive === 23 && F.hide.score === 0.5 && near(F.fleeAll.score, 0.5395) && F.fleeAll.alive === 198 && near(F.fleeAll.fed, 0.089, 5e-4) && near(F.reflex.score, 0.6465) && F.reflex.alive === 156 && near(F.reflex.fed, 0.513, 5e-4) && F.reflex.passes === 328 && F.reflex.fledPass === 81 && J(Object.keys(E.RULES)) === J(["freeze", "hide", "fleeAll", "reflex"]));
    ok("!! AND THE ROOM ABOVE THEM: a fly that is TOLD each mover's kind (which no observation carries) and goes home for the strikes alone scores 0.8351 and lives in 198 of 200 -- so the reflex stands at about a third of the way from fleeAll to it, and it is caught by 44 of its 410 strikes", near(O.score, 0.8351) && O.alive === 198 && F.reflex.strikes === 410 && F.reflex.caught === 44 && O.score > F.reflex.score + 0.15);
    const res = trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 40, ...o }), obsDim: E.OBS_DIM, actDim: E.ACT_DIM, maxSteps: 40, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901 }), res2 = trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 40, ...o }), obsDim: E.OBS_DIM, actDim: E.ACT_DIM, maxSteps: 40, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901 });
    ok("the trainer drives it: two iterations of trainDockES on the environment (13 inputs, 1 output, 40 ticks) end at weights, the same twice, with a history whose returns are shares", res.params.length === 13 * 16 + 16 + 16 * 16 + 16 + 16 + 1 && J(Array.from(res.params)) === J(Array.from(res2.params)) && res.history.length >= 1 && res.history.every((h) => h.avgReturn >= 0 && h.avgReturn <= 1));
});

console.log(`\nescapeEnv-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
