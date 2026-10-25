// WebGLEngine/brain/dogfightTournament-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/dogfightTournament-selfcheck.mjs      (~30 s)
//
// THE ROUND ROBIN, HELD TO ANSWERS KNOWN BY CONSTRUCTION. A tournament over the shipped pilots has no answer anyone knew beforehand, so this gate does not ask it one: it flies REAL duels between stand-ins whose result is forced (the autopilot, a copy of the autopilot written as a different function,
// a pilot that holds a heading and does nothing else, a pilot with no controls) and drives the counting, the rating and the checks on numbers made up for them. brain/dogfightTournament.mjs is the machinery under test; the pilots are tools/ship/tournamentDogfight.mjs's business.
//
//   1  A FIGHT PAIR   one scenario flown twice, X in seat A and then X in seat B: the records are X's side of duel()'s `score` and `scoreB`, to the bit, with the kills and the endings on the right side of each
//   2  THE SUMMARY    on made-up fights: the edge is the mean over SCENARIOS of the scenario's two fights, the standard error is over scenarios (not fights), wins/draws/losses cut at 0.05 STRICTLY, z is infinite when there is no spread, two records to a scenario or it throws; flip() is exact
//   3  THE MATCHUP    a pilot against a COPY of itself: edge exactly 0 (not about 0), wins equal losses, scores equal; against a passive pilot: wins, a z over 2, and the other side's numbers are the first side's flipped; a falling pilot has the ground counted, once per fight
//   4  THE ROUND ROBIN  n(n-1)/2 pairs in roster order, progress reported, a duplicate id and a roster of one refused by name, against() answers either way round
//   5  THE RATINGS    by construction: a closed form for two pilots (75 wins in 100 is 400 log10 3 = 190.85 Elo with no prior), a sweep across three is ordered and symmetric about the middle, equal results are equal ratings, a draw is half a win, a pilot that never loses stays finite, `converged` is honest
//   6  THE CHECKS     a made-up cycle is found once and named in the order of the roster; a transitive table, a weak leg and a below-threshold lead are not cycles; an upset is a significant lead against the rating
//   7  STABILITY AND SEATS   the fit on all the scenarios moves by exactly 0 from itself; a prefix is the fit to the first n scenarios' fights; sizes beyond the scenarios flown are dropped; seatBias() is the mean of (A's score - B's) recomputed from the fights
//   8  THE REPORT     every pilot in the counts, the edges and the ratings, no NaN, undefined or "-0.000", the cycle line and the stability lines and the seat lines
//
// SABOTAGE LOG -- SIXTY MUTANTS of brain/dogfightTournament.mjs, each applied in a scratch tree, the gate run, the tree discarded; every one red by name except the one equivalent mutant said below (the number is how many rows went red):
//   M01 seat B's X score from the wrong side 9 | M02 seat A's Y score from the wrong side 8 | M03 seat A's kill flags from the wrong clocks 4 | M04 seat B's kill flags swapped 3 | M05 the swapped fight flown with Y in both seats 5 | M06 the options dropped in seat A 1 | M07 DECISIVE 0.5 2 |
//   M08 a win at exactly the threshold 1 | M09 a draw strictly inside 1 | M10 the standard error over fights 1 | M11 the scenario value a sum 1 | M12 no infinite z 1 | M13 odd record counts accepted 1 | M14 collisions counted from Y 1 (after the tally row was made asymmetric) | M15 a collision a ground contact 1 |
//   M16 groundY from X 2 | M17 killsX from the other flag 2 | M18 flip keeps the edge 5 | M19 flip keeps z 3 | M20 flip keeps kills 1 | M21 flip keeps grounds 1 | M22 flip keeps wins 14 | M23 flip keeps means 2 | M24 duplicate ids allowed 1 | M25 one pilot allowed 1 |
//   M26 self pairs flown 1 | M27 progress count stuck 1 | M28 against() unflipped 19 | M29 a draw a whole win 8 | M30 no phantom game in the denominator 10 | M31 the phantom score a whole game 5 | M32 the Elo scale base 2 4 | M33 converged always true 1 | M34 loose tolerance 1 |
//   M35 games counted as decisive only 8 | M36 rankOf ascending 4 | M37 rankOf ties against the roster 2 (after the ties row) | M38 a lead at the threshold not a lead 1 | M40 cycles listed from every start 3 | M41 the cycle needs two legs 2 | M42 upsets the other way 2 |
//   M43 stability prefix in records not scenarios 2 (it CRASHED first, on summarize() of an odd list: the call is now guarded so the row fails by name) | M44 stability keeps oversize sizes 1 | M45 the shift signed 1 (after the fixture whose largest move is a fall) | M46 seat bias the other way 2 | M47 seat bias se not scaled 1 |
//   M48 field edge a sum 2 | M49 negative zero printed 1 | M50 the orders always agree 1 | M51 meanY from X 2 | M52 seat B named A 3 | M53 PRIOR_GAMES 2 1 | M54 MIN_Z 3 2 | M55 ids sorted in the table 4 (after the stand-in roster was made non-alphabetical) | M56 the lower triangle of the table ignored 5 |
//   M57 stability's sameOrder always true 1 (after the fixture whose first scenario ranks differently) | M58 the report omits the seat lines 1 | M59 the matchup drops the second fight 7 | M60 against() never reads the direct pair 1.
//   M39 IS AN EQUIVALENT MUTANT, SAID: a lead needs `s.edge > 0 && s.z >= MIN_Z`; without the first clause nothing changes, because every summary summarize() makes has a z of the edge's own sign (z = edge / se, or +-Infinity, or 0 when the edge is 0) -- the clause is a guard for a hand-built summary.
//   WHAT THE FIRST RUN FOUND (eight 0-red or crashing mutants, six of them the gate's fault): the tally record had both statuses collided so X's and Y's counts were the same number (M14); ties were only ranked where there were none (M37); the stand-in roster was already alphabetical so a sorted id list changed nothing (M55);
//   no fixture had a prefix whose order differs from the full fit's (M57) or whose biggest move is a fall (M45); stability handed summarize() an odd prefix and threw (M43, a crash and not a red).
"use strict";
import * as D from "./dogfightTask.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as T from "./dogfightTournament.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

console.log("dogfightTournament-selfcheck -- every pilot against every other, from both seats\n");

const ap = { id: "ap", fn: AF.pilot }, copy = { id: "copy", fn: (s, t, w) => AF.pilot(s, t, w) };
const passive = { id: "passive", fn: (s, t, w) => AF.pilot(s, { heading: 0, altitude: 300, airspeed: 45 }, w) };
const zero = { id: "zero", fn: () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 }) };
const sweepForReport = () => made(["a", "b", "c"], [["a", "b", counts(100, 0, 0)], ["a", "c", counts(100, 0, 0)], ["b", "c", counts(100, 0, 0)]]);
const SET = Array.from({ length: 12 }, (_, i) => D.scenario(i + 1, "duel"));

/** A made-up fight record: X scored sx, Y scored sy. */
const rec = (sx, sy, extra = {}) => ({ seed: 0, seat: "A", sx, sy, statusX: "airborne", statusY: "airborne", xKilledY: false, yKilledX: false, ticks: 1800, ...extra });
/** A made-up summary with the counts the rating reads (the rest zero). */
const counts = (winsX, draws, winsY) => ({ n: (winsX + draws + winsY) / 2, fights: winsX + draws + winsY, winsX, winsY, draws, edge: winsX > winsY ? 1 : winsX < winsY ? -1 : 0, se: 0.1, z: winsX > winsY ? 10 : winsX < winsY ? -10 : 0, meanX: 0, meanY: 0, killsX: 0, killsY: 0, collisions: 0, groundX: 0, groundY: 0 });
/** A made-up round-robin result from a table of [x, y, summary]. */
const made = (ids, rows, scenarios = 50) => ({ ids, scenarios, pairs: Object.fromEntries(rows.map(([x, y, s]) => [`${x}|${y}`, { x, y, fights: [], summary: s }])) });

sec("1. A FIGHT PAIR");
{
    const sc5 = D.scenario(5, "duel"), sc6 = D.scenario(6, "duel");
    const [a6, b6] = T.fightPair(ap, passive, sc6), [a5, b5] = T.fightPair(ap, passive, sc5);
    const d6a = D.duel(ap.fn, sc6, { pilotB: passive.fn }), d6b = D.duel(passive.fn, sc6, { pilotB: ap.fn });
    ok("!! TWO RECORDS, X IN SEAT A THEN X IN SEAT B, each X's side of duel(): seat A is (score, scoreB), seat B is (scoreB, score) of the swapped fight -- the autopilot against a passive pilot on duel 6 is 1.0669 / -1 in the first and the swapped fight's scoreB / score in the second", a6.seat === "A" && b6.seat === "B" && a6.sx === d6a.score && a6.sy === d6a.scoreB && b6.sx === d6b.scoreB && b6.sy === d6b.score && Math.abs(a6.sx - 1.0669) < 1e-3 && a6.sy === -1, `${a6.sx.toFixed(4)} ${a6.sy} | ${b6.sx} ${b6.sy}`);
    ok("!! THE KILLS ARE ON THE RIGHT SIDE IN BOTH SEATS: on duel 6 the autopilot kills the passive pilot from seat A (xKilledY) and nobody kills anybody with the seats swapped; on duel 5 the passive pilot in seat B... is the one killed in the swapped fight, so with X = the autopilot in seat B it is xKilledY there", a6.xKilledY === true && a6.yKilledX === false && a6.statusY === "destroyed" && a6.statusX === "airborne" && b6.xKilledY === false && b6.yKilledX === false && b5.xKilledY === true && b5.yKilledX === false && b5.statusY === "destroyed" && b5.seat === "B" && a5.xKilledY === false, `a6 ${a6.statusX}/${a6.statusY}, b5 ${b5.statusX}/${b5.statusY}`);
    const [pa, pb] = T.fightPair(passive, ap, sc5);
    ok("...and the pair read from the other pilot's side is the same two fights with the seats' names swapped: the passive pilot X against the autopilot Y on duel 5 has Y killing X in seat A and X's scores are the negatives' of the autopilot's records (-1 against 1.0689)", pa.yKilledX === true && pa.sx === -1 && Math.abs(pa.sy - 1.0689) < 1e-3 && pa.sx === b5.sy && pa.sy === b5.sx && pb.sx === a5.sy && pb.sy === a5.sx);
    const wide = T.fightPair(ap, passive, sc6, { seconds: 10 });
    ok("the duel's own options reach the fight (a ten-second fight ends by the tenth second and the record says so)", wide[0].ticks <= 300 && wide[1].ticks <= 300);
}

sec("2. THE SUMMARY");
{
    // three scenarios: leads (0.5, 0.3) -> 0.4, (0.2, 0.2) -> 0.2, (0.3, 0.3) -> 0.3
    const f = [rec(0.5, 0), rec(0.3, 0), rec(0.2, 0), rec(0.2, 0), rec(0.3, 0), rec(0.3, 0)], s = T.summarize(f);
    const se = (0.1 / Math.sqrt(3));
    ok("!! THE EDGE IS THE MEAN OVER SCENARIOS AND THE STANDARD ERROR IS OVER SCENARIOS, NOT FIGHTS: scenario values 0.4, 0.2, 0.3 give an edge of 0.3, a standard deviation of 0.1, a standard error of 0.1 / sqrt 3 (six fights would give 0.077) and z = 5.196", s.n === 3 && s.fights === 6 && near(s.edge, 0.3) && near(s.se, se) && near(s.z, 0.3 / se) && near(s.meanX, mean([0.5, 0.3, 0.2, 0.2, 0.3, 0.3])) && near(s.meanY, 0), `edge ${s.edge} se ${s.se.toFixed(5)} z ${s.z.toFixed(3)}`);
    ok("!! A FIGHT IS WON BY MORE THAN 0.05, STRICTLY: a lead of exactly 0.05 is a draw, 0.0500001 a win, -0.0500001 a loss, -0.05 a draw, and the counts add up to the fights", (() => { const t = T.summarize([rec(0.05, 0), rec(0.0500001, 0), rec(0, 0.0500001), rec(0, 0.05), rec(0.3, 0.3), rec(0, 0)]); return t.winsX === 1 && t.winsY === 1 && t.draws === 4 && t.winsX + t.winsY + t.draws === t.fights; })());
    ok("!! WITH NO SPREAD THE Z IS INFINITE, NOT NaN: every scenario worth 0.2 gives z = +Infinity, every one -0.2 gives -Infinity, an edge of exactly 0 with no spread gives 0", (() => { const p = T.summarize([rec(0.2, 0), rec(0.2, 0), rec(0.2, 0), rec(0.2, 0)]), m = T.summarize([rec(0, 0.2), rec(0, 0.2)]), o = T.summarize([rec(0.3, 0.1), rec(0.1, 0.3)]); return p.z === Infinity && m.z === -Infinity && o.z === 0 && o.edge === 0 && p.se === 0; })());
    ok("one scenario is a summary with a standard error of 0 and not NaN; an empty list and an odd number of records are refused", T.summarize([rec(0.1, 0), rec(0.1, 0)]).se === 0 && /two per scenario/.test(throws(() => T.summarize([rec(0, 0), rec(0, 0), rec(0, 0)])) || "") && /two per scenario/.test(throws(() => T.summarize([])) || ""));
    const g = T.summarize([rec(0, 0, { statusX: "collided", xKilledY: false }), rec(0.5, -0.5, { xKilledY: true, statusY: "destroyed" }), rec(0, 0, { statusX: "crashed" }), rec(0, 0, { statusY: "touchdown", yKilledX: true }), rec(0, 0, { statusX: "lost" }), rec(0, 0, { statusX: "collided", statusY: "collided" })]);
    ok("!! THE TALLIES: a collision counted from X's status (two of the six records, in one of which both collided; the count would be 0 from Y's), kills from each side's flag, ground contacts (crashed, touchdown, lost) from each side's status and a collision is not a ground contact", g.collisions === 2 && g.killsX === 1 && g.killsY === 1 && g.groundX === 2 && g.groundY === 1);
    const fl = T.flip(g);
    ok("!! flip() IS EXACT: the edge and z negated, wins, kills, grounds and the means swapped, and flipping twice gives the summary back", fl.edge === -g.edge && fl.z === -g.z && fl.winsX === g.winsY && fl.winsY === g.winsX && fl.killsX === g.killsY && fl.killsY === g.killsX && fl.groundX === g.groundY && fl.groundY === g.groundX && fl.meanX === g.meanY && fl.meanY === g.meanX && fl.draws === g.draws && fl.collisions === g.collisions && JSON.stringify(T.flip(fl)) === JSON.stringify(g));
}

sec("3. THE MATCHUP");
let mCopy, mPassive, mPassiveBack, mZero;
{
    mCopy = T.matchup(ap, copy, SET); mPassive = T.matchup(ap, passive, SET); mPassiveBack = T.matchup(passive, ap, SET); mZero = T.matchup(zero, ap, SET);
    const s = mCopy.summary;
    ok("!! A PILOT AGAINST A COPY OF ITSELF IS EXACTLY LEVEL (a different function, the same flying): the edge is 0 to the last bit, wins equal losses, the two pilots' mean scores are equal, the standard error is 0 and the z is 0 -- the seats cancel because the pair of fights is one fight read from both sides", s.edge === 0 && s.winsX === s.winsY && s.meanX === s.meanY && s.se === 0 && s.z === 0 && s.fights === 24 && s.n === 12, `${s.winsX}-${s.draws}-${s.winsY}, edge ${s.edge}`);
    const p = mPassive.summary;
    ok("!! THE AUTOPILOT AGAINST A PASSIVE PILOT WINS: more wins than losses, a positive edge at more than two standard errors, kills for the autopilot and none for the passive pilot, and the ground never involved", p.winsX > p.winsY && p.edge > 0 && p.z > 2 && p.killsX > 0 && p.killsY === 0 && p.groundX === 0 && p.groundY === 0, `${p.winsX}-${p.draws}-${p.winsY}, edge ${p.edge.toFixed(3)} +- ${p.se.toFixed(3)}, ${p.killsX} kills`);
    const q = mPassiveBack.summary, fq = T.flip(p);
    ok("!! THE OTHER PILOT'S MATCHUP IS THE FIRST FLIPPED, TO THE BIT: passive against the autopilot has the edge, z, wins, kills and means of the autopilot against passive negated or swapped (the same 24 fights flown with the seats' names the other way round)", q.edge === fq.edge && q.z === fq.z && q.winsX === fq.winsX && q.winsY === fq.winsY && q.draws === fq.draws && q.killsX === fq.killsX && q.killsY === fq.killsY && q.meanX === fq.meanX && q.meanY === fq.meanY && q.se === fq.se);
    const z = mZero.summary;
    ok("!! A PILOT WITH NO CONTROLS LOSES TO THE GROUND, ONCE PER FIGHT: in every one of the 24 fights it ends on the ground (crashed or touchdown), the autopilot never does, and the autopilot wins every one that the falling pilot has not already lost to itself", z.groundX === 24 && z.groundY === 0 && z.winsY >= 20 && z.edge < -0.5 && mZero.fights.every((r) => ["crashed", "touchdown"].includes(r.statusX)), `${z.winsX}-${z.draws}-${z.winsY}, ground ${z.groundX}`);
    ok("the summary of a matchup is the summary of its own fights (24 records, two a scenario in the scenarios' order: seats A, B, A, B, ...)", JSON.stringify(T.summarize(mPassive.fights)) === JSON.stringify(mPassive.summary) && mPassive.fights.length === 24 && mPassive.fights.every((r, i) => r.seat === (i % 2 === 0 ? "A" : "B") && r.seed === SET[Math.floor(i / 2)].seed) && mPassive.x === "ap" && mPassive.y === "passive");
}

sec("4. THE ROUND ROBIN");
let rr;
{
    const seen = [];
    rr = T.roundRobin([ap, passive, copy, zero], SET.slice(0, 6), {}, (m, done, total) => seen.push(`${m.x}|${m.y}|${done}/${total}`));
    ok("!! n(n-1)/2 PAIRS IN ROSTER ORDER, each flown over every scenario from both seats: four pilots, deliberately not in alphabetical order (ap, passive, copy, zero), are six pairs (ap|passive, ap|copy, ap|zero, passive|copy, passive|zero, copy|zero) of twelve fights, the ids and the scenario count are recorded and progress is reported once per pair", JSON.stringify(Object.keys(rr.pairs)) === JSON.stringify(["ap|passive", "ap|copy", "ap|zero", "passive|copy", "passive|zero", "copy|zero"]) && Object.values(rr.pairs).every((m) => m.fights.length === 12) && rr.scenarios === 6 && rr.ids.join() === "ap,passive,copy,zero" && JSON.stringify(seen) === JSON.stringify(["ap|passive|1/6", "ap|copy|2/6", "ap|zero|3/6", "passive|copy|4/6", "passive|zero|5/6", "copy|zero|6/6"]), seen.join(" "));
    ok("!! against() ANSWERS EITHER WAY ROUND, flipped when it has to: ap against passive is the stored summary, passive against ap its flip, and a pair that was not flown is null", T.against(rr, "ap", "passive") === rr.pairs["ap|passive"].summary && JSON.stringify(T.against(rr, "passive", "ap")) === JSON.stringify(T.flip(rr.pairs["ap|passive"].summary)) && T.against(rr, "ap", "nobody") === null);
    ok("!! THE SAME PILOT UNDER TWO IDS CANNOT BE IN ONE TOURNAMENT, AND ONE PILOT IS NOT A TOURNAMENT: a duplicate id is refused by name (a table keyed by ids would merge them), so is a roster of one", /duplicate pilot id/.test(throws(() => T.roundRobin([ap, { id: "ap", fn: passive.fn }], SET.slice(0, 1))) || "") && /at least two/.test(throws(() => T.roundRobin([ap], SET.slice(0, 1))) || ""));
    ok("the autopilot and its copy are level in the round robin as well and both beat the pilot with no controls (the same fights, the same answers)", rr.pairs["ap|copy"].summary.edge === 0 && T.against(rr, "ap", "zero").edge > 0.5 && T.against(rr, "copy", "zero").edge > 0.5);
}

sec("5. THE RATINGS");
{
    const two = (w, d, l, o = {}) => T.ratings(made(["x", "y"], [["x", "y", counts(w, d, l)]]), o);
    const r75 = two(75, 0, 25, { prior: 0 });
    ok("!! THE CLOSED FORM FOR TWO PILOTS: 75 wins to 25 with no prior is 400 log10 (75 / 25) = 190.848 Elo apart (with no phantom nothing anchors the zero, so only the DIFFERENCE is asked), and it converges", near(r75.rating.x - r75.rating.y, 400 * Math.log10(3), 1e-6) && r75.converged, `${(r75.rating.x - r75.rating.y).toFixed(4)} in ${r75.iterations} iterations`);
    const rp = two(75, 0, 25);
    ok("!! THE PRIOR PULLS TOWARD THE PHANTOM AND NOT PAST IT: the same 75-25 with the one regularising game is a smaller gap than the closed form (strictly) and still above 185 Elo", rp.rating.x - rp.rating.y < 400 * Math.log10(3) - 1e-3 && rp.rating.x - rp.rating.y > 185 && rp.rating.x > 0 && rp.rating.y < 0);
    const d50 = two(25, 50, 25);
    ok("!! A DRAW IS HALF A WIN: 25 wins, 50 draws and 25 losses is exactly level (both ratings 0 to 1e-9); 50 wins and 50 draws against 0 losses rates the same as 75 wins to 25 (with no prior, 400 log10 3)", near(d50.rating.x, 0, 1e-9) && near(d50.rating.y, 0, 1e-9) && near(two(50, 50, 0, { prior: 0 }).rating.x - two(50, 50, 0, { prior: 0 }).rating.y, 400 * Math.log10(3), 1e-6));
    const sweep = T.ratings(made(["a", "b", "c"], [["a", "b", counts(100, 0, 0)], ["a", "c", counts(100, 0, 0)], ["b", "c", counts(100, 0, 0)]]));
    ok("!! A SWEEP ACROSS THREE IS ORDERED, FINITE AND SYMMETRIC ABOUT THE MIDDLE: a beats b and c every time and b beats c every time -- a > b > c, every rating finite, b exactly at the phantom's 0, a and c equal and opposite, and the order read back by rankOf", sweep.rating.a > sweep.rating.b && sweep.rating.b > sweep.rating.c && [sweep.rating.a, sweep.rating.b, sweep.rating.c].every(Number.isFinite) && near(sweep.rating.b, 0, 1e-6) && near(sweep.rating.a + sweep.rating.c, 0, 1e-6) && T.rankOf(sweep, ["a", "b", "c"]).join() === "a,b,c" && T.rankOf(sweep, ["c", "a", "b"]).join() === "a,b,c", `${sweep.rating.a.toFixed(1)} ${sweep.rating.b.toFixed(3)} ${sweep.rating.c.toFixed(1)}`);
    const alike = T.ratings(made(["x", "y", "z"], [["x", "y", counts(10, 80, 10)], ["x", "z", counts(60, 0, 40)], ["y", "z", counts(60, 0, 40)]]));
    ok("!! TWO PILOTS WITH THE SAME RESULTS ARE THE SAME RATING: x and y draw each other and both beat z 60-40 -- equal to 1e-9, both above z", near(alike.rating.x, alike.rating.y, 1e-9) && alike.rating.x > alike.rating.z);
    const level = T.ratings(made(["x", "y", "z"], [["x", "y", counts(5, 40, 5)], ["x", "z", counts(5, 40, 5)], ["y", "z", counts(5, 40, 5)]]));
    ok("a table of nothing but even results rates everyone at the phantom's 0, and a pilot who beat nobody and lost to nobody is not rated by its absence of games (a missing pair is simply no games)", Object.values(level.rating).every((r) => near(r, 0, 1e-9)) && Number.isFinite(T.ratings(made(["x", "y", "z"], [["x", "y", counts(10, 0, 10)]])).rating.z));
    ok("!! `converged` IS HONEST: with one iteration allowed the fit says it did not converge and reports one iteration; given room it converges well inside the cap (the iteration is slow for a lopsided table: thousands, not hundreds)", two(75, 0, 25, { maxIter: 1 }).converged === false && two(75, 0, 25, { maxIter: 1 }).iterations === 1 && rp.converged && rp.iterations < 20000, `${rp.iterations} iterations`);
    ok("!! TIES KEEP THE ROSTER'S ORDER, WHATEVER THE ROSTER IS: three pilots rated level are ranked x, y, z when listed so, and z, x, y when listed so", T.rankOf(level, ["x", "y", "z"]).join() === "x,y,z" && T.rankOf(level, ["z", "x", "y"]).join() === "z,x,y");
    ok("the ratings of a real round robin are a pure function of the counts (the fit twice is the same object by value), the pilot with no controls is last and the autopilot and its copy are level to 1e-9", JSON.stringify(T.ratings(rr)) === JSON.stringify(T.ratings(rr)) && T.rankOf(T.ratings(rr), rr.ids).at(-1) === "zero" && near(T.ratings(rr).rating.ap, T.ratings(rr).rating.copy, 1e-9));
}

sec("6. THE CHECKS ON A RANKING");
{
    const sw = made(["a", "b", "c"], [["a", "b", counts(100, 0, 0)], ["a", "c", counts(100, 0, 0)], ["b", "c", counts(100, 0, 0)]]), fe = T.fieldEdges(sw);
    ok("!! THE FIELD EDGE IS EACH PILOT'S MEAN EDGE AGAINST THE REST, THE SCORE-BASED ORDER: in the sweep (each pair's edge +1 for the leader) a is +1, b is (-1 + 1) / 2 = 0, c is -1; the field edges of any round robin sum to 0 (every pair counted once each way); the autopilot and its copy are equal and the pilot with no controls is the lowest",
        fe.a === 1 && fe.b === 0 && fe.c === -1 && near(Object.values(T.fieldEdges(rr)).reduce((s, x) => s + x, 0), 0, 1e-12) && T.fieldEdges(rr).ap === T.fieldEdges(rr).copy && T.fieldEdges(rr).zero === Math.min(...Object.values(T.fieldEdges(rr))));
    const cyc = made(["a", "b", "c"], [["a", "b", counts(70, 0, 30)], ["b", "c", counts(70, 0, 30)], ["c", "a", counts(70, 0, 30)]].map(([x, y, s]) => [x, y, s]));
    // c|a is stored as c over a: roster order is a, b, c so the pair key c|a is read through against() either way
    ok("!! A CYCLE IS FOUND ONCE AND NAMED FROM THE FIRST PILOT IN THE ROSTER: a beats b, b beats c, c beats a, each by z 10 -- exactly one entry, 'a > b > c > a' (not also 'b > c > a > b' and not the other direction)", JSON.stringify(T.transitivity(cyc)) === JSON.stringify(["a > b > c > a"]));
    const trans = made(["a", "b", "c"], [["a", "b", counts(70, 0, 30)], ["b", "c", counts(70, 0, 30)], ["a", "c", counts(70, 0, 30)]]);
    ok("!! A TRANSITIVE TABLE HAS NO CYCLE", T.transitivity(trans).length === 0);
    const weak = made(["a", "b", "c"], [["a", "b", counts(70, 0, 30)], ["b", "c", counts(70, 0, 30)], ["c", "a", { ...counts(52, 0, 48), z: 1.99, edge: 0.01 }]]);
    ok("!! A WEAK LEG IS NOT A CYCLE: the same three with c over a at z 1.99 (under the threshold of 2) is no cycle; at exactly z 2 it is", T.transitivity(weak).length === 0 && T.transitivity(made(["a", "b", "c"], [["a", "b", counts(70, 0, 30)], ["b", "c", counts(70, 0, 30)], ["c", "a", { ...counts(52, 0, 48), z: 2, edge: 0.01 }]])).length === 1);
    const backwards = made(["a", "b", "c"], [["b", "a", counts(70, 0, 30)], ["c", "b", counts(70, 0, 30)], ["a", "c", counts(70, 0, 30)]]);
    ok("a cycle stored with its pairs the other way round (b|a, c|b, a|c) is the same cycle, read through against(): b > a > c > b is named from a as 'a > c > b > a'", JSON.stringify(T.transitivity(backwards)) === JSON.stringify(["a > c > b > a"]));
    // an upset: low beats high significantly
    const upset = made(["hi", "mid", "lo"], [["hi", "mid", counts(90, 0, 10)], ["hi", "lo", counts(30, 0, 70)], ["mid", "lo", counts(90, 0, 10)]]);
    const fit = T.ratings(upset), ups = T.upsets(upset, fit);
    ok("!! AN UPSET IS A SIGNIFICANT LEAD AGAINST THE RATING: lo beats hi 70-30 while hi beats mid and mid beats lo 90-10 -- the rating puts hi, mid, lo in that order or not, but whichever pair runs against it is listed with 'lower' the lower-rated pilot, and a table with no such pair lists none", ups.every((u) => fit.rating[u.lower] < fit.rating[u.higher] && u.z >= 2 && u.edge > 0) && ups.length >= 1 && T.upsets(trans, T.ratings(trans)).length === 0, ups.map((u) => `${u.lower} over ${u.higher}`).join(", "));
}

sec("7. STABILITY AND SEATS");
{
    const stTry = (() => { try { return T.stability(rr, [1, 3, 6, 9, 0]); } catch (e) { return e.message; } })();
    ok("!! STABILITY NEVER HANDS summarize() AN ODD LIST: a prefix of 1 or 3 scenarios is 2 or 6 records, and the call returns rows and does not throw", Array.isArray(stTry), Array.isArray(stTry) ? "" : stTry);
    const st = Array.isArray(stTry) ? stTry : [];
    const fullFit = T.ratings(rr), full = st.find((s) => s.n === 6);
    ok("!! STABILITY: sizes beyond the scenarios flown (9) and below one (0) are dropped, the fit on all six is the full fit to the bit (shift 0, same order) and each smaller size reports a finite shift", st.map((s) => s.n).join() === "1,3,6" && full.maxShift === 0 && full.sameOrder && Object.keys(fullFit.rating).every((id) => full.rating[id] === fullFit.rating[id]) && st.every((s) => Number.isFinite(s.maxShift) && s.maxShift >= 0));
    const prefix = { ids: rr.ids, scenarios: 3, pairs: Object.fromEntries(Object.entries(rr.pairs).map(([k, m]) => [k, { ...m, fights: m.fights.slice(0, 6), summary: T.summarize(m.fights.slice(0, 6)) }])) };
    const direct = T.ratings(prefix), at3 = st.find((s) => s.n === 3);
    ok("!! A PREFIX IS THE FIT TO THE FIRST n SCENARIOS' FIGHTS: the n = 3 row equals the rating of a round robin built from the first six records of every pair, to the bit, and its maxShift is the largest rating difference from the full fit", Object.keys(direct.rating).every((id) => at3.rating[id] === direct.rating[id]) && at3.maxShift === Math.max(...rr.ids.map((id) => Math.abs(direct.rating[id] - fullFit.rating[id]))) && at3.maxShift > 0, `shift at 3: ${at3.maxShift.toFixed(2)} Elo`);
    // a made-up table whose answer is known: x, y, z over four scenarios; the FIRST scenario is not like the rest
    const two = (a, b) => [rec(a, b), rec(a, b)], win = [0.5, -0.5], lose = [-0.5, 0.5], tie = [0, 0];
    const mk = (first, rest) => ({ x: "", y: "", fights: [...two(...first), ...two(...rest), ...two(...rest), ...two(...rest)] });
    const synth = { ids: ["x", "y", "z"], scenarios: 4, pairs: {} };
    for (const [k, first, rest] of [["x|y", lose, win], ["x|z", lose, win], ["y|z", tie, tie]]) { const f = mk(first, rest).fights; synth.pairs[k] = { x: k[0], y: k[2], fights: f, summary: T.summarize(f) }; }
    const sFull = T.ratings(synth), sOrder = T.rankOf(sFull, synth.ids), sRows = T.stability(synth, [1, 4]), one = sRows[0], all4 = sRows[1];
    const shifts = synth.ids.map((id) => one.rating[id] - sFull.rating[id]), big = shifts.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    ok("!! A MADE-UP TABLE WHOSE FIRST SCENARIO IS NOT LIKE THE REST: x loses to both y and z in the first scenario and beats both in the three after (y and z tie throughout). On the first scenario alone the order is y, z, x; on all four it is x, y, z -- the first row says DIFFERENT ORDER and the last says SAME ORDER with a shift of exactly 0",
        one.n === 1 && all4.n === 4 && one.sameOrder === false && one.order.join() === "y,z,x" && sOrder.join() === "x,y,z" && all4.sameOrder === true && all4.maxShift === 0, `prefix order ${one.order.join()}, full ${sOrder.join()}`);
    ok("!! THE SHIFT IS THE LARGEST ABSOLUTE MOVE, NOT THE LARGEST RISE: in that table the pilot who moves most between the first scenario alone and all four (x: the fit to the first scenario rates it far BELOW the fit to all four, so prefix minus full is negative) is x, the largest rise (y and z, under half as far) is smaller, and maxShift is x's move as a positive number", big < 0 && one.maxShift === Math.abs(big) && one.maxShift > Math.max(...shifts) && shifts[0] === big, `shifts ${shifts.map((v) => v.toFixed(1)).join(" ")}, maxShift ${one.maxShift.toFixed(2)}`);
    const sb = T.seatBias(ap, SET.slice(0, 6)), want = SET.slice(0, 6).map((sc) => { const r = D.duel(ap.fn, sc, { pilotB: ap.fn }); return r.score - r.scoreB; });
    ok("!! SEAT BIAS IS THE MEAN OF (A's SCORE - B's SCORE) OF A PILOT FLOWN AGAINST ITSELF, recomputed from the fights: n 6, the mean, a standard error over duels, positive when seat A is the better seat", sb.n === 6 && sb.mean === mean(want) && near(sb.se, Math.sqrt(want.reduce((s, x) => s + (x - mean(want)) ** 2, 0) / 5) / Math.sqrt(6)) && near(sb.z, sb.mean / sb.se), `${sb.mean.toFixed(3)} +- ${sb.se.toFixed(3)}`);
    const sz = T.seatBias(zero, SET.slice(0, 3));
    ok("a copy of a pilot has the very bias the pilot has (the same flying); two pilots with no controls fall, the one that lands first has lost its 20 and the other, still airborne, scores 0 -- seat A is the survivor on duels 1 and 3 and not on duel 2, so the bias is (1 - 1 + 1) / 3", T.seatBias(copy, SET.slice(0, 6)).mean === sb.mean && sz.n === 3 && near(sz.mean, 1 / 3, 1e-12), `${sz.mean}`);
}

sec("8. THE REPORT");
{
    const labels = { ap: "PD autopilot", copy: "autopilot copy", passive: "passive pilot", zero: "no controls" }, seat = { ap: T.seatBias(ap, SET.slice(0, 4)) };
    const lines = T.reportLines(rr, { labels, seat, sizes: [3, 6] }), text = lines.join("\n");
    ok("!! THE REPORT HAS EVERY PILOT IN EVERY TABLE AND NOTHING BROKEN IN IT: the counts matrix, the edges, the ratings (sorted, best first), the transitivity line, a stability line per size and the seat line; no NaN, undefined, Infinity or '-0.000' (the '+-0.000' of 'plus or minus' is not one)", lines.length === 21 && Object.values(labels).every((n) => (text.match(new RegExp(n, "g")) || []).length >= 3) && !/NaN|undefined|Infinity|(?<!\+)-0\.000/.test(text) && /WINS-DRAWS-LOSSES/.test(text) && /EDGE of the row/.test(text) && /RATINGS/.test(text) && /TRANSITIVE\?/.test(text) && (text.match(/STABILITY on the first/g) || []).length === 2 && /SEAT \(PD autopilot/.test(text) && /4 duels/.test(text), `${lines.length} lines`);
    const ratingLines = lines.filter((l) => /^ {4} *-?\d+\.\d  /.test(l)), vals = ratingLines.map((l) => Number(l.trim().split(/\s+/)[0]));
    ok("!! THE RATINGS ARE LISTED BEST FIRST: four lines whose numbers fall, the pilot with no controls last", ratingLines.length === 4 && vals.every((v, i) => i === 0 || vals[i - 1] >= v) && /no controls/.test(ratingLines[3]), vals.join(" "));
    const tiny = made(["x", "y"], [["x", "y", { ...counts(1, 0, 1), edge: -1e-17, se: 0, z: 0 }]], 1);
    const split = made(["x", "y"], [["x", "y", { ...counts(60, 0, 40), edge: -0.5, z: -10 }]]);
    const agree = T.reportLines(sweepForReport(), { sizes: [] }).join("\n"), parted = T.reportLines(split, { sizes: [] }).join("\n"), edgeLine = agree.split("\n").find((l) => /MEAN EDGE/.test(l)) || "";
    ok("!! THE REPORT SAYS WHETHER THE RATING AND THE SCORE AGREE: in a sweep the two orders AGREE and the line lists a +1.000 > b +0.000 > c -1.000; where x wins 60 fights to 40 but loses them by a mean score of 0.5 the rating puts x first, the edge puts y first, and the line says DISAGREE and names both orders", /orders AGREE/.test(agree) && !/DISAGREE/.test(agree) && /: a \+1\.000 > b \+0\.000 > c -1\.000;/.test(edgeLine) && /DISAGREE \(x > y by rating, y > x by edge\)/.test(parted) && /MEAN EDGE AGAINST THE FIELD/.test(parted), edgeLine.slice(0, 160));
    ok("!! a vanishing negative edge is printed as 0.000 and not -0.000 (the table is read by eye): an edge of -1e-17 is the case, and the report says +0.000 on both sides of the pair", !/(?<!\+)-0\.000/.test(T.reportLines(tiny, { sizes: [] }).join("\n")) && (T.reportLines(tiny, { sizes: [] }).join("\n").match(/\+0\.000\+-0\.000/g) || []).length === 2);
    ok("the constants are what the header says: a draw inside 0.05, a lead at 2 paired standard errors, one regularising game", T.DECISIVE === 0.05 && T.MIN_Z === 2 && T.PRIOR_GAMES === 1);
}

console.log(fails ? `\ndogfightTournament-selfcheck: ${fails} FAILED` : "\ndogfightTournament-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
