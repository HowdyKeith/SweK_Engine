// WebGLEngine/brain/subTournament-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTournament-selfcheck.mjs      (~3 s)
//
// EVERY SUBMARINE SIDE AGAINST EVERY OTHER (brain/subTournament.mjs), built on subDuel's duel and dogfightTournament's statistics:
//   1  THE SIDES     makeSide: the default is the hand tactician and the PD autopilot, a theta is clamped into its bounds, 963 weights make the network pilot and any other length is REFUSED BY NAME, and every call of side() is a fresh
//                    tactician (the tactician has memory: two duels that shared one would not be two duels)
//   2  THE GEOMETRIES n consecutive patrol scenarios from the seed asked for; the same call the same scenarios
//   3  THE PAIR      one geometry flown twice, X in seat A then in seat B; the records are from X's side and add up: the seat-A record's sx is the duel's own score and its sy is subDuel.scoreFor(B); a side against ITSELF has an edge of
//                    exactly 0 and, because seat A is worth a great deal, wins its seat-A fights and loses its seat-B ones; swapping X and Y makes the edge exactly its negative; a pair is deterministic
//   4  THE SUMMARY   dogfightTournament's counts plus the boats lost to the WATER (grounded, broached, crushed, lost) and not to a torpedo, and the flip swaps them
//   5  THE ROBIN     every pair i < j in roster order, the progress reported once per pair, duplicate ids and a roster of one refused by name; on three real sides (the default hand tactician, the search-ping champion and the league's last generation) the
//                    rating puts the league champion above the search-ping champion above the default, with every lead decisive
//   6  THE SEAT      seatBias is measured, not assumed: the default tactician is worth over 3 points a duel in seat A, and the league champion is the other way round (a doctrine that counter-fights the seat)
//   7  THE REPORT    a table with a line per side and a line per pair, the labels used, and the counts agree with the summaries
//   8  THE REUSE     the statistics are dogfightTournament's own functions, imported (the same function objects), not copied
//
// SABOTAGE LOG -- TWENTY-THREE, each applied to brain/subTournament.mjs in place, the gate run, the file restored; every one red by name (rows red):
//   T1 the seat-A opponent's score read as the first side's 5 | T2 the seat-B scores swapped 6 | T3 the seat-B statuses not swapped 1 | T4 a kill counted for any boat that is not afloat 0 THE FIRST TIME | T5 only 'grounded' counted as lost to the water 1 | T6 the flip leaves the water losses 1
//   T7 one seat flown twice 4 | T8 a side paired with itself 1 | T9 duplicate ids allowed 1 | T10 a roster of one allowed 1 | T11 no progress 1 | T12 hunter geometries 3 | T13 seeds start one late 1 | T14 any weights length allowed 1 | T15 the theta not clamped 1
//   T16 one tactician shared by every duel of a side 6 | T17 the network never used 1 | T18 the seat bias reads one score 1 | T19 no head-to-head in the report 1 | T20 the rank table reversed 1 | T21 the duel's length ignored 0 THE FIRST TIME | T22 the water losses of the wrong side 0 THE FIRST TIME | T23 a renamed re-export (a crash)
// T4 went 0 red because no duel in 160 (every pair of four real sides, ten geometries) ends any way but a torpedo, so 'any boat not afloat' and 'sunk' are the same on real data: the row now flies a vessel with a 22 m crush depth, where both boats are lost to the water. T21 went 0 red because only a SECOND-seat win by a boat that sinks the other early has a speed bonus that depends on the length: the row flies the league champion from seat B. T22 went 0 red because the first synthetic summary had two water losses a side: it has two and one now.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./subTournament.mjs";
import * as DT from "./dogfightTournament.mjs";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as PS from "./pilotSubPolicy.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

const BR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(BR, f), "utf8"));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const W = rd("pilotSubWeightsWip.json").weights, THETA_PING = rd("subTacticsThetaSearchPingWip.json").theta, LEAGUE = rd("subTacticsLeagueWip.json").league7001.thetas.at(-1);
const hand = T.makeSide("hand"), ping = T.makeSide("ping", { theta: THETA_PING }), league = T.makeSide("league", { theta: LEAGUE });

console.log("subTournament-selfcheck -- every submarine side against every other\n");

console.log("1. THE SIDES");
{
    ok("!! the default side is the hand tactician (THETA_DEFAULT) and the PD autopilot: no weights, label = id", JSON.stringify(hand.theta) === JSON.stringify(TA.clampTheta(TA.THETA_DEFAULT)) && hand.weights === null && hand.label === "hand" && hand.id === "hand");
    const wild = T.makeSide("wild", { theta: { fireRange: 99999, aimTol: -5 } });
    ok("!! a theta is clamped into its bounds (a fire range of 99999 reads as the upper bound, a negative tolerance as the lower)", wild.theta.fireRange === TA.THETA_BOUNDS.fireRange[1] && wild.theta.aimTol === TA.THETA_BOUNDS.aimTol[0]);
    let msg = ""; try { T.makeSide("bad", { weights: W.slice(1) }); } catch (e) { msg = e.message; }
    ok("!! 962 weights are REFUSED BY NAME (a tournament with a silently corrupt pilot is a tournament of the autopilot)", /subTournament\.makeSide\(bad\): 962 weights, the network takes 963/.test(msg), msg);
    const net = T.makeSide("net", { weights: W }), st = S.createState({ depth: 25, speed: 2, heading: 0.5 }), tg = { depth: 30, heading: 0, speed: 2.5 };
    const cn = net.side().pilot(st, tg, [0, 0, 0]), cp = hand.side().pilot(st, tg, [0, 0, 0]), cw = PS.pilotFor(Float32Array.from(W))(st, tg, [0, 0, 0]);
    ok("!! 963 weights make the NETWORK pilot (its controls are the policy's own and differ from the autopilot's on the same state)", net.weights.length === 963 && JSON.stringify(cn) === JSON.stringify(cw) && JSON.stringify(cn) !== JSON.stringify(cp) && JSON.stringify(cp) === JSON.stringify(AS.pilot()(st, tg, [0, 0, 0])));
    const s1 = hand.side(), s2 = hand.side();
    ok("!! every side() is FRESH: two calls give two different tacticians and two different pilots", s1.tactics !== s2.tactics && s1.pilot !== s2.pilot);
}

console.log("\n2. THE GEOMETRIES");
{
    const g = T.geometries(4, 7);
    ok("!! n geometries are consecutive patrol scenarios from the seed asked for (7, 8, 9, 10), the same call the same scenarios, the default seed 1", g.length === 4 && g.map((s) => s.seed).join() === "7,8,9,10" && g.every((s) => s.kind === "patrol") && JSON.stringify(g) === JSON.stringify(T.geometries(4, 7)) && T.geometries(2)[0].seed === 1);
}

console.log("\n3. THE PAIR");
{
    const sc = D.scenario(3, "patrol"), [a, b] = T.fightPair(ping, hand, sc);
    const da = D.duel(ping.side(), sc, { opponent: hand.side() });
    ok("!! two records from X's side: seat A then seat B, the scenario's seed, the seat-A record's sx is the duel's own score and its sy subDuel.scoreFor(B), the statuses are the fates, the kills are 'sunk'", a.seat === "A" && b.seat === "B" && a.seed === 3 && near(a.sx, da.score) && near(a.sy, D.scoreFor(da, "B")) && a.statusX === da.fates[0] && a.statusY === da.fates[1] && a.xKilledY === (da.fates[1] === "sunk") && a.yKilledX === (da.fates[0] === "sunk") && a.ticks === da.ticks);
    const db = D.duel(hand.side(), sc, { opponent: ping.side() });
    ok("!! the seat-B record is X's score as the SECOND boat: sx = scoreFor(B) of the duel where Y is seat A, and its statuses swap", near(b.sx, D.scoreFor(db, "B")) && near(b.sy, db.score) && b.statusX === db.fates[1] && b.statusY === db.fates[0]);
    const m = T.matchup(hand, hand, T.geometries(3));
    ok("!! a side against ITSELF has an edge of exactly 0, and the seat decides every fight (the seat-A side won all three, so winsX = winsY = 3 and no draws): seat A is worth more than the whole of a skill", m.summary.edge === 0 && m.summary.winsX === 3 && m.summary.winsY === 3 && m.summary.draws === 0, JSON.stringify([m.summary.edge, m.summary.winsX, m.summary.winsY]));
    const xy = T.matchup(ping, hand, T.geometries(2)), yx = T.matchup(hand, ping, T.geometries(2));
    ok("!! swap X and Y and the edge is EXACTLY its negative, the wins swap, the water losses swap", xy.summary.edge === -yx.summary.edge && xy.summary.winsX === yx.summary.winsY && xy.summary.winsY === yx.summary.winsX && xy.summary.floorX === yx.summary.floorY && xy.summary.fights === 4);
    const short = T.fightPair(ping, hand, sc, { seconds: 60 }), ds = D.duel(ping.side(), sc, { seconds: 60, opponent: hand.side() });
    ok("!! the options go through to the duel: with seconds 60 the records are of the 60-second duel and its speed bonus is a fraction of 60 s (sx = the duel's score, sy = scoreFor(B, 60))", near(short[0].sx, ds.score) && near(short[0].sy, D.scoreFor(ds, "B", 60)) && short[0].ticks === ds.ticks && ds.ticks <= 1800);
    const sc2 = D.scenario(3, "patrol"), s120 = T.fightPair(league, hand, sc2, { seconds: 120 }), d120 = D.duel(hand.side(), sc2, { seconds: 120, opponent: league.side() });
    ok("!! and the speed bonus of the SECOND seat is a fraction of the duel's own length: the league champion sinking the default from seat B in a 120 s duel scores scoreFor(B, 120) = " + D.scoreFor(d120, "B", 120).toFixed(4) + " and not the 240 s figure " + D.scoreFor(d120, "B", 240).toFixed(4), near(s120[1].sx, D.scoreFor(d120, "B", 120)) && !near(s120[1].sx, D.scoreFor(d120, "B", 240), 1e-6));
    const deep = S.createSubModel(Object.freeze({ ...S.EXPLORER, crushDepth: 22 })), dd = T.fightPair(hand, ping, sc2, { model: deep }), wdd = D.duel(hand.side(), sc2, { model: deep, opponent: ping.side() });
    ok("!! a boat lost to the WATER (here a vessel with a 22 m crush depth, so both boats are crushed in the first seconds) is recorded with its fate and is NOT a kill (nobody torpedoed it): statusX 'crushed', xKilledY false, yKilledX false", dd[0].statusX === wdd.fates[0] && dd[0].statusX === "crushed" && dd[0].xKilledY === false && dd[0].yKilledX === false && T.WATER_FATES.includes(dd[0].statusY), `${dd[0].statusX} / ${dd[0].statusY}`);
    ok("a pair is deterministic: the same call, the same records to the bit", JSON.stringify(T.fightPair(ping, hand, sc)) === JSON.stringify(T.fightPair(ping, hand, sc)));
}

console.log("\n4. THE SUMMARY");
{
    const f = (sx, sy, statusX, statusY) => ({ seed: 1, seat: "A", sx, sy, statusX, statusY, xKilledY: false, yKilledX: false, ticks: 100 });
    const s = T.summary([f(1, 0, "grounded", "afloat"), f(0, 1, "sunk", "afloat"), f(1, 0, "afloat", "broached"), f(0, 0, "crushed", "afloat")]);
    ok("!! the water losses: grounded, broached, crushed and lost count; 'sunk' (a torpedo) and 'afloat' do not (X: grounded + crushed = 2, Y: broached = 1)", s.floorX === 2 && s.floorY === 1 && s.fights === 4 && s.n === 2);
    const q = T.flipSummary({ ...s, floorX: 5, floorY: 1 });
    ok("!! flipSummary swaps the water losses along with dogfightTournament's flip (wins, edge, kills)", q.floorX === 1 && q.floorY === 5 && q.winsX === s.winsY && q.edge === -s.edge);
    ok("an odd number of records is refused (summarize's own rule: two per geometry)", (() => { try { T.summary([f(1, 0, "afloat", "afloat")]); return false; } catch { return true; } })());
}

console.log("\n5. THE ROBIN");
{
    const set = T.geometries(3), seen = [], r = T.roundRobin([hand, ping, league], set, {}, (m, done, total) => seen.push([m.x + "|" + m.y, done, total]));
    ok("!! every pair i < j in roster order, the progress reported once each as done/total", Object.keys(r.pairs).join() === "hand|ping,hand|league,ping|league" && seen.map((x) => x.join(":")).join() === "hand|ping:1:3,hand|league:2:3,ping|league:3:3" && r.scenarios === 3 && r.ids.join() === "hand,ping,league");
    const e1 = (() => { try { T.roundRobin([hand, T.makeSide("hand")], set); return ""; } catch (e) { return e.message; } })(), e2 = (() => { try { T.roundRobin([hand], set); return ""; } catch (e) { return e.message; } })();
    ok("!! duplicate ids and a roster of one are refused by name", /duplicate side id in hand, hand/.test(e1) && /at least two sides/.test(e2), `${e1} | ${e2}`);
    const get = (x, y) => (r.pairs[`${x}|${y}`] ? r.pairs[`${x}|${y}`].summary : T.flipSummary(r.pairs[`${y}|${x}`].summary)), fit = T.ratings(r, { summaryOf: get }), order = T.rankOf(fit, r.ids);
    ok("!! the rating puts the league's last generation above the search-ping champion above the default tactician, and every lead is decisive (z over 2)", order.join() === "league,ping,hand" && get("league", "ping").z >= T.MIN_Z && get("ping", "hand").z >= T.MIN_Z && fit.converged, `${order.map((id) => id + " " + fit.rating[id].toFixed(0)).join(", ")}; z ${get("league", "ping").z.toFixed(1)} and ${get("ping", "hand").z.toFixed(1)}`);
    ok("!! and the winners win by counts, not by a seat: the league champion's record against the default is 5 wins, a draw and no loss, and against the search-ping champion 6-0-0", (() => { const a = get("league", "hand"), b = get("league", "ping"); return a.winsX === 5 && a.draws === 1 && a.winsY === 0 && b.winsX === 6 && b.winsY === 0; })());
    var result = r;
}

console.log("\n6. THE SEAT");
{
    const sb = T.seatBias(hand, T.geometries(4)), sl = T.seatBias(league, T.geometries(4));
    ok("!! seatBias is MEASURED: the default tactician against itself is worth more than 3 points a duel in seat A (se under 0.1), and the league champion's is NEGATIVE (a doctrine that has learned to fight from seat B)", sb.mean > 3 && sb.se < 0.1 && sl.mean < -1 && sb.n === 4, `hand ${sb.mean.toFixed(2)} +- ${sb.se.toFixed(2)}, league ${sl.mean.toFixed(2)} +- ${sl.se.toFixed(2)}`);
}

console.log("\n7. THE REPORT");
{
    const lines = T.reportLines(result, { labels: { hand: "the hand tactician", ping: "search-ping champion", league: "league gen 3" } });
    ok("!! a header, a rank table with a line per side (rank 1 is the league champion, by its label), and a head-to-head line per pair (3), the counts those of the summaries", lines.length === 1 + 1 + 3 + 1 + 3 && /3 sides, 3 geometries/.test(lines[0]) && /^ +1 .*league gen 3$/.test(lines[2]) && /^ +3 .*the hand tactician$/.test(lines[4]) && lines.slice(-3).every((l) => /\d+-\d+-\d+ +edge [+-]\d/.test(l)) && lines.some((l) => l.includes(`${result.pairs["hand|league"].summary.winsX}-${result.pairs["hand|league"].summary.draws}-${result.pairs["hand|league"].summary.winsY}`)), lines[2]);
}

console.log("\n8. THE REUSE");
{
    ok("!! the statistics are dogfightTournament's own functions (the same function objects): ratings, summarize, flip, against, rankOf, transitivity, upsets, stability, fieldEdges, and the constants DECISIVE 0.05, MIN_Z 2", ["ratings", "summarize", "flip", "against", "rankOf", "transitivity", "upsets", "stability", "fieldEdges"].every((k) => T[k] === DT[k]) && T.DECISIVE === 0.05 && T.MIN_Z === 2 && T.PRIOR_GAMES === 1);
    ok("the export list is pinned", Object.keys(T).sort().join() === "DECISIVE,MIN_Z,PRIOR_GAMES,WATER_FATES,against,fieldEdges,fightPair,flip,flipSummary,geometries,makeSide,matchup,rankOf,ratings,reportLines,roundRobin,seatBias,stability,summarize,summary,transitivity,upsets", Object.keys(T).sort().join());
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
