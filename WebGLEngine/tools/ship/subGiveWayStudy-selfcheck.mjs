// WebGLEngine/tools/ship/subGiveWayStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subGiveWayStudy-selfcheck.mjs      (about 20 s: hand fixtures, a few real flights on DEV seeds)
//
// THE GATE OF brain/subGiveWay.mjs AND tools/ship/subGiveWayStudy.mjs (FOLLOW-UP 6 of brain/SUB_FIELD_NAV_WIP.md, registered before either existed).
//   1 REGISTRATION  the arms, the designated arm, HELD78 = 7501-7560, DEV 1-30, the bars (48, no exit, half the ship collisions, net 5 at p <= 0.10), the give-way constants.
//   2 THE COPY      with both options off the copy is flyHard on DEV flights; buildFreeField without ownEdge is buildHardField.
//   3 +free         the edge freed around the vessel only with ownEdge; the band test; the speed cap while in the band.
//   4 +giveway      the offsets' order; runClear refuses a ship, the region and passes open water; the heading chosen is the first clear one.
//   5 THE RULE      the sign test, the pairing, the four bars and the three verdicts on fixtures; a failed check says NOT WEIGHED.
// NOT CHECKED, said plainly: what the options do on HELD78 (that is the experiment).
// SABOTAGE LOG (22 mutants of brain/subGiveWay.mjs and tools/ship/subGiveWayStudy.mjs, each alone, restored byte-identical, sha-256 checked): steps of 10 deg (2 red), 1 m inside,
//   HELD78 from 7500, ownEdge freeing every edge cell, shapes freed only with ownEdge, the band without edgeExtra, runClear ignoring keels, the larger heading first, the bar 47,
//   p 0.2, the ship bar without the half, a one-sided sign test, PARTLY requiring no exit, the bite on one option, the report ignoring a failed check (1 red each).
//   *** 7 WENT 0 RED AT FIRST ***: runClear's y sign (every fixture ran along x), give way at the yield speed, +free never slowing, the rebuilt plan ignoring ownEdge, every
//   collision called a ship, the net ignoring losses, and check 1 comparing the status only. The four flight rules were refactored into exported pieces (giveWayTarget,
//   freeTarget, replanAt, hitOf; the copy is still flyHard on DEV, section 2) and each got a row; the net and check 1 got fixtures. Then 1 red each.
"use strict";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-12) => Math.abs(a - b) < t;
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e.message)); } };
import * as H from "../../brain/subHardNav.mjs";
import * as N from "../../brain/subFieldNav.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as G from "../../brain/subGiveWay.mjs";
import * as X from "./subGiveWayStudy.mjs";
const t0 = Date.now();
console.log("subGiveWayStudy-selfcheck -- FOLLOW-UP 6, give way and a way out of the edge band\n");

sec("1. REGISTRATION");
ok("!! the arms ref, ref+free, ref+giveway, ref+free+giveway (designated) on any+predict+edge+yield", J(G.ARMS) === J(["ref", "ref+free", "ref+giveway", "ref+free+giveway"]) && G.DESIGNATED === "ref+free+giveway" && G.BASE_ARM === "any+predict+edge+yield" && throws(() => G.flyGiveWay(X.pilot, H.hardScenario(1, "hard-traffic"), "ref+stop"), /unknown arm/));
ok("!! HELD78 is 7501-7560 and DEV 1-30, disjoint; the kind hard-traffic", G.HELD78.length === 60 && G.HELD78[0] === 7501 && G.HELD78[59] === 7560 && G.DEV.length === 30 && G.DEV[0] === 1 && G.DEV[29] === 30 && X.KIND === "hard-traffic" && J(X.SETS) === J({ dev: G.DEV, held78: G.HELD78 }));
ok("!! the bars: 48 of 60, net 5 at p <= 0.10; give way in 5 deg steps to +-90 deg, 3 m inside the region, the yield test's 20 m and 30 s", X.BAR === 48 && X.GAIN === 5 && X.P_LEVEL === 0.1 && G.STEP_DEG === 5 && G.SPAN_DEG === 90 && G.INSIDE === 3 && H.YIELD_CLEAR === 20 && H.HORIZON_S === 30 && H.YIELD_SPEED === 2);

sec("2. THE COPY");
{
    const same = X.copySame([1, 2, 3, 5, 8, 13]);
    ok("!! with both options off the copy is subHardNav.flyHard on six DEV flights (status, ticks, path, minimum clearance)", same === true);
    const sh = H.planShapes(H.hardScenario(4, "hard-traffic"), 30, { mode: "predict" }), goal = H.hardScenario(4, "hard-traffic").goal, own = { x: 100, y: 120 };
    const a = H.buildHardField(sh, goal, { margin: 6, own, edgeExtra: 20 }), b = G.buildFreeField(sh, goal, { margin: 6, own, edgeExtra: 20 });
    ok("!! without ownEdge buildFreeField is buildHardField, cell for cell and distance for distance", J(Array.from(a.blocked)) === J(Array.from(b.blocked)) && J(Array.from(a.dist)) === J(Array.from(b.dist)) && a.margin === b.margin);
}

sec("3. +free");
{
    const sh = [], goal = { x: 200, y: 0 }, own = { x: 100, y: 120 };
    const a = G.buildFreeField(sh, goal, { margin: 3, own, edgeExtra: 20 }), b = G.buildFreeField(sh, goal, { margin: 3, own, edgeExtra: 20, ownEdge: true }), c = N.cellOf(a, own.x, own.y);
    ok("!! a vessel 20 m from the edge stands in a blocked cell with no route; with ownEdge its cell is free and has a route, and only cells within OWN_CLEAR changed",
        a.blocked[c.i] === 1 && !(a.dist[c.i] < N.BIG) && b.blocked[N.cellOf(b, own.x, own.y).i] === 0 && b.dist[c.i] < N.BIG &&
        Array.from(a.blocked).every((v, i) => v === b.blocked[i] || Math.hypot(a.x0 + ((i % a.w) + 0.5) * N.CELL - own.x, a.y0 + (Math.floor(i / a.w) + 0.5) * N.CELL - own.y) <= H.OWN_CLEAR));
    ok("!! the band: half-hull + margin + edgeExtra from the boundary; 26 m from y = +140 is in it at margin 3 (27 m), 28 m is not; margin 12 widens it", G.inBand({ margin: 3 }, 100, 114, 20) && !G.inBand({ margin: 3 }, 100, 112, 20) && G.inBand({ margin: 12 }, 100, 112, 20));
}

sec("4. +giveway");
{
    ok("!! the offsets: 0, then -5, +5, -10, +10 ... -90, +90 (37 headings)", G.OFFSETS.length === 37 && J(G.OFFSETS.slice(0, 5)) === J([0, -5, 5, -10, 10]) && J(G.OFFSETS.slice(-2)) === J([-90, 90]));
    const ship = { type: "ship", x: 100, y: 0, vx: 0, vy: 0, r: 6, keel: Infinity };
    ok("!! runClear: open water passes; a run into a ship 40 m ahead fails; a run out of the region fails; a ship under the vessel's floor (keel + 5 not deeper than minDepth) is ignored",
        G.runClear(0, 50, 0, 3, 0, [ship], 10) && !G.runClear(0, 0, 0, 3, 0, [ship], 10) && !G.runClear(400, 0, 0, 3, 0, [], 10) && G.runClear(0, 0, 0, 3, 0, [{ ...ship, keel: 4 }], 10) && !G.runClear(0, 0, 0, 3, 0, [{ ...ship, keel: 6 }], 10));
    const st = S.createState({ pos: [0, 0, -20], speed: 3, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: S.createSubModel(S.EXPLORER) }), sp = S.attitude(st).speed;
    const h = G.giveWayHeading(st, { heading: 0 }, 0, [ship], 10), want = G.OFFSETS.map((d) => (d * Math.PI) / 180).find((x) => G.runClear(0, 0, x, sp, 0, [ship], 10));
    ok("!! the heading chosen is the first clear offset in that order (here a turn, not straight on), and null when nothing is clear", h !== null && h !== 0 && near(h, want) && G.giveWayHeading(st, { heading: 0 }, 0, [{ ...ship, x: 0, y: 0, r: 200 }], 10) === null);
    const sc = H.hardScenario(3, "hard-traffic"), r = G.flyGiveWay(X.pilot, sc, "ref+giveway"), f = G.flyGiveWay(X.pilot, sc, "ref+free");
    ok("  on a real DEV flight each option is used (give-way ticks, band ticks counted) and a collision says what it hit", r.giveTicks > 0 && f.freeTicks >= 0 && ["ship", "berg", "island", null].includes(r.hit) && (r.status !== "collided" || r.hit !== null));
}

{
    ok("!! runClear reads the heading's sign: at heading +90 deg the vessel moves toward -y, so a ship 60 m down -y blocks it and one 60 m up +y does not", !G.runClear(0, 0, Math.PI / 2, 3, 0, [{ type: "ship", x: 0, y: -60, vx: 0, vy: 0, r: 6, keel: Infinity }], 10) && G.runClear(0, 0, Math.PI / 2, 3, 0, [{ type: "ship", x: 0, y: 60, vx: 0, vy: 0, r: 6, keel: Infinity }], 10));
    const plan = { depth: 20, heading: 0.3, speed: 3 };
    ok("!! +giveway keeps the plan's depth and CRUISE speed on the new heading (it steers instead of slowing); +free caps the speed at the yield speed only in the band", J(G.giveWayTarget(plan, 1.2)) === J({ depth: 20, heading: 1.2, speed: 3 }) &&
        G.freeTarget({ margin: 3 }, 100, 114, 20, plan, 2).speed === 2 && G.freeTarget({ margin: 3 }, 100, 0, 20, plan, 2) === plan && G.freeTarget({ margin: 3 }, 100, 114, 20, { ...plan, speed: 2 }, 2).speed === 2);
    const sc = H.hardScenario(4, "hard-traffic"), pos = { x: 200, y: 118 }, c = (f) => { const k = N.cellOf(f, pos.x, pos.y); return k && f.dist[k.i] < N.BIG; };
    ok("!! a rebuilt plan with +free has a route from a vessel standing in the band (20 m from y = +140); without it, none", c(G.replanAt(sc, 30, pos, { free: true })) === true && c(G.replanAt(sc, 30, pos, { free: false })) === false);
    ok("!! a collision says what was hit: the nearest obstacle's type", G.hitOf([{ type: "berg", x: 0, y: 0, r: 5, keel: Infinity, vx: 0, vy: 0 }, { type: "ship", x: 50, y: 0, r: 5, keel: Infinity, vx: 0, vy: 0 }], 2, 0, 10, 0) === "berg" && G.hitOf([{ type: "ship", x: 50, y: 0, r: 5, keel: Infinity, vx: 0, vy: 0 }], 48, 0, 10, 0) === "ship");
    ok("!! check 1 compares path and clearance, not only the status: a copy whose path is 1 mm longer is not flyHard", X.copySame([2], (sc) => { const r = G.flyGiveWay(X.pilot, sc, "ref"); return { ...r, path: r.path + 0.001 }; }) === false && X.copySame([2], (sc) => { const r = G.flyGiveWay(X.pilot, sc, "ref"); return { ...r, minClearance: r.minClearance + 0.001 }; }) === false);
}

sec("5. THE RULE");
{
    ok("!! the exact two-sided sign test: 9 of 14 -> 0.4240, 13 of 20 -> 0.2632, 7 of 7 -> 0.0156, 0 discordant -> 1", near(X.signTest(9, 14), 0.42395, 1e-5) && near(X.signTest(13, 20), 0.26318, 1e-5) && near(X.signTest(7, 7), 0.015625, 1e-9) && X.signTest(0, 0) === 1 && near(X.signTest(5, 14), X.signTest(9, 14)));
    const rec = (seed, status, hit = null) => ({ seed, kind: "hard-traffic", status, reached: status === "reached", hit, ticks: 1, path: 1, chord: 1, t: status === "reached" ? 100 : null, minClearance: 1 });
    const mk = (ref, des, o = {}) => ({ ref, "ref+free": o.free || ref.map((r) => ({ ...r, ticks: 2 })), "ref+giveway": o.give || ref.map((r) => ({ ...r, ticks: 3 })), "ref+free+giveway": des });
    const n = 60, ref = Array.from({ length: n }, (_, i) => rec(i, i < 40 ? "reached" : i < 54 ? "collided" : "left", i >= 40 && i < 54 ? "ship" : null));
    const good = Array.from({ length: n }, (_, i) => rec(i, i < 50 ? "reached" : "collided", i >= 50 && i < 56 ? "ship" : i >= 50 ? "berg" : null));
    ok("!! SUPPORTED: 50 of 60, no exit, 6 ship collisions against 14, net +10 at p 0.002", X.verdictOf(mk(ref, good)).verdict === "SUPPORTED" && X.verdictOf(mk(ref, good)).pair.net === 10);
    const partly = good.map((r, i) => (i === 59 ? rec(i, "left") : r));
    ok("!! PARTLY SUPPORTED when only the gain bar holds (an exit)", X.verdictOf(mk(ref, partly)).verdict === "PARTLY SUPPORTED" && X.verdictOf(mk(ref, partly)).bars.noExit === false);
    const weak = ref.map((r, i) => (i >= 40 && i < 44 ? rec(i, "reached") : r));
    ok("!! NOT SUPPORTED: net +4 is under the gain bar", X.verdictOf(mk(ref, weak)).verdict === "NOT SUPPORTED" && X.verdictOf(mk(ref, weak)).pair.net === 4);
    const ships = good.map((r, i) => (i >= 50 ? rec(i, "collided", "ship") : r));
    ok("!! the ship bar: 10 ship collisions against 14 is more than half", X.verdictOf(mk(ref, ships)).bars.ships === false && X.verdictOf(mk(ref, ships)).verdict === "PARTLY SUPPORTED");
    const mixed = ref.map((r, i) => (i >= 40 && i < 43 ? rec(i, "reached") : i === 0 ? rec(i, "collided", "ship") : r));
    ok("!! the net counts losses: 3 gained and 1 lost is net 2", J(X.pairOf(mixed, ref)) === J({ gained: 3, lost: 1, net: 2, p: X.signTest(3, 4) }));
    ok("  pairing refuses arms on different seeds", throws(() => X.pairOf(good, ref.slice().reverse()), /same seeds/));
    const names = (res, same = true) => X.checksOf(res, { same, n }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! the checks: the copy not equal, an arm on other seeds, an option that changes nothing -- each fails its own check, and a failed check says NOT WEIGHED",
        J(names(mk(ref, good), false)) === J(["THE COPY IS flyHard"]) && names({ ...mk(ref, good), "ref+giveway": good.map((r) => ({ ...r, seed: r.seed + 1 })) }).includes("SAME SCENARIOS") &&
        J(names(mk(ref, good, { free: ref }))) === J(["EACH OPTION BITES"]) && X.report(mk(ref, good, { free: ref }), { same: true, n, set: "held78" }).slice(-1)[0] === "VERDICT: NOT WEIGHED");
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the options do on HELD78 (that is the experiment).`);
process.exitCode = fails ? 1 : 0;
