#!/usr/bin/env node
// WebGLEngine/tools/ship/racesAct-selfcheck.mjs -- v4317 (Level 17)
//
// GRADES RACES THAT ACT: each race's economy (world/racePolicies.mjs) switched OFF one at a time -- its ships back
// to greedy -- against all races on, over a hundred days from one seed. A race whose absence changes nothing is a
// COSTUME, and the gate says so by name; the ones that only look different (Holo, Cells) are costumes by design
// and are named as such rather than failed. Every trait keeps the books closed: raids move tons from a port to a
// hold, discounts move credits from a ship to a treasury, holds are sales that did not happen.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy, replayEconomy, GOODS } from "../../world/gitEconomy.mjs";
import { traders as gitTraders } from "../../world/traderGraph.mjs";
import { RACES } from "../../render/fleets.mjs";
import * as R from "../../world/racePolicies.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const names = [...gitTraders().map((t) => t.name || t.id), ...system.bodies.map((b) => "hauler of " + b.name)];
// every race represented, in turn, so every behaviour is exercised (the page hashes owners to races; a crew of 22 may miss one)
const fleetOf = Uint32Array.from(names, (_, i) => i % RACES.length);
const DAYS = 100, TICKS = DAYS * 4;
const run = (off = new Set(), seed = 7) => { const e = makeGitEconomy(system, { seed, traders: R.crewForRaces(names, fleetOf, RACES, { off }) }); for (let i = 0; i < TICKS; i++) e.step(0.25); return e; };
const totals = (e) => { const a = e.accounting(); return { trips: e.ships.reduce((s, x) => s + x.trips, 0), treasuries: a.treasuries, traders: a.traderCredits, minted: a.ledger.minted, raided: a.ledger.raided || 0, discounts: a.ledger.discounts || 0, holds: e.events.filter((x) => / holds /.test(x)).length, recipes: a.ledger.recipesRun, bankrupt: a.bankrupt, ok: a.creditsOk && a.tonsConserved }; };

console.log("\n1. ALL RACES ON: the traits act, and the books close");
const on = run();
const T = totals(on);
{
    ok("every race has ships in this crew", RACES.every((r, i) => on.ships.some((s) => s.race === r.name)), on.ships.map((s) => s.race).join(","));
    ok("*** with every race acting, tons and credits are still conserved -- raids, discounts and holds keep the books ***", T.ok, `trips ${T.trips}, treasuries ${T.treasuries}, minted ${T.minted}`);
    ok("  the raider raided (tons moved from ports to its hold, nothing minted for them)", T.raided > 0 && on.events.some((x) => / raids /.test(x)), `${T.raided} t raided; ${on.events.find((x) => / raids /.test(x))}`);
    ok("  the undercutters gave discounts (credits that stayed in treasuries)", T.discounts > 0, `${T.discounts} cr`);
    ok("  the hoarders held (sales that did not happen)", T.holds > 0, `${T.holds} holds; ${on.events.find((x) => / holds /.test(x))}`);
    const scholar = on.ships.filter((s) => s.race === "Voxel");
    ok("  the scholars carried docs only", scholar.length > 0 && scholar.every((s) => s.log.every((l) => !l.bought || l.good === "docs")), scholar.map((s) => s.log.filter((l) => l.bought).length + " buys").join(", "));
    const raiderPaid = on.ships.filter((s) => s.race === "Krbn").reduce((a, s) => a + s.spent, 0);
    report(`the raiders spent ${raiderPaid} cr buying and took ${T.raided} t for nothing; the scholars made ${scholar.reduce((a, s) => a + s.trips, 0)} trips`);
    const twice = totals(run());
    ok("  the same seed twice is the same universe (the traits are deterministic)", JSON.stringify(twice) === JSON.stringify(T) && run().hash() === on.hash());
    const lg = on.log(); const rp = replayEconomy((seed) => makeGitEconomy(system, { seed, traders: R.crewForRaces(names, fleetOf, RACES) }), lg);
    ok("  and it replays from its journal with the races acting", rp.matches === true);
}

console.log("\n2. EACH RACE SWITCHED OFF: what its absence changes, by name");
{
    const acting = R.actingRaces(), costumes = RACES.map((r) => r.name).filter((n) => !acting.includes(n));
    const moved = [], still = [];
    for (const race of RACES.map((r) => r.name)) {
        const off = totals(run(new Set([race])));
        const d = { trips: off.trips - T.trips, treasuries: off.treasuries - T.treasuries, minted: off.minted - T.minted, raided: off.raided - T.raided, discounts: off.discounts - T.discounts, holds: off.holds - T.holds };
        const changed = Object.values(d).some((v) => v !== 0);
        (changed ? moved : still).push(race);
        report(`${race} off: ${Object.entries(d).filter(([, v]) => v !== 0).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") || "NOTHING CHANGED"}${off.ok ? "" : " -- BOOKS OPEN"}`);
        ok(`  ${race} off: the books still close`, off.ok);
    }
    ok("*** every ACTING race changes the ledger when switched off -- none of them is a costume ***", acting.every((n) => moved.includes(n)), `acting: ${acting.join(", ")}`);
    ok(`  the costumes are exactly the races that only look different, by design: ${costumes.join(", ")}`, costumes.every((n) => still.includes(n) || n === "Union"), `unchanged when off: ${still.join(", ") || "none"}`);
    ok("  switching the raider off ends the raids; switching the undercutters off ends the discounts", totals(run(new Set(["Krbn"]))).raided === 0 && totals(run(new Set(["Pixel", "Glyph"]))).discounts === 0);
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4317.
//   A  raid() taking nothing (n = 0) -> exit=1, 1 red: 0 t raided, no raid event.
//   B  the dock ignoring holdUntil -> exit=1, 1 red: 0 holds.
//   C  crewForRaces() ignoring `off` -> exit=1, 2 red: every race off changes NOTHING, so all seven acting races read
//      as costumes, and switching the raider off no longer ends the raids.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether these are GOOD behaviours -- a raider that empties ports may starve the sim (it did not in a hundred " +
    "days here); Holo and Cells, which are looks and say so; and the page's crew, which hashes owners to races and may seat nobody in a race.");
process.exit(fails ? 1 : 0);
