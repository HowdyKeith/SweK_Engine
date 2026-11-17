// WebGLEngine/brain/subTrafficDive-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTrafficDive-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/subTrafficDive.mjs (FOLLOW-UP 8 of brain/SUB_FIELD_NAV_WIP.md, registered before the module, with its clarification and Amendment 1):
//   1 THE CONSTANTS  DIVE_MAX 60 m (crush depth 100), DIVE_PAD 2 m, HELD81 7821-7880, the four arms, the reference and the designated arm.
//   2 CLOSEST        closestApproach: hand-worked (a still ship dead ahead, one abeam), the region margin excludes a run (-Infinity), the ship moves with time.
//   3 LEAST BAD      the candidate with the largest closest approach, only if larger than the target's own; ties to the earlier offset; null when nothing is better.
//   4 CONFLICT, DIVE conflictShips is shipConflict ship by ship (keel filter included); the dive depth is the deepest keel + VMARGIN + DIVE_PAD, null past DIVE_MAX or with no conflict.
//   5 THE PILOT      in a conflict with no clear give-way heading +leastbad changes ONLY the heading; +dive ONLY the depth and only deeper; outside a conflict neither acts; the sweep still runs.
//   6 THE FLIGHT     the reference is FOLLOW-UP 7's designated arm exactly (flySweep), record for record; an unknown arm throws; the dive reaches depth on a diagnosed seed.
//   7 THE SOURCE     no clock, no Math.random.
// SABOTAGE LOG (2026-11-17; 13 mutants of brain/subTrafficDive.mjs, each alone, restored byte-identical): D1 the hull half dropped from the approach (3 red), D2 the region margin
//   ignored (1), D3 the ship frozen at t (1), D4 the target's own approach not the bar to beat (1), D5 ties to the later offset (3), D6 the shallowest keel (2), D7 no DIVE_MAX (1),
//   D8 the dive allowed upward (1), D10 least-bad also sets the speed (1), D13 sweep+dive with least-bad on (1); D9 least-bad acting when give-way had a heading and D11 the
//   sweep bypassed read 0 red FIRST (each got a row: then 1 and 1); D12 the keel filter dropped from conflictShips is EQUIVALENT (shipConflict applies the same filter).
"use strict";
import fs from "node:fs";
import * as D from "./subTrafficDive.mjs";
import * as W from "./subTurnSweep.mjs";
import * as G from "./subGiveWay.mjs";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const J = JSON.stringify, RAD = Math.PI / 180;
console.log("subTrafficDive-selfcheck -- least bad, and a dive under the keel\n");

sec("1. THE CONSTANTS");
ok("!! DIVE_MAX 60 m (the explorer's crush depth is 100), DIVE_PAD 2 m; HELD81 is 7821-7880; the arms, the reference (sweep) and the designated arm (sweep+leastbad+dive)",
    D.DIVE_MAX === 60 && D.DIVE_PAD === 2 && S.EXPLORER.crushDepth === 100 && D.HELD81.length === 60 && D.HELD81[0] === 7821 && D.HELD81[59] === 7880 && D.REFERENCE === "sweep" && D.DESIGNATED === "sweep+leastbad+dive" && D.BASE === "ref+free+giveway+sweep"
    && J(D.ARMS) === J({ sweep: { leastbad: false, dive: false }, "sweep+leastbad": { leastbad: true, dive: false }, "sweep+dive": { leastbad: false, dive: true }, "sweep+leastbad+dive": { leastbad: true, dive: true } }));

const ship = (o = {}) => ({ type: "ship", x: 100, y: 0, r: 10, keel: 30, vx: 0, vy: 0, ...o });
sec("2. CLOSEST");
{
    const ahead = D.closestApproach(0, 0, 0, 2, 0, [ship()]), abeam = D.closestApproach(0, 0, 0, 2, 0, [ship({ x: 40, y: 50 })]);
    ok("!! a still ship 100 m dead ahead of a 2 m/s run: over the 30 s horizon the run gets to 60 m, 40 m short of the ship, so the closest approach is 40 - r - HULL_HALF = 26", near(ahead, 40 - 10 - N.HULL_HALF), String(ahead));
    ok("!! a still ship abeam at (40, 50): the closest point of the run is (40, 0), 50 m away, so 50 - 14 = 36 (a heading of 0 runs along +x)", near(abeam, 50 - 10 - N.HULL_HALF), String(abeam));
    ok("!! a run that leaves the region margin within the horizon is excluded (-Infinity): from 10 m inside the y0 edge heading straight at it", D.closestApproach(200, N.REGION.y0 + 10, Math.PI / 2, 2, 0, [ship()]) === -Infinity);
    ok("  the ship moves with time: one coming at the run at 2 m/s from 100 m meets it sooner (0 - 14 at k = 25)", near(D.closestApproach(0, 0, 0, 2, 0, [ship({ vx: -2 })]), -10 - N.HULL_HALF), String(D.closestApproach(0, 0, 0, 2, 0, [ship({ vx: -2 })])));
}

const m = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 }));
const st = (x, y, h, depth = 20, speed = 2) => S.createState({ pos: [x, y, -depth], speed, heading: h, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m });
sec("3. LEAST BAD");
{
    const s = st(0, 0, 0), a = S.attitude(s), sh = [ship({ x: 40, vx: -1 })], h = D.leastBadHeading(s, 0, 0, sh);
    const own = D.closestApproach(0, 0, 0, a.speed, 0, sh), mine = D.closestApproach(0, 0, h, a.speed, 0, sh);
    let best = -Infinity, arg = null; for (const d of G.OFFSETS) { const c = D.closestApproach(0, 0, d * RAD, a.speed, 0, sh); if (c > best) { best = c; arg = d * RAD; } }
    ok("!! a ship closing dead ahead: the least bad heading is the candidate with the largest closest approach (re-derived over give-way's OFFSETS, ties to the earlier), better than straight on", h !== null && near(h, arg) && mine > own && near(mine, best), `${(h / RAD).toFixed(0)} deg: ${mine.toFixed(1)} against ${own.toFixed(1)}`);
    ok("!! nothing better than the target's own heading: null (a ship far behind)", D.leastBadHeading(s, 0, 0, [ship({ x: -150 })]) === null);
    const sym = D.leastBadHeading(st(200, 0, 0), 0, 0, [ship({ x: 260, y: 0, vx: -2 })]);
    ok("  a head-on ship on the axis, the two sides equal: the tie goes to the earlier offset (the negative one, -5 before +5)", sym !== null && sym < 0, `${(sym / RAD).toFixed(0)} deg`);
}

sec("4. CONFLICT AND THE DIVE");
{
    const s = st(0, 0, 0), sc = [ship({ x: 60, vx: -2, keel: 30 }), ship({ x: 60, y: 120, vx: 0, keel: 45 }), { type: "berg", x: 30, y: 0, r: 10, keel: 20, vx: 0, vy: 0 }, ship({ x: 80, vx: -2, keel: 10 })];
    const cs = D.conflictShips(s, 0, sc, { minDepth: 18 });
    ok("!! conflictShips is shipConflict ship by ship: the ship closing ahead (keel 30) is in conflict; the far ship and the berg are not; a ship whose keel + VMARGIN does not reach minDepth 18 (keel 10) is not", cs.length === 1 && cs[0].keel === 30 && cs.every((o) => H.shipConflict(s, 0, [o], { at: H.posAt, minDepth: 18 })), J(cs.map((o) => o.keel)));
    ok("!! the dive depth is the deepest keel in conflict + VMARGIN + 2 (30 + 5 + 2 = 37; with a 50 m keel too, 57); null past DIVE_MAX (a 54 m keel: 61) and with no conflict", D.diveDepth([ship({ keel: 30 })]) === 37 && D.diveDepth([ship({ keel: 30 }), ship({ keel: 50 })]) === 57 && D.diveDepth([ship({ keel: 54 })]) === null && D.diveDepth([]) === null && H.VMARGIN === 5);
}

sec("5. THE PILOT");
{
    const s = st(0, 0, 0, 20), seen = [], base = (q, t) => { seen.push(t); return "cmd"; };
    const scConf = { obstacles: [ship({ x: 45, vx: -2.5, keel: 30, r: 12 })], minDepth: 20 }, tgt = { heading: 0, depth: 20, speed: 2 };
    ok("  the fixture: a ship closing head-on with no clear give-way heading", D.conflictShips(s, 0, scConf.obstacles, { minDepth: 20 }).length === 1 && G.giveWayHeading(s, tgt, 0, scConf.obstacles, 20) === null);
    const lb = D.trafficPilot(scConf, { leastbad: true, base }); lb.pilot(s, tgt, [0, 0, 0]);
    ok("!! +leastbad alone: ONLY the heading changes (depth and speed kept), and it counts the tick", seen[0].heading !== 0 && seen[0].depth === 20 && seen[0].speed === 2 && lb.stats.leastbadTicks === 1 && lb.stats.diveTicks === 0, J(seen[0]));
    const dv = D.trafficPilot(scConf, { dive: true, base }); dv.pilot(s, tgt, [0, 0, 0]);
    ok("!! +dive alone: ONLY the depth changes, to keel 30 + 5 + 2 = 37; heading and speed kept", seen[1].depth === 37 && seen[1].heading === 0 && seen[1].speed === 2 && dv.stats.diveTicks === 1);
    dv.pilot(s, { ...tgt, depth: 45 }, [0, 0, 0]);
    ok("!! the dive only ever goes deeper: a target already at 45 m is kept", seen[2].depth === 45 && dv.stats.diveTicks === 1);
    const quiet = D.trafficPilot({ obstacles: [ship({ x: -200 })], minDepth: 20 }, { leastbad: true, dive: true, base }); quiet.pilot(s, tgt, [0, 0, 0]);
    ok("!! outside a conflict neither option acts: the target passes through", J(seen[3]) === J(tgt) && quiet.stats.leastbadTicks === 0 && quiet.stats.diveTicks === 0);
    const both = D.trafficPilot(scConf, { leastbad: true, dive: true, base }); both.pilot(s, tgt, [0, 0, 0]);
    ok("  both: the heading of +leastbad and the depth of +dive together", seen[4].heading === seen[0].heading && seen[4].depth === 37);
    ok("  the deepest depth seen is counted", both.stats.deepest === 20);
    // a conflict in which give-way DOES have a clear heading: +leastbad must leave it alone (it is for the case give-way has none)
    const far = { obstacles: [ship({ x: 110, vx: -1, keel: 30, r: 8 })], minDepth: 20 }, s2 = st(0, 0, 0, 20);
    ok("  the fixture: a ship in conflict ahead with a clear give-way heading", D.conflictShips(s2, 0, far.obstacles, { minDepth: 20 }).length === 1 && G.giveWayHeading(s2, tgt, 0, far.obstacles, 20) !== null);
    const lb2 = D.trafficPilot(far, { leastbad: true, base }); lb2.pilot(s2, tgt, [0, 0, 0]);
    ok("!! +leastbad does NOT act when give-way has a clear heading (the target's heading passes through, no tick counted)", seen[5].heading === 0 && lb2.stats.leastbadTicks === 0, J(seen[5]));
    // FOLLOW-UP 7's sweep still runs after the options: a reversal 50 m from the y0 edge on heading 45, no ship anywhere
    const edge = { obstacles: [], minDepth: 20 }, s3 = st(200, N.REGION.y0 + 50, Math.PI / 4, 20), tp = D.trafficPilot(edge, { leastbad: true, dive: true, base }), h3 = S.attitude(s3).heading;
    tp.pilot(s3, { heading: h3 + 170 * RAD, depth: 20, speed: 2 }, [0, 0, 0]);
    ok("!! the sweep still runs after the options: a reversal near the edge whose short way leaves is forced the long way (the base is given heading - 90)", near(seen[6].heading, h3 - 90 * RAD) && tp.sweepStats.forced === 1, `${(seen[6].heading / RAD).toFixed(1)}`);
}

sec("6. THE FLIGHT");
{
    const sc = D.scenarioOf(1), a = D.flyTraffic(sc, "sweep"), b = W.flySweep(sc, "ref+free+giveway+sweep"), strip = (r) => J({ ...r, arm: undefined, leastbadTicks: undefined, diveTicks: undefined, deepest: undefined });
    ok("!! the reference IS FOLLOW-UP 7's designated arm: record for record (DEV seed 1), with no option acting", strip(a) === J({ ...b, arm: undefined }) && a.leastbadTicks === 0 && a.diveTicks === 0);
    let thrown = ""; try { D.flyTraffic(sc, "sweep+nope"); } catch (e) { thrown = e.message; }
    ok("!! an unknown arm throws by name", /unknown arm "sweep\+nope"/.test(thrown), thrown);
    const r = D.flyTraffic(D.scenarioOf(7620), "sweep+dive");
    ok("!! on a diagnosed seed (7620, post hoc) the dive acts and takes the vessel below the ship's keel (deeper than 50 m), and nothing is crushed", r.diveTicks > 0 && r.deepest > 50 && r.status !== "crushed", `${r.status}, deepest ${r.deepest.toFixed(1)} m`);
}

sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subTrafficDive.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
