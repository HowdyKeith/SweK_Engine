// WebGLEngine/ev/esFleetSize-selfcheck.mjs — v4131
//
// The answer key for "pick how many ships fight, and restart the fight."
//
// Keith asked for two controls on es-box3d-fly3d.html: a Reset Battle button, and a way to choose the number of
// ships. Neither needed new simulation -- newBattle() was ALREADY a full teardown-and-rebuild (hulls cleared, a
// fresh box3d world, trails disposed and re-sized to the new strand count, shots and clock zeroed). What was
// missing was a way to ASK for it, and a count that was not the literal 6 written twice inside it.
//
// So the risk is not "does it rebuild". It is:
//   1. THE PICKER AND THE SIM DISAGREE. The gate reads the option values OUT OF THE PAGE and spawns real fleets
//      at each one through the real ev/combat.js spawnEnemies, so a new option added to the HUD is exercised
//      whether or not anyone remembers this file. A hardcoded list here would go stale the first time it changed.
//   2. spawnEnemies TREATS 0 AS "USE MY DEFAULT 3" (`opts.count || 3`) -- a count that arrives as 0 or NaN does
//      not fail loudly, it quietly spawns three. The page clamps with Math.max(1, ...) and that clamp is checked.
//   3. THE TALLY MEANS TWO DIFFERENT THINGS. "battles A:3 B:1" that counts some 2v2s and some 20v20s is a score
//      for two different games added together, so the fleet-size picker CLEARS the tally and a plain reset KEEPS
//      it. That asymmetry is deliberate and easy to "tidy" into consistency, so both halves are pinned.
//   4. A BUTTON THAT EXISTS BEFORE THE WORLD DOES. Both controls are in the document from parse time, but
//      newBattle() builds a box3d world and box3d.init() has not resolved yet -- hence the `booted` guard.
//
// Also pinned here (same round, same request): the pages no longer call themselves "Round A" / "Round B" in
// anything a user reads. Those names said WHEN the work happened, not WHAT the page is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnEnemies } from "./combat.js";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };

const PAGE = "es-box3d-fly3d.html";
const src = read(PAGE);

console.log("== the picker's own option values, spawned for real ==");

// Read the sizes the HUD actually offers. If someone adds "40 v 40" the gate spawns 40 without being edited.
const sel = /<select id="fleetSize"[^>]*>([\s\S]*?)<\/select>/.exec(src);
ok(!!sel, "es-box3d-fly3d.html has a #fleetSize picker");
const SIZES = sel ? [...sel[1].matchAll(/<option value="(\d+)"/g)].map((m) => +m[1]) : [];
ok(SIZES.length >= 3, `picker offers ${SIZES.length} sizes: ${SIZES.join(", ")}`);
ok(SIZES.includes(6), "6 is still on offer -- it was the hardcoded value, so the old behaviour stays reachable");
ok(/<option value="6" selected>/.test(sel ? sel[1] : ""), "6 is the DEFAULT: opening the page is the same fight it was");

// The page's own constants, read from the page so the gate cannot drift from them.
const CLASSES = [
  { id: 1, name: "Raider",   shield: 80,  armor: 60, speed: 340, accel: 240, maneuver: 11, dps: 12 },
  { id: 2, name: "Marauder", shield: 120, armor: 90, speed: 300, accel: 200, maneuver: 8,  dps: 18 },
  { id: 3, name: "Corsair",  shield: 60,  armor: 40, speed: 400, accel: 280, maneuver: 14, dps: 8  },
];
const spawnLine = /minR:\s*(\d+),\s*spread:\s*(\d+)/.exec(src);
ok(!!spawnLine, "makeFleet's minR/spread are readable from the page");
const MIN_R = spawnLine ? +spawnLine[1] : 150, SPREAD = spawnLine ? +spawnLine[2] : 500;
const centreLine = /makeFleet\("A",\s*\{\s*x:\s*(-?\d+)/.exec(src);
const CENTRE_X = centreLine ? +centreLine[1] : -1300;
ok(Math.abs(CENTRE_X) > MIN_R + SPREAD,
   `the fleets start on OPPOSITE SIDES and cannot spill across the midline: |centre ${CENTRE_X}| > minR ${MIN_R} + spread ${SPREAD}`);

function mkRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function fleet(team, cx, count, rng) {
  return spawnEnemies(CLASSES, {}, { x: cx, y: 0 }, { count, team, minR: MIN_R, spread: SPREAD, rnd: rng })
    .map((e, i) => ({ ...e, id: team + "#" + i }));
}

for (const n of SIZES) {
  const rng = mkRng(20250829 + n);
  const A = fleet("A", CENTRE_X, n, rng), B = fleet("B", -CENTRE_X, n, rng);
  const ids = new Set(A.concat(B).map((e) => e.id));
  const sideOk = A.every((e) => Math.sign(e.x) === Math.sign(CENTRE_X)) && B.every((e) => Math.sign(e.x) === -Math.sign(CENTRE_X));
  const alive = A.concat(B).every((e) => e.shield > 0 || e.armor > 0);
  ok(A.length === n && B.length === n, `${n} v ${n}: both fleets are exactly ${n} ships (got ${A.length} / ${B.length})`);
  ok(ids.size === 2 * n, `${n} v ${n}: all ${2 * n} ship ids are distinct -- hulls are keyed by id, a collision would share a mesh`);
  ok(sideOk, `${n} v ${n}: every ship spawned on its own side of the midline`);
  ok(alive, `${n} v ${n}: every ship spawned with hit points`);
}

console.log("== the zero trap ==");
// spawnEnemies is `const n = opts.count || 3` -- 0 does not throw, it QUIETLY SPAWNS THREE.
ok(spawnEnemies(CLASSES, {}, { x: 0, y: 0 }, { count: 0, rnd: mkRng(1) }).length === 3,
   "spawnEnemies(count: 0) really does return 3, not 0 -- the trap this clamp exists for is real");
ok(/Math\.max\(1,\s*fleetSize\s*\|\s*0\)/.test(src),
   "newBattle() clamps with Math.max(1, fleetSize|0), so a bad value can never reach spawnEnemies as 0");
ok(/Math\.max\(1,\s*\(\+e\.target\.value\s*\|\s*0\)\s*\|\|\s*6\)/.test(src),
   "the picker's onchange clamps too -- a non-numeric option falls back to 6 rather than to spawnEnemies' 3");

console.log("== the count is no longer written into newBattle ==");
const nb = /function newBattle\(\)\s*\{([\s\S]*?)\n\}/.exec(src);
ok(!!nb, "newBattle() found");
const body = nb ? nb[1] : "";
ok(!/makeFleet\("[AB]",[^)]*,\s*\d+\s*,/.test(body), "no literal ship count survives inside newBattle()");
ok((body.match(/makeFleet\("[AB]",[^)]*,\s*n,\s*rng\)/g) || []).length === 2,
   "BOTH fleets read the same count -- one side left on the old literal would be a permanently lopsided fight");
ok(/trails\s*=\s*makeTrails\(all\.length\)/.test(body),
   "the trail buffer is re-sized from the ACTUAL fleet, so a bigger battle gets enough strands and a smaller one does not draw dead ones");
ok(/if \(trails\) trails\.dispose\(\)/.test(body),
   "the previous trail mesh is disposed before the new one -- resizing every battle would otherwise leak a GPU buffer per round");

console.log("== reset, and the asymmetry that is on purpose ==");
ok(/id="resetBtn"/.test(src), "the HUD has a Reset battle button");
const reset = /getElementById\("resetBtn"\)\.onclick = \(e\) => \{([\s\S]*?)\n\};/.exec(src);
const change = /getElementById\("fleetSize"\)\.onchange = \(e\) => \{([\s\S]*?)\n\};/.exec(src);
ok(!!reset && !!change, "both handlers found");
const R = reset ? reset[1] : "", C = change ? change[1] : "";
ok(/newBattle\(\)/.test(R), "Reset calls newBattle() -- it does not hand-roll a second teardown that could drift from it");
ok(!/wins\./.test(R), "Reset does NOT clear the tally: same game, next round");
ok(/wins\.A = 0/.test(C) && /wins\.B = 0/.test(C),
   "changing the fleet size DOES clear the tally: a score mixing 2v2 with 20v20 adds up two different games");
ok(/if \(!booted\) return/.test(R) && /if \(booted\) newBattle\(\)/.test(C),
   "both controls are guarded by `booted` -- they exist from parse time, but newBattle() needs a box3d world and init() has not resolved");
ok(/let fleetSize = 6, booted = false;/.test(src),
   "fleetSize is module state, not a DOM read per battle -- frame() restarts the fight on a wipeout, with or without a HUD");

console.log("== the pages say what they are, not when they were built ==");
// What counts as "read by a user": not HTML comments and not script bodies. Both are a dated record of what a
// version DID, and rewriting history was never the ask -- ev/flightModel3d.js is still stamped "v3826 (Long
// Silence, Round B)" and should be. What changes is the title, the link text, the link tooltips and demo:desc.
//
// ONE PHRASE IS ALLOWED THROUGH, AND IT IS CAPPED AT ONE PER PAGE so it cannot become a loophole: each desc
// carries "formerly labelled Round A/B" once, because a reader arriving from four hundred versions of changelog
// that use those names needs one sentence tying the old label to the new one.
for (const f of [PAGE, "es-box3d-3d.html", "es-box3d.html"]) {
  const visible = read(f).replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const bridges = (visible.match(/formerly labelled Round [AB]/g) || []).length;
  ok(bridges <= 1, `${f}: at most one "formerly labelled Round X" bridge (found ${bridges})`);
  const hits = [...visible.replace(/formerly labelled Round [AB]/g, "").matchAll(/Round [AB]/g)].map((m) => m[0]);
  ok(hits.length === 0, `${f}: no other "Round A"/"Round B" in anything a user reads${hits.length ? " -- found " + hits.join(", ") : ""}`);
}
{
  const s = read("server.html");
  ok(!/Long Silence Round [AB]/.test(s), "server.html: the two ES Box3D links describe the pages instead of naming a round");
  ok(/the VIEW is 3D, the fight is not/.test(s) && /the FIGHT is 3D, not just the view/.test(s),
     "server.html: and the descriptions say the ACTUAL difference between the two pages");
}

// ---------------------------------------------------------------------------------------------------------
// LIVE. Everything above is source, and source cannot tell "the picker is wired" from "the picker is wired to
// something that throws". So the page is booted in a real browser, the real select is changed and the real
// button is clicked, and the answer is read out of the RUNNING SIM through window.swekBattleProbe.
//
// The one thing the HUD text cannot distinguish is the important one: "restarted at 2 v 2" looks exactly like
// "was already 2 v 2 and the click did nothing". The SIM CLOCK can tell them apart -- newBattle() sets t = 0 --
// so the reset check is that the clock went BACKWARDS after a fight that had been running.
// ---------------------------------------------------------------------------------------------------------
console.log("== live: a real browser, the real controls ==");
const { chromium, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url));
const skipWhy = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skipWhy) {
  console.log("  SKIP live section -- " + skipWhy);
} else {
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
                 ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css" };
  const browser = await chromium.launch({ executablePath: HEADLESS_SHELL });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 180)));
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "swek.local") return route.fulfill({ status: 404, body: "not found" });
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return route.fulfill({ status: 200, contentType: MIME[path.extname(p)] || "application/octet-stream", body: fs.readFileSync(p) });
    }
    return route.fulfill({ status: 404, body: "not found" });   // favicon and friends; nothing here needs them
  });
  try {
    await page.goto("http://swek.local/" + PAGE, { waitUntil: "load", timeout: 40000 });
    let bootErr = null;
    await page.waitForFunction(() => typeof window.swekBattleProbe === "function" && window.swekBattleProbe().a > 0,
                               { timeout: 40000 }).catch((e) => { bootErr = e; });
    ok(!bootErr, "the page boots to a running battle" + (bootErr ? " -- " + String(bootErr).slice(0, 120) : ""));

    const probe = () => page.evaluate(() => window.swekBattleProbe());
    const p0 = await probe();
    ok(p0.a === 6 && p0.b === 6 && p0.fleetSize === 6, `default is still 6 v 6 (got ${p0.a} v ${p0.b})`);

    await page.selectOption("#fleetSize", "20"); await page.waitForTimeout(700);
    const p20 = await probe();
    ok(p20.a === 20 && p20.b === 20, `picking 20 really spawns 20 v 20 in the sim, not just in the HUD (got ${p20.a} v ${p20.b})`);
    ok(p20.aliveA === 20 && p20.aliveB === 20, "all 40 ships are alive at spawn -- a bigger fleet is not partly stillborn");

    await page.selectOption("#fleetSize", "2"); await page.waitForTimeout(700);
    const p2 = await probe();
    ok(p2.a === 2 && p2.b === 2, `picking 2 really shrinks the sim to 2 v 2 (got ${p2.a} v ${p2.b})`);

    // Let the 2 v 2 run, so the clock is well away from zero and a reset has something to undo.
    await page.waitForTimeout(2500);
    const before = await probe();
    ok(before.t > 0.5, `the fight is running before the reset (sim clock ${before.t.toFixed(2)}s)`);
    await page.click("#resetBtn"); await page.waitForTimeout(400);
    const after = await probe();
    ok(after.t < before.t, `Reset battle really restarts the fight: sim clock ${before.t.toFixed(2)}s -> ${after.t.toFixed(2)}s`);
    ok(after.a === 2 && after.b === 2, "Reset keeps the chosen fleet size -- it restarts the fight, it does not undo the picker");

    ok(pageErrors.length === 0, "no page errors across the whole run" + (pageErrors.length ? " -- " + pageErrors[0] : ""));
  } finally {
    await browser.close();
  }
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
