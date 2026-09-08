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

// =============================================================================================================
console.log("\n4. *** THE BOT YOU CAN SEE STANDS ON THE GROUND YOU CAN SEE, TO THE PIXEL ***");
{
    // *** "IT LOOKS RIGHT" NEEDS A REFERENCE NOBODY HAS; AN AGREEMENT BETWEEN TWO PATHS DOES NOT. *** The
    // harness draws a side elevation of the terrain STRAIGHT FROM THE HEIGHTMAP, then draws the bot from the
    // CONTROLLER's y, then reads the pixels back. If the renderer and the controller disagree about where
    // the ground is -- the float/sink bug every character controller can have -- the marker sits off the
    // silhouette, in pixels, visibly. That is the one visual claim worth asserting here.
    report("canvas " + R.render.W + "x" + R.render.H + ", " + R.render.samples + " samples along the walk, " +
           "per-sample feet-minus-terrain in pixels: [" + R.render.gaps.join(", ") + "]");
    ok("!! *** THE FEET LAND ON THE SILHOUETTE AT EVERY SAMPLE: worst |gap| " + R.render.worstGapPx + " px ***",
        R.render.worstGapPx === 0 && R.render.samples >= 8,
        "the terrain is drawn from world._heightAt and the marker from bot.y - 1, and they agree exactly at " +
        "all " + R.render.samples + " samples, including after the bot stops at the wall. *** THE FIRST TWO " +
        "READINGS WERE THE PROBE STANDING ON ITS OWN SUBJECT. *** Drawing the 3x3 marker BEFORE reading the " +
        "column painted over the terrain's top row and every sample read a constant -2 px -- a systematic " +
        "offset indistinguishable from a real float. Reading first fixed five of nine; the other four were " +
        "the bot STOPPED at the wall, re-sampling a column an earlier marker already occupied. The " +
        "silhouette is captured once from the clean render now, so neither ordering hazard exists.");
    ok("   ...and something was actually drawn, rather than a blank canvas agreeing with itself",
        R.render.dataUrlBytes > 1500,
        R.render.dataUrlBytes + " bytes of PNG. A canvas that drew nothing has no silhouette to find and " +
        "every column would read -1, but a row that only checks a DIFFERENCE cannot tell that apart from " +
        "agreement, so the size is checked too.");
}

// =============================================================================================================
console.log("\n5. *** THE POOL ABOVE TWO WORKERS, AND MORE OF THEM IS NOT FASTER HERE ***");
{
    for (const p of R.pools) report(`poolSize ${String(p.size).padStart(2)} -> ${p.workers} workers, ` +
        `32 jobs in ${String(p.ms).padStart(6)} ms, ${p.found}/32 found`);
    ok("!! every pool size answers every job -- 1, 2, 4 and 8 workers all return 32 of 32",
        R.pools.every((p) => p.found === 32 && p.workers === p.size),
        R.pools.map((p) => p.size + ":" + p.found).join(" ") + ". The pool's own default is " +
        "Math.max(2, Math.min(4, hardwareConcurrency - 2)).");
    const one = R.pools.find((p) => p.size === 1), eight = R.pools.find((p) => p.size === 8);
    ok("!! *** AND MORE WORKERS IS SLOWER ON THIS BOX, WHICH IS A READING RATHER THAN A RULE ***",
        eight.ms > one.ms,
        "1 worker " + one.ms + " ms against 8 workers " + eight.ms + " ms for the same 32 jobs. Each worker " +
        "is a module Worker that must fetch and parse botPathfinder.worker.js AND nav/navmesh.mjs before it " +
        "answers anything, and on a box with few cores that spin-up is not repaid by 32 jobs. *** NOT " +
        "ASSERTED AS A PROPERTY OF THE POOL: *** it is one box, and the row above -- that every size is " +
        "CORRECT -- is the one that would still hold on a machine where eight workers win.");
}

// =============================================================================================================
console.log("\n6. *** WHETHER HM_PADDING = 24 IS THE RIGHT WINDOW, WHICH IS NOW A NUMBER ***");
{
    for (const p of R.padding) report(`gap ${String(p.gapOffset).padStart(3)} units off the straight line -> ` +
        `found ${p.found}, route "${p.route}"`);
    const found = R.padding.filter((p) => p.found).map((p) => p.gapOffset);
    const lost = R.padding.filter((p) => !p.found).map((p) => p.gapOffset);
    // *** THE EXPECTED EDGE IS DERIVED FROM THE CONSTANT IN THE SOURCE, NOT PINNED AT 24. *** The first
    // version of this row asserted only "reachable past 24", which cannot tell a 24-unit window from a
    // 64-unit one: widening HM_PADDING to 64 left every probed offset reachable, `lost` empty, and the row
    // GREEN. A row that passes whatever the constant is measures nothing about it.
    const poolSrc = fs.readFileSync(path.join(ENG, "simulation", "BotPathfinderPool.js"), "utf8");
    const PAD = Number((poolSrc.match(/const\s+HM_PADDING\s*=\s*(\d+)/) || [])[1]);
    const GAP_HALF = 6;                       // the harness's gap reaches 6 units either side of its centre
    const edge = PAD + GAP_HALF;
    ok("!! *** THE WINDOW'S EDGE IS WHERE HM_PADDING = " + PAD + " PUTS IT: reachable to " + Math.max(...found) +
        ", gone by " + Math.min(...lost) + ", against a derived " + edge + " ***",
        Number.isFinite(PAD) && lost.length > 0 && Math.max(...found) <= edge && Math.min(...lost) > edge - 8,
        "HM_PADDING is read out of simulation/BotPathfinderPool.js rather than typed here. Found at offsets " +
        found.join(", ") + " and lost at " + lost.join(", ") + ". _heightmapForJob pads " +
        "the start/goal bounding box by HM_PADDING = 24 and samples ONLY that, and this fixture's gap reaches " +
        "6 units either side of its centre -- so a detour is reachable out to about 24 + 6 = 30 and not " +
        "beyond. *** SO THE ANSWER TO 'IS 24 RIGHT' IS THAT IT IS A RANGE LIMIT ON DETOURS RATHER THAN A " +
        "PERFORMANCE KNOB, *** and nothing in the tree had written down what it costs: a bot whose only way " +
        "round is wider than the window does not get a long path, it gets NO path, and falls back to " +
        "steering straight at the thing in its way.");
    ok("   ...and beyond the window BOTH planners fail, so this is the pool's limit and not the navmesh's",
        R.padding.filter((p) => !p.found).every((p) => p.route === "grid"),
        "every lost case falls through to the grid and fails there too: the navmesh declines, the grid is " +
        "asked, and neither can find a route that is not in the data it was given.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nstill unchecked: a bot in THE ENGINE'S OWN SCENE. Section 4 renders a side elevation from a heightmap " +
    "and shows the controller and the render agree on the ground to the pixel, which is the float/sink claim " +
    "and is worth having -- but it is this gate's canvas, not main.js's world, and nothing here exercises " +
    "the ECS, the camera, or the meshes a bot is actually drawn with. main.js is the only page that mounts " +
    "BotManager for real, and booting it headlessly is a much larger surface than one gate should own. Also " +
    "unchecked: any box but this one -- section 5's reading that more workers is SLOWER is one machine with " +
    "few cores, and what is asserted there is that every pool size is CORRECT rather than that any size is " +
    "fastest.");
process.exit(fails ? 1 : 0);
