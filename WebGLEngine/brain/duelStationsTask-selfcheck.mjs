// WebGLEngine/brain/duelStationsTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/duelStationsTask-selfcheck.mjs
//
// THE GATE OF brain/duelStationsTask.mjs AND subStations.gatedStation (round 3 of the submarine stations, brain/SUB_STATIONS_WIP.md section 12).
//   1  the battery per seed and the sets, as registered
//   2  THE RULE: atRisk on worked numbers (the rate, the 10 s wait, the reserve, the fight's length)
//   3  the gated station: a held-back claim, the aux that always passes, the count, the rank kept
//   4  the crews: which stations each carries, and RISK passing the claim only at risk; a duel's record
//   5  the sign test and the verdict on hand-made scores
// Flies no HELD duel: the duels here are DEV duels.
// SABOTAGED -- 21 mutants, each alone in place and restored, EVERY ONE RED BY NAME (final pass): brain/duelStationsTask.mjs D01 a 5 s wait | D02 a reserve of 0 | D03 no wait | D04 the rate over the time left | D05 the time left forgotten |
//   D06 a battery up to 0.4 | D07 HELD from 173002 | D08 RISK as FIXED | D09 RISK reading the start, not the charge | D10 the charge read as a fraction of the start | D11 FIXED as SONAR | D13 a two-sided sign test | D14 V1 at 0.1 |
//   D15 V2 at 0.1 | D16 the duels not checked | D17 ties counted as RISK's; brain/subStations.mjs G01 the gate holding the aux back | G02 the gate never holding | G03 quiet ticks counted | G04 the rank lost | G05 no allow() refusal.
// TWO WENT 0 RED ON THE FIRST PASS AND GOT ROWS: D09 and D10 (no row looked at what RISK reads; the side now hands out read() and risk(), and a hand-made look drives them). A THIRD, D12 (no unknown-crew refusal), pointed at a REDUNDANT
//   line: duelSide asks for the stations, which refuses an unknown crew by itself; the line was deleted, not counted. AND THREE ROWS OF MINE WERE WRONG OR EMPTY: a verdict fixture whose 5-to-1 pairs give p 0.109 (it said BEATS), and two
//   rows with an `||` that let them pass whatever happened; all three rewritten before the mutants ran.
// ROUND 6 (BLIND, section 2b): 5 more mutants, every one red by name: B01 BLIND as RISK | B02 a 90 s look-ahead | B03 BLIND ungated | B04 round 6's HELD from 187002 | B05 the look-ahead counted from the fight's start.
//   B03 WENT 0 RED FIRST (the crew row read a count that starts at 0 either way); a row now flies one tick of BLIND and FIXED on a look where the charge lasts the look-ahead. Two rows of mine sat EXACTLY on the 0.02 line and failed by
//   floating point; their numbers were moved clear of it.
"use strict";
import * as T from "./duelStationsTask.mjs";
import * as SS from "./subStations.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("duelStationsTask-selfcheck -- round 3: the charge-at-risk captain in a duel on a low battery\n");

sec("1. the battery and the sets");
guarded("section 1", () => {
    const cs = Array.from({ length: 500 }, (_, i) => T.chargeOf(800000 + i));
    ok("the battery is inside 0.05-0.30 of capacity and fills it (500 draws within 5 % of each end)", cs.every((c) => c >= 0.05 && c <= 0.3) && Math.min(...cs) < 0.0625 && Math.max(...cs) > 0.2875 && J(T.CHARGE) === "[0.05,0.3]", `${Math.min(...cs).toFixed(3)}..${Math.max(...cs).toFixed(3)}`);
    ok("the same for a seed every time, different between seeds", T.chargeOf(173001) === T.chargeOf(173001) && T.chargeOf(173001) !== T.chargeOf(173002));
    ok("a seed that is not a whole number of 0 or more is refused, by name", /^duelStationsTask\.chargeOf: a seed is a whole number/.test(throws(() => T.chargeOf(2.5)) || "") && throws(() => T.chargeOf(-3)) !== null);
    const kinds = (set) => J([...new Set(set.map((d) => d.kind))]);
    ok("DEV is 171001-171006 x the four kinds (24); HELD 173001-173024 x the four kinds (96); disjoint", T.DEV_SET.length === 24 && T.HELD_SET.length === 96 && kinds(T.DEV_SET) === '["patrol","quiet","evader","hunter"]' && kinds(T.HELD_SET) === kinds(T.DEV_SET) &&
        Math.min(...T.DEV_SET.map((d) => d.seed)) === 171001 && Math.max(...T.DEV_SET.map((d) => d.seed)) === 171006 && Math.min(...T.HELD_SET.map((d) => d.seed)) === 173001 && Math.max(...T.HELD_SET.map((d) => d.seed)) === 173024);
    ok("the fight is the duel's 240 s; the rule's constants are the registered 10 s and 0.02", T.FIGHT === 240 && T.RISK.minT === 10 && T.RISK.reserve === 0.02 && Object.isFrozen(T.RISK));
});

sec("2. the rule");
guarded("section 2", () => {
    // c0 0.2: spent 0.1 in 100 s -> r 0.001/s; 140 s left -> 0.14 more: 0.1 - 0.14 = -0.04 < 0.02: AT RISK
    ok("spent 0.1 of 0.2 in 100 s: 140 s left at that rate needs 0.14 -- AT RISK", T.atRisk(100, 0.1, 0.2) === true);
    // spent 0.02 in 100 s -> r 0.0002; 140 s -> 0.028: 0.18 - 0.028 = 0.152: safe
    ok("spent 0.02 of 0.2 in 100 s: 140 s left needs 0.028 -- safe", T.atRisk(100, 0.18, 0.2) === false);
    // the reserve: r 0.0005, 140 s -> 0.07: c 0.085 -> 0.015 < 0.02 at risk; c 0.095 -> 0.025 safe (c0 = c + 0.05)
    ok("the reserve is 0.02: a projected 0.015 is at risk, a projected 0.025 is not", T.atRisk(100, 0.085, 0.135) === true && T.atRisk(100, 0.095, 0.145) === false);
    ok("before 10 s nothing is at risk, however fast the charge falls (9.9 s); at 10 s the rule speaks", T.atRisk(9.9, 0.001, 0.3) === false && T.atRisk(10, 0.001, 0.3) === true);
    ok("near the end little is needed: spent 0.15 of 0.2 in 230 s, 10 s left needs 0.0065 -- safe at 0.05", T.atRisk(230, 0.05, 0.2) === false);
    ok("a charge that RISES (the boat is charging) is never at risk while above the reserve", T.atRisk(100, 0.25, 0.2) === false);
    ok("the fight's length is the rule's: with 480 s, the 0.02-in-100-s boat (0.18 left, 380 s to go needs 0.076) is still safe, and the 0.06-in-100-s boat is not", T.atRisk(100, 0.18, 0.2, { fight: 480 }) === false && T.atRisk(100, 0.14, 0.2, { fight: 480 }) === true && T.atRisk(100, 0.14, 0.2) === false);
});

sec("2b. BLIND (round 6): the same rule with a fixed 60 s look-ahead");
guarded("section 2b", () => {
    const probe = (crew, t, rel, c0 = 0.2) => { const p = T.sideFor(crew, c0); p.side.tactics({ t, self: { charge: rel, depth: 17, heading: 0, speed: 2, x: 0, y: 0, hp: 100, ammo: 4, ready: true }, contacts: [], echoes: [], pings: [] }); return p.risk(); };
    // spent 0.05 of 0.2 in 30 s (rel 0.75: c 0.15): r 0.00167/s. RISK: 210 s left -> 0.35 needed: at risk. BLIND: 60 s -> 0.10: 0.05 left: safe
    ok("EARLY, the look-ahead fires LATER: spent 0.05 of 0.2 in 30 s, RISK (210 s left need 0.35) is at risk; BLIND (60 s need 0.10, 0.05 left) is not", probe("RISK", 30, 0.75) === true && probe("BLIND", 30, 0.75) === false);
    // at t 230 (10 s left): spent 0.15 in 230 s: r 0.00065; c 0.05. RISK: 10 s -> 0.0065: 0.0435 left: safe. BLIND: 60 s -> 0.039: 0.011 left, under 0.02: at risk
    ok("LATE, it fires SOONER: spent 0.15 of 0.2 in 230 s, RISK (10 s left need 0.007) is safe; BLIND (60 s need 0.039) is at risk", probe("RISK", 230, 0.25) === false && probe("BLIND", 230, 0.25) === true);
    ok("before 10 s neither is at risk; the look-ahead is the registered 60 s; round 6's sets are 185001-185006 and 187001-187024 x the four kinds", probe("BLIND", 9, 0.01) === false && T.BLIND.lookAhead === 60 && Object.isFrozen(T.BLIND) && T.R6_DEV_SET.length === 24 && T.R6_HELD_SET.length === 96 &&
        Math.min(...T.R6_HELD_SET.map((d) => d.seed)) === 187001 && Math.max(...T.R6_HELD_SET.map((d) => d.seed)) === 187024 && Math.min(...T.R6_DEV_SET.map((d) => d.seed)) === 185001 && J(T.CREWS) === '["SONAR","FIXED","RISK","BLIND"]');
    const bl = T.sideFor("BLIND", 0.2), fx = T.sideFor("FIXED", 0.2), look = { t: 30, self: { charge: 0.75, depth: 17, heading: 0, speed: 2, x: 0, y: 0, hp: 100, ammo: 4, ready: true }, contacts: [], echoes: [], pings: [] };
    const st = S.createState({ depth: 17, speed: 2, model: S.createSubModel(S.EXPLORER) }), tg = { depth: 17, heading: 0, speed: 2 };
    bl.side.tactics(look); fx.side.tactics(look); bl.side.pilot(st, tg, [0, 0, 0]); fx.side.pilot(st, tg, [0, 0, 0]);
    ok("the BLIND crew HOLDS BACK the energy claim when the charge lasts the look-ahead (0.15 of capacity at 17 m, under the energy rule's line): FIXED gives energy the con, BLIND keeps sonar's", fx.side.pilot.log.con === "energy" && bl.side.pilot.log.con === "sonar" && bl.stats().blocked === 1, J([fx.side.pilot.log.con, bl.side.pilot.log.con, bl.stats()]));
});

sec("3. the gated station");
guarded("section 3", () => {
    let allow = false;
    const inner = { name: "energy", kind: "target", priority: 50, propose: () => ({ claim: { depth: 0, surface: true }, aux: { pump: 1, repair: 0 }, reason: "low" }) };
    const g = SS.gatedStation(inner, () => allow), st = S.createState({ depth: 20, speed: 2, model: S.createSubModel(S.EXPLORER) });
    const held = g.propose({ state: st }); allow = true; const passed = g.propose({ state: st });
    ok("while allow() is false the claim is held back (null, no reason) and the AUX STILL PASSES; once true the station's own answer passes", held.claim === null && held.reason === null && J(held.aux) === '{"pump":1,"repair":0}' && passed.claim.surface === true && passed.reason === "low", J([held, passed]));
    ok("it counts the ticks it held a claim back (1), keeps the station's name, kind and rank", g.blocked === 1 && g.name === "energy" && g.kind === "target" && g.priority === 50);
    const quiet = SS.gatedStation({ name: "q", kind: "target", priority: 5, propose: () => ({ claim: null, aux: null, reason: null }) }, () => false); quiet.propose({ state: st });
    ok("a station that claims nothing is not counted as held back", quiet.blocked === 0);
    ok("a gated station with no allow() is refused, by name", /gatedStation: station energy needs an allow\(\) function/.test(throws(() => SS.gatedStation(inner)) || ""));
});

sec("4. the crews");
guarded("section 4", () => {
    ok("SONAR carries no energy station, FIXED and RISK one each; an unknown crew is refused, by name", T.sideFor("SONAR", 0.1).side.captain.watch.con.energy === undefined && T.sideFor("FIXED", 0.1).side.captain.watch.con.energy === 0 && T.sideFor("RISK", 0.1).side.captain.watch.con.energy === 0 &&
        /no crew named "ADMIRAL"/.test(throws(() => T.sideFor("ADMIRAL", 0.1)) || ""), J(T.CREWS));
    const probe = T.sideFor("RISK", 0.2); probe.side.tactics({ t: 100, self: { charge: 0.5, depth: 17, heading: 0, speed: 2, x: 0, y: 0, hp: 100, ammo: 4, ready: true }, contacts: [], echoes: [], pings: [] });
    ok("WHAT RISK READS: the duel's charge is a fraction of the START (0.5 of 0.2 = 0.1 of capacity), and the depth of the last look; at 100 s, having spent 0.1 in 100 s, the rule says AT RISK", Math.abs(probe.read().frac - 0.1) < 1e-12 && probe.read().depth === 17 && probe.risk() === true, J([probe.read().frac, probe.risk()]));
    const calm = T.sideFor("RISK", 0.2); calm.side.tactics({ t: 100, self: { charge: 0.95, depth: 17, heading: 0, speed: 2, x: 0, y: 0, hp: 100, ammo: 4, ready: true }, contacts: [], echoes: [], pings: [] });
    ok("...and having spent 0.01 in 100 s it is not; before any look nothing is at risk", calm.risk() === false && T.sideFor("RISK", 0.2).risk() === false);
    const d = T.DEV_SET.find((x) => x.seed === 171001 && x.kind === "patrol"), s = T.fight(d, "SONAR"), f = T.fight(d, "FIXED"), r = T.fight(d, "RISK"), r2 = T.fight(d, "RISK");
    ok("a duel's record has the registered fields and is the same every time", J(Object.keys(r)) === '["seed","kind","crew","c0","score","winner","flat","chargeEnd","energyCon","blocked"]' && J(r) === J(r2) && r.c0 === T.chargeOf(171001));
    ok("on a DEV duel the crews differ as built: SONAR never gives energy the con; FIXED does; RISK holds claims back", s.energyCon === 0 && f.energyCon > 0 && r.blocked > 0, J([s.energyCon, f.energyCon, r.energyCon, r.blocked]));
    ok("RISK gives the energy station the con for FEWER ticks than FIXED on the same duel (it holds the claim back until the charge is at risk)", r.energyCon < f.energyCon, `${r.energyCon} against ${f.energyCon}`);
});

sec("5. the sign test and the verdict");
guarded("section 5", () => {
    ok("the sign test: P(X >= 5 | 5) = 1/32; no pairs = 1", Math.abs(T.signTest(5, 0) - 1 / 32) < 1e-15 && T.signTest(0, 0) === 1 && Math.abs(T.signTest(8, 2) - 56 / 1024) < 1e-15);
    const rec = (i, score) => ({ seed: i, kind: "patrol", score });
    const sonar = [1, 1, 1, 1, 1, 1].map((v, i) => rec(i, v)), fixed = [0, 0, 0, 0, 0, 1].map((v, i) => rec(i, v)), risk = [1, 1, 1, 1, 1, 1].map((v, i) => rec(i, v));
    const v = T.verdict(sonar, fixed, risk);
    ok("RISK above FIXED on 5 duels and level on 1 (p 1/32), and level with SONAR: BEATS FIXED and KEEPS SONAR'S FIGHT, with the registered sentence", v.v1 === "RISK BEATS FIXED" && v.v2 === "RISK KEEPS SONAR'S FIGHT" && v.bottom === "a captain that weighs the charge against the fight keeps the fight and beats the ranking" && v.riskUp === 5 && v.riskDown === 0, J(v));
    const v4 = T.verdict(sonar, [0, 0, 0, 0, 1, 1].map((v, i) => rec(i, v)), risk);
    ok("four of four (p 1/16) is NO DIFFERENCE SHOWN; still level with SONAR: 'no worse than sonar alone, and not shown better than the ranking'", v4.v1 === "NO DIFFERENCE SHOWN" && v4.bottom === "no worse than sonar alone, and not shown better than the ranking", J(v4));
    const low = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9].map((v, i) => rec(i, v)), zero = [0, 0, 0, 0, 0, 0].map((v, i) => rec(i, v)), v5 = T.verdict(sonar, zero, low);
    ok("0.1 under SONAR is NOT keeping the fight (the line is 0.05): 'better than the ranking, still short of sonar alone'", v5.v1 === "RISK BEATS FIXED" && v5.v2 === "RISK DOES NOT KEEP SONAR'S FIGHT" && v5.bottom === "better than the ranking, still short of sonar alone");
    const at = (x) => T.verdict(sonar, zero, [x, x, x, x, x, x].map((v, i) => rec(i, v))).v2;
    ok("the line is 0.05 under SONAR: 0.04 under keeps the fight, 0.06 under does not", at(0.96) === "RISK KEEPS SONAR'S FIGHT" && at(0.94) === "RISK DOES NOT KEEP SONAR'S FIGHT");
    const back = T.verdict(sonar, risk, fixed);
    ok("the other way round is FIXED BEATS RISK", back.v1 === "FIXED BEATS RISK" && back.bottom === "reported as it is");
    ok("crews flown on different duels are refused, by name", /not flown on the same duels/.test(throws(() => T.verdict(sonar, fixed.slice(1), risk)) || "") && /not flown on the same duels/.test(throws(() => T.verdict(sonar, fixed, risk.map((x) => ({ ...x, kind: "quiet" })))) || ""));
});

finished = true;
console.log(fails ? `\nduelStationsTask-selfcheck: ${fails} FAILED` : "\nduelStationsTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
