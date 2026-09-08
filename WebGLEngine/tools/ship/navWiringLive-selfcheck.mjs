// WebGLEngine/tools/ship/navWiringLive-selfcheck.mjs -- v4546
//
// Run: node tools/ship/navWiringLive-selfcheck.mjs
//
// *** THE HALF tools/ship/navWiring-selfcheck.mjs SAID IT COULD NOT REACH. *** That gate closes with
// "unchecked here: anything in a BROWSER. This drives the worker's onmessage directly and constructs
// BotManager against a fake world, so it grades the logic and not the Worker plumbing" -- and the plumbing
// was where v4545's real risk sat, because that round gave worker/botPathfinder.worker.js a static
// `import` of ../nav/navmesh.mjs and simulation/BotManager.js a static import of
// ../physics/character/terrainWalk.mjs. In Node those prove syntax. In a browser they have to RESOLVE OVER
// HTTP with a JavaScript MIME type, inside a module Worker, or the worker never constructs -- and a worker
// that never constructs is a bot that never gets a path, with nothing in Node to say so.
//
// This drives tools/ship/navWiringHarness.html, which builds a REAL BotPathfinderPool and plans through REAL
// Web Workers. It found two things the Node gate could not:
//
//   1. THE POOL SWALLOWED `route`. _onWorkerMessage destructured { id, path, found, expanded } and dropped
//      the field v4545 had just added to the worker's reply, so a caller could not tell a navmesh path from
//      a grid one and the fallback was invisible from outside the pool.
//   2. A ROUTE THAT DETOURS MORE THAN HM_PADDING OFF THE STRAIGHT LINE IS NOT IN THE SNAPSHOT. The pool
//      samples only the start/goal bounding box padded by 24, so the first harness -- a gap 40 units off the
//      line -- had BOTH planners correctly returning found:false. That is a property of the pool rather than
//      of either planner, and no planner can find what it was not sent.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("navWiringLive-selfcheck -- the workers, the module graph, and the cost at real bot counts\n");

const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
if (skip) {
    console.log("  SKIP  " + skip);
    console.log("\nSKIPPED -- no browser on this box. Nothing is asserted and nothing is claimed.");
    process.exit(0);
}

const MIME = { ".mjs": "text/javascript", ".js": "text/javascript", ".html": "text/html",
               ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
const pageErrors = [];
let R = null;
try {
    const page = await (await browser.newContext()).newPage();
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile())
            return route.fulfill({ status: 200, contentType: MIME[path.extname(p)] || "text/plain", body: fs.readFileSync(p) });
        return route.fulfill({ status: 404, body: "not found" });
    });
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 200)); });
    await page.goto("http://localhost/tools/ship/navWiringHarness.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__navWiring, undefined, { timeout: 60000 });
    R = await page.evaluate(() => window.__navWiring);
} finally {
    await browser.close();
}

ok("!! *** THE HARNESS RAN TO COMPLETION IN A REAL BROWSER, WITH NO PAGE ERRORS ***",
    R && R.errors.length === 0 && pageErrors.length === 0,
    "harness errors " + JSON.stringify(R ? R.errors : null) + ", page errors " + JSON.stringify(pageErrors.slice(0, 2)));

// =============================================================================================================
console.log("\n1. *** THE MODULE WORKER CONSTRUCTS AND ANSWERS, WHICH IS WHAT NODE CANNOT ESTABLISH ***");
{
    report("pool size " + R.poolSize + "; one navmesh plan " + JSON.stringify(R.one) + "; one grid plan " + JSON.stringify(R.grid));
    ok("!! a real Worker resolves worker/botPathfinder.worker.js AND its import of nav/navmesh.mjs",
        R.one.found === true && R.one.route === "navmesh",
        "route \"" + R.one.route + "\", " + R.one.waypoints + " waypoints. *** THE IMPORT IS THE POINT: *** a " +
        "module Worker fetches ../nav/navmesh.mjs over HTTP and refuses it without a JavaScript MIME type, " +
        "and no Node gate exercises that. If this row is red the workers are dead and every bot falls back " +
        "to direct steering.");
    ok("!! ...and the navmesh route returns far fewer waypoints than the grid, through the real pipe",
        R.grid.found === true && R.grid.route === "grid" && R.one.waypoints * 3 < R.grid.waypoints,
        R.one.waypoints + " against " + R.grid.waypoints + " for the same start and goal");
    ok("!! *** THE POOL REPORTS WHICH PLANNER ANSWERED, WHICH IT USED TO SWALLOW ***",
        R.byRoute && R.byRoute.navmesh > 0 && R.byRoute.grid > 0,
        JSON.stringify(R.byRoute) + ". _onWorkerMessage destructured { id, path, found, expanded } and " +
        "dropped `route`, so the field v4545 added to the worker's reply never reached a caller and the " +
        "fallback was invisible from outside the pool. Found by driving the real pool rather than the " +
        "worker's onmessage.");
    ok("!! *** AND NO JOB TIMED OUT, WHICH IS A ROW THAT ONLY EXISTS BECAUSE ONE COULD HANG FOREVER ***",
        R.timeouts === 0,
        R.timeouts + " timeouts. plan() had no reject and no timeout until v4546: BotManager sets " +
        "pathRequestPending before calling and clears it only when the promise settles, with new requests " +
        "gated on !pathRequestPending, so ONE unanswered job stranded that bot for the life of the page. " +
        "*** ROUND 216 SHIPPED THAT AND NOTHING COULD REACH IT *** -- a worker either answered or was never " +
        "spawned. v4545's static import of nav/navmesh.mjs made a third state reachable: a module Worker " +
        "whose import fails to resolve CONSTRUCTS AND THEN DIES, alive enough to be posted to and unable to " +
        "reply. Mistyping that import hung this harness until the driving gate gave up, which is what a bot " +
        "would have done forever.");
    ok("!! ...and repeated plans all succeed, so the TRANSFERRED buffer does not poison the next job",
        R.repeats.ok === R.repeats.total && R.repeats.total >= 6,
        R.repeats.ok + " of " + R.repeats.total + ". The pool posts its snapshot with [hm.buffer], which " +
        "DETACHES it on the main thread; a pool that reused one would fail from the second job onward, and " +
        "one job is not enough to see that.");
}

// =============================================================================================================
console.log("\n2. *** THE COST AT REAL BOT COUNTS, WHICH IS THE NUMBER THE NODE GATE COULD NOT TAKE ***");
{
    const by = (n, r) => R.cost.find((c) => c.n === n && c.route === r);
    for (const c of R.cost) report(`${String(c.n).padStart(3)} bots ${c.route.padEnd(8)} ${String(c.ms).padStart(7)} ms total, ` +
        `${String(c.perJob).padStart(6)} ms per job, ${c.found}/${c.n} found`);
    ok("!! *** EVERY JOB IS ANSWERED AT EVERY BOT COUNT -- nothing is dropped under a burst ***",
        R.cost.every((c) => c.found === c.n),
        R.cost.map((c) => c.n + c.route[0]).join(" ") + " all complete");
    const big = by(48, "navmesh"), bigGrid = by(48, "grid");
    ok("!! *** A 48-BOT BURST COSTS " + big.ms + " ms OF WORKER TIME, AGAINST THE GRID'S " + bigGrid.ms + " ***",
        big.ms < 2000 && big.found === 48,
        "across " + R.poolSize + " workers, so about " + (big.ms / R.poolSize).toFixed(0) + " ms each, OFF THE " +
        "MAIN THREAD, for bots that re-plan every few seconds. The bound asserted here is deliberately loose " +
        "(2 s) because this is wall time on a shared box; the row that matters is the one above it, that " +
        "nothing is dropped. *** AND THE PER-JOB COST FALLS AS THE BURST GROWS -- " +
        by(1, "navmesh").perJob + " ms at one bot against " + big.perJob + " at forty-eight -- *** which is " +
        "worker warm-up being amortised, and is the opposite of what a per-query cost worry would predict.");
    ok("   the navmesh route stays within a small multiple of the grid at every count",
        [1, 8, 24, 48].every((n) => by(n, "navmesh").ms < by(n, "grid").ms * 12),
        [1, 8, 24, 48].map((n) => n + ": " + (by(n, "navmesh").ms / by(n, "grid").ms).toFixed(1) + "x").join(", ") +
        ". Node measured 2.8x to 6.0x on a single synchronous call; through real workers under a burst it is " +
        "the same order, and the absolute numbers are what decide it rather than the ratio.");
}

// =============================================================================================================
console.log("\n3. simulation/BotManager.js's MODULE GRAPH LOADS IN A BROWSER, AND AGREES WITH NODE");
{
    ok("!! the bot walks the hill and stops at the wall, matching the Node gate's x to three decimals",
        R.bot && Math.abs(R.bot.x - 39.462) < 0.002 && R.bot.worstOff === 0,
        "browser x=" + R.bot.x + " y=" + R.bot.y + ", worst deviation from the surface " + R.bot.worstOff +
        "; tools/ship/navWiring-selfcheck.mjs measures x=39.46 in Node. *** THIS IS NOT ABOUT WHAT A BOT " +
        "LOOKS LIKE -- NOTHING HERE RENDERS ONE. *** It is about the import: v4545 gave BotManager a static " +
        "import of physics/character/terrainWalk.mjs, and a Node gate importing the same file proves the " +
        "syntax rather than the resolution.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nstill unchecked, and narrower than before: what a bot LOOKS like walking a hill. Nothing in this gate " +
    "renders a bot -- there is no scene, no camera and no ECS here, only the module graph and the numbers it " +
    "produces. A visual claim needs a page that mounts BotManager against a real world, and that page does " +
    "not exist. Also unchecked: the pool on a box with more than " + (R ? R.poolSize : "?") + " workers, and " +
    "whether HM_PADDING = 24 is the right window -- section 2's finding is that a detour wider than it is " +
    "simply not in the data either planner receives, which is a round of its own.");
process.exit(fails ? 1 : 0);
