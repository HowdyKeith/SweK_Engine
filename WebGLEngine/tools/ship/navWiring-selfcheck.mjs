// WebGLEngine/tools/ship/navWiring-selfcheck.mjs -- v4545
//
// Run: node tools/ship/navWiring-selfcheck.mjs
//
// *** GATES THE WIRING ITSELF, WHICH IS THE THING THREE ROUNDS IN A ROW SHIPPED WITHOUT. ***
//
// nav/funnel.mjs (v4254), nav/navmesh.mjs (v4543) and physics/character/terrainWalk.mjs (v4544) each landed
// with a gate, a measurement and no caller. Each of their gates says so in its own closing line. This one
// drives the REAL worker/botPathfinder.worker.js and the REAL simulation/BotManager.js -- shimming `self`
// and calling the worker's own onmessage, constructing BotManager against a fake world -- so every number
// below is the shipped code's, in the shape a caller actually hands it. The precedent is v4187's
// dungeonWalls-selfcheck, which drives simulation/DungeonAI.js the same way.
//
// *** AND WIRING FOUND A BUG THAT THREE GATES OF DESIGNED FIXTURES HAD NOT. *** The first realistic snapshot
// nav/navmesh.mjs was ever given -- the shape BotPathfinderPool sends, a heightmap padded 24 around the
// start/goal bbox -- returned 147.35 m against a taut 96.61, running out to the far edge of the map to reach
// a goal well inside it. Its portals were oriented from polygon CENTRES, which is right only while a
// polygon's centre lies roughly on the path through it, and every fixture in its own gate walked its
// corridor monotonically. That is now a row in navmesh-selfcheck section 5b; this file is why it exists.
"use strict";
import { BotManager } from "../../simulation/BotManager.js";
import { slopeDeg } from "../../physics/character/terrainWalk.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

globalThis.self = { onmessage: null, postMessage: (m) => { globalThis.__out = m; } };
await import("../../worker/botPathfinder.worker.js");

const HM_PADDING = 24;                      // BotPathfinderPool's own constant
/** The snapshot shape the pool builds: start/goal bbox padded 24, sampled at one unit. */
function snapshot(sep) {
    const w = sep + 2 * HM_PADDING + 1, d = 2 * HM_PADDING + 1 + 20;
    const hm = new Int16Array(w * d);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
        let y = Math.round(3 + 2 * Math.sin(x * 0.08) * Math.cos(z * 0.11));
        if (x > w * 0.45 && x < w * 0.55 && z < d - 12) y += 40;      // a wall with a gap at the far end
        hm[z * w + x] = y;
    }
    return { hm, w, d };
}
// *** maxSearch IS THE POOL'S OWN 800 AND NOT funnel-selfcheck's 500000, AND THE DIFFERENCE IS SECONDS. ***
// simulation/BotPathfinderPool.js sends `opts.maxSearch ?? 800` -- "smaller than PathPlanner, bot tasks" --
// so 800 is what the shipped caller uses and what this gate should measure. Copying the other gate's 500000
// cost 9,822 ms on ONE fuzz row: a stride of NaN makes the heightmap unreadable, the navmesh throws, and the
// grid A* then expands its full cap looking for a goal it can never reach. At 800 the same row is 4 ms. The
// grid A*'s cost under a malformed snapshot is bounded by nothing except maxSearch, which is worth knowing
// and is not a hazard at the pool's setting.
const plan = (hm, w, sx, sz, gx, gz, route, maxSearch = 800) => {
    globalThis.self.onmessage({ data: { cmd: "plan", id: 1, sx, sz, gx, gz, hm, hmStride: w,
        hmOriginX: 0, hmOriginZ: 0, gridSize: 4, waterLevel: null, maxStepUp: 3, maxStepDown: 6,
        maxSearch, slopePenalty: 0.35, route, agentRadius: 1.5 } });
    return globalThis.__out;
};
const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return L; };
/** Distance from a path to the wall's real cell squares -- independent of anything either route computed. */
function clearance(hm, w, d, pts) {
    const bad = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (hm[z * w + x] > 20) bad.push([x, z]);
    const dBox = (px, pz, cx, cz) => Math.hypot(Math.max(cx - 0.5 - px, 0, px - (cx + 0.5)), Math.max(cz - 0.5 - pz, 0, pz - (cz + 0.5)));
    let mn = Infinity;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L));
        for (let k = 0; k <= n; k++) {
            const t = k / n, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
            for (const [cx, cz] of bad) {
                if (Math.abs(cx - px) > mn + 2 || Math.abs(cz - pz) > mn + 2) continue;
                const dd = dBox(px, pz, cx, cz); if (dd < mn) mn = dd;
            }
        }
    }
    return mn;
}

console.log("navWiring-selfcheck -- the three capabilities, in the callers that now use them\n");

// =============================================================================================================
console.log("1. *** THE SHIPPED WORKER, BOTH ROUTES, ON THE SNAPSHOT SHAPE IT ACTUALLY RECEIVES ***");
{
    const rows = [];
    let allShorter = true, allSafer = true, allFewer = true;
    for (const sep of [80, 200]) {
        const { hm, w, d } = snapshot(sep);
        const sx = HM_PADDING, sz = Math.floor(d / 2), gx = HM_PADDING + sep, gz = Math.floor(d / 2);
        const nav = plan(hm.slice(), w, sx, sz, gx, gz, "navmesh");
        const grid = plan(hm.slice(), w, sx, sz, gx, gz, "grid");
        const nl = len(nav.path), gl = len(grid.path);
        const nc = clearance(hm, w, d, nav.path), gc = clearance(hm, w, d, grid.path);
        if (!(nl < gl)) allShorter = false;
        if (!(nc > gc)) allSafer = false;
        if (!(nav.path.length < grid.path.length)) allFewer = false;
        rows.push(`sep ${sep}: navmesh ${nl.toFixed(2)}/${nav.path.length}wp/clear ${nc.toFixed(3)} vs ` +
                  `grid ${gl.toFixed(2)}/${grid.path.length}wp/clear ${gc.toFixed(3)}`);
        report(rows[rows.length - 1]);
    }
    ok("!! *** THE NAVMESH ROUTE IS SHORTER, FURTHER FROM THE WALLS, AND FEWER WAYPOINTS -- ALL THREE ***",
        allShorter && allSafer && allFewer,
        "*** ALL THREE MATTER TOGETHER AND THE TREE ALREADY KNOWS WHY. *** funnel-selfcheck section 4 " +
        "measured a funnel over a GRID corridor at 302.20 m against a 318.39 m staircase -- shorter, and " +
        "walking through walls at 18 of 616 samples -- and insetting it to safety cost 319.59, LONGER than " +
        "what it improved. Shorter alone is the trap. A navmesh erodes the clearance in before the polygons " +
        "exist, so it pays for none of that.");
    ok("   ...and the route that answered is reported, so a caller can tell which one it got",
        plan(snapshot(80).hm, snapshot(80).w, HM_PADDING, 44, HM_PADDING + 80, 44, "navmesh").route === "navmesh" &&
        plan(snapshot(80).hm, snapshot(80).w, HM_PADDING, 44, HM_PADDING + 80, 44, "grid").route === "grid",
        "the OUT message carries route: \"navmesh\" | \"grid\"");
}

// =============================================================================================================
console.log("\n2. *** THE FALLBACK, WHICH IS THE REASON THE GRID A* IS KEPT RATHER THAN DELETED ***");
{
    const { hm, w, d } = snapshot(80);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (x > w * 0.45 && x < w * 0.55) hm[z * w + x] += 40;
    const sealed = plan(hm.slice(), w, HM_PADDING, Math.floor(d / 2), HM_PADDING + 80, Math.floor(d / 2), "navmesh");
    ok("!! a wall with NO gap: the navmesh declines and the grid is asked, rather than the caller losing its path",
        sealed.route === "grid",
        `route "${sealed.route}", found ${sealed.found}. A navmesh refuses a gap the agent does not fit -- ` +
        "which is a capability the grid does not have, since it tests only a cell's CENTRE -- but it also " +
        "refuses when erosion disconnects the start from the goal. Degrading to the previous behaviour beats " +
        "degrading to nothing, and this row is what says the old route is still reachable.");
    // *** A MALFORMED SNAPSHOT USED TO HANG THIS WORKER FOREVER, AND FUZZING THE MESSAGE IS WHAT FOUND IT. ***
    // stride 0 makes hm.length / stride INFINITY, Math.floor leaves it Infinity, and the build's row loop
    // never ends. A worker that throws costs its caller one fallback; a worker that HANGS is dead for the
    // life of the page and the bot it was planning for never gets another path. The three rows below are the
    // shapes that reach it, and the first row of this section is the healthy case they are contrasted with.
    const malformed = [
        ["stride 0", new Int16Array(400), 0],
        ["heightmap shorter than one row", new Int16Array(0), 4],
        ["stride wider than the data", new Int16Array(4), 100],
    ].map(([n, hm, w]) => {
        const t0 = Date.now();
        const r = plan(hm, w, 0, 0, 40, 40, "navmesh");
        return { n, route: r && r.route, ms: Date.now() - t0 };
    });
    ok("!! *** A MALFORMED SNAPSHOT THROWS AND FALLS BACK, RATHER THAN HANGING THE WORKER ***",
        malformed.every((m) => m.route === "grid" && m.ms < 1000),
        malformed.map((m) => `${m.n}: route "${m.route}" in ${m.ms} ms`).join("; ") +
        ". *** stride 0 LOOPED FOREVER BEFORE THE GUARD, *** because hm.length / 0 is Infinity and " +
        "`for (z = 0; z < rows; z++)` never terminates. buildNavmesh refuses a non-positive stride and a " +
        "heightmap shorter than one row outright now. Neither this module's gate nor the navmesh's own found " +
        "it -- both hand it well-formed arrays they built themselves.");
    // *** AND THE TWO GUARDS ARE NOT INTERCHANGEABLE, WHICH TOOK REMOVING THEM ONE AT A TIME TO ESTABLISH. ***
    // With both gone: stride 0 HANGS, stride -4 throws on its own, and strides 2.5 and NaN TERMINATE WITH
    // NONSENSE -- one polygon and zero polygons. So the rows check is what stops the hang and the stride
    // check is what stops the silent garbage. On stride 0 they overlap and this gate cannot tell them apart:
    // removing either alone leaves every row green, and only removing BOTH brings the hang back.
    const garbage = [2.5, NaN].map((w) => {
        const r = plan(new Int16Array(400), w, 0, 0, 40, 40, "navmesh");
        return r && r.route;
    });
    ok("   ...and a stride that is not a positive integer falls back rather than answering with nonsense",
        garbage.every((g) => g === "grid"),
        "strides 2.5 and NaN come back as route \"" + garbage.join("\", \"") + "\". UNGUARDED they build 1 " +
        "and 0 polygons respectively and return a path computed over a heightmap misread -- terminating, and " +
        "wrong. That is a different failure from the hang, and a different line stops it.");
}

// =============================================================================================================
console.log("\n3. *** simulation/BotManager.js FOLLOWS THE GROUND NOW, RATHER THAN SNAPPING TO IT ***");
{
    // flat to x=10, a 16.7-degree ramp to x=40, then a 40-unit wall
    const world = { _heightAt: (x, z) => (x < 40 ? 0.3 * Math.max(0, x - 10) : 0.3 * 30 + 40) };
    const bm = Object.create(BotManager.prototype);
    bm.world = world;
    const bot = { x: 0, y: 1, z: 0, yaw: 0, spec: { speed: 5 }, path: null, pathIdx: 0 };
    let worstOff = 0;
    for (let i = 0; i < 900; i++) {
        bm._followPathOrSteer(bot, 200, 0, 1 / 60, 1);
        worstOff = Math.max(worstOff, Math.abs(bot.y - (world._heightAt(bot.x, bot.z) + 1)));
    }
    ok("!! *** THE BOT IS ON THE SURFACE AT EVERY FRAME, worst deviation " + worstOff.toExponential(1) + " ***",
        worstOff < 1e-9 && bot.x > 30,
        "walked from x=0 to x=" + bot.x.toFixed(2) + " over 15 s, never off the ground by more than " +
        worstOff.toExponential(2) + ".");
    ok("!! *** ...AND IT STOPS AT THE WALL, WHICH THE OLD ONE-LINE SNAP COULD NOT DO AT ALL ***",
        bot.x > 39 && bot.x < 40,
        "final x " + bot.x.toFixed(2) + ", against a wall beginning at x=40 and a slope limit of 55 degrees. " +
        "*** THE CODE THIS REPLACED WROTE bot.y = _heightAt(x, z) + 1 AND NOTHING ELSE, *** so a vertical " +
        "cliff and a flat floor were the same line and no slope was ever too steep to walk up.");
    // the speed convention, against its closed form
    const b2 = { x: 12, y: 1 + 0.3 * 2, z: 0, yaw: 0, spec: { speed: 5 }, path: null, pathIdx: 0 };
    const x0 = b2.x; let t = 0;
    for (let i = 0; i < 60; i++) { bm._followPathOrSteer(b2, 200, 0, 1 / 60, 1); t += 1 / 60; }
    const hs = (b2.x - x0) / t, theta = Math.atan(0.3), c = Math.cos(theta);
    ok("!! *** ON THE RAMP IT MOVES AT 5*cos(theta) HORIZONTALLY, NOT AT 5 ***",
        Math.abs(hs - 5 * c) / (5 * c) < 2e-3,
        "measured " + hs.toFixed(4) + " /s against 5*cos(" + (theta * 180 / Math.PI).toFixed(1) + " deg) = " +
        (5 * c).toFixed(4) + ". The code this replaced moved at 5.0000 horizontally and therefore travelled " +
        (5 / c).toFixed(4) + " ALONG THE GROUND -- speed * sec(theta), so a bot climbing a hill outran one " +
        "on the flat. Neither convention is wrong; having one without choosing it is.");
    ok("   ...and a world with no _heightAt still moves the bot, on the old path",
        (() => {
            const b3 = { x: 0, y: 1, z: 0, yaw: 0, spec: { speed: 5 }, path: null, pathIdx: 0 };
            const bare = Object.create(BotManager.prototype); bare.world = {};
            for (let i = 0; i < 60; i++) bare._followPathOrSteer(b3, 100, 0, 1 / 60, 1);
            return b3.x > 4.9;
        })(),
        "5.00 units in one second with no ground oracle at all -- the fallback is reachable, and a bot that " +
        "stops moving is worse than a bot that climbs a cliff");
}

// =============================================================================================================
console.log("\n4. THE SLOPE REFUSAL IS A SLIDE, NOT A STICK -- WHICH IS THIS TREE'S OWN RULING");
{
    // v4187's dungeonWalls round: "refusing the move trades a monster that cheats for a monster that stands
    // at the wall waiting to be killed. Keith's call: when the path is gone, put a hand on the wall and walk."
    const world = { _heightAt: (x, z) => (x < 40 ? 0 : 40) };
    const bm = Object.create(BotManager.prototype); bm.world = world;
    const head = { x: 20, y: 1, z: 0, yaw: 0, spec: { speed: 5 }, path: null, pathIdx: 0 };
    const oblq = { x: 20, y: 1, z: 0, yaw: 0, spec: { speed: 5 }, path: null, pathIdx: 0 };
    for (let i = 0; i < 600; i++) {
        bm._followPathOrSteer(head, 200, 0, 1 / 60, 1);
        bm._followPathOrSteer(oblq, 200, 90, 1 / 60, 1);
    }
    ok("!! *** APPROACHED AT AN ANGLE THE BOT SLIDES ALONG THE WALL RATHER THAN STOPPING DEAD ***",
        Math.abs(oblq.z) > 20 && oblq.x < 40,
        "oblique: ended (" + oblq.x.toFixed(2) + ", " + oblq.z.toFixed(2) + ") -- " + Math.abs(oblq.z).toFixed(1) +
        " units along the wall. Head-on: (" + head.x.toFixed(2) + ", " + head.z.toFixed(2) + "), which is " +
        "geometry rather than a failure: a wish pointing straight at a wall has no component along it.");
    report("head-on stops at x=" + head.x.toFixed(2) + " and oblique reaches z=" + oblq.z.toFixed(2) +
           " -- the same refusal, and only one of them looks like being stuck");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: anything in a BROWSER. This drives the worker's onmessage directly and constructs " +
    "BotManager against a fake world, so it grades the logic and not the Worker plumbing, the ECS, or what a " +
    "bot LOOKS like walking a hill. Also unchecked: whether the navmesh's 1.4-3.0 ms per query is affordable " +
    "at the bot counts a real scene reaches -- it is affordable HERE because the work is on a worker thread " +
    "and a bot re-plans every few seconds, and a caller that changes either should re-measure. And " +
    "nav/funnel.mjs is now wired only THROUGH the navmesh, which imports it: no caller pulls a grid corridor " +
    "through it, because funnel-selfcheck section 4 measured that as a net loss.");
process.exit(fails ? 1 : 0);
