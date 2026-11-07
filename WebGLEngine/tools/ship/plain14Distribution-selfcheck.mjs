// WebGLEngine/tools/ship/plain14Distribution-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plain14Distribution-selfcheck.mjs      (about 3 s)
//
// THE GATE OF tools/ship/plain14Distribution.mjs (+ plain14DistributionCmd.mjs): the report of round 7, stage 1, registered in brain/PLAIN14_DISTRIBUTION_WIP.md before any seed was trained. It trains nothing and flies nothing; every dump here is built by this gate, except the one row that reads the SHAPE of a real dump (a trimmed copy of a one-run smoke dump the trainer wrote, whose numbers mean nothing).
//   1  THE CONSTANTS   the seeds (6310 to 6400, ten), the base recipe (the trainer's own RECIPE plus slice 1), the three audits and the one the reading is made on, alpha 0.05, the floor of 8 champions, the tolerance of the environment check; the three bottom-line phrases are the registration's words.
//   2  THE RANK-SUM    uCounts against an enumeration of every arrangement (small sizes) and against a second, independent construction (the Gaussian binomial as a product of polynomials, 10 against 10); pAtLeast; `above` is strict; readAudit at both edges of alpha (3 against 3 is exactly 0.05) and at the critical U of 10 against 10 (one pair either side).
//   3  THE DUMPS       parseDump refuses by its words; drawOf reads a dump made by the trainer's own dumpOf, a champion-less dump, a dump missing an audit, a failing verdict.
//   4  THE CHECKS      all four pass on a good set, word for word; each fails by its words: SEEDS (twice, missing, extra, a circuit that is neither), RECIPE (each of the five fields), ONE ENVIRONMENT (each audit, the tolerance exactly, no numbers at all), CHAMPIONS (seven fail, eight pass).
//   5  THE REPORT      word for word at the three readings (BEATS, IS BELOW, CANNOT BE TOLD APART), the failed-check shape (first line, NOT WEIGHED, no reading), the draws without a champion left out.
//   6  THE COMMAND     the arguments and their refusals, the directory and its files (only fly<S>.json and plain<S>.json are read), a name that does not say what the dump records, the real file system through the default seams and the command line as a child process.
// NOT CHECKED, said plainly: a real set of twenty dumps (none exists yet; the rig makes them); that the dumps were made on one machine (the check compares the autopilot's numbers, which is a proxy).
//
// SABOTAGE LOG (2026-11-07), tools/ship/plain14Distribution.mjs -- 293 mutants: 253 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 40 by hand (the reading on the audit and not the safety audit, the BEATS and IS BELOW labels swapped, the lower tail taken in the fly's direction, floor for ceil, ties counted for the tested arm, alpha 0.049 / 0.06, the exponent threshold of the p print, the tolerance 1e-8 / 1e-10, the floor of champions 7 / 9, a seed step of 20, each field of the recipe check dropped, an audit dropped from the environment check, the check that passes with no autopilot numbers, the reading continuing after a failed check, the name-and-seed and circuit checks removed, the trailing slash kept, the listing unsorted, the file pattern unanchored at either end, and others), plus 2 of plain14DistributionCmd.mjs; each applied to an isolated tree (a tree of symlinks with the target written as a real file) and this gate run; the file restored (sha256 f16f79f6... identical before and after).
//   FIRST PASS (86 rows): lib 259 red, 28 threw, 6 went 0 red; Cmd 2 red. THE SIX were shapes tested and not contents: the header of the report counts each arm by its own circuit (ten against ten hid a swap of the two), the QUALIFY count over the champions (no test had a draw with a verdict ok and no champion), two different duplicate seeds named (only one had been tried), a recipe of null (the parseDump clause for a missing recipe), and the memo key of the rank-sum (a and b run together: harmless for the ten-by-ten of the real run, because the count array of a-by-b equals b-by-a's, but 11 by 12 reaches the collision of 1,12 against 11,2). Rows were written for each (the last of them guards the function and not the run). SECOND PASS: the six re-run against the new gate (90 rows): six red. None remains. No mutant was argued equivalent.
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./plain14Distribution.mjs";
import * as T from "./trainSubPilot.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
console.log("plain14Distribution-selfcheck -- the report of round 7, stage 1\n");

// ---- builders: a dump the way tools/ship/trainSubPilot.mjs dumpOf writes it
const sc = (score) => ({ score, crashed: 0, byKind: { nominal: score, recovery: score, current: score } });
const AUTO = { audit: -0.4956, safetyAudit: -0.5564, reserve: -0.5146 };
const mkDump = (arm, seed, { scores = { audit: -0.3, safetyAudit: -0.4, reserve: -0.35 }, auto = AUTO, recipe = {}, ok: vok = true, champ = true } = {}) => ({
    recipe: { circuit: arm, runs: 4, iters: 400, seed, sigma: 0.3, maxK: 4, slice: 1, ...recipe },
    champion: champ ? seed : null, verdict: { ok: vok, reasons: vok ? [] : ["x"] },
    auto: { heldOut: sc(-0.48), pool: { n: 500, crashed: [] }, audit: auto ? sc(auto.audit) : null, safetyAudit: auto ? sc(auto.safetyAudit) : null, reserve: auto ? sc(auto.reserve) : null },
    champ: champ ? { seed, audit: sc(scores.audit), safetyAudit: sc(scores.safetyAudit), reserve: sc(scores.reserve), auditVs: { n: 36 }, safetyVs: { n: 500 } } : null, runs: [] });
const draw = (arm, seed, o) => P.drawOf(mkDump(arm, seed, o), (arm === "fly" ? "fly" : "plain") + seed + ".json");
/** twenty draws; `fly(i)` and `plain(i)` give the safety score of the i-th seed; the other two audits follow it. */
const field = (flyS, plainS, over = {}) => P.SEEDS.flatMap((s, i) => [
    draw("fly", s, { scores: { audit: flyS(i) + 0.1, safetyAudit: flyS(i), reserve: flyS(i) - 0.05 }, ...(over.fly ? over.fly(i) : {}) }),
    draw("plain14", s, { scores: { audit: plainS(i) + 0.1, safetyAudit: plainS(i), reserve: plainS(i) - 0.05 }, ...(over.plain ? over.plain(i) : {}) })]);

// ---- an independent rank-sum: the Gaussian binomial [n1+n2 choose n1]_q as a product of polynomials, no recursion on the counts
function gaussian(n1, n2) {
    const mul = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
    const geo = (m) => new Array(m).fill(1);                       // 1 + q + ... + q^(m-1) = (1-q^m)/(1-q)
    const div = (num, den) => { const r = num.slice(), q = new Array(num.length - den.length + 1).fill(0); for (let i = q.length - 1; i >= 0; i--) { q[i] = r[i + den.length - 1] / den[den.length - 1]; den.forEach((d, j) => { r[i + j] -= q[i] * d; }); } return q; };
    let num = [1], den = [1];
    for (let i = 1; i <= n1; i++) { num = mul(num, geo(n2 + i)); den = mul(den, geo(i)); }
    return div(num, den).map(Math.round);
}
const brute = (n1, n2) => { const n = n1 + n2, out = new Array(n1 * n2 + 1).fill(0); for (let m = 0; m < (1 << n); m++) { let bits = 0, ranksSum = 0, r = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) { bits++; ranksSum += i; } if (bits !== n1) continue; out[ranksSum - (n1 * (n1 - 1)) / 2]++; } return out; };

sec("1. THE CONSTANTS");
{
    ok("!! the seeds are the ten the rig loop is handed (6310, 6320, ... 6400), in order, and the list is frozen", J(P.SEEDS) === J([6310, 6320, 6330, 6340, 6350, 6360, 6370, 6380, 6390, 6400]) && Object.isFrozen(P.SEEDS));
    const reg = fs.readFileSync(path.join(ENG, "brain", "PLAIN14_DISTRIBUTION_WIP.md"), "utf8");
    ok("!! the seeds are those of the loop printed in the registration (the PowerShell loop names 6310 to 6400)", /foreach \(\$s in 6310,6320,6330,6340,6350,6360,6370,6380,6390,6400\)/.test(reg));
    ok("!! the arms are fly and plain14 and the file prefixes fly and plain (the names the loop writes)", J(P.ARMS) === J(["fly", "plain14"]) && P.PREFIX.fly === "fly" && P.PREFIX.plain14 === "plain" && Object.isFrozen(P.ARMS) && /plain\$s\.json/.test(reg) && /fly\$s\.json/.test(reg));
    ok("!! the base recipe is the trainer's own (runs, iterations, sigma, maxK from tools/ship/trainSubPilot.mjs RECIPE) and slice 1, and nothing else", J(P.RECIPE) === J({ runs: T.RECIPE.runs, iters: T.RECIPE.iters, sigma: T.RECIPE.sigma, maxK: T.RECIPE.maxK, slice: 1 }) && P.RECIPE.runs === 4 && P.RECIPE.iters === 400 && P.RECIPE.sigma === 0.3 && P.RECIPE.maxK === 4 && Object.isFrozen(P.RECIPE));
    ok("!! the audits are audit, safetyAudit, reserve; the reading is made on the safety audit; alpha is 0.05; the floor is 8 champions; the tolerance of the environment check is 1e-9", J(P.AUDITS) === J(["audit", "safetyAudit", "reserve"]) && P.READ_ON === "safetyAudit" && P.ALPHA === 0.05 && P.MIN_DRAWS === 8 && P.TOL === 1e-9);
    ok("!! the committed autopilot numbers (history, not a check) are the sub notes' -0.4956 / -0.5564 / -0.5146", P.COMMITTED_AUTOPILOT.audit === -0.4956 && P.COMMITTED_AUTOPILOT.safetyAudit === -0.5564 && P.COMMITTED_AUTOPILOT.reserve === -0.5146);
    ok("!! the three bottom lines are the registration's words, each once as the phrase the verdict prints", ["THE FLY'S WIRING BEATS ITS PLAIN CONTROLS", "THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS", "THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS"].every((p) => reg.includes(p)));
}

sec("2. THE RANK-SUM");
{
    ok("!! uCounts for 3 against 3 is the known [1,1,2,3,3,3,3,2,1,1] (20 arrangements) and for 1 against 1 is [1,1]", J(P.uCounts(3, 3)) === J([1, 1, 2, 3, 3, 3, 3, 2, 1, 1]) && J(P.uCounts(1, 1)) === J([1, 1]) && J(P.uCounts(2, 1)) === J([1, 1, 1]));
    const sizes = [[1, 2], [2, 2], [2, 3], [3, 2], [3, 4], [4, 3], [4, 4], [5, 3], [5, 5], [6, 4]];
    ok("!! uCounts equals the enumeration of every arrangement of ranks, for ten sizes (the pairs counted as 'a member of the first above a member of the second')", sizes.every(([a, b]) => J(P.uCounts(a, b)) === J(brute(a, b))), sizes.map(([a, b]) => a + "x" + b).join(" "));
    ok("!! uCounts equals the Gaussian binomial (an independent construction) for 8x8, 8x10, 10x8, 10x10, 11x11, 12x9 and 11x12 (11x12 is the smallest size where a memo key of a and b run together collides harmfully: 1,12 against 11,2; the ten-by-ten of the real run never reaches it, so this row guards the function and not the run), and the 10x10 counts total 184756 with 1 at each end", [[8, 8], [8, 10], [10, 8], [10, 10], [11, 11], [12, 9], [11, 12]].every(([a, b]) => J(P.uCounts(a, b)) === J(gaussian(a, b))) && P.uCounts(10, 10).reduce((s, x) => s + x, 0) === 184756 && P.uCounts(10, 10)[0] === 1 && P.uCounts(10, 10)[100] === 1 && P.uCounts(10, 10).length === 101);
    ok("!! with one group empty there is one arrangement and U is 0", J(P.uCounts(0, 5)) === J([1]) && J(P.uCounts(5, 0)) === J([1]));
    ok("!! pAtLeast: 1 at U = 0 and below, 1/20 at the top of 3x3, the tail sum of 3x3 at U = 6 (7/20), a fractional U is rounded UP (2.5 reads as 3), and 1/184756 at the top of 10x10", P.pAtLeast(0, 3, 3) === 1 && P.pAtLeast(-4, 3, 3) === 1 && P.pAtLeast(9, 3, 3) === 1 / 20 && P.pAtLeast(6, 3, 3) === 7 / 20 && P.pAtLeast(2.5, 3, 3) === P.pAtLeast(3, 3, 3) && P.pAtLeast(2.5, 3, 3) === 16 / 20 && P.pAtLeast(100, 10, 10) === 1 / 184756 && P.pAtLeast(101, 10, 10) === 0);
    ok("!! `above` counts the pairs strictly: a tie counts for no one (equal arrays give 0 both ways), and [3,1] over [2] is 1", P.above([1, 1], [1, 1]) === 0 && P.above([1, 2], [1, 2]) === 1 && P.above([3, 1], [2]) === 1 && P.above([5, 6], [1, 2, 3]) === 6 && P.above([], [1]) === 0 && P.above([1], []) === 0);
    ok("!! meanOf: the mean, and 0 for an empty list", P.meanOf([1, 2, 6]) === 3 && P.meanOf([]) === 0);
    const b33 = P.readAudit([4, 5, 6], [1, 2, 3]), w33 = P.readAudit([1, 2, 3], [4, 5, 6]);
    ok("!! alpha is INCLUSIVE: 3 against 3 fully separated has p exactly 0.05 and reads BEATS (fly above) or IS BELOW (fly below), not TIES", b33.pHigher === 0.05 && b33.reading === "BEATS" && w33.pLower === 0.05 && w33.reading === "IS BELOW" && b33.pLower === 1 && w33.pHigher === 1);
    const plain = Array.from({ length: 10 }, (_, i) => i + 1);
    const flyU = (target) => { const k = Array(10).fill(0); let left = target; for (let i = 9; i >= 0 && left > 0; i--) { k[i] = Math.min(10, left); left -= k[i]; } return k.map((x) => x + 0.5); };
    const counts = P.uCounts(10, 10), total = 184756; let crit = 100, tail = 0; for (let u = 100; u >= 0; u--) { tail += counts[u]; if (tail / total > 0.05) break; crit = u; }
    const atCrit = P.readAudit(flyU(crit), plain), below = P.readAudit(flyU(crit - 1), plain);
    ok("!! at the critical U of 10 against 10 (" + crit + ") the fly BEATS and one pair less (" + (crit - 1) + ") it TIES; the same mirrored for IS BELOW; U is built from the data (above() gives " + P.above(flyU(crit), plain) + ")", P.above(flyU(crit), plain) === crit && P.above(flyU(crit - 1), plain) === crit - 1 && atCrit.reading === "BEATS" && atCrit.pHigher <= 0.05 && below.reading === "TIES" && below.pHigher > 0.05 && P.readAudit(plain, flyU(crit)).reading === "IS BELOW" && P.readAudit(plain, flyU(crit - 1)).reading === "TIES");
    const all = P.readAudit(plain.map((x) => x + 100), plain), rev = P.readAudit(plain, plain.map((x) => x + 100)), same = P.readAudit(plain, plain), flat = P.readAudit(Array(10).fill(5), Array(10).fill(5));
    ok("!! fully separated 10 against 10 reads BEATS with p = 1/184756 (and the other side 1), reversed reads IS BELOW, identical lists read TIES, and lists of one repeated value read TIES with p = 1 both ways (ties count against the arm tested)", all.reading === "BEATS" && all.pHigher === 1 / 184756 && all.pLower === 1 && rev.reading === "IS BELOW" && rev.pLower === 1 / 184756 && rev.pHigher === 1 && same.reading === "TIES" && same.pHigher === P.pAtLeast(45, 10, 10) && same.pHigher > 0.05 && same.pHigher === same.pLower && flat.reading === "TIES" && flat.pHigher === 1 && flat.pLower === 1);
    const r = P.readAudit([1, 2, 3, 4], [10, 20, 30]);
    ok("!! readAudit reports the sizes, the means and their difference (fly minus plain), in the right fields", r.nFly === 4 && r.nPlain === 3 && r.meanFly === 2.5 && r.meanPlain === 20 && r.diff === -17.5 && Object.keys(r).sort().join() === "diff,meanFly,meanPlain,nFly,nPlain,pHigher,pLower,reading");
}

sec("3. THE DUMPS");
{
    ok("!! parseDump refuses what is not JSON, a null, a number, a list, a dump with no recipe, a dump with no autopilot, a recipe that is not an object, each with the file's name and its words", msg(() => P.parseDump("{nope", "a.json")) === "plain14Distribution.parseDump: a.json is not JSON" && msg(() => P.parseDump("null", "b.json")) === "plain14Distribution.parseDump: b.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump("5", "c.json")) === "plain14Distribution.parseDump: c.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump("[]", "d.json")) === "plain14Distribution.parseDump: d.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump(J({ auto: {} }), "e.json")) === "plain14Distribution.parseDump: e.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump(J({ recipe: {} }), "f.json")) === "plain14Distribution.parseDump: f.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump(J({ recipe: 3, auto: {} }), "g.json")) === "plain14Distribution.parseDump: g.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump(J({ recipe: null, auto: {} }), "h.json")) === "plain14Distribution.parseDump: h.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)" && msg(() => P.parseDump(J({ recipe: {}, auto: null }), "i.json")) === "plain14Distribution.parseDump: i.json is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)");
    const d = mkDump("fly", 6310);
    ok("!! parseDump returns the object itself, parsed", J(P.parseDump(J(d), "x")) === J(d));
    // the trainer's own dumpOf, on a stand-in result (the shape a real run has)
    const cs = (s) => ({ score: s, crashed: 0, byKind: { nominal: s } });
    const result = { champion: { seed: 6311, audit: cs(-0.3), safetyAudit: cs(-0.4), reserve: cs(-0.35), auditVs: { n: 36 }, safetyVs: { n: 500 }, weights: new Float32Array([0.5]) }, verdict: { ok: true, reasons: [] }, runs: [{ k: 1, seed: 6311, trainScore: -0.4, heldOut: cs(-0.4), pool: {}, eligible: true, kept: [], moved: 1, weights: new Float32Array([0.5]) }], auto: { heldOut: cs(-0.48), poolTails: { n: 500 }, audit: cs(-0.4956), safetyAudit: cs(-0.5564), reserve: cs(-0.5146) } };
    const dump = T.dumpOf(result, { circuit: "plain14", runs: 4, iters: 400, seed: 6310, sigma: 0.3, maxK: 4, slice: 1 });
    const dr = P.drawOf(P.parseDump(J(dump), "plain6310.json"), "plain6310.json");
    ok("!! drawOf reads a dump the TRAINER's dumpOf wrote (circuit, seed, recipe, the champion's three scores, the autopilot's three, the verdict)", dr.name === "plain6310.json" && dr.arm === "plain14" && dr.seed === 6310 && dr.recipe.iters === 400 && dr.champion === true && dr.qualifies === true && J(dr.scores) === J({ audit: -0.3, safetyAudit: -0.4, reserve: -0.35 }) && J(dr.auto) === J({ audit: -0.4956, safetyAudit: -0.5564, reserve: -0.5146 }));
    // a trimmed copy of a real one-run smoke dump (plain14, seed 6310, 2 iterations): the shape on disk
    const real = { recipe: { circuit: "plain14", runs: 1, iters: 2, seed: 6310, sigma: 0.3, maxK: 4, slice: 40 }, champion: 6310, verdict: { ok: false, reasons: ["held-out score -0.4877 does not beat the autopilot's -0.4877"] }, auto: { heldOut: { score: -0.48773965825439797, crashed: 0, byKind: {} }, pool: { n: 500, crashed: [] }, audit: { score: -0.4952053837957793, crashed: 0, byKind: {} }, safetyAudit: { score: -0.5560549073564853, crashed: 0, byKind: {} }, reserve: { score: -0.5142817602107425, crashed: 0, byKind: {} } }, champ: { seed: 6310, audit: { score: -0.4952053837957793, crashed: 0, byKind: {} }, safetyAudit: { score: -0.5560549073564853, crashed: 0, byKind: {} }, reserve: { score: -0.5142817602107425, crashed: 0, byKind: {} }, auditVs: { n: 36 }, safetyVs: { n: 500 } }, runs: [] };
    const rr = P.drawOf(P.parseDump(J(real), "plain6310.json"), "plain6310.json");
    ok("!! drawOf on the shape of a real smoke dump: the champion's scores are the autopilot's (the search moved nothing), the verdict is not ok, so qualifies is false and the draw still has a champion", rr.champion === true && rr.qualifies === false && rr.scores.safetyAudit === -0.5560549073564853 && rr.auto.reserve === -0.5142817602107425);
    const direct = mkDump("fly", 6321); direct.champ.audit.score = NaN; const dinf = mkDump("fly", 6322); dinf.champ.reserve.score = Infinity; const dstr = mkDump("fly", 6323); dstr.champ.safetyAudit.score = "-0.4";
    ok("!! a NaN, an Infinity or a string where a score should be (not through JSON) is not a finite score: no champion", P.drawOf(direct, "x").champion === false && P.drawOf(dinf, "x").champion === false && P.drawOf(dstr, "x").champion === false);
    const none = P.drawOf(mkDump("fly", 6320, { champ: false, ok: false }), "fly6320.json");
    ok("!! a dump with no champion (champ null) is a draw with champion false and scores null, its autopilot numbers still read", none.champion === false && none.scores === null && none.auto.safetyAudit === -0.5564 && none.qualifies === false);
    const miss = mkDump("fly", 6330); delete miss.champ.reserve.score; const dm = P.drawOf(miss, "fly6330.json");
    const nan = mkDump("fly", 6340); nan.champ.audit.score = NaN; const dn = P.drawOf(JSON.parse(J(nan)), "fly6340.json");
    const nul = mkDump("fly", 6350); nul.champ.safetyAudit = null; const dl = P.drawOf(nul, "fly6350.json");
    ok("!! one audit of the champion missing (no score, a NaN that JSON turns to null, the object null) is NOT a champion: it cannot be read on all three", dm.champion === false && dn.champion === false && dl.champion === false && dm.scores !== undefined);
    const noauto = mkDump("fly", 6360, { auto: null }), da = P.drawOf(noauto, "fly6360.json"), part = mkDump("fly", 6370); part.auto.reserve = null; const dp = P.drawOf(part, "fly6370.json");
    ok("!! an autopilot with a missing audit (all three null, or only the reserve null) is auto null, and the champion is still a champion", da.auto === null && da.champion === true && dp.auto === null && dp.champion === true);
    const vo = draw("fly", 6310, { ok: true }), vb = draw("fly", 6310, { ok: false }), v0 = P.drawOf({ ...mkDump("fly", 6310), verdict: null }, "x");
    ok("!! qualifies is the trainer's verdict.ok: true, false, and false when there is no verdict", vo.qualifies === true && vb.qualifies === false && v0.qualifies === false);
}

sec("4. THE CHECKS");
{
    const good = field((i) => -0.4 + 0.001 * i, (i) => -0.41 + 0.001 * i), cs = P.checksOf(good), by = (rows, n) => rows.find((r) => r.name === n);
    ok("!! on a good set the four checks come in this order, all pass", cs.map((c) => c.name).join() === "SEEDS,RECIPE,ONE ENVIRONMENT,CHAMPIONS" && cs.every((c) => c.ok));
    ok("!! the four passing texts, word for word", cs[0].text === "ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" && cs[1].text === "every dump trained by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)" && cs[2].text === "all 20 dumps carry the same autopilot numbers (audit -0.4956, safety -0.5564, reserve -0.5146; the committed note's are -0.4956, -0.5564, -0.5146, history and not a check)" && cs[3].text === "at least 8 draws of each arm have a champion (fly 10, plain14 10)", cs.map((c) => c.text).join(" | "));
    const dupe = good.filter((d) => !(d.arm === "fly" && d.seed === 6400)).concat([draw("fly", 6310), draw("fly", 6310)]);
    ok("!! SEEDS: a seed twice (and the seed it displaced missing) is named for the arm", by(P.checksOf(dupe), "SEEDS").ok === false && by(P.checksOf(dupe), "SEEDS").text === "fly has seed 6310 twice; fly is missing seed 6400");
    const dup2 = good.filter((d) => !(d.arm === "fly" && (d.seed === 6390 || d.seed === 6400))).concat([draw("fly", 6310), draw("fly", 6320)]);
    ok("!! SEEDS: two different seeds each twice are both named, in ascending order, with the seeds they displaced missing", by(P.checksOf(dup2), "SEEDS").text === "fly has seed 6310, 6320 twice; fly is missing seed 6390, 6400", by(P.checksOf(dup2), "SEEDS").text);
    const dup3 = good.concat([draw("fly", 6310), draw("fly", 6310)]);
    ok("!! SEEDS: a seed three times is named once, and the plain14 arm is unaffected", by(P.checksOf(dup3), "SEEDS").text === "fly has seed 6310 twice" && by(P.checksOf(good.concat([draw("plain14", 6320)])), "SEEDS").text === "plain14 has seed 6320 twice");
    const missing = good.filter((d) => !(d.arm === "plain14" && (d.seed === 6310 || d.seed === 6400)));
    ok("!! SEEDS: seeds missing are listed with commas, for the arm that lacks them", by(P.checksOf(missing), "SEEDS").text === "plain14 is missing seed 6310, 6400");
    const extra = good.concat([draw("fly", 6410), draw("fly", 6300)]);
    ok("!! SEEDS: seeds that are not one of the ten are named (sorted), for the arm that has them", by(P.checksOf(extra), "SEEDS").text === "fly has seed 6300, 6410, which is not one of the ten");
    const both = good.filter((d) => d.arm !== "plain14");
    ok("!! SEEDS: an arm with nothing is missing all ten", by(P.checksOf(both), "SEEDS").text === "plain14 is missing seed 6310, 6320, 6330, 6340, 6350, 6360, 6370, 6380, 6390, 6400");
    const odd = good.concat([{ ...draw("fly", 6310), arm: "fish", name: "fish6310.json" }]);
    ok("!! SEEDS: a dump of another circuit is named with the circuit it records", by(P.checksOf(odd), "SEEDS").text === 'fish6310.json is of circuit "fish", not fly or plain14');
    for (const [k, v] of [["runs", 3], ["iters", 399], ["sigma", 0.31], ["maxK", 5], ["slice", 40]]) {
        const bad = field((i) => -0.4 + 0.001 * i, (i) => -0.41 + 0.001 * i, { plain: (i) => (i === 3 ? { recipe: { [k]: v } } : {}) }), r = by(P.checksOf(bad), "RECIPE");
        ok("!! RECIPE: " + k + " " + v + " on one dump fails, naming that dump and the base recipe", r.ok === false && r.text === "plain6340.json did not train by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)", r.text);
    }
    const two = field((i) => -0.4, (i) => -0.4, { fly: (i) => (i < 2 ? { recipe: { iters: 5 } } : {}) });
    ok("!! RECIPE: several dumps are listed with commas in the order given", by(P.checksOf(two), "RECIPE").text === "fly6310.json, fly6320.json did not train by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)");
    for (const a of P.AUDITS) {
        const bad = field((i) => -0.4, (i) => -0.4, { fly: (i) => (i === 5 ? { auto: { ...AUTO, [a]: AUTO[a] + 2e-9 } } : {}) }), r = by(P.checksOf(bad), "ONE ENVIRONMENT");
        ok("!! ONE ENVIRONMENT: a dump whose autopilot " + a + " differs by 2e-9 fails, naming it, the reference dump and the reference numbers", r.ok === false && r.text === "fly6360.json carry other autopilot numbers than fly6310.json (audit -0.4956, safety -0.5564, reserve -0.5146): the dumps were not made in one environment", r.text);
    }
    const z = (x) => ({ audit: 0, safetyAudit: 0, reserve: 0, ...x });
    const tolOk = P.checksOf([draw("fly", 6310, { auto: z({}) }), draw("fly", 6320, { auto: z({ audit: 1e-9 }) }), draw("fly", 6330, { auto: z({ safetyAudit: -1e-9 }) }), draw("fly", 6340, { auto: z({ reserve: 1e-9 }) })]).find((r) => r.name === "ONE ENVIRONMENT");
    const tolBad = P.checksOf([draw("fly", 6310, { auto: z({}) }), draw("fly", 6320, { auto: z({ audit: 1.1e-9 }) })]).find((r) => r.name === "ONE ENVIRONMENT");
    const tolBad2 = P.checksOf([draw("fly", 6310, { auto: z({}) }), draw("fly", 6320, { auto: z({ reserve: -1.1e-9 }) })]).find((r) => r.name === "ONE ENVIRONMENT");
    ok("!! ONE ENVIRONMENT: the tolerance is exactly 1e-9 in each audit and either sign: +-1e-9 passes, +-1.1e-9 fails", tolOk.ok === true && tolBad.ok === false && tolBad2.ok === false);
    const noNums = field((i) => -0.4, (i) => -0.4, { plain: (i) => (i === 0 || i === 1 ? { auto: null } : {}) }), rn = by(P.checksOf(noNums), "ONE ENVIRONMENT");
    ok("!! ONE ENVIRONMENT: dumps that carry no autopilot numbers fail, named (and the others are not compared with them)", rn.ok === false && rn.text === "plain6310.json, plain6320.json carry no autopilot numbers", rn.text);
    const allNone = P.checksOf(field((i) => -0.4, (i) => -0.4, { fly: () => ({ auto: null }), plain: () => ({ auto: null }) })).find((r) => r.name === "ONE ENVIRONMENT"), emptyEnv = P.checksOf([]).find((r) => r.name === "ONE ENVIRONMENT");
    ok("!! ONE ENVIRONMENT: with no autopilot numbers anywhere, and with no draws at all, it fails and says no dump carries them", allNone.ok === false && allNone.text === "no dump carries the autopilot's numbers" && emptyEnv.ok === false && emptyEnv.text === "no dump carries the autopilot's numbers");
    const nine = field((i) => -0.4, (i) => -0.4, { fly: (i) => (i < 2 ? { champ: false, ok: false } : {}) }), eight = field((i) => -0.4, (i) => -0.4, { fly: (i) => (i < 3 ? { champ: false, ok: false } : {}) }), seven = field((i) => -0.4, (i) => -0.4, { plain: (i) => (i < 4 ? { champ: false, ok: false } : {}) });
    ok("!! CHAMPIONS: eight draws with a champion pass the floor (fly 8), seven fail by their count (fly 7), and the arm is named", by(P.checksOf(nine), "CHAMPIONS").ok === true && by(P.checksOf(nine), "CHAMPIONS").text === "at least 8 draws of each arm have a champion (fly 8, plain14 10)" && by(P.checksOf(eight), "CHAMPIONS").ok === false && by(P.checksOf(eight), "CHAMPIONS").text === "fly has 7 draws with a champion (need 8)" && by(P.checksOf(seven), "CHAMPIONS").text === "plain14 has 6 draws with a champion (need 8)");
    const bothFew = field((i) => -0.4, (i) => -0.4, { fly: () => ({ champ: false }), plain: () => ({ champ: false }) });
    ok("!! CHAMPIONS: both arms short are both named, joined by '; '", by(P.checksOf(bothFew), "CHAMPIONS").text === "fly has 0 draws with a champion (need 8); plain14 has 0 draws with a champion (need 8)");
}

sec("5. THE REPORT");
{
    const fmt = (rows) => rows.join("\n");
    const beats = P.report(field((i) => -0.30 + 0.001 * i, (i) => -0.40 + 0.001 * i));
    ok("!! a set where every fly champion is above every plain champion: the report, line by line", beats.length === 32 && beats[0] === "ROUND 7 STAGE 1: 10 fly draws against 10 plain 14-50-4 draws (brain/PLAIN14_DISTRIBUTION_WIP.md); each draw is a 4-search training, the champion read once on the audit (36 dives), the safety audit (500) and the reserve (18)" && beats[1] === "  PASS SEEDS: ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" && beats[4] === "  PASS CHAMPIONS: at least 8 draws of each arm have a champion (fly 10, plain14 10)" && beats[5] === "fly (Giant Fiber Circuit, 963 weights): audit / safety audit / reserve of each draw's champion" && beats[6] === "  seed 6310: -0.2000  -0.3000  -0.3500  QUALIFIES" && beats[16] === "plain14 (14-50-4, 954 weights): audit / safety audit / reserve of each draw's champion" && beats[17] === "  seed 6310: -0.3000  -0.4000  -0.4500  QUALIFIES", beats.slice(0, 6).join("\n"));
    ok("!! ... and its reading lines: each audit with its means, ranges, difference and exact p, READ ON the safety audit, the QUALIFY count, the bottom line", beats[27] === "audit: fly mean -0.1955 (range -0.2000 to -0.1910), plain14 mean -0.2955 (range -0.3000 to -0.2910), difference +0.1000; exact one-sided p fly higher 5.4e-6, fly lower 1.0000: BEATS" && beats[28] === "READ ON safetyAudit: fly mean -0.2955 (range -0.3000 to -0.2910), plain14 mean -0.3955 (range -0.4000 to -0.3910), difference +0.1000; exact one-sided p fly higher 5.4e-6, fly lower 1.0000: BEATS" && beats[29] === "reserve: fly mean -0.3455 (range -0.3500 to -0.3410), plain14 mean -0.4455 (range -0.4500 to -0.4410), difference +0.1000; exact one-sided p fly higher 5.4e-6, fly lower 1.0000: BEATS" && beats[30] === "draws that QUALIFY (the trainer's own test): fly 10 of 10, plain14 10 of 10" && beats[31] === "BOTTOM LINE: THE FLY'S WIRING BEATS ITS PLAIN CONTROLS (safety audit: fly mean -0.2955 of 10, plain14 mean -0.3955 of 10, difference +0.1000; exact one-sided p that the fly is higher 5.4e-6, lower 1.0000)", beats.slice(26).join("\n"));
    ok("!! ... and it ends there (no line after the bottom line), with no CHECK FAILED line at the head", beats[beats.length - 1] === beats[31] && !beats.some((l) => /CHECK FAILED|NOT WEIGHED/.test(l)));
    const below = P.report(field((i) => -0.40 + 0.001 * i, (i) => -0.30 + 0.001 * i)), bl = below[below.length - 1];
    ok("!! every fly champion below every plain champion: THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS, the difference negative with its sign, the p lower tiny", bl === "BOTTOM LINE: THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS (safety audit: fly mean -0.3955 of 10, plain14 mean -0.2955 of 10, difference -0.1000; exact one-sided p that the fly is higher 1.0000, lower 5.4e-6)", bl);
    const mixFly = (i) => -0.40 + 0.001 * (i % 2 ? i : -i), mixPlain = (i) => -0.40 + 0.001 * (i % 2 ? -i : i), mix = P.report(field(mixFly, mixPlain)), ml = mix[mix.length - 1];
    const fl = P.SEEDS.map((_, i) => mixFly(i)), pl = P.SEEDS.map((_, i) => mixPlain(i)), g = gaussian(10, 10), gt = g.reduce((s, x) => s + x, 0), tailFrom = (u) => g.slice(u).reduce((s, x) => s + x, 0) / gt;
    const wantHigher = tailFrom(P.above(fl, pl)).toFixed(4), wantLower = tailFrom(P.above(pl, fl)).toFixed(4), mf = (fl.reduce((s, x) => s + x, 0) / 10), mp = (pl.reduce((s, x) => s + x, 0) / 10);
    ok("!! interleaved champions: THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS, with the difference and both p-values (the p-values from the independent Gaussian-binomial construction)", ml === `BOTTOM LINE: THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS (safety audit: fly mean ${mf.toFixed(4)} of 10, plain14 mean ${mp.toFixed(4)} of 10, difference +${(mf - mp).toFixed(4)}; exact one-sided p that the fly is higher ${wantHigher}, lower ${wantLower})` && Number(wantHigher) > 0.05 && Number(wantLower) > 0.05, ml);
    const ties = P.report(field(() => -0.4, () => -0.4)), tl = ties[ties.length - 1];
    ok("!! identical scores everywhere: TIES (p = 1 both ways), difference +0.0000 (no minus zero)", /^BOTTOM LINE: THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS \(safety audit: fly mean -0\.4000 of 10, plain14 mean -0\.4000 of 10, difference \+0\.0000; exact one-sided p that the fly is higher 1\.0000, lower 1\.0000\)$/.test(tl), tl);
    const bad = P.report(field((i) => -0.30, (i) => -0.40, { plain: (i) => (i === 0 ? { recipe: { iters: 5 } } : {}) }));
    ok("!! a failed check: the FIRST line says which check failed and that the reading is not weighed, the check rows show FAIL beside the PASS ones, the draws are listed, there is NO reading line and the bottom line says NOT WEIGHED", bad[0] === "CHECK FAILED -- RECIPE: THE CHECKS FAILED, THE READING IS NOT WEIGHED" && bad[2] === "  PASS SEEDS: ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" && bad[3] === "  FAIL RECIPE: plain6310.json did not train by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)" && bad[bad.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !bad.some((l) => /^READ ON|BEATS|IS BELOW|CANNOT BE TOLD|QUALIFY \(/.test(l)) && bad.length === 29, bad.slice(0, 5).join(" || "));
    const two = P.report(field(() => -0.4, () => -0.4, { fly: () => ({ recipe: { runs: 1 } }), plain: (i) => (i === 0 ? { auto: null } : {}) }));
    ok("!! two checks failed: both named in the first line, joined by ', ', in the order of the checks", two[0] === "CHECK FAILED -- RECIPE, ONE ENVIRONMENT: THE CHECKS FAILED, THE READING IS NOT WEIGHED", two[0]);
    const lost = P.report(field((i) => -0.30 + 0.001 * i, (i) => -0.40 + 0.001 * i, { fly: (i) => (i < 2 ? { champ: false, ok: false } : {}) }));
    ok("!! a draw with no champion is listed 'left out' and is not read: 8 fly champions against 10, the QUALIFY count over the champions only, and the bottom line counts 8 and 10", lost.includes("  seed 6310: no champion (no search was eligible): left out") && lost.includes("draws that QUALIFY (the trainer's own test): fly 8 of 8, plain14 10 of 10") && /fly mean -0\.2945 of 8, plain14 mean -0\.3955 of 10/.test(lost[lost.length - 1]) && lost.some((l) => /^ROUND 7 STAGE 1: 10 fly draws against 10 plain/.test(l)), lost[lost.length - 1]);
    const odd2 = P.report(field((i) => -0.30 + 0.001 * i, (i) => -0.40 + 0.001 * i, { fly: (i) => (i < 2 ? { champ: false, ok: true } : {}) }));
    ok("!! the QUALIFY count is over the champions: a draw with no champion is not counted even if its verdict says ok (fly 8 of 8)", odd2.includes("draws that QUALIFY (the trainer's own test): fly 8 of 8, plain14 10 of 10"));
    const dq = P.report(field((i) => -0.30 + 0.001 * i, (i) => -0.40 + 0.001 * i, { fly: (i) => (i < 3 ? { ok: false } : {}) }));
    ok("!! a draw whose verdict is not ok is read all the same and printed 'does not qualify'; the QUALIFY count is the champions that qualify", dq.includes("  seed 6310: -0.2000  -0.3000  -0.3500  does not qualify") && dq.includes("draws that QUALIFY (the trainer's own test): fly 7 of 10, plain14 10 of 10"));
    const nine = P.report(field((i) => -0.3, (i) => -0.4).filter((d) => !(d.arm === "plain14" && d.seed === 6400))), eleven = P.report(field((i) => -0.3, (i) => -0.4).filter((d) => !(d.arm === "fly" && (d.seed === 6400 || d.seed === 6390))));
    ok("!! the header counts each arm by its own circuit: 10 fly against 9 plain14 (and 8 against 10 the other way), not swapped", nine[1] === "ROUND 7 STAGE 1: 10 fly draws against 9 plain 14-50-4 draws (brain/PLAIN14_DISTRIBUTION_WIP.md); each draw is a 4-search training, the champion read once on the audit (36 dives), the safety audit (500) and the reserve (18)" && eleven[1].startsWith("ROUND 7 STAGE 1: 8 fly draws against 10 plain 14-50-4 draws"), nine[1].slice(0, 70));
    const lines = P.report(field((i) => -0.3, (i) => -0.4));
    ok("!! the seeds of each arm are listed in ascending order whatever the order the draws came in", P.report(field((i) => -0.3, (i) => -0.4).reverse()).filter((l) => /^  seed /.test(l)).join() === lines.filter((l) => /^  seed /.test(l)).join() && lines.filter((l) => /^  seed /.test(l)).length === 20);
    const fb = P.bottomLine({ reading: "BEATS", meanFly: 1, meanPlain: 0.5, nFly: 8, nPlain: 9, diff: 0.5, pHigher: 0.0005, pLower: 0.9 });
    ok("!! bottomLine: a p under 0.001 prints in exponent form and the others to four decimals; the counts are the sizes of the two groups", fb === "THE FLY'S WIRING BEATS ITS PLAIN CONTROLS (safety audit: fly mean 1.0000 of 8, plain14 mean 0.5000 of 9, difference +0.5000; exact one-sided p that the fly is higher 5.0e-4, lower 0.9000)" && /higher 0\.0010, /.test(P.bottomLine({ reading: "TIES", meanFly: 1, meanPlain: 1, nFly: 8, nPlain: 9, diff: 0, pHigher: 0.001, pLower: 1 })), fb);
}

sec("6. THE COMMAND");
{
    const mem = (files = {}, dirs = { d: Object.keys(files).map((f) => f.split("/").pop()) }) => { const o = { out: [], err: [], reads: [], lists: [] }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), listDir: (d) => { o.lists.push(d); if (!(d in dirs)) throw new Error("ENOENT " + d); return dirs[d]; }, readFile: (f) => { o.reads.push(f); if (!(f in files)) throw new Error("ENOENT " + f); return files[f]; } } }); };
    const run = async (argv, m) => { const c = await P.command(argv, m.io); return c; };
    const setOf = (flyS, plainS, over) => Object.fromEntries(P.SEEDS.flatMap((s, i) => [["d/fly" + s + ".json", J(mkDump("fly", s, { scores: { audit: flyS, safetyAudit: flyS, reserve: flyS }, ...(over ? over("fly", s, i) : {}) }))], ["d/plain" + s + ".json", J(mkDump("plain14", s, { scores: { audit: plainS, safetyAudit: plainS, reserve: plainS }, ...(over ? over("plain14", s, i) : {}) }))]]));
    let m = mem(); let c = await run(["go"], m);
    ok("!! the first word must be report: anything else (and nothing at all) is exit 2 on the error stream with its words, nothing on the output", c === 2 && m.err[0] === 'plain14Distribution: the first word must be report, got "go"' && m.out.length === 0);
    m = mem(); c = await run([], m);
    ok("!! no arguments: exit 2, 'got undefined'", c === 2 && m.err[0] === "plain14Distribution: the first word must be report, got undefined");
    m = mem(); c = await run(["report"], m);
    ok("!! report with no --dir: exit 2, 'report needs --dir <directory>'", c === 2 && m.err[0] === "plain14Distribution: report needs --dir <directory>" && m.err.length === 1);
    const refuse = async (argv) => { const mm = mem(); const cc = await run(argv, mm); return [cc, mm.err[0]]; };
    const r1 = await refuse(["report", "--dir"]), r2 = await refuse(["report", "--dir", "--x"]), r3 = await refuse(["report", "--dir", ""]), r4 = await refuse(["report", "--in", "d"]), r5 = await refuse(["report", "--dir", "d", "extra"]), r6 = await refuse(["report", "d"]);
    ok("!! --dir needs a value (none, an option, an empty string), another option or a stray word is refused: exit 2, 'report takes exactly --dir <directory> (got ...)'", r1[0] === 2 && r1[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "--dir")' && r2[0] === 2 && r2[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "--dir --x")' && r3[0] === 2 && r3[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "--dir ")' && r4[0] === 2 && r4[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "--in d")' && r5[0] === 2 && r5[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "--dir d extra")' && r6[0] === 2 && r6[1] === 'plain14Distribution: report takes exactly --dir <directory> (got "d")');
    m = mem({}, {}); c = await run(["report", "--dir", "nowhere"], m);
    ok("!! a directory that cannot be read: exit 1 with the directory and the system's words", c === 1 && m.err[0] === "plain14Distribution: cannot read the directory nowhere: ENOENT nowhere");
    m = mem({}, { d: ["flylog6310.txt", "notes.md"] }); c = await run(["report", "--dir", "d"], m);
    ok("!! a directory holding no fly<S>.json or plain<S>.json: exit 1 'holds no ... dump'", c === 1 && m.err[0] === "plain14Distribution: d holds no fly<S>.json or plain<S>.json dump");
    const files = setOf(-0.3, -0.4);
    m = mem(files); c = await run(["report", "--dir", "d"], m);
    ok("!! twenty good dumps: exit 0, the report on the output stream line by line, nothing on the error stream, the files read as d/<name> in name order (the six-digit order: fly... then plain...)", c === 0 && m.err.length === 0 && m.out.length === 32 && m.out[m.out.length - 1].startsWith("BOTTOM LINE: THE FLY'S WIRING BEATS ITS PLAIN CONTROLS") && m.reads.length === 20 && m.reads[0] === "d/fly6310.json" && m.reads[10] === "d/plain6310.json" && m.lists.join() === "d");
    m = mem({ ...files, "d/flylog6310.txt": "log", "d/fly6310.json.bak": "{", "d/Fly6310.json": "{", "d/plainlog6310.txt": "x", "d/fly.json": "{", "d/fly6310a.json": "{", "d/xfly6310.json": "{" }, { d: [...Object.keys(files).map((f) => f.slice(2)), "flylog6310.txt", "fly6310.json.bak", "Fly6310.json", "plainlog6310.txt", "fly.json", "fly6310a.json", "xfly6310.json", "notes.md"] }); c = await run(["report", "--dir", "d"], m);
    ok("!! only fly<digits>.json and plain<digits>.json are read: logs, backups, other cases, no digits, a letter after the digits and a prefix are all left alone", c === 0 && m.reads.length === 20 && m.reads.every((f) => /^d\/(fly|plain)\d+\.json$/.test(f)));
    m = mem(files, { "d": Object.keys(files).map((f) => f.slice(2)) }); const dirSlash = await P.command(["report", "--dir", "d/"], { ...m.io, listDir: (d) => { m.lists.push(d); return Object.keys(files).map((f) => f.slice(2)); } });
    ok("!! a trailing slash on the directory is dropped when the files are named (d/ gives d/fly6310.json, not d//fly6310.json)", dirSlash === 0 && m.reads[0] === "d/fly6310.json");
    m = mem(files, { d: Object.keys(files).map((f) => f.slice(2)) }); const dirBack = await P.command(["report", "--dir", "d\\\\"], { ...m.io, listDir: () => Object.keys(files).map((f) => f.slice(2)) });
    ok("!! trailing backslashes (a Windows path) are dropped too, and the next join is a slash", dirBack === 0 && m.reads[0] === "d/fly6310.json" && m.reads[19] === "d/plain6400.json", m.reads[0] || m.err[0]);
    const bj = { ...files, "d/plain6330.json": "{oops" }; m = mem(bj); c = await run(["report", "--dir", "d"], m);
    ok("!! a file that is not JSON: exit 1 with the file's name, nothing on the output (the report is not partial)", c === 1 && m.err[0] === "plain14Distribution: plain14Distribution.parseDump: plain6330.json is not JSON" && m.out.length === 0);
    const nd = { ...files, "d/fly6340.json": J({ hello: 1 }) }; m = mem(nd); c = await run(["report", "--dir", "d"], m);
    ok("!! a file that is not a dump: exit 1 with the file's name", c === 1 && /plain14Distribution: plain14Distribution\.parseDump: fly6340\.json is not a dump of tools\/ship\/trainSubPilot\.mjs/.test(m.err[0]) && m.out.length === 0);
    const wrongSeed = { ...files, "d/fly6310.json": J(mkDump("fly", 6320)) }; m = mem(wrongSeed); c = await run(["report", "--dir", "d"], m);
    ok("!! a file whose name does not say what the dump records (fly6310.json holding seed 6320): exit 1, 'records circuit \"fly\" and seed 6320, which its name does not say'", c === 1 && m.err[0] === 'plain14Distribution: fly6310.json records circuit "fly" and seed 6320, which its name does not say' && m.out.length === 0);
    const wrongArm = { ...files, "d/plain6310.json": J(mkDump("fly", 6310)) }; m = mem(wrongArm); c = await run(["report", "--dir", "d"], m);
    ok("!! a plain<S>.json holding a fly dump is refused on the circuit", c === 1 && m.err[0] === 'plain14Distribution: plain6310.json records circuit "fly" and seed 6310, which its name does not say');
    const mirror = mem({ ...files, "d/fly6310.json": J(mkDump("plain14", 6310)) }); const cm = await run(["report", "--dir", "d"], mirror);
    ok("!! ... the mirror: fly6310.json holding a plain14 dump is refused on the circuit", cm === 1 && mirror.err[0] === 'plain14Distribution: fly6310.json records circuit "plain14" and seed 6310, which its name does not say');
    const short = Object.fromEntries(Object.entries(files).filter(([f]) => !/plain6400/.test(f))); m = mem(short); c = await run(["report", "--dir", "d"], m);
    ok("!! nineteen dumps: the command still runs (exit 0, the report is the judge) and the first line says CHECK FAILED -- SEEDS, the bottom line NOT WEIGHED", c === 0 && m.out[0] === "CHECK FAILED -- SEEDS: THE CHECKS FAILED, THE READING IS NOT WEIGHED" && m.out[m.out.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");

    // the real file system and the default streams
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p14-")); try {
        for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(tmp, f.slice(2)), t);
        fs.writeFileSync(path.join(tmp, "flylog6310.txt"), "log");
        const lines = [], errs = [], ol = console.log, oe = console.error; let cd;
        console.log = (x) => lines.push(x); console.error = (x) => errs.push(x);
        try { cd = await P.command(["report", "--dir", tmp]); } finally { console.log = ol; console.error = oe; }
        ok("!! with no seams the command reads the real directory (an absolute path) and prints on console.log: exit 0, 32 lines, the bottom line BEATS", cd === 0 && errs.length === 0 && lines.length === 32 && lines[31].startsWith("BOTTOM LINE: THE FLY'S WIRING BEATS"));
        const errs2 = []; console.error = (x) => errs2.push(x); let ce; try { ce = await P.command(["report", "--dir", path.join(tmp, "nope")]); } finally { console.error = oe; }
        ok("!! with no seams a missing directory goes to console.error: exit 1", ce === 1 && errs2.length === 1 && /cannot read the directory .*nope: ENOENT/.test(errs2[0]));
        const rel = path.relative(ENG, tmp), lines2 = [], o2 = console.log; console.log = (x) => lines2.push(x); let cr; try { cr = await P.command(["report", "--dir", rel]); } finally { console.log = o2; }
        ok("!! a relative directory is read from the engine folder (WebGLEngine), not from where the command was started: the same 32 lines", cr === 0 && lines2.length === 32);
        const child = spawnSync(process.execPath, [path.join(HERE, "plain14DistributionCmd.mjs"), "report", "--dir", tmp], { cwd: os.tmpdir(), encoding: "utf8" });
        ok("!! the command line (a child process started in another folder): exit 0, the report on stdout, nothing on stderr", child.status === 0 && child.stderr === "" && child.stdout.split("\n").filter(Boolean).length === 32 && /BOTTOM LINE: THE FLY'S WIRING BEATS ITS PLAIN CONTROLS/.test(child.stdout));
        const bad = spawnSync(process.execPath, [path.join(HERE, "plain14DistributionCmd.mjs"), "nope"], { cwd: os.tmpdir(), encoding: "utf8" });
        ok("!! the command line with a bad word: exit code 2, the refusal on stderr, nothing on stdout", bad.status === 2 && bad.stdout === "" && /the first word must be report, got "nope"/.test(bad.stderr));
        const none = spawnSync(process.execPath, [path.join(HERE, "plain14DistributionCmd.mjs"), "report", "--dir", path.join(tmp, "nope")], { cwd: os.tmpdir(), encoding: "utf8" });
        ok("!! the command line with a missing directory: exit code 1", none.status === 1 && /cannot read the directory/.test(none.stderr));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
