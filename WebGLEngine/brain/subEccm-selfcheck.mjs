// WebGLEngine/brain/subEccm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subEccm-selfcheck.mjs      (about 40 s: fixtures, a few torpedo steps, duels on DEV smoke geometries 1 to 4 -- NEVER a registered seed, and the HELD set is never flown here: the command's held path is reached through an override that flies the smoke geometries)
//
// THE GATE OF THE SEEKER'S TWO OPTIONS (physics/mechanics/subTorpedo.mjs `eccm`: lock memory and a persistent decoy classifier), OF THE HOOK IN brain/subDuel.mjs (`seeker`) AND OF tools/ship/takeSeekerEccm.mjs
// (the registration is brain/SUB_ECCM_WIP.md, with Amendment A):
//   1 CONSTANTS     the ladder, the rule, the sets (HELD moved by Amendment A), the arms, seekerOf
//   2 THE SEEKER    `eccm` null is the old seeker to the state (no `lockId`); lock memory holds the source it homed on while it is still heard and falls back to the loudest when it is not; a lock lost forgets it; classifyReject 0 and 1 and 0.5
//                   (a draw made once for each torpedo and decoy, independent of the tick, a function of the seed, never rejecting a boat); `stats`; a dumb torpedo is not touched
//   3 THE ARENA     with no seeker the duel is the ORIGINAL code's, to the fingerprint (20 pins taken from the files before the options); the same with `seeker: null`; the hook passes the seeker on (a classifier of 1 breaks the two-sided collapse); `seeker.stats` in the result only when given
//   4 THE COMMAND   arms, the rule at its edges, the choice, the checks one condition at a time, the output of the smoke calibration to the byte, the held path through the override and its refusals, the command run as a program
//   5 THE SOURCE    no clock, no random number; the headers; the registration's ladder equals the code's
// NOT CHECKED, said plainly: that the options are a good model of a seeker (the numbers are chosen, not measured), which rung DEV chooses and what HELD says (that is the experiment).
//
// SABOTAGES: see the log below the gate's last section header comment once it is written (this file is written before its sabotage pass).
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as Tp from "../physics/mechanics/subTorpedo.mjs";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as C from "./subCountermeasures.mjs";
import * as X from "../tools/ship/takeSeekerEccm.mjs";
import { sideOf } from "../tools/ship/takeCountermeasures.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };

// ---- fixtures ----
const mk = (id = 1) => Tp.launch(99, { pos: [0, 0, -30], heading: 0, pitch: 0 }, { id });
const boat = { id: 1, pos: [156, 0, -30], heading: 0, speed: 2 }, decoy = { id: 2000, pos: [156, 40, -30], heading: 0, speed: 1.2, sl: 130 }, decoy0 = { ...decoy, pos: [156, 0, -30] };
const stepN = (t, targets, n, o = {}) => { let s = t; for (let i = 0; i < n; i++) s = Tp.stepTorpedo(s, targets, { tick: i + (o.t0 || 0), ...o }).torpedo; return s; };
const E = (o = {}) => ({ lockMemory: false, classifyReject: 0, stats: {}, ...o });

console.log("1. CONSTANTS");
{
    ok("!! the ladder, to the digit (the registration's table)", J(X.LADDER) === '[{"rung":0,"lockMemory":false,"classifyReject":0},{"rung":1,"lockMemory":true,"classifyReject":0},{"rung":2,"lockMemory":false,"classifyReject":0.25},{"rung":3,"lockMemory":false,"classifyReject":0.5},{"rung":4,"lockMemory":false,"classifyReject":0.75},{"rung":5,"lockMemory":true,"classifyReject":0.5}]');
    ok("!! the rule (a boat sunk in 30 percent of the both-kit duels, the carrier 25 percent better in the one-kit duels) and the sets: smoke 1 to 4, DEV 91001 for 24, HELD 93001 for 24 (92001 was spent by Amendment A)", J(X.RULE) === '{"bothSunk":0.3,"oneAdvantage":0.25}' && J(X.SETS) === '{"smoke":{"first":1,"count":4},"dev":{"first":91001,"count":24},"held":{"first":93001,"count":24}}');
    ok("everything exported as a constant is frozen, down to each rung and each set", [X.LADDER, X.SETS, X.RULE, X.ARMS, ...X.LADDER, ...Object.values(X.SETS)].every(Object.isFrozen));
    ok("the arms: none carries nothing, both carries the decoy on X and on Y, one carries it on X only, all3 carries all three on both", J(X.ARMS) === '{"none":{"x":null,"y":null},"both":{"x":{"decoy":true},"y":{"decoy":true}},"one":{"x":{"decoy":true},"y":null},"all3":{"x":{"decoy":true,"screen":true,"interceptor":true},"y":{"decoy":true,"screen":true,"interceptor":true}}}');
    ok("!! seekerOf: rung 0 is null (the old seeker, so its flights are the unchanged code's); the others are fresh objects each call, with their rung's two options and zeroed stats; a rung outside 0 to 5 is refused by name", X.seekerOf(0) === null && J(X.seekerOf(3)) === '{"lockMemory":false,"classifyReject":0.5,"stats":{"rejected":0,"held":0}}' && J(X.seekerOf(5)) === '{"lockMemory":true,"classifyReject":0.5,"stats":{"rejected":0,"held":0}}' && X.seekerOf(3) !== X.seekerOf(3) && X.seekerOf(3).stats !== X.seekerOf(3).stats && /no rung 6/.test(thr(() => X.seekerOf(6))) && /no rung -1/.test(thr(() => X.seekerOf(-1))));
    ok("geometriesOf: 4 smoke geometries from seed 1, 24 DEV from 91001, 24 HELD from 93001, all of the tournament's kind (patrol)", X.geometriesOf("smoke").map((g) => g.seed).join() === "1,2,3,4" && X.geometriesOf("dev").length === 24 && X.geometriesOf("dev")[0].seed === 91001 && X.geometriesOf("dev")[23].seed === 91024 && X.geometriesOf("held")[0].seed === 93001 && X.geometriesOf("held")[23].seed === 93024 && X.geometriesOf("smoke").every((g) => g.kind === "patrol"));
}

console.log("\n2. THE SEEKER (physics/mechanics/subTorpedo.mjs)");
{
    const t0 = stepN(mk(), [boat], 1), t1 = stepN(mk(), [boat], 1, { eccm: null });
    ok("!! the fixture itself: a lone boat 150 m ahead is heard and locked, the line of sight within 0.12 rad of the boat's bearing (0)", t0.locked === true && Math.abs(t0.lastLos.h) < 0.12);
    ok("!! `eccm: null` is the old seeker to the state: the same object as omitting it, and NO `lockId` field on the torpedo (only a torpedo that was given an `eccm` carries one)", J(t0) === J(t1) && !("lockId" in t0) && !("lockId" in t1));
    const old = stepN(mk(), [boat, decoy], 1);
    ok("!! the old rule: the louder decoy (130 dB, 40 m to the left) wins the cone: the line of sight is the decoy's (-0.265 rad, within 0.1)", old.locked && Math.abs(old.lastLos.h - -0.265) < 0.1);
    const off = stepN(mk(), [boat, decoy], 1, { eccm: E() });
    ok("!! an `eccm` with both options off flies the old seeker (the same position, heading, command and line of sight) and records a lockId (the decoy's, 2000)", J({ p: off.pos, h: off.heading, c: off.cmd, l: off.lastLos, k: off.locked }) === J({ p: old.pos, h: old.heading, c: old.cmd, l: old.lastLos, k: old.locked }) && off.lockId === 2000);
    // ---- classifyReject
    const st = E({ classifyReject: 1 }), r1 = stepN(mk(), [boat, decoy], 1, { eccm: st });
    ok("!! classifyReject 1: every decoy is recognised and skipped, the boat is chosen (the line of sight is the boat's, 0 within 0.12, not the decoy's -0.265), and `stats.rejected` counts the look (1)", r1.locked && Math.abs(r1.lastLos.h) < 0.12 && st.stats.rejected === 1 && st.stats.held === undefined && r1.lockId === 1);
    const only = stepN(mk(), [decoy0], 1, { eccm: E({ classifyReject: 1 }) });
    ok("!! a lone recognised decoy is nothing to home on: no lock, no command (the torpedo runs straight)", only.locked === false && only.cmd.heading === 0 && only.cmd.pitch === 0 && only.lockId === null);
    const zero = stepN(mk(), [boat, decoy], 1, { eccm: E({ classifyReject: 0 }) });
    ok("classifyReject 0 recognises nothing (the decoy is chosen as before) and counts nothing", Math.abs(zero.lastLos.h - -0.265) < 0.1);
    const nb = E({ classifyReject: 1 }), onlyBoat = stepN(mk(), [boat], 1, { eccm: nb });
    ok("!! a boat is never recognised as a decoy, even at classifyReject 1: it declares no source level of its own (`sl`), and nothing is counted", onlyBoat.locked && nb.stats.rejected === undefined);
    const ids = Array.from({ length: 400 }, (_, i) => i + 1), recognised = (p, seed, tick) => ids.filter((id) => !Tp.stepTorpedo(mk(id), [decoy0], { tick, seed, eccm: { classifyReject: p, lockMemory: false } }).torpedo.locked);
    const half = recognised(0.5, 0, 0);
    ok("!! classifyReject 0.5: about half the 400 torpedoes recognise a given decoy (217, inside 43 to 57 percent), the first 16 ids' pattern is pinned (3, 5, 6, 7, 10, 13, 14, 15), 1 recognises all 400, 0 none", half.length === 217 && half.length / 400 > 0.43 && half.length / 400 < 0.57 && half.filter((i) => i <= 16).join() === "3,5,6,7,10,13,14,15" && recognised(1, 0, 0).length === 400 && recognised(0, 0, 0).length === 0);
    ok("!! the draw is made ONCE, not at every look: the same torpedoes recognise the same decoy at tick 0 and at tick 600 (it is a function of the arena's seed, the torpedo's id and the decoy's id)", J(recognised(0.5, 0, 600)) === J(half) && J(recognised(0.5, 0, 17)) === J(half));
    ok("!! a different arena seed draws a different set (seed 5 recognises 197 of 400, not the same 217), and a different decoy id draws a different set too", recognised(0.5, 5, 0).length === 197 && J(recognised(0.5, 5, 0)) !== J(half) && J(ids.filter((id) => !Tp.stepTorpedo(mk(id), [{ ...decoy0, id: 2001 }], { eccm: { classifyReject: 0.5, lockMemory: false } }).torpedo.locked)) !== J(half));
    ok("a noisemaker is any source that declares an `sl`: a target WITH `sl` 112 (a boat's level) is classified like a decoy, one without is not; the classifier looks at no other field", (() => { const s = (extra) => !Tp.stepTorpedo(mk(3), [{ ...boat, ...extra }], { eccm: { classifyReject: 1, lockMemory: false } }).torpedo.locked; return s({ sl: 112 }) === true && s({}) === false && s({ sl: NaN }) === false && s({ sl: undefined }) === false; })());
    // ---- lockMemory
    const lm = E({ lockMemory: true }), a1 = stepN(mk(), [boat], 1, { eccm: lm }), a2 = stepN(a1, [boat, decoy], 6, { eccm: lm, t0: 1 });
    ok("!! lock memory: a torpedo that homed on the boat at its first look keeps the boat at the next, though the decoy is 18 dB louder (the line of sight 0.07, the boat's; `lockId` 1) and `stats.held` counts the look (1)", a1.lockId === 1 && a2.lockId === 1 && Math.abs(a2.lastLos.h) < 0.12 && lm.stats.held === 1);
    const nm = E(), b1 = stepN(mk(), [boat], 1, { eccm: nm }), b2 = stepN(b1, [boat, decoy], 6, { eccm: nm, t0: 1 });
    ok("!! without lock memory the same sequence goes to the louder decoy (its line of sight -0.265, within 0.1) and `lockId` becomes 2000: the memory is what held it", Math.abs(b2.lastLos.h - -0.265) < 0.1 && b2.lockId === 2000 && nm.stats.held === undefined);
    const lm2 = E({ lockMemory: true }), c1 = stepN(mk(), [boat], 1, { eccm: lm2 }), c2 = stepN(c1, [decoy], 6, { eccm: lm2, t0: 1 });
    ok("!! a held source that is no longer heard is let go: with only the decoy in the cone the seeker takes it (lockId 2000) and nothing is counted as held", c2.lockId === 2000 && Math.abs(c2.lastLos.h - -0.265) < 0.1 && lm2.stats.held === undefined);
    const lm3 = E({ lockMemory: true }); let d = stepN(mk(), [boat], 1, { eccm: lm3 }); d = stepN(d, [], 6 * 4, { eccm: lm3, t0: 1 });
    ok("!! a lock lost for the seeker's 18 ticks is forgotten: not locked, no command, lockId null (the old rule's `loseLockAfter`)", d.locked === false && d.lockId === null && d.cmd.heading === 0);
    const lm4 = E({ lockMemory: true }); let e4 = stepN(mk(), [boat], 1, { eccm: lm4 }); e4 = stepN(e4, [], 6, { eccm: lm4, t0: 1 });
    ok("!! one empty look does not lose the lock (18 ticks of silence are needed): still locked on the boat and the next look with a louder decoy still holds the boat", e4.locked === true && e4.lockId === 1 && (() => { const f = stepN(e4, [boat, decoy], 6, { eccm: lm4, t0: 7 }); return f.lockId === 1 && lm4.stats.held === 1; })());
    const both = E({ lockMemory: true, classifyReject: 1 }), g1 = stepN(mk(), [boat, decoy], 1, { eccm: both });
    ok("both options together: a recognised decoy is never chosen, and never held either (the boat is the lock)", g1.lockId === 1 && both.stats.rejected === 1);
    const dumb = Tp.stepTorpedo(mk(), [boat, decoy], { seeker: false, eccm: E({ classifyReject: 1, lockMemory: true }) }).torpedo, dumb0 = Tp.stepTorpedo(mk(), [boat, decoy], { seeker: false }).torpedo;
    ok("a dumb torpedo (seeker: false) runs straight whatever `eccm` says (the same position and heading as without it)", J(dumb.pos) === J(dumb0.pos) && dumb.heading === dumb0.heading && dumb.locked === false);
    const noStats = E({ classifyReject: 1, lockMemory: true }); delete noStats.stats;
    ok("`stats` is optional: without it the seeker flies and counts nothing", (() => { const s = stepN(mk(), [boat, decoy], 1, { eccm: noStats }); return s.locked === true && s.lockId === 1; })());
    const tA = stepN(mk(), [boat, decoy], 7, { eccm: E({ lockMemory: true, classifyReject: 0.5 }), seed: 3 }), tB = stepN(mk(), [boat, decoy], 7, { eccm: E({ lockMemory: true, classifyReject: 0.5 }), seed: 3 });
    ok("deterministic: the same steps with the same options and seed give the same torpedo", J(tA) === J(tB));
    ok("an existing torpedo with a lockId that is not in the scene: the seeker takes the loudest (no crash on a stale id)", (() => { const stale = Object.freeze({ ...mk(), lockId: 777 }); const s = Tp.stepTorpedo(stale, [boat, decoy], { eccm: E({ lockMemory: true }) }).torpedo; return s.lockId === 2000; })());
}

console.log("\n3. THE ARENA (brain/subDuel.mjs)");
{
    const side = (en) => () => ({ tactics: en ? C.withCountermeasures(TA.makeTactician(TA.THETA_DEFAULT), C.CM.tactician, en) : TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot(), cm: en ? C.kitOf(en) : null });
    const line = (sd, name, r) => `${sd} ${name} ${r.fingerprint} ${r.score.toFixed(6)} ${r.ticks} ${r.fired} ${r.hits} ${r.fates}`;
    const PINS = ["1 nokit 7d749525 1.851875 2133 4,0 1,0 afloat,sunk", "1 decoy2 f67fbefe 0.000000 7200 4,3 0,0 afloat,afloat", "1 decoy1 7d749525 1.851875 2133 4,0 1,0 afloat,sunk"];
    const mine = []; for (const sd of [1]) for (const [name, ka, kb] of [["nokit", null, null], ["decoy2", { decoy: true }, { decoy: true }], ["decoy1", { decoy: true }, null]]) mine.push(line(sd, name, D.duel(side(ka)(), D.scenario(sd, "patrol"), { opponent: side(kb)() })));
    ok("!! with no seeker the duel is the ORIGINAL code's, to the fingerprint (pins taken from the files before the options existed: seed 1, no kit, a decoy on both, a decoy on one)", J(mine) === J(PINS), mine.join(" | "));
    const sc = D.scenario(2, "patrol"), plain = D.duel(side({ decoy: true })(), sc, { opponent: side({ decoy: true })() }), nul = D.duel(side({ decoy: true })(), sc, { opponent: side({ decoy: true })(), seeker: null });
    ok("!! `seeker: null` is the same duel as omitting it, to the whole result", J(plain) === J(nul) && !("seeker" in plain));
    const sk = { lockMemory: true, classifyReject: 0.5, stats: { rejected: 0, held: 0 } }, withS = D.duel(side({ decoy: true })(), sc, { opponent: side({ decoy: true })(), seeker: sk });
    ok("!! with a seeker whose stats are given the result carries `seeker` with the counts, and they are the object's own (rejected and held both above 0 in a two-sided decoy duel)", "seeker" in withS && withS.seeker.rejected === sk.stats.rejected && withS.seeker.held === sk.stats.held && withS.seeker.rejected > 0 && withS.seeker.held > 0);
    const noStats = D.duel(side({ decoy: true })(), sc, { opponent: side({ decoy: true })(), seeker: { lockMemory: false, classifyReject: 1 } });
    ok("a seeker without stats leaves the result without a `seeker` field", !("seeker" in noStats));
    let hOld = 0, hNew = 0; for (const sd of [1, 2, 3, 4]) { const s4 = D.scenario(sd, "patrol"); hOld += D.duel(side({ decoy: true })(), s4, { opponent: side({ decoy: true })() }).hits.reduce((a, b) => a + b, 0); hNew += D.duel(side({ decoy: true })(), s4, { opponent: side({ decoy: true })(), seeker: { lockMemory: false, classifyReject: 1 } }).hits.reduce((a, b) => a + b, 0); }
    ok("!! the hook hands the seeker to the torpedoes: with a decoy on both boats the old seeker lands 0 hits in four duels (the collapse) and a classifier of 1 lands 4 (pinned)", hOld === 0 && hNew === 4, `old ${hOld}, classifier ${hNew}`);
    const nokitSeeker = D.duel(side(null)(), D.scenario(1, "patrol"), { opponent: side(null)(), seeker: { lockMemory: true, classifyReject: 0.5, stats: { rejected: 0, held: 0 } } });
    ok("with no kit at all a seeker with both options flies the kitless duel (the same fingerprint as without, nothing recognised, nothing held: there is no decoy and one boat)", nokitSeeker.fingerprint === "7d749525" && nokitSeeker.seeker.rejected === 0 && nokitSeeker.seeker.held === 0);
}

console.log("\n4. THE COMMAND (tools/ship/takeSeekerEccm.mjs)");
{
    const geos = X.geometriesOf("smoke"), one = (k, rung) => X.arm(sideOf("X", X.ARMS[k].x), sideOf("Y", X.ARMS[k].y), geos, X.seekerOf(rung));
    const pick = (a) => J({ n: a.n, sunk: a.sunk, to: a.timeouts, xs: a.xSunk, ys: a.ySunk, f: a.fired, h: a.hits, dr: a.decoysReleased, sp: a.spentOnDecoys, m: +a.meanX.toFixed(3), sa: a.seatAWins, st: a.stats });
    const n0 = one("none", 0), b0 = one("both", 0), o0 = one("one", 0), b3 = one("both", 3), o3 = one("one", 3), b1 = one("both", 1);
    ok("!! arm, rung 0, smoke geometries (the old seeker): no kit 8 of 8 sunk (32 torpedoes, 8 hit); a decoy on both 0 sunk, 48 torpedoes, 0 hits, 42 decoys, 24 spent; a decoy on one 7 sunk, all of them Y (the one without)", pick(n0) === '{"n":8,"sunk":8,"to":0,"xs":4,"ys":4,"f":32,"h":8,"dr":0,"sp":0,"m":0.179,"sa":8,"st":null}' && pick(b0) === '{"n":8,"sunk":0,"to":8,"xs":0,"ys":0,"f":48,"h":0,"dr":42,"sp":24,"m":0,"sa":0,"st":null}' && pick(o0) === '{"n":8,"sunk":7,"to":1,"xs":0,"ys":7,"f":39,"h":7,"dr":12,"sp":8,"m":1.499,"sa":4,"st":null}');
    ok("!! arm, rung 3 (a 0.5 classifier) and rung 1 (lock memory): the numbers of the smoke geometries, with the mechanisms' counts (recognised 6628 and 2914; held 2678)", pick(b3) === '{"n":8,"sunk":4,"to":4,"xs":2,"ys":2,"f":44,"h":4,"dr":36,"sp":20,"m":0.079,"sa":4,"st":{"rejected":6628,"held":0}}' && pick(o3) === '{"n":8,"sunk":8,"to":0,"xs":2,"ys":6,"f":37,"h":8,"dr":12,"sp":6,"m":0.936,"sa":6,"st":{"rejected":2914,"held":0}}' && pick(b1) === '{"n":8,"sunk":4,"to":4,"xs":2,"ys":2,"f":46,"h":4,"dr":42,"sp":14,"m":0.009,"sa":0,"st":{"rejected":0,"held":2678}}');
    ok("an arm's fights are the tournament's records (two a geometry, in both seats) and a side against itself has an edge of exactly 0", b0.fights.length === 8 && b0.fights[0].seat === "A" && b0.fights[1].seat === "B" && b0.summary.edge === 0 && n0.summary.edge === 0 && o0.summary.edge !== 0);
    // ---- the rule
    const arm = (sunk, n, xs, ys) => ({ n, sunk, xSunk: xs, ySunk: ys }), P = X.playable;
    ok("!! playable: both-kit sunk exactly 30 percent (about 14.4 of 48 -> 15 is 31%, 14 is 29%) and a one-kit advantage of exactly 25 percent (12 of 48) pass; a hair under either fails", P(arm(15, 48), arm(0, 48, 0, 12)).ok === true && P(arm(14, 48), arm(0, 48, 0, 12)).ok === false && P(arm(15, 48), arm(0, 48, 0, 11)).ok === false && P(arm(3, 10), arm(0, 10, 0, 3)).a === true && P(arm(3, 10), arm(0, 10, 0, 3)).b === true && P(arm(3, 10), arm(0, 10, 1, 3)).b === false);
    ok("playable reads the SIGN of the advantage (the carrier must be sunk less: X sunk 12, Y sunk 0 is -25 percent, not playable) and returns the two numbers", P(arm(30, 48), arm(0, 48, 12, 0)).b === false && J(P(arm(30, 48), arm(0, 48, 0, 24))) === '{"a":true,"b":true,"ok":true,"bothShare":0.625,"advantage":0.5}');
    ok("!! chooseRung is the FIRST playable rung in the list's order (not the best, not the last), and null for none", X.chooseRung([{ rung: 0, play: { ok: false } }, { rung: 1, play: { ok: true } }, { rung: 2, play: { ok: true } }]) === 1 && X.chooseRung([{ rung: 0, play: { ok: false } }]) === null && X.chooseRung([]) === null);
    // ---- the checks
    const mkArm = (o = {}) => ({ n: 8, meanX: 0.1, fired: 10, hits: 2, fights: [{ sx: 1, sy: 1 }], summary: { edge: 0 }, stats: { rejected: 1, held: 1 }, ...o });
    const okArms = { none: mkArm(), both: mkArm(), all3: mkArm() };
    ok("!! checks: all in order at rung 5 (both options on) is []; each failure is named by itself", J(X.checks(okArms, 5)) === "[]" && /non-finite number/.test(X.checks({ ...okArms, both: mkArm({ meanX: NaN }) }, 0)[0]) && /non-finite number/.test(X.checks({ ...okArms, both: mkArm({ hits: Infinity }) }, 0)[0]) && /non-finite score/.test(X.checks({ ...okArms, both: mkArm({ fights: [{ sx: NaN, sy: 1 }] }) }, 0)[0]) && /non-finite score/.test(X.checks({ ...okArms, both: mkArm({ fights: [{ sx: 1, sy: NaN }] }) }, 0)[0]));
    ok("!! checks: a side against itself must have an edge of exactly 0 (none, both and all3 each), not 1e-12; the arms must be the same size; a classifier that recognised nothing, and a lock memory that held nothing, void the read at the rungs that have them (and not at the rungs that do not)", /none is a side against itself/.test(X.checks({ ...okArms, none: mkArm({ summary: { edge: 1e-12 } }) }, 0)[0]) && /both is a side against itself/.test(X.checks({ ...okArms, both: mkArm({ summary: { edge: -0.01 } }) }, 0)[0]) && /all3 is a side against itself/.test(X.checks({ ...okArms, all3: mkArm({ summary: { edge: 0.5 } }) }, 0)[0]) && /same geometries/.test(X.checks({ ...okArms, both: mkArm({ n: 6 }) }, 0).join()) && /did not fire/.test(X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 5 } }) }, 3).join()) && /did not fire/.test(X.checks({ ...okArms, both: mkArm({ stats: { rejected: 5, held: 0 } }) }, 1).join()) && X.checks({ ...okArms, both: mkArm({ stats: null }) }, 0).length === 0 && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 5 } }) }, 1).length === 0 && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 5, held: 0 } }) }, 3).length === 0);
    ok("!! seekerOf's refusal says the whole of itself (the rung and the range of rungs): 'no rung 6 (0 to 5)'", thr(() => X.seekerOf(6)) === "takeSeekerEccm.seekerOf: no rung 6 (0 to 5)" && thr(() => X.seekerOf(-1)) === "takeSeekerEccm.seekerOf: no rung -1 (0 to 5)");
    ok("!! an arm's fights carry the tournament's fields: the fates, the sinkings and the ticks (geometry 1 at rung 0 with a decoy on both: afloat and afloat, timed out at 7200 ticks in both seats; with the decoy on one boat at rung 3: X afloat, Y sunk by X, in 2133 ticks in seat A and 7083 in seat B, then geometry 2)", J(b0.fights.slice(0, 2).map((f) => [f.seed, f.seat, f.statusX, f.statusY, f.xKilledY, f.yKilledX, f.ticks])) === '[[1,"A","afloat","afloat",false,false,7200],[1,"B","afloat","afloat",false,false,7200]]' && J(o3.fights.slice(0, 4).map((f) => [f.seed, f.seat, f.statusX, f.statusY, f.xKilledY, f.yKilledX, f.ticks])) === '[[1,"A","afloat","sunk",true,false,2133],[1,"B","afloat","sunk",true,false,7083],[2,"A","afloat","sunk",true,false,1617],[2,"B","afloat","sunk",true,false,6520]]');
    ok("!! the checks say their whole sentences (the arm, the number, what failed)", X.checks({ ...okArms, both: mkArm({ meanX: NaN }) }, 0)[0] === "the arm both has a non-finite number" && X.checks({ ...okArms, both: mkArm({ fights: [{ sx: NaN, sy: 1 }] }) }, 0)[0] === "the arm both has a non-finite score" && X.checks({ ...okArms, none: mkArm({ summary: { edge: 1e-12 } }) }, 0)[0] === "the arm none is a side against itself and its edge is 1e-12, not exactly 0" && X.checks({ ...okArms, both: mkArm({ n: 6 }) }, 0)[0] === "the arms did not fly the same geometries" && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 5 } }) }, 3)[0] === "classifyReject is above 0 and no decoy was recognised in the decoy arm: the mechanism did not fire" && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 5, held: 0 } }) }, 1)[0] === "lockMemory is on and no look was held in the decoy arm: the mechanism did not fire");
    ok("!! the mechanism checks at their edge: ONE recognised decoy (rejected 1) satisfies the classifier check at rung 3, ONE held look (held 1) satisfies the lock-memory check at rung 1, and neither complains at the rung that has the other option only", X.checks({ ...okArms, both: mkArm({ stats: { rejected: 1, held: 0 } }) }, 3).length === 0 && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 1 } }) }, 1).length === 0 && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 0 } }) }, 0).length === 0 && X.checks({ ...okArms, both: mkArm({ stats: { rejected: 0, held: 1 } }) }, 2).length === 1);
    // ---- the output of the smoke calibration, to the byte
    const lines = []; const code = X.command(["dev", "--set", "smoke"], { log: (s) => lines.push(s), write: () => { throw new Error("must not write"); } });
    const out = lines.join("\n") + "\n";
    ok("!! the smoke calibration prints the header, six rungs of four lines each, and the rule's choice (rung 1 on these four geometries: lock memory is playable here); exit 0; the whole output to the byte (sha256)", code === 0 && lines.length === 1 + 6 * 5 + 1 && /^\[takeSeekerEccm\] DEV calibration, set smoke \(geometries 1 to 4, both seats: 8 duels an arm\)/.test(lines[0]) && lines[lines.length - 1] === "  RESULT: the task is rung 1 (the first playable one)" && sha(out) === "cdd38a13358f548127f9ddccf761b0026b336751d474ca8f7f01fddd1b7b2ea4", sha(out));
    const bad = []; const c2 = X.command(["dev", "--set", "held"], { log: (s) => bad.push(s) }), c3 = X.command(["dev", "--set", "smoke", "--write"], { log: (s) => bad.push(s) }), c4 = X.command([], { log: (s) => bad.push(s) }), c5 = X.command(["held"], { log: (s) => bad.push(s) }), c6 = X.command(["held", "--rung", "9", "--write"], { log: (s) => bad.push(s) }), c7 = X.command(["held", "--rung", "2"], { log: (s) => bad.push(s) }), c8 = X.command(["held", "--rung", "", "--write"], { log: (s) => bad.push(s) }), c9 = X.command(["held", "--rung", "x", "--write"], { log: (s) => bad.push(s) });
    ok("!! refusals: the HELD set through `dev` is refused (it is read by `held`, once); --write on the smoke set is refused; no argument prints the usage; held without --rung, with an empty or non-numeric one, or with a rung of 9 is refused; held on the real HELD set WITHOUT --write is refused before anything is flown (all exit 2, in a blink)", [c2, c3, c4, c5, c6, c7, c8, c9].every((c) => c === 2) && /--set is smoke or dev, not "held"/.test(bad[0]) && /--write is for the dev set/.test(bad[1]) && /^usage:/.test(bad[2]) && /needs --rung N, N one of 0 to 5/.test(bad[3]) && /needs --rung N/.test(bad[4]) && /run held with --write/.test(bad[5]) && /needs --rung N/.test(bad[6]) && /needs --rung N/.test(bad[7]) && bad.length === 8);
    // ---- held, through the override that flies the smoke geometries
    const wrote = [], hl = []; const h1 = X.command(["held", "--rung", "3", "--write"], { heldSet: "smoke", log: (s) => hl.push(s), exists: () => false, write: (f, s) => wrote.push([f, s]) });
    const parsed = wrote.length === 1 ? JSON.parse(wrote[0][1]) : null;
    ok("!! held (through the override, on the smoke geometries, never the HELD set): five arms printed (none, both, one, all3, old), the rule at the rung, the file written once to brain/subEccmHeld.json with rung 3, the set, the rule and every arm's numbers", h1 === 0 && wrote.length === 1 && wrote[0][0] === "brain/subEccmHeld.json" && parsed.rung === 3 && parsed.set === "smoke" && J(Object.keys(parsed.arms)) === '["none","both","one","all3","bothOld"]' && parsed.arms.both.sunk === 4 && parsed.arms.bothOld.sunk === 0 && /^\[takeSeekerEccm\] HELD read, rung 3 \(lockMemory off, classifyReject 0.5\), geometries 1 to 4/.test(hl[0]) && hl.length === 1 + 5 + 1 + 1 && /written brain\/subEccmHeld.json$/.test(hl[hl.length - 1]), hl.length + " lines");
    const w2 = [], r2 = X.command(["held", "--rung", "3", "--write"], { heldSet: "smoke", log: (s) => w2.push(s), exists: () => true, write: () => { throw new Error("must not write"); } });
    ok("!! a second held read is refused when the file exists (exit 2, nothing flown or written: the one-read rule)", r2 === 2 && /exists; the HELD set is read once/.test(w2[0]) && w2.length === 1);
    // ---- the dev write, the held rungs and the injected failure, through the overrides that fly the smoke geometries
    const dw = [], dl2 = []; const cdw = X.command(["dev", "--write"], { devSet: "smoke", log: (s) => dl2.push(s), write: (f, s) => dw.push([f, s]) }), pdw = dw.length === 1 ? JSON.parse(dw[0][1]) : null;
    ok("!! `dev --write` through the override (smoke geometries): exit 0, the file brain/subEccmDev.json written once, pretty-printed with an indent of ONE space, with the set, the choice (1), the rule and the six rungs' rows; the log ends with the `written` line (33 lines)", cdw === 0 && dw.length === 1 && dw[0][0] === "brain/subEccmDev.json" && dw[0][1].startsWith('{\n "set": "smoke",\n "chosen": 1,\n "rule": {\n  "bothSunk": 0.3,') && dw[0][1].endsWith("}\n") && pdw.rows.length === 6 && pdw.chosen === 1 && dl2.length === 33 && dl2[32] === "  written brain/subEccmDev.json");
    const hw = [], hl2 = []; const ch3 = X.command(["held", "--rung", "3", "--write"], { heldSet: "smoke", log: (s) => hl2.push(s), exists: () => false, write: (f, s) => hw.push([f, s]) });
    ok("!! held at rung 3 through the override: 8 lines to the byte (sha256), the written file indented by ONE space with the rung and the set", ch3 === 0 && hl2.length === 8 && sha(hl2.join("\n") + "\n") === "00f4c8548c03ec9ee0e031d942b3ebe8a7faccf43af652aa8bda3879b97c9920" && hw[0][1].startsWith('{\n "rung": 3,\n "set": "smoke",\n "rule"'));
    const h0 = [], c0 = X.command(["held", "--rung", "0", "--write"], { heldSet: "smoke", log: (s) => h0.push(s), exists: () => false, write: () => {} }), h6 = [], cr6 = X.command(["held", "--rung", "6", "--write"], { heldSet: "smoke", log: (s) => h6.push(s), exists: () => false, write: () => { throw new Error("must not write"); } }), hn = [], cn = X.command(["held", "--rung", "0"], { heldSet: "smoke", log: (s) => hn.push(s), write: () => { throw new Error("must not write"); } });
    ok("!! held at its rung edges: rung 0 is ACCEPTED (the old seeker's own read), rung 6 is REFUSED by name (not run into the ladder's error); held with the override and WITHOUT --write flies the smoke geometries, prints and writes nothing", c0 === 0 && /HELD read, rung 0 \(lockMemory off, classifyReject 0\)/.test(h0[0]) && cr6 === 2 && h6.length === 1 && /needs --rung N, N one of 0 to 5/.test(h6[0]) && cn === 0 && hn.length === 7);
    const ex = [], cex = X.command(["dev", "--set", "smoke"], { checks: () => ["boom"], log: (s) => ex.push(s) }), exh = [], cexh = X.command(["held", "--rung", "2", "--write"], { heldSet: "smoke", checks: () => ["boom"], log: (s) => exh.push(s), exists: () => false, write: () => {} });
    ok("!! a failed check is NOT WEIGHED and sets the exit code: dev prints it on every rung's rule line and exits 1; held prints the line and exits 1 (a passing check exits 0, shown above)", cex === 1 && ex.filter((l) => /->  (PLAYABLE|not playable)   CHECKS FAILED, NOT WEIGHED: boom$/.test(l)).length === 6 && cexh === 1 && exh.some((l) => l === "    CHECKS FAILED, NOT WEIGHED: boom") === false && exh.some((l) => /->  (PLAYABLE|not playable)\n    CHECKS FAILED, NOT WEIGHED: boom$/.test(l)));
    // ---- as a program
    const prog = fileURLToPath(new URL("../tools/ship/takeSeekerEccm.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, [...flags, "dev", "--set", "bogus"], { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 60000 }), pc = spawnSync(process.execPath, [...flags, "held", "--rung", "3"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): a bad --set exits 2, no argument exits 2 with the usage, held without --write exits 2 -- and none of them flew a set", pa.status === 2 && /--set is smoke or dev, not "bogus"/.test(pa.stdout) && pb.status === 2 && /^usage:/.test(pb.stdout) && pc.status === 2 && /run held with --write/.test(pc.stdout), [pa.status, pb.status, pc.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the command sets no exit code", process.exitCode === undefined);
}

console.log("\n5. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("../tools/ship/takeSeekerEccm.mjs", import.meta.url), "utf8"), tor = fs.readFileSync(new URL("../physics/mechanics/subTorpedo.mjs", import.meta.url), "utf8"), duel = fs.readFileSync(new URL("./subDuel.mjs", import.meta.url), "utf8"), reg = fs.readFileSync(new URL("./SUB_ECCM_WIP.md", import.meta.url), "utf8");
    const code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    ok("!! the command and the torpedo have no clock and no Math.random (the seeker's draw is a hash of the seed and two ids)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)) && !/Math\.random|Date\.now|new Date|performance\.now/.test(code(tor)));
    ok("the headers name the registration, the command and the gate, and the files are ASCII", /SUB_ECCM_WIP\.md/.test(cmd) && /subEccm-selfcheck\.mjs/.test(cmd) && /SUB_ECCM_WIP\.md/.test(tor) && /SUB_ECCM_WIP\.md/.test(duel) && ![cmd, tor, duel].some((t) => /[^\x00-\x7F]/.test(t)));
    const rows = [...reg.matchAll(/^\| `(lockMemory|classifyReject)` \| ([^\n]*) \|$/gm)].map((m) => [m[1], m[2].split("|").map((c) => c.trim())]);
    const lock = rows.find((r) => r[0] === "lockMemory")[1], rej = rows.find((r) => r[0] === "classifyReject")[1];
    ok("!! the registration's ladder table equals the code's six rungs (lock memory on exactly at rungs 1 and 5; the classifier 0, 0, 0.25, 0.5, 0.75, 0.5)", lock.join() === "off,on,off,off,off,on" && rej.join() === X.LADDER.map((l) => l.classifyReject).join() && lock.map((v) => v === "on").join() === X.LADDER.map((l) => l.lockMemory).join());
    ok("the registration carries Amendment A, the sets (91001, 93001), the 30 and 25 percent of the rule, and the forecasts", /AMENDMENT A/.test(reg) && /91001 to 91024/.test(reg) && /93001 to 93024/.test(reg) && /\*\*30 percent\*\*/.test(reg) && /\*\*25 percent of the duels more\*\*/.test(reg) && /Forecasts, written before any geometry is flown/.test(reg));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
