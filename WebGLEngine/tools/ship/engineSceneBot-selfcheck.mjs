// WebGLEngine/tools/ship/engineSceneBot-selfcheck.mjs -- v4548
//
// Run: node tools/ship/engineSceneBot-selfcheck.mjs
//
// *** THE ENGINE'S OWN SCENE, WHICH THREE ROUNDS SAID WAS TOO LARGE A SURFACE FOR ONE GATE TO OWN. ***
// It is not. index.html boots headlessly in about seven seconds with ZERO page errors, and the real
// BotManager is reachable at window.fpsShooter.botManager -- main.js already patches it there for the boss
// enrage path -- so nothing had to be published for this gate to exist.
//
// *** AND IT FOUND A REGRESSION v4545 SHIPPED, WHICH EVERY OTHER GATE STRUCTURALLY COULD NOT. *** That round
// wired physics/character/terrainWalk.mjs into simulation/BotManager.js through functionGround(), which
// probes the height function at x +/- eps. main.js's world._heightAt ANSWERS ONLY AT INTEGER COORDINATES:
// sampled at quarter-unit spacing it reads 25, null, null, null, 26, null, null, null, 27. So every probe
// came back null, stepTerrain got no ground, and every bot in the real engine was BLOCKED AT 0.0000
// MOVEMENT. No fixture could see it because every fake world in every gate answers at any float.
//
// autoGround() asks the world which kind it is -- one off-lattice call, once -- and hands a lattice world
// the bilinear treatment heightfieldGround already gives an array. This gate is the thing that would go red
// if that ever regresses.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("engineSceneBot-selfcheck -- a real bot, on the real world, in a real boot of index.html\n");

const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
if (skip) { console.log("  SKIP  " + skip); console.log("\nSKIPPED -- no browser on this box."); process.exit(0); }

const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = path.join(ENG, decodeURIComponent(u.pathname));
    try { if (fs.statSync(p).isDirectory()) p = path.join(p, "index.html"); } catch {}
    fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        const e = path.extname(p);
        const t = e === ".js" || e === ".mjs" ? "text/javascript" : e === ".html" ? "text/html"
            : e === ".json" ? "application/json" : e === ".css" ? "text/css"
            : e === ".glb" ? "model/gltf-binary" : e === ".wasm" ? "application/wasm" : "application/octet-stream";
        res.writeHead(200, { "Content-Type": t }); res.end(data);
    });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: HEADLESS_SHELL,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const pageErrors = [];
let R = null, bootMs = 0;
try {
    const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    bootMs = Date.now() - t0;
    R = await page.evaluate(async () => {
        const bm = window.fpsShooter && window.fpsShooter.botManager;
        if (!bm) return { error: "no botManager at window.fpsShooter.botManager" };
        const w = bm.world;
        const T = await import("/physics/character/terrainWalk.mjs");
        // what KIND of height function is this world's?
        const raw = [];
        for (let i = 0; i <= 8; i++) { let v; try { v = w._heightAt(i * 0.25, 0); } catch { v = null; } raw.push(Number.isFinite(v) ? v : null); }
        const G = T.autoGround((x, z) => w._heightAt(x, z));
        // *** THE REFERENCE HEIGHT IS COMPUTED HERE, FROM THE WORLD'S OWN CORNERS, NOT ASKED OF terrainWalk. ***
        // Scoring bot.y against terrainWalk's own ground function would only prove BotManager and the gate call
        // the same code -- a bug inside latticeGround would move both sides together and the row would stay
        // green. Four integer samples and the bilinear written out by hand is an oracle the module cannot move.
        const refH = (x, z) => {
            const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
            let a, b, c, d;
            try { a = w._heightAt(i, j); b = w._heightAt(i + 1, j); c = w._heightAt(i, j + 1); d = w._heightAt(i + 1, j + 1); }
            catch { return null; }
            if (![a, b, c, d].every(Number.isFinite)) return null;
            return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
        };
        const spawnH = w._heightAt(0, 0);
        const bot = bm.spawn({ x: 0, z: 0, kind: "bot_grunt" });
        if (!bot) return { error: "spawn returned nothing" };
        const start = { x: bot.x, y: bot.y };
        // *** THE STANDING CLAIM IS SCORED OVER GROUND ACTUALLY COVERED, NOT OVER FRAMES ELAPSED. ***
        // Written the obvious way -- worst |y - (ground+1)| over 600 frames -- this row stayed GREEN under
        // the sabotage that froze the bot: a body that never leaves its spawn column trivially stands on the
        // one height it was placed at, and 600 identical samples read as 600 confirmations. Distinct integer
        // cells is the population that cannot be satisfied by standing still.
        let worstOff = 0, moved = 0, sampled = 0;
        const cells = new Set(), heights = new Set();
        // *** THE LONGEST RUN OF FRAMES THAT MOVED NOTHING, WHICH IS THE ACTUAL SYMPTOM. *** Total distance
        // hides a stall: a bot that walks 6 units and then stands still for 429 frames and one that walks 6
        // units steadily report the same number. This is the one that separates them.
        let stallRun = 0, worstStall = 0, stallFrom = -1, worstFrom = -1;
        for (let i = 0; i < 600; i++) {
            const bx = bot.x, bz = bot.z;
            bm._followPathOrSteer(bot, 120, 40, 1 / 60, 1);
            const d = Math.hypot(bot.x - bx, bot.z - bz);
            if (d < 1e-6) { if (stallRun === 0) stallFrom = i; stallRun++;
                            if (stallRun > worstStall) { worstStall = stallRun; worstFrom = stallFrom; } }
            else stallRun = 0;
            moved += d;
            const h = refH(bot.x, bot.z);
            if (h !== null) {
                worstOff = Math.max(worstOff, Math.abs(bot.y - (h + 1)));
                sampled++;
                cells.add(Math.floor(bot.x) + "," + Math.floor(bot.z));
                heights.add(h.toFixed(3));
            }
        }
        // Does the ground autoGround CHOSE actually answer between lattice points? offLattice alone is the
        // detection, and a detection that nothing honours reads exactly the same as one that everything does.
        let mid = null; try { const m = G(0.5, 0.5); mid = m ? +m.y.toFixed(4) : null; } catch { mid = null; }
        return { rawQuarterUnit: raw, offLattice: G.offLattice, midY: mid, spawnH, botCount: bm.bots.size,
                 start: { x: +start.x.toFixed(2), y: +start.y.toFixed(2) },
                 end: { x: +bot.x.toFixed(2), z: +bot.z.toFixed(2), y: +bot.y.toFixed(2) },
                 moved: +moved.toFixed(2), worstOff: +worstOff.toExponential(2), sampled,
                 cells: cells.size, heights: heights.size,
                 worstStall, worstFrom, detours: bm._detours || 0,
                 poolRoute: bm.pathfinderPool && bm.pathfinderPool.route,
                 canvases: document.querySelectorAll("canvas").length, title: document.title };
    });
} finally {
    await browser.close(); srv.close();
}

ok("!! *** index.html BOOTS HEADLESSLY WITH NO PAGE ERRORS, IN " + bootMs + " ms ***",
    R && !R.error && pageErrors.length === 0,
    (R && R.error) || ("\"" + R.title + "\", " + R.canvases + " canvases. page errors: " +
    JSON.stringify(pageErrors.slice(0, 2))) + ". Three rounds recorded booting the engine as too large a " +
    "surface for one gate; it is seven seconds and no stubs.");

// =============================================================================================================
console.log("\n1. *** THE ENGINE'S WORLD ANSWERS ONLY ON A LATTICE, WHICH IS WHAT BROKE THE WIRING ***");
{
    const nulls = R.rawQuarterUnit.filter((v) => v === null).length;
    report("world._heightAt at quarter-unit spacing from (0,0): " + JSON.stringify(R.rawQuarterUnit));
    ok("!! *** IT RETURNS NOTHING BETWEEN INTEGER COORDINATES: " + nulls + " OF " + R.rawQuarterUnit.length + " SAMPLES NULL ***",
        nulls > 0 && R.rawQuarterUnit[0] !== null,
        "*** v4545 WIRED functionGround INTO BotManager, WHICH PROBES AT x +/- eps. *** Every probe came back " +
        "null, stepTerrain got no ground, and every bot in the real engine was blocked at 0.0000 movement. " +
        "No gate could see it: every fake world in every fixture answers at any float.");
    ok("!! ...and autoGround detects that by ASKING -- AND THE GROUND IT HANDS BACK ANSWERS AT (0.5, 0.5), " +
        "WHERE THE WORLD ITSELF WILL NOT: " + R.midY,
        R.offLattice === false && R.midY !== null,
        "offLattice " + R.offLattice + ", mid-cell height " + R.midY + " between corners " + R.rawQuarterUnit[0] +
        " and " + R.rawQuarterUnit[4] + ". *** THE SECOND HALF IS NOT REDUNDANT: *** offLattice alone reports " +
        "the DETECTION, and a detection nothing honours reads identically to one everything honours -- forcing " +
        "the functionGround branch while leaving the flag alone left this row green and only the movement row " +
        "red. Probing the chosen ground where the world returns null is what makes the flag mean something. " +
        "One off-lattice call, once, beats a setting somebody has to keep in sync with the world.");
}

// =============================================================================================================
console.log("\n2. *** A REAL BOT, SPAWNED BY THE REAL BotManager, WALKING THE REAL TERRAIN ***");
{
    report("spawned at (0,0) where the world's own height is " + R.spawnH + "; " + R.botCount + " bot(s) in the manager; " +
           "pool route \"" + R.poolRoute + "\"; walked " + R.moved + " units over 600 frames to " +
           "(" + R.end.x + ", " + R.end.z + ") at y " + R.end.y);
    ok("!! *** IT MOVES: " + R.moved + " UNITS, WHERE BEFORE THE FIX IT WAS 0.00 AT EVERY FRAME ***",
        R.moved > 3,
        "the regression this gate exists for was a bot frozen in place on real terrain. This row is the one " +
        "that goes red if autoGround stops asking.");
    ok("!! *** AND IT STANDS ON THE REAL GROUND ACROSS " + R.cells + " DISTINCT CELLS AND " + R.heights +
        " DISTINCT GROUND HEIGHTS: worst |bot.y - (ground + 1)| = " + R.worstOff + " ***",
        R.worstOff === 0 && R.sampled > 500 && R.cells > 1 && R.heights > 1,
        R.sampled + " of 600 frames sampled against a bilinear of the world's own four integer corners, " +
        "computed in the page rather than asked of terrainWalk -- a bug inside latticeGround moves BotManager " +
        "and a terrainWalk-supplied oracle together and neither notices. Over " + R.cells +
        " integer cells at " + R.heights + " heights. *** THE CELL AND HEIGHT COUNTS ARE NOT DECORATION: *** " +
        "scored over FRAMES alone this row stayed green under the sabotage that froze the bot at spawn -- " +
        "600 identical samples of the one height it was placed at read as 600 confirmations. A float/sink " +
        "claim is only a claim if the body crossed ground that changes height under it.");
    // *** THE ROW THE LATTICE-LIP ROUND EXISTS FOR. *** Before it, this bot walked 6.28 units, arrived at
    // (5.957, 1.986) and stood there for the remaining 429 frames -- and the total-distance row above stayed
    // GREEN throughout, because 6.28 is more than 3. A stall is a RUN of frames that moved nothing, and
    // nothing was counting runs.
    report("longest run of frames that moved nothing: " + R.worstStall + " (from frame " + R.worstFrom +
           "); " + R.detours + " frames took a fanned heading");
    ok("!! *** IT NEVER STANDS STILL: LONGEST ZERO-MOVEMENT RUN IS " + R.worstStall + " FRAMES OF 600 ***",
        R.worstStall < 30,
        "before this round it was 429 -- the bot reached a cell whose four corner heights are 28, 29, 26, 27, " +
        "a TWO-UNIT DROP reading 65.9 degrees against its 55-degree limit, and stopped. *** THE REFUSAL WAS " +
        "CORRECT AND THE ROUND WAS FILED ON THE WRONG PREMISE: *** it is not a one-unit lip that stepHeight " +
        "should have cleared, it is a genuine cliff -- and 21 of the bot's 24 compass directions were OPEN " +
        "while it stood there. simulation/BotManager.js treated `blocked` as HANDLED, so nothing ever asked " +
        "a second question.");
    ok("!! ...and it got there BY DETOURING, not because the terrain happened to be easier",
        R.detours > 0 && R.detours < 600,
        R.detours + " of 600 frames took a fanned heading. A run that reported zero detours and more distance " +
        "would mean the fan was never exercised and something else had changed.");
    ok("   ...and the engine's own pathfinder pool is on the navmesh route",
        R.poolRoute === "navmesh",
        "\"" + R.poolRoute + "\" -- v4545's wiring, observed in the running engine rather than in a fixture.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** THE LIMIT THIS GATE CARRIED AS 'KNOWN AND NOT FIXED' WAS DIAGNOSED WRONG, AND IS FIXED. *** It " +
    "read: the bot climbs 45-to-54-degree ground and stops at a one-unit voxel lip because the interpolated " +
    "surface reads 65.9 degrees and the normal test runs before stepHeight. The 65.9 is real; the lip is " +
    "not. Measured by probing all 24 compass headings at the stall: the cell the bot wanted has corner " +
    "heights 28, 29, 26, 27 -- a TWO-UNIT DROP -- so refusing it is CORRECT, two of the three refused " +
    "headings were going downhill, and 21 OF 24 HEADINGS WERE OPEN. simulation/BotManager.js treated " +
    "`blocked` as HANDLED, parking the bot and skipping every fallback, three lines under a comment stating " +
    "this tree's ruling that refusing a move must not mean standing at the wall. stepTerrainFan tries the " +
    "wish and then fans around it: 6.28 units and 429 stalled frames became 21.09 units and 0. " +
    "\nStill unchecked here: what a bot LOOKS like -- this drives the manager directly and reads numbers, " +
    "and never renders one. And the cost is stated rather than hidden: this gate takes about 7.8 s against a " +
    "3,000 ms ship-time sweep budget, so IT DOES NOT RUN AT SHIP TIME.");
process.exit(fails ? 1 : 0);
