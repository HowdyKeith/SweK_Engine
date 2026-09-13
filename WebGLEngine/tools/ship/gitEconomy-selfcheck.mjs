#!/usr/bin/env node
// WebGLEngine/tools/ship/gitEconomy-selfcheck.mjs -- v4534 (was v4299, Level 13)
//
// GRADES world/gitEconomy.mjs: THE GAME'S ECONOMY RUNNING AMONG THE VENDORED REPOSITORIES, WITH ITS OWN LIFE.
//
// ---- *** v4534 -- TWO RED ROWS, NEITHER OF THEM ABOUT THE ECONOMY *** ---------------------------------------
//
// Both were measuring something other than what they said, and the economy was right in both cases.
//
// (1) "EVERY DEPARTURE WAS THE BEST MARGIN ON OFFER" re-derived the best margin and missed TWO OF bestRoute'S
//     FOUR RULES: it skips a market that is CLOSED and one that CANNOT PAY -- "a market that cannot pay is
//     not a destination" -- and the scan skipped neither. So it found richer margins at destinations the ship
//     is RIGHT to refuse. MEASURED: 26 violations of 430 choices, and ALL 26 ARE MARKETS THAT CANNOT PAY --
//     0 closed, 0 unexplained. A market holding 159 credits was being counted as a missed 480-credit sale.
//     The rules stay RE-DERIVED rather than borrowed from bestRoute -- a checker that asks the thing it
//     checks to define "best" agrees by construction -- and what the scan WOULD flag without them is counted,
//     so the repair is a number (26 -> 0) rather than a story about one.
//
// (2) "NO TREASURY RAN DRY OVER A HUNDRED DAYS" MEASURED ONE INSTANT: THE LAST. a.brokeMarkets is a snapshot,
//     and being briefly dry is routine churn here -- ALL EIGHTEEN markets go dry at some tick, nine at once
//     at the peak, and the day-100 reading is whatever the churn happens to be (1 as it stands; 2 with the
//     three newest bodies removed, 3 with one). *** I FIRST GUESSED THE THREE NEW BODIES HAD THINNED THE
//     CREDIT SUPPLY AND MEASURED THE OPPOSITE: removing them makes it WORSE. *** The prose meant "ran dry" as
//     a lasting state, so that is what is asserted -- bankruptcy, which IS terminal, and RECOVERY: every
//     treasury that empties trades its way back. Worst unbroken spell 20 ticks, 5.0 days of 100.
//
// v4534 SABOTAGES, RESULTS BY NAME:
//   IA. the cannot-pay rule is dropped from the scan  -> 3 RED   <- the historical defect, reproduced
//   IB. bestRoute sells to a market that cannot pay   -> 2 RED
//   IC. the dry-spell scan never records a spell      -> *** 0 RED, THEN 2 RED ***
//   ID. the spell counter never resets                -> *** 0 RED, THEN 2 RED ***
//   IE. the load-bearing counter is faked to non-zero -> 2 RED
//   IF. bankruptcy is no longer terminal              -> 3 RED
//
// IC AND ID WERE BOTH MY OWN NEW INSTRUMENTATION. Zeroing every spell passed, because "no spell reached 400"
// is true of no spells at all -- the check could not tell "everyone recovered" from "nothing was measured".
// Deleting the reset, so a spell became the cumulative dry count, passed too. Both are asserted directly now:
// a spell was seen, and at least one market's dry TIME is split across several spells, which only holds if
// the counter resets. keyhunt is dry 108 ticks with a longest spell of 15, and that gap is the proof.
//
// NOT ASSERTED: that a five-day dry spell is acceptable. That is an economy design question, and a bound
// chosen here would be a tolerance picked to pass rather than a property.
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

// *** ONE PASS, TWO ANSWERS, AND THE SAME CODE GIVES BOTH. *** bestRoute skips a market that is CLOSED and
// one that CANNOT PAY ("a market that cannot pay is not a destination"); the departure scan below re-derives
// those rules rather than borrowing them, because a checker that asks the thing it checks to define "best"
// agrees with it by construction. `rules` turns the two skips off, so "what the scan says" and "what it
// would say without them" come from ONE function -- a second loop for the counterfactual would be a copy
// that can drift from the thing it is meant to be the counterfactual OF. The counters are taken before the
// skip so a rule that removes nothing is visible as such.
const scanChoice = (here, markets, best, t, rules) => {
    const r = { violations: 0, closed: 0, cannotPay: 0, pairs: 0 };
    for (const m of markets) for (const g of GOODS) {
        if (m.id === here.id || here.stock[g] <= 0) continue;
        r.pairs++;
        const closed = !(t >= (m.opens || 0));                  // bestRoute: !isOpen(m)
        const cannotPay = m.credits < m.trade[g];               // bestRoute: cannot pay
        if (closed) r.closed++; else if (cannotPay) r.cannotPay++;
        if (rules && (closed || cannotPay)) continue;
        if (m.trade[g] - here.trade[g] > best.margin * 1.06) r.violations++;
    }
    return r;
};
// The fixture the rules are PROVED on: one market that is open and can pay at an ordinary margin, one that
// cannot pay, one that is closed, and the last two priced far above the best route on offer. Nothing about
// the tree, so the proof does not move when the tree does.
const RULE_FIXTURE = Object.freeze({
    here: { id: 0, stock: Object.fromEntries(GOODS.map((g, i) => [g, i === 0 ? 9 : 0])), trade: Object.fromEntries(GOODS.map((g) => [g, 10])) },
    best: { margin: 20 },
    markets: [{ id: 1, opens: 0, credits: 1e6, trade: Object.fromEntries(GOODS.map((g) => [g, 25])) },
              { id: 2, opens: 0, credits: 1, trade: Object.fromEntries(GOODS.map((g) => [g, 500])) },
              { id: 3, opens: 1e6, credits: 1e6, trade: Object.fromEntries(GOODS.map((g) => [g, 500])) }],
});

console.log("\n2. A HUNDRED DAYS OF LIFE, ACCOUNTED FOR TO THE UNIT");
{
    const e = makeGitEconomy(system, { seed: 7 });
    const before = e.accounting();
    let routesOk = true, offSegment = 0, routeChecks = 0;
    let routeViolations = 0, skippedClosed = 0, skippedCannotPay = 0, wouldFlagWithoutRules = 0;
    // Every market's dry spells, measured ACROSS the hundred days rather than sampled at the end of them.
    const dryTicks = new Map(), dryLongest = new Map(), drySpell = new Map();
    const routeChoices = new Map();
    for (let i = 0; i < 400; i++) {
        // *** v4534 -- THIS SCAN MISSED TWO OF bestRoute'S FOUR RULES AND CALLED ITS CORRECT CHOICES WRONG. ***
        // bestRoute skips a market that is CLOSED and one that CANNOT PAY (`m.credits < sellP` -- "a market
        // that cannot pay is not a destination"); the scan skipped neither, so it found richer margins at
        // destinations the ship is right to refuse. MEASURED: 26 violations of 430 choices, and ALL 26 are
        // markets that cannot pay -- 0 closed, 0 unexplained. A market holding 159 credits was counted as a
        // missed 480-credit sale.
        //
        // The rules are RE-DERIVED here rather than taken from bestRoute, deliberately: a checker that asks
        // the thing it checks to define "best" agrees with it by construction and can only ever pass. That is
        // why they are spelled out again, and why they must be kept in step -- the row below asserts the
        // populations match, so a rule added to bestRoute and not to this scan is a red rather than a drift.
        for (const s of e.ships) if (s.to == null) { const b = e.bestRoute(s); if (b) { routeChecks++; const here = e.uni.systemById[s.at];
            const on = scanChoice(here, e.markets, b, e.t, true), off = scanChoice(here, e.markets, b, e.t, false);
            if (on.violations) routesOk = false;
            routeViolations += on.violations; skippedClosed += on.closed; skippedCannotPay += on.cannotPay;
            wouldFlagWithoutRules += off.violations; } }
        e.step(0.25);
        for (const m of e.markets) {
            const k = m.name || m.id, cheapest = Math.min(...GOODS.map((g) => m.trade[g]));
            if (m.credits < cheapest) {
                dryTicks.set(k, (dryTicks.get(k) || 0) + 1);
                drySpell.set(k, (drySpell.get(k) || 0) + 1);
                dryLongest.set(k, Math.max(dryLongest.get(k) || 0, drySpell.get(k)));
            } else drySpell.set(k, 0);
        }
        for (const s of e.ships) { if (s.to != null && (!e.uni.systemById[s.from] || !e.uni.systemById[s.to])) offSegment++; if (s.to != null) { const k = s.from + ">" + s.to + ":" + s.cargoGood; routeChoices.set(k, (routeChoices.get(k) || 0) + 1); } }
    }
    const a = e.accounting();
    ok("*** every ton is where the ledger says: stock + holds + consumed - produced equals the start ***", a.tonsConserved && a.total === before.initialTons, `${a.total} of ${before.initialTons} tons`);
    ok("*** every trader's credits are start + earned - spent - upkeep, and traders + treasuries - minted is the starting total ***", a.creditsOk && a.creditsConserved, `${a.creditsTotal} of ${a.initialCredits} credits; ${a.treasuries} in treasuries, ${a.traderCredits} in holds, ${a.ledger.minted} minted`);
    ok("  v4300: production ran recipes -- goods were MADE from other goods, not only moved", a.ledger.recipesRun > 100 && GOODS.some((g) => a.ledger.produced[g] > 0) && RECIPES.length === 3, `${a.ledger.recipesRun} runs`);
    ok("  v4300: upkeep was paid, and it circulates -- it sits in a treasury, not in a sink", a.ledger.upkeep > 0 && a.creditsConserved, `${a.ledger.upkeep} paid`);
    // *** v4534 -- "OVER A HUNDRED DAYS" WAS MEASURED AT ONE INSTANT: THE LAST ONE. *** a.brokeMarkets is a
    // snapshot, and being briefly dry is ROUTINE CHURN in this economy rather than a failure -- measured
    // across the run, ALL EIGHTEEN markets go dry at some tick, nine are dry simultaneously at the peak, and
    // the reading at day 100 is whatever the churn happens to be (1 here; 2 with three bodies removed, 3 with
    // one). The prose meant "ran dry" as a lasting state, so that is what is asserted: bankruptcy, which IS
    // terminal, and RECOVERY -- no market stays dry. The distribution is reported.
    const dryWorst = Math.max(0, ...dryLongest.values());
    const neverRecovered = [...dryLongest.entries()].filter(([, v]) => v >= 400).map(([k]) => k);
    // *** THE MEASUREMENT MUST BE ALIVE, AND THE SPELL ARITHMETIC MUST ACTUALLY RESET. *** Sabotage IC zeroed
    // every longest-spell and this row PASSED -- "no spell reached 400" is true of no spells at all, so the
    // check could not tell "everyone recovered" from "nothing was measured". Sabotage ID deleted the reset,
    // making a spell the cumulative dry count, and that passed too. Both are asserted directly now: a spell
    // was seen, and at least one market's dry TIME is split across SEVERAL spells, which only holds if the
    // counter resets -- keyhunt is dry 108 ticks with a longest spell of 15, and that gap is the proof.
    const split = [...dryTicks.entries()].filter(([k, v]) => (dryLongest.get(k) || 0) < v);
    ok("  at the default upkeep nobody went bankrupt", a.bankrupt === 0, `${a.bankrupt} bankrupt of ${e.ships.length} traders`);
    ok("!! *** AND NO MARKET STAYS DRY: every treasury that empties trades its way back ***",
       neverRecovered.length === 0 && dryTicks.size > 0 && dryWorst < 400 &&
       dryWorst > 0 && split.length > 0,
       neverRecovered.length ? "NEVER RECOVERED: " + neverRecovered.join(", ")
         : `${dryTicks.size} of ${e.markets.length} markets ran dry at some tick, worst unbroken spell ` +
           `${dryWorst} ticks (${(dryWorst * 0.25).toFixed(1)} days of 100), and every one recovered. ` +
           `${split.length} markets' dry time is split across SEVERAL spells, which is what proves the ` +
           "counter resets rather than accumulating. " +
           `${a.brokeMarkets} happen to be dry at the final tick, WHICH IS THE NUMBER THIS ROW USED TO ASSERT ` +
           "TO ZERO -- a snapshot of a quantity that moves, standing for a claim about a hundred days.");
    const dryTop = [...dryLongest.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
        .map(([k, v]) => `${k} ${v}`).join(", ");
    report(`dry-spell distribution, longest first: ${dryTop} ticks. NOT ASSERTED: that a five-day dry spell ` +
        "is acceptable -- that is an economy design question, and a bound chosen here would be a tolerance " +
        "picked to pass rather than a property.");
    ok("  traders traded", e.events.length > 100 && e.ships.every((s) => s.trips > 0), `${e.events.length} events, trips ${e.ships.map((s) => s.trips).join("/")}`);
    ok("*** every departure was the best margin per ton on offer at that moment (within the 5% preference noise) ***", routesOk && routeChecks > 50, `${routeChecks} choices checked, ${routeViolations} violations; ${skippedCannotPay} (good, market) pairs skipped because THE MARKET CANNOT PAY and ${skippedClosed} because it is closed -- bestRoute's own two rules, re-derived here rather than borrowed from it`);
    // *** THE TWO RULES ARE LOAD-BEARING, MEASURED. *** An exclusion that removes nothing is indistinguishable
    // from no exclusion, so what the scan would have flagged without them is counted: those are the false
    // violations this row reported for as long as the rules were missing.
    // *** v4534, SECOND WRITING -- AND THE FIRST ONE ASSERTED A PROPERTY OF THE TREE AS A PROPERTY OF THE
    // RULES. *** It required wouldFlagWithoutRules > 0 on the LIVE economy: "the repair is a number, not a
    // story". The number was 26 of 430 choices the day it was written, and it is 0 of 287 today -- because
    // the v4534 orrery re-bake changed the sim (three bodies arrived, every arrival date corrected, so every
    // orbit and every flight time moved) and the tree stopped producing a market that both cannot pay AND
    // undercuts the best route. THE RULES ARE STILL LOAD-BEARING; the live economy simply stopped
    // demonstrating it, and a check that needs the world to keep supplying its own counterexample is a
    // check that goes red on a correct tree. So the proof is a FIXTURE, run through the same scanChoice the
    // live rows use, and the live count is REPORTED beside it as the observation it always was.
    const fixOn = scanChoice(RULE_FIXTURE.here, RULE_FIXTURE.markets, RULE_FIXTURE.best, 0, true);
    const fixOff = scanChoice(RULE_FIXTURE.here, RULE_FIXTURE.markets, RULE_FIXTURE.best, 0, false);
    ok("!! *** WITHOUT bestRoute'S RULES THIS SCAN FLAGS CORRECT CHOICES -- proved on a fixture, not on the tree's mood ***",
       fixOn.violations === 0 && fixOff.violations === 2 && fixOn.cannotPay === 1 && fixOn.closed === 1 &&
       fixOn.pairs === 3 && routeViolations === 0,
       `fixture: ${fixOff.violations} false violations with the rules OFF (the market holding 1 credit ` +
       `against a price of 500, and the one that has not opened), ${fixOn.violations} with them ON. ` +
       `Live tree today: ${wouldFlagWithoutRules} would be flagged without them, ${routeViolations} with ` +
       `them, over ${routeChecks} departures -- it was 26 of 430 before the v4534 re-bake, WHICH IS WHY ` +
       "THIS ROW NO LONGER ASSERTS IT. A ship is right to refuse a 480-credit sale to a market holding 159.");
    report(`the two rules were exercised ${skippedCannotPay} times (cannot pay) and ${skippedClosed} times ` +
        `(closed) on the live tree this run, and changed the verdict ${wouldFlagWithoutRules} times. ` +
        "EXERCISED AND LOAD-BEARING ARE DIFFERENT QUESTIONS and only the second is asserted, on the fixture.");
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
        // *** v4534 -- THIS SWEPT A 40-PIXEL GRID AND PASSED FOR AS LONG AS SOMETHING HAPPENED TO SIT ON ONE
        // OF ITS 240 POINTS. *** The v4534 orrery re-bake moved every orbit and it named nothing -- with
        // picking working perfectly. Measured before believing it: a 12-pixel in-page scan found traders at
        // (440,288) and (488,312), three pixels wide, sitting between the grid's lines; 6 of 1053 samples at
        // 20 pixels hit anything at all. THE ROW WAS MEASURING WHERE THE ORBITS HAPPENED TO BE. It aims now:
        // the page publishes window.__labelled (id, name, and the body's centre in CSS pixels) from the list
        // the labels already compute, and the pointer goes THERE. And because the bodies orbit while we are
        // deciding -- aiming from a hook read 700 ms earlier missed by more than the body's 20-pixel radius
        // -- it is a closed loop: re-read, re-aim, up to 25 times, which lands on the first pass in practice.
        // The claim is stronger than the one it replaces: the HUD must name THE BODY WE AIMED AT, not merely
        // something. If the page publishes no hook at all, aimed stays null and the row says so.
        let named = null, aimed = null, aimTries = 0;
        for (; aimTries < 25 && !named; aimTries++) {
            const L = await pg.evaluate(() => window.__labelled || []);
            if (!L.length) break;
            const t = L.slice().sort((x, y) => y.rpx - x.rpx)[0]; aimed = t;
            await pg.mouse.move(Math.round(t.x), Math.round(t.y)); await pg.waitForTimeout(80);
            const txt = await pg.evaluate(() => document.getElementById("pick").textContent);
            if (/ cr$| -- /.test(txt)) named = txt;
        }
        await br.close(); srv.close();
        ok("the page loads with life on and reports the traders", /traders/.test(st.drawn), st.drawn);
        ok("*** the trade log fills and moves ***", st.log.length > 20 && st.log !== log1, st.log.slice(0, 120));
        ok("*** THE POINTER, AIMED AT A NAMED BODY, NAMES THAT BODY AND ITS PRICES ***",
           !!named && !!aimed && named.startsWith(aimed.name + " -- "),
           named ? `aimed at ${aimed.name} (radius ${aimed.rpx.toFixed(1)} px) on try ${aimTries}, and the HUD ` +
                   `reads: ${named}`
                 : aimed ? `aimed at ${aimed.name} at (${Math.round(aimed.x)}, ${Math.round(aimed.y)}) 25 times ` +
                           "and the HUD never named it -- the pick and the projection disagree about where it is"
                         : "the page published no window.__labelled: no labelled body to aim at, so nothing " +
                           "here was pointed at. Not a pass and not a skip -- see #labelled on the HUD.");
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
