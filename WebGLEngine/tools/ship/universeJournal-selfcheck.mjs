#!/usr/bin/env node
// WebGLEngine/tools/ship/universeJournal-selfcheck.mjs -- v4314 (Level 16)
//
// GRADES A UNIVERSE THAT PERSISTS: the economy is a seed plus a journal (steps as run-lengths, interventions at
// their ticks), and replaying the journal on a fresh economy reaches the same state hash; a journal with one
// intervention missing does not (the control). Then TIME IS GIT TIME: markets open on the day git says their body
// arrived, their haulers join with them, no trade happens at a market before its day, and two histories from the
// same seed are one history. Then the GitHub feed: commits as production, journaled, replayed, deduplicated. And
// the page, restored from its own save, says the replay matched.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy, replayEconomy, GOODS, BASE } from "../../world/gitEconomy.mjs";
import { applyCommitsFeed, fixtureFeed, marketForRepo } from "../../world/commitsFeed.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const fresh = (seed = 7, opts = {}) => makeGitEconomy(system, { seed, ...opts });

console.log("\n1. THE JOURNAL: seed + log reproduces the universe, and one missing intervention is a different universe");
{
    const live = fresh(7);
    for (let i = 0; i < 400; i++) { if (i === 50) live.intervene("gift", { ship: 0, credits: 700 }); if (i === 120) live.intervene("stock", { market: "three", good: "docs", tons: 30 }); if (i === 200) live.intervene("credits", { market: 2, credits: 5000 }); live.step(0.25); }
    const lg = live.log();
    ok("the log is small: the steps as run-lengths, the interventions at their ticks, the hash", lg.steps.length === 1 && lg.steps[0][1] === 400 && lg.interventions.length === 3 && lg.interventions.map((iv) => iv.tick).join() === "50,120,200" && /^[0-9a-f]{8}$/.test(lg.hash), JSON.stringify(lg).length + " bytes");
    const back = JSON.parse(JSON.stringify(lg));
    const r = replayEconomy((seed) => fresh(seed), back);
    ok("*** a fresh economy replaying the log reaches the same hash ***", r.matches === true && r.hash === lg.hash && r.tick === 400, `${r.hash} at tick ${r.tick}`);
    const a1 = live.accounting(), a2 = r.economy.accounting();
    ok("  and the same books: tons conserved, credits conserved, the same treasuries and holds", a1.creditsOk && a2.creditsOk && a1.tonsConserved && a2.tonsConserved && a1.treasuries === a2.treasuries && a1.traderCredits === a2.traderCredits, `treasuries ${a1.treasuries} / traders ${a1.traderCredits}`);
    const missing = { ...back, interventions: back.interventions.slice(1) };
    const r2 = replayEconomy((seed) => fresh(seed), missing);
    ok("CONTROL: the log with one intervention dropped replays to a DIFFERENT hash, and says so", r2.matches === false && r2.hash !== lg.hash, `${r2.hash} vs ${lg.hash}`);
    const moved = fresh(7); moved.step(0.25);
    ok("REFUSED: replaying on an economy that has moved", throwsWith(() => moved.replay(back), /fresh economy/));
    ok("REFUSED: replaying a log made with another seed", throwsWith(() => fresh(8).replay(back), /seed 7, this economy has 8/));
    ok("REFUSED: an intervention in the past (a peer that late has already diverged)", throwsWith(() => live.intervene("gift", { ship: 0, credits: 1 }, 10), /in the past/));
    ok("REFUSED: an intervention nobody defined, and one on a market or ship that is not there", throwsWith(() => { live.intervene("bribe", {}); live.step(0.25); }, /unknown intervention/) && throwsWith(() => { live.intervene("credits", { market: "nowhere", credits: 1 }); live.step(0.25); }, /no market/));
    // the hash is over integers only: the same universe stepped twice in one process agrees, and positions are not in it
    const p1 = fresh(7), p2 = fresh(7); for (let i = 0; i < 200; i++) { p1.step(0.25); p2.step(0.25); }
    ok("two economies from one seed hash the same at every tick they share (the lockstep premise)", p1.hash() === p2.hash() && fresh(8).hash() !== p1.hash());
    // the hash must see EVERY integer the sim owns, or a lost intervention can hide in the one it does not see
    const h0 = p1.hash(), touched = [];
    const probe = (label, mutate, undo) => { mutate(); touched.push(`${label}:${p1.hash() !== h0 ? "seen" : "BLIND"}`); undo(); };
    probe("a market's stock", () => { p1.markets[0].stock.docs += 1; }, () => { p1.markets[0].stock.docs -= 1; });
    probe("a treasury", () => { p1.markets[1].credits += 1; }, () => { p1.markets[1].credits -= 1; });
    probe("a price", () => { p1.markets[2].trade.source += 1; }, () => { p1.markets[2].trade.source -= 1; });
    probe("a ship's cargo", () => { p1.ships[0].player.cargo.docs = (p1.ships[0].player.cargo.docs || 0) + 1; }, () => { p1.ships[0].player.cargo.docs -= 1; });
    probe("a ship's credits", () => { p1.ships[1].store.add("credits", 1); }, () => { p1.ships[1].store.add("credits", -1); });
    probe("where a ship is", () => { p1.ships[2].at = p1.ships[2].at === 1 ? 2 : 1; }, () => { p1.ships[2].at = p1.ships[2].at === 1 ? 2 : 1; });
    ok("*** the hash sees every integer: stock, treasury, price, cargo, credits, position -- a change to any one changes it ***", touched.every((x) => x.endsWith("seen")) && p1.hash() === h0, touched.join(", "));
}

console.log("\n2. TIME IS GIT TIME: markets open on their vendoring day, haulers join with them, nothing trades early");
{
    const dated = system.bodies.filter((b) => b.arrived).map((b) => b.arrived).sort();
    const h = fresh(7, { history: true });
    ok("the calendar starts on the day the first body arrived", h.date === dated[0] && h.history === true, `${h.date}; bodies ${dated[0]} .. ${dated[dated.length - 1]}`);
    const opensOf = Object.fromEntries(h.markets.map((m) => [m.id, m.opens || 0]));
    ok("  a market's opening day is git's date for its body, in whole days from the epoch", h.markets.every((m) => m.opens === Math.round((new Date(m.body.arrived + "T00:00:00Z") - new Date(dated[0] + "T00:00:00Z")) / 86400000)), h.markets.map((m) => `${m.name}:${m.opens}`).join(" "));
    ok("  on day 0 only the day-0 markets are open, and only their haulers plus the contributors are in the sky", h.openMarkets() === h.markets.filter((m) => m.opens === 0).length && h.joinedShips() === 0, `${h.openMarkets()} open before the first step`);
    let monotone = true, prevOpen = 0, prevJoined = 0, early = 0; const days = [];
    for (let i = 0; i < 4 * 40; i++) { h.step(0.25); const o = h.openMarkets(), j = h.joinedShips(); if (o < prevOpen || j < prevJoined) monotone = false; prevOpen = o; prevJoined = j;
        if (i % 16 === 15) days.push(`${h.date}:${o}/${j}`); }
    ok("*** markets open and ships join in git's order, never fewer, and every market is open by the last arrival ***", monotone && h.openMarkets() === h.markets.length && h.joinedShips() === h.ships.length, days.join(" "));
    for (const s of h.ships) for (const e of s.log) { const m = h.markets.find((x) => x.name === e.at); if (m && e.tick * 0.25 < opensOf[m.id]) early++; }
    ok("  no ship bought or sold at a market before that market's day", early === 0, `${early} early trades`);
    const hauler = h.ships.find((s) => /^hauler of /.test(s.name) && s.joins > 0);
    ok("  a hauler joins on its own body's day, at an open market", !!hauler && hauler.joined && h.events.some((e) => e.startsWith(`${hauler.name} joins`) && e.endsWith(`on day ${hauler.joins}`)), hauler ? h.events.find((e) => e.startsWith(`${hauler.name} joins`)) : "no dated hauler");
    const acc = h.accounting();
    ok("  and the books close across the openings (a market that opens brings its stock and treasury with it, counted from day 0)", acc.tonsConserved && acc.creditsOk, `${acc.total} t, credits ok ${acc.creditsOk}`);
    const h2 = fresh(7, { history: true }); for (let i = 0; i < 4 * 40; i++) h2.step(0.25);
    ok("  two histories from one seed are one history", h2.hash() === h.hash(), h.hash());
    const lg = h.log(); const r = replayEconomy((seed) => fresh(seed, { history: true }), lg);
    ok("  and a history replays from its log", r.matches === true);
    ok("CONTROL: without history everything is open on day 0 and every ship is in the sky, as v4300 had it", fresh(7).openMarkets() === system.bodies.length && fresh(7).joinedShips() === system.bodies.length + fresh(7).ships.length - system.bodies.length && fresh(7).date === null);
    ok("REFUSED: history for a system whose bodies carry no dates", throwsWith(() => makeGitEconomy(buildOrrery(raw.bodies.map((b) => ({ ...b, arrived: null })), { today: "2026-09-01" }), { history: true }), /no.*arrived/i));
}

console.log("\n3. THE UNIVERSE REACTS TO GITHUB: commits as production, journaled and deduplicated");
{
    const e = fresh(7, { history: true }); for (let i = 0; i < 60; i++) e.step(0.25);
    const feed = fixtureFeed(e.markets, { days: 7, seed: 5 });
    const before = e.accounting(), src0 = before.ledger.produced.source, mint0 = before.ledger.minted;
    const r = applyCommitsFeed(e, feed); e.step(0.25);
    const after = e.accounting();
    const commits = feed.reduce((a, f) => a + f.commits, 0);
    ok("every fixture record lands on its body (vendor/<name> names the market), none skipped", r.applied.length === feed.length && r.skipped.length === 0 && feed.length > 10, `${feed.length} records, ${commits} commits`);
    ok("*** each commit is a ton of source made at that market, and its base value minted ***", after.ledger.produced.source - src0 === commits && after.ledger.minted - mint0 === commits * BASE.source, `+${after.ledger.produced.source - src0} t, +${after.ledger.minted - mint0} cr`);
    ok("  and the books still close", after.tonsConserved && after.creditsOk);
    const again = applyCommitsFeed(e, feed, { seen: r.seen });
    ok("  the same feed again counts nothing (every record remembered)", again.applied.length === 0 && again.skipped.every((s) => s.why === "already counted"));
    const unknown = applyCommitsFeed(e, [{ repo: "someone/not-a-body", commits: 3, date: "x" }, { repo: "vendor/three", commits: 0, date: "y" }]);
    ok("  a repository that is no body here, and a record with no commits, are skipped with their reasons", unknown.applied.length === 0 && unknown.skipped.map((s) => s.why).join("|") === "no body of that name in this orrery|no commits");
    ok("  marketForRepo matches the vendor directory, case-blind, with or without .git", marketForRepo("mrdoob/Three.git", e.markets) === e.markets.find((m) => m.name === "three") && marketForRepo("x/nothing", e.markets) === null);
    const lg = e.log(); const rp = replayEconomy((seed) => fresh(seed, { history: true }), lg);
    ok("  the feed is in the journal (commits interventions), and the universe with it replays to its hash", lg.interventions.filter((iv) => iv.kind === "commits").length === feed.length && rp.matches === true);
}

console.log("\n4. THE PAGE: git time on the HUD, a save, a restore that says its replay matched");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${srv.address().port}`;
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const ctx = await br.newContext({ viewport: { width: 640, height: 480 } });
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(origin + "/orrery-gpu.html", { waitUntil: "load" }); await pg.waitForTimeout(4000);
    const st = await pg.evaluate(() => ({ date: document.getElementById("date").textContent, tick: window.__universe.tick, hash: window.__universe.hash(), history: window.__universe.history, route: document.getElementById("route").textContent }));
    ok("the page runs git time by default: a calendar day and open-market count on the HUD, the sim moving", st.history === true && /^\d{4}-\d{2}-\d{2} \(\d+ markets open/.test(st.date) && st.tick > 0, `${st.date}; tick ${st.tick}; ${st.route}`);
    await pg.click("#save"); const saved = await pg.evaluate(() => ({ note: document.getElementById("persist").textContent, log: JSON.parse(localStorage.getItem("swek.orrery.journal")) }));
    ok("  save writes the journal to localStorage and says the tick and hash", /^saved at tick \d+, hash [0-9a-f]{8}$/.test(saved.note) && saved.log && saved.log.tick > 0, saved.note);
    await pg.goto(origin + "/orrery-gpu.html?restore=1", { waitUntil: "load" }); await pg.waitForTimeout(2500);
    const rs = await pg.evaluate(() => ({ note: document.getElementById("persist").textContent, restored: window.__universe.restored, tick: window.__universe.tick }));
    ok("*** restore replays the saved journal on load and reports that the replay reached the saved hash ***", rs.restored && rs.restored.matches === true && /replay MATCHES the saved hash/.test(rs.note) && rs.tick >= saved.log.tick, rs.note);
    await pg.click("#commits"); await pg.waitForTimeout(600);
    const fed = await pg.evaluate(() => ({ note: document.getElementById("persist").textContent, n: window.__universe.log().interventions.filter((iv) => iv.kind === "commits").length }));
    ok("  a week of commits feeds in as journaled production", /commit record\(s\) fed as production/.test(fed.note) && fed.n > 5, `${fed.note}; ${fed.n} in the journal`);
    ok("  and the page threw nothing", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await br.close(); srv.close();
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 16.
//   A  replay() skipping the interventions (steps only) -> exit=1, 3 red: the replay reaches 031c6b91 against the
//      live hash, the books differ (treasuries 20,314 against the live run's), and the history-with-feed replay in
//      section 3 no longer matches.
//   B  isOpen() always true (history ignored for markets) -> exit=1, 2 red: 14 markets open before the first step
//      where only the day-0 ones should be, and 14 early trades at markets not yet vendored.
//   C  the hash leaving out treasuries -> exit=1, 1 red: the coverage probe reads "a treasury: BLIND". Every other
//      line stays green -- the replay control still differs, because a gift also moves a trader's credits -- which
//      is why the probe exists: a hash that misses one integer passes every test that happens to touch another.
//   D  (measured for economyLockstep's B) the hash leaving out cargo -> exit=1, 1 red here, the same probe:
//      "a ship's cargo: BLIND"; the lockstep gate itself stays green, since its cheat is a gift, not a hold.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the sky itself under history (orbits are today's; a body's orbit does not shrink back to its arrival day); " +
    "a live commits source (the ai-bridge does not expose one yet -- the feed here is a fixture, and says so); and the universe " +
    "page's restore across a browser restart, which localStorage promises and this shell cannot show.");
process.exit(fails ? 1 : 0);
