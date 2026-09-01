#!/usr/bin/env node
// WebGLEngine/tools/ship/gitEconomy-selfcheck.mjs -- v4299 (Level 13)
//
// GRADES world/gitEconomy.mjs: THE GAME'S ECONOMY RUNNING AMONG THE VENDORED REPOSITORIES, WITH ITS OWN LIFE.
//
// "Not accurate" is the brief, so this does not grade prices against anything. It grades what a simulation
// owes even when it is a toy: every ton accounted for, every credit accounted for, the same run from the same
// seed, traders always between bodies that exist, routes that are the best margin at the moment they are
// chosen, and -- the point -- routes that CHANGE because trading changed the prices.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { makeGitEconomy, marketsOf, goodOf, GOODS, reprice, PRICE_FLOOR, PRICE_CEIL, BASE, RECIPES, DEFAULTS } from "../../world/gitEconomy.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { traders } from "../../world/traderGraph.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const system = buildOrrery(JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8")).bodies, { today: "2026-09-01" });

console.log("\n1. MARKETS FROM THE BODIES, PRICES FROM COVERAGE");
{
    const M = marketsOf(system);
    ok(`every body is a market: ${M.length}`, M.length === system.bodies.length && M.every((m) => GOODS.every((g) => m.stock[g] >= 0 && m.trade[g] > 0)));
    ok("a file is one of four goods, and the sort is by what it is", goodOf("x.wasm") === "binaries" && goodOf("a/b.js") === "source" && goodOf("orrery.json") === "data" && goodOf("LICENSE") === "docs");
    const wasm = M.find((m) => m.name === "wasm"), draco = M.find((m) => m.name === "draco");
    ok("  a body of binaries stocks binaries; a body of source stocks source", wasm && draco && wasm.stock.binaries > wasm.stock.source && draco.stock.source > draco.stock.binaries, `wasm ${JSON.stringify(wasm && wasm.stock)}; draco ${JSON.stringify(draco && draco.stock)}`);
    ok("*** prices are consequences: a glut is cheap, a shortage dear, and the band is stated ***", M.every((m) => GOODS.every((g) => m.trade[g] >= BASE[g] * PRICE_FLOOR && m.trade[g] <= BASE[g] * PRICE_CEIL)) && new Set(M.map((m) => m.trade.source)).size > 1);
    const m0 = { stock: { source: 10, binaries: 1, data: 1, docs: 1 }, need: { source: 10, binaries: 10, data: 10, docs: 10 }, trade: {} }; reprice(m0);
    ok("  reprice: at coverage 1 the price is the base; at 1/10 it is the ceiling", m0.trade.source === BASE.source && m0.trade.binaries === BASE.binaries * PRICE_CEIL);
    ok("the crew is git's contributors plus a hauler per body", makeGitEconomy(system).ships.length === traders().length + system.bodies.length, `${traders().length} contributors + ${system.bodies.length} haulers`);
}

console.log("\n2. A HUNDRED DAYS OF LIFE, ACCOUNTED FOR TO THE UNIT");
{
    const e = makeGitEconomy(system, { seed: 7 });
    const before = e.accounting();
    let routesOk = true, offSegment = 0, routeChecks = 0;
    const routeChoices = new Map();
    for (let i = 0; i < 400; i++) {
        // before each step, every docked ship's next choice must be the best margin it can find right now
        for (const s of e.ships) if (s.to == null) { const b = e.bestRoute(s); if (b) { routeChecks++; const here = e.uni.systemById[s.at];
            for (const m of e.markets) for (const g of GOODS) { if (m.id === here.id || here.stock[g] <= 0) continue; if (m.trade[g] - here.trade[g] > b.margin * 1.06) routesOk = false; } } }
        e.step(0.25);
        for (const s of e.ships) { if (s.to != null && (!e.uni.systemById[s.from] || !e.uni.systemById[s.to])) offSegment++; if (s.to != null) { const k = s.from + ">" + s.to + ":" + s.cargoGood; routeChoices.set(k, (routeChoices.get(k) || 0) + 1); } }
    }
    const a = e.accounting();
    ok("*** every ton is where the ledger says: stock + holds + consumed - produced equals the start ***", a.tonsConserved && a.total === before.initialTons, `${a.total} of ${before.initialTons} tons`);
    ok("*** every trader's credits are start + earned - spent - upkeep, and traders + treasuries - minted is the starting total ***", a.creditsOk && a.creditsConserved, `${a.creditsTotal} of ${a.initialCredits} credits; ${a.treasuries} in treasuries, ${a.traderCredits} in holds, ${a.ledger.minted} minted`);
    ok("  v4300: production ran recipes -- goods were MADE from other goods, not only moved", a.ledger.recipesRun > 100 && GOODS.some((g) => a.ledger.produced[g] > 0) && RECIPES.length === 3, `${a.ledger.recipesRun} runs`);
    ok("  v4300: upkeep was paid, and it circulates -- it sits in a treasury, not in a sink", a.ledger.upkeep > 0 && a.creditsConserved, `${a.ledger.upkeep} paid`);
    ok("  at the default upkeep nobody went bankrupt and no treasury ran dry over a hundred days", a.bankrupt === 0 && a.brokeMarkets === 0, `${a.bankrupt} bankrupt, ${a.brokeMarkets} broke of ${e.markets.length}`);
    ok("  traders traded", e.events.length > 100 && e.ships.every((s) => s.trips > 0), `${e.events.length} events, trips ${e.ships.map((s) => s.trips).join("/")}`);
    ok("*** every departure was the best margin per ton on offer at that moment (within the 5% preference noise) ***", routesOk && routeChecks > 50, `${routeChecks} choices checked`);
    ok("  no trader was ever between bodies that do not exist", offSegment === 0);
    ok("*** the routes are many and they changed: trading moved the prices, and the prices moved the traders ***", routeChoices.size >= 20, `${routeChoices.size} distinct (from, to, good) routes over 100 days`);
    const first = e.ships[0].log.filter((l) => l.bought).map((l) => l.to), late = first.slice(-5), early = first.slice(0, 5);
    ok("  the first trader's destinations vary over the run", new Set(first).size >= 3, `${e.ships[0].name}: ${early.join(", ")} ... ${late.join(", ")}`);
    ok("  a market's price moved during the run", e.markets.some((m) => GOODS.some((g) => m.trade[g] !== marketsOf(system).find((x) => x.name === m.name).trade[g])));
    const e2 = makeGitEconomy(system, { seed: 7 }); for (let i = 0; i < 400; i++) e2.step(0.25);
    ok("*** the same seed gives the same hundred days, event for event ***", JSON.stringify(e2.events) === JSON.stringify(e.events) && e2.accounting().total === a.total);
    const e3 = makeGitEconomy(system, { seed: 8 }); for (let i = 0; i < 400; i++) e3.step(0.25);
    ok("CONTROL: a different seed gives a different life", JSON.stringify(e3.events) !== JSON.stringify(e.events));
    // v4300 -- the loops can close on somebody: a punishing upkeep bankrupts haulers, and the books still balance
    const hard = makeGitEconomy(system, { seed: 7, upkeep: 900 }); for (let i = 0; i < 800; i++) hard.step(0.25); const h = hard.accounting();
    ok("*** v4300: at 900 credits a day of upkeep, haulers go BANKRUPT, and every ton and credit is still accounted for ***", h.bankrupt > 0 && h.active > 0 && h.tonsConserved && h.creditsConserved, `${h.bankrupt} bankrupt, ${h.active} still trading, after 200 days`);
    ok("  a bankrupt ship leaves the sky: its record has radius 0 and it makes no more events", hard.ships.filter((x) => x.bankrupt).every((x) => hard.records()[x.id * 4 + 3] === 0) && hard.events.some((x) => /is bankrupt/.test(x)));
    ok("  a market that cannot pay says so instead of buying on credit", (() => { const poor = makeGitEconomy(system, { seed: 7, treasury: 200 }); for (let i = 0; i < 200; i++) poor.step(0.25); return poor.events.some((x) => /cannot pay/.test(x)) && poor.accounting().creditsConserved; })());
    ok("records() places every ship in the orrery's plane, slightly above it", (() => { const r = e.records(); for (let i = 0; i < e.ships.length; i++) if (r[i * 4 + 2] !== Math.fround(0.05) || r[i * 4 + 3] !== Math.fround(0.12)) return false; return r.length === e.ships.length * 4; })());
    report("sample: " + e.events.slice(-2).join(" | "));
}

console.log("\n3. THE PAGE: LIFE ON, THE LOG MOVES, AND THE POINTER NAMES A TRADER OR A BODY");
{
    const pw = resolvePlaywright(createRequire(import.meta.url));
    if (!pw || !fs.existsSync(HEADLESS_SHELL)) { console.log("  SKIP  no browser"); fails++; }
    else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
        const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
            s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await br.newPage({ viewport: { width: 800, height: 600 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(2500);
        const log1 = await pg.evaluate(() => document.getElementById("trade").textContent); await pg.waitForTimeout(2500);
        const st = await pg.evaluate(() => ({ route: document.getElementById("route").textContent, log: document.getElementById("trade").textContent, drawn: document.getElementById("drawn").textContent }));
        let named = null; for (let y = 120; y < 600 && !named; y += 40) for (let x = 40; x < 800 && !named; x += 40) { await pg.mouse.move(x, y); await pg.waitForTimeout(90); const t = await pg.evaluate(() => document.getElementById("pick").textContent); if (/ cr$| -- /.test(t)) named = t; }
        await br.close(); srv.close();
        ok("the page loads with life on and reports the traders", /traders/.test(st.drawn), st.drawn);
        ok("*** the trade log fills and moves ***", st.log.length > 20 && st.log !== log1, st.log.slice(0, 120));
        ok("*** the pointer names a trader with its cargo and credits, or a body with its prices ***", !!named, named || "nothing named");
        ok("  and the page threw nothing", errs.filter((e) => !/favicon/.test(e)).length === 0, errs.slice(0, 2).join(" | ") || "clean");
    }
}

// =============================================================================================================
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 13.
//   A  a sale no longer restocks the market -> exit=1, 1 red: the ledger finds 365 of 3,004 tons. Everything else
//      stays green -- traders still trade, credits still balance -- because a leak is invisible to every check
//      but the one that counts tons. That check exists for this.
//   B  the WORST margin chosen instead of the best -> exit=1, 2 red: "every departure was the best margin" has 0
//      choices to check (a worst-first trader buys nothing profitable and never departs) and the first trader
//      goes nowhere. Life stops, and the gate says where.
//   C  (v4300) production mints nothing -> exit=1, 4 red: the credit ledger finds 597,780 of 530,000 -- more money
//      than ever existed, because minting was removed from the ledger but not from the treasuries. Every check
//      that leans on creditsConserved goes with it. A leak in either direction is visible only to the total.
//   D  (v4300) bankruptcy never declared -> exit=1, 2 red: at 900 a day, 0 bankrupt and 22 still "trading" on
//      nothing, and no ship ever leaves the sky.
//   0  (found, not planted) the gate's own route check drew from the seeded stream and broke determinism; the
//      preference noise is now a pure hash of (tick, ship, market, good), so an observer cannot move a choice.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THIS IS A GOOD ECONOMY. v4300 closed the loops Level 13 named -- treasuries, " +
    "recipes, upkeep, bankruptcy -- and found on the way that with upkeep as a pure sink the universe deflates in " +
    "200 days (14 empty treasuries), so production mints and upkeep circulates. Whether the parameters make a " +
    "LIVELY economy rather than a merely balanced one is a matter of taste this gate does not have; the only " +
    "money source is production and the only sink is nothing, so the total grows by what is made.");
process.exit(fails ? 1 : 0);
