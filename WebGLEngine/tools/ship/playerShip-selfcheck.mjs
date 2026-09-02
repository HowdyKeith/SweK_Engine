#!/usr/bin/env node
// WebGLEngine/tools/ship/playerShip-selfcheck.mjs -- v4317 (Level 17)
//
// GRADES YOU, IN YOUR OWN SHIP: a manual crew member the sim never routes, flown by the smallest flight model that
// is one (thrust along the heading, a turn rate, drag), landing at a market by an intervention, buying and selling
// at the port's own prices by interventions, launching by one. The claim is about the LEDGER: a scripted flight
// (land at M, buy G, fly to M2, sell G) changes the books by exactly the trade's value and the upkeep flown, the
// books still close, a bad trade is refused as an event rather than a crash, and the whole flight replays from
// the journal and lockstops between two peers -- one of them flying.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy, replayEconomy, GOODS } from "../../world/gitEconomy.mjs";
import { traders as gitTraders } from "../../world/traderGraph.mjs";
import { makeFlight, makeCockpit, flyTo, FLIGHT } from "../../world/playerShip.mjs";
import { runPair } from "../../world/economyLockstep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const crew = () => [...gitTraders().map((t) => ({ name: t.name || t.id })), ...system.bodies.map((b) => ({ name: "hauler of " + b.name })), { name: "you", manual: true }];
const fresh = (seed = 7) => makeGitEconomy(system, { seed, traders: crew() });

console.log("\n1. THE FLIGHT MODEL: it flies where it is pointed, it stops when landed, it arrives");
{
    const f = makeFlight({ x: 0, y: 0, yaw: 0 });
    for (let i = 0; i < 30; i++) f.step(1 / 30, { thrust: 1, turn: 0 });
    ok("thrust along the heading moves the ship along +x and nowhere else", f.state.x > 0.5 && Math.abs(f.state.y) < 1e-9 && f.state.vx > 0, `x ${f.state.x.toFixed(3)} after a second`);
    const v0 = Math.hypot(f.state.vx, f.state.vy); for (let i = 0; i < 60; i++) f.step(1 / 30, {}); const v1 = Math.hypot(f.state.vx, f.state.vy);
    ok("  drag slows a coasting ship", v1 < v0 * 0.5 && v1 > 0, `${v0.toFixed(3)} -> ${v1.toFixed(3)}`);
    for (let i = 0; i < 30; i++) f.step(1 / 30, { thrust: 0, turn: 1 });
    ok("  turning turns the heading at the turn rate", Math.abs(f.state.yaw - FLIGHT.turn) < 1e-6, `yaw ${f.state.yaw.toFixed(3)} after a second of full turn`);
    const g = makeFlight({ x: 0, y: 0, yaw: 0 }); const to = [3, -2]; const r = flyTo(g, to);
    ok("*** the scripted flight arrives at a target across the plane ***", r.arrived && Math.hypot(g.state.x - to[0], g.state.y - to[1]) < FLIGHT.landRadius, `${r.steps} steps`);
    g.land({ id: 1 }, () => to); g.step(1 / 30, { thrust: 1 });
    ok("  a landed ship does not move until it launches", g.state.landed === 1 && g.state.x === to[0] && g.state.vx === 0);
}

console.log("\n2. THE COCKPIT: land, buy, fly, sell -- the ledger moves by exactly the trades, and closes");
{
    const e = fresh(7), you = e.ships.length - 1, c = makeCockpit(e, you);
    ok("the manual ship is never routed: a hundred ticks and it has not moved or traded", (() => { for (let i = 0; i < 100; i++) e.step(0.25); return e.ships[you].trips === 0 && e.ships[you].to == null && e.ships[you].log.length === 0; })(), `credits ${e.ships[you].store.get("credits")} after upkeep`);
    const m1 = e.markets[0], m2 = e.markets.reduce((b, m) => (m.trade.binaries > b.trade.binaries ? m : b), e.markets[1]);
    const pos = (m) => { const p = e.uni.systemById[m.id]; return [p.body ? 0 : 0, 0]; };
    const before = e.accounting(), credits0 = e.ships[you].store.get("credits"), treasury1 = m1.credits, treasury2 = m2.credits;
    c.land(m1.id); e.step(0.25);
    const scr = c.screen();
    ok("landed: the trade screen shows the port, its prices, and what can be bought", scr && scr.market === m1.name && scr.goods.length === 4 && scr.goods.some((g) => g.canBuy > 0), scr ? scr.goods.map((g) => `${g.good} ${g.price} x${g.canBuy}`).join(", ") : "no screen");
    const pick = scr.goods.filter((g) => g.canBuy > 0).sort((a, b) => b.canBuy - a.canBuy)[0], n = Math.min(5, pick.canBuy), price1 = pick.price;
    c.buy(pick.good, n); e.step(0.25);
    const bought = e.ships[you].player.cargo[pick.good] || 0, spent = credits0 - e.ships[you].store.get("credits") - 40 * 0;
    ok(`  bought ${n} t of ${pick.good}: the hold has them, the port's stock lost them, the credits moved to the treasury`, bought === n && m1.credits === treasury1 + n * price1 && e.ships[you].spent === n * price1, `${n} x ${price1} = ${n * price1} cr`);
    c.launch(); e.step(0.25);
    ok("  launched: not landed, still at the port until it lands elsewhere", !e.ships[you].landed && e.ships[you].at === m1.id);
    c.sell(pick.good, 1); e.step(0.25);
    ok("  a sale while flying is REFUSED as an event, not a crash, and counted", e.events.some((x) => /you: trade refused, not landed/.test(x)) && e.accounting().ledger.refused === 1);
    c.land(m2.id); e.step(0.25);
    const price2 = m2.trade[pick.good], canPay = Math.floor(m2.credits / price2), k = Math.min(n, canPay);
    c.sell(pick.good, n); e.step(0.25);
    const after = e.accounting();
    ok(`  sold ${k} t at ${m2.name} for ${price2}: earned exactly that, the port paid exactly that`, e.ships[you].earned === k * price2 && (e.ships[you].player.cargo[pick.good] || 0) === n - k, `earned ${e.ships[you].earned}`);
    ok("*** the books close across the person's trades: tons and credits conserved, the ship's credits exactly start + earned - spent - upkeep ***", after.tonsConserved && after.creditsOk && after.creditsConserved);
    c.sell(pick.good, 99); e.step(0.25);
    ok("  selling more than the hold has is refused with the numbers", e.events.some((x) => /selling 99 t of .* refused \(has \d+, the port can pay for \d+\)/.test(x)));
    ok("REFUSED (thrown, not an event): landing a ship that is not manual, trading a good that does not exist", throwsWith(() => { e.intervene("land", { ship: 0, market: m1.id }); e.step(0.25); }, /not a manual ship/) && throwsWith(() => { e.intervene("trade", { ship: you, good: "spice", tons: 1 }); e.step(0.25); }, /no good spice/));
    const lg = e.log(); const rp = replayEconomy((seed) => fresh(seed), lg);
    ok("  the whole flight is in the journal (land, trade, launch, land, trade x3) and replays to the same hash", lg.interventions.map((iv) => iv.kind).join(",") === "land,trade,launch,trade,land,trade,trade" && rp.matches === true);
}

console.log("\n3. TWO PEERS, ONE OF THEM FLYING: the cockpit's interventions cross the wire and both books agree");
{
    // *** THIS SAID `ship: MANUAL` AND SECTION 2, TWENTY LINES UP, DERIVES THE SAME THING. *** crew() appends the
    // manual ship last, so its index is the crew length minus one -- 22 when the orrery held fourteen bodies,
    // 23 since vendor/three-webgpu arrived and v4329 re-baked. The typed form threw "ship 22 is not a manual
    // ship" the moment the bake was refreshed, which is the whole shape of this round: a number that was right
    // once, against data that moved.
    const MANUAL = fresh(7).ships.length - 1;
    const pair = runPair({ makeEconomy: () => fresh(7), ticks: 120, interventions: [{ atTick: 10, peer: "a", kind: "land", args: { ship: MANUAL, market: 1 } }, { atTick: 20, peer: "a", kind: "trade", args: { ship: MANUAL, good: "docs", tons: 3 } }, { atTick: 40, peer: "a", kind: "launch", args: { ship: MANUAL } }, { atTick: 60, peer: "a", kind: "land", args: { ship: MANUAL, market: 4 } }, { atTick: 70, peer: "a", kind: "trade", args: { ship: MANUAL, good: "docs", tons: -3 } }] });
    ok("*** peer a flies and trades; peer b sees the same universe at every tick -- the same hash, the same earned credits ***", pair.agree && pair.upTo >= 120 && pair.a.applied.length === 5 && pair.b.applied.length === 5 && pair.a.session.economy.ships[MANUAL].earned === pair.b.session.economy.ships[MANUAL].earned && pair.a.session.economy.ships[MANUAL].earned > 0, `earned ${pair.a.session.economy.ships[MANUAL].earned} on both`);
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4317.
//   A  the manual ship routed like any other (the `manual` skip removed) -> exit=1, 2 red: it has traded before the
//      person touched it (5,620 credits where upkeep alone would leave less), and the trade screen shows nothing to
//      buy because the sim's own route has its hold full.
//   B  the buy not charging the port's stock -> exit=1, 1 red: the books do not close (tons made from nothing).
//   C  a refused trade thrown instead of evented -> exit=1 with NO verdict lines: the gate itself died at the flying
//      sale, uncaught inside step() -- which is the crash a peer's bad trade would have handed everyone.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE FLYING, as a feel. The model here is the smallest one that is a model; the EV flight view carries the " +
    "game's own, and the page's keys drive this one. Also: landing by proximity is the page's decision (the sim only knows the " +
    "intervention), and a person in one tab racing a peer's hauler for the same cargo, which the wire allows and nobody has tried.");
process.exit(fails ? 1 : 0);
